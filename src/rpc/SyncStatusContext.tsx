/**
 * Registry for the initial-sync status line: which of the connect-time reads
 * are in flight right now, so the header can show ONE short "what is
 * happening" label instead of a silent wait while the keymap board and the
 * tabs' capability gating settle.
 *
 * WHY A CONTEXT. Same shape of problem MacroNamesContext.tsx solves, and for
 * the same reason: several independent hooks each already track their own
 * loading flag (Keyboard.tsx's keymap/behaviors read, MainPanels' own
 * useToraboCaps, the macro-names auto-read in
 * dynamic_macros/useAutoMacroNames.ts), and none of them has any other reason
 * to know about the others, or about AppHeader, which is where the result is
 * shown. A context is the lightest mechanism already in the app for "several
 * writers, one reader, no shared parent worth prop-drilling through".
 *
 * WHY NOT usePubSub (Emittery), the app's other option for cross-component
 * signals. The badge needs to know, on every render, whether ANY step is
 * still active — that is state read during render, not an event a listener
 * reacts to once. MacroNamesContext.tsx's header gives the identical
 * reasoning for the identical choice.
 *
 * This module owns no RPC call of its own. Each site that already has a
 * loading boolean just mirrors it in with `useSyncStep`; the ordering/picking
 * logic that turns "several steps active" into "one label to show" lives in
 * syncStatus.ts, split out so it can be unit-tested without a React tree.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ConnectionContext } from "./ConnectionContext";
import { pickCurrentSyncStep, type SyncStepId } from "./syncStatus";

interface SyncStatusState {
  active: ReadonlySet<SyncStepId>;
  setStepActive: (id: SyncStepId, isActive: boolean) => void;
}

const SyncStatusContext = createContext<SyncStatusState>({
  active: new Set(),
  setStepActive: () => {},
});

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ReadonlySet<SyncStepId>>(new Set());
  const { conn } = useContext(ConnectionContext);

  // Belt-and-suspenders alongside each step's own cleanup (useSyncStep below
  // already clears its id on unmount/deactivation): a step whose owner never
  // got the chance to clear it — a hard reconnect that remounts the whole
  // panel tree between one keyboard and the next, say — must not leave a
  // stale label on screen for the NEW keyboard. Same discipline
  // MacroNamesContext applies to `names` on a `conn` change.
  useEffect(() => {
    setActive(new Set());
  }, [conn]);

  const setStepActive = useCallback((id: SyncStepId, isActive: boolean) => {
    setActive((prev) => {
      // Keep referential stability when nothing actually changed, so a step
      // re-reporting the same value it already had (every render of its
      // owning effect with unchanged deps) does not ripple a re-render
      // through every consumer of this context.
      if (prev.has(id) === isActive) return prev;
      const next = new Set(prev);
      if (isActive) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ active, setStepActive }),
    [active, setStepActive]
  );
  return (
    <SyncStatusContext.Provider value={value}>
      {children}
    </SyncStatusContext.Provider>
  );
}

/**
 * Report a step's own loading flag into the shared status line.
 *
 * Call from wherever the boolean already lives (a `data === undefined` check,
 * a hook's own `loading` state, …) — this hook does not fetch anything and
 * owns no retry logic; it only mirrors `active` into the registry for as long
 * as the caller says the step is running, and clears itself on unmount so a
 * component that goes away mid-read cannot leave its label stuck on screen.
 */
export function useSyncStep(active: boolean, id: SyncStepId): void {
  const { setStepActive } = useContext(SyncStatusContext);
  useEffect(() => {
    setStepActive(id, active);
    // Runs on every deps change AND on unmount — setting `false` when the
    // step was already inactive is a no-op (setStepActive's own guard), so
    // this is safe to call unconditionally rather than tracking whether a
    // "true" was ever sent.
    return () => setStepActive(id, false);
  }, [active, id, setStepActive]);
}

/** Read side, for the status-line badge (AppHeader): which ONE step to show
 * right now, or null to render nothing. */
export function useCurrentSyncStep(): SyncStepId | null {
  const { active } = useContext(SyncStatusContext);
  return pickCurrentSyncStep(active);
}
