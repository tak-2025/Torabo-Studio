/**
 * The macro slot names the app has read from THIS keyboard, so the keymap board
 * can label a `&dmac N` key with its name instead of "M<N>".
 *
 * Why a context at all. The names come off the macros wire (dm v2 — see
 * dmacConfig.ts and PLAN-ext-fw-refactor.md フェーズ8), which only the macros
 * panel reads; the keycap that needs them is drawn by Keymap.tsx, on the other
 * side of the tab strip. MainPanels prop-drills `caps` to every settings panel,
 * but `<Keyboard />` deliberately takes no props at all, and threading one
 * through Keyboard -> Keymap just to reach the face resolver would put macro
 * state in two components that have no other reason to know about it.
 *
 * So: the lightest mechanism already in the app, and the one used for exactly
 * this shape of problem (KeyLayoutContext carries the US/JIS choice from the
 * header into the same Keymap). Emittery (usePubSub) is the app's other option
 * and is the wrong one here — this is a value that is read during render, not
 * an event.
 *
 * What lives here is deliberately only the NAMES, not the decoded macro config:
 * the board draws a label and nothing else, and keeping steps out means a
 * re-read in the macros panel cannot re-render the board over a step edit.
 *
 * Populated two ways, both writing through the same `setNames` below, so a
 * later write simply overwrites an earlier one with no "which source wins"
 * logic needed:
 *   - automatically, once a connection is up and the capability descriptor
 *     says this firmware's macros wire carries names (dynamic_macros/
 *     useAutoMacroNames.ts, called from MainPanels.tsx where `caps` already
 *     lives);
 *   - manually, whenever the user opens the マクロ tab and presses 読み込む
 *     (MacrosPanel.onRead).
 * `M<N>` is the standing fallback before either has run, and permanently on
 * v1 firmware, which has no names to read at all.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";

/**
 * Indexed by slot. `null` means "unknown" — no v2 read has happened, or the
 * firmware has no names at all — which is not the same as an array of empty
 * strings, which means "read, and these slots are unnamed".
 */
export type MacroNames = readonly (string | undefined)[] | null;

interface MacroNamesState {
  names: MacroNames;
  /** useState's own setter, updater form included: saving one slot's name has
   * to patch the row it already published rather than rebuild it. */
  setNames: Dispatch<SetStateAction<MacroNames>>;
}

const MacroNamesContext = createContext<MacroNamesState>({
  names: null,
  setNames: () => {},
});

/** Read side, for the keymap board. */
export function useMacroNames(): MacroNames {
  return useContext(MacroNamesContext).names;
}

/** Write side, for the macros panel. */
export function useSetMacroNames(): Dispatch<SetStateAction<MacroNames>> {
  return useContext(MacroNamesContext).setNames;
}

export function MacroNamesProvider({ children }: { children: ReactNode }) {
  const [names, setNames] = useState<MacroNames>(null);
  const { conn } = useContext(ConnectionContext);

  // Names belong to the keyboard they were read from. On disconnect — or on a
  // connection to a different unit — drop them rather than label this board's
  // keys with another one's macro names, which would look authoritative and be
  // wrong. Back to "M<N>" until the panel reads again.
  useEffect(() => {
    setNames(null);
  }, [conn]);

  const value = useMemo(() => ({ names, setNames }), [names]);
  return (
    <MacroNamesContext.Provider value={value}>
      {children}
    </MacroNamesContext.Provider>
  );
}
