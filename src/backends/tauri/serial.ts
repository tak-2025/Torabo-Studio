import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from "../types";
import { bumpRpcActivity } from "../../rpc/activity";

export async function list_devices(): Promise<Array<AvailableDevice>> {
  return await invoke("serial_list_devices");
}

export async function connect(dev: AvailableDevice): Promise<RpcTransport> {
  // The id this link was opened with. Every event the Rust side emits for it is
  // addressed to this id, and transport_close only acts when it is still the
  // current link. Without that, a link that had already been replaced — the
  // previous device, the previous transport, a failed attempt — tore down the
  // live one as it wound down: `connect` installs the new sink and only then
  // does the old pump notice, so its `connection_disconnected` could land after
  // the new transport had started listening and close its response stream. The
  // symptom was a healthy device whose keymap.getKeymap simply never completed.
  const connectionId = await invoke<number>("serial_connect", dev);
  if (typeof connectionId !== "number") {
    throw new Error("Failed to connect");
  }

  let abortController = new AbortController();

  let writable = new WritableStream({
    async write(chunk, _controller) {
      await invoke("transport_send_data", new Uint8Array(chunk));
    },
  });

  let { writable: response_writable, readable } = new TransformStream();

  // One writer for the life of the link; taking it per event races and drops
  // chunks (see ble.ts for the full account).
  const response_writer = response_writable.getWriter();

  // Abort the transport when the response pipeline dies, so transport_close runs
  // and the COM port is released; nothing in the ts-client does it (see ble.ts).
  const failLink = (reason: unknown) => {
    if (abortController.signal.aborted) {
      return;
    }
    console.error("RPC response stream failed; closing the transport", reason);
    abortController.abort(reason);
  };

  const unlisten_data = await listen(
    `connection_data:${connectionId}`,
    (event: { payload: Array<number> }) => {
      // Re-arm the idle timeout in rpc/logging.ts (see ble.ts).
      bumpRpcActivity(event.payload.length);
      // Not awaited: see ble.ts.
      void response_writer.write(new Uint8Array(event.payload)).catch(failLink);
    },
  );

  const unlisten_disconnected = await listen(
    `connection_disconnected:${connectionId}`,
    async (_ev: any) => {
      unlisten_data();
      unlisten_disconnected();
      // close() on the stream itself would throw now that it is locked.
      response_writer.close().catch(() => {});
    },
  );

  let signal = abortController.signal;

  let abort_cb = async (_reason: any) => {
    unlisten_data();
    unlisten_disconnected();
    await invoke("transport_close", { id: connectionId });
    signal.removeEventListener("abort", abort_cb);
  };

  signal.addEventListener("abort", abort_cb);

  return { label: dev.label, abortController, readable, writable };
}
