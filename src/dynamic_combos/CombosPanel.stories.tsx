import type { Meta, StoryObj } from "@storybook/react";

import { CombosPanel } from "./CombosPanel";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { mockRpcConnection, physicalLayoutsResponse } from "../rpc/mockConnection";
import layouts from "../keyboard/torabo-tsuki-layouts.json";
import {
  CB_MAGIC,
  CB_SLOTS,
  CB_VERSION,
  ComboSlot,
  ComboTarget,
  emptySlot,
  encodeSlot,
  makeKeycode,
} from "./comboConfig";

/**
 * The combo editor without a keyboard. Two fakes stand in for the hardware:
 * the Tauri bridge (① 読み込む decodes a full-wire READ built here, since the
 * codec only exports the single-slot WRITE) and the Studio RPC, which serves
 * the real torabo-tsuki geometry so the visual key picker has a board to draw.
 *
 * Press ① 読み込む, then 位置を選ぶ on a combo, to see the picker.
 */

const KB = 0x07 << 16; // Keyboard/Keypad usage page
const ESC = 0x29;

const combo = (patch: Partial<ComboSlot>): ComboSlot => ({
  ...emptySlot(),
  enabled: true,
  timeoutMs: 50,
  ...patch,
});

/** Positions are indices into the active layout's key list — the L layout here. */
const SAMPLE: ComboSlot[] = [
  // Two home-row neighbours for Escape, on every layer.
  combo({
    positions: [15, 16],
    targetType: ComboTarget.KeyPress,
    param1: makeKeycode(KB | ESC, 0),
    timeoutMs: 40,
  }),
  // Thumb pair holds the symbol layer while held.
  combo({
    positions: [30, 31],
    targetType: ComboTarget.MomentaryLayer,
    param1: 1,
    timeoutMs: 60,
    slowRelease: true,
  }),
  // Three keys fire macro slot 0, but only from the base layer.
  combo({
    positions: [8, 9, 10],
    targetType: ComboTarget.DynamicMacro,
    param1: 0,
    layerMask: 1 << 0,
    timeoutMs: 60,
    priorIdleMs: 120,
  }),
];

/** Build the full READ wire: magic, version, slot_count, then every 26-byte slot. */
function encodeCombosAll(slots: ComboSlot[]): Uint8Array {
  const WIRE_SLOT = 26;
  const buf = new Uint8Array(4 + CB_SLOTS * WIRE_SLOT);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, CB_MAGIC, true);
  dv.setUint8(2, CB_VERSION);
  dv.setUint8(3, CB_SLOTS);
  for (let k = 0; k < CB_SLOTS; k++) {
    // encodeSlot prepends the 2-byte WRITE header; the READ wire has none.
    buf.set(encodeSlot(k, slots[k] ?? emptySlot()).slice(2), 4 + k * WIRE_SLOT);
  }
  return buf;
}

function stubTauri(slots: ComboSlot[]) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === "combo_read_all") return Array.from(encodeCombosAll(slots));
      if (cmd === "combo_write_slot") return undefined;
      throw new Error(`storybook stub: unmocked command ${cmd}`);
    },
  };
}

/* Sample geometry only. On a real session the layout comes from the keyboard
 * over RPC; this bundled copy just gives the picker a board to draw, so the key
 * numbering here is illustrative rather than authoritative. */
const L_LAYOUT_INDEX = 2;

const conn = mockRpcConnection((req) =>
  (req as { keymap?: { getPhysicalLayouts?: boolean } }).keymap?.getPhysicalLayouts
    ? physicalLayoutsResponse(
        layouts as { name: string; keys: unknown[] }[],
        L_LAYOUT_INDEX
      )
    : null
);

const withSlots = (slots: ComboSlot[]) => (Story: () => JSX.Element) => {
  stubTauri(slots);
  return (
    <ConnectionContext.Provider value={{ conn }}>
      <Story />
    </ConnectionContext.Provider>
  );
};

const meta = {
  title: "Combos/CombosPanel",
  component: CombosPanel,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof CombosPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three registered combos, one of each interesting target kind. */
export const Loaded: Story = { decorators: [withSlots(SAMPLE)] };

/** A keyboard with no combos yet. */
export const Empty: Story = { decorators: [withSlots([])] };
