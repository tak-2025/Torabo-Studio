/**
 * Protected per-target seam (see platform/transports.tsx's header comment for
 * the general pattern) for the one layout constant that genuinely differs by
 * target: the breakpoint at which MainPanels.tsx's tab bar switches from
 * icon-only to icon+label.
 *
 * Tailwind needs the full class string as a source literal to generate the
 * rule for it, so this cannot be built from a bare breakpoint name — each
 * target's file spells out the whole className. Studio uses `sm:` (a normal
 * desktop/browser window); the Android (Capacitor) shell's protected override
 * uses `lg:` instead, because on a Fold's expanded width the tab bar's actual
 * rendered width still falls under `sm`'s threshold and the labels never show.
 */

// The small group-name label above a tab's icon (only shown on the first tab
// of a group).
export const TAB_GROUP_LABEL_CLASS =
  "hidden sm:block text-[10px] leading-none font-semibold uppercase tracking-wider text-base-content/40";

// The tab's own text label, next to its icon.
export const TAB_LABEL_CLASS = "hidden sm:inline";
