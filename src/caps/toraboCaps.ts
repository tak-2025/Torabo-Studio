/**
 * The firmware's self-description. MUST match
 * torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h.
 *
 * A torabo build is assembled from snippets, so two keyboards running this app can
 * have completely different feature sets — one has an encoder, one doesn't; one has
 * LEDs on both halves, one on neither. And as firmware moves on, a wire format can
 * gain fields the app must know about BEFORE it writes.
 *
 * So we don't guess. On connect the firmware tells us its version, which feature
 * modules were compiled in, each one's wire version, and per-feature capability
 * bits, and the UI shows only what this keyboard can actually do.
 *
 *   header (8B): magic u16 "TC" | descVer u8 | major u8 | minor u8 | patch u8 |
 *                featureCount u8 | _rsv u8
 *   per feature (4B): id u8 | wireVer u8 | caps u16
 *
 * Firmware without the service is "pre-capabilities": we get null and fall back to
 * showing everything, exactly as the app behaved before this existed. Never break
 * an older keyboard just because it can't introduce itself.
 *
 * ---------------------------------------------------------------------------
 * FORWARD COMPATIBILITY — the contract a FUTURE descriptor must honour
 *
 * The asymmetry that matters: an app can be updated, a fielded keyboard mostly
 * cannot, but the *installed* app is the thing that is old when new firmware
 * arrives. So this decoder is deliberately tolerant, and that tolerance is only
 * safe if the firmware side keeps the promises below. Written down here because
 * this comment is what the desc_ver 2 change (more feature slots, and a tunnel
 * blob budget in the header — see tpConfigV2.ts's TP_FW_BLOB_MAX) will be
 * written against; today's firmware is
 * torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h (desc_ver 1,
 * TORABO_CAPS_MAX_FEATURES 10) and .../caps/src/caps.c.
 *
 * What this app promises, for every desc_ver it does not recognise:
 *   1. It parses by `feature_count`, never by total length. Any count is
 *      accepted as long as the buffer really holds 8 + count*4 bytes, so
 *      raising TORABO_CAPS_MAX_FEATURES needs no app change. (The transport is
 *      not the limit either: a GATT read delivers up to 512 B, i.e. 126 slots.)
 *   2. It does not reject an unknown desc_ver. It reads the v1-defined fields
 *      and ignores everything else.
 *   3. It keeps feature entries whose id it does not know, untouched, in
 *      `features`. Every query below is an id lookup, so an unknown id is inert
 *      rather than confusing — nothing iterates the array expecting known ids.
 *   4. It ignores any bytes after the feature table.
 *   5. It still rejects a bad magic and a buffer too short for its own
 *      feature_count. Those are corruption, not evolution.
 *
 * What the firmware must therefore NOT do when it bumps desc_ver:
 *   a. The 8-byte header keeps its meaning field for field: magic u16, desc_ver
 *      u8, fw_major/minor/patch u8, feature_count u8, _rsv u8. feature_count
 *      especially stays a plain u8 count of 4-byte entries — this parser trusts
 *      it to find the end of the table.
 *   b. The feature table still starts at offset 8 (CAPS_HDR) and its entries are
 *      still exactly 4 bytes, id u8 | wire_ver u8 | caps u16 LE. Growing an
 *      entry means a NEW table, appended after this one — never a wider row
 *      here, which would make an old app read the table as garbage.
 *   c. New header-level data goes in ONE of two places, both of which old
 *      parsers skip harmlessly: the reserved byte (_rsv, if one byte is
 *      enough), or AFTER the feature table (rule 4). It must NOT be inserted
 *      between the header and the table, and must not push the table off
 *      offset 8.
 *   d. Feature ids stay stable and append-only (caps.h says the same). An id
 *      may gain caps bits; it may never be reused for a different feature.
 *
 * The one thing tolerance cannot cover is a feature whose *wire* moved ahead of
 * this app's codec — that is a data-loss risk, not a display one, and is what
 * canWriteFeature/APP_MAX_WIRE_VER below refuse.
 */

import { tr } from "../i18n";

export const CAPS_MAGIC = 0x4354; // "TC"
/**
 * The descriptor layout this app was written against. NOT a gate: decodeCaps
 * never compares against it (see the forward-compatibility contract above), so
 * it exists to say which revision the field offsets below come from, and for
 * tests to build a descriptor with.
 */
export const CAPS_DESC_VERSION = 1;
export const CAPS_HDR = 8;
export const CAPS_FEAT = 4;

/** Stable ids — never renumbered, append only. */
export const Feature = {
  Trackball: 1,
  Macros: 2,
  Combos: 3,
  Trackpad: 4,
  Encoder: 5,
  Led: 6,
  ReservedLayers: 7,
  /** GATT service e1f4af00 (Torabo-Float §13) — the live_feed push channel.
   * NOTIFY-only: no config to read or write, so it carries no wire version of
   * its own beyond the packed event caps.c reports it at (v1). */
  LiveFeed: 8,
  /** The RPC tunnel itself (src/backends/rpc/config.ts), not a settings
   * feature: it carries every other feature's config blob over Studio RPC on
   * transports with no GATT services (USB serial). No config wire of its own
   * either — presence just means "USB can reach the features above". */
  RpcTunnel: 9,
  Timing: 10,
} as const;
export type Feature = (typeof Feature)[keyof typeof Feature];

/** Per-feature capability bits. Meaning is feature-specific. */
export const LedCap = { Left: 0x0001, Right: 0x0002, CentralIsLeft: 0x0004 } as const;

/** Timing: SplitDebounce = the debounce windows are carried across the split link,
 * so they apply to BOTH halves' key scanning. Without it they only reach the
 * central's, which is all the firmware could do before — same wire either way, so
 * this is a capability bit rather than a wire version. */
export const TimingCap = { SplitDebounce: 0x0001 } as const;

/** Trackpad: Coast = this firmware has the per-device inertial-scroll engine and
 * its wire (v3) carries the three coast bytes per device. The low 4 bits of the
 * trackpad caps word are a device mask, so this bit starts at bit4.
 *
 * DeviceMask (TORABO_CAPS_TP_DEVICE_MASK) is a value field, not a flag — "how
 * many pads the wire carries". Named here so the firmware-info tab can account
 * for those bits instead of reporting them as unknown; nothing gates on it,
 * because the wire itself already says how many device blocks it holds. */
export const TrackpadCap = { DeviceMask: 0x000f, Coast: 0x0010 } as const;

/** Trackball: Coast = inertial scroll for the ball (the v3 wire trailer). */
export const TrackballCap = { Coast: 0x0001 } as const;

/** Reserved layers: the whole low byte is a COUNT, not a bit field — how many
 * layers the build reserved (TORABO_CAPS_LAYERS_MASK). Same reason as
 * TrackpadCap.DeviceMask: named so those bits are explained rather than shown
 * as unknown. */
export const ReservedLayersCap = { LayerMask: 0x00ff } as const;

/** Live feed: Diag = the diagnostic characteristic e1f4af02 is present
 * (TORABO_CAPS_LIVE_FEED_DIAG, Torabo-Float §13). It ships with the live feed
 * rather than bumping its wire, so it is a caps bit. */
export const LiveFeedCap = { Diag: 0x0001 } as const;

/** RPC tunnel: Notify = the firmware answers SUBSCRIBE/UNSUBSCRIBE and pushes
 * the notifications that follow (TORABO_CAPS_TUNNEL_NOTIFY). Without it the
 * tunnel is request/response only. */
export const TunnelCap = { Notify: 0x0001 } as const;

/** One row of the descriptor's feature table. */
export interface FeatureInfo {
  /**
   * Typed as Feature, but a descriptor from newer firmware may carry an id this
   * app has never heard of (contract rule 3) and decodeCaps keeps that row as
   * it found it. The type stays narrow on purpose: the value is only ever
   * compared against a known id, and widening it to `number` would force every
   * caller to handle a feature it can do nothing with anyway.
   */
  id: Feature;
  wireVer: number;
  caps: number;
}

/**
 * The wire versions THIS app knows how to speak. If the firmware reports a higher
 * one, its config has fields we'd drop on write — so we refuse to write rather than
 * silently damage it, and tell the user to update the app.
 *
 * Single source of truth for that refusal (`canWriteFeature` below). Each number
 * is the highest version byte the feature's own decoder accepts, read off the
 * codec rather than guessed — the codec is what would actually drop the fields.
 *
 * Teaching a codec a new version means bumping its entry here in the SAME change.
 * Forget, and the app keeps refusing to write to the firmware it just learned to
 * speak to; bump without teaching the codec, and the guard stops guarding.
 */
export const APP_MAX_WIRE_VER: Record<Feature, number> = {
  /** src/trackball/ztcConfig.ts — decodeZtc takes v2|v3 (ZTC_VERSION). */
  [Feature.Trackball]: 3,
  /** src/dynamic_macros/dmacConfig.ts — decodeDmac takes v1|v2 (DM_VERSION).
   * v2 is the per-slot name block (PLAN-ext-fw-refactor.md フェーズ8); steps
   * writes stay v1 forever, so raising this does not change a single existing
   * byte on the wire — it only stops the write guard from locking the panel
   * once firmware starts reporting wire_ver 2. */
  [Feature.Macros]: 2,
  /** src/dynamic_combos/comboConfig.ts — decodeCombos takes v1 only (CB_VERSION). */
  [Feature.Combos]: 1,
  /** src/trackpad/tpConfigV2.ts — decodeTp takes v1|v2|v3 (TP_VERSION). */
  [Feature.Trackpad]: 3,
  /** src/encoder/encConfig.ts — decodeEnc takes v1 only (ENC_VERSION). */
  [Feature.Encoder]: 1,
  /** src/led/ledConfig.ts — decodeLed takes v1 only (LED_VERSION). */
  [Feature.Led]: 1,
  /**
   * No wire of its own: the reserved layers are a keymap property, reported so
   * the panels can hide the trailing unclaimed layers. Nothing writes it, so
   * nothing asks — the entry only exists to keep this table total over Feature.
   */
  [Feature.ReservedLayers]: 1,
  /**
   * No config wire: live_feed is a NOTIFY-only push channel (Torabo-Float
   * §13), nothing here to read or write back. Entry exists only to keep this
   * table total over Feature; the value is the wire_ver caps.c reports (1).
   */
  [Feature.LiveFeed]: 1,
  /**
   * No config wire of its own: this id names the tunnel subsystem, not a
   * feature with a blob of its own — every setting still goes through its own
   * codec and its own entry above, addressed over the tunnel by
   * TunnelFeature (src/backends/rpc/config.ts). Entry exists only to keep
   * this table total over Feature; the value is the wire_ver caps.c
   * reports (1).
   */
  [Feature.RpcTunnel]: 1,
  /** src/timing/timingConfig.ts — decodeTiming takes v1 only (TMG_VERSION). */
  [Feature.Timing]: 1,
};

export interface ToraboCaps {
  descVersion: number;
  fw: { major: number; minor: number; patch: number };
  features: FeatureInfo[];
}

/**
 * Parse a descriptor, tolerating anything the FORWARD COMPATIBILITY contract at
 * the top of this file allows a future firmware to add.
 *
 * Rejects only what cannot be evolution: a buffer too small to hold a header, a
 * wrong magic, and a buffer that does not contain the feature table its own
 * feature_count claims. Everything else — an unknown desc_ver, a count past
 * today's TORABO_CAPS_MAX_FEATURES, unknown feature ids, bytes past the table —
 * is accepted and, where this app can make no use of it, ignored.
 */
export function decodeCaps(buf: Uint8Array): ToraboCaps {
  if (buf.length < CAPS_HDR) {
    throw new Error(`capability descriptor too short (${buf.length} B)`);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== CAPS_MAGIC) {
    throw new Error(`capability descriptor: bad magic 0x${magic.toString(16)}`);
  }
  /**
   * Read, reported, never compared. Refusing an unrecognised desc_ver would
   * turn every future firmware bump into "this app shows no tabs at all" for
   * everyone who has not updated — far worse than showing the features it does
   * recognise. Contract rules (a)-(c) are what make reading the v1 fields out
   * of a v2+ descriptor legitimate rather than a guess.
   */
  const descVersion = dv.getUint8(2);
  const fw = { major: dv.getUint8(3), minor: dv.getUint8(4), patch: dv.getUint8(5) };
  /**
   * The count, not the length, decides how many entries there are. A firmware
   * that raises TORABO_CAPS_MAX_FEATURES (10 today) therefore needs no change
   * here. The only thing checked is that the bytes are actually present: u8
   * bounds it at 255 entries = 1028 B, so a bogus count cannot make this loop
   * run away — the length check below rejects it first.
   */
  const count = dv.getUint8(6);

  const need = CAPS_HDR + count * CAPS_FEAT;
  if (buf.length < need) {
    throw new Error(`capability descriptor truncated: ${buf.length} B, need ${need}`);
  }

  const features: FeatureInfo[] = [];
  let o = CAPS_HDR;
  for (let i = 0; i < count; i++) {
    features.push({
      // Deliberately not validated against Feature: an id from a newer firmware
      // is kept verbatim so nothing is silently lost, and stays inert because
      // every query below looks up a known id rather than iterating (see
      // FeatureInfo.id).
      id: dv.getUint8(o) as Feature,
      wireVer: dv.getUint8(o + 1),
      caps: dv.getUint16(o + 2, true),
    });
    o += CAPS_FEAT;
  }
  // `buf` may run on past `o` — a longer header's worth of new fields parked
  // after the table (contract rule c), or padding. Ignored by design.
  return { descVersion, fw, features };
}

/* --------------------------------------------------------------------------
 * Queries. All of them take `caps | null`, where null means "this firmware
 * can't introduce itself" — in which case we assume the feature MIGHT be there
 * and let the actual read fail, which is how the app behaved before.
 * ----------------------------------------------------------------------- */

export function hasFeature(caps: ToraboCaps | null, id: Feature): boolean {
  if (!caps) return true; // pre-capabilities firmware: don't hide anything
  return caps.features.some((f) => f.id === id);
}

export function featureInfo(caps: ToraboCaps | null, id: Feature): FeatureInfo | null {
  if (!caps) return null;
  return caps.features.find((f) => f.id === id) ?? null;
}

/**
 * May we write this feature's config back to the keyboard?
 *
 * False only when the firmware reports a wire version NEWER than the codec here
 * understands (APP_MAX_WIRE_VER). Its config then carries fields our decoder
 * never saw, and encoding from what we did decode would write them away — the
 * user loses settings they cannot even see in this app. Better to leave the
 * panel read-only and say so.
 *
 * True in every other case, on purpose:
 *   - caps === null: pre-capabilities firmware, which by definition predates
 *     every version this could be protecting against. Same fail-open convention
 *     as hasFeature — never break an older keyboard over a question it can't
 *     answer.
 *   - feature absent from the descriptor: there is nothing to damage. The read
 *     fails on its own and the panel never gets a config to write back.
 *   - equal or older wire: the codec speaks it, and both encoders answer in the
 *     version they were spoken to (see ztcConfig.ts / tpConfigV2.ts headers).
 *
 * The remaining case is an id present in the descriptor that this app has never
 * heard of — a feature added in newer firmware (contract rule 3). That is the
 * one place where "no entry" means blocked rather than allowed, and it is the
 * conservative answer: there is no codec for it, so nothing could produce a
 * blob to write in the first place. It is written out below instead of being
 * left to `wireVer <= undefined`, which happens to be false for the same
 * outcome by accident rather than intent. Unreachable today — every caller
 * passes a Feature enum member — so this is a statement of intent for whoever
 * later plumbs a raw descriptor id through here.
 */
export function canWriteFeature(caps: ToraboCaps | null, id: Feature): boolean {
  const f = featureInfo(caps, id);
  if (!f) return true;
  const appMax: number | undefined = APP_MAX_WIRE_VER[id];
  if (appMax === undefined) return false; // feature this app has no codec for
  return f.wireVer <= appMax;
}

/**
 * The version the descriptor named, or the "older firmware" wording when it
 * could not name one.
 *
 * It is the ext_FW version — caps.c fills the header from
 * CONFIG_TORABO_FW_VERSION_*, which versions the torabo modules, not the ZMK
 * they are built against. Anything showing this to a user must say so (the
 * firmware-info tab labels it "ext_FW"); calling it "the firmware version"
 * invites a comparison against a ZMK release that means nothing.
 */
export function fwVersionString(caps: ToraboCaps | null): string {
  if (!caps) return tr("sys.caps.fwUnknown");
  const { major, minor, patch } = caps.fw;
  return `${major}.${minor}.${patch}`;
}

/** Does this firmware push the debounce windows to the peripheral half too?
 *
 * Answers false for pre-capabilities firmware, which is right: it predates the
 * split propagation entirely. Only used to word a note, never to hide anything. */
export function hasSplitDebounce(caps: ToraboCaps | null): boolean {
  const f = featureInfo(caps, Feature.Timing);
  return !!f && (f.caps & TimingCap.SplitDebounce) !== 0;
}

/**
 * The macros wire version that first carries per-slot names — the appended name
 * block on READ and the name-only WRITE op (PLAN-ext-fw-refactor.md フェーズ8,
 * spelled out in dmacConfig.ts's header).
 *
 * A literal rather than an import of DM_VERSION_V2, for the same reason
 * APP_MAX_WIRE_VER is hand-maintained: this file states what the firmware
 * reports and must not pull in a codec to do it. toraboCaps.test.ts asserts the
 * two agree, which is what catches the drift.
 */
export const MACRO_NAMES_WIRE_VER = 2;

/**
 * Does this firmware store a name per macro slot?
 *
 * Unlike the coast/debounce queries this is a WIRE VERSION question, not a caps
 * bit: names changed the shape of the macro blob, so the version byte is what
 * says whether they are there — a caps bit could not tell a decoder how long the
 * blob is. Answers false for pre-capabilities firmware, which is right (it
 * predates the feature), and false is the safe direction: the name UI stays
 * hidden and the panel looks exactly as it did before names existed.
 */
export function hasMacroNames(caps: ToraboCaps | null): boolean {
  const f = featureInfo(caps, Feature.Macros);
  return !!f && f.wireVer >= MACRO_NAMES_WIRE_VER;
}

/** Does this firmware have the trackpad's inertial-scroll ("coast") engine?
 *
 * Answers false for pre-capabilities firmware, which is right: it predates the
 * feature entirely. The panel ORs this with what the wire itself said (a v3 blob
 * proves the engine is there), so a keyboard whose descriptor read failed still
 * gets the section rather than losing a setting it can actually apply. */
export function hasTrackpadCoast(caps: ToraboCaps | null): boolean {
  const f = featureInfo(caps, Feature.Trackpad);
  return !!f && (f.caps & TrackpadCap.Coast) !== 0;
}

/** Same question for the trackball. */
export function hasTrackballCoast(caps: ToraboCaps | null): boolean {
  const f = featureInfo(caps, Feature.Trackball);
  return !!f && (f.caps & TrackballCap.Coast) !== 0;
}

/** Which halves actually have an LED. Empty => hide the LED tab entirely. */
export function ledSides(caps: ToraboCaps | null): { left: boolean; right: boolean } {
  const f = featureInfo(caps, Feature.Led);
  if (!f) return { left: false, right: false };
  return {
    left: (f.caps & LedCap.Left) !== 0,
    right: (f.caps & LedCap.Right) !== 0,
  };
}
