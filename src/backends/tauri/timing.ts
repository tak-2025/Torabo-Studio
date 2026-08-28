import { invoke } from "@tauri-apps/api/core";

/**
 * Read/write the torabo-tsuki timing config (Hold-Tap tapping-term/flavor/
 * quick-tap/require-prior-idle/positional + kscan debounce) over its own GATT
 * service (e1f4b000). Dedicated Tauri commands, see
 * src-tauri/.../transport/timing.rs. Requires an active BLE (gatt) connection.
 *
 * Deliberately separate from the other config services: the timing wire is its
 * own service, so a change to one cannot disturb the others.
 */

export async function timingReadConfig(): Promise<Uint8Array> {
  const arr = await invoke<number[]>("timing_read_config");
  return new Uint8Array(arr);
}

export async function timingWriteConfig(data: Uint8Array): Promise<void> {
  // A Uint8Array argument is delivered to the command as a raw byte body.
  await invoke("timing_write_config", data);
}
