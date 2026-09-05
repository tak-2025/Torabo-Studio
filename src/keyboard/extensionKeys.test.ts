/**
 * Tests for the extension-key decision (extensionKeys.ts).
 *
 * The rule the board draws by: the largest torabo-tsuki standard grid that
 * fits the key total (44 / 52 / 66) marks where the keycaps end, and every
 * position at or past it is an appended dial push / 4-direction switch, drawn
 * round. The boundaries are what matter — a total landing exactly on a grid
 * size is a build with no extension block, and a total below the smallest grid
 * is not a layout we know anything about; both draw everything square.
 *
 * Pure functions, no DOM — the repo's vitest runs in the node environment.
 */
import { describe, it, expect } from "vitest";

import { keyShapeAt, standardKeyCount } from "./extensionKeys";

describe("standardKeyCount", () => {
  it("answers null below the smallest grid", () => {
    expect(standardKeyCount(0)).toBeNull();
    expect(standardKeyCount(43)).toBeNull();
  });

  it("takes the largest grid that fits", () => {
    expect(standardKeyCount(44)).toBe(44); // S, no extension block
    expect(standardKeyCount(45)).toBe(44); // S + dial push
    expect(standardKeyCount(49)).toBe(44); // S + 4-direction switch
    expect(standardKeyCount(51)).toBe(44);
    expect(standardKeyCount(52)).toBe(52); // M, no extension block
    expect(standardKeyCount(53)).toBe(52); // M + dial push
    expect(standardKeyCount(65)).toBe(52);
    expect(standardKeyCount(66)).toBe(66); // L, no extension block
    expect(standardKeyCount(67)).toBe(66); // L + dial push
    expect(standardKeyCount(71)).toBe(66); // L + 4-direction switch
  });

  it("keeps the largest grid for a total past every one of them", () => {
    expect(standardKeyCount(200)).toBe(66);
  });
});

describe("keyShapeAt", () => {
  /** The shape of every position of a layout with `total` keys. */
  const shapes = (total: number) => {
    const standard = standardKeyCount(total);
    return Array.from({ length: total }, (_, i) => keyShapeAt(i, standard));
  };

  const rounded = (total: number) =>
    shapes(total).flatMap((s, i) => (s === "rounded" ? [i] : []));

  it("draws nothing round when the total is exactly a grid size", () => {
    expect(rounded(44)).toEqual([]);
    expect(rounded(52)).toEqual([]);
    expect(rounded(66)).toEqual([]);
  });

  it("draws nothing round below the smallest grid", () => {
    expect(rounded(43)).toEqual([]);
    expect(rounded(10)).toEqual([]);
  });

  it("rounds the dial push only", () => {
    expect(rounded(45)).toEqual([44]); // S
    expect(rounded(53)).toEqual([52]); // M
    expect(rounded(67)).toEqual([66]); // L
  });

  it("rounds the whole 4-direction block", () => {
    expect(rounded(49)).toEqual([44, 45, 46, 47, 48]); // S
    expect(rounded(57)).toEqual([52, 53, 54, 55, 56]); // M
    expect(rounded(71)).toEqual([66, 67, 68, 69, 70]); // L
  });

  it("rounds both blocks when a build carries dial and switch", () => {
    expect(rounded(72)).toEqual([66, 67, 68, 69, 70, 71]); // L + 5 + 1
  });

  it("draws everything square when the layout is unknown", () => {
    expect(keyShapeAt(0, null)).toBe("rect");
    expect(keyShapeAt(70, null)).toBe("rect");
  });
});
