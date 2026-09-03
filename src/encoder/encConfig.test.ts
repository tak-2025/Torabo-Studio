/**
 * Tests for the encoder wire codec, per encConfig.ts's own header comment
 * (torabo-tsuki_ext_FW/encoder/include/zmk_encoder_config/config.h — no
 * separate markdown design doc exists for this feature in this workspace,
 * unlike timing/trackpad/trackball/combos/macros): header(4B) = magic
 * u16(0x6e65), version u8, layerCount u8; per layer: cw/ccw/btn bindings (4B
 * each: behavior u8, mods u8, param u16 LE).
 */
import { describe, it, expect } from "vitest";
import {
  ENC_MAGIC,
  ENC_VERSION,
  ENC_HDR,
  ENC_BIND,
  ENC_LAYER,
  EncBehavior,
  EncMod,
  HID,
  NONE_BIND,
  ENC_PRESETS,
  decodeEnc,
  encodeEnc,
  encWireLen,
  bindActive,
  presetIdFor,
  type EncConfig,
} from "./encConfig";

describe("encConfig wire constants", () => {
  it("matches the documented header", () => {
    expect(ENC_MAGIC).toBe(0x6e65);
    expect(ENC_HDR).toBe(4);
    expect(ENC_BIND).toBe(4);
    expect(ENC_LAYER).toBe(12); // cw + ccw + btn
  });
});

describe("decodeEnc: golden bytes", () => {
  it("decodes a single layer built by hand", () => {
    const buf = new Uint8Array(ENC_HDR + ENC_LAYER);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, ENC_MAGIC, true);
    dv.setUint8(2, ENC_VERSION);
    dv.setUint8(3, 1);
    // cw: Kp, mods=0, param=4
    dv.setUint8(4, EncBehavior.Kp);
    dv.setUint8(5, 0);
    dv.setUint16(6, 4, true);
    // ccw: Cp, mods=0, param=C_VOL_DN
    dv.setUint8(8, EncBehavior.Cp);
    dv.setUint8(9, 0);
    dv.setUint16(10, HID.C_VOL_DN, true);
    // btn: None
    dv.setUint8(12, EncBehavior.None);
    dv.setUint8(13, 0);
    dv.setUint16(14, 0, true);

    const cfg = decodeEnc(buf);
    expect(cfg.layers).toHaveLength(1);
    expect(cfg.layers[0]).toEqual({
      cw: { behavior: EncBehavior.Kp, mods: 0, param: 4 },
      ccw: { behavior: EncBehavior.Cp, mods: 0, param: HID.C_VOL_DN },
      btn: { behavior: EncBehavior.None, mods: 0, param: 0 },
    });
  });

  it("drops an out-of-range behavior byte to None rather than misinterpreting it", () => {
    const buf = new Uint8Array(ENC_HDR + ENC_LAYER);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, ENC_MAGIC, true);
    dv.setUint8(2, ENC_VERSION);
    dv.setUint8(3, 1);
    dv.setUint8(4, 0xaa); // bogus cw behavior
    const cfg = decodeEnc(buf);
    expect(cfg.layers[0].cw.behavior).toBe(EncBehavior.None);
  });

  it("throws on a bad magic, bad version, and truncated buffer", () => {
    const good = new Uint8Array(ENC_HDR + ENC_LAYER);
    new DataView(good.buffer).setUint16(0, ENC_MAGIC, true);
    good[2] = ENC_VERSION;
    good[3] = 1;

    const badMagic = good.slice();
    new DataView(badMagic.buffer).setUint16(0, 0x1111, true);
    expect(() => decodeEnc(badMagic)).toThrow();

    const badVersion = good.slice();
    badVersion[2] = 9;
    expect(() => decodeEnc(badVersion)).toThrow();

    const truncated = good.slice(0, ENC_HDR + ENC_LAYER - 1);
    expect(() => decodeEnc(truncated)).toThrow();

    expect(() => decodeEnc(new Uint8Array(2))).toThrow();
  });
});

describe("encWireLen / encodeEnc / decodeEnc round-trip", () => {
  it("encWireLen matches header + layerCount*ENC_LAYER", () => {
    expect(encWireLen(3)).toBe(ENC_HDR + 3 * ENC_LAYER);
  });

  it("round-trips a multi-layer config", () => {
    const cfg: EncConfig = {
      layers: [
        {
          cw: { behavior: EncBehavior.Kp, mods: EncMod.LCTL, param: 0x2e },
          ccw: { behavior: EncBehavior.Kp, mods: EncMod.LCTL, param: 0x2d },
          btn: NONE_BIND,
        },
        {
          cw: { behavior: EncBehavior.Mo, mods: 0, param: 2 },
          ccw: { behavior: EncBehavior.To, mods: 0, param: 0 },
          btn: { behavior: EncBehavior.Tog, mods: 0, param: 1 },
        },
      ],
    };
    const encoded = encodeEnc(cfg);
    expect(encoded.byteLength).toBe(encWireLen(2));
    expect(decodeEnc(encoded)).toEqual(cfg);
  });
});

describe("bindActive / presetIdFor", () => {
  it("bindActive is false for NONE_BIND/undefined and true for a real binding", () => {
    expect(bindActive(NONE_BIND)).toBe(false);
    expect(bindActive(undefined)).toBe(false);
    expect(bindActive({ behavior: EncBehavior.Kp, mods: 0, param: 4 })).toBe(true);
  });

  it("presetIdFor matches a known preset pair and returns null otherwise", () => {
    const volume = ENC_PRESETS.find((p) => p.id === "volume")!;
    expect(presetIdFor(volume.cw, volume.ccw)).toBe("volume");
    expect(presetIdFor(NONE_BIND, NONE_BIND)).toBeNull();
  });
});
