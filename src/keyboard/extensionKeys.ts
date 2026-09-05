// Which positions of a torabo-tsuki physical layout are *extension* keys.
//
// The shield's physical layouts (tako-custom
// boards/shields/torabo_tsuki_lp/torabo_tsuki_lp_layouts.dtsi) all end with an
// `#if TORABO_TSUKI_LP_KSCAN_4_DIRECTION_SWITCH / #elif
// TORABO_TSUKI_LP_INPUT_HIRES_DIAL` block that appends a few key positions
// *after* the standard grid: 5 for the 4-direction switch (up/down/left/right
// + push), 1 for the hi-res dial's push. Everything before that is a keycap.
//
// The standard grids are fixed by the hardware — S=44, M=52, L=66 keys — so
// the key TOTAL alone says where the grid ends: the largest standard count
// that fits is the layout, and anything past it is an extension key. A total
// that lands exactly on 44/52/66 is a build with no extension block, and one
// below 44 is not a layout we know anything about; both draw everything as a
// keycap.
//
// This module is only the *decision*. It deliberately holds no React and no
// styling, both so it can be unit-tested on its own and because it is the kind
// of file PLAN-translators.md would carry to Float/Key-App later (sizing.ts is
// its neighbour and precedent); the drawing stays in Studio's components.

/** How a key is drawn. Extension keys get "rounded"; every keycap "rect". */
export type KeyShape = "rect" | "rounded";

/** Keys in each torabo-tsuki standard grid (S, M, L), ascending. */
export const STANDARD_KEY_COUNTS: readonly number[] = [44, 52, 66];

/**
 * How many of a layout's keys are standard keycaps, or null when the total is
 * smaller than any known grid — which callers must read as "draw everything
 * square". A total equal to a grid size answers that size, which leaves no
 * index past it, i.e. no round keys.
 */
export function standardKeyCount(totalKeys: number): number | null {
  let standard: number | null = null;
  for (const count of STANDARD_KEY_COUNTS) {
    if (totalKeys >= count) standard = count;
  }
  return standard;
}

/** Shape for one key index, given `standardKeyCount`'s answer for its layout. */
export function keyShapeAt(
  index: number,
  standardCount: number | null,
): KeyShape {
  return standardCount !== null && index >= standardCount ? "rounded" : "rect";
}
