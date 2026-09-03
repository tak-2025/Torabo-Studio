import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from "../types";
import { bumpRpcActivity } from "../../rpc/activity";

export async function list_devices(): Promise<Array<AvailableDevice>> {
  return await invoke("gatt_list_devices");
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
  const connectionId = await invoke<number>("gatt_connect", dev);
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

  // One writer for the life of the link.
  //
  // Taking the writer per event — as upstream does — races: Tauri delivers the
  // next `connection_data` while the previous callback is still suspended on its
  // `await writer.write(...)`, and getWriter() on a still-locked stream throws
  // ("Cannot create writer when WritableStream is locked"). The throw happens
  // inside the listener, so that chunk is simply lost, the frame it belonged to
  // is short, and the decoder later reports "Unexpected SoF mid-frame" when it
  // meets the start of the next one. The reply never completes and the call dies
  // on the idle timeout instead. It only bites on the biggest responses
  // (keymap.getKeymap, ~90 indications), which is exactly where events outrun
  // the callback.
  const response_writer = response_writable.getWriter();

  // The response pipeline is the one that dies on a framing error, and nothing
  // in the ts-client closes the transport for it: create_rpc_connection wires
  // abortController.abort() to the *request* pipeline only (lib/index.js:15-18).
  // So a decoder error leaves the UI back on "disconnected" while the Rust side
  // still holds the link — and for USB that means the COM port stays open until
  // the whole app exits, making every reconnect fail with "Failed to open the
  // serial port". Aborting here is what runs abort_cb below, hence
  // transport_close. Downstream cancelling us on a normal disconnect lands here
  // too, which is why the already-aborted case is a no-op.
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
      // Re-arm the idle timeout in rpc/logging.ts: bytes are still flowing, so
      // a long multi-indication response must not be read as a wedged link.
      bumpRpcActivity(event.payload.length);
      // Deliberately not awaited: writes on a single writer are queued in call
      // order, so the frame stays intact, while awaiting here would recreate the
      // overlap this exists to avoid. A rejection means the pipeline downstream
      // has died, which is exactly what failLink is for.
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
