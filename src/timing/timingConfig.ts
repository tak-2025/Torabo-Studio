/**
 * Codec for the timing config wire. MUST match the firmware
 * (torabo-tsuki_ext_FW timing/include/zmk_timing_config/config.h) and the spec
 * torabo-tsuki_ext_FW/docs/DESIGN-timing.md. Little-endian, 96 bytes fixed —
 * unlike macros/combos this wire has no per-record walk, so a short or
 * oversized buffer is rejected outright (exactLength guard) rather than
 * half-decoded.
 *
 *   header (8B):
 *     0    u8  version = 1
 *     1    u8  ht_node_count = 2
 *     2    u8  ht_pos_slots = 32
 *     3    u8  debounce_press_ms    (clamp 1..100)
 *     4    u8  debounce_release_ms  (clamp 1..100)
 *     5-7  reserved = 0
 *
 *   ht block x 2 (44B each) — block0 = mt (mod_tap), block1 = lt (layer_tap):
 *     +0   u16 tapping_term_ms       (clamp 10..2000)
 *     +2   u16 quick_tap_ms          (0xFFFF = disabled -> -1)
 *     +4   u16 require_prior_idle_ms (0xFFFF = disabled -> -1)
 *     +6   u8  flavor  (0=hold-preferred,1=balanced,2=tap-preferred,3=tap-unless-interrupted)
 *     +7   u8  flags   (bit0=retro-tap, bit1=hold-trigger-on-release, bit2=hold-while-undecided)
 *     +8   u8  pos_count (0 = positional disabled; <=32)
 *     +9   u8  reserved
 *     +10  u8[32] positions (key positions; unused slots = 0)
 *     +42  u16 reserved
 *
 * READ always returns the current effective value (DT default until the first
 * WRITE). WRITE replaces the whole 96B blob — always Read before Save.
 */

export const TMG_WIRE_LEN = 96;
export const TMG_VERSION = 1;
export const TMG_HT_NODE_COUNT = 2;
export const TMG_HT_POS_SLOTS = 32;

const W_VERSION = 0;
const W_HT_NODE_COUNT = 1;
const W_HT_POS_SLOTS = 2;
const W_DEBOUNCE_PRESS = 3;
const W_DEBOUNCE_RELEASE = 4;
const HDR = 8;
const HT_BLOCK = 44;

const HB_TAPPING_TERM = 0;
const HB_QUICK_TAP = 2;
const HB_PRIOR_IDLE = 4;
const HB_FLAVOR = 6;
const HB_FLAGS = 7;
const HB_POS_COUNT = 8;
const HB_POSITIONS = 10;

/** Wire sentinel for "unset" on the two optional u16 fields. */
const DISABLED_U16 = 0xffff;

export const HtFlag = {
  RetroTap: 0x01,
  HoldTriggerOnRelease: 0x02,
  HoldWhileUndecided: 0x04,
} as const;

export const HtFlavor = {
  HoldPreferred: 0,
  Balanced: 1,
  TapPreferred: 2,
  TapUnlessInterrupted: 3,
} as const;
export type HtFlavor = (typeof HtFlavor)[keyof typeof HtFlavor];
export const HT_FLAVOR_MAX = HtFlavor.TapUnlessInterrupted;

export const HT_FLAVOR_LABELS: Record<HtFlavor, string> = {
  [HtFlavor.HoldPreferred]: "ホールド優先（hold-preferred）",
  [HtFlavor.Balanced]: "バランス（balanced）",
  [HtFlavor.TapPreferred]: "タップ優先（tap-preferred）",
  [HtFlavor.TapUnlessInterrupted]: "妨害されなければタップ（tap-unless-interrupted）",
};

/**
 * Which wire block a node is — fixed by the firmware (DESIGN-timing.md:
 * block0 = mt / mod_tap, block1 = lt / layer_tap). Every keymap binding that
 * uses &mt (resp. &lt) shares this one setting; it is not per-key.
 */
export const HtNode = { ModTap: 0, LayerTap: 1 } as const;
export type HtNode = (typeof HtNode)[keyof typeof HtNode];

export const HT_NODE_LABELS: Record<HtNode, string> = {
  [HtNode.ModTap]: "mt（Mod-Tap）",
  [HtNode.LayerTap]: "lt（Layer-Tap）",
};

export interface HtNodeCfg {
  tappingTermMs: number;
  /** -1 = disabled (wire 0xFFFF). */
  quickTapMs: number;
  /** -1 = disabled (wire 0xFFFF). */
  requirePriorIdleMs: number;
  flavor: HtFlavor;
  retroTap: boolean;
  holdTriggerOnRelease: boolean;
  holdWhileUndecided: boolean;
  /** Key positions gating the hold decision (hold-trigger-key-positions).
   *  Empty = positional disabled. Up to TMG_HT_POS_SLOTS entries. */
  positions: number[];
}

export interface TimingConfig {
  /** Exactly TMG_HT_NODE_COUNT entries, indexed by HtNode. */
  htNodes: HtNodeCfg[];
  debouncePressMs: number;
  debounceReleaseMs: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

/** A clean node with no positional/optional settings — NOT a "standard" value
 * by itself; callers that want the DT-verified default use HT_PRESETS below. */
export function emptyHtNode(): HtNodeCfg {
  return {
    tappingTermMs: 200,
    quickTapMs: -1,
    requirePriorIdleMs: -1,
    flavor: HtFlavor.HoldPreferred,
    retroTap: false,
    holdTriggerOnRelease: false,
    holdWhileUndecided: false,
    positions: [],
  };
}

export function decodeTiming(buf: Uint8Array): TimingConfig {
  if (buf.length !== TMG_WIRE_LEN) {
    throw new Error(
      `timing config: expected ${TMG_WIRE_LEN} bytes, got ${buf.length}`,
    );
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = dv.getUint8(W_VERSION);
  if (version !== TMG_VERSION) {
    throw new Error(`timing config: unsupported version ${version}`);
  }
  const nodeCount = dv.getUint8(W_HT_NODE_COUNT);
  const posSlots = Math.min(dv.getUint8(W_HT_POS_SLOTS) || TMG_HT_POS_SLOTS, TMG_HT_POS_SLOTS);

  const htNodes: HtNodeCfg[] = [];
  for (let n = 0; n < Math.min(nodeCount, TMG_HT_NODE_COUNT); n++) {
    const base = HDR + n * HT_BLOCK;
    const quickTapRaw = dv.getUint16(base + HB_QUICK_TAP, true);
    const idleRaw = dv.getUint16(base + HB_PRIOR_IDLE, true);
    const flags = dv.getUint8(base + HB_FLAGS);
    const posCount = Math.min(dv.getUint8(base + HB_POS_COUNT), posSlots);
    const positions: number[] = [];
    for (let i = 0; i < posCount; i++) {
      positions.push(dv.getUint8(base + HB_POSITIONS + i));
    }
    const rawFlavor = dv.getUint8(base + HB_FLAVOR);
    htNodes.push({
      tappingTermMs: dv.getUint16(base + HB_TAPPING_TERM, true),
      quickTapMs: quickTapRaw === DISABLED_U16 ? -1 : quickTapRaw,
      requirePriorIdleMs: idleRaw === DISABLED_U16 ? -1 : idleRaw,
      flavor: (rawFlavor <= HT_FLAVOR_MAX
        ? rawFlavor
        : HtFlavor.HoldPreferred) as HtFlavor,
      retroTap: (flags & HtFlag.RetroTap) !== 0,
      holdTriggerOnRelease: (flags & HtFlag.HoldTriggerOnRelease) !== 0,
      holdWhileUndecided: (flags & HtFlag.HoldWhileUndecided) !== 0,
      positions,
    });
  }
  while (htNodes.length < TMG_HT_NODE_COUNT) htNodes.push(emptyHtNode());

  return {
    htNodes,
    debouncePressMs: dv.getUint8(W_DEBOUNCE_PRESS),
    debounceReleaseMs: dv.getUint8(W_DEBOUNCE_RELEASE),
  };
}

export function encodeTiming(cfg: TimingConfig): Uint8Array {
  const buf = new Uint8Array(TMG_WIRE_LEN);
  const dv = new DataView(buf.buffer);

  dv.setUint8(W_VERSION, TMG_VERSION);
  dv.setUint8(W_HT_NODE_COUNT, TMG_HT_NODE_COUNT);
  dv.setUint8(W_HT_POS_SLOTS, TMG_HT_POS_SLOTS);
  dv.setUint8(W_DEBOUNCE_PRESS, clamp(cfg.debouncePressMs, 1, 100));
  dv.setUint8(W_DEBOUNCE_RELEASE, clamp(cfg.debounceReleaseMs, 1, 100));

  for (let n = 0; n < TMG_HT_NODE_COUNT; n++) {
    const node = cfg.htNodes[n] ?? emptyHtNode();
    const base = HDR + n * HT_BLOCK;
    dv.setUint16(base + HB_TAPPING_TERM, clamp(node.tappingTermMs, 10, 2000), true);
    dv.setUint16(
      base + HB_QUICK_TAP,
      node.quickTapMs < 0
        ? DISABLED_U16
        : clamp(node.quickTapMs, 0, DISABLED_U16 - 1),
      true,
    );
    dv.setUint16(
      base + HB_PRIOR_IDLE,
      node.requirePriorIdleMs < 0
        ? DISABLED_U16
        : clamp(node.requirePriorIdleMs, 0, DISABLED_U16 - 1),
      true,
    );
    dv.setUint8(base + HB_FLAVOR, node.flavor & 0xff);
    let flags = 0;
    if (node.retroTap) flags |= HtFlag.RetroTap;
    if (node.holdTriggerOnRelease) flags |= HtFlag.HoldTriggerOnRelease;
    if (node.holdWhileUndecided) flags |= HtFlag.HoldWhileUndecided;
    dv.setUint8(base + HB_FLAGS, flags);
    const positions = node.positions.slice(0, TMG_HT_POS_SLOTS);
    dv.setUint8(base + HB_POS_COUNT, positions.length);
    for (let i = 0; i < positions.length; i++) {
      dv.setUint8(base + HB_POSITIONS + i, positions[i] & 0xff);
    }
    // Remaining position bytes and the trailing u16 reserved stay zero.
  }
  return buf;
}

/* --------------------------------------------------------------------------
 * Presets.
 *
 * "標準" (standard) is the DT-verified default: it must equal the actual
 * `flavor` / `tapping-term-ms` baked into
 * torabo-tsuki-config/.zmk-workspace/zmk/app/dts/behaviors/{mod_tap,layer_tap}.dtsi
 * (mt: flavor="hold-preferred", tapping-term-ms=200; lt: flavor="tap-preferred",
 * tapping-term-ms=200 — neither dtsi sets quick-tap-ms or require-prior-idle-ms,
 * which is how ZMK's own driver default is "disabled" for both).
 *
 * "ロール誤爆防止" and "ホームロウモッド" are NOT sourced from the DT — there is
 * no firmware-side default for them. They are opinionated UI starting points
 * following common ZMK community guidance (require-prior-idle-ms to stop a fast
 * typing roll from landing on a hold; the home-row-mods figures follow the
 * widely published urob-style tapping-term/quick-tap/require-prior-idle trio).
 * Treat them as editable suggestions, not verified facts.
 * ----------------------------------------------------------------------- */


type PresetFields = Pick<
  HtNodeCfg,
  | "tappingTermMs"
  | "flavor"
  | "quickTapMs"
  | "requirePriorIdleMs"
  | "retroTap"
  | "holdTriggerOnRelease"
>;

export interface HtPreset {
  id: string;
  labelJa: string;
  labelEn: string;
  mt: PresetFields;
  lt: PresetFields;
}

export const HT_PRESETS: HtPreset[] = [
  {
    id: "standard",
    labelJa: "標準",
    labelEn: "Standard",
    mt: {
      tappingTermMs: 200,
      flavor: HtFlavor.HoldPreferred,
      quickTapMs: -1,
      requirePriorIdleMs: -1,
      retroTap: false,
      holdTriggerOnRelease: false,
    },
    lt: {
      tappingTermMs: 200,
      flavor: HtFlavor.TapPreferred,
      quickTapMs: -1,
      requirePriorIdleMs: -1,
      retroTap: false,
      holdTriggerOnRelease: false,
    },
  },
  {
    id: "roll-safe",
    labelJa: "ロール誤爆防止",
    labelEn: "Roll-safe",
    mt: {
      tappingTermMs: 200,
      flavor: HtFlavor.TapPreferred,
      quickTapMs: -1,
      requirePriorIdleMs: 125,
      retroTap: false,
      holdTriggerOnRelease: true,
    },
    lt: {
      tappingTermMs: 200,
      flavor: HtFlavor.TapPreferred,
      quickTapMs: -1,
      requirePriorIdleMs: 125,
      retroTap: false,
      holdTriggerOnRelease: true,
    },
  },
  {
    id: "home-row-mods",
    labelJa: "ホームロウモッド",
    labelEn: "Home row mods",
    mt: {
      tappingTermMs: 280,
      flavor: HtFlavor.Balanced,
      quickTapMs: 175,
      requirePriorIdleMs: 150,
      retroTap: false,
      holdTriggerOnRelease: true,
    },
    lt: {
      tappingTermMs: 200,
      flavor: HtFlavor.TapPreferred,
      quickTapMs: -1,
      requirePriorIdleMs: -1,
      retroTap: false,
      holdTriggerOnRelease: false,
    },
  },
];

const samePresetFields = (a: PresetFields, b: PresetFields) =>
  a.tappingTermMs === b.tappingTermMs &&
  a.flavor === b.flavor &&
  a.quickTapMs === b.quickTapMs &&
  a.requirePriorIdleMs === b.requirePriorIdleMs &&
  a.retroTap === b.retroTap &&
  a.holdTriggerOnRelease === b.holdTriggerOnRelease;

/** Which preset (if any) a node's tunable fields currently match. Positions and
 * hold-while-undecided are deliberately excluded — they are per-keyboard
 * positional tuning, orthogonal to which "feel" preset is selected. */
export function matchHtPreset(node: HtNode, cfg: HtNodeCfg): string | null {
  const hit = HT_PRESETS.find((p) =>
    samePresetFields(node === HtNode.ModTap ? p.mt : p.lt, cfg),
  );
  return hit ? hit.id : null;
}

/** Apply a preset's fields onto a node, keeping its positions/hold-while-undecided. */
export function applyHtPreset(
  node: HtNode,
  cfg: HtNodeCfg,
  presetId: string,
): HtNodeCfg {
  const preset = HT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return cfg;
  const fields = node === HtNode.ModTap ? preset.mt : preset.lt;
  return { ...cfg, ...fields };
}

/** A full config seeded from the "標準" preset — used before the first Read
 * only as a type-safe placeholder; the panel always prefers real wire data. */
export function standardTimingConfig(): TimingConfig {
  return {
    htNodes: [
      applyHtPreset(HtNode.ModTap, emptyHtNode(), "standard"),
      applyHtPreset(HtNode.LayerTap, emptyHtNode(), "standard"),
    ],
    debouncePressMs: 5,
    debounceReleaseMs: 5,
  };
}
