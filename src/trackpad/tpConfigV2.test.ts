/**
 * Tests for the v1/v2/v3 trackpad wire codec. v2 golden bytes follow
 * torabo-tsuki_ext_FW/docs/DESIGN-trackpad-v2.md §3 ("wire protocol v2"):
 * header(6B) = magic u16(0x7470), version u8, device_count u8, layer_count
 * u8, flags u8; per device: device_id u8, _rsv/meta u8, then per layer axis
 * x/y (11B each: role,dir,step,bind_pos(4B),bind_neg(4B)) and, if flags bit0,
 * a 12B gesture block {tap,tap2,hold} — this module additionally carries a
 * 4th `dtap` binding (see its own header comment / DESIGN §8 "gesture
 * 12B→16B"), which is exercised below too. v3's coast trailer is documented
 * only in tpConfigV2.ts's own header comment (no separate FW design doc was
 * found in this workspace) — see the TODO below.
 *
 * The offset constants used here (TP_HDR, TP_DEV_HDR*, TP_AXIS, TP_BIND,
 * TP_GEST, TP_AXIS_V1, TP_LAYER_V1) ARE part of the module's public wire
 * contract (exported for exactly this kind of external construction), so
 * using them to lay out bytes is the same thing any other consumer of the
 * wire (e.g. the Rust/Tauri backend) would do — it is the VALUES placed at
 * those offsets that are independent, hand-picked test data.
 */
import { describe, it, expect } from "vitest";
import {
  TP_MAGIC,
  TP_VERSION_V1,
  TP_VERSION_V2,
  TP_VERSION_V3,
  TP_HDR,
  TP_DEV_HDR,
  TP_AXIS,
  TP_AXIS_V1,
  TP_LAYER_V1,
  TP_FLAG_GESTURES,
  TP_FW_BLOB_MAX,
  TpRole,
  TpBehavior,
  HID,
  NONE_BIND,
  decodeTp,
  encodeTp,
  presetForV1Role,
  defaultCoast,
  tpFirmwareReadbackSize,
  tpReadbackTooBig,
  isPhantomDevice,
  visibleDeviceIndices,
  clampToVisibleDevice,
  type TpConfig,
  type TpBinding,
  type TpAxisCfg,
} from "./tpConfigV2";

function bind(behavior: TpBehavior, param: number, mods = 0): TpBinding {
  return { behavior, mods, param };
}

function writeBind(dv: DataView, o: number, b: TpBinding) {
  dv.setUint8(o, b.behavior);
  dv.setUint8(o + 1, b.mods);
  dv.setUint16(o + 2, b.param, true);
}

function writeAxis(dv: DataView, o: number, a: TpAxisCfg) {
  dv.setUint8(o, a.role);
  dv.setUint8(o + 1, a.reverse ? 1 : 0);
  dv.setUint8(o + 2, a.step);
  writeBind(dv, o + 3, a.pos);
  writeBind(dv, o + 7, a.neg);
}

describe("tpConfigV2 wire constants", () => {
  it("match DESIGN-trackpad-v2.md §3", () => {
    expect(TP_MAGIC).toBe(0x7470);
    expect(TP_HDR).toBe(6);
    expect(TP_DEV_HDR).toBe(2);
    expect(TP_AXIS).toBe(11);
  });
});

describe("decodeTp: v2 golden bytes (no gestures, single device/layer)", () => {
  it("matches the DESIGN-trackpad-v2.md §3 header + axis layout byte-for-byte", () => {
    // 1 device, 1 layer, no gestures: 6 (hdr) + 2 (dev hdr) + 11*2 (x,y) = 30B.
    const buf = new Uint8Array(TP_HDR + TP_DEV_HDR + TP_AXIS * 2);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, TP_MAGIC, true);
    dv.setUint8(2, TP_VERSION_V2);
    dv.setUint8(3, 1); // device_count
    dv.setUint8(4, 1); // layer_count
    dv.setUint8(5, 0); // flags: no gestures

    let o = TP_HDR;
    dv.setUint8(o, 9); // device_id
    dv.setUint8(o + 1, 0); // meta (unknown)
    o += TP_DEV_HDR;
    writeAxis(dv, o, { role: TpRole.Move, reverse: false, step: 3, pos: NONE_BIND, neg: NONE_BIND });
    writeAxis(dv, o + TP_AXIS, { role: TpRole.Scroll, reverse: true, step: 8, pos: NONE_BIND, neg: NONE_BIND });

    expect(buf.byteLength).toBe(30);
    const cfg = decodeTp(buf);
    expect(cfg.layerCount).toBe(1);
    expect(cfg.hasGestures).toBe(false);
    expect(cfg.hasCoast).toBe(false);
    expect(cfg.devices).toHaveLength(1);
    const dev = cfg.devices[0];
    expect(dev.deviceId).toBe(9);
    expect(dev.meta).toBe(0);
    expect(dev.coast).toEqual(defaultCoast());
    expect(dev.layers[0].x).toEqual({ role: TpRole.Move, reverse: false, step: 3, pos: NONE_BIND, neg: NONE_BIND });
    expect(dev.layers[0].y).toEqual({ role: TpRole.Scroll, reverse: true, step: 8, pos: NONE_BIND, neg: NONE_BIND });
  });

  it("normalises an out-of-range role byte to Move and behavior byte to None", () => {
    const buf = new Uint8Array(TP_HDR + TP_DEV_HDR + TP_AXIS * 2);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, TP_MAGIC, true);
    dv.setUint8(2, TP_VERSION_V2);
    dv.setUint8(3, 1);
    dv.setUint8(4, 1);
    dv.setUint8(5, 0);
    const o = TP_HDR + TP_DEV_HDR;
    dv.setUint8(o, 200); // bogus role
    dv.setUint8(o + 3, 200); // bogus bind_pos behavior
    const cfg = decodeTp(buf);
    expect(cfg.devices[0].layers[0].x.role).toBe(TpRole.Move);
    expect(cfg.devices[0].layers[0].x.pos.behavior).toBe(TpBehavior.None);
  });
});

describe("decodeTp: v1 -> v2 upgrade path", () => {
  it("upgrades a discrete v1 role (Volume) to Encoder + the matching preset pair", () => {
    // v1 layer stride = TP_LAYER_V1(6) = axis x(3B) + axis y(3B).
    const buf = new Uint8Array(TP_HDR + TP_DEV_HDR + TP_LAYER_V1);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, TP_MAGIC, true);
    dv.setUint8(2, TP_VERSION_V1);
    dv.setUint8(3, 1); // device_count
    dv.setUint8(4, 1); // layer_count
    dv.setUint8(5, 0); // flags (unused in v1)

    let o = TP_HDR;
    dv.setUint8(o, 1); // device_id
    dv.setUint8(o + 1, 0); // reserved
    o += TP_DEV_HDR;
    // x axis: role=3 (Volume, a v1 "discrete" role >=3), reverse=0, step=5
    dv.setUint8(o, 3);
    dv.setUint8(o + 1, 0);
    dv.setUint8(o + 2, 5);
    // y axis: role=0 (Move), reverse=1, step=2
    dv.setUint8(o + TP_AXIS_V1, 0);
    dv.setUint8(o + TP_AXIS_V1 + 1, 1);
    dv.setUint8(o + TP_AXIS_V1 + 2, 2);

    const cfg = decodeTp(buf);
    expect(cfg.hasGestures).toBe(true); // upgraded configs are gesture-capable
    expect(cfg.hasCoast).toBe(false); // v1 firmware has no coast engine
    const layer = cfg.devices[0].layers[0];
    const preset = presetForV1Role(3);
    expect(layer.x).toEqual({ role: TpRole.Encoder, reverse: false, step: 5, pos: preset.pos, neg: preset.neg });
    expect(layer.x.pos).toEqual(bind(TpBehavior.Cp, HID.C_VOL_UP));
    expect(layer.x.neg).toEqual(bind(TpBehavior.Cp, HID.C_VOL_DN));
    expect(layer.y).toEqual({ role: TpRole.Move, reverse: true, step: 2, pos: NONE_BIND, neg: NONE_BIND });
  });

  it("rejects a v1 blob with the wrong length", () => {
    const buf = new Uint8Array(TP_HDR + TP_DEV_HDR + TP_LAYER_V1 - 1);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, TP_MAGIC, true);
    dv.setUint8(2, TP_VERSION_V1);
    dv.setUint8(3, 1);
    dv.setUint8(4, 1);
    expect(() => decodeTp(buf)).toThrow();
  });
});

describe("decodeTp: error handling", () => {
  it("throws on a bad magic", () => {
    const buf = new Uint8Array(TP_HDR);
    new DataView(buf.buffer).setUint16(0, 0xbeef, true);
    expect(() => decodeTp(buf)).toThrow(/magic/i);
  });

  it("throws on an unsupported version", () => {
    const buf = new Uint8Array(TP_HDR);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, TP_MAGIC, true);
    dv.setUint8(2, 9);
    expect(() => decodeTp(buf)).toThrow(/version/i);
  });

  it("throws on a buffer shorter than the 6-byte header", () => {
    expect(() => decodeTp(new Uint8Array(5))).toThrow();
  });
});

describe("encodeTp / decodeTp round-trips", () => {
  it("round-trips a v2 config with gestures, 2 devices x 2 layers", () => {
    const layer = {
      x: { role: TpRole.Encoder, reverse: false, step: 1, pos: bind(TpBehavior.Cp, HID.C_VOL_UP), neg: bind(TpBehavior.Cp, HID.C_VOL_DN) },
      y: { role: TpRole.Off, reverse: false, step: 1, pos: NONE_BIND, neg: NONE_BIND },
      gestures: {
        tap: bind(TpBehavior.Kp, 0x04),
        tap2: bind(TpBehavior.Cp, HID.C_VOL_UP),
        hold: bind(TpBehavior.Mo, 3),
        dtap: bind(TpBehavior.To, 2),
      },
    };
    const cfg: TpConfig = {
      devices: [
        { deviceId: 1, meta: 0, coast: defaultCoast(), layers: [layer, layer] },
        { deviceId: 2, meta: 5, coast: defaultCoast(), layers: [layer, layer] },
      ],
      layerCount: 2,
      hasGestures: true,
      hasCoast: false,
    };
    const encoded = encodeTp(cfg);
    expect(new DataView(encoded.buffer).getUint8(2)).toBe(TP_VERSION_V2);
    expect(new DataView(encoded.buffer).getUint8(5) & TP_FLAG_GESTURES).toBe(TP_FLAG_GESTURES);
    expect(decodeTp(encoded)).toEqual(cfg);
  });

  it("round-trips a v3 config with the per-device coast block", () => {
    const axis = { role: TpRole.Scroll, reverse: true, step: 4, pos: NONE_BIND, neg: NONE_BIND };
    const cfg: TpConfig = {
      devices: [
        {
          deviceId: 3,
          meta: 0,
          coast: { enable: true, friction: 12, threshold: 40 },
          layers: [{ x: axis, y: axis, gestures: { tap: NONE_BIND, tap2: NONE_BIND, hold: NONE_BIND, dtap: NONE_BIND } }],
        },
      ],
      layerCount: 1,
      hasGestures: true,
      hasCoast: true,
    };
    const encoded = encodeTp(cfg);
    expect(new DataView(encoded.buffer).getUint8(2)).toBe(TP_VERSION_V3);
    // TODO: no standalone FW design doc for the trackpad v3 "coast" trailer
    // was found in this workspace (unlike v1/v2, which have DESIGN-trackpad
    // .md / DESIGN-trackpad-v2.md) — this test only cross-checks against
    // tpConfigV2.ts's own header comment, not an independent spec document.
    expect(decodeTp(encoded)).toEqual(cfg);
  });

  it("expected length matches DESIGN-trackpad-v2.md §3's formula for a mixed case", () => {
    // 2 devices, 3 layers, gestures on, v2 (no coast):
    // 6 + 2*(2 + 3*(11*2+16)) = 6 + 2*(2+3*38) = 6 + 2*116 = 238
    const layer = {
      x: { role: TpRole.Move, reverse: false, step: 1, pos: NONE_BIND, neg: NONE_BIND },
      y: { role: TpRole.Move, reverse: false, step: 1, pos: NONE_BIND, neg: NONE_BIND },
      gestures: { tap: NONE_BIND, tap2: NONE_BIND, hold: NONE_BIND, dtap: NONE_BIND },
    };
    const cfg: TpConfig = {
      devices: [
        { deviceId: 0, meta: 0, coast: defaultCoast(), layers: [layer, layer, layer] },
        { deviceId: 1, meta: 0, coast: defaultCoast(), layers: [layer, layer, layer] },
      ],
      layerCount: 3,
      hasGestures: true,
      hasCoast: false,
    };
    expect(encodeTp(cfg).byteLength).toBe(238);
  });
});

/* --- the firmware read-back guard ----------------------------------------
 *
 * These sizes are not the app's to choose. They come from
 * torabo-tsuki_ext_FW's config_state.c `tp_encode_wire`, which answers every
 * READ with the full v3 encoding of the stored snapshot —
 *   6 + device_count * (5 + TP_MAX_LAYERS * 38)
 * — whatever version was written, and refuses (rather than truncating) when
 * that overflows the tunnel's blob budget. TP_FW_BLOB_MAX is that budget.
 */

/** A uniform config of `devices` devices x `layers` layers, v3 by default. */
function sizedCfg(
  devices: number,
  layers = 20,
  shape: Partial<Pick<TpConfig, "hasGestures" | "hasCoast">> = {},
): TpConfig {
  const layer = {
    x: { role: TpRole.Move, reverse: false, step: 1, pos: NONE_BIND, neg: NONE_BIND },
    y: { role: TpRole.Move, reverse: false, step: 1, pos: NONE_BIND, neg: NONE_BIND },
    gestures: { tap: NONE_BIND, tap2: NONE_BIND, hold: NONE_BIND, dtap: NONE_BIND },
  };
  return {
    devices: Array.from({ length: devices }, (_, i) => ({
      deviceId: i,
      meta: 0,
      coast: defaultCoast(),
      layers: Array.from({ length: layers }, () => layer),
    })),
    layerCount: layers,
    hasGestures: true,
    hasCoast: true,
    ...shape,
  };
}

describe("tpFirmwareReadbackSize", () => {
  it("matches the firmware's formula at 20 layers for 1..4 devices", () => {
    const fw = (devices: number) => 6 + devices * (5 + 20 * 38);
    for (const n of [1, 2, 3, 4]) {
      expect(tpFirmwareReadbackSize(sizedCfg(n))).toBe(fw(n));
    }
    // Spelled out too, because these four numbers are the whole point of the guard.
    expect([1, 2, 3, 4].map((n) => tpFirmwareReadbackSize(sizedCfg(n)))).toEqual([
      771, 1536, 2301, 3066,
    ]);
  });

  it("agrees with the codec's own v3 encoder", () => {
    for (const n of [1, 2, 3, 4]) {
      const cfg = sizedCfg(n);
      expect(tpFirmwareReadbackSize(cfg)).toBe(encodeTp(cfg).byteLength);
    }
  });

  it("predicts the v3 read-back of a v2 config — the firmware upgrades it", () => {
    // The read-back is BIGGER than the bytes we would send: 3 more per device
    // for the coast block the firmware always emits.
    const v2 = sizedCfg(2, 20, { hasCoast: false });
    expect(encodeTp(v2).byteLength).toBe(1530); // what we write
    expect(tpFirmwareReadbackSize(v2)).toBe(1536); // what it reads back
  });

  it("counts the gesture section even for a wire that carries none", () => {
    // Same reason: tp_encode_wire always sets TP_FLAG_GESTURES.
    expect(tpFirmwareReadbackSize(sizedCfg(2, 20, { hasGestures: false, hasCoast: false })))
      .toBe(1536);
  });
});

describe("tpReadbackTooBig", () => {
  it("uses the firmware's Kconfig default as the budget", () => {
    expect(TP_FW_BLOB_MAX).toBe(2048);
  });

  it("passes today's shipping topology with room to spare", () => {
    // 2 devices x 20 layers is what the hardware ships as. If this ever starts
    // failing, the guard is refusing legitimate writes — fix the guard, not
    // this test.
    const shipping = sizedCfg(2);
    expect(tpFirmwareReadbackSize(shipping)).toBe(1536);
    expect(TP_FW_BLOB_MAX - tpFirmwareReadbackSize(shipping)).toBeGreaterThanOrEqual(512);
    expect(tpReadbackTooBig(shipping)).toBe(false);
  });

  it("blocks 3 and 4 devices, which the firmware accepts and then cannot read back", () => {
    expect(tpReadbackTooBig(sizedCfg(3))).toBe(true);
    expect(tpReadbackTooBig(sizedCfg(4))).toBe(true);
  });

  it("weighs against a caller-supplied budget when the firmware reports one", () => {
    // 3072 is what torabo_tsuki_lp_right.conf already sets by hand, and what a
    // desc_ver 2 descriptor would report. It clears the whole 4-device range
    // (3066 B), so nothing is refused — the same configs the 2048 default
    // blocks. Both directions, so the parameter can't quietly stop being read.
    const budget = 3072;
    expect(tpReadbackTooBig(sizedCfg(3), budget)).toBe(false);
    expect(tpReadbackTooBig(sizedCfg(4), budget)).toBe(false);
    expect(tpReadbackTooBig(sizedCfg(3))).toBe(true);
    expect(tpReadbackTooBig(sizedCfg(4))).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * Phantom wire slots.
 *
 * A single-pad build used to report device_count 2 with the second device's
 * meta byte at 0, which the panel then offered as a selectable "デバイス 1"
 * and the FW-info tab listed as an unplaced module. The rule below hides such
 * a slot — but ONLY when some other device in the same wire described itself,
 * because on pre-meta firmware every device reports 0 and every one is real.
 * ------------------------------------------------------------------------- */

/** 25 = side left, conn extension, kind trackpad — a described device. */
const META_LEFT_EXT_PAD = 25;
/** 9 = side left, conn extension, kind unknown — described only in part, but
 * nonzero, so it is still a device the firmware told us about. */
const META_HALF = 9;

describe("phantom devices", () => {
  const wire = (...metas: number[]) => metas.map((meta, i) => ({ deviceId: i, meta }));

  it("shows every device when the firmware described none of them", () => {
    // Pre-meta firmware: all-zero is not evidence of a phantom, it is evidence
    // that this firmware cannot describe anything. Nothing may be hidden.
    expect(visibleDeviceIndices(wire(0, 0))).toEqual([0, 1]);
    expect(visibleDeviceIndices(wire(0))).toEqual([0]);
    expect(visibleDeviceIndices(wire(0, 0, 0, 0))).toEqual([0, 1, 2, 3]);
    expect(isPhantomDevice(wire(0, 0), 0)).toBe(false);
    expect(isPhantomDevice(wire(0, 0), 1)).toBe(false);
  });

  it("hides the undescribed slot beside a described one", () => {
    // The single-pad build's actual wire.
    expect(visibleDeviceIndices(wire(META_LEFT_EXT_PAD, 0))).toEqual([0]);
    expect(isPhantomDevice(wire(META_LEFT_EXT_PAD, 0), 1)).toBe(true);
    expect(isPhantomDevice(wire(META_LEFT_EXT_PAD, 0), 0)).toBe(false);
  });

  it("hides it whichever slot it lands in", () => {
    expect(visibleDeviceIndices(wire(0, META_LEFT_EXT_PAD))).toEqual([1]);
    expect(visibleDeviceIndices(wire(0, META_LEFT_EXT_PAD, 0))).toEqual([1]);
  });

  it("keeps both when both said something, however little", () => {
    expect(visibleDeviceIndices(wire(META_LEFT_EXT_PAD, META_HALF))).toEqual([0, 1]);
    expect(isPhantomDevice(wire(META_LEFT_EXT_PAD, META_HALF), 1)).toBe(false);
  });

  it("has nothing to hide in an empty wire, and never hides everything", () => {
    expect(visibleDeviceIndices(wire())).toEqual([]);
    expect(isPhantomDevice(wire(), 0)).toBe(false);
    // The rule needs a described device to call another one a phantom, so a
    // non-empty wire always leaves at least one slot visible.
    for (const metas of [[0], [0, 0], [META_LEFT_EXT_PAD, 0], [0, META_HALF]]) {
      expect(visibleDeviceIndices(wire(...metas)).length).toBeGreaterThan(0);
    }
  });

  it("clamps a selection onto the visible slots", () => {
    const hidden1 = wire(META_LEFT_EXT_PAD, 0);
    expect(clampToVisibleDevice(hidden1, 1)).toBe(0); // off the phantom
    expect(clampToVisibleDevice(hidden1, 0)).toBe(0); // already fine, untouched
    const hidden0 = wire(0, META_LEFT_EXT_PAD);
    expect(clampToVisibleDevice(hidden0, 0)).toBe(1);
    expect(clampToVisibleDevice(hidden0, 1)).toBe(1);
    // Out of range, and the degenerate empty wire.
    expect(clampToVisibleDevice(wire(0, 0), 7)).toBe(0);
    expect(clampToVisibleDevice(wire(), 3)).toBe(0);
  });

  it("is a DISPLAY filter: the re-encoded wire still carries every slot", () => {
    // The trap this exists to avoid. encodeTp sizes the blob from
    // cfg.devices.length, so dropping the phantom from the config would write
    // a blob one device short of the one the firmware sent.
    const cfg = sizedCfg(2, 20);
    cfg.devices[0].meta = META_LEFT_EXT_PAD; // device 1 stays at 0 = phantom
    expect(visibleDeviceIndices(cfg.devices)).toEqual([0]);
    expect(cfg.devices.length).toBe(2);
    const bytes = encodeTp(cfg);
    expect(bytes[3]).toBe(2); // device_count, unchanged
    expect(bytes.byteLength).toBe(1536);
    expect(decodeTp(bytes).devices.map((d) => d.meta)).toEqual([META_LEFT_EXT_PAD, 0]);
  });
});
