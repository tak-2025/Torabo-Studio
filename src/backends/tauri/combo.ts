import { invoke } from "@tauri-apps/api/core";

/**
 * Read/write the torabo-tsuki dynamic combos over the custom GATT service.
 * See src-tauri/.../transport/combo.rs. Requires an active BLE (gatt) connection.
 */

/** Read ALL combo slots (full wire). */
export async function comboReadAll(): Promise<Uint8Array> {
  const arr = await invoke<number[]>("combo_read_all");
  return new Uint8Array(arr);
}

/** Write ONE combo (raw wire: version, slot, 26-byte slot). */
export async function comboWriteSlot(data: Uint8Array): Promise<void> {
  await invoke("combo_write_slot", data);
}
