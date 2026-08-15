import {
  Request,
  RequestResponse,
  RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";
import { onRpcActivity } from "./activity";

// How long to wait for a single RPC response before giving up on it. Heavy HID
// traffic (e.g. trackball scrolling or typing during the initial keymap load)
// can delay or drop a response on the BLE link; without a bound, the serialized
// queue would wait forever and wedge the whole session.
//
// The bound is an IDLE timeout, not a deadline. The old 4 s deadline was tuned
// on the desktop's native BLE stack; in a browser it is simply wrong. ZMK serves
// the RPC characteristic over INDICATE (zmk/app/src/studio/gatt_rpc_transport.c)
// and every indication needs a confirmation round trip, so a reply arrives at
// roughly 20 bytes per connection interval: getDeviceInfo lands instantly while
// getKeymap and listAllBehaviors are kilobytes and can legitimately take tens of
// seconds. A deadline that fits the small calls kills the big ones — small calls
// fine, big ones timing out, which is exactly what the browser build reported.
//
// What actually separates "slow" from "wedged" is whether bytes are still
// arriving, so that is what is measured. Timing out only on silence keeps the
// wedge protection without punishing large responses.

/** No inbound RPC bytes at all for this long => the exchange is dead. */
const RPC_IDLE_TIMEOUT_MS = 15000;
/** Absolute cap on one response, however chatty the link is. */
const RPC_MAX_CALL_MS = 120000;

// Per-connection RPC state. We keep a single long-lived reader and at most one
// outstanding read() so a timed-out call doesn't leave a second read() pending
// (which would consume responses out from under the next call and desync the
// stream). All calls are serialized through `rpcChain`.
interface ConnRpcState {
  reader: ReadableStreamDefaultReader<RequestResponse>;
  pending: Promise<ReadableStreamReadResult<RequestResponse>> | null;
}
const connState = new WeakMap<RpcConnection, ConnRpcState>();

function stateFor(conn: RpcConnection): ConnRpcState {
  let s = connState.get(conn);
  if (!s) {
    s = { reader: conn.request_response_readable.getReader(), pending: null };
    connState.set(conn, s);
  }
  return s;
}

/**
 * Reject when `p` neither settles nor sees any RPC traffic for `idleMs`, or when
 * it exceeds `maxMs` outright. Every inbound chunk re-arms the idle timer.
 */
function withIdleTimeout<T>(
  p: Promise<T>,
  idleMs: number,
  maxMs: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let idleTimer: ReturnType<typeof setTimeout>;
    let quiet = 0;
    // What arrived while this call was outstanding. On a timeout these separate
    // the two very different failures that otherwise look identical: nothing at
    // all means the request never reached the keyboard, whereas some-then-quiet
    // means the reply started and stalled.
    let chunks = 0;
    let bytes = 0;
    let lastAt = Date.now();

    const fail = (msg: string) => {
      cleanup();
      reject(new Error(msg));
    };
    const arm = () => {
      quiet = Date.now();
      idleTimer = setTimeout(
        () =>
          fail(
            `${label}: 応答が ${idleMs}ms 途絶えました` +
              `（この呼び出し中の受信: ${chunks} チャンク / ${bytes} バイト` +
              (chunks
                ? `、最後の受信は ${Date.now() - lastAt}ms 前`
                : "、まったく届いていません") +
              "）"
          ),
        idleMs
      );
    };
    const rearm = (n: number) => {
      chunks++;
      bytes += n;
      lastAt = Date.now();
      // Cheap guard against re-arming on every single 20-byte chunk.
      if (Date.now() - quiet < idleMs / 4) return;
      clearTimeout(idleTimer);
      arm();
    };

    const unlisten = onRpcActivity(rearm);
    const hardTimer = setTimeout(
      () => fail(`${label}: ${maxMs}ms を超えても完了しませんでした`),
      maxMs
    );

    function cleanup() {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      unlisten();
    }

    arm();
    p.then(
      (v) => {
        cleanup();
        resolve(v);
      },
      (e) => {
        cleanup();
        reject(e);
      }
    );
  });
}

// Read the next response, reusing an already-issued (possibly timed-out) read so
// there is never more than one read() in flight on the shared stream.
async function readNext(
  s: ConnRpcState,
  label: string
): Promise<ReadableStreamReadResult<RequestResponse>> {
  if (!s.pending) {
    s.pending = s.reader.read();
  }
  const result = await withIdleTimeout(
    s.pending,
    RPC_IDLE_TIMEOUT_MS,
    RPC_MAX_CALL_MS,
    label
  );
  // Only clear once consumed; on timeout we throw above and keep `pending` so
  // the next call awaits the same read instead of issuing a second one.
  s.pending = null;
  return result;
}

/**
 * Name a request the way its timeout should report it: "keymap.getKeymap"
 * rather than "RPC read". Which call stalled is the first thing anyone asks.
 */
function describeRequest(req: object): string {
  const [subsystem, body] = Object.entries(req).find(
    ([k]) => k !== "requestId"
  ) ?? ["rpc", null];
  const op =
    body && typeof body === "object" ? Object.keys(body)[0] : undefined;
  return op ? `${subsystem}.${op}` : subsystem;
}

let rpcChain: Promise<unknown> = Promise.resolve();

/* --- "is the RPC link busy?" ------------------------------------------------
 *
 * Other GATT work has to keep out of the way of an RPC exchange. The browser
 * serialises every GATT operation on a device, so a service lookup fired while
 * the keymap is loading does not run alongside it — it takes its turn in the
 * same queue, and the request waiting behind it reaches the keyboard late or
 * not at all. That is felt as an RPC read that goes completely silent.
 *
 * Callers that can wait (the capability descriptor, say) wait here instead.
 */

let inFlight = 0;
let lastSettledAt = 0;

/** True while at least one RPC call is outstanding. */
export function rpcBusy(): boolean {
  return inFlight > 0;
}

/**
 * Resolve once no RPC call has been outstanding for `quietMs`.
 *
 * Gives up after `maxWaitMs` and resolves anyway: a caller that waits forever
 * for a link that never goes quiet is worse than one that takes its chances.
 */
export async function waitForRpcIdle(
  quietMs = 1500,
  maxWaitMs = 60000
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const quietFor = inFlight > 0 ? 0 : Date.now() - lastSettledAt;
    if (quietFor >= quietMs) return;
    if (Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, Math.min(250, quietMs)));
  }
}

async function do_call(
  conn: RpcConnection,
  req: Omit<Request, "requestId">
): Promise<RequestResponse> {
  const request = { ...req, requestId: conn.current_request++ } as Request;

  const writer = conn.request_writable.getWriter();
  try {
    // Resolves as soon as the request is queued for the transport, so it won't
    // hang here; the response wait below is where a timeout matters.
    await writer.write(request);
  } finally {
    writer.releaseLock();
  }

  const s = stateFor(conn);

  // Read until the response id matches our request, discarding any stale/late
  // responses left over from a previous timed-out call.
  for (;;) {
    const { done, value } = await readNext(s, describeRequest(request));
    if (done || !value) {
      throw new Error("No RPC response received (connection closed?)");
    }
    if (value.requestId === request.requestId) {
      if (value.meta?.noResponse) {
        throw new Error("RPC reported no response");
      }
      if (value.meta?.simpleError) {
        throw new Error("RPC meta error: " + value.meta.simpleError);
      }
      return value;
    }
    if (value.requestId < request.requestId) {
      console.warn(
        `[rpc] discarding stale response id ${value.requestId} (waiting for ${request.requestId})`
      );
      continue;
    }
    // A higher id than ours should be impossible with serialized calls.
    throw new Error(
      `Unexpected RPC response id ${value.requestId} (expected ${request.requestId})`
    );
  }
}

export async function call_rpc(
  conn: RpcConnection,
  req: Omit<Request, "requestId">
): Promise<RequestResponse> {
  console.log("RPC Request", req);

  // Queue behind the previous call regardless of how it settled, so a failed
  // call doesn't stall or desync the queue.
  inFlight++;
  const result = rpcChain.then(
    () => do_call(conn, req),
    () => do_call(conn, req)
  );
  rpcChain = result.catch(() => {});
  result
    .catch(() => {})
    .finally(() => {
      inFlight--;
      lastSettledAt = Date.now();
    });

  return result
    .then((r) => {
      console.log("RPC Response", r);
      return r;
    })
    .catch((e) => {
      console.error("RPC Error", e);
      // Preserve the existing contract: callers read optional fields off the
      // return value, so an error object simply surfaces as "no data".
      return e;
    });
}
