/**
 * v2 codec for the trackpad wire. MUST match the firmware
 * (torabo-tsuki_ext_FW/docs/DESIGN-trackpad-v2.md §2/§3). Little-endian, fixed-length.
 *
 * v2 adds two dimensions over v1 (tpConfig.ts):
 *   - axis discrete role collapses to ENCODER carrying a pos/neg binding pair
 *     (swipe up/down each fire an arbitrary behavior+param). Volume/Brightness/
 *     Zoom/Browser become *app-side presets* that fill the pair.
 *   - a per-layer gesture slot { tap, tap2, hold }, each an arbitrary binding.
 *
 * A binding descriptor is { behavior, mods, param } — behavior selects which ZMK
 * behavior the firmware fires (none/kp/cp/mo/to/tog) and param is its param1
 * (keycode / consumer usage / layer). The firmware builds the binding at runtime,
 * so any keycode is assignable without a compile-time palette.
 *
 * decode accepts BOTH version 1 (old fixed-role wire) and version 2; encode always
 * emits version 2. Like v1 it is device-/layer-count agnostic: it decodes exactly
 * what the firmware sends and encodes the same shape back. Always Read before Save.
 */

export const TP_MAGIC = 0x7470; // "tp"
export const TP_VERSION = 2;
export const TP_VERSION_V1 = 1;

export const TP_HDR = 6;
export const TP_DEV_HDR = 2;
export const TP_BIND = 4;
export const TP_AXIS = 11; // role,dir,step + pos(4) + neg(4)
export const TP_GEST = 16; // tap,tap2,hold,dtap (4 each)
export const TP_AXIS_V1 = 3; // v1 axis: role,dir,step only
export const TP_LAYER_V1 = 6; // v1 layer: x(3) + y(3)

export const TP_STEP_MIN = 1;
export const TP_STEP_MAX = 32;

/** header flags */
export const TP_FLAG_GESTURES = 0x01;

/** Axis role (v2). Discrete roles are unified under Encoder. */
export const TpRole = { Move: 0, Scroll: 1, Off: 2, Encoder: 3 } as const;
export type TpRole = (typeof TpRole)[keyof typeof TpRole];
export const TP_ROLE_MAX = TpRole.Encoder;

/** Which ZMK behavior a binding fires. Must match FW enum tp_behavior. */
export const TpBehavior = { None: 0, Kp: 1, Cp: 2, Mo: 3, To: 4, Tog: 5 } as const;
export type TpBehavior = (typeof TpBehavior)[keyof typeof TpBehavior];
export const TP_BEH_MAX = TpBehavior.Tog;

/** Modifier bits for Kp (match ZMK MOD_L* order). */
export const TpMod = { LCTL: 0x01, LSFT: 0x02, LALT: 0x04, LGUI: 0x08 } as const;

/** A few HID usages used by the built-in presets. */
export const HID = {
  KC_MINUS: 0x2d,
  KC_EQUAL: 0x2e,
  C_VOL_UP: 0xe9,
  C_VOL_DN: 0xea,
  C_BRI_UP: 0x6f,
  C_BRI_DN: 0x70,
  AC_FORWARD: 0x225,
  AC_BACK: 0x224,
} as const;

export interface TpBinding {
  behavior: TpBehavior;
  mods: number; // 0..255 (Kp modifier bits; 0 for others)
  param: number; // 0..65535 (keycode / consumer usage / layer)
}

export interface TpAxisCfg {
  role: TpRole;
  reverse: boolean;
  step: number; // 1..32 (speed divisor for continuous / accumulation threshold for Encoder)
  pos: TpBinding; // fired on positive-direction swipe (Encoder only)
  neg: TpBinding; // fired on negative-direction swipe (Encoder only)
}

export interface TpGestures {
  tap: TpBinding; // single tap
  tap2: TpBinding; // two-finger tap
  hold: TpBinding; // press-and-hold (down/up follow)
  dtap: TpBinding; // double tap (detected in tp_keys via timing window)
}

export interface TpLayerCfg {
  x: TpAxisCfg;
  y: TpAxisCfg;
  gestures: TpGestures;
}

/* ---------------------------------------------------------------------------
 * Device identity metadata — the 2nd byte of the per-device wire header (what
 * used to be a reserved/zero byte). The firmware fills it in from its build
 * configuration; we only read it. This is what lets one app serve every hardware
 * pattern: we no longer guess "device 0 == left pad" from the id, we render what
 * the firmware says it is. Firmware that predates this sends 0, which we treat
 * as unknown and label generically. Must match config.h TP_META_*.
 * ------------------------------------------------------------------------- */
export const TpSide = { Unknown: 0, Left: 1, Right: 2 } as const;
export type TpSide = (typeof TpSide)[keyof typeof TpSide];

/** Which FFC the device hangs off: the half's own connector, or the extender. */
export const TpConn = { Unknown: 0, Standard: 1, Extension: 2 } as const;
export type TpConn = (typeof TpConn)[keyof typeof TpConn];

export const TpKind = { Unknown: 0, Trackpad: 1, Trackball: 2, Encoder: 3 } as const;
export type TpKind = (typeof TpKind)[keyof typeof TpKind];

export interface TpDeviceMeta {
  side: TpSide;
  conn: TpConn;
  kind: TpKind;
}

export function decodeMeta(meta: number): TpDeviceMeta {
  return {
    side: (meta & 0x03) as TpSide,
    conn: ((meta >> 2) & 0x03) as TpConn,
    kind: ((meta >> 4) & 0x03) as TpKind,
  };
}

export function encodeMeta(m: TpDeviceMeta): number {
  return ((m.side & 0x03) | ((m.conn & 0x03) << 2) | ((m.kind & 0x03) << 4)) & 0xff;
}

const SIDE_JA: Record<number, string> = { 1: "左", 2: "右" };
const CONN_JA: Record<number, string> = { 1: "標準FFC", 2: "拡張FPC" };
const KIND_JA: Record<number, string> = {
  1: "トラックパッド",
  2: "トラックボール",
  3: "ロータリーエンコーダ",
};

/**
 * Human label for a device, built from whatever the firmware told us. Any part
 * the firmware left unknown is simply omitted; if it told us nothing at all we
 * fall back to the wire slot so the device is still selectable.
 */
export function describeDevice(deviceId: number, meta: number): string {
  const { side, conn, kind } = decodeMeta(meta);
  const parts = [SIDE_JA[side], CONN_JA[conn], KIND_JA[kind]].filter(Boolean);
  return parts.length ? parts.join(" · ") : `デバイス ${deviceId}`;
}

export interface TpDeviceCfg {
  deviceId: number;
  /** Raw identity byte from the firmware. 0 = unknown (pre-meta firmware). */
  meta: number;
  layers: TpLayerCfg[];
}

export interface TpConfig {
  devices: TpDeviceCfg[];
  layerCount: number;
  hasGestures: boolean;
}

const clampByte = (v: number) => Math.max(0, Math.min(0xff, Math.trunc(v) || 0));
const clampU16 = (v: number) => Math.max(0, Math.min(0xffff, Math.trunc(v) || 0));
const clampStep = (s: number) =>
  Math.max(TP_STEP_MIN, Math.min(TP_STEP_MAX, Math.trunc(s) || TP_STEP_MIN));

function roleOf(v: number): TpRole {
  return v >= TpRole.Move && v <= TP_ROLE_MAX ? (v as TpRole) : TpRole.Move; // unknown => Move
}

function behaviorOf(v: number): TpBehavior {
  return v >= TpBehavior.None && v <= TP_BEH_MAX ? (v as TpBehavior) : TpBehavior.None;
}

export const NONE_BIND: TpBinding = { behavior: TpBehavior.None, mods: 0, param: 0 };
const bind = (behavior: TpBehavior, param: number, mods = 0): TpBinding => ({
  behavior,
  mods,
  param,
});

const cloneBind = (b: TpBinding): TpBinding => ({ ...b });
const emptyGestures = (): TpGestures => ({
  tap: cloneBind(NONE_BIND),
  tap2: cloneBind(NONE_BIND),
  hold: cloneBind(NONE_BIND),
  dtap: cloneBind(NONE_BIND),
});

/** Built-in presets: what a v1 discrete role maps to (pos = swipe +, neg = swipe -). */
export function presetForV1Role(role: number): { pos: TpBinding; neg: TpBinding } {
  switch (role) {
    case 3: // Volume
      return { pos: bind(TpBehavior.Cp, HID.C_VOL_UP), neg: bind(TpBehavior.Cp, HID.C_VOL_DN) };
    case 4: // Brightness
      return { pos: bind(TpBehavior.Cp, HID.C_BRI_UP), neg: bind(TpBehavior.Cp, HID.C_BRI_DN) };
    case 5: // Zoom => Ctrl+= / Ctrl+-
      return {
        pos: bind(TpBehavior.Kp, HID.KC_EQUAL, TpMod.LCTL),
        neg: bind(TpBehavior.Kp, HID.KC_MINUS, TpMod.LCTL),
      };
    case 6: // Browser fwd/back
      return { pos: bind(TpBehavior.Cp, HID.AC_FORWARD), neg: bind(TpBehavior.Cp, HID.AC_BACK) };
    default:
      return { pos: cloneBind(NONE_BIND), neg: cloneBind(NONE_BIND) };
  }
}

/** Expected total wire length for a version-2 blob. */
export function tpWireLen(deviceCount: number, layerCount: number, hasGestures: boolean): number {
  const stride = TP_AXIS * 2 + (hasGestures ? TP_GEST : 0);
  return TP_HDR + deviceCount * (TP_DEV_HDR + layerCount * stride);
}

/** Expected total wire length for a version-1 blob. */
export function tpWireLenV1(deviceCount: number, layerCount: number): number {
  return TP_HDR + deviceCount * (TP_DEV_HDR + layerCount * TP_LAYER_V1);
}

export function decodeTp(bytes: Uint8Array): TpConfig {
  if (bytes.length < TP_HDR) {
    throw new Error(`Unexpected trackpad config size ${bytes.length}`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== TP_MAGIC) {
    throw new Error(`Bad magic 0x${magic.toString(16)} (firmware/app mismatch)`);
  }
  const version = dv.getUint8(2);
  const deviceCount = dv.getUint8(3);
  const layerCount = dv.getUint8(4);
  const flags = dv.getUint8(5);

  if (version === TP_VERSION_V1) {
    return decodeV1(dv, deviceCount, layerCount, bytes.length);
  }
  if (version !== TP_VERSION) {
    throw new Error(`Unsupported trackpad config version ${version} (expected ${TP_VERSION})`);
  }

  const hasGestures = (flags & TP_FLAG_GESTURES) !== 0;
  const expected = tpWireLen(deviceCount, layerCount, hasGestures);
  if (bytes.length !== expected) {
    throw new Error(`Bad trackpad config length ${bytes.length} (expected ${expected})`);
  }

  const readBind = (o: number): TpBinding => ({
    behavior: behaviorOf(dv.getUint8(o)),
    mods: dv.getUint8(o + 1),
    param: dv.getUint16(o + 2, true),
  });
  const readAxis = (o: number): TpAxisCfg => ({
    role: roleOf(dv.getUint8(o)),
    reverse: dv.getUint8(o + 1) !== 0,
    step: dv.getUint8(o + 2),
    pos: readBind(o + 3),
    neg: readBind(o + 7),
  });

  const devices: TpDeviceCfg[] = [];
  let o = TP_HDR;
  for (let d = 0; d < deviceCount; d++) {
    const deviceId = dv.getUint8(o);
    const meta = dv.getUint8(o + 1); // 0 on firmware that predates the meta byte
    o += TP_DEV_HDR;
    const layers: TpLayerCfg[] = [];
    for (let i = 0; i < layerCount; i++) {
      const x = readAxis(o);
      const y = readAxis(o + TP_AXIS);
      o += TP_AXIS * 2;
      let gestures: TpGestures;
      if (hasGestures) {
        gestures = {
          tap: readBind(o),
          tap2: readBind(o + 4),
          hold: readBind(o + 8),
          dtap: readBind(o + 12),
        };
        o += TP_GEST;
      } else {
        gestures = emptyGestures();
      }
      layers.push({ x, y, gestures });
    }
    devices.push({ deviceId, meta, layers });
  }
  return { devices, layerCount, hasGestures };
}

/** Decode a legacy v1 blob, upgrading fixed roles to the v2 model. */
function decodeV1(
  dv: DataView,
  deviceCount: number,
  layerCount: number,
  totalLen: number
): TpConfig {
  const expected = tpWireLenV1(deviceCount, layerCount);
  if (totalLen !== expected) {
    throw new Error(`Bad v1 trackpad config length ${totalLen} (expected ${expected})`);
  }
  const upgradeAxis = (o: number): TpAxisCfg => {
    const rawRole = dv.getUint8(o);
    const reverse = dv.getUint8(o + 1) !== 0;
    const step = dv.getUint8(o + 2);
    if (rawRole >= 3) {
      // discrete v1 role => Encoder + preset pair
      const { pos, neg } = presetForV1Role(rawRole);
      return { role: TpRole.Encoder, reverse, step, pos, neg };
    }
    return {
      role: roleOf(rawRole),
      reverse,
      step,
      pos: cloneBind(NONE_BIND),
      neg: cloneBind(NONE_BIND),
    };
  };
  const devices: TpDeviceCfg[] = [];
  let o = TP_HDR;
  for (let d = 0; d < deviceCount; d++) {
    const deviceId = dv.getUint8(o);
    const meta = dv.getUint8(o + 1); // v1 firmware left this reserved => 0 (unknown)
    o += TP_DEV_HDR;
    const layers: TpLayerCfg[] = [];
    for (let i = 0; i < layerCount; i++) {
      const x = upgradeAxis(o);
      const y = upgradeAxis(o + TP_AXIS_V1);
      o += TP_LAYER_V1;
      layers.push({ x, y, gestures: emptyGestures() });
    }
    devices.push({ deviceId, meta, layers });
  }
  // Upgraded configs are now gesture-capable; re-save as full v2.
  return { devices, layerCount, hasGestures: true };
}

export function encodeTp(cfg: TpConfig): Uint8Array {
  const deviceCount = cfg.devices.length;
  const buf = new Uint8Array(tpWireLen(deviceCount, cfg.layerCount, cfg.hasGestures));
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, TP_MAGIC, true);
  dv.setUint8(2, TP_VERSION);
  dv.setUint8(3, deviceCount & 0xff);
  dv.setUint8(4, cfg.layerCount & 0xff);
  dv.setUint8(5, cfg.hasGestures ? TP_FLAG_GESTURES : 0);

  const writeBind = (o: number, b: TpBinding) => {
    dv.setUint8(o, behaviorOf(b.behavior));
    dv.setUint8(o + 1, clampByte(b.mods));
    dv.setUint16(o + 2, clampU16(b.param), true);
  };
  const writeAxis = (o: number, a: TpAxisCfg) => {
    dv.setUint8(o, a.role & 0xff);
    dv.setUint8(o + 1, a.reverse ? 1 : 0);
    dv.setUint8(o + 2, clampStep(a.step));
    writeBind(o + 3, a.pos ?? NONE_BIND);
    writeBind(o + 7, a.neg ?? NONE_BIND);
  };

  const defAxis = (): TpAxisCfg => ({
    role: TpRole.Move,
    reverse: false,
    step: 1,
    pos: cloneBind(NONE_BIND),
    neg: cloneBind(NONE_BIND),
  });

  let o = TP_HDR;
  for (const dev of cfg.devices) {
    dv.setUint8(o, dev.deviceId & 0xff);
    // Echo the identity back for a faithful round-trip. The firmware ignores it
    // on write and re-derives it from its own build config, so we can't corrupt it.
    dv.setUint8(o + 1, (dev.meta ?? 0) & 0xff);
    o += TP_DEV_HDR;
    for (let i = 0; i < cfg.layerCount; i++) {
      const l = dev.layers[i] ?? { x: defAxis(), y: defAxis(), gestures: emptyGestures() };
      writeAxis(o, l.x);
      writeAxis(o + TP_AXIS, l.y);
      o += TP_AXIS * 2;
      if (cfg.hasGestures) {
        const g = l.gestures ?? emptyGestures();
        writeBind(o, g.tap ?? NONE_BIND);
        writeBind(o + 4, g.tap2 ?? NONE_BIND);
        writeBind(o + 8, g.hold ?? NONE_BIND);
        writeBind(o + 12, g.dtap ?? NONE_BIND);
        o += TP_GEST;
      }
    }
  }
  return buf;
}
