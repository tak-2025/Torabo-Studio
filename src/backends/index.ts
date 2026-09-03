import { tr } from "../i18n";
import type { FileFilter, FilesBackend, ToraboBackend } from "./types";
import { isTauri } from "./types";
import { tauriBackend } from "./tauri";
import { hasBleDevice } from "./tauri/device";
import { webFiles } from "./webble/files";

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
 *
 * Two things can register: the Web Bluetooth transport, which publishes a GATT
 * backend as it attaches, and App.tsx, which publishes the RPC tunnel backend
 * — but only for a connection that has no native GATT path of its own, i.e.
 * browser USB or desktop USB (App.tsx's `setupToraboAccess`). A Bluetooth
 * connection never gets the tunnel registered on it: browser Bluetooth
 * registers its own GATT backend here directly, and desktop Bluetooth is
 * served by the native-GATT fallback below (`tauriGatt`/`tauriBackend`)
 * without anything being `registered` at all. That split matters because the
 * torabo configs run to ~1.5KB, comfortably chunked over GATT
 * (src-tauri/src/transport/*.rs's `write_chunked`) but too large for a
 * single RPC tunnel frame's ATT write on Windows/WinRT — see
 * `setupToraboAccess`'s doc comment for why that combination used to drop
 * the connection.
 */

let registered: ToraboBackend | null = null;

/**
 * Install the backend for a connection that the frontend owns (Web Bluetooth,
 * the RPC tunnel, Capacitor). Pass null on disconnect so a stale handle can't be
 * used.
 */
export function registerBackend(backend: ToraboBackend | null): void {
  registered = backend;
}

/**
 * The backend installed for the current connection, if any.
 *
 * For deciding whether to install another one — not for talking to the keyboard,
 * which is what `activeBackend()` is for.
 */
export function registeredBackend(): ToraboBackend | null {
  return registered;
}

/**
 * Retire a backend when its connection ends.
 *
 * Only clears if this one is still the active backend. A teardown can fire late
 * — a disconnect event arriving after the user has already connected again —
 * and an unconditional clear would take the new connection's backend down with
 * the old one, leaving the panels with nothing to talk to.
 */
export function unregisterBackend(backend: ToraboBackend): void {
  if (registered === backend) registered = null;
}

export function activeBackend(): ToraboBackend {
  if (registered) return registered;
  if (isTauri() && tauriGatt) return tauriBackend;
  throw new Error(tr("sys.backend.noToraboAccess"));
}

/* --- Is the desktop build's GATT path usable? --------------------------------
 *
 * `isTauri()` used to stand in for this, and it was wrong for USB: the desktop
 * config commands all go through a BLE device handle that only `gatt_connect`
 * stores, so a serial connection showed every settings tab and then failed each
 * one with "No active BLE connection". Ask Rust instead.
 *
 * Cached as a plain boolean because the panels need this synchronously while
 * rendering. App.tsx refreshes it during connect — before the connection state
 * is published, so the first render after connecting already has the answer —
 * and clears it on disconnect.
 */

let tauriGatt = false;
let tauriGattOwner: object | null = null;

/**
 * Ask the desktop backend whether it is holding a BLE device, on behalf of
 * `owner` — pass whatever identifies the connection (its RpcConnection will do).
 */
export async function refreshTauriGattAccess(owner: object): Promise<boolean> {
  tauriGatt = isTauri() ? await hasBleDevice() : false;
  tauriGattOwner = tauriGatt ? owner : null;
  return tauriGatt;
}

/**
 * Forget the cached answer; the connection it described is over.
 *
 * Only if it is still `owner`'s answer. A teardown can fire late — after the
 * user has already connected again — and an unconditional clear would take the
 * new connection's access down with the old one. Same reasoning as
 * `unregisterBackend`.
 */
export function clearTauriGattAccess(owner: object): void {
  if (tauriGattOwner !== owner) return;
  tauriGatt = false;
  tauriGattOwner = null;
}

/** True when the torabo settings are reachable right now, by any route. */
export function hasConfigAccess(): boolean {
  return registered !== null || (isTauri() && tauriGatt);
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

export const timingReadConfig = async () => activeBackend().timingReadConfig();
export const timingWriteConfig = async (d: Uint8Array) =>
  activeBackend().timingWriteConfig(d);

export const dmacReadAll = async () => activeBackend().dmacReadAll();
export const dmacWriteSlot = async (d: Uint8Array) =>
  activeBackend().dmacWriteSlot(d);

export const comboReadAll = async () => activeBackend().comboReadAll();
export const comboWriteSlot = async (d: Uint8Array) =>
  activeBackend().comboWriteSlot(d);

// --- Files ------------------------------------------------------------------
// Resolved against the platform, not the registered backend: opening a backup to
// inspect it has nothing to do with whether a keyboard is currently connected.

function fileBackend(): FilesBackend {
  return isTauri() ? tauriBackend : webFiles;
}

export const saveTextFile = async (
  suggestedName: string,
  contents: string,
  filters: FileFilter[],
) => fileBackend().saveTextFile(suggestedName, contents, filters);

export const openBackupFile = async () => fileBackend().openBackupFile();
export const openKeymapFile = async () => fileBackend().openKeymapFile();
