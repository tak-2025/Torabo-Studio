/**
 * Tests for the dynamic-combo wire codec. Golden bytes follow
 * torabo-tsuki_ext_FW/docs/DESIGN-combos.md §4.2 (per-slot layout, 26 bytes:
 * enabled u8, position_count u8, positions u8[6], layer_mask u32, timeout_ms
 * u16, require_prior_idle_ms u16, flags u8, target_type u8, target_param1
 * u32, target_param2 u32 — all little-endian) and §4.3/§4.4 (READ/WRITE
 * headers). The per-field offsets are computed here from that layout, not
 * imported from comboConfig.ts (its W_* offset constants aren't exported).
 */
import { describe, it, expect } from "vitest";
import {
  CB_MAGIC,
  CB_VERSION,
  CB_SLOTS,
  CB_MAX_POS,
  CB_FLAG_SLOW_RELEASE,
  CB_TARGET_MAX,
  ComboTarget,
  emptySlot,
  emptyComboConfig,
  decodeCombos,
  encodeSlot,
  type ComboSlot,
} from "./comboConfig";

const READ_HDR = 4;
const WIRE_SLOT = 26; // DESIGN-combos.md §4.2

// Offsets per DESIGN-combos.md §4.2, independent of comboConfig.ts internals.
const OFF = {
  enabled: 0,
  posCount: 1,
  positions: 2, // 6 bytes
  layerMask: 8,
  timeout: 12,
  priorIdle: 14,
  flags: 16,
  targetType: 17,
  param1: 18,
  param2: 22,
} as const;

function writeSlotBody(dv: DataView, base: number, slot: ComboSlot) {
  dv.setUint8(base + OFF.enabled, slot.enabled ? 1 : 0);
  dv.setUint8(base + OFF.posCount, slot.positions.length);
  slot.positions.forEach((p, i) => dv.setUint8(base + OFF.positions + i, p));
  dv.setUint32(base + OFF.layerMask, slot.layerMask >>> 0, true);
  dv.setUint16(base + OFF.timeout, slot.timeoutMs, true);
  dv.setUint16(base + OFF.priorIdle, slot.priorIdleMs, true);
  dv.setUint8(base + OFF.flags, slot.slowRelease ? CB_FLAG_SLOW_RELEASE : 0);
  dv.setUint8(base + OFF.targetType, slot.targetType);
  dv.setUint32(base + OFF.param1, slot.param1 >>> 0, true);
  dv.setUint32(base + OFF.param2, slot.param2 >>> 0, true);
}

function buildReadBlob(slotCount: number, filled: Record<number, ComboSlot>): Uint8Array {
  const buf = new Uint8Array(READ_HDR + slotCount * WIRE_SLOT);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, CB_MAGIC, true);
  dv.setUint8(2, CB_VERSION);
  dv.setUint8(3, slotCount);
  for (const [idxStr, slot] of Object.entries(filled)) {
    const idx = Number(idxStr);
    writeSlotBody(dv, READ_HDR + idx * WIRE_SLOT, slot);
  }
  return buf;
}

describe("comboConfig wire constants", () => {
  it("match DESIGN-combos.md §4.1", () => {
    expect(CB_MAGIC).toBe(0x6263);
    expect(CB_VERSION).toBe(1);
    expect(CB_SLOTS).toBe(16);
    expect(CB_MAX_POS).toBe(6);
  });
});

describe("decodeCombos", () => {
  it("decodes a header-only blob into CB_SLOTS disabled slots", () => {
    const cfg = decodeCombos(buildReadBlob(0, {}));
    expect(cfg.slots).toHaveLength(CB_SLOTS);
    expect(cfg.slots.every((s) => !s.enabled && s.positions.length === 0)).toBe(true);
  });

  it("decodes every target type at the full slot count (DESIGN §4.3 total = 420 bytes)", () => {
    const kp: ComboSlot = {
      enabled: true,
      positions: [10, 20],
      layerMask: 0x00000003,
      timeoutMs: 1500,
      priorIdleMs: 100,
      slowRelease: true,
      targetType: ComboTarget.KeyPress,
      param1: 0x00070004,
      param2: 0,
    };
    const mo: ComboSlot = { ...emptySlot(), enabled: true, targetType: ComboTarget.MomentaryLayer, param1: 3 };
    const to: ComboSlot = { ...emptySlot(), enabled: true, targetType: ComboTarget.ToLayer, param1: 2 };
    const tog: ComboSlot = { ...emptySlot(), enabled: true, targetType: ComboTarget.ToggleLayer, param1: 5 };
    const dmac: ComboSlot = { ...emptySlot(), enabled: true, targetType: ComboTarget.DynamicMacro, param1: 7 };

    const blob = buildReadBlob(CB_SLOTS, { 0: kp, 1: mo, 2: to, 3: tog, 4: dmac });
    expect(blob.byteLength).toBe(420);

    const cfg = decodeCombos(blob);
    expect(cfg.slots).toHaveLength(CB_SLOTS);
    expect(cfg.slots[0]).toEqual(kp);
    expect(cfg.slots[1]).toEqual(mo);
    expect(cfg.slots[2]).toEqual(to);
    expect(cfg.slots[3]).toEqual(tog);
    expect(cfg.slots[4]).toEqual(dmac);
    // Slots decoded from all-zero wire bytes, NOT the JS-side emptySlot()
    // default: the wire has no "50ms default timeout" concept, so a
    // zero-filled slot decodes to timeoutMs 0, not emptySlot()'s 50.
    expect(cfg.slots[5]).toEqual({
      enabled: false,
      positions: [],
      layerMask: 0,
      timeoutMs: 0,
      priorIdleMs: 0,
      slowRelease: false,
      targetType: ComboTarget.KeyPress,
      param1: 0,
      param2: 0,
    });
  });

  it("clamps an out-of-range target_type byte to KeyPress", () => {
    expect(CB_TARGET_MAX).toBe(ComboTarget.DynamicMacro);
    const blob = buildReadBlob(1, {});
    new DataView(blob.buffer).setUint8(READ_HDR + OFF.targetType, 99);
    const cfg = decodeCombos(blob);
    expect(cfg.slots[0].targetType).toBe(ComboTarget.KeyPress);
  });

  it("clamps position_count to CB_MAX_POS", () => {
    const blob = buildReadBlob(1, {});
    new DataView(blob.buffer).setUint8(READ_HDR + OFF.posCount, 0xff);
    const cfg = decodeCombos(blob);
    expect(cfg.slots[0].positions).toHaveLength(CB_MAX_POS);
  });

  it("throws on a buffer shorter than the 4-byte header", () => {
    expect(() => decodeCombos(new Uint8Array(2))).toThrow();
  });

  it("throws on a bad magic", () => {
    const blob = buildReadBlob(0, {});
    new DataView(blob.buffer).setUint16(0, 0xdead, true);
    expect(() => decodeCombos(blob)).toThrow(/magic/i);
  });

  it("throws on an unsupported version", () => {
    const blob = buildReadBlob(0, {});
    new DataView(blob.buffer).setUint8(2, 9);
    expect(() => decodeCombos(blob)).toThrow(/version/i);
  });
});

describe("encodeSlot", () => {
  it("encodes the WRITE layout per DESIGN-combos.md §4.4 (version, slot, 26B body)", () => {
    const slot: ComboSlot = {
      enabled: true,
      positions: [1, 2, 3],
      layerMask: 0x0000000f,
      timeoutMs: 250,
      priorIdleMs: 60,
      slowRelease: true,
      targetType: ComboTarget.DynamicMacro,
      param1: 9,
      param2: 0,
    };
    const buf = encodeSlot(4, slot);
    expect(buf.byteLength).toBe(2 + WIRE_SLOT);
    const dv = new DataView(buf.buffer);
    expect(dv.getUint8(0)).toBe(CB_VERSION);
    expect(dv.getUint8(1)).toBe(4);

    const base = 2;
    expect(dv.getUint8(base + OFF.enabled)).toBe(1);
    expect(dv.getUint8(base + OFF.posCount)).toBe(3);
    expect([0, 1, 2].map((i) => dv.getUint8(base + OFF.positions + i))).toEqual([1, 2, 3]);
    expect(dv.getUint32(base + OFF.layerMask, true)).toBe(0x0000000f);
    expect(dv.getUint16(base + OFF.timeout, true)).toBe(250);
    expect(dv.getUint16(base + OFF.priorIdle, true)).toBe(60);
    expect(dv.getUint8(base + OFF.flags)).toBe(CB_FLAG_SLOW_RELEASE);
    expect(dv.getUint8(base + OFF.targetType)).toBe(ComboTarget.DynamicMacro);
    expect(dv.getUint32(base + OFF.param1, true)).toBe(9);
    expect(dv.getUint32(base + OFF.param2, true)).toBe(0);
  });

  it("truncates positions beyond CB_MAX_POS", () => {
    const slot: ComboSlot = { ...emptySlot(), positions: [1, 2, 3, 4, 5, 6, 7, 8] };
    const buf = encodeSlot(0, slot);
    const dv = new DataView(buf.buffer);
    expect(dv.getUint8(2 + OFF.posCount)).toBe(CB_MAX_POS);
  });

  it("round-trips through a READ blob: decode -> encode reproduces the identical 26B body", () => {
    const slot: ComboSlot = {
      enabled: true,
      positions: [4, 5],
      layerMask: 0x00000001,
      timeoutMs: 80,
      priorIdleMs: 0,
      slowRelease: false,
      targetType: ComboTarget.ToLayer,
      param1: 1,
      param2: 0,
    };
    const blob = buildReadBlob(9, { 8: slot });
    const decoded = decodeCombos(blob).slots[8];
    expect(decoded).toEqual(slot);

    const rewritten = encodeSlot(8, decoded);
    const expectedBody = blob.slice(READ_HDR + 8 * WIRE_SLOT, READ_HDR + 9 * WIRE_SLOT);
    expect(rewritten.slice(2)).toEqual(expectedBody);
  });
});

describe("emptyComboConfig", () => {
  it("provides exactly CB_SLOTS empty slots", () => {
    const cfg = emptyComboConfig();
    expect(cfg.slots).toHaveLength(CB_SLOTS);
    expect(cfg.slots[0]).toEqual(emptySlot());
  });
});
