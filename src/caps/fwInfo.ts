/**
 * Turning a decoded capability descriptor into something a person can read.
 *
 * WHY THIS IS SEPARATE FROM THE PANEL
 * Everything here is pure, and returns message KEYS rather than finished text:
 * the panel resolves them with its own `t`, so one helper serves both languages
 * and can be unit-tested without a React tree, a provider or a locale. The
 * panel is then only layout.
 *
 * WHY IT IS SEPARATE FROM toraboCaps.ts
 * That file is the wire — it must keep matching caps.h byte for byte, and
 * everything in it is consumed by the panels' logic. Naming and labelling is a
 * display concern that no other panel needs, so it lives here rather than
 * growing the wire module.
 *
 * The tolerance rules are the same ones the decoder promises (see the FORWARD
 * COMPATIBILITY contract at the top of toraboCaps.ts): a descriptor from newer
 * firmware may name a feature this app has never heard of, and may set caps
 * bits this app has no meaning for. Neither is an error, and neither may be
 * dropped — this tab is the one place where the user can see the descriptor as
 * the keyboard actually sent it, which is what makes it useful in a bug report.
 * So an id we don't know is shown as its number, and a bit we don't know is
 * shown as raw hex, rather than either one being silently swallowed.
 */

import type { Vars } from "../i18n";
import {
  APP_MAX_WIRE_VER,
  CAPS_FEAT,
  CAPS_HDR,
  Feature,
  FeatureInfo,
  LedCap,
  MACRO_NAMES_WIRE_VER,
  LiveFeedCap,
  ModuleKind,
  ReservedLayersCap,
  TimingCap,
  TrackballCap,
  TrackpadCap,
  TunnelCap,
} from "./toraboCaps";

/** A message key plus the placeholders it needs — resolved by the caller's `t`. */
export interface Msg {
  key: string;
  vars?: Vars;
}

/** `0x0B`, `0x0040` — uppercase so it reads as a constant, not as prose. */
export function toHex(value: number, digits: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}

/**
 * Display name per feature id. Total over `Feature`, so adding an id to the
 * enum without a name here is a type error rather than a row that reads
 * "unknown" on a feature this app very much knows about.
 *
 * Every feature that HAS a tab points at that tab's own label key rather than a
 * copy of it: this table and the tab strip name the same thing, and a second
 * string would be free to drift from the first (the app already has two
 * spellings of "encoder" — tab.encoder and sys.tunnel.feature.encoder — which
 * is exactly the drift not to add to). Only the three features with no tab of
 * their own — they are properties of the build, not screens — carry a name
 * defined in i18n/panels/fwinfo.ts.
 */
const FEATURE_NAME_KEYS: Record<Feature, string> = {
  [Feature.Trackball]: "tab.trackball",
  [Feature.Macros]: "tab.macros",
  [Feature.Combos]: "tab.combos",
  [Feature.Trackpad]: "tab.trackpad",
  [Feature.Encoder]: "tab.encoder",
  [Feature.Led]: "tab.led",
  [Feature.ReservedLayers]: "fw.feat.reservedLayers",
  [Feature.LiveFeed]: "fw.feat.liveFeed",
  [Feature.RpcTunnel]: "fw.feat.rpcTunnel",
  [Feature.Timing]: "tab.timing",
  [Feature.Modules]: "fw.feat.modules",
};

/**
 * The order the table lists features in, which is NOT the order the descriptor
 * sends them (caps.c appends each entry as its Kconfig is tested, so the wire
 * order is a build-file artefact and shifts as snippets are added).
 *
 * A fixed order means two keyboards' tables can be read side by side, and that
 * the same feature is in the same place every time you open the tab. It runs
 * from what the whole keyboard is (reserved layers, module layout) through the
 * pointing devices and the keys, to the two service-level entries that are
 * infrastructure rather than settings.
 *
 * Modules sits right after ReservedLayers on purpose: both describe the build
 * rather than opening a screen of their own, so the two "what is this
 * keyboard" configuration rows lead the table before the per-feature ones.
 *
 * Ids not listed here — a feature from newer firmware — come after, in the
 * order the descriptor sent them, since nothing better is known about them.
 */
export const FEATURE_DISPLAY_ORDER: Feature[] = [
  Feature.ReservedLayers,
  Feature.Modules,
  Feature.Trackball,
  Feature.Trackpad,
  Feature.Encoder,
  Feature.Macros,
  Feature.Combos,
  Feature.Timing,
  Feature.Led,
  Feature.LiveFeed,
  Feature.RpcTunnel,
];

/**
 * Sort a descriptor's feature table into display order.
 *
 * Only ever reorders: a feature the firmware did not report simply is not
 * there (this tab shows what the keyboard said, not a checklist of what it
 * could have said), and one it reported twice — which no firmware does, but a
 * corrupt read could — is kept twice, because a table that quietly dropped a
 * row would be the wrong tool for diagnosing exactly that.
 */
export function orderFeatures(features: FeatureInfo[]): FeatureInfo[] {
  const rank = (f: FeatureInfo) => {
    const i = FEATURE_DISPLAY_ORDER.indexOf(f.id);
    return i < 0 ? FEATURE_DISPLAY_ORDER.length : i;
  };
  // Array.prototype.sort is stable, so equal ranks (every unknown id) keep the
  // descriptor's own order.
  return [...features].sort((a, b) => rank(a) - rank(b));
}

/**
 * Name a feature id, including ones from firmware newer than this app.
 *
 * Takes `number`, not `Feature`: FeatureInfo.id is typed narrowly for the
 * benefit of the code that looks features UP (see its comment), but this tab
 * iterates the table instead, so it is the one caller that really does meet
 * ids outside the enum.
 */
export function featureName(id: number): Msg {
  const key = FEATURE_NAME_KEYS[id as Feature];
  if (key) return { key };
  return { key: "fw.feat.unknown", vars: { id: toHex(id, 2) } };
}

/** One flag inside a feature's caps word. */
interface CapsBit {
  mask: number;
  key: string;
}

/**
 * A field that carries a NUMBER in the caps word rather than a flag (the
 * trackpad's device mask, the reserved-layer count). Rendered as "label N", and
 * skipped entirely when it reads zero — "0 pads" is noise, not information.
 */
interface CapsValue {
  mask: number;
  key: string;
}

/**
 * Every caps bit this app can put a name to, per feature. Meaning is
 * feature-specific — 0x0001 under Timing has nothing to do with 0x0001 under
 * Trackball — so this is keyed by id and never flattened. Authoritative source
 * for all of it: TORABO_CAPS_* in
 * torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h.
 *
 * Partial on purpose: a feature with no entry (Macros, Combos) reports caps 0
 * today, and if a future firmware sets a bit there it falls through to the
 * unknown-bit hex, which is exactly what we want it to do.
 */
const CAPS_BITS: Partial<Record<Feature, CapsBit[]>> = {
  // The phase9 BallLeft/BallRight flags that briefly lived here (2026-09-03)
  // were abolished the next day: Trackball's caps word is Coast-only again,
  // same as every pre-phase9 build.
  [Feature.Trackball]: [{ mask: TrackballCap.Coast, key: "fw.bit.coast" }],
  [Feature.Trackpad]: [{ mask: TrackpadCap.Coast, key: "fw.bit.coast" }],
  // Encoder has no CAPS_BITS entry, same as every pre-phase9 build: its own
  // phase9 per-slot flags were abolished the next day in favour of
  // Feature.Modules (decodeModulesCaps below), so a v1 wire's caps 0 reports
  // nothing here to name.
  [Feature.Led]: [
    { mask: LedCap.Left, key: "fw.bit.ledLeft" },
    { mask: LedCap.Right, key: "fw.bit.ledRight" },
    { mask: LedCap.CentralIsLeft, key: "fw.bit.ledCentralIsLeft" },
  ],
  [Feature.LiveFeed]: [{ mask: LiveFeedCap.Diag, key: "fw.bit.liveFeedDiag" }],
  [Feature.RpcTunnel]: [{ mask: TunnelCap.Notify, key: "fw.bit.tunnelNotify" }],
  [Feature.Timing]: [
    { mask: TimingCap.SplitDebounce, key: "fw.bit.splitDebounce" },
  ],
};

const CAPS_VALUES: Partial<Record<Feature, CapsValue[]>> = {
  [Feature.Trackpad]: [
    { mask: TrackpadCap.DeviceMask, key: "fw.val.tpDevices" },
  ],
  [Feature.ReservedLayers]: [
    { mask: ReservedLayersCap.LayerMask, key: "fw.val.layers" },
  ],
};

/** Shift a masked field down to its own low bit, so 0x00f0 reads as its value. */
function fieldValue(caps: number, mask: number): number {
  // (mask & -mask) is the lowest set bit; Math.log2 of it is how far to shift.
  const lowest = mask & -mask;
  return (caps & mask) / lowest;
}

/**
 * Feature.Modules' four 4-bit slots, in the order toraboCaps.ts's
 * moduleSlots() decodes them (left standard/extension, then right).
 *
 * Not expressible with CAPS_BITS/CAPS_VALUES above: those tables are either a
 * single flag or a single number over the whole caps word, while this word is
 * FOUR independent small enums. decodeFeatureCaps special-cases this id
 * instead of trying to generalise the two shapes into one.
 */
const MODULE_SLOTS: { shift: number; slotKey: string }[] = [
  { shift: 0, slotKey: "leftStd" },
  { shift: 4, slotKey: "leftExt" },
  { shift: 8, slotKey: "rightStd" },
  { shift: 12, slotKey: "rightExt" },
];

/** ModuleKind -> the fragment of the badge key that names it. Undeclared (0)
 * has no entry: that slot is simply omitted, not shown as anything. A nibble
 * value ModuleKind does not name at all (5-8, 10-14) falls through to
 * `unknown` below. */
const MODULE_KIND_KEYS: Partial<Record<ModuleKind, string>> = {
  [ModuleKind.Ball]: "ball",
  [ModuleKind.Pad]: "pad",
  [ModuleKind.FourWaySwitch]: "fourWay",
  [ModuleKind.Dial]: "dial",
  [ModuleKind.Encoder]: "encoder",
  [ModuleKind.None]: "none",
};

/**
 * Decode Feature.Modules' caps word: one badge per DECLARED slot (Undeclared
 * slots are omitted — "left standard: —" would be noise, not information),
 * fully baked as `fw.mod.slot.<slot>.<kind>` rather than composed from a
 * template — the same "one key per bit" convention CAPS_BITS uses, so this
 * table needs no runtime string-building.
 *
 * A nibble value ModuleKind does not define (5-8 and 10-14 — everything
 * outside {0, 1, 2, 3, 4, 9, 15}) is left in `unknown`, shifted back to its
 * own position, same promise decodeFeatureCaps' generic path makes for a bit
 * it does not recognise.
 */
function decodeModulesCaps(caps: number): CapsDecode {
  const badges: Msg[] = [];
  let unknown = 0;
  for (const { shift, slotKey } of MODULE_SLOTS) {
    const kind = ((caps >> shift) & 0xf) as ModuleKind;
    if (kind === ModuleKind.Undeclared) continue;
    const kindKey = MODULE_KIND_KEYS[kind];
    if (kindKey) {
      badges.push({ key: `fw.mod.slot.${slotKey}.${kindKey}` });
    } else {
      unknown |= kind << shift;
    }
  }
  return { badges, unknown };
}

export interface CapsDecode {
  /** Named bits and value fields, in the order declared above. */
  badges: Msg[];
  /**
   * Whatever the tables above could not account for. Non-zero means this
   * firmware set a bit that postdates this app — shown as hex rather than
   * hidden, because it is precisely the thing a bug report needs.
   */
  unknown: number;
}

/**
 * Decode one feature's caps word into labelled badges plus the leftover bits.
 *
 * `id` is a raw number for the same reason featureName's is: an unknown id has
 * no bit table, so every bit it sets comes back as unknown, which is the honest
 * answer.
 */
export function decodeFeatureCaps(id: number, caps: number): CapsDecode {
  if (id === Feature.Modules) return decodeModulesCaps(caps);

  const bits = CAPS_BITS[id as Feature] ?? [];
  const values = CAPS_VALUES[id as Feature] ?? [];
  const badges: Msg[] = [];

  for (const v of values) {
    const value = fieldValue(caps, v.mask);
    if (value !== 0) badges.push({ key: v.key, vars: { value } });
  }
  for (const b of bits) {
    if ((caps & b.mask) !== 0) badges.push({ key: b.key });
  }

  // Every declared mask is accounted for whether or not it was set: a clear bit
  // contributes nothing to `caps` anyway, so clearing it here is free and keeps
  // the leftover to bits nothing in this app has a name for.
  const known = [...bits, ...values].reduce((m, f) => m | f.mask, 0);
  return { badges, unknown: caps & ~known };
}

/** Something a wire version brought with it, and the version it arrived in. */
interface WireGain {
  sinceWireVer: number;
  /** What that version added, in one phrase. */
  key: string;
}

/**
 * What each wire version added, per feature — the other half of the version
 * story from APP_MAX_WIRE_VER.
 *
 * That table answers "can this app still write to this firmware?". This one
 * answers the question the user actually asks when a panel looks emptier than
 * they expected: "why does MY keyboard not have that?" A feature whose firmware
 * wire is BELOW an entry here simply predates it — nothing is broken, nothing
 * is blocked, and the app speaks the old wire perfectly well; the firmware is
 * the side that would need updating. Hence informational styling, deliberately
 * not the warning the reverse case gets.
 *
 * SAME DISCIPLINE AS APP_MAX_WIRE_VER: teaching a codec a new wire version
 * means adding a row here in the SAME change, saying what that version brought.
 * Forget, and every keyboard on the old wire is left wondering. The version
 * numbers are hand-maintained here rather than imported from the codecs (this
 * module must not pull one in), and fwInfo.test.ts asserts they still match the
 * codecs' own constants — that is what catches the drift.
 *
 * Only versions that exist today. Macros v2, trackball v3 and trackpad v3 are
 * the whole history so far; every other feature is v1-only, so it has no entry
 * and this mechanism reports nothing for it.
 */
const WIRE_HISTORY: Partial<Record<Feature, WireGain[]>> = {
  /** dmacConfig.ts DM_VERSION_V2: the appended per-slot name block on READ and
   * the name-only WRITE op (PLAN-ext-fw-refactor.md フェーズ8). The constant is
   * already stated for the app in toraboCaps.ts, so reuse it. */
  [Feature.Macros]: [
    { sinceWireVer: MACRO_NAMES_WIRE_VER, key: "fw.gain.macros.names" },
  ],
  /** ztcConfig.ts ZTC_VERSION_V3: the 4-byte coast trailer — inertial scroll
   * for the ball. */
  [Feature.Trackball]: [{ sinceWireVer: 3, key: "fw.gain.trackball.coast" }],
  /** tpConfigV2.ts TP_VERSION_V3: the per-device coast block in each device
   * header — inertial scroll for the pads. */
  [Feature.Trackpad]: [{ sinceWireVer: 3, key: "fw.gain.trackpad.coast" }],
};

/** One thing this firmware's wire is too old to carry. */
export interface WireGainNote {
  /** The version that introduced it — shown, so "too old for what?" has a
   * number the user can compare against their own. */
  sinceWireVer: number;
  what: Msg;
}

/**
 * What a NEWER wire would add for this feature, given the version the firmware
 * reports.
 *
 * Returns nothing for a feature with no history (v1-only), for firmware already
 * at or past every known version, and for an id this app does not know — an
 * unknown feature has no history here by definition.
 */
export function wireGains(f: FeatureInfo): WireGainNote[] {
  const history = WIRE_HISTORY[f.id] ?? [];
  return history
    .filter((g) => g.sinceWireVer > f.wireVer)
    .map((g) => ({ sinceWireVer: g.sinceWireVer, what: { key: g.key } }));
}

export interface WireInfo {
  /** What the firmware says it speaks. */
  fwWire: number;
  /**
   * The highest version this app's codec for that feature can produce, or null
   * when there is no codec at all — a feature id from newer firmware.
   */
  appWire: number | null;
  /**
   * The firmware is ahead of this app: its config carries fields our decoder
   * never saw, so writing back would drop them. Exactly the condition
   * `canWriteFeature` refuses on, which is why the panels for those features go
   * read-only (PanelActionBar's `writeBlocked`) — this flag is the same fact,
   * shown per row so the user can see WHICH feature forced it.
   *
   * False for an unknown id: there is no codec, so there is also nothing that
   * could write it, and the row already says the app does not know the feature.
   * Flagging it would point at an app update that would not help.
   */
  fwNewer: boolean;
}

export function wireInfo(f: FeatureInfo): WireInfo {
  const appWire: number | undefined = APP_MAX_WIRE_VER[f.id];
  return {
    fwWire: f.wireVer,
    appWire: appWire ?? null,
    fwNewer: appWire !== undefined && f.wireVer > appWire,
  };
}

export interface RawDescriptorView {
  /** The 8-byte header, as hex. */
  header: string;
  /** One line per 4-byte feature entry, in descriptor order. */
  entries: string[];
  /** Anything past the feature table — allowed by contract rule 4, so shown
   * rather than dropped. null when there is none. */
  trailing: string | null;
}

function hexBytes(buf: Uint8Array): string {
  return Array.from(buf, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(
    " ",
  );
}

/**
 * Group the bytes the keyboard actually sent the way the wire is laid out, so a
 * bug report can be checked against caps.h by eye.
 *
 * Defensive about lengths even though the panel only ever shows bytes a
 * successful decode came from: this must never be the thing that throws while
 * someone is trying to report a problem.
 */
export function formatRawDescriptor(raw: Uint8Array): RawDescriptorView {
  const header = hexBytes(raw.subarray(0, CAPS_HDR));
  if (raw.length < CAPS_HDR) return { header, entries: [], trailing: null };

  // The count byte, same as decodeCaps reads, clamped to the bytes present.
  const declared = raw[6];
  const available = Math.floor((raw.length - CAPS_HDR) / CAPS_FEAT);
  const count = Math.min(declared, available);

  const entries: string[] = [];
  for (let i = 0; i < count; i++) {
    const o = CAPS_HDR + i * CAPS_FEAT;
    entries.push(hexBytes(raw.subarray(o, o + CAPS_FEAT)));
  }

  const end = CAPS_HDR + count * CAPS_FEAT;
  return {
    header,
    entries,
    trailing: raw.length > end ? hexBytes(raw.subarray(end)) : null,
  };
}
