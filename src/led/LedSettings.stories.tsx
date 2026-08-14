import type { Meta, StoryObj } from "@storybook/react";
import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

import { LedSettings, sampleLedConfig } from "./LedSettings";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LedCap } from "../caps/toraboCaps";
import { LedConfig, encodeLed } from "./ledConfig";

/**
 * The LED rule table without an extender board attached. The Tauri bridge is
 * stubbed, so ① 読み込む decodes a wire built by the same codec the firmware
 * talks — which exercises the whole decode → edit → encode path.
 *
 * `caps` is the firmware's to state, and it decides which halves get a rule
 * list: BothSides shows left and right, RightOnly shows just the right.
 */

const BOTH = LedCap.Left | LedCap.Right;

function stubTauri(cfg: LedConfig) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === "led_read_config") return Array.from(encodeLed(cfg));
      if (cmd === "led_write_config") return undefined;
      throw new Error(`storybook stub: unmocked command ${cmd}`);
    },
  };
}

/* The panel only gates on `conn` being truthy — it asks the keyboard nothing
 * else — so a bare dummy is enough here. */
const dummyConn = {} as unknown as RpcConnection;

const withConfig = (cfg: LedConfig) => (Story: () => JSX.Element) => {
  stubTauri(cfg);
  return (
    <ConnectionContext.Provider value={{ conn: dummyConn }}>
      <Story />
    </ConnectionContext.Provider>
  );
};

const meta = {
  title: "LED/LedSettings",
  component: LedSettings,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof LedSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** LEDs on both halves — the full rule table. */
export const BothSides: Story = { decorators: [withConfig(sampleLedConfig(BOTH))] };

/** Only the right half has an extender LED, so only that list is offered. */
export const RightOnly: Story = {
  decorators: [
    withConfig({
      ...sampleLedConfig(LedCap.Right),
      sides: [[], sampleLedConfig(BOTH).sides[1]],
    }),
  ],
};
