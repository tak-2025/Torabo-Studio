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
 *            accepts any version (see below).
 * version 4: adds `behaviors`, the id -> display-name table for every behavior
 *            the keymap references. ZMK numbers behaviors per device (settings
 *            table), so `behaviorId` alone only means something on the keyboard
 *            that produced the file — with the name table the importer can
 *            translate ids to the target keyboard. v1-v3 files have no table and
 *            can only be restored onto the same unit; the app can add one (see
 *            the "ビヘイビア名を付与" action) while connected to the source
 *            keyboard.
 */

export const BACKUP_FORMAT = "torabo-tsuki-backup";
export const BACKUP_VERSION = 4;

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
  /**
   * v4+. behaviorId (as a string key) -> display name on the source keyboard,
   * for every behavior the keymap uses. Absent in v1-v3 files.
   */
  behaviors?: Record<string, string> | null;
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

/**
 * Validate a parsed object is a backup file we understand, and normalise it.
 *
 * Deliberately lenient: only a wrong `format` is fatal. Every section is
 * optional and unknown/newer versions are accepted, so a keymap saved by an
 * older (or newer) app/firmware can still be restored — the import path
 * restores each section independently and reports what it had to skip.
 */
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
  return {
    format: BACKUP_FORMAT,
    version: typeof b.version === "number" ? b.version : 0,
    exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
    trackball: b.trackball ?? null,
    keymap: b.keymap ?? null,
    macros: b.macros ?? null,
    combos: b.combos ?? null,
    trackpad: b.trackpad ?? null,
    behaviors:
      b.behaviors && typeof b.behaviors === "object" ? b.behaviors : null,
  };
}

/** Distinct behavior ids referenced by a backup's keymap. */
export function usedBehaviorIds(file: BackupFile): number[] {
  const ids = new Set<number>();
  for (const l of file.keymap?.layers ?? []) {
    for (const b of l.bindings ?? []) {
      ids.add(b.behaviorId ?? 0);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Non-fatal compatibility note for a validated backup (null when there is
 * nothing to say). Newer files are still imported best-effort.
 */
export function backupCompatNote(b: BackupFile): string | null {
  if (b.version > BACKUP_VERSION) {
    return `このファイルは新しいバックアップ版です（version=${b.version} > ${BACKUP_VERSION}）。読める範囲だけ復元します。`;
  }
  return null;
}
