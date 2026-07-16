import { invoke } from "@tauri-apps/api/core";

/**
 * Read/write the torabo-tsuki encoder config over its own GATT service
 * (e1f4ad00). Dedicated Tauri commands, see src-tauri/.../transport/encoder.rs.
 * Requires an active BLE (gatt) connection.
 *
 * Deliberately separate from the trackpad transport: the encoder is its own
 * service, so a change to one cannot disturb the other.
 */

export async function encoderReadConfig(): Promise<Uint8Array> {
  const arr = await invoke<number[]>("encoder_read_config");
  return new Uint8Array(arr);
}

export async function encoderWriteConfig(data: Uint8Array): Promise<void> {
  // A Uint8Array argument is delivered to the command as a raw byte body.
  await invoke("encoder_write_config", data);
}
