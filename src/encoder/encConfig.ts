/**
 * Codec for the encoder wire. MUST match the firmware
 * (torabo-tsuki_ext_FW/encoder/include/zmk_encoder_config/config.h).
 * Little-endian, fixed-length, versioned.
 *
 *   header (4B): magic u16 = 0x6e65 ("en") | version u8 = 1 | layerCount u8
 *   per layer  : cw(4) ccw(4) btn(4)
 *   binding(4B): behavior u8 | mods u8 | param u16
 *
 * Layer count is whatever the firmware reports — we decode exactly what it sends
 * and encode the same shape back, so a firmware with a different number of layers
 * needs no change here. Always Read before Save.
 *
 * The behavior/mods/param descriptor is the same idea as the trackpad's: the
 * firmware synthesises the real ZMK binding at runtime, so any keycode is
 * assignable without a compile-time palette. It is duplicated rather than shared
 * with tpConfigV2.ts on purpose — the two wires must be free to diverge.
 */

export const ENC_MAGIC = 0x6e65; // "en"
export const ENC_VERSION = 1;

export const ENC_HDR = 4;
export const ENC_BIND = 4;
export const ENC_LAYER = ENC_BIND * 3; // cw + ccw + btn

/** Which ZMK behavior a binding fires. Must match FW enum enc_behavior. */
export const EncBehavior = { None: 0, Kp: 1, Cp: 2, Mo: 3, To: 4, Tog: 5 } as const;
export type EncBehavior = (typeof EncBehavior)[keyof typeof EncBehavior];
export const ENC_BEH_MAX = EncBehavior.Tog;

/** Modifier bits for Kp/Cp (match ZMK MOD_L* order). */
export const EncMod = { LCTL: 0x01, LSFT: 0x02, LALT: 0x04, LGUI: 0x08 } as const;

/** HID usages used by the built-in presets. */
export const HID = {
  C_VOL_UP: 0xe9,
  C_VOL_DN: 0xea,
  C_MUTE: 0xe2,
  C_BRI_UP: 0x6f,
  C_BRI_DN: 0x70,
  C_NEXT: 0xb5,
  C_PREV: 0xb6,
  C_PLAY_PAUSE: 0xcd,
  KC_MINUS: 0x2d,
  KC_EQUAL: 0x2e,
  KC_PG_UP: 0x4b,
  KC_PG_DN: 0x4e,
  KC_UP: 0x52,
  KC_DOWN: 0x51,
  KC_LEFT: 0x50,
  KC_RIGHT: 0x4f,
  KC_TAB: 0x2b,
  AC_BACK: 0x224,
  AC_FORWARD: 0x225,
} as const;

export interface EncBinding {
  behavior: EncBehavior;
  mods: number;
  param: number;
}

/** cw = one detent clockwise, ccw = counter-clockwise, btn = the push button. */
export interface EncLayerCfg {
  cw: EncBinding;
  ccw: EncBinding;
  btn: EncBinding;
}

export interface EncConfig {
  layers: EncLayerCfg[];
}

export const NONE_BIND: EncBinding = { behavior: EncBehavior.None, mods: 0, param: 0 };

export const cloneBind = (b: EncBinding): EncBinding => ({ ...b });
export const bind = (behavior: EncBehavior, param: number, mods = 0): EncBinding => ({
  behavior,
  mods,
  param,
});

/** An unassigned slot fires nothing and falls through to a lower layer. */
export function bindActive(b: EncBinding | undefined): boolean {
  return !!b && b.behavior !== EncBehavior.None && b.behavior <= ENC_BEH_MAX;
}

export function encWireLen(layerCount: number): number {
  return ENC_HDR + layerCount * ENC_LAYER;
}

/* --------------------------------------------------------------------------
 * Presets — the pairs people actually want on a knob. They just fill cw/ccw, so
 * anything outside the list stays reachable through the raw picker.
 * ----------------------------------------------------------------------- */

export interface EncPreset {
  id: string;
  label: string;
  cw: EncBinding;
  ccw: EncBinding;
}

export const ENC_PRESETS: EncPreset[] = [
  {
    id: "volume",
    label: "音量",
    cw: bind(EncBehavior.Cp, HID.C_VOL_UP),
    ccw: bind(EncBehavior.Cp, HID.C_VOL_DN),
  },
  {
    id: "brightness",
    label: "画面の明るさ",
    cw: bind(EncBehavior.Cp, HID.C_BRI_UP),
    ccw: bind(EncBehavior.Cp, HID.C_BRI_DN),
  },
  {
    id: "track",
    label: "曲送り / 曲戻し",
    cw: bind(EncBehavior.Cp, HID.C_NEXT),
    ccw: bind(EncBehavior.Cp, HID.C_PREV),
  },
  {
    id: "zoom",
    label: "ズーム (Ctrl +/-)",
    cw: bind(EncBehavior.Kp, HID.KC_EQUAL, EncMod.LCTL),
    ccw: bind(EncBehavior.Kp, HID.KC_MINUS, EncMod.LCTL),
  },
  {
    id: "page",
    label: "ページ送り (PgUp/PgDn)",
    cw: bind(EncBehavior.Kp, HID.KC_PG_DN),
    ccw: bind(EncBehavior.Kp, HID.KC_PG_UP),
  },
  {
    id: "updown",
    label: "上下キー",
    cw: bind(EncBehavior.Kp, HID.KC_DOWN),
    ccw: bind(EncBehavior.Kp, HID.KC_UP),
  },
  {
    id: "leftright",
    label: "左右キー",
    cw: bind(EncBehavior.Kp, HID.KC_RIGHT),
    ccw: bind(EncBehavior.Kp, HID.KC_LEFT),
  },
  {
    id: "browser",
    label: "ブラウザ 進む / 戻る",
    cw: bind(EncBehavior.Cp, HID.AC_FORWARD),
    ccw: bind(EncBehavior.Cp, HID.AC_BACK),
  },
];

const sameBind = (a: EncBinding, b: EncBinding) =>
  a.behavior === b.behavior && a.mods === b.mods && a.param === b.param;

/** Which preset (if any) a cw/ccw pair currently matches — drives the dropdown. */
export function presetIdFor(cw: EncBinding, ccw: EncBinding): string | null {
  const hit = ENC_PRESETS.find((p) => sameBind(p.cw, cw) && sameBind(p.ccw, ccw));
  return hit ? hit.id : null;
}

/* --------------------------------------------------------------------------
 * Wire codec
 * ----------------------------------------------------------------------- */

export function defaultLayer(): EncLayerCfg {
  return { cw: cloneBind(NONE_BIND), ccw: cloneBind(NONE_BIND), btn: cloneBind(NONE_BIND) };
}

/** Throws on anything we don't recognise, rather than half-decoding it. */
export function decodeEnc(buf: Uint8Array): EncConfig {
  if (buf.length < ENC_HDR) {
    throw new Error(`encoder config too short (${buf.length} B)`);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint16(0, true);
  const version = dv.getUint8(2);
  const layerCount = dv.getUint8(3);

  if (magic !== ENC_MAGIC) {
    throw new Error(`encoder config: bad magic 0x${magic.toString(16)}`);
  }
  if (version !== ENC_VERSION) {
    throw new Error(`encoder config: unsupported version ${version}`);
  }
  const need = encWireLen(layerCount);
  if (buf.length < need) {
    throw new Error(`encoder config truncated: ${buf.length} B, need ${need}`);
  }

  const readBind = (o: number): EncBinding => {
    const behavior = dv.getUint8(o);
    return {
      // Drop a descriptor we can't interpret rather than showing a wrong one.
      behavior: (behavior <= ENC_BEH_MAX ? behavior : EncBehavior.None) as EncBehavior,
      mods: dv.getUint8(o + 1),
      param: dv.getUint16(o + 2, true),
    };
  };

  const layers: EncLayerCfg[] = [];
  let o = ENC_HDR;
  for (let i = 0; i < layerCount; i++) {
    layers.push({
      cw: readBind(o),
      ccw: readBind(o + ENC_BIND),
      btn: readBind(o + ENC_BIND * 2),
    });
    o += ENC_LAYER;
  }
  return { layers };
}

export function encodeEnc(cfg: EncConfig): Uint8Array {
  const layerCount = cfg.layers.length;
  const buf = new Uint8Array(encWireLen(layerCount));
  const dv = new DataView(buf.buffer);

  dv.setUint16(0, ENC_MAGIC, true);
  dv.setUint8(2, ENC_VERSION);
  dv.setUint8(3, layerCount);

  const writeBind = (o: number, b: EncBinding) => {
    dv.setUint8(o, b.behavior & 0xff);
    dv.setUint8(o + 1, b.mods & 0xff);
    dv.setUint16(o + 2, b.param & 0xffff, true);
  };

  let o = ENC_HDR;
  for (const l of cfg.layers) {
    writeBind(o, l.cw);
    writeBind(o + ENC_BIND, l.ccw);
    writeBind(o + ENC_BIND * 2, l.btn);
    o += ENC_LAYER;
  }
  return buf;
}
