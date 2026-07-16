import { invoke } from "@tauri-apps/api/core";

/**
 * Read the firmware's capability descriptor (GATT e1f4a000). Throws on firmware
 * that predates it — the caller treats that as "unknown", not as a failure.
 */
export async function toraboReadCaps(): Promise<Uint8Array> {
  const arr = await invoke<number[]>("torabo_read_caps");
  return new Uint8Array(arr);
}
