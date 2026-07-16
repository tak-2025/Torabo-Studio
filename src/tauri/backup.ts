import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

/**
 * File helpers for the torabo backup feature. The native Save/Open dialogs come
 * from tauri-plugin-dialog; the actual disk read/write is done by our own Rust
 * commands (see src-tauri/src/backup.rs) so no fs-plugin path scope is needed.
 */

const FILTERS = [{ name: "Torabo Backup", extensions: ["json"] }];

/** Show a Save dialog; returns the chosen path or null if cancelled. */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters: FILTERS });
  return path ?? null;
}

/** Show an Open dialog; returns the chosen path or null if cancelled. */
export async function pickOpenPath(): Promise<string | null> {
  const res = await open({ multiple: false, directory: false, filters: FILTERS });
  return typeof res === "string" ? res : null;
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke("backup_write", { path, contents });
}

export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>("backup_read", { path });
}

/** Read a source keymap-ish file (.keymap/.dtsi/.overlay/.conf/.txt) read-only. */
export async function readKeymapFile(path: string): Promise<string> {
  return await invoke<string>("keymap_read", { path });
}
