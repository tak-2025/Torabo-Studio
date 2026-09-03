/**
 * Pure-logic test for the connect-time macro-names read's gate: no read
 * without a connection, no read on firmware whose macros wire predates names
 * (v1), no read with no descriptor at all. The hook itself (useAutoMacroNames)
 * is not exercised here — repo convention is pure-logic tests, no
 * jsdom/component tests.
 */
import { describe, it, expect } from "vitest";
import { shouldAutoReadMacroNames } from "./useAutoMacroNames";
import { Feature, MACRO_NAMES_WIRE_VER, type ToraboCaps } from "../caps/toraboCaps";

function capsWithMacrosWire(wireVer: number): ToraboCaps {
  return {
    descVersion: 1,
    fw: { major: 0, minor: 0, patch: 0 },
    features: [{ id: Feature.Macros, wireVer, caps: 0 }],
  };
}

describe("shouldAutoReadMacroNames", () => {
  it("does not read without a connection, even on v2 firmware", () => {
    expect(shouldAutoReadMacroNames(false, capsWithMacrosWire(MACRO_NAMES_WIRE_VER))).toBe(
      false
    );
  });

  it("does not read when the descriptor hasn't arrived yet (caps null)", () => {
    expect(shouldAutoReadMacroNames(true, null)).toBe(false);
  });

  it("does not read on v1 firmware (macros wire predates names)", () => {
    expect(shouldAutoReadMacroNames(true, capsWithMacrosWire(1))).toBe(false);
  });

  it("does not read when the descriptor has no Macros feature at all", () => {
    const caps: ToraboCaps = {
      descVersion: 1,
      fw: { major: 0, minor: 0, patch: 0 },
      features: [],
    };
    expect(shouldAutoReadMacroNames(true, caps)).toBe(false);
  });

  it("reads once connected on v2+ firmware", () => {
    expect(shouldAutoReadMacroNames(true, capsWithMacrosWire(MACRO_NAMES_WIRE_VER))).toBe(
      true
    );
    expect(shouldAutoReadMacroNames(true, capsWithMacrosWire(MACRO_NAMES_WIRE_VER + 1))).toBe(
      true
    );
  });
});
