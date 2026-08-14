import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

import { call_rpc } from "./logging";

/**
 * Context the config panels want but the config wire does not carry: layer
 * names, and the physical key layout.
 *
 * Fetched on demand, never on mount. Over BLE these RPCs share the link with
 * the keyboard's own HID reports, so traffic the user did not ask for shows up
 * as the pointer stuttering mid-motion. Switching tabs used to cost a round
 * trip for that reason; now nothing goes out until "読み込み" is pressed, which
 * is also when the panel is about to talk to the keyboard anyway.
 *
 * Deliberately uncached: a read is already a deliberate act, and caching would
 * mean showing layer names from before the user renamed a layer.
 *
 * Both helpers answer null instead of throwing. The panels treat this as
 * decoration — without it a layer picker falls back to plain indices, which is
 * worse than the alternative but far better than failing the read.
 */

export interface LayerInfo {
  /**
   * How many layers the keymap actually claims. The config wires have a fixed
   * compile-time layer count that also covers the torabo-reserved layers
   * appended after the real ones, so panels use this to hide the trailing ones.
   */
  activeLayers: number;
  /** Layer name by index, falling back to the index itself. */
  layerNames: string[];
}

export async function fetchLayerInfo(
  conn: RpcConnection,
): Promise<LayerInfo | null> {
  try {
    const km = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap
      ?.getKeymap;
    if (!km?.layers) return null;
    return {
      activeLayers: km.layers.length,
      layerNames: km.layers.map((l, i) => l.name || i.toLocaleString()),
    };
  } catch (e) {
    console.warn("layer info fetch skipped:", e);
    return null;
  }
}

/** One key of the active physical layout, in the units the panels draw in. */
export interface LayoutKey {
  x: number;
  y: number;
  width: number;
  height: number;
  r: number;
  rx: number;
  ry: number;
}

export async function fetchLayoutKeys(
  conn: RpcConnection,
): Promise<LayoutKey[] | null> {
  try {
    const resp = await call_rpc(conn, { keymap: { getPhysicalLayouts: true } });
    const pl = resp?.keymap?.getPhysicalLayouts;
    const layout = pl?.layouts?.[pl?.activeLayoutIndex || 0];
    if (!layout) return null;
    // The wire carries hundredths; the panels draw in whole units.
    return layout.keys.map((k) => ({
      x: k.x / 100,
      y: k.y / 100,
      width: k.width / 100,
      height: k.height / 100,
      r: (k.r || 0) / 100,
      rx: (k.rx || 0) / 100,
      ry: (k.ry || 0) / 100,
    }));
  } catch (e) {
    console.warn("physical layout fetch skipped:", e);
    return null;
  }
}
