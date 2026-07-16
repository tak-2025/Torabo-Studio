/**
 * Codec for the packed/versioned trackpad wire. MUST match the firmware
 * (torabo-tsuki_ext_FW docs/DESIGN-trackpad.md §3). Little-endian, fixed-length.
 *
 * Per-layer, per-device pointing-function assignment for the mini trackpad(s):
 * each axis gets a role (Move/Scroll/Off + the encoder roles Volume/Brightness/
 * Zoom/Browser), a direction, and a step (speed divisor for continuous roles /
 * accumulation threshold for encoder roles).
 *
 * Layout:
 *   hdr (6B): magic u16(0x7470), version u8(1), device_count u8, layer_count u8, _rsv u8
 *   device_count times:
 *     device_id u8, _rsv u8                                  (2B)
 *     layers[layer_count] each: x{role,dir,step} y{role,dir,step}  (6B)
 *   total = 6 + device_count * (2 + layer_count * 6)
 *
 * Like the trackball codec, the app is layer-count / device-count agnostic: it
 * decodes exactly what the firmware sends and encodes the same shape back.
 * Always Read before Save.
 */

export const TP_MAGIC = 0x7470; // "tp"
export const TP_VERSION = 1;
export const TP_HDR = 6;
export const TP_DEV_HDR = 2;
export const TP_LAYER = 6;
export const TP_STEP_MIN = 1;
export const TP_STEP_MAX = 32;

export enum TpRole {
  Move = 0,
  Scroll = 1,
  Off = 2,
  Volume = 3,
  Brightness = 4,
  Zoom = 5,
  Browser = 6,
}

export const TP_ROLE_MAX = TpRole.Browser;

export const TP_ROLE_LABELS: Record<TpRole, string> = {
  [TpRole.Move]: "カーソル移動（Move）",
  [TpRole.Scroll]: "スクロール（Scroll）",
  [TpRole.Off]: "無効（Off）",
  [TpRole.Volume]: "音量（Volume）",
  [TpRole.Brightness]: "輝度（Brightness）",
  [TpRole.Zoom]: "ズーム（Zoom）",
  [TpRole.Browser]: "ブラウザ 進む/戻る（Browser）",
};

/** Stable device ids (see DESIGN-trackpad §2). */
export enum TpDeviceId {
  LeftPad = 0,
  RightExtPad = 1,
}

export const TP_DEVICE_LABELS: Record<number, string> = {
  [TpDeviceId.LeftPad]: "左パッド",
  [TpDeviceId.RightExtPad]: "右パッド (ext)",
};

export interface TpAxisCfg {
  role: TpRole;
  reverse: boolean;
  step: number; // 1..32 (speed divisor / encoder threshold; bigger = slower)
}

export interface TpLayerCfg {
  x: TpAxisCfg;
  y: TpAxisCfg;
}

export interface TpDeviceCfg {
  deviceId: number;
  layers: TpLayerCfg[];
}

export interface TpConfig {
  devices: TpDeviceCfg[];
  layerCount: number;
}

const clampStep = (s: number) =>
  Math.max(TP_STEP_MIN, Math.min(TP_STEP_MAX, Math.trunc(s) || TP_STEP_MIN));

function roleOf(v: number): TpRole {
  return v >= TpRole.Move && v <= TP_ROLE_MAX ? (v as TpRole) : TpRole.Move; // unknown => Move
}

/** Expected total wire length for a given device/layer count. */
export function tpWireLen(deviceCount: number, layerCount: number): number {
  return TP_HDR + deviceCount * (TP_DEV_HDR + layerCount * TP_LAYER);
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
  if (version !== TP_VERSION) {
    throw new Error(`Unsupported trackpad config version ${version} (expected ${TP_VERSION})`);
  }
  const deviceCount = dv.getUint8(3);
  const layerCount = dv.getUint8(4);
  const expected = tpWireLen(deviceCount, layerCount);
  if (bytes.length !== expected) {
    throw new Error(`Bad trackpad config length ${bytes.length} (expected ${expected})`);
  }

  const readAxis = (o: number): TpAxisCfg => ({
    role: roleOf(dv.getUint8(o)),
    reverse: dv.getUint8(o + 1) !== 0,
    step: dv.getUint8(o + 2),
  });

  const devices: TpDeviceCfg[] = [];
  let o = TP_HDR;
  for (let d = 0; d < deviceCount; d++) {
    const deviceId = dv.getUint8(o);
    o += TP_DEV_HDR;
    const layers: TpLayerCfg[] = [];
    for (let i = 0; i < layerCount; i++) {
      layers.push({ x: readAxis(o), y: readAxis(o + 3) });
      o += TP_LAYER;
    }
    devices.push({ deviceId, layers });
  }
  return { devices, layerCount };
}

export function encodeTp(cfg: TpConfig): Uint8Array {
  const deviceCount = cfg.devices.length;
  const buf = new Uint8Array(tpWireLen(deviceCount, cfg.layerCount));
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, TP_MAGIC, true);
  dv.setUint8(2, TP_VERSION);
  dv.setUint8(3, deviceCount & 0xff);
  dv.setUint8(4, cfg.layerCount & 0xff);

  const writeAxis = (o: number, a: TpAxisCfg) => {
    dv.setUint8(o, a.role & 0xff);
    dv.setUint8(o + 1, a.reverse ? 1 : 0);
    dv.setUint8(o + 2, clampStep(a.step));
  };

  let o = TP_HDR;
  for (const dev of cfg.devices) {
    dv.setUint8(o, dev.deviceId & 0xff);
    o += TP_DEV_HDR;
    for (let i = 0; i < cfg.layerCount; i++) {
      const l = dev.layers[i] ?? {
        x: { role: TpRole.Move, reverse: false, step: 1 },
        y: { role: TpRole.Move, reverse: false, step: 1 },
      };
      writeAxis(o, l.x);
      writeAxis(o + 3, l.y);
      o += TP_LAYER;
    }
  }
  return buf;
}
