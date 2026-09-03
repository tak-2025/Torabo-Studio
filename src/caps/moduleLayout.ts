/**
 * "Which physical modules is this firmware built for, and where are they?"
 *
 * WHAT THIS CAN AND CANNOT KNOW — read this before adding a rule.
 *
 * The keyboard never sends a parts list. This derives one from two things it
 * DOES send, and the two know different amounts:
 *
 *   1. The LED caps bits (TORABO_CAPS_LED_LEFT / _RIGHT / _CENTRAL_IS_LEFT in
 *      caps.h). They say which halves have an LED extension board, and which
 *      half is the split central. Their blind spot: an extension base with no
 *      LED on it is invisible here — the bits are about the LED, not the board
 *      it rides. So base presence is derived from these bits OR from a device
 *      reported on the extension connector, never from the bits alone.
 *
 *   2. The trackpad wire's per-device meta byte
 *      (torabo-tsuki_ext_FW/trackpad/include/zmk_trackpad_config/config.h,
 *      TP_META_*). This is the authoritative placement: side, connector and
 *      kind, straight from the build's Kconfig. It covers only devices on that
 *      wire, and firmware older than the meta byte sends 0 = unknown.
 *
 * And what neither can tell:
 *
 *   - Feature.Trackball (caps id 1) says the SPI trackball module is compiled
 *     in. Nothing in caps or the ztc wire says which half it is on.
 *   - Feature.Encoder (caps id 5) says the encoder config module is compiled
 *     in. Its wire (src/encoder/encConfig.ts) is magic/version/layerCount and
 *     then bindings — VERIFIED to carry no placement of any kind. (A rotary
 *     encoder wired as a trackpad-wire DEVICE is a different thing and does
 *     come with a meta byte; that one lands in a cell like any other device.)
 *
 * REPORT VS INFERENCE
 * Those last two are placed anyway, by the rules in steps 3 and 4 below: the
 * ball onto the central's standard FFC, the encoder onto whatever single cell
 * is left once the taken ones are ruled out. That is sound only because the
 * section presents itself as an estimate (fw.mod.desc, 「FW情報から推定して
 * います。」) — and only as long as the two are not passed off as reports. So
 * every inferred item carries `inferred: true` and the panel renders it
 * differently, and an inference that runs out of certainty (central unknown,
 * two candidate cells) falls back to the unplaced list rather than picking.
 *
 * Hence the shape below: a 2x2 grid of what is placed or deduced, a list of
 * what is present but unplaceable, and notes for what could not be read. An
 * empty cell means "nothing known here", never "there is nothing here" — the
 * panel says so, because that is the difference between this and a parts list.
 *
 * Pure, and returns message keys like fwInfo.ts, so the rules can be tested
 * without a React tree.
 */

import {
  Feature,
  LedCap,
  ToraboCaps,
  featureInfo,
  hasFeature,
  ledSides,
} from "./toraboCaps";
import type { Msg } from "./fwInfo";
import { TpConn, TpKind, TpSide, decodeMeta } from "../trackpad/tpConfigV2";

/** The two halves and the two connectors the grid is built from. Reusing the
 * trackpad wire's own vocabulary rather than a second set of names: they are
 * the same sides and the same connectors, and this module's whole job is to
 * put that wire's devices somewhere. */
export type LayoutSide = typeof TpSide.Left | typeof TpSide.Right;
export type LayoutConn = typeof TpConn.Standard | typeof TpConn.Extension;

/**
 * The two roles in a split keyboard: the half that talks to the host, and the
 * half that talks to it.
 *
 * Deliberately English in BOTH languages, and spelled out — "Peripheral", never
 * "Periph". They are the terms ZMK's own configuration and documentation use
 * (CONFIG_ZMK_SPLIT_ROLE_CENTRAL, split central/peripheral), so anyone matching
 * this screen against a build file or an issue thread sees the same word. A
 * translated role would have to be translated back before it was useful.
 */
export const SplitRole = {
  Central: "Central",
  Peripheral: "Peripheral",
} as const;
export type SplitRole = (typeof SplitRole)[keyof typeof SplitRole];

/**
 * Which role a half plays, or null when the firmware never said.
 *
 * Null is not a gap to fill in: a live connection proves that SOME half is the
 * central, never which one, and the only report on the subject is the LED caps
 * bit (see `central` below). Annotating both halves from a convention — "the
 * central is usually the right" — would put a guess in the same typeface as the
 * facts around it.
 */
export function sideRole(
  central: LayoutSide | null,
  side: LayoutSide,
): SplitRole | null {
  if (central === null) return null;
  return side === central ? SplitRole.Central : SplitRole.Peripheral;
}

/**
 * One module shown in a cell.
 *
 * `inferred` separates the two kinds of statement this section makes: a device
 * the firmware placed by its meta byte is a report, while a trackball or an
 * encoder put in a cell by the rules below is a deduction from what the build
 * can be. Both are worth showing; presenting them in the same typeface would
 * not be. The panel renders inferred items differently for that reason.
 */
export interface LayoutItem extends Msg {
  inferred?: boolean;
}

export interface LayoutCell {
  side: LayoutSide;
  conn: LayoutConn;
  /** What is known to be at this position. Empty = nothing reported and
   * nothing deducible. */
  items: LayoutItem[];
}

/** A cell address, for the elimination below. */
export interface CellRef {
  side: LayoutSide;
  conn: LayoutConn;
}

/**
 * The cells with no DEVICE in them.
 *
 * "Device" is the operative word: each connector carries one pointing
 * device/encoder, so a cell holding one is closed to another. An LED board is
 * not a device — it rides the extension base alongside whatever else is there —
 * so it never eliminates a cell.
 *
 * Exported so the elimination can be tested as arithmetic rather than through
 * the whole derivation.
 */
export function vacantCells(occupied: CellRef[]): CellRef[] {
  return CELLS.filter(
    (c) => !occupied.some((o) => o.side === c.side && o.conn === c.conn),
  );
}

export interface ModuleLayout {
  /** Always four, in a fixed order: left/std, left/ext, right/std, right/ext. */
  cells: LayoutCell[];
  /** An extension base board is known to be on this half — from the LED bit or
   * from a device on the extension connector. False means "not reported",
   * which is not the same as "not fitted". */
  extBase: Record<LayoutSide, boolean>;
  /** Which half the firmware says is the split central, when it says. */
  central: LayoutSide | null;
  /** Present, but the firmware does not report where. */
  unplaced: Msg[];
  /** Why part of the picture is missing (a failed or pending trackpad read). */
  notes: Msg[];
}

/** Fixed cell order, so the grid renders the same way every time. */
const CELLS: { side: LayoutSide; conn: LayoutConn }[] = [
  { side: TpSide.Left, conn: TpConn.Standard },
  { side: TpSide.Left, conn: TpConn.Extension },
  { side: TpSide.Right, conn: TpConn.Standard },
  { side: TpSide.Right, conn: TpConn.Extension },
];

/** Same key set describeDevice() uses in tpConfigV2.ts — one wire, one set of
 * names for the things on it. */
const KIND_KEYS: Record<number, string> = {
  [TpKind.Trackpad]: "tp.kind.trackpad",
  [TpKind.Trackball]: "tp.kind.trackball",
  [TpKind.Encoder]: "tp.kind.encoder",
};

/** One device on the trackpad wire, as much of it as this module needs. */
export interface LayoutDevice {
  deviceId: number;
  /** The raw meta byte. 0 = firmware that predates it, or a build that could
   * not describe the device. */
  meta: number;
}

/**
 * Label a device by what it is, falling back to the wire slot exactly as the
 * trackpad panel's device picker does (tp.device.fallback, "デバイス N"). The
 * fallback is the whole point of the meta byte being optional: an unlabelled
 * device is still a device, and hiding it would be worse than naming it dully.
 */
function deviceLabel(dev: LayoutDevice): Msg {
  const key = KIND_KEYS[decodeMeta(dev.meta).kind];
  return key ? { key } : { key: "tp.device.fallback", vars: { n: dev.deviceId } };
}

function isSide(v: number): v is LayoutSide {
  return v === TpSide.Left || v === TpSide.Right;
}

function isConn(v: number): v is LayoutConn {
  return v === TpConn.Standard || v === TpConn.Extension;
}

export interface DeriveOptions {
  /**
   * The trackpad read threw. The grid then shows only what the caps bits knew,
   * and says so — the alternative, an empty grid with no explanation, reads as
   * "this keyboard has nothing on it".
   */
  tpReadFailed?: boolean;
}

/**
 * Derive the layout.
 *
 * @param caps the descriptor. null (pre-capabilities firmware, or not read yet)
 *   returns null: with no descriptor there is not one fact here to derive from,
 *   and a grid of four empty cells would be a claim about the hardware rather
 *   than an admission that we never asked it.
 * @param devices the trackpad wire's devices, or null when there was nothing to
 *   read (no trackpad feature) or the read has not finished.
 */
export function deriveModuleLayout(
  caps: ToraboCaps | null,
  devices: LayoutDevice[] | null,
  opts: DeriveOptions = {},
): ModuleLayout | null {
  if (!caps) return null;

  const cells: LayoutCell[] = CELLS.map((c) => ({ ...c, items: [] }));
  const cellAt = (side: LayoutSide, conn: LayoutConn) =>
    cells.find((c) => c.side === side && c.conn === conn)!;

  const extBase: Record<LayoutSide, boolean> = {
    [TpSide.Left]: false,
    [TpSide.Right]: false,
  };
  const unplaced: Msg[] = [];
  const notes: Msg[] = [];

  // --- 1. the LED bits ------------------------------------------------------
  // An LED board only exists as part of an extension base, so its side proves
  // the base on that side as well as the LED itself.
  const led = ledSides(caps);
  for (const side of [TpSide.Left, TpSide.Right] as LayoutSide[]) {
    const present = side === TpSide.Left ? led.left : led.right;
    if (!present) continue;
    extBase[side] = true;
    cellAt(side, TpConn.Extension).items.push({ key: "fw.mod.led" });
  }

  // Which half is the central. Only meaningful when the LED module is in the
  // build at all: the bit is emitted from its Kconfig, so with no LED entry
  // there is no statement either way — and a cleared bit inside a present entry
  // IS a statement ("central is not left"), not an absence.
  const ledInfo = featureInfo(caps, Feature.Led);
  const central: LayoutSide | null = ledInfo
    ? (ledInfo.caps & LedCap.CentralIsLeft) !== 0
      ? TpSide.Left
      : TpSide.Right
    : null;

  // --- 2. the trackpad wire's devices ---------------------------------------
  const placedKinds = new Set<number>();
  // Cells with a device in them. Drives the encoder's elimination in step 4,
  // and stops step 3 putting a trackball where something else already is.
  const occupied: CellRef[] = [];
  for (const dev of devices ?? []) {
    const { side, conn, kind } = decodeMeta(dev.meta);
    placedKinds.add(kind);
    if (isSide(side) && isConn(conn)) {
      if (conn === TpConn.Extension) extBase[side] = true;
      cellAt(side, conn).items.push(deviceLabel(dev));
      occupied.push({ side, conn });
    } else {
      // meta 0, or a half-described device: it exists, we just cannot say
      // where. Listed rather than placed — see the header.
      unplaced.push(deviceLabel(dev));
    }
  }

  if (opts.tpReadFailed) {
    notes.push({ key: "fw.mod.tpReadFailed" });
  } else if (devices === null && hasFeature(caps, Feature.Trackpad)) {
    notes.push({ key: "fw.mod.tpPending" });
  }

  // --- 3. the trackball, which the descriptor never places -------------------
  // Only when the trackpad wire did not already account for one: a ball that
  // came back WITH a meta byte is already in a cell, and naming it twice would
  // read as two of them.
  if (hasFeature(caps, Feature.Trackball) && !placedKinds.has(TpKind.Trackball)) {
    // Two facts and one inference.
    //
    // Fact: it is on a standard FFC. The extension FFC has no SPI
    // (torabo-tsuki_ext_FW/firmware-builder/PATTERN-MATRIX.md rule 2, "No
    // trackball on extension"), so the ball cannot hang off one.
    //
    // Inference: it is on the CENTRAL's standard FFC. Every torabo-tsuki
    // configuration that can be built today puts it there — PATTERN-MATRIX's
    // left-trackball groups are tiered PEXT+REG1, i.e. firmware that does not
    // exist yet. This section is labelled as an estimate (fw.mod.desc), which
    // is what makes stating it better than saying nothing.
    //
    // REVISIT THIS if left-ball firmware ever ships: the rule becomes wrong the
    // day a build can put the ball on the peripheral, and nothing else here
    // would notice.
    const seat = central === null ? null : { side: central, conn: TpConn.Standard };
    const free =
      seat !== null &&
      !occupied.some((o) => o.side === seat.side && o.conn === seat.conn);
    if (seat && free) {
      cellAt(seat.side, seat.conn).items.push({
        key: "tp.kind.trackball",
        inferred: true,
      });
      occupied.push(seat);
    } else {
      // Central unknown (no LED module to ask), or something is already on that
      // connector — one connector, one device, so the inference has just been
      // contradicted. Fall back to naming it without a position.
      unplaced.push({ key: "fw.mod.trackball" });
    }
  }

  // --- 4. the encoder, by elimination ---------------------------------------
  // The encoder module has no placement anywhere in caps or on its own wire
  // (src/encoder/encConfig.ts: magic, version, layerCount, bindings). But it
  // has to be SOMEWHERE, and there are only four somewheres — so rule out the
  // cells that are already taken and see what is left. One survivor is an
  // answer; two are a guess, and stay one.
  if (hasFeature(caps, Feature.Encoder) && !placedKinds.has(TpKind.Encoder)) {
    const candidates = vacantCells(occupied);
    if (candidates.length === 1) {
      cellAt(candidates[0].side, candidates[0].conn).items.push({
        key: "tp.kind.encoder",
        inferred: true,
      });
    } else {
      unplaced.push({ key: "fw.mod.encoder" });
    }
  }

  return { cells, extBase, central, unplaced, notes };
}
