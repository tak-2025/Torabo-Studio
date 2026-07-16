/**
 * On-disk format for a torabo-tsuki full backup (`*.torabo-backup.json`).
 * Contains the custom GATT configs (trackball / macros / combos, each stored as
 * the raw READ wire in base64) AND the ZMK keymap (per-layer bindings). All
 * editable settings live on the right central, so one file is a complete backup
 * of the keyboard's user configuration.
 *
 * version 1: trackball + keymap only.
 * version 2: adds macros + combos (both optional; absent in v1 files).
 * version 3: adds trackpad (optional; absent in v1/v2 files). Older backups keep
 *            working because every added section is optional and validateBackup
 *            accepts any version <= BACKUP_VERSION.
 */

export const BACKUP_FORMAT = "torabo-tsuki-backup";
export const BACKUP_VERSION = 3;

export interface BackupBinding {
  behaviorId: number;
  param1: number;
  param2: number;
}

export interface BackupLayer {
  name?: string;
  bindings: BackupBinding[];
}

export interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  trackball: { wireBase64: string } | null;
  keymap: { layers: BackupLayer[] } | null;
  /** v2+. Full dynamic-macro READ wire (all slots), base64. Optional. */
  macros?: { wireBase64: string } | null;
  /** v2+. Full dynamic-combo READ wire (all slots), base64. Optional. */
  combos?: { wireBase64: string } | null;
  /** v3+. Trackpad config READ wire (all devices/layers), base64. Optional. */
  trackpad?: { wireBase64: string } | null;
}

/** Uint8Array -> base64 (WebView2 has btoa; encode via a binary string). */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s);
}

/** base64 -> Uint8Array. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** Validate a parsed object is a backup file we understand. Throws otherwise. */
export function validateBackup(obj: unknown): BackupFile {
  if (!obj || typeof obj !== "object") {
    throw new Error("ファイルの中身が不正です（JSON オブジェクトではありません）。");
  }
  const b = obj as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT) {
    throw new Error(
      `このファイルは torabo バックアップではありません（format=${String(b.format)}）。`
    );
  }
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) {
    throw new Error(
      `未対応のバックアップ版です（version=${String(b.version)}）。アプリを更新してください。`
    );
  }
  if (b.trackball === undefined || b.keymap === undefined) {
    throw new Error("バックアップに trackball / keymap フィールドがありません。");
  }
  return b as BackupFile;
}
