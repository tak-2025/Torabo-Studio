import {
  Request,
  RequestResponse,
  RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";

// How long to wait for a single RPC response before giving up on it. Heavy HID
// traffic (e.g. trackball scrolling or typing during the initial keymap load)
// can delay or drop a response on the BLE link; without a bound, the serialized
// queue would wait forever and wedge the whole session.
const RPC_TIMEOUT_MS = 4000;

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

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// Read the next response, reusing an already-issued (possibly timed-out) read so
// there is never more than one read() in flight on the shared stream.
async function readNext(
  s: ConnRpcState
): Promise<ReadableStreamReadResult<RequestResponse>> {
  if (!s.pending) {
    s.pending = s.reader.read();
  }
  const result = await withTimeout(s.pending, RPC_TIMEOUT_MS, "RPC read");
  // Only clear once consumed; on timeout we throw above and keep `pending` so
  // the next call awaits the same read instead of issuing a second one.
  s.pending = null;
  return result;
}

let rpcChain: Promise<unknown> = Promise.resolve();

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
    const { done, value } = await readNext(s);
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
  const result = rpcChain.then(
    () => do_call(conn, req),
    () => do_call(conn, req)
  );
  rpcChain = result.catch(() => {});

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
