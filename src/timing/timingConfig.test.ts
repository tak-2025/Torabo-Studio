/**
 * Tests for the timing wire codec. Golden bytes follow
 * torabo-tsuki_ext_FW/docs/DESIGN-timing.md "Wire v1 — 96 bytes 固定" table
 * verbatim: an 8-byte header, then two 44-byte hold-tap blocks (block0=mt,
 * block1=lt). Offsets below are transcribed from that table, not imported
 * from timingConfig.ts (its own internal offset constants aren't exported).
 */
import { describe, it, expect } from "vitest";
import {
  TMG_WIRE_LEN,
  TMG_VERSION,
  TMG_HT_NODE_COUNT,
  TMG_HT_POS_SLOTS,
  HtFlavor,
  HtFlag,
  HtNode,
  decodeTiming,
  encodeTiming,
  emptyHtNode,
  type TimingConfig,
} from "./timingConfig";

// Per DESIGN-timing.md "Wire v1" table.
const HDR = 8;
const HT_BLOCK = 44;
const HB = {
  tappingTerm: 0,
  quickTap: 2,
  priorIdle: 4,
  flavor: 6,
  flags: 7,
  posCount: 8,
  positions: 10, // u8[32]
} as const;
const DISABLED_U16 = 0xffff;

describe("timingConfig wire constants", () => {
  it("match DESIGN-timing.md header fields", () => {
    expect(TMG_WIRE_LEN).toBe(96);
    expect(TMG_VERSION).toBe(1);
    expect(TMG_HT_NODE_COUNT).toBe(2);
    expect(TMG_HT_POS_SLOTS).toBe(32);
    // header(8) + 2 blocks * 44 = 96
    expect(HDR + TMG_HT_NODE_COUNT * HT_BLOCK).toBe(TMG_WIRE_LEN);
  });
});

/** Hand-assemble a 96B wire per the DESIGN-timing.md table — independent of
 * encodeTiming so decode has something external to check itself against. */
function buildGoldenBuffer(): Uint8Array {
  const buf = new Uint8Array(TMG_WIRE_LEN);
  const dv = new DataView(buf.buffer);

  dv.setUint8(0, 1); // version
  dv.setUint8(1, 2); // ht_node_count
  dv.setUint8(2, 32); // ht_pos_slots
  dv.setUint8(3, 5); // debounce_press_ms
  dv.setUint8(4, 6); // debounce_release_ms
  // bytes 5-7 reserved = 0 (already zero)

  // block0 = mt: tapping=200, quick_tap disabled, prior_idle=125,
  // flavor=tap-preferred(2), flags=retroTap(bit0)+holdTriggerOnRelease(bit1),
  // positions=[10,20].
  const b0 = HDR;
  dv.setUint16(b0 + HB.tappingTerm, 200, true);
  dv.setUint16(b0 + HB.quickTap, DISABLED_U16, true);
  dv.setUint16(b0 + HB.priorIdle, 125, true);
  dv.setUint8(b0 + HB.flavor, HtFlavor.TapPreferred);
  dv.setUint8(b0 + HB.flags, HtFlag.RetroTap | HtFlag.HoldTriggerOnRelease);
  dv.setUint8(b0 + HB.posCount, 2);
  dv.setUint8(b0 + HB.positions + 0, 10);
  dv.setUint8(b0 + HB.positions + 1, 20);

  // block1 = lt: tapping=280, quick_tap=175, prior_idle disabled,
  // flavor=balanced(1), flags=holdWhileUndecided(bit2), no positions.
  const b1 = HDR + HT_BLOCK;
  dv.setUint16(b1 + HB.tappingTerm, 280, true);
  dv.setUint16(b1 + HB.quickTap, 175, true);
  dv.setUint16(b1 + HB.priorIdle, DISABLED_U16, true);
  dv.setUint8(b1 + HB.flavor, HtFlavor.Balanced);
  dv.setUint8(b1 + HB.flags, HtFlag.HoldWhileUndecided);
  dv.setUint8(b1 + HB.posCount, 0);

  return buf;
}

describe("decodeTiming", () => {
  it("decodes the hand-built 96B golden buffer per DESIGN-timing.md", () => {
    const cfg = decodeTiming(buildGoldenBuffer());
    expect(cfg.debouncePressMs).toBe(5);
    expect(cfg.debounceReleaseMs).toBe(6);
    expect(cfg.htNodes).toHaveLength(2);

    const mt = cfg.htNodes[HtNode.ModTap];
    expect(mt).toEqual({
      tappingTermMs: 200,
      quickTapMs: -1,
      requirePriorIdleMs: 125,
      flavor: HtFlavor.TapPreferred,
      retroTap: true,
      holdTriggerOnRelease: true,
      holdWhileUndecided: false,
      positions: [10, 20],
    });

    const lt = cfg.htNodes[HtNode.LayerTap];
    expect(lt).toEqual({
      tappingTermMs: 280,
      quickTapMs: 175,
      requirePriorIdleMs: -1,
      flavor: HtFlavor.Balanced,
      retroTap: false,
      holdTriggerOnRelease: false,
      holdWhileUndecided: true,
      positions: [],
    });
  });

  it("rejects a buffer that isn't exactly 96 bytes (exactLength guard)", () => {
    expect(() => decodeTiming(new Uint8Array(95))).toThrow();
    expect(() => decodeTiming(new Uint8Array(97))).toThrow();
  });

  it("rejects an unsupported version", () => {
    const buf = buildGoldenBuffer();
    buf[0] = 2;
    expect(() => decodeTiming(buf)).toThrow();
  });

  it("falls back an out-of-range flavor byte to HoldPreferred", () => {
    const buf = buildGoldenBuffer();
    new DataView(buf.buffer).setUint8(HDR + HB.flavor, 0xff);
    const cfg = decodeTiming(buf);
    expect(cfg.htNodes[HtNode.ModTap].flavor).toBe(HtFlavor.HoldPreferred);
  });
});

describe("encodeTiming", () => {
  it("always emits exactly TMG_WIRE_LEN bytes", () => {
    expect(encodeTiming(decodeTiming(buildGoldenBuffer())).byteLength).toBe(TMG_WIRE_LEN);
  });

  it("decode(golden) -> encode reproduces the golden buffer byte-for-byte", () => {
    const golden = buildGoldenBuffer();
    const cfg = decodeTiming(golden);
    expect(encodeTiming(cfg)).toEqual(golden);
  });

  it("round-trips an arbitrary config through encode -> decode", () => {
    const cfg: TimingConfig = {
      htNodes: [
        {
          tappingTermMs: 300,
          quickTapMs: -1,
          requirePriorIdleMs: 90,
          flavor: HtFlavor.HoldPreferred,
          retroTap: false,
          holdTriggerOnRelease: true,
          holdWhileUndecided: false,
          positions: [1, 2, 3, 4, 5],
        },
        {
          tappingTermMs: 175,
          quickTapMs: 60,
          requirePriorIdleMs: -1,
          flavor: HtFlavor.TapUnlessInterrupted,
          retroTap: true,
          holdTriggerOnRelease: false,
          holdWhileUndecided: true,
          positions: [],
        },
      ],
      debouncePressMs: 1,
      debounceReleaseMs: 100,
    };
    expect(decodeTiming(encodeTiming(cfg))).toEqual(cfg);
  });

  it("clamps tapping-term/debounce to their documented ranges (10..2000 / 1..100)", () => {
    const cfg: TimingConfig = {
      htNodes: [
        { ...emptyHtNode(), tappingTermMs: 1 },
        { ...emptyHtNode(), tappingTermMs: 5000 },
      ],
      debouncePressMs: 0,
      debounceReleaseMs: 999,
    };
    const decoded = decodeTiming(encodeTiming(cfg));
    expect(decoded.htNodes[0].tappingTermMs).toBe(10);
    expect(decoded.htNodes[1].tappingTermMs).toBe(2000);
    expect(decoded.debouncePressMs).toBe(1);
    expect(decoded.debounceReleaseMs).toBe(100);
  });

  it("collapses any negative quickTapMs/requirePriorIdleMs to the -1 disabled sentinel", () => {
    const cfg: TimingConfig = {
      htNodes: [
        { ...emptyHtNode(), quickTapMs: -100, requirePriorIdleMs: -2 },
        emptyHtNode(),
      ],
      debouncePressMs: 5,
      debounceReleaseMs: 5,
    };
    const decoded = decodeTiming(encodeTiming(cfg));
    expect(decoded.htNodes[0].quickTapMs).toBe(-1);
    expect(decoded.htNodes[0].requirePriorIdleMs).toBe(-1);
  });

  it("truncates positions beyond TMG_HT_POS_SLOTS(32)", () => {
    const cfg: TimingConfig = {
      htNodes: [
        { ...emptyHtNode(), positions: Array.from({ length: 40 }, (_, i) => i) },
        emptyHtNode(),
      ],
      debouncePressMs: 5,
      debounceReleaseMs: 5,
    };
    const decoded = decodeTiming(encodeTiming(cfg));
    expect(decoded.htNodes[0].positions).toHaveLength(TMG_HT_POS_SLOTS);
    expect(decoded.htNodes[0].positions).toEqual(Array.from({ length: 32 }, (_, i) => i));
  });
});
