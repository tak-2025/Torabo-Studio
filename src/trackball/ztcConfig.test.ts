/**
 * Tests for the v2/v3 trackball wire codec. The v2 golden bytes reproduce the
 * default layer table from torabo-tsuki_ext_FW/docs/DESIGN-trackball.md §4
 * ("既定値（＝現状の挙動を完全再現）") using the FINAL field order from that
 * same doc's §11.E ("ワイヤ並び替え" — header fields all precede layers[],
 * which supersedes the earlier, mid-document §4 pseudo-struct that listed
 * layers before temp_target; §11.E says explicitly "本節を優先"). That table
 * is also cross-checked against §12 Lens3's own byte count ("4層＝56B").
 *
 * ztcConfig.ts's own header comment documents the v3 coast trailer (this
 * workspace has no separate FW design doc section for it) — used as the spec
 * source for the v3 golden bytes below, noted as a TODO.
 *
 * Offsets used here (ZTC_HDR, ZTC_LAYER, ZTC_COAST) are exported wire-layout
 * constants — legitimate for any external consumer to use for byte
 * placement, same as tpConfigV2's. The internal per-field byte positions
 * within a header/layer/trailer are transcribed from the design doc as plain
 * numeric offsets, not imported.
 */
import { describe, it, expect } from "vitest";
import {
  ZTC_MAGIC,
  ZTC_VERSION_V2,
  ZTC_VERSION_V3,
  ZTC_HDR,
  ZTC_LAYER,
  ZTC_COAST,
  ZTC_COAST_FRICTION_MAX,
  ZTC_COAST_FRICTION_DEFAULT,
  ZTC_COAST_THRESHOLD_MAX,
  ZTC_COAST_THRESHOLD_DEFAULT,
  Role,
  decodeZtc,
  encodeZtc,
  defaultCoast,
  clampCoastFriction,
  clampCoastThreshold,
  type ZtcConfig,
} from "./ztcConfig";

// Per DESIGN-trackball.md §11.E field order and §4.2's ztc_layer struct.
const H_TEMP_TARGET = 4;
const H_TEMP_TIMEOUT = 6;
const L_X = 0; // role, dir, speed, _rsv (4B)
const L_Y = 4;
const L_TEMP_ENABLE = 8;

describe("ztcConfig wire constants", () => {
  it("match DESIGN-trackball.md", () => {
    expect(ZTC_MAGIC).toBe(0x7a74);
    expect(ZTC_HDR).toBe(8);
    expect(ZTC_LAYER).toBe(12);
    expect(ZTC_COAST).toBe(4);
  });
});

describe("decodeZtc: DESIGN-trackball.md §4 default table (4 layers, golden bytes)", () => {
  const buf = new Uint8Array(ZTC_HDR + 4 * ZTC_LAYER);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, ZTC_MAGIC, true);
  dv.setUint8(2, ZTC_VERSION_V2);
  dv.setUint8(3, 4); // layer_count
  dv.setUint8(H_TEMP_TARGET, 1);
  dv.setUint16(H_TEMP_TIMEOUT, 500, true);

  function writeLayer(idx: number, x: [number, number, number], y: [number, number, number], tempEnable: boolean) {
    const o = ZTC_HDR + idx * ZTC_LAYER;
    dv.setUint8(o + L_X, x[0]);
    dv.setUint8(o + L_X + 1, x[1]);
    dv.setUint8(o + L_X + 2, x[2]);
    dv.setUint8(o + L_Y, y[0]);
    dv.setUint8(o + L_Y + 1, y[1]);
    dv.setUint8(o + L_Y + 2, y[2]);
    dv.setUint8(o + L_TEMP_ENABLE, tempEnable ? 1 : 0);
  }

  // layer 0,1: MOVE/reverse/1 both axes, temp_enable ON
  writeLayer(0, [Role.Move, 1, 1], [Role.Move, 1, 1], true);
  writeLayer(1, [Role.Move, 1, 1], [Role.Move, 1, 1], true);
  // layer 2: SCROLL(horizontal)/reverse/8 X, OFF Y, temp_enable OFF
  writeLayer(2, [Role.Scroll, 1, 8], [Role.Off, 0, 1], false);
  // layer 3: OFF X, SCROLL(vertical)/normal/8 Y, temp_enable OFF
  writeLayer(3, [Role.Off, 0, 1], [Role.Scroll, 0, 8], false);

  it("is exactly 56 bytes, matching DESIGN-trackball.md §12 Lens3", () => {
    expect(buf.byteLength).toBe(56);
  });

  it("decodes to the documented default table", () => {
    const cfg = decodeZtc(buf);
    expect(cfg.hasCoast).toBe(false);
    expect(cfg.coast).toEqual(defaultCoast());
    expect(cfg.tempTarget).toBe(1);
    expect(cfg.tempTimeoutMs).toBe(500);
    expect(cfg.layers).toEqual([
      { x: { role: Role.Move, reverse: true, speedDiv: 1 }, y: { role: Role.Move, reverse: true, speedDiv: 1 }, tempEnable: true },
      { x: { role: Role.Move, reverse: true, speedDiv: 1 }, y: { role: Role.Move, reverse: true, speedDiv: 1 }, tempEnable: true },
      { x: { role: Role.Scroll, reverse: true, speedDiv: 8 }, y: { role: Role.Off, reverse: false, speedDiv: 1 }, tempEnable: false },
      { x: { role: Role.Off, reverse: false, speedDiv: 1 }, y: { role: Role.Scroll, reverse: false, speedDiv: 8 }, tempEnable: false },
    ]);
  });

  it("encodeZtc(decode(golden)) reproduces the golden buffer byte-for-byte", () => {
    const cfg = decodeZtc(buf);
    expect(encodeZtc(cfg)).toEqual(buf);
  });
});

describe("decodeZtc: v3 coast trailer", () => {
  it("decodes the trailer per ztcConfig.ts's own header comment (no separate FW doc found)", () => {
    // TODO: this workspace has no standalone design-doc section for the
    // trackball's v3 "coast" trailer (DESIGN-trackball.md predates it) — the
    // golden bytes below are only cross-checked against ztcConfig.ts's own
    // header comment, not an independent spec document.
    const buf = new Uint8Array(ZTC_HDR + 1 * ZTC_LAYER + ZTC_COAST);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, ZTC_MAGIC, true);
    dv.setUint8(2, ZTC_VERSION_V3);
    dv.setUint8(3, 1);
    dv.setUint8(H_TEMP_TARGET, 2);
    dv.setUint16(H_TEMP_TIMEOUT, 750, true);
    const lo = ZTC_HDR;
    dv.setUint8(lo + L_X, Role.Scroll);
    dv.setUint8(lo + L_X + 1, 0);
    dv.setUint8(lo + L_X + 2, 4);
    dv.setUint8(lo + L_Y, Role.Move);
    dv.setUint8(lo + L_Y + 1, 1);
    dv.setUint8(lo + L_Y + 2, 2);
    dv.setUint8(lo + L_TEMP_ENABLE, 0);
    const co = ZTC_HDR + ZTC_LAYER;
    dv.setUint8(co + 0, 1); // enable
    dv.setUint8(co + 1, 12); // friction
    dv.setUint8(co + 2, 40); // threshold

    const cfg = decodeZtc(buf);
    expect(cfg.hasCoast).toBe(true);
    expect(cfg.coast).toEqual({ enable: true, friction: 12, threshold: 40 });
    expect(encodeZtc(cfg)).toEqual(buf);
  });

  it("clamps an unset (0) friction/threshold byte to the documented default, not 0", () => {
    const buf = new Uint8Array(ZTC_HDR + ZTC_COAST);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, ZTC_MAGIC, true);
    dv.setUint8(2, ZTC_VERSION_V3);
    dv.setUint8(3, 0);
    const co = ZTC_HDR;
    dv.setUint8(co, 1);
    dv.setUint8(co + 1, 0); // friction unset
    dv.setUint8(co + 2, 0); // threshold unset
    const cfg = decodeZtc(buf);
    expect(cfg.coast.friction).toBe(ZTC_COAST_FRICTION_DEFAULT);
    expect(cfg.coast.threshold).toBe(ZTC_COAST_THRESHOLD_DEFAULT);
  });
});

describe("encodeZtc / decodeZtc round-trip", () => {
  it("round-trips an arbitrary config (encode -> decode values match)", () => {
    const cfg: ZtcConfig = {
      layers: [
        { x: { role: Role.Move, reverse: false, speedDiv: 5 }, y: { role: Role.Scroll, reverse: true, speedDiv: 12 }, tempEnable: true },
        { x: { role: Role.Off, reverse: false, speedDiv: 1 }, y: { role: Role.Off, reverse: false, speedDiv: 1 }, tempEnable: false },
      ],
      tempTarget: 3,
      tempTimeoutMs: 1200,
      coast: { enable: true, friction: 20, threshold: 200 },
      hasCoast: true,
    };
    expect(decodeZtc(encodeZtc(cfg))).toEqual(cfg);
  });

  it("emits version 2 when hasCoast is false and drops the trailer", () => {
    const cfg: ZtcConfig = {
      layers: [{ x: { role: Role.Move, reverse: false, speedDiv: 1 }, y: { role: Role.Move, reverse: false, speedDiv: 1 }, tempEnable: false }],
      tempTarget: 1,
      tempTimeoutMs: 500,
      coast: defaultCoast(),
      hasCoast: false,
    };
    const encoded = encodeZtc(cfg);
    expect(encoded.byteLength).toBe(ZTC_HDR + ZTC_LAYER);
    expect(new DataView(encoded.buffer).getUint8(2)).toBe(ZTC_VERSION_V2);
  });
});

describe("error handling", () => {
  it("throws on a bad magic", () => {
    const buf = new Uint8Array(ZTC_HDR);
    new DataView(buf.buffer).setUint16(0, 0xabcd, true);
    expect(() => decodeZtc(buf)).toThrow();
  });

  it("throws on an unsupported version", () => {
    const buf = new Uint8Array(ZTC_HDR);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, ZTC_MAGIC, true);
    dv.setUint8(2, 7);
    expect(() => decodeZtc(buf)).toThrow();
  });

  it("throws when the body length isn't a whole number of layers", () => {
    const buf = new Uint8Array(ZTC_HDR + ZTC_LAYER + 3); // 3 stray bytes
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, ZTC_MAGIC, true);
    dv.setUint8(2, ZTC_VERSION_V2);
    expect(() => decodeZtc(buf)).toThrow();
  });

  it("throws on a buffer shorter than the 8-byte header", () => {
    expect(() => decodeZtc(new Uint8Array(7))).toThrow();
  });
});

describe("coast clamps", () => {
  it("clampCoastFriction/Threshold cap at their documented maxima", () => {
    expect(clampCoastFriction(999)).toBe(ZTC_COAST_FRICTION_MAX);
    expect(clampCoastThreshold(999)).toBe(ZTC_COAST_THRESHOLD_MAX);
  });

  it("clampCoastFriction/Threshold fall back to the default when unset (<=0)", () => {
    expect(clampCoastFriction(0)).toBe(ZTC_COAST_FRICTION_DEFAULT);
    expect(clampCoastThreshold(0)).toBe(ZTC_COAST_THRESHOLD_DEFAULT);
  });
});
