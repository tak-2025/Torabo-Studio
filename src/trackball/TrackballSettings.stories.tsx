import type { Meta, StoryObj } from "@storybook/react";

import { TrackballSettings } from "./TrackballSettings";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { keymapLayersResponse, mockRpcConnection } from "../rpc/mockConnection";
import { Role, ZtcConfig, encodeZtc } from "./ztcConfig";

/**
 * The trackball panel without a ball: the Tauri bridge is stubbed so ① 読み込む
 * decodes a wire built by the same codec the firmware talks, and the mock RPC
 * supplies layer names so the table reads like it does on a real keyboard.
 *
 * Press ① 読み込む in a story to reveal the editor.
 */

const LAYER_NAMES = ["Base", "Sym", "Num", "Mouse", "Fn", "BT"];

const axis = (role: Role, speedDiv: number, reverse = false) => ({
  role,
  reverse,
  speedDiv,
});

/** What a tuned keyboard looks like: pointer on base, scroll on the sym layer,
 * ball parked on the BT layer, and an auto-mouse layer that pops on movement. */
const SAMPLE: ZtcConfig = {
  tempTarget: 3,
  tempTimeoutMs: 800,
  layers: [
    { x: axis(Role.Move, 1), y: axis(Role.Move, 1), tempEnable: true },
    { x: axis(Role.Scroll, 8, true), y: axis(Role.Scroll, 8), tempEnable: false },
    { x: axis(Role.Move, 4), y: axis(Role.Move, 4), tempEnable: false },
    { x: axis(Role.Move, 1), y: axis(Role.Move, 1), tempEnable: false },
    { x: axis(Role.Move, 2), y: axis(Role.Move, 2), tempEnable: false },
    { x: axis(Role.Off, 1), y: axis(Role.Off, 1), tempEnable: false },
  ],
};

function stubTauri(cfg: ZtcConfig) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === "trackball_read_config") return Array.from(encodeZtc(cfg));
      if (cmd === "trackball_write_config") return undefined;
      throw new Error(`storybook stub: unmocked command ${cmd}`);
    },
  };
}

const conn = mockRpcConnection((req) =>
  (req as { keymap?: { getKeymap?: boolean } }).keymap?.getKeymap
    ? keymapLayersResponse(LAYER_NAMES)
    : null
);

const withConfig = (cfg: ZtcConfig) => (Story: () => JSX.Element) => {
  stubTauri(cfg);
  return (
    <ConnectionContext.Provider value={{ conn }}>
      <Story />
    </ConnectionContext.Provider>
  );
};

const meta = {
  title: "Trackball/TrackballSettings",
  component: TrackballSettings,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof TrackballSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = { decorators: [withConfig(SAMPLE)] };
