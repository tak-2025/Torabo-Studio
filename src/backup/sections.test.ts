/**
 * Tests for restore's per-section wire-version gates (sections.ts).
 *
 * These are the checks that run against a blob that has been sitting in a file:
 * neither side of the mismatch is the one the app read this session, so the
 * codec's own version check would only fire after the bytes were already on
 * their way to the keyboard.
 *
 * Everything here is pure — no BLE, no backend: a section row, a Uint8Array,
 * and a decoded capability descriptor.
 */
import { describe, it, expect } from "vitest";

import {
  CAPS_HDR,
  CAPS_FEAT,
  CAPS_MAGIC,
  CAPS_DESC_VERSION,
  Feature,
  decodeCaps,
} from "../caps/toraboCaps";
import {
  NONE_BIND,
  TP_FW_BLOB_MAX,
  TpRole,
  defaultCoast,
  encodeTp,
  type TpConfig,
} from "../trackpad/tpConfigV2";
import {
  BACKUP_SECTIONS,
  SECTION_BY_KEY,
  blobWireVersion,
  restoreBlock,
  trackpadReadbackBlock,
} from "./sections";

/** Same builder the caps tests use: header + one 4-byte row per feature. */
function caps(features: { id: number; wireVer: number }[]) {
  const buf = new Uint8Array(CAPS_HDR + features.length * CAPS_FEAT);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, CAPS_MAGIC, true);
  dv.setUint8(2, CAPS_DESC_VERSION);
  dv.setUint8(6, features.length);
  features.forEach((f, i) => {
    const o = CAPS_HDR + i * CAPS_FEAT;
    dv.setUint8(o, f.id);
    dv.setUint8(o + 1, f.wireVer);
  });
  return decodeCaps(buf);
}

/** A stored blob long enough to carry a version byte at the section's offset. */
function blob(offset: number, version: number, len = 32): Uint8Array {
  const b = new Uint8Array(len);
  b[offset] = version;
  return b;
}

const trackball = SECTION_BY_KEY.trackball;
const timing = SECTION_BY_KEY.timing;
const trackpad = SECTION_BY_KEY.trackpad;

/**
 * A stored trackpad wire of `devices` devices x 20 layers, as a backup file
 * would hold it. `version` picks the shape the FILE is in — the guard cares
 * about the v3 read-back the firmware would produce from it either way.
 */
function tpBlob(devices: number, version: 2 | 3 = 3): Uint8Array {
  const layer = {
    x: { role: TpRole.Move, reverse: false, step: 1, pos: NONE_BIND, neg: NONE_BIND },
    y: { role: TpRole.Move, reverse: false, step: 1, pos: NONE_BIND, neg: NONE_BIND },
    gestures: { tap: NONE_BIND, tap2: NONE_BIND, hold: NONE_BIND, dtap: NONE_BIND },
  };
  const cfg: TpConfig = {
    devices: Array.from({ length: devices }, (_, i) => ({
      deviceId: i,
      meta: 0,
      coast: defaultCoast(),
      layers: Array.from({ length: 20 }, () => layer),
    })),
    layerCount: 20,
    hasGestures: true,
    hasCoast: version === 3,
  };
  return encodeTp(cfg);
}

describe("section wire-version metadata", () => {
  it("gives every section a feature and a version-byte offset", () => {
    for (const s of BACKUP_SECTIONS) {
      expect(s.feature).toEqual(expect.any(Number));
      expect(s.wireVerOffset).toEqual(expect.any(Number));
    }
  });

  it("puts the version after the magic everywhere except timing, which has none", () => {
    for (const s of BACKUP_SECTIONS) {
      expect(s.wireVerOffset).toBe(s.key === "timing" ? 0 : 2);
    }
  });

  it("reads the version byte from each section's own offset", () => {
    // magic u16, then version — the shape of six of the seven wires.
    expect(blobWireVersion(trackball, new Uint8Array([0x74, 0x7a, 3, 0]))).toBe(3);
    // timing has no magic: the version IS byte 0.
    expect(blobWireVersion(timing, new Uint8Array([1, 0, 0, 0]))).toBe(1);
  });

  it("returns null for a blob too short to hold a version", () => {
    expect(blobWireVersion(trackball, new Uint8Array([0x74, 0x7a]))).toBeNull();
    expect(blobWireVersion(timing, new Uint8Array())).toBeNull();
  });
});

describe("restoreBlock", () => {
  it("allows a blob whose version the firmware speaks", () => {
    const fw = caps([{ id: Feature.Trackball, wireVer: 3 }]);
    expect(restoreBlock(trackball, blob(2, 3), fw)).toBeNull();
    expect(restoreBlock(trackball, blob(2, 2), fw)).toBeNull(); // older file: fine
  });

  it("blocks a blob newer than the firmware it is being restored onto", () => {
    // A v3 trackball blob taken off a newer keyboard, onto v2-only firmware.
    const fw = caps([{ id: Feature.Trackball, wireVer: 2 }]);
    expect(restoreBlock(trackball, blob(2, 3), fw)).toEqual({
      key: "bk.skip.blobNewerThanFw",
      vars: { file: 3, fw: 2 },
    });
  });

  it("blocks every section when the firmware is newer than this app", () => {
    // wireVer 4 > APP_MAX_WIRE_VER[Trackball] (3): the file cannot carry what
    // this firmware has, whatever version the file itself claims.
    const fw = caps([{ id: Feature.Trackball, wireVer: 4 }]);
    expect(restoreBlock(trackball, blob(2, 3), fw)?.key).toBe(
      "bk.skip.fwNewerThanApp",
    );
  });

  it("allows everything on pre-capabilities firmware", () => {
    // No descriptor: no wire version to compare against, so restore behaves as
    // it always did — write it and let the firmware validate.
    expect(restoreBlock(trackball, blob(2, 3), null)).toBeNull();
    expect(restoreBlock(trackball, blob(2, 99), null)).toBeNull();
  });

  it("allows a section the descriptor doesn't list", () => {
    const fw = caps([{ id: Feature.Timing, wireVer: 1 }]);
    expect(restoreBlock(trackball, blob(2, 3), fw)).toBeNull();
  });

  it("allows a blob too short to state a version — the codec rejects it better", () => {
    const fw = caps([{ id: Feature.Trackball, wireVer: 2 }]);
    expect(restoreBlock(trackball, new Uint8Array([0x74, 0x7a]), fw)).toBeNull();
  });

  it("reads timing's version from byte 0, not byte 2", () => {
    const fw = caps([{ id: Feature.Timing, wireVer: 1 }]);
    // version 2 at byte 0 → too new. Byte 2 holds an unrelated field.
    expect(restoreBlock(timing, blob(0, 2), fw)?.key).toBe(
      "bk.skip.blobNewerThanFw",
    );
    expect(restoreBlock(timing, blob(0, 1), fw)).toBeNull();
  });

  /**
   * The trackpad's content gate. Version agreement is not enough here: the
   * firmware ACCEPTS a 3-/4-device config, persists it, and can then never read
   * it back — so restore has to weigh the blob, not just date it.
   */
  it("blocks a trackpad blob the firmware could never read back", () => {
    const fw = caps([{ id: Feature.Trackpad, wireVer: 3 }]);
    expect(restoreBlock(trackpad, tpBlob(3), fw)).toEqual({
      key: "bk.skip.tpReadbackTooBig",
      vars: { size: 2301, max: TP_FW_BLOB_MAX },
    });
    expect(restoreBlock(trackpad, tpBlob(4), fw)?.vars.size).toBe(3066);
  });

  it("allows a trackpad blob from today's 2-device hardware", () => {
    const fw = caps([{ id: Feature.Trackpad, wireVer: 3 }]);
    expect(restoreBlock(trackpad, tpBlob(2), fw)).toBeNull();
    expect(restoreBlock(trackpad, tpBlob(1), fw)).toBeNull();
  });

  it("weighs the firmware's v3 read-back, not the bytes the file holds", () => {
    // A v2 file is 3 bytes/device smaller than what the firmware answers with,
    // and a v2 3-device file is still over budget once upgraded.
    const fw = caps([{ id: Feature.Trackpad, wireVer: 3 }]);
    expect(tpBlob(3, 2).byteLength).toBe(2292); // the file's own bytes
    expect(restoreBlock(trackpad, tpBlob(3, 2), fw)?.vars.size).toBe(2301);
    expect(restoreBlock(trackpad, tpBlob(2, 2), fw)).toBeNull();
  });

  it("runs the size gate on pre-capabilities firmware too", () => {
    // No descriptor means "let the firmware decide" for the version gates, but
    // the firmware deciding IS the failure mode here: it says yes.
    expect(restoreBlock(trackpad, tpBlob(4), null)?.key).toBe(
      "bk.skip.tpReadbackTooBig",
    );
  });

  it("forwards a caller-supplied blob budget to the size gate", () => {
    // The seam for a desc_ver 2 descriptor that reports the real budget: 3072
    // (what torabo_tsuki_lp_right.conf sets by hand) clears 3 and 4 devices,
    // the same blobs the 2048 default refuses.
    const fw = caps([{ id: Feature.Trackpad, wireVer: 3 }]);
    expect(restoreBlock(trackpad, tpBlob(4), fw, 3072)).toBeNull();
    expect(restoreBlock(trackpad, tpBlob(3), fw, 3072)).toBeNull();
    expect(restoreBlock(trackpad, tpBlob(3), fw)?.key).toBe(
      "bk.skip.tpReadbackTooBig",
    );
    // A tighter budget than the default refuses more, not less.
    expect(restoreBlock(trackpad, tpBlob(2), fw, 1024)?.vars).toEqual({
      size: 1536,
      max: 1024,
    });
  });

  /**
   * Macros opts out of rule (b): restore decodes the blob and replays it as
   * per-slot v1 steps ops, so the file's bytes never reach the keyboard and a
   * v2 backup's STEPS restore onto v1 firmware perfectly. Only the names have
   * nowhere to go, and restoreBackup.ts reports that as a note rather than
   * throwing the whole restore away. See BackupSection.replayDecoded.
   */
  it("allows a v2 macro blob onto v1 firmware — the steps replay as v1 ops", () => {
    const fw = caps([{ id: Feature.Macros, wireVer: 1 }]);
    expect(restoreBlock(SECTION_BY_KEY.macros, blob(2, 2), fw)).toBeNull();
    // …and on firmware that never introduced itself.
    expect(restoreBlock(SECTION_BY_KEY.macros, blob(2, 2), null)).toBeNull();
  });

  it("still skips a macro blob this app's codec cannot read", () => {
    // v3 is the protection that stays: a blob decodeDmac rejects cannot be
    // replayed at all, so there is nothing to salvage. The reason names the
    // APP, because the app is what is behind here.
    for (const fw of [caps([{ id: Feature.Macros, wireVer: 1 }]), null]) {
      expect(restoreBlock(SECTION_BY_KEY.macros, blob(2, 3), fw)).toEqual({
        key: "bk.skip.blobNewerThanApp",
        vars: { file: 3, app: 2 },
      });
    }
  });

  it("keeps rule (a) for macros: firmware newer than this app still blocks", () => {
    // A v3 macros firmware has fields this app cannot encode; replaying a v1/v2
    // file onto it would write them away. Nothing about replayDecoded changes
    // that direction.
    const fw = caps([{ id: Feature.Macros, wireVer: 3 }]);
    expect(restoreBlock(SECTION_BY_KEY.macros, blob(2, 2), fw)?.key).toBe(
      "bk.skip.fwNewerThanApp",
    );
  });

  it("allows a macro blob onto firmware of the same or newer wire", () => {
    // v2 file onto v2 firmware: names restore too (restoreBackup.ts).
    expect(
      restoreBlock(SECTION_BY_KEY.macros, blob(2, 2), caps([{ id: Feature.Macros, wireVer: 2 }])),
    ).toBeNull();
    // v1 file onto v2 firmware: steps restore, and because steps writes stay
    // v1 forever the keyboard KEEPS the names it already had.
    expect(
      restoreBlock(SECTION_BY_KEY.macros, blob(2, 1), caps([{ id: Feature.Macros, wireVer: 2 }])),
    ).toBeNull();
    // v1 file onto v1 firmware: exactly as before any of this existed.
    expect(
      restoreBlock(SECTION_BY_KEY.macros, blob(2, 1), caps([{ id: Feature.Macros, wireVer: 1 }])),
    ).toBeNull();
  });

  it("relaxes the gate for macros only — every raw-blob section still uses it", () => {
    // The override is one flag on one row. Everything restore writes verbatim
    // keeps rule (b), including combos, which has the same decode-and-replay
    // shape but no v2 to need it yet.
    expect(SECTION_BY_KEY.macros.replayDecoded).toBe(true);
    for (const s of BACKUP_SECTIONS) {
      if (s.key === "macros") continue;
      expect(s.replayDecoded).toBeUndefined();
    }
    const fw = caps([{ id: Feature.Combos, wireVer: 1 }]);
    expect(restoreBlock(SECTION_BY_KEY.combos, blob(2, 2), fw)).toEqual({
      key: "bk.skip.blobNewerThanFw",
      vars: { file: 2, fw: 1 },
    });
  });

  it("leaves an undecodable trackpad blob to the codec", () => {
    // Garbage, a truncated section, a wire version this app cannot read: all of
    // them get the codec's own error, not an invented size complaint.
    expect(trackpadReadbackBlock(new Uint8Array(0))).toBeNull();
    expect(trackpadReadbackBlock(new Uint8Array([0x74, 0x70, 9, 4, 20, 3]))).toBeNull();
    expect(trackpadReadbackBlock(tpBlob(4).slice(0, 100))).toBeNull();
  });
});
