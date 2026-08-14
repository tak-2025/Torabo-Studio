import { invoke } from "@tauri-apps/api/core";

/**
 * Read/write the extender LED rule table over its own GATT service (e1f4ae00).
 * Separate from the trackpad/encoder transports so a change to one cannot disturb
 * the others. Requires an active BLE (gatt) connection.
 */

export async function ledReadConfig(): Promise<Uint8Array> {
  const arr = await invoke<number[]>("led_read_config");
  return new Uint8Array(arr);
}

export async function ledWriteConfig(data: Uint8Array): Promise<void> {
  // A Uint8Array argument is delivered to the command as a raw byte body.
  await invoke("led_write_config", data);
}
