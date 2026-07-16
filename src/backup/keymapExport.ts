/**
 * Generate a ZMK `.keymap` `keymap { ... }` node from the device's live keymap.
 *
 * Studio only exposes numeric data ({behaviorId, param1, param2}) plus each
 * behavior's human `displayName` + parameter `metadata`. We therefore emit
 * NUMERIC params (always compilable & exact round-trip) with a human-readable
 * comment, e.g. `&kp 458756 /* A *\/`. Anything we cannot resolve is emitted as
 * `&trans /* FIXME ... *\/` so it is never silently wrong.
 *
 * Scope: ACTIVE layers only. Macros, combos, behaviors and any reserved
 * (status="reserved") layers are NOT included — keep those from your existing
 * keymap.keymap and merge this node in.
 */

import {
  hid_usage_get_label,
  hid_usage_page_and_id_from_usage,
} from "../hid-usages";
import KEYNAMES from "../zmk-keynames.json";

export interface ExportBinding {
  behaviorId: number;
  param1: number;
  param2: number;
}
export interface ExportLayer {
  name?: string;
  bindings: ExportBinding[];
}
export interface BehaviorInfo {
  displayName: string;
  /** GetBehaviorDetailsResponse.metadata (param value-set descriptions). */
  metadata?: any[];
}
export type BehaviorById = Record<number, BehaviorInfo>;

/** displayName (from the firmware) -> ZMK devicetree behavior label. */
const KNOWN_LABELS: Record<string, string> = {
  "Key Press": "kp",
  "Key Toggle": "kt",
  Transparent: "trans",
  None: "none",
  "Mod-Tap": "mt",
  "Layer-Tap": "lt",
  "Momentary Layer": "mo",
  "To Layer": "to",
  "Toggle Layer": "tog",
  "Sticky Key": "sk",
  "Sticky Layer": "sl",
  "Caps Word": "caps_word",
  "Key Repeat": "key_repeat",
  "Mouse Button Press": "mkp",
  "Mouse Move": "mmv",
  "Mouse Scroll": "msc",
  Bluetooth: "bt",
  "Output Selection": "out",
  Reset: "sys_reset",
  Bootloader: "bootloader",
};

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Resolve the `&label`. ok=false means we fell back and the caller flags it. */
function labelFor(displayName: string): { label: string; ok: boolean } {
  const known = KNOWN_LABELS[displayName];
  if (known) return { label: known, ok: true };
  // Macros and custom behaviors usually expose their node label verbatim
  // (e.g. "M0"); accept it if it is a valid devicetree identifier.
  if (IDENT_RE.test(displayName)) return { label: displayName, ok: true };
  return { label: "trans", ok: false };
}

/** Mirror of parameters.ts validateValue, for a single value description. */
function descMatches(desc: any, value: number): boolean {
  if (desc.constant !== undefined) return desc.constant === value;
  if (desc.range) return value >= desc.range.min && value <= desc.range.max;
  if (desc.hidUsage) {
    const [page, id] = hid_usage_page_and_id_from_usage(value);
    return page !== 0 && id !== 0;
  }
  if (desc.layerId) return true;
  if (desc.nil) return value === 0;
  return false;
}

/**
 * Number of params to emit for this binding, chosen from the matching metadata
 * set so variable-arity behaviors (e.g. `&bt BT_SEL n` vs `&bt BT_CLR`) are
 * handled correctly.
 */
function arityFor(metadata: any[] | undefined, param1: number): number {
  if (!metadata || metadata.length === 0) return 0;
  const set =
    metadata.find(
      (s) => !s.param1 || s.param1.length === 0 || s.param1.some((d: any) => descMatches(d, param1))
    ) ?? metadata[0];
  const has1 = !!set.param1 && set.param1.length > 0;
  const has2 = !!set.param2 && set.param2.length > 0;
  return has2 ? 2 : has1 ? 1 : 0;
}

/** Human HID label (USB name) for a usage; undefined for non-usage values. */
function usageHint(usage: number): string | undefined {
  let [page, id] = hid_usage_page_and_id_from_usage(usage & 0xffffff);
  page &= 0xff;
  if (page === 0 && id === 0) return undefined;
  return hid_usage_get_label(page, id) || undefined;
}

// Implicit modifiers live in bits 24-31 (ZMK APPLY_MODS). Apply in this order so
// LC ends up the outermost wrapper, matching ZMK's `LC(LS(x))` convention.
const MOD_WRAPS: Array<[number, string]> = [
  [0x80, "RG"], [0x40, "RA"], [0x20, "RS"], [0x10, "RC"],
  [0x08, "LG"], [0x04, "LA"], [0x02, "LS"], [0x01, "LC"],
];

/** A keycode param -> readable ZMK name (e.g. `EQUAL`, `LC(SPACE)`), or undefined. */
function renderKeycode(param: number): string | undefined {
  const mods = (param >>> 24) & 0xff;
  const base = param & 0xffffff;
  const name = (KEYNAMES as Record<string, string>)[String(base)];
  if (!name) return undefined;
  let s = name;
  for (const [bit, fn] of MOD_WRAPS) if (mods & bit) s = `${fn}(${s})`;
  return s;
}

const BT_CMD: Record<number, string> = {
  0: "BT_CLR", 1: "BT_NXT", 2: "BT_PRV", 3: "BT_SEL", 4: "BT_CLR_ALL", 5: "BT_DISC",
};
const MOUSE_BTN: Record<number, string> = { 1: "MB1", 2: "MB2", 4: "MB3", 8: "MB4", 16: "MB5" };

/** Render one param to its most readable token; readable=false means a raw number. */
function renderParam(
  label: string,
  idx: number,
  value: number
): { text: string; readable: boolean } {
  if (label === "bt" && idx === 0 && BT_CMD[value]) return { text: BT_CMD[value], readable: true };
  if (label === "mkp" && idx === 0 && MOUSE_BTN[value])
    return { text: MOUSE_BTN[value], readable: true };
  const kc = renderKeycode(value);
  if (kc) return { text: kc, readable: true };
  return { text: String(value), readable: false }; // layer index / unknown -> numeric
}

function bindingToToken(b: ExportBinding, behaviors: BehaviorById): string {
  const info = behaviors[b.behaviorId];
  if (!info) {
    return `&trans /* FIXME unknown behaviorId=${b.behaviorId} p1=${b.param1} p2=${b.param2} */`;
  }
  const { label, ok } = labelFor(info.displayName);
  const arity = arityFor(info.metadata, b.param1);
  const vals: number[] = [];
  if (arity >= 1) vals.push(b.param1);
  if (arity >= 2) vals.push(b.param2);
  const parts = vals.map((v, i) => renderParam(label, i, v));
  const paramStr = parts.length ? " " + parts.map((p) => p.text).join(" ") : "";

  let comment = "";
  if (!ok) {
    comment = ` /* FIXME behavior "${info.displayName}" id=${b.behaviorId} */`;
  } else {
    // Comment only the raw-number params that are really HID usages (skip layers).
    const hints = parts
      .filter((p) => !p.readable)
      .map((p) => usageHint(Number(p.text)))
      .filter(Boolean) as string[];
    if (hints.length) comment = ` /* ${hints.join(" ")} */`;
  }
  return `&${label}${paramStr}${comment}`;
}

export function generateKeymapDts(
  layers: ExportLayer[],
  behaviors: BehaviorById
): string {
  const out: string[] = [];
  out.push("// Generated by the torabo config app — live keymap snapshot.");
  out.push("// Keycodes use ZMK names (e.g. EQUAL, LC(SPACE)); unknown values fall back");
  out.push("// to a raw number + /* hint */. ACTIVE layers only — macros, combos and");
  out.push("// reserved layers are NOT included. Merge into keymap.keymap; review /* FIXME */.");
  out.push("");
  out.push("/ {");
  out.push("    keymap {");
  out.push('        compatible = "zmk,keymap";');
  layers.forEach((layer, i) => {
    out.push("");
    out.push(`        layer_${i} {`);
    if (layer.name && layer.name.trim()) {
      out.push(`            display-name = "${layer.name.replace(/"/g, '\\"')}";`);
    }
    out.push("            bindings = <");
    for (const b of layer.bindings) {
      out.push(`                ${bindingToToken(b, behaviors)}`);
    }
    out.push("            >;");
    out.push("        };");
  });
  out.push("    };");
  out.push("};");
  out.push("");
  return out.join("\n");
}
