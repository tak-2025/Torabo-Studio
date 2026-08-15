import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";

import { registerBackend, unregisterBackend } from "../index";
import { bumpRpcActivity } from "../../rpc/activity";
import type { ToraboBackend } from "../types";
import { makeConfigBackend } from "./config";
import { webFiles } from "./files";
import { ALL_SERVICES, RPC_CHAR, RPC_SERVICE } from "./uuids";

/**
 * Web Bluetooth transport.
 *
 * The ts-client ships its own GATT transport, but it opens the device, hands
 * back a stream and drops the reference — leaving no way to reach the torabo
 * config services on the same connection. This one keeps the GATT server and
 * publishes a backend built on it, so keymap editing and the custom panels ride
 * the single link the user authorised.
 *
 * Bytes per write. 20 is the payload guaranteed at the minimum ATT MTU (23);
 * larger frames are split. Chrome usually negotiates far more, but a write over
 * the actual MTU is rejected rather than fragmented, and this costs nothing.
 */
const RPC_CHUNK = 20;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Which GATT operations a characteristic declares — the thing to check before
 * choosing a write, and the first thing worth seeing when one fails. */
function propNames(c: BluetoothRemoteGATTCharacteristic): string {
  const p = c.properties;
  if (!p) return "properties 不明";
  const on = (
    [
      "read",
      "write",
      "writeWithoutResponse",
      "notify",
      "indicate",
    ] as const
  ).filter((k) => p[k]);
  return on.join("|") || "なし";
}

/**
 * Log what the browser can actually see on this connection.
 *
 * A discovery failure otherwise reports only what was missing, never what was
 * there, and the two interesting answers — the service is absent, versus the
 * service is present but empty — need the second half to tell apart. Only
 * services this origin was granted appear here, which is every service the app
 * asks for, so an empty list is itself the answer.
 *
 * Never throws: this runs on the error path and must not replace the real
 * failure with one of its own.
 */
async function dumpGatt(server: BluetoothRemoteGATTServer): Promise<void> {
  try {
    const services = await server.getPrimaryServices();
    if (services.length === 0) {
      console.warn("[webble] GATT: 許可されたサービスが1つも見つかりません");
      return;
    }
    const lines = await Promise.all(
      services.map(async (s) => {
        const chars = await s
          .getCharacteristics()
          .catch((e) => `<列挙に失敗: ${errText(e)}>`);
        const detail = Array.isArray(chars)
          ? chars.map((c) => `${c.uuid} [${propNames(c)}]`).join("\n    ") ||
            "(characteristic なし)"
          : chars;
        return `  ${s.uuid}\n    ${detail}`;
      }),
    );
    console.warn(`[webble] GATT の実際の中身:\n${lines.join("\n")}`);
  } catch (e) {
    console.warn("[webble] GATT の列挙に失敗:", e);
  }
}

export interface ConnectOptions {
  /**
   * List every device instead of just keyboards, for one the filter misses.
   * Implies opening the chooser.
   */
  allDevices?: boolean;
}

/**
 * What the chooser lists.
 *
 * Filters match live advertisement data only, which is why they were no use
 * while the keyboard sat connected to the PC: a connected ZMK keyboard
 * advertises nothing, so nothing matched it. The documented procedure makes it
 * discoverable on purpose (switch profiles), and at that moment its
 * advertisement does carry these — so the filter earns its keep instead of
 * showing every radio in the building.
 *
 * Matching what ZMK actually broadcasts (app/src/ble.c):
 *  - battery service, in every ZMK advertisement. HID (0x1812) would be the
 *    tighter match but Web Bluetooth blocklists it, so it cannot be filtered on.
 *  - the name, which ZMK forces into the advertisement. Covers "torabo-tsuki"
 *    and the split's "L-torabo-tsuki".
 *  - the Studio service, in case a future firmware advertises it. Today's
 *    does not, which is why filtering on it alone — as upstream does — finds
 *    nothing here.
 *
 * Filters are OR'd. `allDevices` remains for anything this misses.
 */
const BATTERY_SERVICE = 0x180f;

const KEYBOARD_FILTERS: BluetoothLEScanFilter[] = [
  { services: [BATTERY_SERVICE] },
  { namePrefix: "torabo" },
  { services: [RPC_SERVICE] },
];

/**
 * How long to wait on the remembered keyboard before giving up on it.
 *
 * Kept short because opening the chooser needs the click's user activation,
 * which expires a few seconds after the click. But short means it fires often —
 * a first connection with bonding and discovery routinely takes longer than
 * this — so what happens on expiry has to be safe. See `connectWithin`.
 */
const REMEMBERED_CONNECT_TIMEOUT_MS = 3000;

/**
 * Remembered devices whose reconnect already failed this session.
 *
 * Without this the same unreachable keyboard is retried on every click, and the
 * chooser — the thing that would actually fix it — is never reached.
 */
const rememberedFailed = new Set<string>();

/**
 * Devices this origin has already been granted, newest grant last.
 *
 * This is what makes a second connection painless: the chooser never opens
 * again. It is also the only way to reach a keyboard that is already connected
 * to the OS: connected means not advertising, and the chooser only lists what
 * advertises. Permission is per-origin, so a keyboard granted on localhost
 * still needs granting once on the published site.
 */
async function rememberedDevices(): Promise<BluetoothDevice[]> {
  if (!navigator.bluetooth.getDevices) return [];
  try {
    return await navigator.bluetooth.getDevices();
  } catch (e) {
    console.warn("getDevices unavailable:", e);
    return [];
  }
}

/** Ask the user to pick a device. */
async function requestDevice(allDevices: boolean): Promise<BluetoothDevice> {
  return navigator.bluetooth
    .requestDevice(
      allDevices
        ? { acceptAllDevices: true, optionalServices: ALL_SERVICES }
        : { filters: KEYBOARD_FILTERS, optionalServices: ALL_SERVICES },
    )
    .catch((e) => {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        throw new UserCancelledError("User cancelled the connection attempt", {
          cause: e,
        });
      }
      throw e;
    });
}

/**
 * Connect, but stop waiting after `ms` — and make sure the attempt we stopped
 * waiting for cannot outlive us.
 *
 * `Promise.race` only abandons the loser; `gatt.connect()` keeps negotiating in
 * the background and eventually succeeds. Left alone it produces a second,
 * unowned link to the same device, and a subsequent attach then runs its
 * discovery against a connection someone else is still setting up — which is
 * how "the service is there but it has no characteristics" happens on hardware
 * that plainly has both. So the abandoned attempt is disconnected the moment it
 * settles, and no caller may start another attach on this device before then.
 */
function connectWithin(
  gatt: BluetoothRemoteGATTServer,
  ms: number,
): Promise<BluetoothRemoteGATTServer> {
  let abandoned = false;
  const pending = gatt.connect();

  pending.then(
    () => {
      if (abandoned) gatt.disconnect();
    },
    () => {
      // Failed on its own; nothing to clean up.
    },
  );

  return Promise.race([
    pending,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        abandoned = true;
        reject(new Error(`接続がタイムアウトしました（${ms}ms）`));
      }, ms),
    ),
  ]);
}

/**
 * Pick the write the characteristic actually supports.
 *
 * ZMK declares the RPC characteristic WRITE | READ | INDICATE
 * (zmk/app/src/studio/gatt_rpc_transport.c) — it has no WRITE_WITHOUT_RESPONSE
 * property, so writeValueWithoutResponse() is not a legal operation on it. The
 * old code chose that branch by testing whether the *method* existed, which it
 * always does: it lives on BluetoothRemoteGATTCharacteristic.prototype no
 * matter what the peripheral declared. So every request went out the wrong way.
 * The desktop transport has always written with response (bluest's
 * `Characteristic::write`), which is why only the browser was affected.
 *
 * Writing with response also paces the transfer. Each 20-byte chunk is
 * acknowledged before the next goes out, so a long request cannot outrun the
 * link and reach the keyboard truncated — a truncated request draws no reply,
 * and the reply to whatever came next then lands while the decoder is still
 * waiting for the end of a frame ("Unexpected SoF mid-frame").
 */
function chunkWriter(
  c: BluetoothRemoteGATTCharacteristic,
): (b: Uint8Array) => Promise<void> {
  // Absent `properties` (non-conforming implementation): assume the standard
  // ZMK shape rather than guessing the exotic one.
  if (!c.properties || c.properties.write) {
    return c.writeValueWithResponse
      ? (b) => c.writeValueWithResponse(b)
      : (b) => c.writeValue(b);
  }
  if (c.properties.writeWithoutResponse) {
    return (b) => c.writeValueWithoutResponse(b);
  }
  throw new Error(
    "ZMK Studio の RPC characteristic が書き込みに対応していません" +
      "（ファームウェアが想定と異なります）。",
  );
}

/**
 * Serialises connection attempts.
 *
 * The UI can fire a second attempt while the first is still negotiating (an
 * impatient second click, or a reconnect racing a manual connect), and two
 * overlapping GATT setups on one device corrupt each other's discovery in
 * exactly the way described above.
 */
let pendingConnect: Promise<unknown> = Promise.resolve();

export async function connect(
  options: ConnectOptions = {},
): Promise<RpcTransport> {
  if (!navigator.bluetooth) {
    throw new Error(
      "このブラウザは Web Bluetooth に対応していません（Chrome か Edge をご利用ください）。",
    );
  }

  const attempt = pendingConnect
    .catch(() => undefined)
    .then(() => connectOnce(options));
  pendingConnect = attempt.catch(() => undefined);
  return attempt;
}

async function connectOnce(options: ConnectOptions): Promise<RpcTransport> {
  if (!options.allDevices) {
    // Only the most recent grant: that is the keyboard they last used.
    const last = (await rememberedDevices()).at(-1);
    if (last && !rememberedFailed.has(last.id)) {
      try {
        return await attach(last, REMEMBERED_CONNECT_TIMEOUT_MS);
      } catch (e) {
        // Switched off, out of range, or simply slower than the budget. Do NOT
        // fall through to the chooser in the same call: the abandoned connect
        // may still be settling, and opening a second link to the same device
        // is the bug this whole path is built to avoid. Retire the device for
        // this session and ask for another click, which arrives with fresh user
        // activation and goes straight to the chooser.
        console.warn(`remembered device ${last.name} unreachable:`, e);
        last.gatt?.disconnect();
        rememberedFailed.add(last.id);
        throw new Error(
          "前回のキーボードに届きませんでした。" +
            "もう一度「Bluetooth」を押すと、選択画面が開きます。",
        );
      }
    }
  }

  try {
    return await attach(await requestDevice(options.allDevices === true));
  } catch (e) {
    // User activation can lapse before the chooser opens; nothing is wrong
    // except the timing, so say so instead of showing a SecurityError.
    if (e instanceof DOMException && e.name === "SecurityError") {
      throw new Error(
        "選択画面を開けませんでした。もう一度「Bluetooth」を押してください。",
      );
    }
    throw e;
  }
}

async function attach(
  device: BluetoothDevice,
  timeoutMs?: number,
): Promise<RpcTransport> {
  if (!device.gatt) throw new Error("GATT を利用できないデバイスです。");

  const label = device.name || "Unknown";
  const gatt = device.gatt;
  const server = await (timeoutMs
    ? connectWithin(gatt, timeoutMs)
    : gatt.connect());

  // Discovery, with the two failures kept apart. They mean opposite things and
  // used to share one message that named the wrong culprit for one of them.
  let rpc: BluetoothRemoteGATTCharacteristic;
  let svc: BluetoothRemoteGATTService;
  try {
    svc = await server.getPrimaryService(RPC_SERVICE);
  } catch (e) {
    // No Studio service at all: this really is a firmware or device question.
    await dumpGatt(server);
    server.disconnect();
    throw new Error(
      "ZMK Studio サービスが見つかりません" +
        "（Studio 対応ファームウェアが書き込まれているか、" +
        `他のアプリが接続中でないかご確認ください）: ${errText(e)}`,
    );
  }

  try {
    rpc = await svc.getCharacteristic(RPC_CHAR);
  } catch (e) {
    // The service is there but its characteristic is not — which the firmware
    // cannot actually do, since ZMK declares both in one static
    // BT_GATT_SERVICE_DEFINE. So the fault is on this side of the link: a
    // half-set-up connection, or a stale attribute table. Neither is fixed by
    // reflashing, so do not send the user off to do that.
    await dumpGatt(server);
    server.disconnect();
    throw new Error(
      "キーボードとの接続が中途半端な状態です。" +
        "いったんページを再読み込みして接続し直してください" +
        "（それでも直らない場合は、キーボードのペアリングを削除して再ペアリングしてください）: " +
        errText(e),
    );
  }

  // Published before the first RPC call so a panel opened immediately after
  // connecting already has somewhere to talk to.
  const backend: ToraboBackend = {
    kind: "webble",
    ...makeConfigBackend(server),
    ...webFiles,
  };
  registerBackend(backend);

  const abortController = new AbortController();

  // The read path is wired and subscribed BEFORE this function returns, because
  // the caller writes the first RPC the moment it has the transport. Doing the
  // subscribe inside start() does not hold anything back — the stream is usable
  // as soon as it is constructed — so the request could go out while the CCCD
  // write was still in flight, and the reply notification would land with
  // nobody listening. The first RPC has a one second budget; miss it and the
  // app reports a failed connection and returns to the connect screen.
  //
  // It bites on a RECONNECT in particular: a bonded device remembers its CCCD
  // state, so stop+start is two real round trips rather than a local no-op, and
  // the window is wide enough to lose the race.
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    // Called synchronously by the constructor, so `controller` is set below.
    start(c) {
      controller = c;
    },
    // ts-client pipes this stream with an AbortSignal, so a disconnect cancels
    // it here — without ever going near gattserverdisconnected. Tearing down
    // only on the BLE event left this listener alive on a dead stream.
    cancel() {
      teardown();
    },
  });

  /**
   * Undo everything this connection registered, once.
   *
   * Reached three ways — the link dropping, the app aborting, and the stream
   * being cancelled — and all three happen in practice, sometimes two of them
   * for the same disconnect. Chrome hands back the same characteristic object
   * on a reconnect, so a listener that outlives its connection stays attached
   * for the NEXT one, where it enqueues into a closed stream ("Cannot enqueue a
   * chunk into a closed readable stream") and interferes with the notification
   * stream the new connection depends on.
   */
  let tornDown = false;
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    rpc.removeEventListener("characteristicvaluechanged", onValue);
    device.removeEventListener("gattserverdisconnected", onDisconnected);
    // Only if it is still ours: a late teardown must not unregister the backend
    // belonging to a connection the user has since made.
    unregisterBackend(backend);
    try {
      controller.close();
    } catch {
      // Already closed or errored by the pipe that cancelled us.
    }
  };

  const onValue = (ev: Event) => {
    if (tornDown) return;
    const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    // Re-arm the idle timeout in rpc/logging.ts. This is the path that needs it
    // most: ZMK serves the RPC characteristic over INDICATE, so a kilobyte reply
    // reaches the browser ~20 bytes per confirmed round trip and is still very
    // much alive long after any fixed deadline would have declared it dead.
    bumpRpcActivity(value.byteLength);
    try {
      // Window the DataView, then copy. Both matter:
      //
      // `new Uint8Array(value.buffer)` — which is what upstream does — ignores
      // byteOffset/byteLength and hands the whole backing buffer to the framing
      // decoder, so anything else living in it arrives as if it were payload.
      //
      // And the buffer belongs to the browser, which is free to reuse it for
      // the next notification. This stream is consumed asynchronously, several
      // transforms downstream, so an uncopied chunk can be overwritten before
      // it is read. Either one corrupts a frame, and the decoder reports it as
      // "Unexpected SoF mid-frame" — the end of one frame lost, the start of
      // the next arriving while it still waited.
      controller.enqueue(
        new Uint8Array(
          value.buffer,
          value.byteOffset,
          value.byteLength,
        ).slice(),
      );
    } catch {
      // The stream went away underneath us; stop acting like it is alive.
      teardown();
    }
  };
  const onDisconnected = () => teardown();

  // Listener first, then subscribe: nothing should be able to arrive unheard.
  rpc.addEventListener("characteristicvaluechanged", onValue);
  device.addEventListener("gattserverdisconnected", onDisconnected);

  // Reconnecting to a device we already subscribed to silently delivers nothing
  // unless notifications are stopped first (upstream hits this too).
  await rpc.stopNotifications().catch(() => undefined);
  await rpc.startNotifications();

  const writeChunk = chunkWriter(rpc);

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      const total = Math.ceil(chunk.length / RPC_CHUNK);
      for (let i = 0, n = 1; i < chunk.length; i += RPC_CHUNK, n++) {
        const part = chunk.slice(i, i + RPC_CHUNK);
        try {
          await writeChunk(part);
        } catch (e) {
          // ts-client logs a rejected write and moves on, so without a readable
          // message here the failure only ever surfaces as an RPC timeout.
          throw new Error(
            `RPC の送信に失敗しました（チャンク ${n}/${total}, ${part.length} バイト）: ${errText(e)}`,
          );
        }
      }
    },
  });

  const signal = abortController.signal;
  const onAbort = () => {
    signal.removeEventListener("abort", onAbort);
    teardown();
    device.gatt?.disconnect();
  };
  signal.addEventListener("abort", onAbort);

  return { label, abortController, readable, writable };
}
