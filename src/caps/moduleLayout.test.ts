/**
 * Tests for the module-layout derivation.
 *
 * The rules under test are all about the difference between what the firmware
 * REPORTS and what the app would like to know — so most of these check that
 * something is NOT claimed: a trackball is not put in a half, an unreadable
 * trackpad wire does not empty the grid, an LED-less extension base is still
 * found. Bit and meta meanings are checked against
 * torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h and
 * .../trackpad/include/zmk_trackpad_config/config.h.
 */
import { describe, it, expect } from "vitest";

import {
  LayoutSide,
  ModuleLayout,
  SplitRole,
  deriveModuleLayout,
  sideRole,
  vacantCells,
} from "./moduleLayout";
import {
  CapsSide,
  Feature,
  FeatureInfo,
  LedCap,
  ModuleKind,
  ToraboCaps,
  TrackballCap,
  TrackpadCap,
} from "./toraboCaps";
import { TpConn, TpKind, TpSide, encodeMeta } from "../trackpad/tpConfigV2";

/** A Feature.Modules row's caps word from the four slot kinds, in the fixed
 * left-std/left-ext/right-std/right-ext order moduleSlots() decodes. */
function modulesCaps(
  leftStd: ModuleKind,
  leftExt: ModuleKind,
  rightStd: ModuleKind,
  rightExt: ModuleKind,
): number {
  return leftStd | (leftExt << 4) | (rightStd << 8) | (rightExt << 12);
}

function caps(
  features: { id: number; wireVer?: number; caps?: number }[],
  /** `_rsv` bit0-1. Omitted = CapsSide.Unknown, matching every
   * pre-declaration descriptor byte-for-byte. */
  hdrCentralSide?: CapsSide,
): ToraboCaps {
  return {
    descVersion: 1,
    fw: { major: 0, minor: 5, patch: 0 },
    hdrCentralSide,
    features: features.map(
      (f): FeatureInfo => ({
        id: f.id as Feature,
        wireVer: f.wireVer ?? 1,
        caps: f.caps ?? 0,
      }),
    ),
  };
}

/** The meta byte as the firmware builder emits it (TP_META in config.h). */
const meta = (side: number, conn: number, kind: number) =>
  encodeMeta({
    side: side as never,
    conn: conn as never,
    kind: kind as never,
  });

function cell(layout: ModuleLayout, side: LayoutSide, conn: number) {
  return layout.cells.find((c) => c.side === side && c.conn === conn)!;
}

function keys(layout: ModuleLayout, side: LayoutSide, conn: number) {
  return cell(layout, side, conn).items.map((i) => i.key);
}

describe("deriveModuleLayout: the descriptor", () => {
  it("derives nothing at all without a descriptor", () => {
    // Pre-capabilities firmware, or a read still in flight. Four empty cells
    // would be a claim about the hardware; null is the admission that we never
    // got to ask.
    expect(deriveModuleLayout(null, null)).toBeNull();
    expect(deriveModuleLayout(null, [{ deviceId: 0, meta: 25 }])).toBeNull();
  });

  it("always lays out the same four cells", () => {
    const layout = deriveModuleLayout(caps([]), null)!;
    expect(layout.cells.map((c) => [c.side, c.conn])).toEqual([
      [TpSide.Left, TpConn.Standard],
      [TpSide.Left, TpConn.Extension],
      [TpSide.Right, TpConn.Standard],
      [TpSide.Right, TpConn.Extension],
    ]);
    expect(layout.cells.every((c) => c.items.length === 0)).toBe(true);
    expect(layout.unplaced).toEqual([]);
  });
});

describe("deriveModuleLayout: the meta byte", () => {
  it("places a device from its side/conn/kind", () => {
    // 25 = 0b011001: side 1 (left), conn 2 (ext), kind 1 (pad).
    const left = meta(TpSide.Left, TpConn.Extension, TpKind.Trackpad);
    expect(left).toBe(25);
    // 26 = 0b011010: side 2 (right), same connector and kind.
    const right = meta(TpSide.Right, TpConn.Extension, TpKind.Trackpad);
    expect(right).toBe(26);

    const layout = deriveModuleLayout(caps([{ id: Feature.Trackpad, wireVer: 3 }]), [
      { deviceId: 0, meta: left },
      { deviceId: 1, meta: right },
    ])!;
    expect(keys(layout, TpSide.Left, TpConn.Extension)).toEqual([
      "tp.kind.trackpad",
    ]);
    expect(keys(layout, TpSide.Right, TpConn.Extension)).toEqual([
      "tp.kind.trackpad",
    ]);
    expect(keys(layout, TpSide.Left, TpConn.Standard)).toEqual([]);
  });

  it("places a device on the standard connector", () => {
    const layout = deriveModuleLayout(caps([{ id: Feature.Trackpad }]), [
      { deviceId: 0, meta: meta(TpSide.Left, TpConn.Standard, TpKind.Trackball) },
    ])!;
    expect(keys(layout, TpSide.Left, TpConn.Standard)).toEqual([
      "tp.kind.trackball",
    ]);
    expect(layout.extBase[TpSide.Left]).toBe(false);
  });

  it("falls back to the wire slot when the firmware describes nothing", () => {
    // meta 0 is pre-meta firmware. The trackpad panel calls that device
    // "デバイス N" and so does this — one convention, not two.
    const layout = deriveModuleLayout(caps([{ id: Feature.Trackpad }]), [
      { deviceId: 1, meta: 0 },
    ])!;
    expect(layout.unplaced).toEqual([
      { key: "tp.device.fallback", vars: { n: 1 } },
    ]);
    expect(layout.cells.every((c) => c.items.length === 0)).toBe(true);
  });

  it("lists a half-described device rather than guessing the rest", () => {
    // Kind known, side not: it is a pad, somewhere. Placing it would invent the
    // half; dropping it would lose a device the keyboard actually reported.
    const half = meta(TpSide.Unknown, TpConn.Extension, TpKind.Trackpad);
    const layout = deriveModuleLayout(caps([{ id: Feature.Trackpad }]), [
      { deviceId: 0, meta: half },
    ])!;
    expect(layout.unplaced).toEqual([{ key: "tp.kind.trackpad" }]);
  });
});

describe("deriveModuleLayout: the LED bits", () => {
  it("puts an LED board on each half that reports one", () => {
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Led, caps: LedCap.Left | LedCap.Right }]),
      null,
    )!;
    expect(keys(layout, TpSide.Left, TpConn.Extension)).toEqual(["fw.mod.led"]);
    expect(keys(layout, TpSide.Right, TpConn.Extension)).toEqual(["fw.mod.led"]);
    // An LED only exists on an extension base, so it proves the base too.
    expect(layout.extBase).toEqual({
      [TpSide.Left]: true,
      [TpSide.Right]: true,
    });
  });

  it("finds an extension base the LED bits cannot see", () => {
    // THE BLIND SPOT: a base with no LED on it sets no caps bit. A device
    // reported on the extension connector is the other way to know it is there.
    const layout = deriveModuleLayout(
      caps([
        { id: Feature.Led, caps: LedCap.Left }, // right half: no LED bit
        { id: Feature.Trackpad, wireVer: 3, caps: TrackpadCap.Coast },
      ]),
      [{ deviceId: 1, meta: meta(TpSide.Right, TpConn.Extension, TpKind.Trackpad) }],
    )!;
    expect(layout.extBase[TpSide.Right]).toBe(true);
    expect(keys(layout, TpSide.Right, TpConn.Extension)).toEqual([
      "tp.kind.trackpad",
    ]);
    // …and the left half's base is known from the LED bit alone.
    expect(layout.extBase[TpSide.Left]).toBe(true);
  });

  it("reads the central half from the LED caps word", () => {
    const isLeft = deriveModuleLayout(
      caps([{ id: Feature.Led, caps: LedCap.Right | LedCap.CentralIsLeft }]),
      null,
    )!;
    expect(isLeft.central).toBe(TpSide.Left);

    // A cleared bit inside a present LED entry is a statement, not silence.
    const isRight = deriveModuleLayout(
      caps([{ id: Feature.Led, caps: LedCap.Right }]),
      null,
    )!;
    expect(isRight.central).toBe(TpSide.Right);

    // No LED module: the firmware never said, so neither do we.
    expect(deriveModuleLayout(caps([{ id: Feature.Trackpad }]), null)!.central)
      .toBeNull();
  });
});

describe("sideRole", () => {
  it("uses the ZMK words, spelled out, in every language", () => {
    // The screen shows these verbatim in ja as well as en — see the constant's
    // comment. A shortened "Periph" would stop matching the config it names.
    expect(SplitRole.Central).toBe("Central");
    expect(SplitRole.Peripheral).toBe("Peripheral");
  });

  it("makes the left half Central when the caps bit is set", () => {
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Led, caps: LedCap.Left | LedCap.CentralIsLeft }]),
      null,
    )!;
    expect(sideRole(layout.central, TpSide.Left)).toBe(SplitRole.Central);
    expect(sideRole(layout.central, TpSide.Right)).toBe(SplitRole.Peripheral);
  });

  it("makes the right half Central when the bit is clear but LED is present", () => {
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Led, caps: LedCap.Left }]),
      null,
    )!;
    expect(sideRole(layout.central, TpSide.Right)).toBe(SplitRole.Central);
    expect(sideRole(layout.central, TpSide.Left)).toBe(SplitRole.Peripheral);
  });

  it("omits both roles when the descriptor has no LED feature", () => {
    // The connection proves SOME half is the central, never which — and the
    // "central is usually the right" convention is not evidence.
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Trackball, wireVer: 3 }]),
      null,
    )!;
    expect(sideRole(layout.central, TpSide.Left)).toBeNull();
    expect(sideRole(layout.central, TpSide.Right)).toBeNull();
  });
});

describe("deriveModuleLayout: the trackball", () => {
  it("seats it on the central's standard FFC when the central is known", () => {
    // The inference the section's "推定" framing buys: every buildable
    // torabo-tsuki puts the ball on the central's standard connector.
    const layout = deriveModuleLayout(
      caps([
        { id: Feature.Trackball, wireVer: 3 },
        { id: Feature.Led, caps: LedCap.Right }, // no CENTRAL_IS_LEFT => right
      ]),
      null,
    )!;
    expect(layout.central).toBe(TpSide.Right);
    expect(cell(layout, TpSide.Right, TpConn.Standard).items).toEqual([
      { key: "tp.kind.trackball", inferred: true },
    ]);
    expect(layout.unplaced).toEqual([]);
    // Left half untouched: the inference names one seat, not a pair.
    expect(keys(layout, TpSide.Left, TpConn.Standard)).toEqual([]);
  });

  it("follows the central to the left half when the bit says so", () => {
    const layout = deriveModuleLayout(
      caps([
        { id: Feature.Trackball, wireVer: 3 },
        { id: Feature.Led, caps: LedCap.Left | LedCap.CentralIsLeft },
      ]),
      null,
    )!;
    expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([
      { key: "tp.kind.trackball", inferred: true },
    ]);
  });

  it("leaves it unplaced when the central is unknown", () => {
    // No LED module, so nothing reports which half is which. The connector is
    // still a fact (PATTERN-MATRIX rule 2), the half is not, and there is no
    // seat to infer — it is not put in either standard cell.
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Trackball, wireVer: 3 }]),
      null,
    )!;
    expect(layout.central).toBeNull();
    expect(layout.unplaced).toEqual([{ key: "fw.mod.trackball" }]);
    expect(layout.cells.every((c) => c.items.length === 0)).toBe(true);
  });

  it("gives way when the wire already put something on that connector", () => {
    // One connector, one device: a reported device beats a deduced one, and the
    // contradiction drops the ball back to the unplaced list rather than
    // stacking two modules on one FFC.
    const layout = deriveModuleLayout(
      caps([
        { id: Feature.Trackball, wireVer: 3 },
        { id: Feature.Trackpad },
        { id: Feature.Led, caps: LedCap.Right },
      ]),
      [{ deviceId: 0, meta: meta(TpSide.Right, TpConn.Standard, TpKind.Trackpad) }],
    )!;
    expect(keys(layout, TpSide.Right, TpConn.Standard)).toEqual([
      "tp.kind.trackpad",
    ]);
    expect(layout.unplaced).toEqual([{ key: "fw.mod.trackball" }]);
  });

  it("does not name the trackball twice when the trackpad wire placed one", () => {
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Trackball, wireVer: 3 }, { id: Feature.Trackpad }]),
      [{ deviceId: 0, meta: meta(TpSide.Right, TpConn.Standard, TpKind.Trackball) }],
    )!;
    expect(layout.unplaced).toEqual([]);
    expect(cell(layout, TpSide.Right, TpConn.Standard).items).toEqual([
      // Reported by the firmware, so NOT marked as an inference.
      { key: "tp.kind.trackball" },
    ]);
  });
});

describe("vacantCells", () => {
  it("returns every cell when nothing is taken", () => {
    expect(vacantCells([])).toHaveLength(4);
  });

  it("ignores nothing but exact matches", () => {
    const left = vacantCells([{ side: TpSide.Left, conn: TpConn.Extension }]);
    expect(left).toHaveLength(3);
    expect(
      left.some((c) => c.side === TpSide.Left && c.conn === TpConn.Extension),
    ).toBe(false);
    // Same connector, other half: still free.
    expect(
      left.some((c) => c.side === TpSide.Right && c.conn === TpConn.Extension),
    ).toBe(true);
  });
});

describe("deriveModuleLayout: the encoder, by elimination", () => {
  it("places it in the one cell left over", () => {
    // The real configuration this was written for: a pad on each extension,
    // the ball on the central's standard FFC. Three of the four seats are
    // taken, so the encoder can only be on the peripheral's standard FFC.
    const layout = deriveModuleLayout(
      caps([
        { id: Feature.Encoder },
        { id: Feature.Trackball, wireVer: 3 },
        { id: Feature.Trackpad, wireVer: 3 },
        { id: Feature.Led, caps: LedCap.Left | LedCap.Right }, // central = right
      ]),
      [
        { deviceId: 0, meta: meta(TpSide.Left, TpConn.Extension, TpKind.Trackpad) },
        { deviceId: 1, meta: meta(TpSide.Right, TpConn.Extension, TpKind.Trackpad) },
      ],
    )!;
    expect(cell(layout, TpSide.Right, TpConn.Standard).items).toEqual([
      { key: "tp.kind.trackball", inferred: true },
    ]);
    expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([
      { key: "tp.kind.encoder", inferred: true },
    ]);
    expect(layout.unplaced).toEqual([]);
  });

  it("stays unplaced while more than one cell could hold it", () => {
    // Nothing on the extensions: the ball takes one seat and three remain, so
    // there is no answer to give — and three-way guessing is not one.
    const layout = deriveModuleLayout(
      caps([
        { id: Feature.Encoder },
        { id: Feature.Trackball, wireVer: 3 },
        { id: Feature.Led, caps: LedCap.Right },
      ]),
      null,
    )!;
    expect(layout.unplaced).toEqual([{ key: "fw.mod.encoder" }]);
    expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([]);
  });

  it("reports it with no position when nothing at all is known", () => {
    // Verified against src/encoder/encConfig.ts: the encoder wire is magic,
    // version, layerCount and bindings — there is no placement field to use,
    // and with four free cells elimination has nothing to eliminate.
    const layout = deriveModuleLayout(caps([{ id: Feature.Encoder }]), null)!;
    expect(layout.unplaced).toEqual([{ key: "fw.mod.encoder" }]);
    expect(layout.cells.every((c) => c.items.length === 0)).toBe(true);
  });

  it("says nothing when the build has no encoder", () => {
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Trackpad }, { id: Feature.Led, caps: LedCap.Right }]),
      [
        { deviceId: 0, meta: meta(TpSide.Left, TpConn.Extension, TpKind.Trackpad) },
        { deviceId: 1, meta: meta(TpSide.Right, TpConn.Extension, TpKind.Trackpad) },
      ],
    )!;
    // Three cells are free, but nothing is looking for a seat.
    expect(layout.unplaced).toEqual([]);
    expect(keys(layout, TpSide.Left, TpConn.Standard)).toEqual([]);
    expect(keys(layout, TpSide.Right, TpConn.Standard)).toEqual([]);
  });

  it("does not name the encoder twice when it is on the trackpad wire", () => {
    const layout = deriveModuleLayout(
      caps([{ id: Feature.Encoder }, { id: Feature.Trackpad }]),
      [{ deviceId: 1, meta: meta(TpSide.Left, TpConn.Extension, TpKind.Encoder) }],
    )!;
    expect(layout.unplaced).toEqual([]);
    expect(cell(layout, TpSide.Left, TpConn.Extension).items).toEqual([
      { key: "tp.kind.encoder" },
    ]);
  });
});

describe("deriveModuleLayout: degraded reads", () => {
  it("keeps the LED-derived picture when the trackpad read fails", () => {
    const layout = deriveModuleLayout(
      caps([
        { id: Feature.Trackpad, wireVer: 3 },
        { id: Feature.Led, caps: LedCap.Right },
      ]),
      null,
      { tpReadFailed: true },
    )!;
    expect(layout.notes).toEqual([{ key: "fw.mod.tpReadFailed" }]);
    expect(keys(layout, TpSide.Right, TpConn.Extension)).toEqual(["fw.mod.led"]);
  });

  it("says the placement read is still pending, but only if there is one", () => {
    expect(
      deriveModuleLayout(caps([{ id: Feature.Trackpad }]), null)!.notes,
    ).toEqual([{ key: "fw.mod.tpPending" }]);
    // No trackpad feature: nothing to wait for, so no note.
    expect(deriveModuleLayout(caps([{ id: Feature.Led }]), null)!.notes).toEqual(
      [],
    );
    // Read finished, no devices on the wire: also nothing to say.
    expect(deriveModuleLayout(caps([{ id: Feature.Trackpad }]), [])!.notes).toEqual(
      [],
    );
  });
});

/**
 * Feature.Modules (id 11, TORABO_FEAT_MODULES, redesigned 2026-09-04): the
 * firmware may now DECLARE central side (header `_rsv`, unchanged) and, in
 * ONE unified caps word, what each of the four connectors carries — instead
 * of this module having to infer it. Declared pad/ball/encoder slots render
 * as REPORTS (no `inferred: true`, i.e. a solid badge in FirmwareInfoPanel),
 * same as a device the trackpad wire itself placed; a declared "None" (4)
 * renders as its own subdued marker and blocks inference from landing there.
 * Golden word is the real descriptor observed on hardware: 0x1213 = encoder
 * on left standard, pad on left extension, ball on right standard, pad on
 * right extension.
 */
describe("deriveModuleLayout: Feature.Modules declaration", () => {
  describe("central side: header _rsv takes priority over the LED bit", () => {
    it("prefers _rsv over a contradicting LED CentralIsLeft bit", () => {
      const layout = deriveModuleLayout(
        caps(
          [{ id: Feature.Led, caps: LedCap.Left | LedCap.CentralIsLeft }],
          CapsSide.Right, // _rsv says Right even though the LED bit says Left
        ),
        null,
      )!;
      expect(layout.central).toBe(TpSide.Right);
    });

    it("falls back to the LED bit when _rsv is Unknown (pre-declaration firmware)", () => {
      const layout = deriveModuleLayout(
        caps(
          [{ id: Feature.Led, caps: LedCap.Left | LedCap.CentralIsLeft }],
          CapsSide.Unknown,
        ),
        null,
      )!;
      expect(layout.central).toBe(TpSide.Left);
    });

    it("reports central from _rsv alone, with no LED module in the build at all", () => {
      // The hole this closes: an LED-less build has no LedCap entry to fall
      // back to, but _rsv is independent of any feature.
      const layout = deriveModuleLayout(
        caps([{ id: Feature.Trackball, wireVer: 3 }], CapsSide.Right),
        null,
      )!;
      expect(layout.central).toBe(TpSide.Right);
    });
  });

  describe("golden: 0x1213 reports all four cells, undashed", () => {
    it("places encoder/pad/ball/pad exactly where declared, no unplaced, no inference", () => {
      const layout = deriveModuleLayout(
        caps([{ id: Feature.Modules, caps: 0x1213 }]),
        null,
      )!;
      expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([
        { key: "tp.kind.encoder" },
      ]);
      expect(cell(layout, TpSide.Left, TpConn.Extension).items).toEqual([
        { key: "tp.kind.trackpad" },
      ]);
      expect(cell(layout, TpSide.Right, TpConn.Standard).items).toEqual([
        { key: "tp.kind.trackball" },
      ]);
      expect(cell(layout, TpSide.Right, TpConn.Extension).items).toEqual([
        { key: "tp.kind.trackpad" },
      ]);
      expect(layout.unplaced).toEqual([]);
      // None of the four cells carry `inferred: true` — nothing here is a guess.
      for (const c of layout.cells) {
        expect(c.items.every((i) => !i.inferred)).toBe(true);
      }
    });

    it("does not need `central` at all once every slot is declared", () => {
      // Unlike the pre-declaration inference, a declared slot does not depend
      // on knowing which half is central — it names its own connector directly.
      const layout = deriveModuleLayout(
        caps([{ id: Feature.Modules, caps: 0x1213 }]), // no LED, no _rsv
        null,
      )!;
      expect(layout.central).toBeNull();
      expect(cell(layout, TpSide.Right, TpConn.Standard).items).toEqual([
        { key: "tp.kind.trackball" },
      ]);
    });
  });

  describe("None (4): an explicit empty marker that blocks inference", () => {
    it("renders as a subdued, non-inferred marker", () => {
      const layout = deriveModuleLayout(
        caps([{ id: Feature.Modules, caps: modulesCaps(ModuleKind.None, 0, 0, 0) }]),
        null,
      )!;
      expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([
        { key: "fw.mod.none", empty: true },
      ]);
    });

    it("suppresses the trackball's central-seat inference at that cell", () => {
      // Central is the left half; leftStd is declared None. Without the
      // declaration this would be exactly the "seats it on the central's
      // standard FFC" case (see the trackball describe block above) — the
      // None here must stop that from happening.
      const layout = deriveModuleLayout(
        caps(
          [
            { id: Feature.Trackball, wireVer: 3 },
            { id: Feature.Modules, caps: modulesCaps(ModuleKind.None, 0, 0, 0) },
          ],
          CapsSide.Left,
        ),
        null,
      )!;
      expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([
        { key: "fw.mod.none", empty: true },
      ]);
      expect(layout.unplaced).toEqual([{ key: "fw.mod.trackball" }]);
    });

    it("suppresses the encoder's elimination inference at that cell", () => {
      // Three of four cells taken by trackpad-wire pads; the fourth (left
      // standard) is declared None instead of being left for the encoder's
      // one-cell-left elimination to claim.
      const layout = deriveModuleLayout(
        caps([
          { id: Feature.Encoder },
          { id: Feature.Modules, caps: modulesCaps(ModuleKind.None, 0, 0, 0) },
        ]),
        [
          { deviceId: 0, meta: meta(TpSide.Left, TpConn.Extension, TpKind.Trackpad) },
          { deviceId: 1, meta: meta(TpSide.Right, TpConn.Extension, TpKind.Trackpad) },
          { deviceId: 2, meta: meta(TpSide.Right, TpConn.Standard, TpKind.Trackpad) },
        ],
      )!;
      expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([
        { key: "fw.mod.none", empty: true },
      ]);
      expect(layout.unplaced).toEqual([{ key: "fw.mod.encoder" }]);
    });
  });

  describe("falls back to the pre-declaration estimate when every slot is 0", () => {
    it("trackball: seats it on the central's standard FFC, same as an absent row", () => {
      const layout = deriveModuleLayout(
        caps(
          [
            { id: Feature.Trackball, wireVer: 3, caps: TrackballCap.Coast },
            { id: Feature.Modules, caps: 0x0000 },
            { id: Feature.Led, caps: LedCap.Right },
          ],
          undefined,
        ),
        null,
      )!;
      expect(cell(layout, TpSide.Right, TpConn.Standard).items).toEqual([
        { key: "tp.kind.trackball", inferred: true },
      ]);
    });

    it("encoder: falls back to elimination", () => {
      const layout = deriveModuleLayout(
        caps([
          { id: Feature.Encoder },
          { id: Feature.Trackball, wireVer: 3 },
          { id: Feature.Modules, caps: 0x0000 },
          { id: Feature.Led, caps: LedCap.Left | LedCap.Right }, // central = right
        ]),
        [
          { deviceId: 0, meta: meta(TpSide.Left, TpConn.Extension, TpKind.Trackpad) },
          { deviceId: 1, meta: meta(TpSide.Right, TpConn.Extension, TpKind.Trackpad) },
        ],
      )!;
      expect(cell(layout, TpSide.Left, TpConn.Standard).items).toEqual([
        { key: "tp.kind.encoder", inferred: true },
      ]);
    });
  });

  describe("dedupe against the trackpad wire: same connector, same physical device", () => {
    it("a declared pad matching the wire's own report is not stacked", () => {
      const layout = deriveModuleLayout(
        caps([
          { id: Feature.Trackpad, wireVer: 3 },
          { id: Feature.Modules, caps: modulesCaps(0, ModuleKind.Pad, 0, 0) },
        ]),
        [{ deviceId: 0, meta: meta(TpSide.Left, TpConn.Extension, TpKind.Trackpad) }],
      )!;
      // One badge, not two — and it is the wire's own richer label.
      expect(keys(layout, TpSide.Left, TpConn.Extension)).toEqual([
        "tp.kind.trackpad",
      ]);
      expect(layout.unplaced).toEqual([]);
    });

    it("guard: a declared ball that contradicts a trackpad-wire pad on the same connector is not placed twice", () => {
      // One connector, one device. The trackpad wire already reported a pad
      // on the right standard FFC; Feature.Modules also declares a ball
      // there. That is a genuine contradiction in what the firmware sent —
      // the section cannot show two modules in one cell, so the declared
      // ball is dropped to the unplaced list instead of overwriting the
      // wire's own report.
      const layout = deriveModuleLayout(
        caps([
          { id: Feature.Trackball, wireVer: 3 },
          { id: Feature.Trackpad, wireVer: 3 },
          { id: Feature.Modules, caps: modulesCaps(0, 0, ModuleKind.Ball, 0) },
        ]),
        [{ deviceId: 0, meta: meta(TpSide.Right, TpConn.Standard, TpKind.Trackpad) }],
      )!;
      expect(keys(layout, TpSide.Right, TpConn.Standard)).toEqual([
        "tp.kind.trackpad",
      ]);
      expect(layout.unplaced).toEqual([{ key: "fw.mod.trackball" }]);
    });

    it("guard: a declared encoder that contradicts a trackpad-wire pad on the same connector is not placed twice", () => {
      const layout = deriveModuleLayout(
        caps([
          { id: Feature.Encoder },
          { id: Feature.Trackpad, wireVer: 3 },
          { id: Feature.Modules, caps: modulesCaps(0, ModuleKind.Encoder, 0, 0) },
        ]),
        [{ deviceId: 0, meta: meta(TpSide.Left, TpConn.Extension, TpKind.Trackpad) }],
      )!;
      expect(keys(layout, TpSide.Left, TpConn.Extension)).toEqual([
        "tp.kind.trackpad",
      ]);
      expect(layout.unplaced).toEqual([{ key: "fw.mod.encoder" }]);
    });
  });

  describe("row absent entirely (older firmware)", () => {
    it("behaves exactly like caps 0x0000 — full inference", () => {
      const layout = deriveModuleLayout(
        caps([
          { id: Feature.Trackball, wireVer: 3, caps: TrackballCap.Coast },
          { id: Feature.Led, caps: LedCap.Right },
        ]),
        null,
      )!;
      expect(cell(layout, TpSide.Right, TpConn.Standard).items).toEqual([
        { key: "tp.kind.trackball", inferred: true },
      ]);
    });
  });
});
