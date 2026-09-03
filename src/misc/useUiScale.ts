/**
 * Text size for touch builds, chosen by the person holding the device.
 *
 * One size cannot fit Android: a phone, a Fold opened out and a tablet differ
 * by more than a media query can reasonably guess, and the same CSS pixel is a
 * different physical size on each. So the type scale in index.css is written as
 * `calc(<size> * var(--ui-scale))` and this sets the multiplier.
 *
 * It applies ONLY inside `@media (pointer: coarse)` — the desktop build never
 * reads the variable, so nothing here can change how Torabo Studio looks on a
 * PC. It scales text alone; the `pointer-coarse:` padding and min-height
 * utilities that hold tap targets at 44px are deliberately left out of it.
 */
import { useCallback, useEffect } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export type UiScale = "s" | "m" | "l";

export const UI_SCALES: { id: UiScale; label: string; factor: number }[] = [
  { id: "s", label: "S", factor: 0.875 },
  { id: "m", label: "M", factor: 1 },
  { id: "l", label: "L", factor: 1.15 },
];

const isUiScale = (v: unknown): v is UiScale =>
  v === "s" || v === "m" || v === "l";

export function useUiScale() {
  const [scale, setScale] = useLocalStorageState<UiScale>("uiScale", "m");

  // Guard against a hand-edited or stale storage value: an unknown id would
  // otherwise resolve to `undefined` and write `--ui-scale: undefined`, which
  // CSS drops, silently falling back to the default in every calc().
  const current = isUiScale(scale) ? scale : "m";

  useEffect(() => {
    const factor =
      UI_SCALES.find((s) => s.id === current)?.factor ?? 1;
    document.documentElement.style.setProperty("--ui-scale", String(factor));
  }, [current]);

  const cycle = useCallback(() => {
    const i = UI_SCALES.findIndex((s) => s.id === current);
    setScale(UI_SCALES[(i + 1) % UI_SCALES.length].id);
  }, [current, setScale]);

  return { scale: current, setScale, cycle };
}
