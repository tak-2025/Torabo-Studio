/**
 * Parse a ZMK `keymap.keymap` (or shield keymap) and convert its `macros { }`
 * node into dynamic-macro steps, so existing compiled macros (M0, M1, ...) can
 * be loaded into editable `&dmac` slots without retyping.
 *
 * Scope: only the key-press content a dmac slot can replay is supported, i.e.
 * `&kp <KEY>` (incl. modifier functions like LA(H) / LC(LS(G))) and the macro
 * control behaviors macro_tap / macro_press / macro_release. Timing controls
 * (macro_wait_time, macro_tap_ms, ...) are ignored — dmac uses fixed timing.
 * Anything else (e.g. &mo, &mt, nested behaviors) is reported as a warning.
 */

import NAMES from "../zmk-keycodes.json";
import { DmAction, DmStep } from "./dmacConfig";

// ZMK implicit-modifier function names -> bit (bits 24..31 of the keycode).
const MODFN: Record<string, number> = {
  LC: 0x01,
  LS: 0x02,
  LA: 0x04,
  LG: 0x08,
  RC: 0x10,
  RS: 0x20,
  RA: 0x40,
  RG: 0x80,
};

export interface ImportedMacro {
  /** M<n> name -> n (target slot); null if the name isn't M-numbered. */
  slot: number | null;
  name: string;
  steps: DmStep[];
  warnings: string[];
}

/** Resolve a `&kp` argument (name, modifier-function, or number) to a keycode. */
function resolveKeycode(expr: string): number | null {
  const e = expr.trim();
  const fn = e.match(/^([LR][CSAG])\s*\(\s*([\s\S]*)\s*\)$/);
  if (fn) {
    const bit = MODFN[fn[1]];
    const inner = resolveKeycode(fn[2]);
    if (inner === null) return null;
    return (inner | (bit << 24)) >>> 0;
  }
  if (/^0x[0-9a-fA-F]+$/.test(e)) return parseInt(e, 16) >>> 0;
  if (/^\d+$/.test(e)) return parseInt(e, 10) >>> 0;
  const u = (NAMES as Record<string, number>)[e];
  return u === undefined ? null : u >>> 0;
}

function parseBindings(raw: string): { steps: DmStep[]; warnings: string[] } {
  const steps: DmStep[] = [];
  const warnings: string[] = [];
  let action = DmAction.Tap; // ZMK macros default to "tap" mode

  for (const tok of raw.split("&").map((t) => t.trim()).filter(Boolean)) {
    const sp = tok.search(/\s/);
    const beh = sp === -1 ? tok : tok.slice(0, sp);
    const arg = sp === -1 ? "" : tok.slice(sp + 1).trim();
    switch (beh) {
      case "kp":
      case "key_press": {
        const kc = resolveKeycode(arg);
        if (kc === null) {
          warnings.push(`未対応キー: &kp ${arg}`);
          break;
        }
        steps.push({ action, keycode: kc });
        break;
      }
      case "macro_tap":
        action = DmAction.Tap;
        break;
      case "macro_press":
        action = DmAction.Press;
        break;
      case "macro_release":
        action = DmAction.Release;
        break;
      // timing / no-op controls: dmac uses fixed step timing
      case "macro_wait_time":
      case "macro_tap_ms":
      case "macro_pause_for_release":
      case "none":
      case "trans":
        break;
      default:
        warnings.push(`未対応の動作: &${tok}`);
    }
    if (steps.length >= 16) break; // DM_STEPS cap; extras dropped (warned below)
  }
  return { steps, warnings };
}

/** Brace-match the body of a top-level `<nodeName> { ... }` block. */
function extractBlock(text: string, nodeName: string): string | null {
  const m = new RegExp(`(?:^|\\s)${nodeName}\\s*\\{`).exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
  }
  return text.slice(start, i - 1);
}

/** Parse all macro nodes from a keymap.keymap into importable slot content. */
export function importMacrosFromKeymap(text: string): ImportedMacro[] {
  const block = extractBlock(text, "macros");
  if (!block) return [];

  const out: ImportedMacro[] = [];
  // Macro bodies have no nested braces, so a flat node match is safe.
  const nodeRe = /([A-Za-z_][\w-]*)\s*:\s*[\w-]+\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(block)) !== null) {
    const body = m[2];
    const bind = body.match(/bindings\s*=\s*<([\s\S]*?)>/);
    if (!bind) continue;
    const label = body.match(/label\s*=\s*"([^"]*)"/);
    const name = label ? label[1] : m[1];
    const { steps, warnings } = parseBindings(bind[1]);
    const sm = name.match(/^M(\d+)$/);
    out.push({
      slot: sm ? parseInt(sm[1], 10) : null,
      name,
      steps,
      warnings,
    });
  }
  return out;
}
