/**
 * Tests for the dynamic-macro wire codec. Golden bytes are hand-assembled from
 * the wire layout documented in dmacConfig.ts's own header comment and
 * torabo-tsuki_ext_FW/docs/DESIGN-macros.md §4 (DM_MAGIC=0x6D64, DM_SLOTS=20,
 * DM_STEPS=16, step = action u8 + keycode u32 LE, READ slot = used_len u8 +
 * DM_STEPS*step = 81 bytes) — plus, for v2, PLAN-ext-fw-refactor.md フェーズ8:
 * a name block of `name_len u8 + name[16]` per slot appended after the last
 * slot, and a 20-byte name-only WRITE op.
 *
 * **The v2 firmware does not exist yet.** These golden bytes are the reference
 * the firmware will be written against, which is why the v2 blobs below are
 * assembled from literal offsets rather than from anything the codec exports
 * beyond the wire contract itself (DM_MAGIC, DM_VERSION_V1, DM_VERSION_V2,
 * DM_SLOTS, DM_STEPS, DM_NAME_MAX) — exactly as any other consumer of the wire
 * would.
 */
import { describe, it, expect } from "vitest";
import {
  DM_MAGIC,
  DM_NAME_MAX,
  DM_VERSION,
  DM_VERSION_V1,
  DM_VERSION_V2,
  DM_SLOTS,
  DM_STEPS,
  DmAction,
  DmWriteKind,
  decodeDmac,
  encodeMacroName,
  encodeSlot,
  fitMacroName,
  macroNameBytes,
  splitKeycode,
  makeKeycode,
  MOD_LCTL,
  MOD_LSFT,
  MOD_LGUI,
  type DmStep,
} from "./dmacConfig";

const READ_HDR = 4;
const STEP_BYTES = 5; // action u8 + keycode u32, per DESIGN-macros.md §4.2
const READ_SLOT = 1 + DM_STEPS * STEP_BYTES; // 81, per DESIGN-macros.md §4.3
const READ_NAME = 1 + DM_NAME_MAX; // 17, per PLAN フェーズ8

/**
 * Hand-rolled READ-blob builder per DESIGN-macros.md §4.3 (+ PLAN フェーズ8 for
 * the name block) — independent of decodeDmac's own parsing so the test isn't
 * just re-running the same code.
 *
 * Passing `names` switches the blob to v2: the slot region is byte-for-byte the
 * v1 one and the name block is appended after it.
 */
function buildReadBlob(
  slotCount: number,
  filled: Record<number, DmStep[]>,
  names?: Record<number, string>,
): Uint8Array {
  const namesBase = READ_HDR + slotCount * READ_SLOT;
  const buf = new Uint8Array(namesBase + (names ? slotCount * READ_NAME : 0));
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, DM_MAGIC, true);
  dv.setUint8(2, names ? DM_VERSION_V2 : DM_VERSION_V1);
  dv.setUint8(3, slotCount);
  for (const [idxStr, steps] of Object.entries(filled)) {
    const idx = Number(idxStr);
    const base = READ_HDR + idx * READ_SLOT;
    dv.setUint8(base, steps.length);
    steps.forEach((s, i) => {
      const o = base + 1 + i * STEP_BYTES;
      dv.setUint8(o, s.action);
      dv.setUint32(o + 1, s.keycode >>> 0, true);
    });
  }
  for (const [idxStr, name] of Object.entries(names ?? {})) {
    const nb = new TextEncoder().encode(name);
    const o = namesBase + Number(idxStr) * READ_NAME;
    dv.setUint8(o, nb.length);
    buf.set(nb, o + 1);
  }
  return buf;
}

describe("dmacConfig wire constants", () => {
  it("match DESIGN-macros.md §4.1", () => {
    expect(DM_MAGIC).toBe(0x6d64);
    expect(DM_VERSION_V1).toBe(1);
    expect(DM_SLOTS).toBe(20);
    expect(DM_STEPS).toBe(16);
  });

  it("match PLAN-ext-fw-refactor.md フェーズ8 for v2", () => {
    expect(DM_VERSION_V2).toBe(2);
    expect(DM_VERSION).toBe(DM_VERSION_V2); // newest this codec speaks
    expect(DM_NAME_MAX).toBe(16);
    expect(DmWriteKind.Steps).toBe(0);
    expect(DmWriteKind.Name).toBe(1);
  });

  it("puts the v2 READ wire at 1964 B, inside the 2048 B tunnel blob budget", () => {
    // The size the plan committed to: 1624 (v1) + 20 * 17 (names) = 1964.
    const v1 = READ_HDR + DM_SLOTS * READ_SLOT;
    expect(v1).toBe(1624);
    expect(v1 + DM_SLOTS * READ_NAME).toBe(1964);
    expect(1964).toBeLessThanOrEqual(2048);
  });
});

describe("decodeDmac", () => {
  it("decodes a header-only blob (slot_count=0) into DM_SLOTS empty slots", () => {
    const blob = buildReadBlob(0, {});
    const cfg = decodeDmac(blob);
    expect(cfg.slots).toHaveLength(DM_SLOTS);
    expect(cfg.slots.every((s) => s.steps.length === 0)).toBe(true);
  });

  it("decodes a populated slot and pads the rest empty", () => {
    const steps: DmStep[] = [
      { action: DmAction.Press, keycode: 0x00070004 },
      { action: DmAction.Release, keycode: makeKeycode(0x000006, MOD_LSFT) },
    ];
    const blob = buildReadBlob(1, { 0: steps });
    const cfg = decodeDmac(blob);
    expect(cfg.slots).toHaveLength(DM_SLOTS);
    expect(cfg.slots[0].steps).toEqual(steps);
    for (let i = 1; i < DM_SLOTS; i++) {
      expect(cfg.slots[i].steps).toEqual([]);
    }
  });

  it("clamps a slot's used_len to DM_STEPS even if the wire byte is larger", () => {
    // Slot region is fixed-size (READ_SLOT=81B) regardless of the declared
    // used_len, so a bogus 0xFF must be clamped to DM_STEPS(16), not read
    // past the slot.
    const blob = buildReadBlob(1, {});
    const dv = new DataView(blob.buffer);
    dv.setUint8(READ_HDR, 0xff); // used_len byte of slot 0
    const cfg = decodeDmac(blob);
    expect(cfg.slots[0].steps).toHaveLength(DM_STEPS);
  });

  it("pads with empty slots when the buffer is truncated mid-walk", () => {
    // slot_count says 2 slots but the buffer only has room for 1 full slot.
    const full = buildReadBlob(1, { 0: [{ action: DmAction.Tap, keycode: 1 }] });
    const dv = new DataView(full.buffer);
    dv.setUint8(3, 2); // lie about slot_count
    const cfg = decodeDmac(full);
    expect(cfg.slots).toHaveLength(DM_SLOTS);
    expect(cfg.slots[0].steps).toEqual([{ action: DmAction.Tap, keycode: 1 }]);
    expect(cfg.slots[1].steps).toEqual([]);
  });

  it("normalises an out-of-range action byte to Tap", () => {
    const blob = buildReadBlob(1, {});
    const dv = new DataView(blob.buffer);
    dv.setUint8(READ_HDR, 1); // used_len = 1
    dv.setUint8(READ_HDR + 1, 0x7f); // bogus action byte
    dv.setUint32(READ_HDR + 2, 0x11, true);
    const cfg = decodeDmac(blob);
    expect(cfg.slots[0].steps).toEqual([{ action: DmAction.Tap, keycode: 0x11 }]);
  });

  it("throws on a buffer shorter than the 4-byte header", () => {
    expect(() => decodeDmac(new Uint8Array(3))).toThrow();
  });

  it("throws on a bad magic", () => {
    const blob = buildReadBlob(0, {});
    new DataView(blob.buffer).setUint16(0, 0x1234, true);
    expect(() => decodeDmac(blob)).toThrow(/magic/i);
  });

  it("throws on an unsupported version", () => {
    const blob = buildReadBlob(0, {});
    // 3 — one past the newest wire this codec knows. (2 is now valid.)
    new DataView(blob.buffer).setUint8(2, 3);
    expect(() => decodeDmac(blob)).toThrow(/version/i);
  });

  it("reports the version it decoded, and whether names came with it", () => {
    expect(decodeDmac(buildReadBlob(DM_SLOTS, {}))).toMatchObject({
      version: DM_VERSION_V1,
      hasNames: false,
    });
    expect(decodeDmac(buildReadBlob(DM_SLOTS, {}, {}))).toMatchObject({
      version: DM_VERSION_V2,
      hasNames: true,
    });
  });
});

/**
 * v2: the name block. The FIRMWARE IS NOT WRITTEN YET — this is the reference.
 */
describe("decodeDmac v2 names", () => {
  it("leaves every name undefined on a v1 blob", () => {
    // Not "" — the UI has to tell "this keyboard has no names" (hide the field)
    // apart from "this slot is unnamed" (show an empty field).
    const cfg = decodeDmac(buildReadBlob(DM_SLOTS, { 0: [] }));
    expect(cfg.hasNames).toBe(false);
    expect(cfg.slots.every((s) => s.name === undefined)).toBe(true);
  });

  it("reads the appended name block, empty slots included", () => {
    const cfg = decodeDmac(
      buildReadBlob(DM_SLOTS, {}, { 0: "git status", 3: "コピー", 19: "last" }),
    );
    expect(cfg.hasNames).toBe(true);
    expect(cfg.slots[0].name).toBe("git status");
    expect(cfg.slots[3].name).toBe("コピー");
    expect(cfg.slots[19].name).toBe("last");
    // Unnamed slots read back as "", the "read, and it has no name" answer.
    expect(cfg.slots[1].name).toBe("");
  });

  it("decodes the full 1964 B image at the exact documented offsets", () => {
    const blob = buildReadBlob(DM_SLOTS, {}, { 5: "abc" });
    expect(blob.byteLength).toBe(1964);
    // name block starts right after the last slot; slot 5's entry is 5*17 in.
    const o = 4 + 20 * 81 + 5 * 17;
    expect(o).toBe(1624 + 85);
    expect(blob[o]).toBe(3); // name_len
    expect([...blob.subarray(o + 1, o + 4)]).toEqual([0x61, 0x62, 0x63]);
    // the rest of the fixed 16-byte field is padding and must be ignored
    expect(decodeDmac(blob).slots[5].name).toBe("abc");
  });

  it("keeps the v1 slot region byte-identical between v1 and v2 blobs", () => {
    // The compatibility promise: an app that only knows v1 can still read a v2
    // blob's steps, because nothing before the name block moved.
    const steps: DmStep[] = [{ action: DmAction.Tap, keycode: 0x00070004 }];
    const v1 = buildReadBlob(DM_SLOTS, { 2: steps });
    const v2 = buildReadBlob(DM_SLOTS, { 2: steps }, { 2: "x" });
    expect(v2.subarray(4, 1624)).toEqual(v1.subarray(4, 1624));
    expect(decodeDmac(v2).slots[2].steps).toEqual(steps);
  });

  it("clamps a name_len byte past the 16-byte field", () => {
    // A bogus length would otherwise read into the next slot's name (or past
    // the buffer). Same reasoning as the used_len clamp.
    const blob = buildReadBlob(DM_SLOTS, {}, { 0: "abc" });
    blob[4 + 20 * 81] = 0xff;
    expect(decodeDmac(blob).slots[0].name).toHaveLength(DM_NAME_MAX);
  });

  it("throws when a v2 blob does not carry the name block it claims", () => {
    // Truncation, not evolution: the version byte says the names are there.
    const blob = buildReadBlob(DM_SLOTS, {}, {});
    expect(() => decodeDmac(blob.slice(0, 1963))).toThrow(/name block/i);
    // A v2 header on a blob that stops at the v1 length is the same fault.
    expect(() => decodeDmac(blob.slice(0, 1624))).toThrow(/name block/i);
  });

  it("survives a name that is not valid UTF-8 rather than failing the read", () => {
    // The firmware stores opaque bytes; only this app keeps them well-formed.
    // One damaged slot must not cost the other 19 their steps.
    const blob = buildReadBlob(DM_SLOTS, { 1: [{ action: DmAction.Tap, keycode: 7 }] }, {});
    const o = 4 + 20 * 81;
    blob[o] = 2;
    blob[o + 1] = 0xe3; // lead byte of a 3-byte sequence...
    blob[o + 2] = 0x81; // ...cut short
    const cfg = decodeDmac(blob);
    expect(cfg.slots[0].name).toBe("�");
    expect(cfg.slots[1].steps).toHaveLength(1);
  });
});

describe("encodeMacroName (v2 name op)", () => {
  it("emits the 20-byte op documented in PLAN フェーズ8", () => {
    const buf = encodeMacroName(7, "abc");
    expect(buf.byteLength).toBe(4 + DM_NAME_MAX);
    expect([...buf]).toEqual([
      DM_VERSION_V2, // [0] version = 2
      7, // [1] slot
      DmWriteKind.Name, // [2] kind = 1
      3, // [3] name_len
      0x61, 0x62, 0x63, // [4..] name, UTF-8
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // zero padding to 16 B
    ]);
  });

  it("sends the fixed field even for an empty name (clearing one)", () => {
    const buf = encodeMacroName(0, "");
    expect(buf.byteLength).toBe(20);
    expect(buf[3]).toBe(0);
    expect([...buf.subarray(4)].every((b) => b === 0)).toBe(true);
  });

  it("writes multi-byte names as UTF-8, length in BYTES", () => {
    const buf = encodeMacroName(1, "コピー");
    expect(buf[3]).toBe(9); // 3 characters x 3 bytes
    expect([...buf.subarray(4, 13)]).toEqual([
      0xe3, 0x82, 0xb3, 0xe3, 0x83, 0x94, 0xe3, 0x83, 0xbc,
    ]);
  });

  it("masks the slot index to a byte, like the steps op", () => {
    expect(encodeMacroName(0x1ff, "").at(1)).toBe(0xff);
  });

  it("round-trips: encode a name, place it in a READ blob, decode it back", () => {
    const op = encodeMacroName(4, "コピー");
    const blob = buildReadBlob(DM_SLOTS, {}, {});
    const o = 4 + 20 * 81 + 4 * 17;
    blob.set(op.subarray(3), o); // name_len + name[16], exactly the read entry
    expect(decodeDmac(blob).slots[4].name).toBe("コピー");
  });
});

/**
 * The 16-byte field is BYTES, and the plan puts the character-boundary problem
 * on the app (フェーズ8 検証). These are the boundary cases the firmware will
 * never have to think about because of it.
 */
describe("macroNameBytes / fitMacroName", () => {
  it("keeps 16 ASCII characters whole — exactly the field", () => {
    const s = "0123456789abcdef";
    expect(s).toHaveLength(16);
    expect(macroNameBytes(s)).toHaveLength(16);
    expect(fitMacroName(s)).toBe(s);
  });

  it("drops the 17th ASCII character", () => {
    expect(fitMacroName("0123456789abcdefg")).toBe("0123456789abcdef");
  });

  it("fits five Japanese characters (15 B) and refuses the sixth", () => {
    expect(macroNameBytes("あいうえお")).toHaveLength(15);
    expect(fitMacroName("あいうえお")).toBe("あいうえお");
    // A sixth would need 18 B: cut on the character, never mid-sequence.
    expect(fitMacroName("あいうえおか")).toBe("あいうえお");
    expect(macroNameBytes("あいうえおか")).toHaveLength(15);
  });

  it("keeps a 4-byte emoji whole when it fits and drops it whole when it does not", () => {
    // 12 ASCII + 4 B emoji = 16 exactly.
    expect(fitMacroName("012345678901\u{1F600}")).toBe("012345678901\u{1F600}");
    expect(macroNameBytes("012345678901\u{1F600}")).toHaveLength(16);
    // 14 ASCII leaves 2 bytes: half an emoji is never written, so it goes.
    expect(fitMacroName("01234567890123\u{1F600}")).toBe("01234567890123");
    expect(macroNameBytes("01234567890123\u{1F600}")).toHaveLength(14);
  });

  it("never emits a lone surrogate or a partial sequence", () => {
    for (const s of ["あいうえおか", "01234567890123\u{1F600}", "🙂🙂🙂🙂🙂"]) {
      const bytes = macroNameBytes(s);
      expect(bytes.length).toBeLessThanOrEqual(DM_NAME_MAX);
      // Decoding must not produce U+FFFD: that is what a cut sequence looks like.
      expect(new TextDecoder("utf-8").decode(bytes)).not.toContain("�");
    }
  });

  it("leaves a name that already fits completely alone", () => {
    expect(fitMacroName("")).toBe("");
    expect(fitMacroName("git")).toBe("git");
  });
});

describe("encodeSlot", () => {
  it("encodes the WRITE layout per DESIGN-macros.md §4.4 (version, slot, used_len, steps)", () => {
    const steps: DmStep[] = [
      { action: DmAction.Tap, keycode: 0x00040007 },
      { action: DmAction.Press, keycode: makeKeycode(0x50, MOD_LGUI) },
    ];
    const buf = encodeSlot(5, steps);
    expect(buf.byteLength).toBe(3 + 2 * STEP_BYTES);
    const dv = new DataView(buf.buffer);
    // v1, and v1 forever — see the next test.
    expect(dv.getUint8(0)).toBe(DM_VERSION_V1);
    expect(dv.getUint8(1)).toBe(5);
    expect(dv.getUint8(2)).toBe(2);
    expect(dv.getUint8(3)).toBe(DmAction.Tap);
    expect(dv.getUint32(4, true)).toBe(0x00040007);
    expect(dv.getUint8(8)).toBe(DmAction.Press);
    expect(dv.getUint32(9, true)).toBe(makeKeycode(0x50, MOD_LGUI));
  });

  /**
   * The single most important byte in the v2 change: a steps write still says
   * version 1, even though DM_VERSION is now 2 and this app can read v2. That
   * is what lets an app which knows nothing about names — an old build, an old
   * backup file — write steps without erasing the names it cannot see, and it
   * is why the v2 write op is name-only rather than a fatter steps op.
   */
  it("still emits version 1 now that the codec speaks v2", () => {
    expect(DM_VERSION).toBe(DM_VERSION_V2);
    expect(encodeSlot(0, []).at(0)).toBe(DM_VERSION_V1);
    expect(encodeSlot(3, [{ action: DmAction.Tap, keycode: 9 }]).at(0)).toBe(1);
  });

  it("clamps to DM_STEPS when given more steps than the wire allows", () => {
    const steps: DmStep[] = Array.from({ length: DM_STEPS + 2 }, (_, i) => ({
      action: DmAction.Tap,
      keycode: i,
    }));
    const buf = encodeSlot(0, steps);
    expect(buf.byteLength).toBe(3 + DM_STEPS * STEP_BYTES);
    expect(buf[2]).toBe(DM_STEPS); // used_len byte
  });

  it("masks the slot index to a byte", () => {
    const buf = encodeSlot(0x1ff, []);
    expect(buf[1]).toBe(0xff);
  });

  it("round-trips through a READ blob: decode -> encode reproduces the same step bytes", () => {
    const original: DmStep[] = [
      { action: DmAction.Tap, keycode: 0x00040007 },
      { action: DmAction.Press, keycode: makeKeycode(0x50, MOD_LGUI) },
    ];
    const blob = buildReadBlob(6, { 5: original });
    const cfg = decodeDmac(blob);
    expect(cfg.slots[5].steps).toEqual(original);

    const rewritten = encodeSlot(5, cfg.slots[5].steps);
    const expected = new Uint8Array(3 + 2 * STEP_BYTES);
    const edv = new DataView(expected.buffer);
    edv.setUint8(0, DM_VERSION_V1);
    edv.setUint8(1, 5);
    edv.setUint8(2, 2);
    edv.setUint8(3, DmAction.Tap);
    edv.setUint32(4, 0x00040007, true);
    edv.setUint8(8, DmAction.Press);
    edv.setUint32(9, makeKeycode(0x50, MOD_LGUI) >>> 0, true);
    expect(rewritten).toEqual(expected);
  });
});

describe("splitKeycode / makeKeycode", () => {
  it("splits a keycode into base usage (low 24 bits) and mod bits (top 8)", () => {
    expect(splitKeycode(0x02070004)).toEqual({ base: 0x070004, mods: 0x02 });
  });

  it("combines base + mods back into the packed keycode", () => {
    expect(makeKeycode(0x070004, MOD_LSFT)).toBe(0x02070004);
  });

  it("masks away bits outside their field on the way in", () => {
    // base has stray bits above bit23, mods has stray bits above bit7.
    const kc = makeKeycode(0xff070004, 0xff05);
    expect(kc).toBe(((0x070004) | (0x05 << 24)) >>> 0);
  });

  it("round-trips base/mods through make -> split", () => {
    const base = 0x000050;
    const mods = MOD_LCTL | MOD_LSFT;
    expect(splitKeycode(makeKeycode(base, mods))).toEqual({ base, mods });
  });
});
