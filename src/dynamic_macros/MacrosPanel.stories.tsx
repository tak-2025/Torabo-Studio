import type { Meta, StoryObj } from "@storybook/react";
import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

import { MacrosPanel } from "./MacrosPanel";
import { ConnectionContext } from "../rpc/ConnectionContext";
import {
  DM_MAGIC,
  DM_NAME_MAX,
  DM_SLOTS,
  DM_STEPS,
  DM_VERSION_V1,
  DM_VERSION_V2,
  DmAction,
  DmStep,
  MOD_LCTL,
  MOD_LSFT,
  makeKeycode,
} from "./dmacConfig";
import { MacroNamesProvider } from "./MacroNamesContext";
import { CAPS_DESC_VERSION, Feature, ToraboCaps } from "../caps/toraboCaps";

/**
 * The macro editor without a keyboard: the Tauri bridge is stubbed so ① 読み込む
 * decodes a full-wire READ built here by hand (the codec only exports the
 * single-slot WRITE encoder, since that is all the app ever sends).
 *
 * Press ① 読み込む in a story to reveal the slots.
 */

const KB = 0x07 << 16; // Keyboard/Keypad usage page
const key = (id: number, mods = 0) => makeKeycode(KB | id, mods);

const tap = (id: number, mods = 0): DmStep => ({
  action: DmAction.Tap,
  keycode: key(id, mods),
});
const press = (id: number): DmStep => ({ action: DmAction.Press, keycode: key(id) });
const release = (id: number): DmStep => ({
  action: DmAction.Release,
  keycode: key(id),
});

/* Keyboard/Keypad usage ids used below. */
const A = 0x04, G = 0x0a, I = 0x0c, S = 0x16, T = 0x17, U = 0x18, V = 0x19;
const SPACE = 0x2c, ENTER = 0x28, TAB = 0x2b, LALT = 0xe2;

/** Type `git status` and run it — the shape most macros end up being. */
const GIT_STATUS: DmStep[] = [
  tap(G), tap(I), tap(T), tap(SPACE),
  tap(S), tap(T), tap(A), tap(T), tap(U), tap(S),
  tap(ENTER),
];

/** A single chord: paste-without-formatting. */
const PASTE_PLAIN: DmStep[] = [tap(V, MOD_LCTL | MOD_LSFT)];

/** Hold-and-tap, which needs the explicit press/release actions. */
const ALT_TAB: DmStep[] = [press(LALT), tap(TAB), tap(TAB), release(LALT)];

const SAMPLE: DmStep[][] = [GIT_STATUS, PASTE_PLAIN, ALT_TAB];

/**
 * Build the full READ wire: magic, version, slot_count, then every slot — and,
 * for v2, the appended name block (name_len u8 + name[16] per slot). See
 * dmacConfig.ts's header / PLAN-ext-fw-refactor.md フェーズ8.
 */
function encodeDmacAll(slots: DmStep[][], names?: string[]): Uint8Array {
  const STEP = 5; // action u8 + keycode u32
  const SLOT = 1 + DM_STEPS * STEP;
  const NAME = 1 + DM_NAME_MAX;
  const namesBase = 4 + DM_SLOTS * SLOT;
  const buf = new Uint8Array(namesBase + (names ? DM_SLOTS * NAME : 0));
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, DM_MAGIC, true);
  dv.setUint8(2, names ? DM_VERSION_V2 : DM_VERSION_V1);
  dv.setUint8(3, DM_SLOTS);
  for (let k = 0; k < DM_SLOTS; k++) {
    const steps = (slots[k] ?? []).slice(0, DM_STEPS);
    const base = 4 + k * SLOT;
    dv.setUint8(base, steps.length);
    steps.forEach((s, i) => {
      const o = base + 1 + i * STEP;
      dv.setUint8(o, s.action);
      dv.setUint32(o + 1, s.keycode >>> 0, true);
    });
    if (names) {
      const nb = new TextEncoder().encode(names[k] ?? "").slice(0, DM_NAME_MAX);
      const o = namesBase + k * NAME;
      dv.setUint8(o, nb.length);
      buf.set(nb, o + 1);
    }
  }
  return buf;
}

function stubTauri(slots: DmStep[][], names?: string[]) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === "dmac_read_all") return Array.from(encodeDmacAll(slots, names));
      if (cmd === "dmac_write_slot") return undefined;
      throw new Error(`storybook stub: unmocked command ${cmd}`);
    },
  };
}

/* The panel only gates on `conn` being truthy. */
const dummyConn = {} as unknown as RpcConnection;

/** A descriptor that reports the macros wire at `wireVer` — what decides
 *  whether the name field is shown at all (hasMacroNames). */
const capsWithMacroWire = (wireVer: number): ToraboCaps => ({
  descVersion: CAPS_DESC_VERSION,
  fw: { major: 0, minor: 0, patch: 0 },
  features: [{ id: Feature.Macros, wireVer, caps: 0 }],
});

const withSlots =
  (slots: DmStep[][], names?: string[]) => (Story: () => JSX.Element) => {
    stubTauri(slots, names);
    return (
      <ConnectionContext.Provider value={{ conn: dummyConn }}>
        <MacroNamesProvider>
          <Story />
        </MacroNamesProvider>
      </ConnectionContext.Provider>
    );
  };

const meta = {
  title: "Macros/MacrosPanel",
  component: MacrosPanel,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof MacrosPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three registered macros; the rest of the slots stay hidden until added.
 *  No caps, so the panel behaves as it does on pre-capabilities firmware. */
export const Loaded: Story = { decorators: [withSlots(SAMPLE)] };

/** A keyboard nobody has written a macro to yet. */
export const Empty: Story = { decorators: [withSlots([])] };

/**
 * Firmware whose macros wire is still v1: no name field anywhere, which is the
 * whole compatibility requirement — the panel must look exactly as it always
 * has on a keyboard that cannot store names.
 */
export const WireV1NoNames: Story = {
  args: { caps: capsWithMacroWire(1) },
  decorators: [withSlots(SAMPLE)],
};

/** Names-capable firmware (macros wire v2): each slot gains a name field, and
 *  the READ carries the names shown here. Slot 2 is deliberately left unnamed
 *  so the placeholder — and the board's M2 fallback — can be seen. */
export const WireV2Named: Story = {
  args: { caps: capsWithMacroWire(2) },
  decorators: [withSlots(SAMPLE, ["git status", "貼り付け"])],
};
