import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import {
  BACKUP_FILTERS,
  KEYMAP_FILTERS,
  type FileFilter,
  type FilesBackend,
  type OpenedFile,
  type SavedFile,
} from "../types";

/**
 * Desktop file access: native Save/Open dialogs from tauri-plugin-dialog, and the
 * actual disk I/O through our own Rust commands (src-tauri/src/backup.rs) so no
 * fs-plugin path scope is needed. Those commands enforce their own extension
 * allowlists — writes are .json-only, keymap reads accept source extensions —
 * which is why opening a backup and opening a keymap are separate operations
 * here rather than one call parameterised by a filter.
 */

/** Bare file name from a native path (both separators appear on Windows). */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

async function pickOpenPath(filters: FileFilter[]): Promise<string | null> {
  const res = await open({ multiple: false, directory: false, filters });
  return typeof res === "string" ? res : null;
}

export async function saveTextFile(
  suggestedName: string,
  contents: string,
  filters: FileFilter[],
): Promise<SavedFile | null> {
  const path = await save({ defaultPath: suggestedName, filters });
  if (!path) return null;
  await invoke("backup_write", { path, contents });
  // label is the full path: on desktop that is what the user wants to be told.
  return { name: baseName(path), label: path };
}

export async function openBackupFile(): Promise<OpenedFile | null> {
  const path = await pickOpenPath(BACKUP_FILTERS);
  if (!path) return null;
  const text = await invoke<string>("backup_read", { path });
  return { name: baseName(path), label: path, text };
}

export async function openKeymapFile(): Promise<OpenedFile | null> {
  const path = await pickOpenPath(KEYMAP_FILTERS);
  if (!path) return null;
  const text = await invoke<string>("keymap_read", { path });
  return { name: baseName(path), label: path, text };
}

/** Compile-time check that this module covers the whole contract. */
const _impl: FilesBackend = { saveTextFile, openBackupFile, openKeymapFile };
void _impl;
