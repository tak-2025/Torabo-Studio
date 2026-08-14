import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";

import { registerBackend } from "../index";
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

export interface ConnectOptions {
  /**
   * Always open the chooser, even when a keyboard is already remembered. For
   * picking a different one.
   */
  chooseDevice?: boolean;
}

/**
 * How long to wait on the remembered keyboard before falling back to the
 * chooser. Kept short on purpose: opening the chooser needs the click's user
 * activation, which expires a few seconds after the click, so a long wait here
 * would spend the very permission the fallback depends on.
 */
const REMEMBERED_CONNECT_TIMEOUT_MS = 3000;

/**
 * Devices this origin has already been granted, newest grant last.
 *
 * This is what makes a second connection painless: the chooser never opens
 * again. It also happens to be the only way to reach a keyboard that is already
 * connected to the OS — see requestDevice below for why a filtered chooser
 * cannot. Permission is per-origin, so a keyboard granted on localhost still
 * needs granting once on the published site.
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

/**
 * Ask the user to pick a device.
 *
 * acceptAllDevices, not a filter, and not by choice. A filter only matches what
 * a device is broadcasting right now, and a keyboard already connected to this
 * PC has stopped advertising — so the filtered chooser sits there scanning and
 * reports "no compatible devices" for the very keyboard the user is typing on
 * (measured, 2026-08-14). Filtering on the Studio service fails even when it is
 * advertising, because ZMK's advertisement carries only appearance, flags and
 * two 16-bit UUIDs (HID, battery) — never the 128-bit Studio UUID.
 *
 * acceptAllDevices is noisy, but the chooser also lists devices the OS has
 * paired, which is the only way the keyboard appears at all. It is a one-time
 * cost: after this, rememberedDevices() takes over.
 */
async function requestDevice(): Promise<BluetoothDevice> {
  return navigator.bluetooth
    .requestDevice({ acceptAllDevices: true, optionalServices: ALL_SERVICES })
    .catch((e) => {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        throw new UserCancelledError("User cancelled the connection attempt", {
          cause: e,
        });
      }
      throw e;
    });
}

export async function connect(
  options: ConnectOptions = {},
): Promise<RpcTransport> {
  if (!navigator.bluetooth) {
    throw new Error(
      "このブラウザは Web Bluetooth に対応していません（Chrome か Edge をご利用ください）。",
    );
  }

  if (!options.chooseDevice) {
    // Only the most recent grant, and only one attempt: that is the keyboard
    // they last used, and anything longer eats the activation the chooser needs.
    const last = (await rememberedDevices()).at(-1);
    if (last) {
      try {
        return await attach(last, REMEMBERED_CONNECT_TIMEOUT_MS);
      } catch (e) {
        // Switched off, out of range, or paired to something else now. Fall
        // through and let them pick.
        console.warn(`remembered device ${last.name} unreachable:`, e);
        last.gatt?.disconnect();
      }
    }
  }

  try {
    return await attach(await requestDevice());
  } catch (e) {
    // The activation from the click can lapse while a remembered keyboard is
    // timing out, and the chooser then refuses to open. Nothing is wrong except
    // the timing, so say so instead of showing a SecurityError.
    if (e instanceof DOMException && e.name === "SecurityError") {
      throw new Error(
        "前回のキーボードに届かなかったため、選択画面を開けませんでした。" +
          "もう一度「Bluetooth」を押してください。",
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
    ? Promise.race([
        gatt.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`接続がタイムアウトしました（${timeoutMs}ms）`)),
            timeoutMs,
          ),
        ),
      ])
    : gatt.connect());

  let rpc: BluetoothRemoteGATTCharacteristic;
  try {
    const svc = await server.getPrimaryService(RPC_SERVICE);
    rpc = await svc.getCharacteristic(RPC_CHAR);
  } catch (e) {
    server.disconnect();
    throw new Error(
      "ZMK Studio サービスが見つかりません" +
        "（Studio 対応ファームウェアが書き込まれているか、" +
        `他のアプリが接続中でないかご確認ください）: ${errText(e)}`,
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

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Reconnecting to a device we already subscribed to silently delivers
      // nothing unless notifications are stopped first (upstream hits this too).
      await rpc.stopNotifications().catch(() => undefined);
      await rpc.startNotifications();

      const onValue = (ev: Event) => {
        const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (value) controller.enqueue(new Uint8Array(value.buffer));
      };
      rpc.addEventListener("characteristicvaluechanged", onValue);

      const onDisconnected = () => {
        rpc.removeEventListener("characteristicvaluechanged", onValue);
        device.removeEventListener("gattserverdisconnected", onDisconnected);
        // The handles this backend holds belong to a link that no longer exists.
        registerBackend(null);
        controller.close();
      };
      device.addEventListener("gattserverdisconnected", onDisconnected);
    },
  });

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      const total = Math.ceil(chunk.length / RPC_CHUNK);
      for (let i = 0, n = 1; i < chunk.length; i += RPC_CHUNK, n++) {
        const part = chunk.slice(i, i + RPC_CHUNK);
        try {
          if (rpc.writeValueWithoutResponse) {
            await rpc.writeValueWithoutResponse(part);
          } else {
            await rpc.writeValue(part);
          }
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
    registerBackend(null);
    device.gatt?.disconnect();
  };
  signal.addEventListener("abort", onAbort);

  return { label, abortController, readable, writable };
}
