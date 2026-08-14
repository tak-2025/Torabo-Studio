/**
 * GATT addresses for everything this app talks to, taken verbatim from the Rust
 * transports in src-tauri (which in turn match the firmware's gatt_service.c for
 * each feature). Web Bluetooth wants lowercase 128-bit strings where bluest takes
 * u128 literals, so these are the same values in the other spelling.
 */

import { DM_SLOTS, DM_STEPS } from "../../dynamic_macros/dmacConfig";
import { CB_SLOTS } from "../../dynamic_combos/comboConfig";

export const RPC_SERVICE = "00000000-0196-6107-c967-c5cfb1c2482a";
export const RPC_CHAR = "00000001-0196-6107-c967-c5cfb1c2482a";

/** Every torabo config service: one service, one characteristic, whole blob. */
export interface ConfigService {
  service: string;
  characteristic: string;
  /** For error messages. */
  label: string;
  /**
   * Bytes a full read must return, when the firmware fixes it at compile time.
   * null where the length follows the keymap's layer count and so is only known
   * at runtime.
   *
   * This is not a sanity check, it is a data-loss guard: the decoders stop at
   * the end of a short buffer instead of failing, so a truncated read looks
   * exactly like "the rest of the slots are empty" — and saving after that
   * would write the emptiness back to the keyboard.
   */
  exactLength: number | null;
}

export const CONFIG_SERVICES = {
  caps: {
    service: "e1f4a000-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4a001-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "capability descriptor",
    exactLength: null,
  },
  trackball: {
    service: "e1f4a900-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4a901-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "trackball config",
    exactLength: null, // 8 + layers * 12
  },
  macros: {
    service: "e1f4aa00-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4aa01-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "dynamic macros",
    // 4 + 20 * (1 + 16 * 5) = 1624 — well past the 512-byte ATT ceiling.
    exactLength: 4 + DM_SLOTS * (1 + DM_STEPS * 5),
  },
  combos: {
    service: "e1f4ab00-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4ab01-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "dynamic combos",
    // 4 + 16 * 26 = 420
    exactLength: 4 + CB_SLOTS * 26,
  },
  trackpad: {
    service: "e1f4ac00-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4ac01-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "trackpad config",
    exactLength: null, // header + devices * (header + layers * 38)
  },
  encoder: {
    service: "e1f4ad00-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4ad01-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "encoder config",
    exactLength: null, // 4 + layers * 12
  },
  led: {
    service: "e1f4ae00-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4ae01-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "LED config",
    exactLength: null, // 6 + 2 * (1 + rules * ...)
  },
} as const satisfies Record<string, ConfigService>;

export type ConfigKey = keyof typeof CONFIG_SERVICES;

/** Everything requestDevice() must be told about up front, or access is denied. */
export const ALL_SERVICES: string[] = [
  RPC_SERVICE,
  ...Object.values(CONFIG_SERVICES).map((s) => s.service),
];
