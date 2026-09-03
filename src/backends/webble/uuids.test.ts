/**
 * Tests for the length-gate helpers config.ts uses on every GATT read (see
 * `ConfigService.exactLength`'s doc comment: a data-loss guard, not a sanity
 * check — a decoder that walks a short buffer to its end reads a truncated
 * blob as "the rest is empty slots").
 *
 * Covers the case this file exists for: macros now accepts either wire
 * version (v1 = 1624 B, v2 = 1624 + a name block = 1964 B — see
 * dmacConfig.ts's header comment), while combos and timing still gate on a
 * single fixed length.
 *
 * The "stays in sync with its codec" describe block below is the guard the
 * DM_WIRE_LEN_V1-hardcoded-to-1624 real-hardware bug was missing: uuids.ts no
 * longer spells out any fixed-length arithmetic itself, it only imports each
 * codec's exported `*_WIRE_LEN(S)` — so this test pins that every
 * `CONFIG_SERVICES[key].exactLength` is *the same array reference's contents*
 * as its codec exports, and that the codec's own decoder actually accepts a
 * buffer of each listed length.
 */
import { describe, it, expect } from "vitest";
import {
  DM_MAGIC,
  DM_VERSION_V1,
  DM_VERSION_V2,
  DM_SLOTS,
  DM_WIRE_LEN_V1,
  DM_WIRE_LEN_V2,
  DM_WIRE_LENS,
  decodeDmac,
} from "../../dynamic_macros/dmacConfig";
import {
  CB_MAGIC,
  CB_VERSION,
  CB_SLOTS,
  CB_WIRE_LENS,
  decodeCombos,
} from "../../dynamic_combos/comboConfig";
import {
  TMG_WIRE_LEN,
  TMG_WIRE_LENS,
  encodeTiming,
  decodeTiming,
  standardTimingConfig,
} from "../../timing/timingConfig";
import {
  CONFIG_SERVICES,
  formatAcceptedLengths,
  isAcceptedLength,
  type ConfigKey,
} from "./uuids";

describe("isAcceptedLength", () => {
  it("null accepts any length (runtime-sized configs)", () => {
    expect(isAcceptedLength(null, 0)).toBe(true);
    expect(isAcceptedLength(null, 999999)).toBe(true);
  });

  it("a single number accepts only that exact length", () => {
    expect(isAcceptedLength(96, 96)).toBe(true);
    expect(isAcceptedLength(96, 95)).toBe(false);
    expect(isAcceptedLength(96, 97)).toBe(false);
  });

  it("an array accepts any length listed and rejects everything else", () => {
    expect(isAcceptedLength([DM_WIRE_LEN_V1, DM_WIRE_LEN_V2], 1624)).toBe(true);
    expect(isAcceptedLength([DM_WIRE_LEN_V1, DM_WIRE_LEN_V2], 1964)).toBe(true);
    expect(isAcceptedLength([DM_WIRE_LEN_V1, DM_WIRE_LEN_V2], 1900)).toBe(false);
  });

  it("the macros config-service entry accepts v1 (1624) and v2 (1964)", () => {
    const need = CONFIG_SERVICES.macros.exactLength;
    expect(isAcceptedLength(need, 1624)).toBe(true);
    expect(isAcceptedLength(need, 1964)).toBe(true);
    expect(isAcceptedLength(need, 1900)).toBe(false);
  });

  it("combos and timing gate on their codec's exported length list", () => {
    expect(CONFIG_SERVICES.combos.exactLength).toEqual(CB_WIRE_LENS);
    expect(isAcceptedLength(CONFIG_SERVICES.combos.exactLength, CB_WIRE_LENS[0])).toBe(
      true,
    );
    expect(isAcceptedLength(CONFIG_SERVICES.combos.exactLength, 1)).toBe(false);

    expect(CONFIG_SERVICES.timing.exactLength).toEqual(TMG_WIRE_LENS);
    expect(isAcceptedLength(CONFIG_SERVICES.timing.exactLength, TMG_WIRE_LEN)).toBe(
      true,
    );
    expect(
      isAcceptedLength(CONFIG_SERVICES.timing.exactLength, TMG_WIRE_LEN + 1),
    ).toBe(false);
  });
});

describe("formatAcceptedLengths", () => {
  it("renders an array as a slash-separated list", () => {
    expect(formatAcceptedLengths([1624, 1964])).toBe("1624 / 1964");
  });

  it("renders a single number as itself", () => {
    expect(formatAcceptedLengths(96)).toBe("96");
  });

  it("renders null as empty (unreachable in practice: null always passes the gate)", () => {
    expect(formatAcceptedLengths(null)).toBe("");
  });
});

describe("fixed-length config services stay in sync with their codec", () => {
  const FIXED: { key: ConfigKey; codecLens: readonly number[] }[] = [
    { key: "macros", codecLens: DM_WIRE_LENS },
    { key: "combos", codecLens: CB_WIRE_LENS },
    { key: "timing", codecLens: TMG_WIRE_LENS },
  ];

  it("every fixed-length service's exactLength equals its codec's exported length list", () => {
    // This is the assertion the real-hardware bug slipped past: uuids.ts had
    // its own hand-copied 1624 instead of importing dmacConfig's constant, so
    // it silently went stale the moment the codec grew a v2. Comparing against
    // the codec's own export (not a literal re-typed here) is what would have
    // caught that.
    for (const { key, codecLens } of FIXED) {
      expect(CONFIG_SERVICES[key].exactLength).toEqual(codecLens);
    }
  });

  it("the runtime-sized services are untouched by this guard (still null)", () => {
    for (const key of ["caps", "trackball", "trackpad", "encoder", "led"] as const) {
      expect(CONFIG_SERVICES[key].exactLength).toBeNull();
    }
  });

  it("decodeDmac actually accepts a buffer of each listed macros length", () => {
    // Golden buffers built straight from the wire contract (magic, version,
    // slot_count = DM_SLOTS, every slot's used_len = 0) rather than through
    // decodeDmac itself — sized to exactly DM_WIRE_LEN_V1 / DM_WIRE_LEN_V2, so
    // a successful decode proves the codec really accepts a read of that
    // length for that version, not just that the constant has that value.
    for (const [version, len] of [
      [DM_VERSION_V1, DM_WIRE_LEN_V1],
      [DM_VERSION_V2, DM_WIRE_LEN_V2],
    ] as const) {
      const buf = new Uint8Array(len);
      const dv = new DataView(buf.buffer);
      dv.setUint16(0, DM_MAGIC, true);
      dv.setUint8(2, version);
      dv.setUint8(3, DM_SLOTS);
      expect(() => decodeDmac(buf)).not.toThrow();
      expect(decodeDmac(buf).version).toBe(version);
    }
  });

  it("decodeCombos actually accepts a buffer of the listed combos length", () => {
    const len = CB_WIRE_LENS[0];
    const buf = new Uint8Array(len);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, CB_MAGIC, true);
    dv.setUint8(2, CB_VERSION);
    dv.setUint8(3, CB_SLOTS);
    expect(() => decodeCombos(buf)).not.toThrow();
  });

  it("decodeTiming actually accepts a buffer of the listed timing length", () => {
    // Timing (unlike macros/combos) exports a real full-image encoder, so
    // round-trip through it instead of hand-assembling bytes.
    const buf = encodeTiming(standardTimingConfig());
    expect(buf.length).toBe(TMG_WIRE_LENS[0]);
    expect(() => decodeTiming(buf)).not.toThrow();
  });
});
