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

export async function connect(): Promise<RpcTransport> {
  if (!navigator.bluetooth) {
    throw new Error(
      "このブラウザは Web Bluetooth に対応していません（Chrome か Edge をご利用ください）。",
    );
  }

  // acceptAllDevices, not a service filter: the chooser can only match what the
  // keyboard puts in its advertisement, and filtering on a service it does not
  // advertise shows an empty picker with no way to tell why. Torabo-Float-Web
  // reaches this same keyboard the same way.
  const device = await navigator.bluetooth
    .requestDevice({ acceptAllDevices: true, optionalServices: ALL_SERVICES })
    .catch((e) => {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        throw new UserCancelledError("User cancelled the connection attempt", {
          cause: e,
        });
      }
      throw e;
    });

  if (!device.gatt) throw new Error("GATT を利用できないデバイスです。");

  const label = device.name || "Unknown";
  const server = await device.gatt.connect();

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
