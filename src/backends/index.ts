import type { FileFilter, ToraboBackend } from "./types";
import { isTauri } from "./types";
import { tauriBackend } from "./tauri";

export type {
  AvailableDevice,
  FileFilter,
  FilesBackend,
  OpenedFile,
  SavedFile,
  ToraboBackend,
  ToraboConfigBackend,
} from "./types";
export { isTauri, BACKUP_FILTERS, KEYMAP_FILTERS } from "./types";

/**
 * The single place that decides which backend the app is talking through, and
 * the only module the feature panels import.
 *
 * Resolution is deferred to call time, not import time, on purpose. The desktop
 * backend is always there (Rust owns the connection), but a browser backend only
 * exists once the user has picked a device and the GATT server is up — so the
 * transport registers it at connect and clears it at disconnect.
 */

let registered: ToraboBackend | null = null;

/**
 * Install the backend for a connection that the frontend owns (Web Bluetooth,
 * Capacitor). Pass null on disconnect so a stale handle can't be used.
 */
export function registerBackend(backend: ToraboBackend | null): void {
  registered = backend;
}

export function activeBackend(): ToraboBackend {
  if (registered) return registered;
  if (isTauri()) return tauriBackend;
  throw new Error(
    "この接続では torabo 独自機能を利用できません。" +
      "USB 接続ではキーマップ編集のみ利用できます（独自設定は Bluetooth 接続が必要です）。",
  );
}

/** True when the torabo config services are reachable right now. */
export function hasConfigAccess(): boolean {
  return registered !== null || isTauri();
}

// --- Config services --------------------------------------------------------
// Thin pass-throughs so panels keep their existing call sites unchanged.

export const toraboReadCaps = async () => activeBackend().toraboReadCaps();

export const trackballReadConfig = async () =>
  activeBackend().trackballReadConfig();
export const trackballWriteConfig = async (d: Uint8Array) =>
  activeBackend().trackballWriteConfig(d);

export const trackpadReadConfig = async () =>
  activeBackend().trackpadReadConfig();
export const trackpadWriteConfig = async (d: Uint8Array) =>
  activeBackend().trackpadWriteConfig(d);

export const encoderReadConfig = async () =>
  activeBackend().encoderReadConfig();
export const encoderWriteConfig = async (d: Uint8Array) =>
  activeBackend().encoderWriteConfig(d);

export const ledReadConfig = async () => activeBackend().ledReadConfig();
export const ledWriteConfig = async (d: Uint8Array) =>
  activeBackend().ledWriteConfig(d);

export const dmacReadAll = async () => activeBackend().dmacReadAll();
export const dmacWriteSlot = async (d: Uint8Array) =>
  activeBackend().dmacWriteSlot(d);

export const comboReadAll = async () => activeBackend().comboReadAll();
export const comboWriteSlot = async (d: Uint8Array) =>
  activeBackend().comboWriteSlot(d);

// --- Files ------------------------------------------------------------------
// File access does not depend on the keyboard connection, so it resolves against
// the platform rather than the registered (connection-scoped) backend.

function fileBackend(): ToraboBackend {
  if (isTauri()) return tauriBackend;
  if (registered) return registered;
  throw new Error("この環境ではファイルの読み書きに対応していません。");
}

export const saveTextFile = async (
  suggestedName: string,
  contents: string,
  filters: FileFilter[],
) => fileBackend().saveTextFile(suggestedName, contents, filters);

export const openBackupFile = async () => fileBackend().openBackupFile();
export const openKeymapFile = async () => fileBackend().openKeymapFile();
