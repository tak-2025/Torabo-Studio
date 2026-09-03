/**
 * The app-wide "which physical keyboard layout is the OS set to" preference.
 *
 * This does NOT change anything the firmware sends — a keycode is a keycode. It
 * only decides which glyph a key is drawn with, because the same usage produces
 * a different character depending on the host's keyboard layout: `&kp LS(N2)`
 * types `@` on US and `"` on JIS.
 *
 * Before this, the only layout choice lived inside VisualKeyPicker
 * (`visualKeyLayout`), which is why the board and the picker could disagree.
 * That value is migrated into this one on first run so nobody's setting is lost.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import type { KeyLayout } from "./legends";

export type { KeyLayout } from "./legends";

export const KEY_LAYOUTS: { id: KeyLayout; label: string }[] = [
  { id: "us", label: "US" },
  { id: "jis", label: "JIS" },
];

const STORAGE_KEY = "keyLayout";
const LEGACY_STORAGE_KEY = "visualKeyLayout";

const isKeyLayout = (v: string | null): v is KeyLayout =>
  v === "us" || v === "jis";

/**
 * Default for a fresh install is US. When the old picker-only setting exists it
 * wins, so an upgrade keeps showing what the user had chosen.
 */
function initialKeyLayout(): KeyLayout {
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (isKeyLayout(legacy)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the default
    // is fine and the app must not fail to start over a preference.
  }
  return "us";
}

interface KeyLayoutContextValue {
  keyLayout: KeyLayout;
  setKeyLayout: (layout: KeyLayout) => void;
}

const KeyLayoutContext = createContext<KeyLayoutContextValue>({
  keyLayout: "us",
  setKeyLayout: () => {},
});

export function KeyLayoutProvider({ children }: { children: ReactNode }) {
  // useLocalStorageState reads STORAGE_KEY itself, so the migrated value is only
  // consulted when this preference has never been written.
  const [keyLayout, setKeyLayout] = useLocalStorageState<KeyLayout>(
    STORAGE_KEY,
    initialKeyLayout()
  );

  const value = useMemo(
    () => ({ keyLayout, setKeyLayout }),
    [keyLayout, setKeyLayout]
  );

  return (
    <KeyLayoutContext.Provider value={value}>
      {children}
    </KeyLayoutContext.Provider>
  );
}

export function useKeyLayout(): KeyLayoutContextValue {
  return useContext(KeyLayoutContext);
}
