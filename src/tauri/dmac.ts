import { invoke } from "@tauri-apps/api/core";

/**
 * Read/write the torabo-tsuki dynamic macros over the custom GATT service.
 * See src-tauri/.../transport/dmac.rs. Requires an active BLE (gatt) connection.
 */

/** Read ALL macro slots (full wire). */
export async function dmacReadAll(): Promise<Uint8Array> {
  const arr = await invoke<number[]>("dmac_read_all");
  return new Uint8Array(arr);
}

/** Write ONE slot (raw wire: version, slot, len, steps). */
export async function dmacWriteSlot(data: Uint8Array): Promise<void> {
  await invoke("dmac_write_slot", data);
}
