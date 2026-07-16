/**
 * Codec for the dynamic-macro wire. MUST match the firmware
 * (zmk-feature-dynamic-keymap/include/zmk_dynamic_keymap/dmac.h). Little-endian.
 *
 * READ (all slots): magic u16(0x6d64), version u8(1), slot_count u8, then
 *   slot_count slots, each: used_len u8 + DM_STEPS * { action u8, keycode u32 }.
 * WRITE (one slot): version u8, slot u8, used_len u8, used_len * { action, kc }.
 */

export const DM_MAGIC = 0x6d64;
export const DM_VERSION = 1;
export const DM_SLOTS = 20;
export const DM_STEPS = 16;

const STEP = 5; // action u8 + keycode u32
const READ_HDR = 4;
const READ_SLOT = 1 + DM_STEPS * STEP;

export enum DmAction {
  Tap = 0,
  Press = 1,
  Release = 2,
}

export interface DmStep {
  action: DmAction;
  keycode: number; // full ZMK usage: page<<16 | id, implicit mods in bits 24-31
}

export interface DmSlot {
  steps: DmStep[]; // up to DM_STEPS
}

export interface DmConfig {
  slots: DmSlot[]; // exactly DM_SLOTS entries (padded with empty)
}

function actionOf(v: number): DmAction {
  return v === DmAction.Press || v === DmAction.Release ? v : DmAction.Tap;
}

export function decodeDmac(bytes: Uint8Array): DmConfig {
  if (bytes.length < READ_HDR) {
    throw new Error(`dynamic-macro config too short (${bytes.length} bytes)`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== DM_MAGIC) {
    throw new Error(`Bad dynamic-macro magic 0x${magic.toString(16)} (fw/app mismatch)`);
  }
  const version = dv.getUint8(2);
  if (version !== DM_VERSION) {
    throw new Error(`Unsupported dynamic-macro version ${version} (expected ${DM_VERSION})`);
  }
  const slotCount = dv.getUint8(3);

  const slots: DmSlot[] = [];
  for (let k = 0; k < slotCount; k++) {
    const base = READ_HDR + k * READ_SLOT;
    if (base + 1 > bytes.length) break;
    const used = Math.min(dv.getUint8(base), DM_STEPS);
    const steps: DmStep[] = [];
    for (let i = 0; i < used; i++) {
      const o = base + 1 + i * STEP;
      if (o + STEP > bytes.length) break;
      steps.push({ action: actionOf(dv.getUint8(o)), keycode: dv.getUint32(o + 1, true) });
    }
    slots.push({ steps });
  }
  // pad to DM_SLOTS so the UI always has a fixed grid
  while (slots.length < DM_SLOTS) slots.push({ steps: [] });
  return { slots };
}

/** Encode a single slot for a WRITE. */
export function encodeSlot(slotIndex: number, steps: DmStep[]): Uint8Array {
  const used = Math.min(steps.length, DM_STEPS);
  const buf = new Uint8Array(3 + used * STEP);
  const dv = new DataView(buf.buffer);
  dv.setUint8(0, DM_VERSION);
  dv.setUint8(1, slotIndex & 0xff);
  dv.setUint8(2, used);
  for (let i = 0; i < used; i++) {
    const o = 3 + i * STEP;
    dv.setUint8(o, steps[i].action & 0xff);
    dv.setUint32(o + 1, steps[i].keycode >>> 0, true);
  }
  return buf;
}

/* ---- keycode <-> {base usage, modifier bits} helpers (for the UI) -------- */

export const MOD_LCTL = 0x01;
export const MOD_LSFT = 0x02;
export const MOD_LALT = 0x04;
export const MOD_LGUI = 0x08;

/** Split a keycode into its base usage and implicit-modifier bits (24..31). */
export function splitKeycode(keycode: number): { base: number; mods: number } {
  return { base: keycode & 0x00ffffff, mods: (keycode >>> 24) & 0xff };
}

/** Combine a base usage and modifier bits back into a keycode. */
export function makeKeycode(base: number, mods: number): number {
  return ((base & 0x00ffffff) | ((mods & 0xff) << 24)) >>> 0;
}
