/**
 * The firmware's self-description. MUST match
 * torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h.
 *
 * A torabo build is assembled from snippets, so two keyboards running this app can
 * have completely different feature sets — one has an encoder, one doesn't; one has
 * LEDs on both halves, one on neither. And as firmware moves on, a wire format can
 * gain fields the app must know about BEFORE it writes.
 *
 * So we don't guess. On connect the firmware tells us its version, which feature
 * modules were compiled in, each one's wire version, and per-feature capability
 * bits, and the UI shows only what this keyboard can actually do.
 *
 *   header (8B): magic u16 "TC" | descVer u8 | major u8 | minor u8 | patch u8 |
 *                featureCount u8 | _rsv u8
 *   per feature (4B): id u8 | wireVer u8 | caps u16
 *
 * Firmware without the service is "pre-capabilities": we get null and fall back to
 * showing everything, exactly as the app behaved before this existed. Never break
 * an older keyboard just because it can't introduce itself.
 */

export const CAPS_MAGIC = 0x4354; // "TC"
export const CAPS_DESC_VERSION = 1;
export const CAPS_HDR = 8;
export const CAPS_FEAT = 4;

/** Stable ids — never renumbered, append only. */
export const Feature = {
  Trackball: 1,
  Macros: 2,
  Combos: 3,
  Trackpad: 4,
  Encoder: 5,
  Led: 6,
  ReservedLayers: 7,
} as const;
export type Feature = (typeof Feature)[keyof typeof Feature];

/** Per-feature capability bits. Meaning is feature-specific. */
export const LedCap = { Left: 0x0001, Right: 0x0002, CentralIsLeft: 0x0004 } as const;

/** The wire versions THIS app knows how to speak. If the firmware reports a higher
 * one, its config has fields we'd drop on write — so we refuse to write rather than
 * silently damage it, and tell the user to update the app. */
export const SUPPORTED_WIRE: Partial<Record<Feature, number>> = {
  [Feature.Trackpad]: 2,
  [Feature.Encoder]: 1,
  [Feature.Led]: 1,
};

export interface FeatureInfo {
  id: Feature;
  wireVer: number;
  caps: number;
}

export interface ToraboCaps {
  descVersion: number;
  fw: { major: number; minor: number; patch: number };
  features: FeatureInfo[];
}

export function decodeCaps(buf: Uint8Array): ToraboCaps {
  if (buf.length < CAPS_HDR) {
    throw new Error(`capability descriptor too short (${buf.length} B)`);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== CAPS_MAGIC) {
    throw new Error(`capability descriptor: bad magic 0x${magic.toString(16)}`);
  }
  const descVersion = dv.getUint8(2);
  const fw = { major: dv.getUint8(3), minor: dv.getUint8(4), patch: dv.getUint8(5) };
  const count = dv.getUint8(6);

  const need = CAPS_HDR + count * CAPS_FEAT;
  if (buf.length < need) {
    throw new Error(`capability descriptor truncated: ${buf.length} B, need ${need}`);
  }

  const features: FeatureInfo[] = [];
  let o = CAPS_HDR;
  for (let i = 0; i < count; i++) {
    features.push({
      id: dv.getUint8(o) as Feature,
      wireVer: dv.getUint8(o + 1),
      caps: dv.getUint16(o + 2, true),
    });
    o += CAPS_FEAT;
  }
  return { descVersion, fw, features };
}

/* --------------------------------------------------------------------------
 * Queries. All of them take `caps | null`, where null means "this firmware
 * can't introduce itself" — in which case we assume the feature MIGHT be there
 * and let the actual read fail, which is how the app behaved before.
 * ----------------------------------------------------------------------- */

export function hasFeature(caps: ToraboCaps | null, id: Feature): boolean {
  if (!caps) return true; // pre-capabilities firmware: don't hide anything
  return caps.features.some((f) => f.id === id);
}

export function featureInfo(caps: ToraboCaps | null, id: Feature): FeatureInfo | null {
  if (!caps) return null;
  return caps.features.find((f) => f.id === id) ?? null;
}

/** The firmware speaks a newer wire than we do: writing would drop the fields we
 * don't know about, so the caller should go read-only and say so. */
export function wireTooNew(caps: ToraboCaps | null, id: Feature): boolean {
  const f = featureInfo(caps, id);
  const known = SUPPORTED_WIRE[id];
  if (!f || known === undefined) return false;
  return f.wireVer > known;
}

export function fwVersionString(caps: ToraboCaps | null): string {
  if (!caps) return "不明（この機能を持たない古いファームウェア）";
  const { major, minor, patch } = caps.fw;
  return `${major}.${minor}.${patch}`;
}

/** Which halves actually have an LED. Empty => hide the LED tab entirely. */
export function ledSides(caps: ToraboCaps | null): { left: boolean; right: boolean } {
  const f = featureInfo(caps, Feature.Led);
  if (!f) return { left: false, right: false };
  return {
    left: (f.caps & LedCap.Left) !== 0,
    right: (f.caps & LedCap.Right) !== 0,
  };
}
