// The sections a backup file is made of, as data.
//
// Export and restore used to spell every section out twice — once as a read
// wrapped in try/catch, once as a write wrapped in the same shape — so adding a
// feature meant editing two long chains inside one 670-line component, and the
// two chains had already drifted (the caps gate that stops a write existed for
// encoder/led/timing but the reason it skipped was worded per section).
//
// Here each section is one row: where its bytes come from, where they go back
// to, and whether this keyboard can take them at all. Both directions iterate
// this list, so the two stay in step by construction and a new feature is one
// row.
//
// Order matters and is deliberate:
//   - export reads in list order (trackball, macros, combos, trackpad, …),
//   - restore writes the blob sections in list order (trackball, trackpad, …),
//     with macros/combos handled separately because they go back one slot at a
//     time, not as one write.
// Both match what the panel did before this table existed.

import {
  trackballReadConfig,
  trackballWriteConfig,
  trackpadReadConfig,
  trackpadWriteConfig,
  encoderReadConfig,
  encoderWriteConfig,
  ledReadConfig,
  ledWriteConfig,
  timingReadConfig,
  timingWriteConfig,
  dmacReadAll,
  comboReadAll,
} from "../backends";
import {
  APP_MAX_WIRE_VER,
  Feature,
  canWriteFeature,
  featureInfo,
  hasFeature,
  ledSides,
  ToraboCaps,
} from "../caps/toraboCaps";
import {
  TP_FW_BLOB_MAX,
  decodeTp,
  tpFirmwareReadbackSize,
} from "../trackpad/tpConfigV2";
import { decodeZtc, encodeZtc, reshapeZtc } from "../trackball/ztcConfig";

/** Keys in BackupFile that hold a base64 wire blob. */
export type SectionKey =
  | "trackball"
  | "macros"
  | "combos"
  | "trackpad"
  | "encoder"
  | "led"
  | "timing";

export interface BackupSection {
  key: SectionKey;
  /** i18n key for the section's name, used in both summaries. */
  labelKey: string;
  /**
   * The firmware feature this section's wire belongs to. Both of restore's
   * version gates are per-feature: what this app's codec can encode
   * (APP_MAX_WIRE_VER) and what the connected keyboard reported in its
   * capability descriptor.
   */
  feature: Feature;
  /**
   * Byte offset of the version byte inside this section's READ wire — where
   * restore looks to find out which version the FILE was written in.
   *
   * Every wire but one starts magic u16 then version u8, i.e. offset 2; timing
   * has no magic and puts the version first (timingConfig.ts's W_VERSION = 0).
   * Hence a per-section number rather than a shared constant.
   */
  wireVerOffset: number;
  /** Reads the whole section off the keyboard (export). */
  read: () => Promise<Uint8Array>;
  /**
   * Writes it back in one call (restore). Absent for macros and combos, which
   * are restored slot by slot by the panel.
   */
  write?: (data: Uint8Array) => Promise<void>;
  /**
   * Whether this keyboard has the feature at all. Absent means "always try" —
   * the service simply rejects on firmware built without it, which both
   * directions already treat as "skip this section".
   */
  supported?: (caps: ToraboCaps | null) => boolean;
  /** i18n key for "the backup has this, but this keyboard cannot take it". */
  skipKey?: string;
  /**
   * True when restore does NOT hand this section's stored bytes to the
   * keyboard: it decodes the blob and replays the result through this app's own
   * per-slot write ops, which are encoded fresh.
   *
   * That changes which question the version gate has to ask. For a raw-blob
   * section the file's bytes ARE what gets written, so a file newer than the
   * firmware is unwritable, full stop. Here the bytes are only an input to a
   * decoder, and what reaches the keyboard is whatever this app can encode — so
   * the question is "can the APP read this file", not "is the file newer than
   * the firmware". See restoreBlock (b).
   *
   * Set on macros (per-slot re-encode) and on the trackball (whole-wire
   * re-encode, because the wire's LENGTH is tied to the source keyboard's layer
   * count — see trackballRestore). Combos has the same decode-and-replay shape
   * (restoreBackup.ts writes them with encodeSlot per slot) and would want this
   * flag the day its wire gains a v2 — deliberately NOT set today, because
   * combos has only ever had v1 and the flag would change nothing except which
   * untested path a hypothetical v2 file takes.
   */
  replayDecoded?: boolean;
  /**
   * A gate that depends on what the blob CONTAINS, not on its version byte.
   *
   * Only the trackpad has one so far (trackpadReadbackBlock): its wire can be
   * written in a shape the firmware then cannot read back. Decoding is the
   * section's own business — the codec differs per wire — so the check lives
   * with the section rather than in restoreBlock.
   *
   * `budget` is restoreBlock's own optional blob-budget argument, forwarded
   * unchanged; a gate that does not care about size ignores it.
   */
  contentBlock?: (blob: Uint8Array, budget?: number) => RestoreBlock | null;
}

/**
 * Gated like the LED tab in MainPanels: the feature has to be in the firmware
 * AND at least one side has to actually have an LED. Unknown caps (firmware
 * from before the descriptor) means "don't hide it".
 */
export function ledFeatureAvailable(caps: ToraboCaps | null): boolean {
  if (!hasFeature(caps, Feature.Led)) return false;
  if (!caps) return true;
  const { left, right } = ledSides(caps);
  return left || right;
}

/**
 * The trackpad's content gate: would the firmware still be able to READ this
 * config back after we wrote it?
 *
 * The firmware answers every read with the full v3 encoding of what it stored
 * and refuses rather than truncating when that overflows the tunnel's blob
 * budget — so a 3-/4-device blob is accepted, saved, and leaves the config
 * unreadable for good, with no way back from the app. See TP_FW_BLOB_MAX in
 * tpConfigV2.ts for the firmware evidence. Restore is the realistic way such a
 * blob arrives: the file may come from a keyboard with more pads than this one.
 *
 * `budget` defaults to TP_FW_BLOB_MAX (the firmware's Kconfig default). A build
 * may have raised it, and a planned desc_ver 2 capability descriptor will say
 * so — that is what this parameter is for. Nothing passes it yet.
 */
export function trackpadReadbackBlock(
  blob: Uint8Array,
  budget: number = TP_FW_BLOB_MAX,
): RestoreBlock | null {
  let size: number;
  try {
    // Accepts v1/v2/v3; what matters is the v3 read-back of what the FIRMWARE
    // would end up storing, not the version the file happens to be in.
    size = tpFirmwareReadbackSize(decodeTp(blob));
  } catch {
    // Not a trackpad wire we can read. Say nothing: the codec throws a better
    // message than we could invent, and restore already reports that.
    return null;
  }
  if (size <= budget) return null;
  return { key: "bk.skip.tpReadbackTooBig", vars: { size, max: budget } };
}

/**
 * Restore the trackball section by RE-ENCODING it for this keyboard, not by
 * handing back the file's bytes.
 *
 * The ztc wire is `8 + 12 * ZMK_KEYMAP_LAYERS_LEN (+ 4 in v3)` bytes and the
 * firmware checks that length EXACTLY (`ztc_apply_wire`, len != want =>
 * -EINVAL), so the stored wire is only writable to a keyboard whose layer count
 * still matches the one it was taken from. That is not just a cross-device
 * concern: turning on reserved layers (the torabo-reserved-layers snippet)
 * raises ZMK_KEYMAP_LAYERS_LEN on the same keyboard, and every backup taken
 * before that becomes unrestorable — the section fails with a raw
 * "value not allowed" from the config service and nothing says why.
 *
 * Reading the keyboard first is what makes the re-encode possible: `live` is
 * where the target's layer count and wire version come from. See reshapeZtc.
 */
async function trackballRestore(blob: Uint8Array): Promise<void> {
  const live = decodeZtc(await trackballReadConfig());
  await trackballWriteConfig(encodeZtc(reshapeZtc(decodeZtc(blob), live)));
}

export const BACKUP_SECTIONS: BackupSection[] = [
  {
    key: "trackball",
    labelKey: "bk.sec.trackball",
    feature: Feature.Trackball,
    wireVerOffset: 2,
    read: trackballReadConfig,
    write: trackballRestore,
    // Re-encoded, never replayed verbatim — see trackballRestore above and the
    // flag's own doc comment.
    replayDecoded: true,
  },
  // Restored one slot at a time (see the panel) — no `write` here.
  {
    key: "macros",
    labelKey: "bk.sec.macros",
    feature: Feature.Macros,
    wireVerOffset: 2,
    read: dmacReadAll,
    replayDecoded: true,
  },
  {
    key: "combos",
    labelKey: "bk.sec.combos",
    feature: Feature.Combos,
    wireVerOffset: 2,
    read: comboReadAll,
  },
  {
    key: "trackpad",
    labelKey: "bk.sec.trackpad",
    feature: Feature.Trackpad,
    wireVerOffset: 2,
    read: trackpadReadConfig,
    write: trackpadWriteConfig,
    contentBlock: trackpadReadbackBlock,
  },
  {
    key: "encoder",
    labelKey: "bk.sec.encoder",
    feature: Feature.Encoder,
    wireVerOffset: 2,
    read: encoderReadConfig,
    write: encoderWriteConfig,
    supported: (caps) => hasFeature(caps, Feature.Encoder),
    skipKey: "bk.skip.noEncoder",
  },
  {
    key: "led",
    labelKey: "bk.sec.led",
    feature: Feature.Led,
    wireVerOffset: 2,
    read: ledReadConfig,
    write: ledWriteConfig,
    supported: ledFeatureAvailable,
    skipKey: "bk.skip.noLed",
  },
  {
    key: "timing",
    labelKey: "bk.sec.timing",
    feature: Feature.Timing,
    // No magic on this wire: the version IS the first byte.
    wireVerOffset: 0,
    read: timingReadConfig,
    write: timingWriteConfig,
    supported: (caps) => hasFeature(caps, Feature.Timing),
    skipKey: "bk.skip.noTiming",
  },
];

/**
 * The same table, keyed. Restore reaches macros and combos directly — they go
 * back one slot at a time, so they are not in BLOB_RESTORE_SECTIONS — and still
 * has to run the version gates below on them.
 */
export const SECTION_BY_KEY = Object.fromEntries(
  BACKUP_SECTIONS.map((s) => [s.key, s])
) as Record<SectionKey, BackupSection>;

/**
 * The wire version a stored blob was written in, or null when the blob is too
 * short to hold one (a truncated/garbage section — the codec will reject it
 * with a better message than we could invent here).
 */
export function blobWireVersion(
  s: BackupSection,
  blob: Uint8Array
): number | null {
  return blob.length > s.wireVerOffset ? blob[s.wireVerOffset] : null;
}

/** Why a section must not be written back, as an untranslated message key. */
export interface RestoreBlock {
  /** i18n key. `label` is added by the caller, which already has it. */
  key: string;
  vars: Record<string, number>;
}

/**
 * May this stored blob be written to the connected keyboard?
 *
 * Returns null when it may, or the reason when it must not. Two different
 * mismatches, in the two possible directions:
 *
 *   (a) the FIRMWARE is newer than this app — the same guard every settings
 *       panel uses (canWriteFeature). Restore writes the file's bytes rather
 *       than re-encoding them, so nothing would be dropped on the way through,
 *       but the file itself came from an app that understood no more than this
 *       one: writing it would roll the keyboard back to a wire that cannot
 *       carry the fields its firmware has. Same refusal, same reason.
 *
 *   (b) the FILE is newer than the firmware — a v3 blob taken off a newer
 *       keyboard, restored onto one that only speaks v2. Until now this leaned
 *       entirely on the firmware validating what it was handed; it does, but a
 *       rejected write reaches the user as a raw error from the config service
 *       rather than as "this section is from a newer keyboard".
 *
 *       EXCEPT for a `replayDecoded` section, where the file's bytes never
 *       reach the keyboard. Macros is the case: restore decodes the blob and
 *       writes each slot's steps with encodeSlot, which emits v1 and always
 *       will (PLAN-ext-fw-refactor.md フェーズ8 pins steps writes at v1 so an
 *       app that cannot see names can still write steps). So a v2 macro backup
 *       restores onto v1 firmware perfectly — every step lands, in ops that
 *       firmware has always accepted — and only the NAMES have nowhere to go.
 *       Refusing the whole section would throw away a restore that works, over
 *       a field the source keyboard may not even have used. The names are
 *       dropped and said so, per slot-writing section, in restoreBackup.ts.
 *
 *       What replaces the check is not nothing: the file must still be a
 *       version this app's CODEC can read, because a blob it cannot decode
 *       cannot be replayed at all. That is APP_MAX_WIRE_VER — the same number
 *       (a) uses from the other side — so a v3 macro file is still skipped,
 *       with a reason naming the app rather than the firmware.
 *
 *   (c) the section's own `contentBlock`, when it has one. Version agreement is
 *       not enough for the trackpad: the firmware would ACCEPT a 3-/4-device v3
 *       blob and then never be able to read it back (see
 *       trackpadReadbackBlock). Checked last — a version mismatch is the more
 *       basic answer, and a blob from a newer wire may not decode at all here.
 *
 * All three are skipped rather than attempted, and all three are reported — see
 * restoreBackup.ts, which folds them into the summary's skipped list.
 *
 * `blobBudget` is the keyboard's tunnel blob budget in bytes, forwarded to (c).
 * Left unset it falls back to the firmware's Kconfig default; the caller here
 * already holds `caps`, so it is where a descriptor-reported budget will be
 * read once desc_ver 2 carries one. See TP_FW_BLOB_MAX in tpConfigV2.ts.
 */
export function restoreBlock(
  s: BackupSection,
  blob: Uint8Array,
  caps: ToraboCaps | null,
  blobBudget?: number
): RestoreBlock | null {
  if (!canWriteFeature(caps, s.feature)) {
    return { key: "bk.skip.fwNewerThanApp", vars: {} };
  }
  const fileVer = blobWireVersion(s, blob);
  const fw = featureInfo(caps, s.feature);
  if (s.replayDecoded) {
    // The app's codec is the limit, not the firmware's wire: what gets written
    // is re-encoded here, not the file's bytes. Independent of `caps` on
    // purpose — a keyboard that cannot introduce itself changes nothing about
    // whether this app can read the file.
    const appMax = APP_MAX_WIRE_VER[s.feature];
    if (fileVer !== null && fileVer > appMax) {
      return {
        key: "bk.skip.blobNewerThanApp",
        vars: { file: fileVer, app: appMax },
      };
    }
  } else if (fileVer !== null && fw && fileVer > fw.wireVer) {
    // Only meaningful when the keyboard actually told us its wire version:
    // pre-capabilities firmware gets the old behaviour (try it, let the
    // firmware decide), which is the app's convention everywhere else.
    return {
      key: "bk.skip.blobNewerThanFw",
      vars: { file: fileVer, fw: fw.wireVer },
    };
  }
  return s.contentBlock?.(blob, blobBudget) ?? null;
}

/** The sections restore writes in one call, in the order it writes them. */
export const BLOB_RESTORE_SECTIONS = BACKUP_SECTIONS.filter(
  (s): s is BackupSection & { write: (d: Uint8Array) => Promise<void> } => !!s.write
);
