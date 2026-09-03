/**
 * Codec for the extender LED rule table. MUST match the firmware
 * (torabo-tsuki_ext_FW/led/include/zmk_led_config/config.h). Little-endian.
 *
 *   header (6B): magic u16 "le" | version u8 | caps u8 | ruleMax u8 | _rsv u8
 *   per side (left, then right): ruleCount u8, then ruleMax rules
 *   rule (4B): usecase u8 | colour u8 | pattern u8 | param u8
 *
 * `caps` is firmware-authoritative and read-only: it says which halves actually
 * have an LED, so the app shows only those instead of assuming a layout.
 *
 * Rules are evaluated in order and the FIRST whose condition holds wins, so the
 * order in this array IS the priority. Put warnings above steady states.
 */

import { tr } from "../i18n";

export const LED_MAGIC = 0x656c; // "le"
export const LED_VERSION = 1;
export const LED_HDR = 6;
export const LED_RULE = 4;
export const LED_MAX_RULES = 8;
export const LED_SIDES = 2;

export const SIDE_LEFT = 0;
export const SIDE_RIGHT = 1;

/* The three channels. No PWM: brightness isn't adjustable, only which channels are
 * on and for how long. Two or more are time-multiplexed by the firmware (the shared
 * anode can't source enough current for two at once), so a mixed colour costs about
 * the same battery as a single one. */
export const Ch = { Red: 0x01, YellowGreen: 0x02, Green: 0x04 } as const;
export const CH_MASK = 0x07;

/** colour = 0 on an index-valued use case (profile/layer) means "derive it from the
 * index" — a fixed colour there would make every profile look the same. */
export const COLOUR_AUTO = 0;

export const COLOURS: { mask: number; labelKey: string }[] = [
  { mask: Ch.Red, labelKey: "led.colour.red" },
  { mask: Ch.YellowGreen, labelKey: "led.colour.yellowGreen" },
  { mask: Ch.Green, labelKey: "led.colour.green" },
  { mask: Ch.Red | Ch.Green, labelKey: "led.colour.redGreen" },
  { mask: Ch.Red | Ch.YellowGreen, labelKey: "led.colour.redYellowGreen" },
  { mask: Ch.Green | Ch.YellowGreen, labelKey: "led.colour.greenYellowGreen" },
  { mask: Ch.Red | Ch.YellowGreen | Ch.Green, labelKey: "led.colour.all" },
];

/* Duty cycle is the only lever on battery drain, so the pattern is also the power
 * knob: a slow blink draws roughly 2.5% of what a solid colour does. */
export const Pattern = {
  Solid: 0,
  BlinkSlow: 1,
  BlinkFast: 2,
  Double: 3,
  Flash: 4,
  FlashLong: 5,
} as const;
export type Pattern = (typeof Pattern)[keyof typeof Pattern];

export const PATTERNS: { id: Pattern; labelKey: string; noteKey: string }[] = [
  {
    id: Pattern.Solid,
    labelKey: "led.pattern.solid",
    noteKey: "led.pattern.solidNote",
  },
  {
    id: Pattern.BlinkSlow,
    labelKey: "led.pattern.blinkSlow",
    noteKey: "led.pattern.blinkSlowNote",
  },
  {
    id: Pattern.BlinkFast,
    labelKey: "led.pattern.blinkFast",
    noteKey: "led.pattern.blinkFastNote",
  },
  {
    id: Pattern.Double,
    labelKey: "led.pattern.double",
    noteKey: "led.pattern.doubleNote",
  },
  {
    id: Pattern.Flash,
    labelKey: "led.pattern.flash",
    noteKey: "led.pattern.flashNote",
  },
  {
    id: Pattern.FlashLong,
    labelKey: "led.pattern.flashLong",
    noteKey: "led.pattern.flashLongNote",
  },
];

export const UseCase = {
  None: 0,
  LinkLost: 1,
  BatteryLow: 2,
  ProfileChanged: 3,
  LayerChanged: 4,
  EndpointChanged: 5,
  CapsLock: 6,
  Modifier: 7,
} as const;
export type UseCase = (typeof UseCase)[keyof typeof UseCase];

/** Which optgroup a use case sits under. Language-independent on purpose: the
 * visible heading comes from `led.group.*` at render time. */
export type UseCaseGroup = "warning" | "change" | "state";

/** In display order — the panel renders one optgroup per entry. */
export const USECASE_GROUPS: UseCaseGroup[] = ["warning", "change", "state"];

/** `oneShot` use cases fire on a change and then go dark; the others are states
 * that hold. `indexed` ones pick their colour from the profile/layer number, so the
 * colour picker is replaced by "led.colour.auto". */
export const USECASES: {
  id: UseCase;
  labelKey: string;
  group: UseCaseGroup;
  oneShot: boolean;
  indexed: boolean;
  noteKey: string;
}[] = [
  {
    id: UseCase.LinkLost,
    labelKey: "led.uc.linkLost",
    group: "warning",
    oneShot: false,
    indexed: false,
    noteKey: "led.uc.linkLostNote",
  },
  {
    id: UseCase.BatteryLow,
    labelKey: "led.uc.batteryLow",
    group: "warning",
    oneShot: false,
    indexed: false,
    noteKey: "led.uc.batteryLowNote",
  },
  {
    id: UseCase.ProfileChanged,
    labelKey: "led.uc.profileChanged",
    group: "change",
    oneShot: true,
    indexed: true,
    noteKey: "led.uc.profileChangedNote",
  },
  {
    id: UseCase.LayerChanged,
    labelKey: "led.uc.layerChanged",
    group: "change",
    oneShot: true,
    indexed: true,
    noteKey: "led.uc.layerChangedNote",
  },
  {
    id: UseCase.EndpointChanged,
    labelKey: "led.uc.endpointChanged",
    group: "change",
    oneShot: true,
    indexed: false,
    noteKey: "",
  },
  {
    id: UseCase.CapsLock,
    labelKey: "led.uc.capsLock",
    group: "state",
    oneShot: false,
    indexed: false,
    noteKey: "led.uc.capsLockNote",
  },
  {
    id: UseCase.Modifier,
    labelKey: "led.uc.modifier",
    group: "state",
    oneShot: false,
    indexed: false,
    noteKey: "led.uc.modifierNote",
  },
];

/** rule.param for UseCase.Modifier. Matches ZMK's MOD_L* bit order. */
export const Mod = { Ctrl: 0x01, Shift: 0x02, Alt: 0x04, Gui: 0x08 } as const;
export const MODS: { bit: number; label: string }[] = [
  { bit: Mod.Ctrl, label: "Ctrl" },
  { bit: Mod.Shift, label: "Shift" },
  { bit: Mod.Alt, label: "Alt" },
  { bit: Mod.Gui, label: "GUI" },
];

export interface LedRule {
  usecase: UseCase;
  colour: number; // channel mask, or COLOUR_AUTO
  pattern: Pattern;
  param: number; // Modifier: which mods. BatteryLow: percent. else 0
}

export interface LedConfig {
  /** Firmware-authoritative; see toraboCaps for the bit meanings. */
  caps: number;
  ruleMax: number;
  sides: LedRule[][]; // [left, right]
}

export const emptyRule = (): LedRule => ({
  usecase: UseCase.None,
  colour: Ch.Red,
  pattern: Pattern.Solid,
  param: 0,
});

export function usecaseInfo(id: UseCase) {
  return USECASES.find((u) => u.id === id) ?? null;
}

export function ledWireLen(): number {
  return LED_HDR + LED_SIDES * (1 + LED_MAX_RULES * LED_RULE);
}

export function decodeLed(buf: Uint8Array): LedConfig {
  const need = ledWireLen();
  if (buf.length < LED_HDR) {
    throw new Error(tr("led.err.short", { n: buf.length }));
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== LED_MAGIC) {
    throw new Error(tr("led.err.magic", { magic: magic.toString(16) }));
  }
  const version = dv.getUint8(2);
  if (version !== LED_VERSION) {
    throw new Error(tr("led.err.version", { version }));
  }
  if (buf.length < need) {
    throw new Error(tr("led.err.truncated", { got: buf.length, need }));
  }

  const caps = dv.getUint8(3);
  const ruleMax = dv.getUint8(4);

  const sides: LedRule[][] = [];
  let o = LED_HDR;
  for (let s = 0; s < LED_SIDES; s++) {
    const count = dv.getUint8(o);
    o += 1;
    const rules: LedRule[] = [];
    for (let i = 0; i < LED_MAX_RULES; i++) {
      if (i < count) {
        rules.push({
          usecase: dv.getUint8(o) as UseCase,
          colour: dv.getUint8(o + 1) & CH_MASK,
          pattern: dv.getUint8(o + 2) as Pattern,
          param: dv.getUint8(o + 3),
        });
      }
      o += LED_RULE;
    }
    sides.push(rules);
  }
  return { caps, ruleMax, sides };
}

export function encodeLed(cfg: LedConfig): Uint8Array {
  const buf = new Uint8Array(ledWireLen());
  const dv = new DataView(buf.buffer);

  dv.setUint16(0, LED_MAGIC, true);
  dv.setUint8(2, LED_VERSION);
  // caps/ruleMax are the firmware's to state; it ignores whatever we echo back.
  dv.setUint8(3, cfg.caps & 0xff);
  dv.setUint8(4, cfg.ruleMax & 0xff);
  dv.setUint8(5, 0);

  let o = LED_HDR;
  for (let s = 0; s < LED_SIDES; s++) {
    const rules = (cfg.sides[s] ?? []).slice(0, LED_MAX_RULES);
    dv.setUint8(o, rules.length);
    o += 1;
    for (let i = 0; i < LED_MAX_RULES; i++) {
      const r = rules[i];
      if (r) {
        dv.setUint8(o, r.usecase & 0xff);
        dv.setUint8(o + 1, r.colour & CH_MASK);
        dv.setUint8(o + 2, r.pattern & 0xff);
        dv.setUint8(o + 3, r.param & 0xff);
      }
      o += LED_RULE;
    }
  }
  return buf;
}
