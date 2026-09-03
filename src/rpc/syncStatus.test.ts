/**
 * Pure-logic tests for the initial-sync status line's ordering/picking rule.
 * SyncStatusContext.tsx (the React registry) is deliberately not exercised
 * here — repo convention is pure-logic tests, no jsdom/component tests.
 */
import { describe, it, expect } from "vitest";
import {
  SYNC_STEP_ORDER,
  pickCurrentSyncStep,
  syncStepLabelKey,
  type SyncStepId,
} from "./syncStatus";

describe("pickCurrentSyncStep", () => {
  it("returns null when nothing is running", () => {
    expect(pickCurrentSyncStep(new Set())).toBeNull();
  });

  it("returns the one active step", () => {
    expect(pickCurrentSyncStep(new Set<SyncStepId>(["caps"]))).toBe("caps");
  });

  it("picks by SYNC_STEP_ORDER, not by Set insertion order", () => {
    // Inserted macroNames first, keymap second — the display order must still
    // win, so the line reads as "what starts first" regardless of which
    // effect happened to report in first.
    const active = new Set<SyncStepId>(["macroNames", "keymap"]);
    expect(pickCurrentSyncStep(active)).toBe(SYNC_STEP_ORDER[0]);
    expect(pickCurrentSyncStep(active)).toBe("keymap");
  });

  it("falls through to the next step once the earlier one clears", () => {
    const active = new Set<SyncStepId>(["keymap", "caps"]);
    expect(pickCurrentSyncStep(active)).toBe("keymap");
    active.delete("keymap");
    expect(pickCurrentSyncStep(active)).toBe("caps");
  });

  it("covers every declared step with a distinct label key", () => {
    const keys = SYNC_STEP_ORDER.map(syncStepLabelKey);
    expect(new Set(keys).size).toBe(SYNC_STEP_ORDER.length);
  });
});
