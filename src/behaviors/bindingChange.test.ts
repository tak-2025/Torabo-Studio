/**
 * Tests for the picker's rollback rule (bindingChange.ts).
 *
 * The rule is one question — did the change stick? — asked of four shapes a
 * caller can answer in: nothing at all, a boolean, a promise, or a throw. It
 * lives apart from the component precisely so it can be pinned here without a
 * DOM; what BehaviorBindingPicker adds on top is only "if not, put the
 * dropdowns back".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { settleBindingChange } from "./bindingChange";

beforeEach(() => {
  // The failure paths log; the test output is not the place to see it.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("settleBindingChange", () => {
  it("treats a caller that returns nothing as success", async () => {
    // The pre-existing contract: a caller that cannot fail says nothing, and
    // must not be made to look like a failure by the change that added one.
    await expect(settleBindingChange(() => {})).resolves.toBe(true);
  });

  it("treats true as success and false as failure", async () => {
    await expect(settleBindingChange(() => true)).resolves.toBe(true);
    await expect(settleBindingChange(() => false)).resolves.toBe(false);
  });

  it("waits for a promise and reads its resolution", async () => {
    await expect(settleBindingChange(async () => true)).resolves.toBe(true);
    await expect(settleBindingChange(async () => false)).resolves.toBe(false);
    await expect(settleBindingChange(async () => {})).resolves.toBe(true);
  });

  it("counts a throw and a rejection as failure, without rejecting itself", async () => {
    await expect(
      settleBindingChange(() => {
        throw new Error("not connected");
      }),
    ).resolves.toBe(false);
    await expect(
      settleBindingChange(async () => {
        throw new Error("keyboard refused");
      }),
    ).resolves.toBe(false);
  });

  it("runs the caller exactly once", async () => {
    const apply = vi.fn(() => true);
    await settleBindingChange(apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
