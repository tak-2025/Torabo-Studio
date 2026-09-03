/**
 * GATT addresses for everything this app talks to, taken verbatim from the Rust
 * transports in src-tauri (which in turn match the firmware's gatt_service.c for
 * each feature). Web Bluetooth wants lowercase 128-bit strings where bluest takes
 * u128 literals, so these are the same values in the other spelling.
 */

import { DM_WIRE_LENS } from "../../dynamic_macros/dmacConfig";
import { CB_WIRE_LENS } from "../../dynamic_combos/comboConfig";
import { TMG_WIRE_LENS } from "../../timing/timingConfig";

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
   * at runtime. An array where more than one wire version is live at once (e.g.
   * macros: firmware may still speak v1, or already speak v2 with its appended
   * name block) — any length in the array is accepted, all others are not.
   *
   * This is not a sanity check, it is a data-loss guard: the decoders stop at
   * the end of a short buffer instead of failing, so a truncated read looks
   * exactly like "the rest of the slots are empty" — and saving after that
   * would write the emptiness back to the keyboard.
   */
  exactLength: number | readonly number[] | null;
}

/** True when `got` is one of the lengths `need` accepts. `null` accepts anything. */
export function isAcceptedLength(
  need: number | readonly number[] | null,
  got: number,
): boolean {
  if (need === null) return true;
  return Array.isArray(need) ? need.includes(got) : got === need;
}

/**
 * `need` rendered for the `{need}` slot of the sys.cfg.readShort message.
 * Callers only reach this after `isAcceptedLength` has already returned
 * false, which is never true for `null` (it accepts everything) — so `null`
 * here would be a caller bug, not a real case; it renders as "" rather than
 * throwing a second error over the first one.
 */
export function formatAcceptedLengths(
  need: number | readonly number[] | null,
): string {
  if (need === null) return "";
  return Array.isArray(need) ? need.join(" / ") : String(need);
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
    // v1 (steps only) or v2 (steps + appended name block) — both well past the
    // 512-byte ATT ceiling. See dmacConfig.ts's header comment.
    exactLength: DM_WIRE_LENS,
  },
  combos: {
    service: "e1f4ab00-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4ab01-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "dynamic combos",
    exactLength: CB_WIRE_LENS,
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
  timing: {
    service: "e1f4b000-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    characteristic: "e1f4b001-1c2d-4b6e-9f3a-0a1b2c3d4e5f",
    label: "timing config",
    exactLength: TMG_WIRE_LENS, // 8 + 2 * 44 = 96, fixed
  },
} as const satisfies Record<string, ConfigService>;

export type ConfigKey = keyof typeof CONFIG_SERVICES;

/** Everything requestDevice() must be told about up front, or access is denied. */
export const ALL_SERVICES: string[] = [
  RPC_SERVICE,
  ...Object.values(CONFIG_SERVICES).map((s) => s.service),
];
