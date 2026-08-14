/**
 * What a "backend" has to provide, so the panels don't care where they run.
 *
 * The torabo features live on their own GATT services, separate from ZMK Studio's
 * protobuf RPC. Reaching them needs a platform BLE stack, and we have three:
 * Tauri/Rust (desktop), Capacitor (Android), and the browser's Web Bluetooth.
 * The wire formats are identical everywhere — only the plumbing differs — so a
 * backend is a thin byte-carrier and every bit of encoding/decoding stays in the
 * feature modules where it already is.
 *
 * Panels import from `../backends`, never from a specific implementation.
 */

/** A device offered by a picker (label for the UI, id to reconnect with). */
export type AvailableDevice = { label: string; id: string };

/**
 * Read/write access to the torabo config services.
 *
 * Every method may reject: the keyboard may be connected over a transport that
 * cannot reach these services (USB), or be running firmware built without the
 * feature. Callers already treat a rejection as "this feature is unavailable"
 * and say so in the panel, so backends should let the error through rather than
 * inventing empty config.
 */
export interface ToraboConfigBackend {
  /** Capability descriptor (e1f4a000). Rejects on firmware that predates it. */
  toraboReadCaps(): Promise<Uint8Array>;

  trackballReadConfig(): Promise<Uint8Array>;
  trackballWriteConfig(data: Uint8Array): Promise<void>;

  trackpadReadConfig(): Promise<Uint8Array>;
  trackpadWriteConfig(data: Uint8Array): Promise<void>;

  encoderReadConfig(): Promise<Uint8Array>;
  encoderWriteConfig(data: Uint8Array): Promise<void>;

  ledReadConfig(): Promise<Uint8Array>;
  ledWriteConfig(data: Uint8Array): Promise<void>;

  /** Macros: read every slot at once, write one slot at a time. */
  dmacReadAll(): Promise<Uint8Array>;
  dmacWriteSlot(data: Uint8Array): Promise<void>;

  /** Combos: same shape as macros. */
  comboReadAll(): Promise<Uint8Array>;
  comboWriteSlot(data: Uint8Array): Promise<void>;
}

/** A file type offered in a picker. */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Extensions must stay in step with the allowlists in src-tauri/src/backup.rs —
 * backups are .json-only, keymap imports accept ZMK source files.
 */
export const BACKUP_FILTERS: FileFilter[] = [
  { name: "Torabo Backup", extensions: ["json"] },
];

export const KEYMAP_FILTERS: FileFilter[] = [
  { name: "ZMK keymap", extensions: ["keymap", "dtsi", "overlay"] },
];

/** A file the user picked, already read. */
export interface OpenedFile {
  /** Bare file name, e.g. "torabo-backup.json" — safe to derive new names from. */
  name: string;
  /**
   * The most specific identifier the backend can show a human: the full path on
   * desktop, just the name in a browser (which never learns the path). For
   * status messages only — never parse it.
   */
  label: string;
  text: string;
}

/** Where a save landed. Same `name` / `label` split as OpenedFile. */
export interface SavedFile {
  name: string;
  label: string;
}

/**
 * Saving and loading text files.
 *
 * Deliberately whole-operation ("save this text") rather than the desktop's
 * pick-a-path-then-write: a browser hands back a handle, not a path, so a
 * path-shaped API could not be implemented there at all.
 *
 * Backup writes stay .json-only and keymap reads accept source extensions, which
 * mirrors the extension allowlists enforced in src-tauri/src/backup.rs. Keeping
 * the two open paths separate keeps that boundary visible instead of inferring
 * it from whatever filter happened to be passed.
 */
export interface FilesBackend {
  /** Returns null if the user cancelled. */
  saveTextFile(
    suggestedName: string,
    contents: string,
    filters: FileFilter[],
  ): Promise<SavedFile | null>;

  /** Open a backup (.json). Null if cancelled. */
  openBackupFile(): Promise<OpenedFile | null>;

  /** Open a source keymap file for the macro importer. Null if cancelled. */
  openKeymapFile(): Promise<OpenedFile | null>;
}

export interface ToraboBackend extends ToraboConfigBackend, FilesBackend {
  /** For diagnostics and error messages. */
  readonly kind: "tauri" | "capacitor" | "webble";
}

/** Tauri announces itself on the window; nothing else does. */
declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}
