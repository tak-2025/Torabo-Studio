/**
 * Codec for the v2/v3 packed/versioned trackball wire. MUST match the firmware
 * (zmk-feature-trackball-config docs/DESIGN_v2.md §4 / §11.E). Little-endian.
 *
 * Layout: fixed header (8B) THEN layers[N] (12B each) THEN, in v3 only, a 4B
 * coast trailer:
 *   hdr: magic u16(0x7A74), version u8(2|3), layer_count u8, temp_target u8,
 *        _rsv u8, temp_timeout_ms u16
 *   layer: x{role u8, dir u8, speed u8, _rsv u8}, y{...}, temp_enable u8, _rsv[3]
 *   coast (v3): enable u8, friction u8, threshold u8, _rsv u8
 *
 * The coast block is a TRAILER, not a header extension, precisely so every v2
 * offset stays put. There is one set for the whole ball — coasting is a property
 * of the ball, not of a layer or an axis.
 *
 * The app is layer-count agnostic: it decodes however many layers the firmware
 * sends and encodes the same number back, so it adapts to the keyboard's
 * ZMK_KEYMAP_LAYERS_LEN. It also answers in the VERSION it was spoken to: a
 * firmware that predates coasting only accepts v2, so writing v3 at it would be
 * rejected for no gain. Always Read before Save.
 */

import { tr } from "../i18n";

export const ZTC_MAGIC = 0x7a74;
export const ZTC_VERSION_V2 = 2;
export const ZTC_VERSION_V3 = 3;
/** Newest wire this codec speaks (what encode emits for v3-capable firmware). */
export const ZTC_VERSION = ZTC_VERSION_V3;
export const ZTC_HDR = 8;
export const ZTC_LAYER = 12;
/** v3 trailer: enable, friction, threshold, _rsv. */
export const ZTC_COAST = 4;
export const ZTC_SPEED_MIN = 1;
export const ZTC_SPEED_MAX = 32;
export const ZTC_TIMEOUT_MIN = 50;
export const ZTC_TIMEOUT_MAX = 30000;

/* Inertial scroll ("coast") limits — must match config.h ZTC_COAST_*.
 * friction is the per-tick velocity loss in 1/256ths: the coast velocity is
 * multiplied by (256 - 3*friction)/256 every 20 ms. SMALL = glides for seconds,
 * LARGE = stops almost at once — the same "bigger is weaker" direction as the
 * speed divisor. threshold is the minimum speed that starts a glide, in wheel
 * ticks/second as the host sees them (i.e. after the divisor is applied). */
export const ZTC_COAST_FRICTION_MIN = 1;
export const ZTC_COAST_FRICTION_MAX = 32;
export const ZTC_COAST_FRICTION_DEFAULT = 8;
export const ZTC_COAST_THRESHOLD_MIN = 1;
export const ZTC_COAST_THRESHOLD_MAX = 255;
export const ZTC_COAST_THRESHOLD_DEFAULT = 24;

export enum Role {
  Move = 0,
  Scroll = 1,
  Off = 2,
}

/** Message keys, not text — the panel resolves them with `t()` so the labels
 * follow the language toggle. See src/i18n/panels/trackball.ts. */
export const ROLE_LABEL_KEYS: Record<Role, string> = {
  [Role.Move]: "tb.role.move",
  [Role.Scroll]: "tb.role.scroll",
  [Role.Off]: "tb.role.off",
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

/**
 * Inertial scroll for the ball (v3). Only axes set to Scroll ever coast; a new
 * ball movement stops a glide at once, and a glide keeps running after the layer
 * that started it is released — same as a real trackpad.
 */
export interface CoastCfg {
  enable: boolean;
  friction: number; // 1..32 (small = long glide)
  threshold: number; // 1..255 wheel ticks/s
}

export interface ZtcConfig {
  layers: LayerCfg[];
  tempTarget: number;
  tempTimeoutMs: number;
  /** v3; defaults (disabled) for a v2 wire, which cannot carry it. */
  coast: CoastCfg;
  /** The firmware sent a v3 wire, i.e. it has the coast engine. Drives both the
   * UI gate and the version encode writes back. */
  hasCoast: boolean;
}

const clampSpeed = (s: number) =>
  Math.max(ZTC_SPEED_MIN, Math.min(ZTC_SPEED_MAX, Math.trunc(s) || ZTC_SPEED_MIN));
const clampTimeout = (t: number) =>
  Math.max(ZTC_TIMEOUT_MIN, Math.min(ZTC_TIMEOUT_MAX, Math.trunc(t) || ZTC_TIMEOUT_MIN));

/** 0 means "unset" on the wire and becomes the default, never 0 decay. */
export const clampCoastFriction = (f: number) => {
  const v = Math.trunc(f) || 0;
  if (v < ZTC_COAST_FRICTION_MIN) return ZTC_COAST_FRICTION_DEFAULT;
  return Math.min(ZTC_COAST_FRICTION_MAX, v);
};
export const clampCoastThreshold = (t: number) => {
  const v = Math.trunc(t) || 0;
  if (v < ZTC_COAST_THRESHOLD_MIN) return ZTC_COAST_THRESHOLD_DEFAULT;
  return Math.min(ZTC_COAST_THRESHOLD_MAX, v);
};

/** Coasting off, with the firmware's own defaults parked in the sliders. */
export const defaultCoast = (): CoastCfg => ({
  enable: false,
  friction: ZTC_COAST_FRICTION_DEFAULT,
  threshold: ZTC_COAST_THRESHOLD_DEFAULT,
});

function roleOf(v: number): Role {
  return v === Role.Scroll || v === Role.Off ? v : Role.Move; // unknown => Move
}

export function decodeZtc(bytes: Uint8Array): ZtcConfig {
  if (bytes.length < ZTC_HDR) {
    throw new Error(tr("tb.err.size", { size: bytes.length }));
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== ZTC_MAGIC) {
    throw new Error(tr("tb.err.magic", { magic: magic.toString(16) }));
  }
  const version = dv.getUint8(2);
  if (version !== ZTC_VERSION_V2 && version !== ZTC_VERSION_V3) {
    throw new Error(
      tr("tb.err.version", {
        version,
        v2: ZTC_VERSION_V2,
        v3: ZTC_VERSION_V3,
      }),
    );
  }
  // The trailer is 4 B and a layer is 12, so the two lengths can never collide —
  // but the version, not the length, is what decides whether it is there.
  const hasCoast = version === ZTC_VERSION_V3;
  const body = bytes.length - ZTC_HDR - (hasCoast ? ZTC_COAST : 0);
  if (body < 0 || body % ZTC_LAYER !== 0) {
    throw new Error(tr("tb.err.sizeV", { size: bytes.length, version }));
  }
  const tempTarget = dv.getUint8(4);
  const tempTimeoutMs = dv.getUint16(6, true);

  const n = body / ZTC_LAYER;
  const coast: CoastCfg = hasCoast
    ? {
        enable: dv.getUint8(ZTC_HDR + n * ZTC_LAYER) !== 0,
        friction: clampCoastFriction(dv.getUint8(ZTC_HDR + n * ZTC_LAYER + 1)),
        threshold: clampCoastThreshold(dv.getUint8(ZTC_HDR + n * ZTC_LAYER + 2)),
      }
    : defaultCoast();
  const layers: LayerCfg[] = [];
  for (let i = 0; i < n; i++) {
    const o = ZTC_HDR + i * ZTC_LAYER;
    layers.push({
      x: { role: roleOf(dv.getUint8(o)), reverse: dv.getUint8(o + 1) !== 0, speedDiv: dv.getUint8(o + 2) },
      y: { role: roleOf(dv.getUint8(o + 4)), reverse: dv.getUint8(o + 5) !== 0, speedDiv: dv.getUint8(o + 6) },
      tempEnable: dv.getUint8(o + 8) !== 0,
    });
  }
  return { layers, tempTarget, tempTimeoutMs, coast, hasCoast };
}

export function encodeZtc(cfg: ZtcConfig): Uint8Array {
  const n = cfg.layers.length;
  // Answer in the version we were spoken to — see the file header.
  const hasCoast = !!cfg.hasCoast;
  const buf = new Uint8Array(ZTC_HDR + n * ZTC_LAYER + (hasCoast ? ZTC_COAST : 0));
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, ZTC_MAGIC, true);
  dv.setUint8(2, hasCoast ? ZTC_VERSION_V3 : ZTC_VERSION_V2);
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
  if (hasCoast) {
    const c = cfg.coast ?? defaultCoast();
    const o = ZTC_HDR + n * ZTC_LAYER;
    dv.setUint8(o, c.enable ? 1 : 0);
    dv.setUint8(o + 1, clampCoastFriction(c.friction));
    dv.setUint8(o + 2, clampCoastThreshold(c.threshold));
    // o + 3 stays 0 (_rsv)
  }
  return buf;
}

/**
 * Re-shape a config that came from a FILE so it fits the keyboard in front of
 * us right now.
 *
 * The wire's length is `8 + 12 * ZMK_KEYMAP_LAYERS_LEN (+ 4)`, i.e. it is bound
 * to the layer count of the keyboard that produced it — and the firmware's
 * `ztc_apply_wire` (features/trackball/src/config_state.c) demands an EXACT
 * length match, so a wire from a board with a different layer count is rejected
 * outright. That is not a rare cross-device case: adding reserved layers (the
 * torabo-reserved-layers snippet) raises ZMK_KEYMAP_LAYERS_LEN on the SAME
 * keyboard, which is what makes an old backup unrestorable after a firmware
 * update. Hence restore re-encodes rather than writing the file's bytes.
 *
 * `live` is the config just read off the keyboard, and it is what decides the
 * SHAPE of the result:
 *   - layers: one per layer the keyboard has. The file fills them in order; a
 *     layer the file does not reach keeps what the keyboard has now (never a
 *     silent reset), and layers past the keyboard's count are dropped.
 *   - hasCoast: the firmware's answer, not the file's — encode always answers
 *     in the version the keyboard speaks (see the file header). A v2 file
 *     restored onto v3 firmware therefore keeps the keyboard's current coast
 *     settings rather than forcing them off, because a v2 wire never carried an
 *     opinion about coasting in the first place.
 *   - tempTarget: the file's, unless it names a layer this keyboard does not
 *     have (the firmware would silently substitute its own fallback).
 */
export function reshapeZtc(file: ZtcConfig, live: ZtcConfig): ZtcConfig {
  const layers = live.layers.map((l, i) => file.layers[i] ?? l);
  return {
    layers,
    tempTarget: file.tempTarget < layers.length ? file.tempTarget : live.tempTarget,
    tempTimeoutMs: file.tempTimeoutMs,
    coast: file.hasCoast ? file.coast : live.coast,
    hasCoast: live.hasCoast,
  };
}
