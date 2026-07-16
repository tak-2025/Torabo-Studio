import type { Meta, StoryObj } from "@storybook/react";
import { TrackpadSettingsV2 } from "./TrackpadSettingsV2";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import {
  TpBehavior,
  TpBinding,
  TpConfig,
  TpRole,
  TpSide,
  TpConn,
  TpKind,
  NONE_BIND,
  HID,
  encodeTp,
  encodeMeta,
} from "./tpConfigV2";

/**
 * Renders the LOADED state of the v2 trackpad panel without hardware:
 * - ConnectionContext gets a dummy conn (truthy) so the panel passes its
 *   pre-connect gate. The keymap.getKeymap RPC then fails fast on the dummy
 *   and is caught by the panel (layer names fall back to indices) — that
 *   fallback path is exactly what we want the story to exercise.
 * - The Tauri invoke bridge is stubbed via window.__TAURI_INTERNALS__ so
 *   pressing ① 読み込む decodes a realistic sample wire (2 devices, 4 layers,
 *   gestures, one volume preset, one custom encoder, taps bound).
 * Press ① 読み込む in the story to reveal the full editor UI.
 */

const bind = (behavior: TpBehavior, param: number, mods = 0): TpBinding => ({
  behavior,
  mods,
  param,
});
const noneGestures = () => ({
  tap: { ...NONE_BIND },
  tap2: { ...NONE_BIND },
  hold: { ...NONE_BIND },
  dtap: { ...NONE_BIND },
});
const moveAxis = () => ({
  role: TpRole.Move,
  reverse: false,
  step: 1,
  pos: { ...NONE_BIND },
  neg: { ...NONE_BIND },
});

function sampleLayers() {
  const l0 = { x: moveAxis(), y: moveAxis(), gestures: noneGestures() };
  const l1 = {
    x: moveAxis(),
    y: moveAxis(),
    gestures: {
      ...noneGestures(),
      tap: bind(TpBehavior.Kp, 0x28), // Enter
      dtap: bind(TpBehavior.Cp, HID.C_VOL_UP),
    },
  };
  const l2 = {
    x: { ...moveAxis(), role: TpRole.Scroll, reverse: true, step: 8 },
    y: { ...moveAxis(), role: TpRole.Off },
    gestures: noneGestures(),
  };
  const l3 = {
    x: { ...moveAxis(), role: TpRole.Off },
    y: {
      role: TpRole.Encoder,
      reverse: false,
      step: 10,
      pos: bind(TpBehavior.Cp, HID.C_VOL_UP), // = 音量 preset pair
      neg: bind(TpBehavior.Cp, HID.C_VOL_DN),
    },
    gestures: noneGestures(),
  };
  return [l0, l1, l2, l3];
}

/* Device identity now travels on the wire, so the device dropdown reflects the
 * actual hardware pattern instead of assuming the default build. These stories
 * stand in for hardware we can't plug in: each one pins a different pattern and
 * shows the labels the app derives from it. */
const devMeta = (side: TpSide, conn: TpConn, kind: TpKind) => encodeMeta({ side, conn, kind });

/** Default build: peripheral pad on the left half, extender pad on the right. */
const SAMPLE: TpConfig = {
  layerCount: 4,
  hasGestures: true,
  devices: [
    {
      deviceId: 0,
      meta: devMeta(TpSide.Left, TpConn.Standard, TpKind.Trackpad),
      layers: sampleLayers(),
    },
    {
      deviceId: 1,
      meta: devMeta(TpSide.Right, TpConn.Extension, TpKind.Trackpad),
      layers: sampleLayers(),
    },
  ],
};

/** Left half's pad moved onto its extender (the build we just shipped). */
const SAMPLE_LEFT_EXT: TpConfig = {
  layerCount: 4,
  hasGestures: true,
  devices: [
    {
      deviceId: 0,
      meta: devMeta(TpSide.Left, TpConn.Extension, TpKind.Trackpad),
      layers: sampleLayers(),
    },
    {
      deviceId: 1,
      meta: devMeta(TpSide.Right, TpConn.Extension, TpKind.Trackpad),
      layers: sampleLayers(),
    },
  ],
};

/** Central on the left half — the case the old hardcoded labels got backwards. */
const SAMPLE_CENTRAL_LEFT: TpConfig = {
  layerCount: 4,
  hasGestures: true,
  devices: [
    {
      deviceId: 0,
      meta: devMeta(TpSide.Right, TpConn.Standard, TpKind.Trackpad),
      layers: sampleLayers(),
    },
    {
      deviceId: 1,
      meta: devMeta(TpSide.Left, TpConn.Extension, TpKind.Trackpad),
      layers: sampleLayers(),
    },
  ],
};

/** Firmware older than the meta byte: everything unknown, labels degrade. */
const SAMPLE_LEGACY: TpConfig = {
  layerCount: 4,
  hasGestures: true,
  devices: [
    { deviceId: 0, meta: 0, layers: sampleLayers() },
    { deviceId: 1, meta: 0, layers: sampleLayers() },
  ],
};

/** Stub the Tauri v2 invoke bridge (window.__TAURI_INTERNALS__.invoke). */
function stubTauri(cfg: TpConfig) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === "trackpad_read_config") {
        return Array.from(encodeTp(cfg));
      }
      if (cmd === "trackpad_write_config") {
        return undefined;
      }
      throw new Error(`storybook stub: unmocked command ${cmd}`);
    },
  };
}

const dummyConn = {} as unknown as RpcConnection;

/** Serve one hardware pattern's wire to the panel. */
const withConfig = (cfg: TpConfig) => (Story: () => JSX.Element) => {
  stubTauri(cfg);
  return (
    <ConnectionContext.Provider value={{ conn: dummyConn }}>
      <Story />
    </ConnectionContext.Provider>
  );
};

const meta = {
  title: "Trackpad/TrackpadSettingsV2",
  component: TrackpadSettingsV2,
  parameters: { layout: "fullscreen" },
  decorators: [withConfig(SAMPLE)],
} satisfies Meta<typeof TrackpadSettingsV2>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Connected; press ① 読み込む to load the sample config and show the editor. */
export const Loaded: Story = {};

/* The stories below differ only in the hardware pattern the stubbed firmware
 * reports. Press ① 読み込む and check the device dropdown: the labels are derived
 * from the wire, so the panel needs no knowledge of the build. */

/** Left pad on the extender — the build we just shipped. */
export const LeftPadOnExtender: Story = {
  decorators: [withConfig(SAMPLE_LEFT_EXT)],
};

/** Central on the left half. The old hardcoded labels called device 0 "左パッド"; it is the right one. */
export const CentralOnLeft: Story = {
  decorators: [withConfig(SAMPLE_CENTRAL_LEFT)],
};

/** Firmware predating the meta byte: labels fall back to "デバイス N" rather than lying. */
export const LegacyFirmware: Story = {
  decorators: [withConfig(SAMPLE_LEGACY)],
};
