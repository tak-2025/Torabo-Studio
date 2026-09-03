/**
 * Tests for the capability-descriptor decoder, per toraboCaps.ts's own header
 * comment (torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h — no
 * separate markdown design doc exists for this feature in this workspace):
 * header(8B) = magic u16(0x4354 "TC"), descVer u8, major u8, minor u8, patch
 * u8, featureCount u8, _rsv u8; per feature (4B): id u8, wireVer u8, caps u16
 * LE.
 */
import { describe, it, expect } from "vitest";
import {
  APP_MAX_WIRE_VER,
  CAPS_MAGIC,
  CAPS_DESC_VERSION,
  CAPS_HDR,
  CAPS_FEAT,
  CapsSide,
  Feature,
  LedCap,
  MACRO_NAMES_WIRE_VER,
  ModuleKind,
  TimingCap,
  TrackballCap,
  TrackpadCap,
  canWriteFeature,
  centralSideFromHeader,
  decodeCaps,
  hasFeature,
  featureInfo,
  fwVersionString,
  hasMacroNames,
  hasSplitDebounce,
  hasTrackpadCoast,
  hasTrackballCoast,
  ledSides,
  moduleSlots,
} from "./toraboCaps";
import { ZTC_VERSION } from "../trackball/ztcConfig";
import { TP_VERSION } from "../trackpad/tpConfigV2";
import { ENC_VERSION } from "../encoder/encConfig";
import { LED_VERSION } from "../led/ledConfig";
import { TMG_VERSION } from "../timing/timingConfig";
import { DM_VERSION, DM_VERSION_V2 } from "../dynamic_macros/dmacConfig";
import { CB_VERSION } from "../dynamic_combos/comboConfig";

function buildCaps(
  features: { id: number; wireVer: number; caps: number }[],
  fw = { major: 0, minor: 5, patch: 0 },
  /** Descriptor revision, bytes parked after the feature table, and the
   * header `_rsv` byte (bit0-1 = central side, PLAN-ext-fw-refactor.md
   * フェーズ9) — the things a firmware is allowed to set beyond the feature
   * table itself (see the forward-compat contract in toraboCaps.ts). Default
   * to today's v1, nothing trailing, `_rsv` 0x00 (every pre-phase9 build). */
  opts: { descVer?: number; trailing?: number[]; hdrRsv?: number } = {},
): Uint8Array {
  const trailing = opts.trailing ?? [];
  const buf = new Uint8Array(CAPS_HDR + features.length * CAPS_FEAT + trailing.length);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, CAPS_MAGIC, true);
  dv.setUint8(2, opts.descVer ?? CAPS_DESC_VERSION);
  dv.setUint8(3, fw.major);
  dv.setUint8(4, fw.minor);
  dv.setUint8(5, fw.patch);
  dv.setUint8(6, features.length);
  dv.setUint8(7, opts.hdrRsv ?? 0x00);
  features.forEach((f, i) => {
    const o = CAPS_HDR + i * CAPS_FEAT;
    dv.setUint8(o, f.id);
    dv.setUint8(o + 1, f.wireVer);
    dv.setUint16(o + 2, f.caps, true);
  });
  trailing.forEach((b, i) => {
    dv.setUint8(CAPS_HDR + features.length * CAPS_FEAT + i, b);
  });
  return buf;
}

describe("toraboCaps wire constants", () => {
  it("matches the documented header", () => {
    expect(CAPS_MAGIC).toBe(0x4354);
    expect(CAPS_HDR).toBe(8);
    expect(CAPS_FEAT).toBe(4);
  });
});

describe("decodeCaps: golden bytes", () => {
  const blob = buildCaps([
    { id: Feature.Trackpad, wireVer: 3, caps: TrackpadCap.Coast },
    { id: Feature.Timing, wireVer: 1, caps: TimingCap.SplitDebounce },
    { id: Feature.Led, wireVer: 1, caps: LedCap.Left | LedCap.Right },
  ]);

  it("is exactly header + 3*4 = 20 bytes", () => {
    expect(blob.byteLength).toBe(20);
  });

  it("decodes descriptor version, firmware version, and every feature entry", () => {
    const caps = decodeCaps(blob);
    expect(caps.descVersion).toBe(CAPS_DESC_VERSION);
    expect(caps.fw).toEqual({ major: 0, minor: 5, patch: 0 });
    expect(caps.features).toEqual([
      { id: Feature.Trackpad, wireVer: 3, caps: TrackpadCap.Coast },
      { id: Feature.Timing, wireVer: 1, caps: TimingCap.SplitDebounce },
      { id: Feature.Led, wireVer: 1, caps: LedCap.Left | LedCap.Right },
    ]);
  });

  it("throws on a bad magic, truncated header, and truncated feature table", () => {
    const badMagic = blob.slice();
    new DataView(badMagic.buffer).setUint16(0, 0x0000, true);
    expect(() => decodeCaps(badMagic)).toThrow();

    expect(() => decodeCaps(blob.slice(0, CAPS_HDR - 1))).toThrow();
    expect(() => decodeCaps(blob.slice(0, CAPS_HDR + CAPS_FEAT - 1))).toThrow();
  });
});

describe("Feature: LiveFeed / RpcTunnel (ids 8 and 9)", () => {
  const caps = decodeCaps(
    buildCaps([
      { id: Feature.LiveFeed, wireVer: 1, caps: 0x0001 },
      { id: Feature.RpcTunnel, wireVer: 1, caps: 0x0001 },
    ]),
  );

  it("hasFeature finds both, and nothing else leaks in", () => {
    expect(hasFeature(caps, Feature.LiveFeed)).toBe(true);
    expect(hasFeature(caps, Feature.RpcTunnel)).toBe(true);
    expect(hasFeature(caps, Feature.Timing)).toBe(false);
  });

  it("featureInfo reports their wireVer/caps like any other feature", () => {
    expect(featureInfo(caps, Feature.LiveFeed)).toEqual({
      id: Feature.LiveFeed,
      wireVer: 1,
      caps: 0x0001,
    });
    expect(featureInfo(caps, Feature.RpcTunnel)).toEqual({
      id: Feature.RpcTunnel,
      wireVer: 1,
      caps: 0x0001,
    });
  });
});

/**
 * Forward compatibility: what a descriptor from FUTURE firmware does to the app
 * shipped today. The planned desc_ver 2 raises TORABO_CAPS_MAX_FEATURES (10
 * today, caps.h) to 16-24 and parks extra header data after the feature table,
 * so these are the shapes this app must survive without an update. The contract
 * these assert is written out at the top of toraboCaps.ts.
 */
describe("decodeCaps: tolerance of a newer descriptor", () => {
  /** An id no Feature member has — a feature added after this app shipped.
   * (8 and 9 are LIVE_FEED / RPC_TUNNEL in caps.h, and 11 is TORABO_FEAT_MODULES
   * — all three are modelled now as Feature.LiveFeed / Feature.RpcTunnel /
   * Feature.Modules, so 12+ are the ones this app genuinely cannot know.) */
  const asFeature = (id: number) => id as Feature;
  const UNKNOWN_A = 12;
  const UNKNOWN_B = 13;

  /** 12 entries: every id this app knows, plus four it does not. */
  const futureBlob = buildCaps(
    [
      { id: Feature.Trackball, wireVer: 3, caps: TrackballCap.Coast },
      { id: Feature.Macros, wireVer: 1, caps: 0 },
      { id: Feature.Combos, wireVer: 1, caps: 0 },
      { id: Feature.Trackpad, wireVer: 3, caps: TrackpadCap.Coast },
      { id: Feature.Encoder, wireVer: 1, caps: 0 },
      { id: Feature.Led, wireVer: 1, caps: LedCap.Left | LedCap.Right },
      { id: Feature.ReservedLayers, wireVer: 1, caps: 2 },
      { id: Feature.Timing, wireVer: 1, caps: TimingCap.SplitDebounce },
      { id: UNKNOWN_A, wireVer: 1, caps: 0x0001 },
      { id: UNKNOWN_B, wireVer: 7, caps: 0xffff },
      { id: 14, wireVer: 1, caps: 0 },
      { id: 15, wireVer: 1, caps: 0 },
    ],
    { major: 1, minor: 0, patch: 0 },
    { descVer: 2 },
  );

  it("parses a desc_ver it has never seen, with more features than today's cap", () => {
    const caps = decodeCaps(futureBlob);
    expect(caps.descVersion).toBe(2);
    expect(caps.fw).toEqual({ major: 1, minor: 0, patch: 0 });
    // 12 > TORABO_CAPS_MAX_FEATURES (10): parsed by feature_count, not by length
    expect(caps.features).toHaveLength(12);
    expect(futureBlob.byteLength).toBe(CAPS_HDR + 12 * CAPS_FEAT);
  });

  it("still answers every known feature correctly", () => {
    const caps = decodeCaps(futureBlob);
    expect(hasFeature(caps, Feature.Timing)).toBe(true);
    expect(hasFeature(caps, Feature.Trackball)).toBe(true);
    expect(featureInfo(caps, Feature.Trackpad)?.wireVer).toBe(3);
    expect(hasSplitDebounce(caps)).toBe(true);
    expect(hasTrackpadCoast(caps)).toBe(true);
    expect(hasTrackballCoast(caps)).toBe(true);
    expect(ledSides(caps)).toEqual({ left: true, right: true });
    expect(fwVersionString(caps)).toBe("1.0.0");
  });

  it("keeps unknown ids verbatim, and they change no answer", () => {
    const caps = decodeCaps(futureBlob);
    // kept, not dropped: nothing is silently lost from the descriptor
    expect(caps.features).toContainEqual({ id: UNKNOWN_A, wireVer: 1, caps: 0x0001 });
    expect(caps.features).toContainEqual({ id: UNKNOWN_B, wireVer: 7, caps: 0xffff });
    // and inert: every query is an id lookup, so an id nobody asks about is
    // invisible. UNKNOWN_B's 0xffff caps word sets the same bits as
    // LedCap/TimingCap/TrackpadCap without affecting any of them.
    expect(ledSides(caps)).toEqual({ left: true, right: true });
    expect(hasSplitDebounce(caps)).toBe(true);
    expect(hasFeature(caps, asFeature(99))).toBe(false);
  });

  it("ignores bytes parked after the feature table", () => {
    // What a desc_ver 2 header extension looks like to a v1 parser: the table
    // ends where feature_count says, and the extra (e.g. a tunnel blob budget
    // u16) sits past it.
    const withTrailer = buildCaps(
      [
        { id: Feature.Timing, wireVer: 1, caps: TimingCap.SplitDebounce },
        { id: Feature.Led, wireVer: 1, caps: LedCap.Right },
      ],
      { major: 1, minor: 0, patch: 0 },
      { descVer: 2, trailing: [0x00, 0x08, 0xde, 0xad, 0xbe, 0xef] },
    );
    const caps = decodeCaps(withTrailer);
    expect(caps.features).toEqual([
      { id: Feature.Timing, wireVer: 1, caps: TimingCap.SplitDebounce },
      { id: Feature.Led, wireVer: 1, caps: LedCap.Right },
    ]);
    expect(ledSides(caps)).toEqual({ left: false, right: true });
  });

  it("keeps the write guard working across a longer table", () => {
    const caps = decodeCaps(futureBlob);
    expect(canWriteFeature(caps, Feature.Trackpad)).toBe(true); // v3 == app max
    expect(canWriteFeature(caps, Feature.Timing)).toBe(true); // v1 == app max
    expect(canWriteFeature(caps, Feature.Trackball)).toBe(true); // v3 == app max
  });

  /**
   * A feature this app has no codec for. Blocking is the conservative answer —
   * there is nothing to encode — and canWriteFeature says so outright rather
   * than arriving there via `wireVer <= undefined`. Unreachable from the UI
   * (panels pass Feature enum members), so this test is the only caller.
   */
  it("refuses to write a feature id it does not know", () => {
    const caps = decodeCaps(futureBlob);
    expect(canWriteFeature(caps, asFeature(UNKNOWN_A))).toBe(false);
    expect(canWriteFeature(caps, asFeature(UNKNOWN_B))).toBe(false);
    // ...but only when the descriptor actually lists it: an id that is simply
    // absent still falls open, exactly as a known-but-absent feature does.
    expect(canWriteFeature(caps, asFeature(99))).toBe(true);
  });

  it("still rejects corruption: bad magic and a table shorter than its count", () => {
    const badMagic = futureBlob.slice();
    new DataView(badMagic.buffer).setUint16(0, 0x0000, true);
    expect(() => decodeCaps(badMagic)).toThrow();

    // feature_count says 12, buffer holds 11-and-a-bit entries. This is the one
    // length check tolerance must NOT relax — the missing bytes are corruption,
    // not a field we can ignore.
    expect(() => decodeCaps(futureBlob.slice(0, futureBlob.length - 1))).toThrow();
    expect(() => decodeCaps(futureBlob.slice(0, CAPS_HDR))).toThrow();
  });
});

describe("queries over a decoded descriptor", () => {
  const caps = decodeCaps(
    buildCaps([
      { id: Feature.Trackpad, wireVer: 3, caps: TrackpadCap.Coast },
      { id: Feature.Timing, wireVer: 1, caps: TimingCap.SplitDebounce },
      { id: Feature.Led, wireVer: 1, caps: LedCap.Left },
    ]),
  );

  it("hasFeature / featureInfo report presence accurately", () => {
    expect(hasFeature(caps, Feature.Timing)).toBe(true);
    expect(hasFeature(caps, Feature.Trackball)).toBe(false);
    expect(featureInfo(caps, Feature.Led)?.caps).toBe(LedCap.Left);
    expect(featureInfo(caps, Feature.Trackball)).toBeNull();
  });

  it("fwVersionString formats major.minor.patch", () => {
    expect(fwVersionString(caps)).toBe("0.5.0");
  });

  it("hasSplitDebounce / hasTrackpadCoast / hasTrackballCoast read the right capability bits", () => {
    expect(hasSplitDebounce(caps)).toBe(true);
    expect(hasTrackpadCoast(caps)).toBe(true);
    expect(hasTrackballCoast(caps)).toBe(false); // Trackball feature isn't present at all
  });

  it("ledSides reflects only the bits actually set", () => {
    expect(ledSides(caps)).toEqual({ left: true, right: false });
  });

  describe("pre-capabilities firmware (caps === null)", () => {
    it("hasFeature assumes every feature MIGHT be present", () => {
      expect(hasFeature(null, Feature.Timing)).toBe(true);
    });

    it("featureInfo / fwVersionString / the coast+debounce+led queries all fail closed", () => {
      expect(featureInfo(null, Feature.Timing)).toBeNull();
      expect(fwVersionString(null)).toEqual(expect.any(String));
      expect(hasSplitDebounce(null)).toBe(false);
      expect(hasTrackpadCoast(null)).toBe(false);
      expect(hasTrackballCoast(null)).toBe(false);
      expect(hasMacroNames(null)).toBe(false);
      expect(ledSides(null)).toEqual({ left: false, right: false });
    });
  });
});

/**
 * The gate the macro-name UI hangs off. A wire-version question rather than a
 * caps bit, because names changed the SHAPE of the macros blob — see
 * hasMacroNames' own comment and PLAN-ext-fw-refactor.md フェーズ8.
 */
describe("hasMacroNames", () => {
  it("states the same version the codec calls v2", () => {
    // The one place the literal in toraboCaps.ts (which must not import a
    // codec) is checked against the codec that defines it.
    expect(MACRO_NAMES_WIRE_VER).toBe(DM_VERSION_V2);
  });

  it("is false on v1 firmware — the name field must not appear at all", () => {
    const fw = decodeCaps(buildCaps([{ id: Feature.Macros, wireVer: 1, caps: 0 }]));
    expect(hasMacroNames(fw)).toBe(false);
  });

  it("is true from v2 on", () => {
    for (const wireVer of [2, 3, 9]) {
      const fw = decodeCaps(buildCaps([{ id: Feature.Macros, wireVer, caps: 0 }]));
      expect(hasMacroNames(fw)).toBe(true);
    }
  });

  it("is false when the descriptor doesn't list macros at all", () => {
    const fw = decodeCaps(buildCaps([{ id: Feature.Timing, wireVer: 1, caps: 0 }]));
    expect(hasMacroNames(fw)).toBe(false);
  });
});

/**
 * The write guard: refuse to encode for firmware whose wire is newer than the
 * codec here, because encoding from a partial decode would write its extra
 * fields away.
 */
describe("canWriteFeature", () => {
  /**
   * APP_MAX_WIRE_VER is hand-maintained (deliberately — it must not import
   * every codec just to state a number), so this is the check that catches the
   * half-done change: a codec taught a new version without its entry bumped,
   * or an entry bumped without the codec taught. Each codec exports the newest
   * version it emits.
   */
  it("matches the newest wire each codec actually speaks", () => {
    expect(APP_MAX_WIRE_VER[Feature.Trackball]).toBe(ZTC_VERSION);
    expect(APP_MAX_WIRE_VER[Feature.Trackpad]).toBe(TP_VERSION);
    expect(APP_MAX_WIRE_VER[Feature.Encoder]).toBe(ENC_VERSION);
    expect(APP_MAX_WIRE_VER[Feature.Led]).toBe(LED_VERSION);
    expect(APP_MAX_WIRE_VER[Feature.Timing]).toBe(TMG_VERSION);
    expect(APP_MAX_WIRE_VER[Feature.Macros]).toBe(DM_VERSION);
    expect(APP_MAX_WIRE_VER[Feature.Combos]).toBe(CB_VERSION);
  });

  /**
   * The macros entry moved to 2 when decodeDmac learned the v2 name block
   * (PLAN-ext-fw-refactor.md フェーズ8). Spelled out separately from the loop
   * above because the loop would keep passing if BOTH numbers slid together —
   * and because the whole point of the bump is that names-capable firmware must
   * not land in the read-only state the guard puts a panel in.
   */
  it("lets a v2 (names) macros firmware be written to", () => {
    expect(APP_MAX_WIRE_VER[Feature.Macros]).toBe(2);
    const fw = decodeCaps(buildCaps([{ id: Feature.Macros, wireVer: 2, caps: 0 }]));
    expect(canWriteFeature(fw, Feature.Macros)).toBe(true);
    // …and a v3 macros wire nobody has designed yet still locks the panel.
    const future = decodeCaps(buildCaps([{ id: Feature.Macros, wireVer: 3, caps: 0 }]));
    expect(canWriteFeature(future, Feature.Macros)).toBe(false);
  });

  it("allows everything on pre-capabilities firmware (caps === null)", () => {
    expect(canWriteFeature(null, Feature.Trackball)).toBe(true);
    expect(canWriteFeature(null, Feature.Trackpad)).toBe(true);
    expect(canWriteFeature(null, Feature.Timing)).toBe(true);
  });

  it("allows a feature the descriptor doesn't list — its read fails on its own", () => {
    const caps = decodeCaps(
      buildCaps([{ id: Feature.Timing, wireVer: 1, caps: 0 }]),
    );
    expect(hasFeature(caps, Feature.Trackball)).toBe(false);
    expect(canWriteFeature(caps, Feature.Trackball)).toBe(true);
  });

  it("allows the version this app speaks, and every older one", () => {
    const caps = decodeCaps(
      buildCaps([
        // v3 == APP_MAX_WIRE_VER[Trackball]
        { id: Feature.Trackball, wireVer: 3, caps: 0 },
        // v2 — older, and encode answers in the version it was spoken to
        { id: Feature.Trackpad, wireVer: 2, caps: 0 },
        { id: Feature.Timing, wireVer: 1, caps: 0 },
      ]),
    );
    expect(canWriteFeature(caps, Feature.Trackball)).toBe(true);
    expect(canWriteFeature(caps, Feature.Trackpad)).toBe(true);
    expect(canWriteFeature(caps, Feature.Timing)).toBe(true);
  });

  it("blocks a firmware wire newer than this app's codec", () => {
    const caps = decodeCaps(
      buildCaps([
        { id: Feature.Trackball, wireVer: 4, caps: 0 }, // app tops out at 3
        { id: Feature.Timing, wireVer: 2, caps: 0 }, // app tops out at 1
        { id: Feature.Trackpad, wireVer: 3, caps: 0 }, // exactly the app's max
      ]),
    );
    expect(canWriteFeature(caps, Feature.Trackball)).toBe(false);
    expect(canWriteFeature(caps, Feature.Timing)).toBe(false);
    expect(canWriteFeature(caps, Feature.Trackpad)).toBe(true);
  });

  it("still reports the feature as present — read-only, not hidden", () => {
    const caps = decodeCaps(
      buildCaps([{ id: Feature.Trackball, wireVer: 9, caps: 0 }]),
    );
    expect(hasFeature(caps, Feature.Trackball)).toBe(true);
    expect(canWriteFeature(caps, Feature.Trackball)).toBe(false);
  });
});

/**
 * Module-layout declaration: the header `_rsv` bit0-1 says which half is
 * central, and Feature.Modules (id 11, TORABO_FEAT_MODULES, redesigned
 * 2026-09-04) says what is on each of the four connectors. This superseded a
 * one-day-lived per-feature scheme (PLAN-ext-fw-refactor.md フェーズ9,
 * 2026-09-03's TrackballCap.BallLeft/BallRight and EncoderCap.LeftStd/
 * LeftExt/RightStd/RightExt) — that scheme is gone from both this app and
 * caps.h, so there is nothing here to test compatibility against.
 */
describe("module-layout declaration bits", () => {
  describe("central side (header _rsv, bit0-1)", () => {
    it("defaults to Unknown when _rsv is 0x00, matching every pre-phase9 descriptor", () => {
      const caps = decodeCaps(buildCaps([{ id: Feature.Timing, wireVer: 1, caps: 0 }]));
      expect(caps.hdrCentralSide).toBe(CapsSide.Unknown);
      expect(centralSideFromHeader(caps)).toBe(CapsSide.Unknown);
    });

    it("reads Left / Right from _rsv bit0-1", () => {
      const left = decodeCaps(
        buildCaps([{ id: Feature.Timing, wireVer: 1, caps: 0 }], undefined, {
          hdrRsv: 0x01,
        }),
      );
      expect(left.hdrCentralSide).toBe(CapsSide.Left);
      expect(centralSideFromHeader(left)).toBe(CapsSide.Left);

      // The real device's actual central (memory: central = right hand).
      const right = decodeCaps(
        buildCaps([{ id: Feature.Timing, wireVer: 1, caps: 0 }], undefined, {
          hdrRsv: 0x02,
        }),
      );
      expect(right.hdrCentralSide).toBe(CapsSide.Right);
      expect(centralSideFromHeader(right)).toBe(CapsSide.Right);
    });

    it("masks off bits above bit1, so a stray high bit does not corrupt the reading", () => {
      // bit0-1 = 0b10 (Right), plus an unrelated high bit some future _rsv use
      // might set — contract rule (c) parks new header info here too, and this
      // decode must not let that bleed into the side reading.
      const caps = decodeCaps(
        buildCaps([{ id: Feature.Timing, wireVer: 1, caps: 0 }], undefined, {
          hdrRsv: 0x82,
        }),
      );
      expect(caps.hdrCentralSide).toBe(CapsSide.Right);
    });

    it("centralSideFromHeader fails closed on pre-capabilities firmware", () => {
      expect(centralSideFromHeader(null)).toBe(CapsSide.Unknown);
    });
  });

  /**
   * moduleSlots() decodes Feature.Modules' caps u16: 4-bit nibbles, low to
   * high = left standard / left extension / right standard / right
   * extension, each 0=undeclared, 1=pad, 2=ball, 3=encoder, 4=none
   * (ModuleKind). The golden word below is the user's real hardware: an
   * encoder on left standard, a pad on left extension, a ball on right
   * standard, a pad on right extension.
   *
   *   leftStd=Encoder(3) | leftExt=Pad(1)<<4 | rightStd=Ball(2)<<8 |
   *   rightExt=Pad(1)<<12
   *     = 0x0003 | 0x0010 | 0x0200 | 0x1000 = 0x1213
   */
  describe("moduleSlots (Feature.Modules caps word, TORABO_FEAT_MODULES)", () => {
    const GOLDEN_CAPS = 0x1213;

    it("golden: 0x1213 decodes to encoder/pad/ball/pad", () => {
      const caps = decodeCaps(
        buildCaps([{ id: Feature.Modules, wireVer: 1, caps: GOLDEN_CAPS }]),
      );
      expect(featureInfo(caps, Feature.Modules)?.caps).toBe(GOLDEN_CAPS);
      expect(moduleSlots(caps)).toEqual({
        leftStd: ModuleKind.Encoder,
        leftExt: ModuleKind.Pad,
        rightStd: ModuleKind.Ball,
        rightExt: ModuleKind.Pad,
      });
    });

    it("golden bytes: the Modules row is id=11, wireVer=1, caps 0x1213 little-endian", () => {
      // Byte-exact check of the same golden word, straight off the buffer
      // buildCaps() produced — this is what the firmware side's own encoder
      // must match byte for byte for the two to agree on the wire.
      const blob = buildCaps([{ id: Feature.Modules, wireVer: 1, caps: GOLDEN_CAPS }]);
      const entry = blob.subarray(CAPS_HDR, CAPS_HDR + CAPS_FEAT);
      expect(Array.from(entry)).toEqual([Feature.Modules, 1, 0x13, 0x12]);
    });

    it("a present row with every nibble 0 decodes to four Undeclared slots (not null)", () => {
      // Distinct from an absent row: the firmware COULD have declared
      // placement and chose not to (CONFIG_TORABO_MODULE_* left unset), vs.
      // firmware that predates the row entirely (next test).
      const caps = decodeCaps(buildCaps([{ id: Feature.Modules, wireVer: 1, caps: 0x0000 }]));
      expect(moduleSlots(caps)).toEqual({
        leftStd: ModuleKind.Undeclared,
        leftExt: ModuleKind.Undeclared,
        rightStd: ModuleKind.Undeclared,
        rightExt: ModuleKind.Undeclared,
      });
    });

    it("decodes an explicit None (4) slot alongside declared ones", () => {
      // rightExt = None(4)<<12 = 0x4000, layered on the golden leftStd/leftExt/
      // rightStd above (0x0213) to prove None decodes independently of its
      // neighbours.
      const caps = decodeCaps(
        buildCaps([{ id: Feature.Modules, wireVer: 1, caps: 0x0213 | 0x4000 }]),
      );
      expect(moduleSlots(caps)?.rightExt).toBe(ModuleKind.None);
    });

    it("returns null when the row is absent entirely (older firmware)", () => {
      const caps = decodeCaps(buildCaps([{ id: Feature.Timing, wireVer: 1, caps: 0 }]));
      expect(moduleSlots(caps)).toBeNull();
    });

    it("fails closed with no descriptor at all", () => {
      expect(moduleSlots(null)).toBeNull();
    });
  });
});
