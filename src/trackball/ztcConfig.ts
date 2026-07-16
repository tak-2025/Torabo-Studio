/**
 * Codec for the v2 packed/versioned trackball wire. MUST match the firmware
 * (zmk-feature-trackball-config docs/DESIGN_v2.md §4 / §11.E). Little-endian.
 *
 * Layout: fixed header (8B) THEN layers[N] (12B each):
 *   hdr: magic u16(0x7A74), version u8(2), layer_count u8, temp_target u8,
 *        _rsv u8, temp_timeout_ms u16
 *   layer: x{role u8, dir u8, speed u8, _rsv u8}, y{...}, temp_enable u8, _rsv[3]
 *
 * The app is layer-count agnostic: it decodes however many layers the firmware
 * sends (N = (len-8)/12) and encodes the same number back, so it adapts to the
 * keyboard's ZMK_KEYMAP_LAYERS_LEN. Always Read before Save.
 */

export const ZTC_MAGIC = 0x7a74;
export const ZTC_VERSION = 2;
export const ZTC_HDR = 8;
export const ZTC_LAYER = 12;
export const ZTC_SPEED_MIN = 1;
export const ZTC_SPEED_MAX = 32;
export const ZTC_TIMEOUT_MIN = 50;
export const ZTC_TIMEOUT_MAX = 30000;

export enum Role {
  Move = 0,
  Scroll = 1,
  Off = 2,
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.Move]: "カーソル移動（Move）",
  [Role.Scroll]: "スクロール（Scroll）",
  [Role.Off]: "無効（Off）",
};

export interface AxisCfg {
  role: Role;
  reverse: boolean;
  speedDiv: number; // 1..32 (bigger = slower)
}

export interface LayerCfg {
  x: AxisCfg;
  y: AxisCfg;
  tempEnable: boolean;
}

export interface ZtcConfig {
  layers: LayerCfg[];
  tempTarget: number;
  tempTimeoutMs: number;
}

const clampSpeed = (s: number) =>
  Math.max(ZTC_SPEED_MIN, Math.min(ZTC_SPEED_MAX, Math.trunc(s) || ZTC_SPEED_MIN));
const clampTimeout = (t: number) =>
  Math.max(ZTC_TIMEOUT_MIN, Math.min(ZTC_TIMEOUT_MAX, Math.trunc(t) || ZTC_TIMEOUT_MIN));

function roleOf(v: number): Role {
  return v === Role.Scroll || v === Role.Off ? v : Role.Move; // unknown => Move
}

export function decodeZtc(bytes: Uint8Array): ZtcConfig {
  if (bytes.length < ZTC_HDR || (bytes.length - ZTC_HDR) % ZTC_LAYER !== 0) {
    throw new Error(`Unexpected trackball config size ${bytes.length}`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== ZTC_MAGIC) {
    throw new Error(`Bad magic 0x${magic.toString(16)} (firmware/app mismatch)`);
  }
  const version = dv.getUint8(2);
  if (version !== ZTC_VERSION) {
    throw new Error(`Unsupported config version ${version} (expected ${ZTC_VERSION})`);
  }
  const tempTarget = dv.getUint8(4);
  const tempTimeoutMs = dv.getUint16(6, true);

  const n = (bytes.length - ZTC_HDR) / ZTC_LAYER;
  const layers: LayerCfg[] = [];
  for (let i = 0; i < n; i++) {
    const o = ZTC_HDR + i * ZTC_LAYER;
    layers.push({
      x: { role: roleOf(dv.getUint8(o)), reverse: dv.getUint8(o + 1) !== 0, speedDiv: dv.getUint8(o + 2) },
      y: { role: roleOf(dv.getUint8(o + 4)), reverse: dv.getUint8(o + 5) !== 0, speedDiv: dv.getUint8(o + 6) },
      tempEnable: dv.getUint8(o + 8) !== 0,
    });
  }
  return { layers, tempTarget, tempTimeoutMs };
}

export function encodeZtc(cfg: ZtcConfig): Uint8Array {
  const n = cfg.layers.length;
  const buf = new Uint8Array(ZTC_HDR + n * ZTC_LAYER);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, ZTC_MAGIC, true);
  dv.setUint8(2, ZTC_VERSION);
  dv.setUint8(3, n & 0xff);
  dv.setUint8(4, cfg.tempTarget & 0xff);
  dv.setUint16(6, clampTimeout(cfg.tempTimeoutMs), true);
  cfg.layers.forEach((l, i) => {
    const o = ZTC_HDR + i * ZTC_LAYER;
    dv.setUint8(o, l.x.role & 0xff);
    dv.setUint8(o + 1, l.x.reverse ? 1 : 0);
    dv.setUint8(o + 2, clampSpeed(l.x.speedDiv));
    dv.setUint8(o + 4, l.y.role & 0xff);
    dv.setUint8(o + 5, l.y.reverse ? 1 : 0);
    dv.setUint8(o + 6, clampSpeed(l.y.speedDiv));
    dv.setUint8(o + 8, l.tempEnable ? 1 : 0);
  });
  return buf;
}
