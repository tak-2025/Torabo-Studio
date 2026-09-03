/**
 * Ordering and label lookup for the initial-sync status line.
 *
 * SyncStatusContext.tsx owns the React side (the registry of which steps are
 * currently running, and the hooks that report into / read from it); this
 * file is the pure part — just "given the set of steps in flight, which ONE
 * wins the shared status line" — pulled out so it can be unit-tested without
 * mounting a React tree (repo convention: pure-logic tests, no
 * jsdom/component tests — see syncStatus.test.ts).
 *
 * The steps themselves are the connect-time reads Stage ④'s goal B asks to
 * surface: the keymap/behaviors load (Keyboard.tsx), the capability
 * descriptor (MainPanels' useToraboCaps), and the macro-names auto-read
 * (dynamic_macros/useAutoMacroNames.ts). Each reports its OWN loading flag in
 * via useSyncStep — this module never fetches anything.
 */

export type SyncStepId = "keymap" | "caps" | "macroNames";

/**
 * Display order when more than one step happens to be running at once. Close
 * to the order the reads actually start in after a fresh connection —
 * Keyboard.tsx's getKeymap/listAllBehaviors fire immediately on connect;
 * useToraboCaps waits for RPC idle first (see its own header comment); the
 * macro-names read waits for BOTH caps and idle (useAutoMacroNames.ts), so it
 * is last in practice — but this is a display preference, not a scheduler:
 * every step reports independently of the others, and all this decides is
 * which single label the line shows while more than one happens to overlap.
 */
export const SYNC_STEP_ORDER: readonly SyncStepId[] = [
  "keymap",
  "caps",
  "macroNames",
];

const LABEL_KEYS: Record<SyncStepId, string> = {
  keymap: "sync.step.keymap",
  caps: "sync.step.caps",
  macroNames: "sync.step.macroNames",
};

/** i18n key for a step's label — resolved by the caller's `t`, same
 * "return a key, not text" convention as caps/fwInfo.ts's Msg. */
export function syncStepLabelKey(id: SyncStepId): string {
  return LABEL_KEYS[id];
}

/**
 * Which step's label the status line should show, given the steps currently
 * in flight. `null` means nothing is running — the line hides.
 */
export function pickCurrentSyncStep(
  active: ReadonlySet<SyncStepId>
): SyncStepId | null {
  return SYNC_STEP_ORDER.find((id) => active.has(id)) ?? null;
}
