/**
 * Codec for the dynamic-combo wire. MUST match the firmware
 * (torabo-tsuki_ext_FW/combos/include/zmk_dynamic_keymap/dcombo.h). Little-endian,
 * explicit byte offsets.
 *
 * READ (all slots): magic u16(0x6263 "cb"), version u8(1), slot_count u8, then
 *   slot_count slots, each 26 bytes (see offsets below).
 * WRITE (one slot): version u8(1), slot u8, then the same 26-byte slot.
 */

export const CB_MAGIC = 0x6263;
export const CB_VERSION = 1;
export const CB_SLOTS = 16;
export const CB_MAX_POS = 6;

/* per-slot wire offsets (must match dcombo.h CB_W_*) */
const W_ENABLED = 0;
const W_POS_COUNT = 1;
const W_POSITIONS = 2;
const W_LAYER_MASK = 8;
const W_TIMEOUT = 12;
const W_PRIOR_IDLE = 14;
const W_FLAGS = 16;
const W_TGT_TYPE = 17;
const W_TGT_P1 = 18;
const W_TGT_P2 = 22;
const WIRE_SLOT = 26;

const READ_HDR = 4;
const WRITE_HDR = 2;

export const CB_FLAG_SLOW_RELEASE = 0x01;

export enum ComboTarget {
  KeyPress = 0, // param1 = ZMK keycode (page<<16 | id, implicit mods 24..31)
  MomentaryLayer = 1, // param1 = layer
  ToLayer = 2, // param1 = layer
  ToggleLayer = 3, // param1 = layer
  DynamicMacro = 4, // param1 = macro slot
}

export const CB_TARGET_MAX = ComboTarget.DynamicMacro;

export interface ComboSlot {
  enabled: boolean;
  positions: number[]; // key positions, up to CB_MAX_POS
  layerMask: number; // 0 = all layers, else OR of (1<<layer)
  timeoutMs: number;
  priorIdleMs: number;
  slowRelease: boolean;
  targetType: ComboTarget;
  param1: number;
  param2: number;
}

export interface ComboConfig {
  slots: ComboSlot[]; // exactly CB_SLOTS entries (padded)
}

export function emptySlot(): ComboSlot {
  return {
    enabled: false,
    positions: [],
    layerMask: 0,
    timeoutMs: 50,
    priorIdleMs: 0,
    slowRelease: false,
    targetType: ComboTarget.KeyPress,
    param1: 0,
    param2: 0,
  };
}

export function emptyComboConfig(): ComboConfig {
  return { slots: Array.from({ length: CB_SLOTS }, emptySlot) };
}

function targetOf(v: number): ComboTarget {
  return v >= 0 && v <= CB_TARGET_MAX ? (v as ComboTarget) : ComboTarget.KeyPress;
}

function decodeSlot(dv: DataView, base: number): ComboSlot {
  const posCount = Math.min(dv.getUint8(base + W_POS_COUNT), CB_MAX_POS);
  const positions: number[] = [];
  for (let i = 0; i < posCount; i++) {
    positions.push(dv.getUint8(base + W_POSITIONS + i));
  }
  const flags = dv.getUint8(base + W_FLAGS);
  return {
    enabled: dv.getUint8(base + W_ENABLED) !== 0,
    positions,
    layerMask: dv.getUint32(base + W_LAYER_MASK, true),
    timeoutMs: dv.getUint16(base + W_TIMEOUT, true),
    priorIdleMs: dv.getUint16(base + W_PRIOR_IDLE, true),
    slowRelease: (flags & CB_FLAG_SLOW_RELEASE) !== 0,
    targetType: targetOf(dv.getUint8(base + W_TGT_TYPE)),
    param1: dv.getUint32(base + W_TGT_P1, true),
    param2: dv.getUint32(base + W_TGT_P2, true),
  };
}

export function decodeCombos(bytes: Uint8Array): ComboConfig {
  if (bytes.length < READ_HDR) {
    throw new Error(`combo config too short (${bytes.length} bytes)`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== CB_MAGIC) {
    throw new Error(`Bad combo magic 0x${magic.toString(16)} (fw/app mismatch)`);
  }
  const version = dv.getUint8(2);
  if (version !== CB_VERSION) {
    throw new Error(`Unsupported combo version ${version} (expected ${CB_VERSION})`);
  }
  const slotCount = dv.getUint8(3);

  const slots: ComboSlot[] = [];
  for (let k = 0; k < slotCount; k++) {
    const base = READ_HDR + k * WIRE_SLOT;
    if (base + WIRE_SLOT > bytes.length) break;
    slots.push(decodeSlot(dv, base));
  }
  while (slots.length < CB_SLOTS) slots.push(emptySlot());
  return { slots };
}

/** Encode a single slot for a WRITE (version, slot, 26-byte slot). */
export function encodeSlot(slotIndex: number, slot: ComboSlot): Uint8Array {
  const buf = new Uint8Array(WRITE_HDR + WIRE_SLOT);
  const dv = new DataView(buf.buffer);
  dv.setUint8(0, CB_VERSION);
  dv.setUint8(1, slotIndex & 0xff);

  const base = WRITE_HDR;
  const positions = slot.positions.slice(0, CB_MAX_POS);
  dv.setUint8(base + W_ENABLED, slot.enabled ? 1 : 0);
  dv.setUint8(base + W_POS_COUNT, positions.length);
  for (let i = 0; i < positions.length; i++) {
    dv.setUint8(base + W_POSITIONS + i, positions[i] & 0xff);
  }
  dv.setUint32(base + W_LAYER_MASK, slot.layerMask >>> 0, true);
  dv.setUint16(base + W_TIMEOUT, slot.timeoutMs & 0xffff, true);
  dv.setUint16(base + W_PRIOR_IDLE, slot.priorIdleMs & 0xffff, true);
  dv.setUint8(base + W_FLAGS, slot.slowRelease ? CB_FLAG_SLOW_RELEASE : 0);
  dv.setUint8(base + W_TGT_TYPE, slot.targetType & 0xff);
  dv.setUint32(base + W_TGT_P1, slot.param1 >>> 0, true);
  dv.setUint32(base + W_TGT_P2, slot.param2 >>> 0, true);
  return buf;
}

/* ---- keycode <-> {base usage, modifier bits} helpers (shared w/ macros) --- */
export const MOD_LCTL = 0x01;
export const MOD_LSFT = 0x02;
export const MOD_LALT = 0x04;
export const MOD_LGUI = 0x08;

export function splitKeycode(keycode: number): { base: number; mods: number } {
  return { base: keycode & 0x00ffffff, mods: (keycode >>> 24) & 0xff };
}

export function makeKeycode(base: number, mods: number): number {
  return ((base & 0x00ffffff) | ((mods & 0xff) << 24)) >>> 0;
}
