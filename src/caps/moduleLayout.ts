/**
 * "Which physical modules is this firmware built for, and where are they?"
 *
 * WHAT THIS CAN AND CANNOT KNOW — read this before adding a rule.
 *
 * The keyboard never sends a parts list. This derives one from three things it
 * can send, and they know different amounts:
 *
 *   1. The header's `_rsv` byte and Feature.Modules' caps word
 *      (caps.h's TORABO_CAPS_HDR_CENTRAL_MASK / TORABO_FEAT_MODULES,
 *      redesigned 2026-09-04, superseding the previous day's per-feature
 *      TrackballCap/EncoderCap side-bit scheme; slot numbering renumbered
 *      again 2026-09-05, see ModuleKind in toraboCaps.ts). A builder that
 *      opts in DECLARES which half is central, and — in ONE unified caps word
 *      rather than one per feature — what each of the four connectors
 *      carries: a ball, a pad, a 4-way switch module, a hi-res dial, an
 *      encoder, or explicitly nothing (ModuleKind, toraboCaps.ts). Every slot
 *      independent, so any mix is expressible: a ball on one standard module
 *      and nothing declared on the other, an encoder on all four connectors,
 *      etc. An unset Kconfig (every pre-2026-09-04 build, and any build that
 *      leaves a slot unconfigured) reports that slot as 0 = Undeclared, which
 *      is indistinguishable from "not declared" — hence the per-slot
 *      inference fallback below. A slot value ModuleKind does not define
 *      (5-8, 10-14) is likewise treated as if it were Undeclared for
 *      placement purposes — see step 3.
 *
 *   2. The LED caps bits (TORABO_CAPS_LED_LEFT / _RIGHT / _CENTRAL_IS_LEFT in
 *      caps.h). They say which halves have an LED extension board, and — the
 *      only way to learn it before phase9 — which half is the split central.
 *      Their blind spot: an extension base with no LED on it is invisible
 *      here — the bits are about the LED, not the board it rides. So base
 *      presence is derived from these bits OR from a device reported on the
 *      extension connector, never from the bits alone. Central side now
 *      defers to `_rsv` first (step 1) and only falls back to this bit for an
 *      LED-less build or pre-phase9 firmware.
 *
 *   3. The trackpad wire's per-device meta byte
 *      (torabo-tsuki_ext_FW/trackpad/include/zmk_trackpad_config/config.h,
 *      TP_META_*). This is the authoritative placement: side, connector and
 *      kind, straight from the build's Kconfig. It covers only devices on that
 *      wire, and firmware older than the meta byte sends 0 = unknown. Its kind
 *      numbering (TpKind) is a FROZEN wire contract and, since 2026-09-05, no
 *      longer numbered the same as ModuleKind's (ModuleKind carries slot
 *      kinds — FourWaySwitch, Dial — the trackpad wire will never carry).
 *      The two
 *      channels can still name the same physical device, so a cell the wire
 *      already placed a device in and a slot Feature.Modules also declares
 *      are deduped by converting one numbering to the other via
 *      moduleKindFromTpKind() (see step 3 below), never by comparing the raw
 *      numbers.
 *
 * And what none of the three can tell, when a slot is Undeclared (0) and no
 * trackpad-wire device already accounts for it:
 *
 *   - Feature.Trackball (caps id 1) says the SPI trackball module is compiled
 *     in, full stop. Nothing in the ztc wire itself says which half it is on.
 *   - Feature.Encoder (caps id 5) says the encoder config module is compiled
 *     in. Its wire (src/encoder/encConfig.ts) is magic/version/layerCount and
 *     then bindings — VERIFIED to carry no placement of any kind. (A rotary
 *     encoder wired as a trackpad-wire DEVICE is a different thing and does
 *     come with a meta byte; that one lands in a cell like any other device.)
 *
 * REPORT VS INFERENCE
 * A slot Feature.Modules declares to a defined, non-"none" ModuleKind (Ball,
 * Pad, FourWaySwitch, Dial, Encoder) is placed as a REPORT — same badge treatment
 * as a trackpad-wire device. A slot declared None is placed as an explicit,
 * subdued "empty" marker, and — this is the whole reason None exists as a
 * value distinct from Undeclared — blocks any inference from landing in that
 * cell. Only for a slot left at Undeclared (0), or at a value ModuleKind does
 * not define, does the pre-declaration estimate still apply: the ball onto the central's
 * standard FFC, the encoder onto whatever single cell is left once the taken
 * ones are ruled out. That estimate is sound only because the section says so
 * (fw.mod.desc) — and only as long as it is not passed off as a report. So
 * every inferred item still carries `inferred: true` and the panel renders it
 * differently, and an inference that runs out of certainty (central unknown,
 * two candidate cells) still falls back to the unplaced list rather than
 * picking.
 *
 * Hence the shape below: a 2x2 grid of what is placed (reported, explicitly
 * empty, or deduced), a list of what is present but unplaceable, and notes
 * for what could not be read. An empty cell means "nothing known here", never
 * "there is nothing here" — the panel says so, because that is the difference
 * between this and a parts list.
 *
 * Pure, and returns message keys like fwInfo.ts, so the rules can be tested
 * without a React tree.
 */

import {
  CapsSide,
  Feature,
  LedCap,
  ModuleKind,
  ToraboCaps,
  centralSideFromHeader,
  featureInfo,
  hasFeature,
  ledSides,
  moduleSlots,
} from "./toraboCaps";
import type { Msg } from "./fwInfo";
import {
  TpConn,
  TpKind,
  TpSide,
  decodeMeta,
  isPhantomDevice,
} from "../trackpad/tpConfigV2";

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
 * the firmware placed by its meta byte (or a slot Feature.Modules declared) is
 * a report, while a trackball or an encoder put in a cell by the fallback
 * rules below is a deduction from what the build can be. Both are worth
 * showing; presenting them in the same typeface would not be. The panel
 * renders inferred items differently for that reason.
 *
 * `empty` marks the OTHER positive statement a slot can make: ModuleKind.None
 * says this connector is populated with nothing, which is not the same claim
 * as an ordinary empty cell (nothing reported either way). The panel renders
 * it as a subdued marker — not a solid report of a module, not a dashed
 * inference, but not silence either.
 */
export interface LayoutItem extends Msg {
  inferred?: boolean;
  empty?: boolean;
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
 * names for the things on it. Keyed by TpKind, so this is only for devices
 * the trackpad wire itself placed (deviceLabel() below) — a slot
 * Feature.Modules declares is a different enum (ModuleKind) with different
 * numbers since 2026-09-05, and uses MODULE_KIND_KEYS instead (step 3). */
const KIND_KEYS: Record<number, string> = {
  [TpKind.Trackpad]: "tp.kind.trackpad",
  [TpKind.Trackball]: "tp.kind.trackball",
  [TpKind.Encoder]: "tp.kind.encoder",
};

/**
 * Bridge between the trackpad wire's own per-device kind (TpKind,
 * tpConfigV2.ts — a frozen wire contract: Unknown/Trackpad/Trackball/Encoder
 * = 0/1/2/3) and Feature.Modules' declared slot kind (ModuleKind,
 * toraboCaps.ts — Undeclared/Ball/Pad/FourWaySwitch/Dial/Encoder/None =
 * 0/1/2/3/4/9/15, renumbered 2026-09-05 precisely so it no longer has to
 * match TpKind). The two enums can still describe the very same physical
 * device on
 * the very same connector, so step 3 below uses this — not a raw number
 * comparison — to tell whether a declared slot merely confirms what the wire
 * already reported, or contradicts it.
 *
 * TpKind.Unknown has no ModuleKind counterpart (a device the wire could not
 * describe carries no kind to compare against) and maps to `undefined`. The
 * gap runs the other way too, and permanently: ModuleKind.Dial (and
 * FourWaySwitch) can never be produced here, because neither rides the
 * trackpad wire — so a declared Dial slot is never deduped against, nor
 * contradicted by, a wire device.
 */
export function moduleKindFromTpKind(kind: TpKind): ModuleKind | undefined {
  switch (kind) {
    case TpKind.Trackpad:
      return ModuleKind.Pad;
    case TpKind.Trackball:
      return ModuleKind.Ball;
    case TpKind.Encoder:
      return ModuleKind.Encoder;
    default:
      return undefined;
  }
}

/** Badge key per DECLARED ModuleKind (step 3 below) — a slot Feature.Modules
 * names, as opposed to KIND_KEYS above which names a device the trackpad
 * wire itself placed. Ball/Pad/Encoder reuse the trackpad panel's own
 * tp.kind.* wording, same word for the same kind of device regardless of
 * which channel reported it. FourWaySwitch and Dial have no trackpad-wire
 * counterpart (the wire will never carry either), so they get their own keys.
 * No entry for
 * Undeclared or None: those are handled separately below (silence, or the
 * dedicated fw.mod.none marker) rather than through this lookup. */
const MODULE_KIND_KEYS: Partial<Record<ModuleKind, string>> = {
  [ModuleKind.Ball]: "tp.kind.trackball",
  [ModuleKind.Pad]: "tp.kind.trackpad",
  [ModuleKind.Encoder]: "tp.kind.encoder",
  [ModuleKind.FourWaySwitch]: "fw.mod.kind.fourWay",
  [ModuleKind.Dial]: "fw.mod.kind.dial",
};

/** Every value ModuleKind actually defines. A declared slot outside this set
 * (5-8, 10-14) is treated exactly like Undeclared for
 * placement purposes in step 3 — left for the fallback inference in steps 4/5
 * to consider, never occupying a cell or shown as a report. */
const KNOWN_MODULE_KINDS = new Set<number>(Object.values(ModuleKind));

/** Where a declared slot goes when it loses a contradiction with the trackpad
 * wire's own report for the same cell (step 3 below) — same "present, but not
 * placeable here" wording the pre-declaration inference falls back to when
 * ITS estimate is contradicted. No entry for Pad, FourWaySwitch or Dial:
 * nothing in this app has ever needed to say "a pad/4-way switch exists
 * somewhere unplaceable" outside of what the wire itself already lists in
 * `unplaced`, and a Dial can never reach this branch at all (it has no
 * TpKind counterpart, so the wire can never contradict one) — so a
 * contradicted declared one of those is simply dropped rather than
 * inventing a message nothing else uses. */
const MODULE_KIND_UNPLACED_KEY: Partial<Record<number, string>> = {
  [ModuleKind.Ball]: "fw.mod.trackball",
  [ModuleKind.Encoder]: "fw.mod.encoder",
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

  // Which half is the central. `_rsv` (PLAN-ext-fw-refactor.md フェーズ9)
  // takes priority: it is reported independently of any feature, so it works
  // even on an LED-less build, which is exactly the hole the LED bit alone
  // could not fill. Fall back to LedCap.CentralIsLeft for firmware built
  // before phase9 (header reports CapsSide.Unknown = 0, matching every
  // pre-phase9 descriptor byte-for-byte). Only meaningful when the LED module
  // is in the build at all: the bit is emitted from its Kconfig, so with no
  // LED entry there is no statement either way — and a cleared bit inside a
  // present entry IS a statement ("central is not left"), not an absence.
  const hdrCentral = centralSideFromHeader(caps);
  const ledInfo = featureInfo(caps, Feature.Led);
  const ledCentral: LayoutSide | null = ledInfo
    ? (ledInfo.caps & LedCap.CentralIsLeft) !== 0
      ? TpSide.Left
      : TpSide.Right
    : null;
  const central: LayoutSide | null =
    hdrCentral === CapsSide.Left
      ? TpSide.Left
      : hdrCentral === CapsSide.Right
        ? TpSide.Right
        : ledCentral;

  // --- 2. the trackpad wire's devices ---------------------------------------
  const placedKinds = new Set<number>();
  // Cells with a device in them. Drives the encoder's elimination in step 5,
  // and stops step 3/4 putting something where a device already is.
  const occupied: CellRef[] = [];
  // What kind sits in an occupied cell, keyed the same way cellAt() looks one
  // up. Populated here (from the wire) and in step 3 (from a declared slot),
  // so step 3's dedupe can compare a declared kind against whichever channel
  // got there first.
  const kindAt = new Map<string, number>();
  const cellKey = (side: LayoutSide, conn: LayoutConn) => `${side}:${conn}`;
  const wire = devices ?? [];
  for (let d = 0; d < wire.length; d++) {
    const dev = wire[d];
    // A wire slot the firmware reported but never described, next to ones it
    // did: not a module, so it belongs in neither a cell nor the unplaced
    // list. See isPhantomDevice() in tpConfigV2.ts for why an ALL-unknown
    // wire is still shown in full.
    if (isPhantomDevice(wire, d)) continue;
    const { side, conn, kind } = decodeMeta(dev.meta);
    placedKinds.add(kind);
    if (isSide(side) && isConn(conn)) {
      if (conn === TpConn.Extension) extBase[side] = true;
      cellAt(side, conn).items.push(deviceLabel(dev));
      occupied.push({ side, conn });
      kindAt.set(cellKey(side, conn), kind);
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

  // --- 3. Feature.Modules' declared slots -------------------------------------
  // caps.h TORABO_FEAT_MODULES (redesigned 2026-09-04, superseding the
  // previous day's per-feature TrackballCap/EncoderCap side bits; slot
  // numbering renumbered again 2026-09-05): one unified caps word, four
  // 4-bit slots, each independently 0=undeclared, 1=ball, 2=pad, 3=4-way
  // switch, 4=hi-res dial, 9=encoder, or 15=explicitly nothing (ModuleKind,
  // toraboCaps.ts).
  // A declared ball/pad/4-way/dial/encoder is a REPORT — same badge treatment as a
  // device the trackpad wire itself placed. The kind numbering no longer
  // matches the wire's own meta byte (TpKind), so the two channels naming
  // the SAME device dedupe via moduleKindFromTpKind(), converting the wire's
  // TpKind into the ModuleKind space before comparing — never by comparing
  // the raw numbers. A declared "nothing" (None) is placed as its own
  // subdued marker, and — by being added to `occupied` like any other
  // placement — automatically blocks both the trackball and encoder fallback
  // inference below from landing there. An undeclared slot (0), or one set to
  // a value ModuleKind does not define (5-8, 10-14), leaves the cell for that
  // inference to consider.
  const slots = moduleSlots(caps);
  const declaredKinds = new Set<number>();
  if (slots) {
    const bySlot: { seat: CellRef; kind: ModuleKind }[] = [
      { seat: { side: TpSide.Left, conn: TpConn.Standard }, kind: slots.leftStd },
      { seat: { side: TpSide.Left, conn: TpConn.Extension }, kind: slots.leftExt },
      { seat: { side: TpSide.Right, conn: TpConn.Standard }, kind: slots.rightStd },
      { seat: { side: TpSide.Right, conn: TpConn.Extension }, kind: slots.rightExt },
    ];
    for (const { seat, kind } of bySlot) {
      if (kind === ModuleKind.Undeclared) continue;
      if (!KNOWN_MODULE_KINDS.has(kind)) continue; // undefined value (5-8, 10-14): treat as undeclared
      const key = cellKey(seat.side, seat.conn);
      const already = kindAt.get(key); // TpKind, when the wire already placed a device here

      if (kind === ModuleKind.None) {
        // Nothing to dedupe against a real device: if the wire already put
        // something here, that device is the fact and the "nothing" claim
        // is simply stale/contradictory data, dropped rather than shown.
        if (already === undefined) {
          cellAt(seat.side, seat.conn).items.push({ key: "fw.mod.none", empty: true });
          occupied.push(seat);
          kindAt.set(key, ModuleKind.None);
        }
        continue;
      }

      declaredKinds.add(kind);
      const alreadyAsModuleKind =
        already !== undefined ? moduleKindFromTpKind(already as TpKind) : undefined;
      if (alreadyAsModuleKind === kind) continue; // the wire already reported this exact device
      if (already !== undefined) {
        // A genuine contradiction — the wire reported a DIFFERENT kind here.
        // One connector, one device, so the declared slot loses to the wire's
        // own report and is listed instead of stacked.
        const unplacedKey = MODULE_KIND_UNPLACED_KEY[kind];
        if (unplacedKey) unplaced.push({ key: unplacedKey });
        continue;
      }
      if (seat.conn === TpConn.Extension) extBase[seat.side] = true;
      const badgeKey = MODULE_KIND_KEYS[kind];
      if (badgeKey) cellAt(seat.side, seat.conn).items.push({ key: badgeKey });
      occupied.push(seat);
      kindAt.set(key, kind);
    }
  }

  // --- 4. the trackball, when no slot declared one ----------------------------
  // Only when neither the trackpad wire nor Feature.Modules already accounted
  // for one: a ball reported by either channel is already in a cell, and
  // naming it twice would read as two of them.
  if (
    hasFeature(caps, Feature.Trackball) &&
    !placedKinds.has(TpKind.Trackball) &&
    !declaredKinds.has(ModuleKind.Ball)
  ) {
    // Older firmware (or a build that leaves every slot Undeclared): fall
    // back to the pre-2026-09-04 estimate. Two facts and one inference.
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
      // contradicted (or, new to 2026-09-04, that connector was declared
      // `None`). Fall back to naming it without a position.
      unplaced.push({ key: "fw.mod.trackball" });
    }
  }

  // --- 5. the encoder, when no slot declared one ------------------------------
  if (
    hasFeature(caps, Feature.Encoder) &&
    !placedKinds.has(TpKind.Encoder) &&
    !declaredKinds.has(ModuleKind.Encoder)
  ) {
    // Older firmware (or a build that leaves every slot Undeclared): fall
    // back to the pre-2026-09-04 elimination. The encoder module has no
    // placement anywhere in caps or on its own wire (src/encoder/encConfig.ts:
    // magic, version, layerCount, bindings). But it has to be SOMEWHERE, and
    // there are only four somewheres — so rule out the cells that are already
    // taken (by a device, or by a declared pad/ball/None) and see what is
    // left. One survivor is an answer; two are a guess, and stay one.
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
