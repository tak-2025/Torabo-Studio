import { invoke } from "@tauri-apps/api/core";

/**
 * Whether the Rust side is holding a BLE device for the current connection.
 *
 * The desktop backend's config commands all go through that handle, so this is
 * "can the tauri backend reach the torabo GATT services right now". It is false
 * for a serial connection, which is the case that used to be mishandled: the app
 * treated "running under Tauri" as "GATT available" and showed every settings
 * tab over USB, each one failing with "No active BLE connection".
 *
 * Answers false rather than throwing on an older desktop binary that has no such
 * command — refusing to show the tabs is the safe way to be wrong.
 */
export async function hasBleDevice(): Promise<boolean> {
  try {
    return (await invoke("transport_has_device")) === true;
  } catch (e) {
    console.warn("transport_has_device unavailable:", e);
    return false;
  }
}
