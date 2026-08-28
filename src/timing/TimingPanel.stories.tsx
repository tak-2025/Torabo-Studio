import type { Meta, StoryObj } from "@storybook/react";

import { TimingPanel } from "./TimingPanel";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { mockRpcConnection, physicalLayoutsResponse } from "../rpc/mockConnection";
import layouts from "../keyboard/torabo-tsuki-layouts.json";
import {
  HtNode,
  TimingConfig,
  applyHtPreset,
  emptyHtNode,
  encodeTiming,
} from "./timingConfig";

/**
 * Renders the LOADED state of the timing panel without hardware, same recipe
 * as TrackpadSettingsV2.stories.tsx / CombosPanel.stories.tsx:
 *  - a mocked Studio RPC connection answers keymap.getPhysicalLayouts with the
 *    real torabo-tsuki geometry, so the hold-trigger-key-positions picker has a
 *    board to draw;
 *  - the Tauri invoke bridge is stubbed so pressing "① 読み込む" decodes a
 *    realistic 96-byte sample wire (mt on the roll-safe preset with a
 *    positional override, lt on standard, 5/5ms debounce).
 *
 * Press "① 読み込む" in the story to reveal the full editor UI.
 */

const L_LAYOUT_INDEX = 2;

function sampleConfig(): TimingConfig {
  const mt = {
    ...applyHtPreset(HtNode.ModTap, emptyHtNode(), "roll-safe"),
    // A couple of opposite-hand positions, illustrating hold-trigger-key-positions.
    positions: [26, 27, 28],
  };
  const lt = applyHtPreset(HtNode.LayerTap, emptyHtNode(), "standard");
  return {
    htNodes: [mt, lt],
    debouncePressMs: 5,
    debounceReleaseMs: 5,
  };
}

function stubTauri(cfg: TimingConfig) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === "timing_read_config") return Array.from(encodeTiming(cfg));
      if (cmd === "timing_write_config") return undefined;
      throw new Error(`storybook stub: unmocked command ${cmd}`);
    },
  };
}

const conn = mockRpcConnection((req) =>
  (req as { keymap?: { getPhysicalLayouts?: boolean } }).keymap
    ?.getPhysicalLayouts
    ? physicalLayoutsResponse(
        layouts as { name: string; keys: unknown[] }[],
        L_LAYOUT_INDEX,
      )
    : null,
);

const withConfig = (cfg: TimingConfig) => (Story: () => JSX.Element) => {
  stubTauri(cfg);
  return (
    <ConnectionContext.Provider value={{ conn }}>
      <Story />
    </ConnectionContext.Provider>
  );
};

const meta = {
  title: "Timing/TimingPanel",
  component: TimingPanel,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [withConfig(sampleConfig())],
} satisfies Meta<typeof TimingPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** mt on ロール誤爆防止 (with a sample hold-trigger-key-positions set), lt on 標準. */
export const Loaded: Story = {};
