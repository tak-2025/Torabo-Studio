import type { Meta, StoryObj } from "@storybook/react";
import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

import { EncoderSettings, emptyEncConfig, volumeEncConfig } from "./EncoderSettings";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { EncBehavior, EncConfig, EncMod, HID, bind, encodeEnc } from "./encConfig";

/**
 * The encoder panel without an encoder: the Tauri bridge is stubbed, so ① 読み込む
 * decodes a real wire built by the same codec the firmware talks. That exercises
 * the whole decode → edit → encode path, which is most of what can go wrong, and
 * lets the UI be finished before the hardware lands.
 *
 * Press ① 読み込む in a story to reveal the editor.
 */

/** Volume on rotate, mute on click — the firmware's own defaults. */
const SAMPLE_DEFAULTS: EncConfig = volumeEncConfig(4);

/** A config that uses every behavior kind, so each editor branch is visible. */
const SAMPLE_MIXED: EncConfig = {
  layers: [
    // layer 0: a preset pair (volume) + a plain key on the click
    {
      cw: bind(EncBehavior.Cp, HID.C_VOL_UP),
      ccw: bind(EncBehavior.Cp, HID.C_VOL_DN),
      btn: bind(EncBehavior.Cp, HID.C_PLAY_PAUSE),
    },
    // layer 1: zoom (a modified key pair) — shows the カスタム branch with mods
    {
      cw: bind(EncBehavior.Kp, HID.KC_EQUAL, EncMod.LCTL),
      ccw: bind(EncBehavior.Kp, HID.KC_MINUS, EncMod.LCTL),
      btn: bind(EncBehavior.Mo, 3),
    },
    // layer 2: arrow keys + a layer toggle on the click
    {
      cw: bind(EncBehavior.Kp, HID.KC_RIGHT),
      ccw: bind(EncBehavior.Kp, HID.KC_LEFT),
      btn: bind(EncBehavior.Tog, 2),
    },
    // layer 3: nothing assigned — rotation falls through to a lower layer
    { cw: bind(EncBehavior.None, 0), ccw: bind(EncBehavior.None, 0), btn: bind(EncBehavior.None, 0) },
  ],
};

/** Fresh keyboard: nothing assigned anywhere. */
const SAMPLE_EMPTY: EncConfig = emptyEncConfig(4);

function stubTauri(cfg: EncConfig) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === "encoder_read_config") {
        return Array.from(encodeEnc(cfg));
      }
      if (cmd === "encoder_write_config") {
        return undefined;
      }
      throw new Error(`storybook stub: unmocked command ${cmd}`);
    },
  };
}

/* Truthy conn so the panel passes its pre-connect gate. The keymap RPC then fails
 * fast against the dummy and the panel falls back to layer indices — which is the
 * path a real disconnected-mid-session user hits, so it is worth exercising. */
const dummyConn = {} as unknown as RpcConnection;

const withConfig = (cfg: EncConfig) => (Story: () => JSX.Element) => {
  stubTauri(cfg);
  return (
    <ConnectionContext.Provider value={{ conn: dummyConn }}>
      <Story />
    </ConnectionContext.Provider>
  );
};

const meta = {
  title: "Encoder/EncoderSettings",
  component: EncoderSettings,
  parameters: { layout: "fullscreen" },
  decorators: [withConfig(SAMPLE_DEFAULTS)],
} satisfies Meta<typeof EncoderSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Firmware defaults: volume on rotate, mute on click, on every layer. */
export const Defaults: Story = {};

/** One layer per behavior kind — preset pair, modified keys, layer behaviors, unassigned. */
export const Mixed: Story = {
  decorators: [withConfig(SAMPLE_MIXED)],
};

/** Nothing assigned: every dropdown sits on カスタム with なし. */
export const Empty: Story = {
  decorators: [withConfig(SAMPLE_EMPTY)],
};
