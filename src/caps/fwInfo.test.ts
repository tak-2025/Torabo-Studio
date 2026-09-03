/**
 * Tests for the firmware-info tab's display helpers.
 *
 * The cases that matter here are the ones a normal keyboard never produces:
 * a feature id this app has never heard of, a caps bit it has no name for, and
 * a wire version ahead of its codec. All three are what the descriptor's
 * forward-compatibility contract (toraboCaps.ts) says a future firmware is
 * allowed to send, and this tab is where they have to survive being displayed
 * rather than being quietly dropped.
 *
 * Bit meanings are checked against TORABO_CAPS_* in
 * torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h.
 */
import { describe, it, expect } from "vitest";

import {
  FEATURE_DISPLAY_ORDER,
  decodeFeatureCaps,
  featureName,
  formatRawDescriptor,
  orderFeatures,
  toHex,
  wireGains,
  wireInfo,
} from "./fwInfo";
import { ZTC_VERSION_V3 } from "../trackball/ztcConfig";
import { TP_VERSION_V3 } from "../trackpad/tpConfigV2";
import { DM_VERSION_V2 } from "../dynamic_macros/dmacConfig";
import {
  APP_MAX_WIRE_VER,
  CAPS_FEAT,
  CAPS_HDR,
  CAPS_MAGIC,
  Feature,
  FeatureInfo,
  LedCap,
  LiveFeedCap,
  MACRO_NAMES_WIRE_VER,
  ReservedLayersCap,
  TimingCap,
  TrackballCap,
  TrackpadCap,
  TunnelCap,
} from "./toraboCaps";

/** An id past every one caps.h defines today — stands in for "a feature added
 * after this app was built". */
const UNKNOWN_ID = 0x0b;

function feat(id: number, wireVer: number, caps = 0): FeatureInfo {
  return { id: id as Feature, wireVer, caps };
}

describe("toHex", () => {
  it("pads to the requested width and uppercases", () => {
    expect(toHex(0x0b, 2)).toBe("0x0B");
    expect(toHex(0x40, 4)).toBe("0x0040");
    expect(toHex(0, 4)).toBe("0x0000");
  });
});

describe("featureName", () => {
  it("names every id the app knows, and names them distinctly", () => {
    const keys = Object.values(Feature).map((id) => featureName(id).key);
    expect(keys).not.toContain("fw.feat.unknown");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names the ids added most recently", () => {
    // LiveFeed=8 / RpcTunnel=9 postdate the first version of this table; a
    // missing entry here would show them as "unknown" on hardware that has them.
    expect(featureName(Feature.LiveFeed).key).toBe("fw.feat.liveFeed");
    expect(featureName(Feature.RpcTunnel).key).toBe("fw.feat.rpcTunnel");
  });

  it("borrows the tab's own label for every feature that has a tab", () => {
    // The point of pointing at tab.* rather than copying the words: the table
    // and the tab strip cannot end up calling the same feature two things.
    expect(featureName(Feature.Timing).key).toBe("tab.timing");
    expect(featureName(Feature.Trackball).key).toBe("tab.trackball");
    expect(featureName(Feature.Encoder).key).toBe("tab.encoder");
    expect(featureName(Feature.Led).key).toBe("tab.led");
  });

  it("shows an id from newer firmware as its number rather than hiding it", () => {
    expect(featureName(UNKNOWN_ID)).toEqual({
      key: "fw.feat.unknown",
      vars: { id: "0x0B" },
    });
  });
});

describe("orderFeatures", () => {
  it("covers every known feature exactly once", () => {
    // A feature missing from the order would silently land in the unknown-id
    // tail, below the ones this app understands.
    expect([...FEATURE_DISPLAY_ORDER].sort()).toEqual(
      [...Object.values(Feature)].sort(),
    );
  });

  it("puts the table in display order, not the order the firmware sent", () => {
    // caps.c appends entries as its Kconfigs are tested, so the wire order is
    // an artefact of the build file: trackball, macros, combos, trackpad, …
    const wireOrder = [
      feat(Feature.Trackball, 3),
      feat(Feature.Macros, 1),
      feat(Feature.Combos, 1),
      feat(Feature.Trackpad, 3),
      feat(Feature.Led, 1),
      feat(Feature.ReservedLayers, 1, 4),
      feat(Feature.Timing, 1),
    ];
    expect(orderFeatures(wireOrder).map((f) => f.id)).toEqual([
      Feature.ReservedLayers,
      Feature.Trackball,
      Feature.Trackpad,
      Feature.Macros,
      Feature.Combos,
      Feature.Timing,
      Feature.Led,
    ]);
  });

  it("keeps unknown ids, last, in the order the descriptor sent them", () => {
    const ordered = orderFeatures([
      feat(0x0c, 1),
      feat(Feature.Led, 1),
      feat(UNKNOWN_ID, 1),
    ]);
    expect(ordered.map((f) => f.id)).toEqual([Feature.Led, 0x0c, UNKNOWN_ID]);
  });

  it("only reorders — nothing is added, dropped or merged", () => {
    // Absent features get no row (the table reports what the keyboard said),
    // and a duplicate id from a corrupt read is kept, because hiding it would
    // break the one view meant for diagnosing exactly that.
    const dupes = [feat(Feature.Led, 1), feat(Feature.Led, 2)];
    const ordered = orderFeatures(dupes);
    expect(ordered).toEqual(dupes);
    expect(orderFeatures([])).toEqual([]);
  });

  it("does not modify the array it was given", () => {
    const input = [feat(Feature.Led, 1), feat(Feature.Trackball, 3)];
    orderFeatures(input);
    expect(input.map((f) => f.id)).toEqual([Feature.Led, Feature.Trackball]);
  });
});

describe("decodeFeatureCaps", () => {
  it("gives a dash-worthy empty result when nothing is set", () => {
    const { badges, unknown } = decodeFeatureCaps(Feature.Macros, 0);
    expect(badges).toEqual([]);
    expect(unknown).toBe(0);
  });

  it("decodes the LED side bits", () => {
    const { badges, unknown } = decodeFeatureCaps(
      Feature.Led,
      LedCap.Left | LedCap.CentralIsLeft,
    );
    expect(badges.map((b) => b.key)).toEqual([
      "fw.bit.ledLeft",
      "fw.bit.ledCentralIsLeft",
    ]);
    expect(unknown).toBe(0);
  });

  it("decodes the coast bits, which differ per feature", () => {
    // 0x0001 under the trackball and 0x0010 under the trackpad mean the same
    // thing to a person and different bits on the wire — the table is keyed by
    // feature precisely so these cannot be confused.
    expect(
      decodeFeatureCaps(Feature.Trackball, TrackballCap.Coast).badges,
    ).toEqual([{ key: "fw.bit.coast" }]);
    expect(
      decodeFeatureCaps(Feature.Trackpad, TrackpadCap.Coast).badges,
    ).toEqual([{ key: "fw.bit.coast" }]);
    // The trackball's 0x0001 is NOT the trackpad's coast bit.
    expect(decodeFeatureCaps(Feature.Trackpad, 0x0001).badges).not.toEqual([
      { key: "fw.bit.coast" },
    ]);
  });

  it("decodes the timing split-debounce bit", () => {
    expect(
      decodeFeatureCaps(Feature.Timing, TimingCap.SplitDebounce).badges,
    ).toEqual([{ key: "fw.bit.splitDebounce" }]);
  });

  it("decodes the live-feed diag and tunnel notify bits", () => {
    expect(
      decodeFeatureCaps(Feature.LiveFeed, LiveFeedCap.Diag).badges,
    ).toEqual([{ key: "fw.bit.liveFeedDiag" }]);
    expect(
      decodeFeatureCaps(Feature.RpcTunnel, TunnelCap.Notify).badges,
    ).toEqual([{ key: "fw.bit.tunnelNotify" }]);
  });

  it("reads value fields as numbers, not flags", () => {
    // The trackpad's low nibble is a device mask and the reserved-layers word
    // is a count. Reporting either as "unknown bits" would be a false alarm.
    const tp = decodeFeatureCaps(
      Feature.Trackpad,
      TrackpadCap.Coast | 0x0003,
    );
    expect(tp.badges).toEqual([
      { key: "fw.val.tpDevices", vars: { value: 3 } },
      { key: "fw.bit.coast" },
    ]);
    expect(tp.unknown).toBe(0);

    const layers = decodeFeatureCaps(Feature.ReservedLayers, 4);
    expect(layers.badges).toEqual([{ key: "fw.val.layers", vars: { value: 4 } }]);
    expect(layers.unknown).toBe(0);
  });

  it("omits a value field that reads zero", () => {
    // Today's firmware always reports the trackpad device mask as 0 (caps.c
    // sets only COAST), and "0 pads" would be worse than saying nothing.
    expect(
      decodeFeatureCaps(Feature.Trackpad, TrackpadCap.Coast).badges,
    ).toEqual([{ key: "fw.bit.coast" }]);
    expect(decodeFeatureCaps(Feature.ReservedLayers, 0).badges).toEqual([]);
  });

  it("keeps bits it has no name for, as leftovers", () => {
    const { badges, unknown } = decodeFeatureCaps(
      Feature.Timing,
      TimingCap.SplitDebounce | 0x0040,
    );
    expect(badges).toEqual([{ key: "fw.bit.splitDebounce" }]);
    expect(unknown).toBe(0x0040);
    expect(toHex(unknown, 4)).toBe("0x0040");
  });

  it("treats every bit of an unknown feature as unknown", () => {
    // No bit table can exist for an id this app has never heard of, and
    // guessing one from another feature's numbering would be worse than hex.
    const { badges, unknown } = decodeFeatureCaps(UNKNOWN_ID, 0x0005);
    expect(badges).toEqual([]);
    expect(unknown).toBe(0x0005);
  });

  it("reports unknown bits on a feature with no bits of its own", () => {
    expect(decodeFeatureCaps(Feature.Macros, 0x0002).unknown).toBe(0x0002);
  });

  it("leaves bits above a value field's mask as unknown", () => {
    // A value field accounts for its own mask and nothing more: the layer count
    // is the low byte (TORABO_CAPS_LAYERS_MASK), so anything above it is a
    // future flag rather than part of the number.
    const above = ReservedLayersCap.LayerMask + 1; // 0x0100
    const { badges, unknown } = decodeFeatureCaps(Feature.ReservedLayers, above);
    expect(badges).toEqual([]);
    expect(unknown).toBe(0x0100);
  });
});

describe("wireInfo", () => {
  it("pairs the firmware's wire with this app's codec version", () => {
    const info = wireInfo(feat(Feature.Trackball, 3));
    expect(info.fwWire).toBe(3);
    expect(info.appWire).toBe(APP_MAX_WIRE_VER[Feature.Trackball]);
    expect(info.fwNewer).toBe(false);
  });

  it("does not flag an older firmware wire", () => {
    // The codecs answer in the version they were spoken to, so an older wire is
    // written back safely — no warning belongs on that row.
    expect(wireInfo(feat(Feature.Trackpad, 1)).fwNewer).toBe(false);
  });

  it("flags a firmware wire newer than the app's codec", () => {
    const info = wireInfo(feat(Feature.Timing, APP_MAX_WIRE_VER[Feature.Timing] + 1));
    expect(info.fwNewer).toBe(true);
    // Same condition the panels go read-only on (canWriteFeature): this flag
    // exists to explain that, so the two must agree.
    expect(info.appWire).toBe(APP_MAX_WIRE_VER[Feature.Timing]);
  });

  it("does not flag an unknown feature id", () => {
    // There is no codec for it, so there is nothing an app update would let the
    // user write — the row already says the feature itself is unknown.
    const info = wireInfo(feat(UNKNOWN_ID, 7));
    expect(info.appWire).toBeNull();
    expect(info.fwNewer).toBe(false);
  });
});

describe("wireGains", () => {
  it("tells a v1 macros firmware what v2 would add", () => {
    // The case this was written for: names live in the v2 macros wire, so on v1
    // firmware the name UI is empty and nothing else explains why.
    expect(wireGains(feat(Feature.Macros, 1))).toEqual([
      { sinceWireVer: 2, what: { key: "fw.gain.macros.names" } },
    ]);
  });

  it("says nothing once the firmware is current", () => {
    expect(wireGains(feat(Feature.Macros, MACRO_NAMES_WIRE_VER))).toEqual([]);
    expect(wireGains(feat(Feature.Trackball, 3))).toEqual([]);
    expect(wireGains(feat(Feature.Trackpad, 3))).toEqual([]);
  });

  it("tells a v2 trackball firmware about coasting", () => {
    expect(wireGains(feat(Feature.Trackball, 2))).toEqual([
      { sinceWireVer: 3, what: { key: "fw.gain.trackball.coast" } },
    ]);
    expect(wireGains(feat(Feature.Trackpad, 2))).toEqual([
      { sinceWireVer: 3, what: { key: "fw.gain.trackpad.coast" } },
    ]);
  });

  it("says nothing for a feature whose wire has never changed", () => {
    // v1-only features have no history, and the mechanism must stay silent
    // rather than inventing one.
    expect(wireGains(feat(Feature.Encoder, 1))).toEqual([]);
    expect(wireGains(feat(Feature.Combos, 1))).toEqual([]);
    expect(wireGains(feat(Feature.Timing, 1))).toEqual([]);
    expect(wireGains(feat(Feature.Led, 1))).toEqual([]);
  });

  it("says nothing about a feature this app has never heard of", () => {
    expect(wireGains(feat(UNKNOWN_ID, 1))).toEqual([]);
  });

  it("matches the codecs the versions were read off", () => {
    // The table is hand-maintained (this module must not import a codec), so
    // this is what catches it drifting from the wires it describes — the same
    // trick toraboCaps.test.ts plays on APP_MAX_WIRE_VER.
    expect(wireGains(feat(Feature.Trackball, 2))[0].sinceWireVer).toBe(
      ZTC_VERSION_V3,
    );
    expect(wireGains(feat(Feature.Trackpad, 2))[0].sinceWireVer).toBe(
      TP_VERSION_V3,
    );
    expect(wireGains(feat(Feature.Macros, 1))[0].sinceWireVer).toBe(
      DM_VERSION_V2,
    );
  });
});

describe("formatRawDescriptor", () => {
  const raw = new Uint8Array([
    // header: magic, descVer 1, fw 0.5.0, 2 features, _rsv
    CAPS_MAGIC & 0xff,
    CAPS_MAGIC >> 8,
    1,
    0,
    5,
    0,
    2,
    0,
    // trackball v3, coast
    Feature.Trackball,
    3,
    0x01,
    0x00,
    // timing v1, split debounce
    Feature.Timing,
    1,
    0x01,
    0x00,
  ]);

  it("groups the bytes the way the wire is laid out", () => {
    const view = formatRawDescriptor(raw);
    expect(view.header).toBe("54 43 01 00 05 00 02 00");
    expect(view.entries).toEqual(["01 03 01 00", "0A 01 01 00"]);
    expect(view.trailing).toBeNull();
  });

  it("shows bytes parked after the feature table", () => {
    // Contract rule 4 lets a future firmware append after the table; the
    // decoder ignores them, so this view is the only place they are visible.
    const padded = new Uint8Array([...raw, 0xde, 0xad]);
    expect(formatRawDescriptor(padded).trailing).toBe("DE AD");
  });

  it("survives a buffer shorter than its own feature count", () => {
    // Never the thing that throws while someone is trying to file a report,
    // even though the panel only shows bytes a successful decode came from.
    const truncated = raw.subarray(0, CAPS_HDR + CAPS_FEAT);
    const view = formatRawDescriptor(truncated);
    expect(view.entries).toEqual(["01 03 01 00"]);
    expect(view.trailing).toBeNull();

    const headerOnly = formatRawDescriptor(new Uint8Array([0x54, 0x43]));
    expect(headerOnly.header).toBe("54 43");
    expect(headerOnly.entries).toEqual([]);
  });
});
