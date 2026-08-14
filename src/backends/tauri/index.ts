import type { ToraboBackend } from "../types";

import { toraboReadCaps } from "./caps";
import { trackballReadConfig, trackballWriteConfig } from "./trackball";
import { trackpadReadConfig, trackpadWriteConfig } from "./trackpad";
import { encoderReadConfig, encoderWriteConfig } from "./encoder";
import { ledReadConfig, ledWriteConfig } from "./led";
import { dmacReadAll, dmacWriteSlot } from "./dmac";
import { comboReadAll, comboWriteSlot } from "./combo";
import { openBackupFile, openKeymapFile, saveTextFile } from "./files";

/**
 * The desktop backend: every call is a Tauri command, and the Rust side holds
 * the BLE connection (see src-tauri/src/transport/). Nothing here knows a UUID —
 * that all lives in Rust, which is why these wrappers are one line each.
 */
export const tauriBackend: ToraboBackend = {
  kind: "tauri",

  toraboReadCaps,
  trackballReadConfig,
  trackballWriteConfig,
  trackpadReadConfig,
  trackpadWriteConfig,
  encoderReadConfig,
  encoderWriteConfig,
  ledReadConfig,
  ledWriteConfig,
  dmacReadAll,
  dmacWriteSlot,
  comboReadAll,
  comboWriteSlot,

  saveTextFile,
  openBackupFile,
  openKeymapFile,
};
