import { invoke } from "@tauri-apps/api/core";

/**
 * Read/write the torabo-tsuki trackball config over the custom GATT service.
 * These go through dedicated Tauri commands (see src-tauri/.../trackball.rs),
 * independent of Studio's RPC. Requires an active BLE (gatt) connection.
 */

export async function trackballReadConfig(): Promise<Uint8Array> {
  const arr = await invoke<number[]>("trackball_read_config");
  return new Uint8Array(arr);
}

export async function trackballWriteConfig(data: Uint8Array): Promise<void> {
  // A Uint8Array argument is delivered to the command as a raw byte body.
  await invoke("trackball_write_config", data);
}
