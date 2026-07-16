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

export const COLOURS: { mask: number; label: string }[] = [
  { mask: Ch.Red, label: "赤" },
  { mask: Ch.YellowGreen, label: "黄緑" },
  { mask: Ch.Green, label: "緑" },
  { mask: Ch.Red | Ch.Green, label: "赤+緑" },
  { mask: Ch.Red | Ch.YellowGreen, label: "赤+黄緑" },
  { mask: Ch.Green | Ch.YellowGreen, label: "緑+黄緑" },
  { mask: Ch.Red | Ch.YellowGreen | Ch.Green, label: "全点灯" },
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

export const PATTERNS: { id: Pattern; label: string; note: string }[] = [
  { id: Pattern.Solid, label: "点灯", note: "条件が続く間ずっと。最も電池を食う" },
  { id: Pattern.BlinkSlow, label: "ゆっくり点滅", note: "2秒に1回。点灯の約1/40" },
  { id: Pattern.BlinkFast, label: "速い点滅", note: "0.5秒に1回" },
  { id: Pattern.Double, label: "ダブル点滅", note: "2回光って長い休み。警告向き" },
  { id: Pattern.Flash, label: "1秒光る", note: "変化したときに1回だけ" },
  { id: Pattern.FlashLong, label: "1.5秒光る", note: "変化したときに1回だけ" },
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

/** `oneShot` use cases fire on a change and then go dark; the others are states
 * that hold. `indexed` ones pick their colour from the profile/layer number, so the
 * colour picker is replaced by "自動". */
export const USECASES: {
  id: UseCase;
  label: string;
  group: "警告" | "変化の通知" | "状態表示";
  oneShot: boolean;
  indexed: boolean;
  note: string;
}[] = [
  {
    id: UseCase.LinkLost,
    label: "相方を見失った",
    group: "警告",
    oneShot: false,
    indexed: false,
    note: "左右のリンクが切れたとき。どちらの半分が落ちたか、その半分自身で分かる",
  },
  {
    id: UseCase.BatteryLow,
    label: "電池残量が少ない",
    group: "警告",
    oneShot: false,
    indexed: false,
    note: "しきい値(%)を下回ったとき。左右それぞれ自分の電池を見る",
  },
  {
    id: UseCase.ProfileChanged,
    label: "BLEプロファイル切替",
    group: "変化の通知",
    oneShot: true,
    indexed: true,
    note: "プロファイル番号ごとに色が変わる",
  },
  {
    id: UseCase.LayerChanged,
    label: "レイヤー変更",
    group: "変化の通知",
    oneShot: true,
    indexed: true,
    note: "レイヤー番号ごとに色が変わる",
  },
  {
    id: UseCase.EndpointChanged,
    label: "出力先切替 (USB↔BLE)",
    group: "変化の通知",
    oneShot: true,
    indexed: false,
    note: "",
  },
  {
    id: UseCase.CapsLock,
    label: "Caps Lock",
    group: "状態表示",
    oneShot: false,
    indexed: false,
    note: "ONの間ずっと。点滅にすると電池が持つ",
  },
  {
    id: UseCase.Modifier,
    label: "修飾キー押下中",
    group: "状態表示",
    oneShot: false,
    indexed: false,
    note: "押している間だけ。一過性なので電池には優しい",
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
    throw new Error(`LED config too short (${buf.length} B)`);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== LED_MAGIC) {
    throw new Error(`LED config: bad magic 0x${magic.toString(16)}`);
  }
  const version = dv.getUint8(2);
  if (version !== LED_VERSION) {
    throw new Error(`LED config: unsupported version ${version}`);
  }
  if (buf.length < need) {
    throw new Error(`LED config truncated: ${buf.length} B, need ${need}`);
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
