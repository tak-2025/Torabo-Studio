/**
 * Per-area message dictionaries.
 *
 * messages.ts holds the strings shared across the whole app (header, tabs,
 * common buttons). Each settings panel owns its own file here instead, so a
 * panel's copy sits next to nothing else and two panels are never edited in
 * the same place. Keys are namespaced per file — `tp.` for the trackpad, `bk.`
 * for backup, and so on — so a merge can never silently shadow another panel.
 */
import * as backup from "./backup";
import * as combos from "./combos";
import * as encoder from "./encoder";
import * as fwinfo from "./fwinfo";
import * as led from "./led";
import * as macros from "./macros";
import * as system from "./system";
import * as timing from "./timing";
import * as trackball from "./trackball";
import * as trackpad from "./trackpad";

const areas = [
  backup,
  combos,
  encoder,
  fwinfo,
  led,
  macros,
  system,
  timing,
  trackball,
  trackpad,
];

export const panelJa: Record<string, string> = Object.assign(
  {},
  ...areas.map((a) => a.ja)
);

export const panelEn: Record<string, string> = Object.assign(
  {},
  ...areas.map((a) => a.en)
);
