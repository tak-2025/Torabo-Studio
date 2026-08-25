import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import {
  TunnelOp,
  TunnelStatus,
} from "@zmkfirmware/zmk-studio-ts-client/torabo";

import { call_rpc } from "../../rpc/logging";
import { isTauri, type ToraboBackend, type ToraboConfigBackend } from "../types";
import * as tauriFiles from "../tauri/files";
import { webFiles } from "../webble/files";

/**
 * The torabo config services over the Studio RPC link itself.
 *
 * Every other backend reaches these settings through the BLE GATT services —
 * which is why USB has always been keymap-only, on desktop and in the browser
 * alike: those services are GATT, and a CDC-ACM cable cannot see them.
 *
 * Firmware built with the tunnel subsystem (PLAN-usb-tunnel.md) carries the very
 * same blobs inside the RPC that is already running over whatever transport the
 * user connected with. So this backend is transport-blind on purpose: browser
 * Web Serial, desktop serial, desktop BLE and any future link all get the full
 * feature set from one implementation, because none of them is mentioned here.
 *
 * The blob is byte-for-byte what the GATT characteristic carries, so the feature
 * modules' encoders and decoders are used unchanged — this is a byte carrier and
 * nothing more, exactly like the GATT backends.
 */

/**
 * Tunnel feature ids. Deliberately the low byte of each GATT service UUID
 * (e1f4a9xx and friends), so the two paths to the same setting are obviously
 * the same setting. Append-only, and shared with the firmware — see
 * torabo-tsuki_ext_FW's tunnel_bridge.c files.
 */
export const TunnelFeature = {
  Caps: 0x00,
  Trackball: 0x09,
  Macros: 0x0a,
  Combos: 0x0b,
  Trackpad: 0x0c,
  Encoder: 0x0d,
  Led: 0x0e,
  LiveFeed: 0x0f,
} as const;
export type TunnelFeature = (typeof TunnelFeature)[keyof typeof TunnelFeature];

const FEATURE_LABEL: Record<number, string> = {
  [TunnelFeature.Caps]: "機能一覧",
  [TunnelFeature.Trackball]: "トラックボール",
  [TunnelFeature.Macros]: "マクロ",
  [TunnelFeature.Combos]: "コンボ",
  [TunnelFeature.Trackpad]: "トラックパッド",
  [TunnelFeature.Encoder]: "エンコーダー",
  [TunnelFeature.Led]: "LED",
  [TunnelFeature.LiveFeed]: "ライブ表示",
};

function label(feature: number): string {
  return FEATURE_LABEL[feature] ?? `feature 0x${feature.toString(16)}`;
}

/** Reused for every request that carries no payload; never mutated. */
const NO_BLOB = new Uint8Array(0);

function statusText(status: TunnelStatus): string {
  switch (status) {
    case TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE:
      return "この機能を含まないファームウェアです";
    case TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_INVALID:
      return "送ったデータをファームウェアが受け付けませんでした（アプリとファームウェアのバージョンが合っていない可能性があります）";
    case TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_ERROR:
      return "ファームウェア側の処理に失敗しました";
    default:
      return `不明なステータス ${status}`;
  }
}

/**
 * One tunnel exchange.
 *
 * Two nested oneofs, not one: ZMK's `ZMK_RPC_SUBSYSTEM` macro requires a
 * per-subsystem wrapper message, so the request is
 * `studio.Request.torabo` → `torabo.Request.tunnel` → `TunnelRequest`.
 *
 * `call_rpc` (src/rpc/logging.ts) resolves with the Error instead of rejecting,
 * which suits its callers — they read optional fields off the result, so a
 * failure surfaces as "no data". Here it has to become a rejection again: the
 * panels distinguish "unavailable" from "empty", and silently returning an empty
 * config is how a save would wipe the keyboard's settings.
 */
async function tunnel(
  conn: RpcConnection,
  feature: number,
  op: TunnelOp,
  blob: Uint8Array,
): Promise<Uint8Array> {
  const resp = await call_rpc(conn, {
    torabo: { tunnel: { featureId: feature, op, blob } },
  });

  if (resp instanceof Error) throw resp;

  const tunnelResp = resp?.torabo?.tunnel;
  if (!tunnelResp) {
    // The firmware answered, but not on the tunnel. Since the probe at connect
    // is what registers this backend at all, reaching here means the link
    // changed under us rather than that the firmware is old.
    throw new Error(
      `${label(feature)} の要求に対して、キーボードがトンネル応答を返しませんでした。`,
    );
  }
  // OK is the proto3 default and never reaches the wire, so an absent status
  // decodes to OK — which is exactly right, and why this compares rather than
  // checking for presence.
  if (tunnelResp.status !== TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK) {
    throw new Error(`${label(feature)}: ${statusText(tunnelResp.status)}`);
  }
  // A view into the decoded frame, not a copy — safe to hand out because the
  // framing decoder allocates a fresh buffer per frame and keeps no reference to
  // it (ts-client's framing.js), unlike the browser's BLE read buffers.
  return tunnelResp.blob;
}

const read = (conn: RpcConnection, feature: number) =>
  tunnel(conn, feature, TunnelOp.ZMK_TORABO_TUNNEL_OP_READ, NO_BLOB);

const write = async (conn: RpcConnection, feature: number, data: Uint8Array) => {
  await tunnel(conn, feature, TunnelOp.ZMK_TORABO_TUNNEL_OP_WRITE, data);
};

/** The config half, without the file plumbing. */
export function makeRpcConfigBackend(conn: RpcConnection): ToraboConfigBackend {
  return {
    toraboReadCaps: () => read(conn, TunnelFeature.Caps),

    trackballReadConfig: () => read(conn, TunnelFeature.Trackball),
    trackballWriteConfig: (d) => write(conn, TunnelFeature.Trackball, d),

    trackpadReadConfig: () => read(conn, TunnelFeature.Trackpad),
    trackpadWriteConfig: (d) => write(conn, TunnelFeature.Trackpad, d),

    encoderReadConfig: () => read(conn, TunnelFeature.Encoder),
    encoderWriteConfig: (d) => write(conn, TunnelFeature.Encoder, d),

    ledReadConfig: () => read(conn, TunnelFeature.Led),
    ledWriteConfig: (d) => write(conn, TunnelFeature.Led, d),

    // Macros and combos read every slot at once and write one slot at a time;
    // which slot is in the blob's own header, exactly as over GATT.
    dmacReadAll: () => read(conn, TunnelFeature.Macros),
    dmacWriteSlot: (d) => write(conn, TunnelFeature.Macros, d),

    comboReadAll: () => read(conn, TunnelFeature.Combos),
    comboWriteSlot: (d) => write(conn, TunnelFeature.Combos, d),
  };
}

/**
 * A complete backend for `registerBackend()`.
 *
 * File dialogs have nothing to do with the keyboard link, so they come from the
 * platform: a Tauri window gets the native dialogs, a browser gets its own.
 */
export function makeRpcBackend(conn: RpcConnection): ToraboBackend {
  return {
    kind: "rpc",
    ...makeRpcConfigBackend(conn),
    ...(isTauri()
      ? {
          saveTextFile: tauriFiles.saveTextFile,
          openBackupFile: tauriFiles.openBackupFile,
          openKeymapFile: tauriFiles.openKeymapFile,
        }
      : webFiles),
  };
}

/**
 * How long to wait for the probe below before concluding "no tunnel".
 *
 * Not the RPC's own timeout, which is a 15 s idle bound sized for multi-kilobyte
 * keymap reads. This is one tiny exchange on a link that has just answered
 * getDeviceInfo, and it sits between the user's click and the app appearing, so
 * a firmware that neither answers nor errors must not hold the connect screen
 * open for a quarter of a minute.
 */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Ask the keyboard whether it speaks the tunnel, by reading the capability
 * descriptor through it.
 *
 * Yes means one READ of feature 0x00 came back with status OK. The three ways
 * to get no:
 *
 *  - Firmware without the tunnel decodes an unknown field 6, finds no subsystem
 *    set and replies with a meta error, which `call_rpc` turns into an Error.
 *  - Firmware with the tunnel but no caps bridge replies UNSUPPORTED_FEATURE.
 *    Other features might still answer, but a keyboard that cannot describe
 *    itself is not one to open the settings panels against — `useToraboCaps`
 *    would fail on every connection and each panel would then have to discover
 *    its own absence. Registering nothing keeps that firmware on the honest
 *    keymap-only path.
 *  - Anything else (silence, a closing link) times out here.
 *
 * Never throws: a probe that fails is the same answer as a probe that says no,
 * and neither should be able to stop the connection from completing.
 */
export async function probeRpcTunnel(conn: RpcConnection): Promise<boolean> {
  const call = call_rpc(conn, {
    torabo: {
      tunnel: {
        featureId: TunnelFeature.Caps,
        op: TunnelOp.ZMK_TORABO_TUNNEL_OP_READ,
        blob: NO_BLOB,
      },
    },
  });

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
  });

  try {
    const resp = await Promise.race([call, timeout]).finally(() =>
      clearTimeout(timer),
    );

    if (resp === null) {
      console.warn(
        `[tunnel] probe timed out after ${PROBE_TIMEOUT_MS}ms; treating this keyboard as pre-tunnel firmware`,
      );
      return false;
    }
    if (resp instanceof Error) {
      console.info("[tunnel] not available on this firmware:", resp.message);
      return false;
    }
    const tunnelResp = resp?.torabo?.tunnel;
    if (!tunnelResp) {
      console.info(
        "[tunnel] firmware answered without a tunnel response; treating as pre-tunnel",
      );
      return false;
    }
    if (tunnelResp.status !== TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK) {
      console.warn(
        `[tunnel] subsystem present, but caps (feature 0x00) answered status ` +
          `${tunnelResp.status} (${statusText(tunnelResp.status)}). ` +
          `Not registering the tunnel backend.`,
      );
      return false;
    }
    console.info(
      `[tunnel] available: caps read ${tunnelResp.blob.length} bytes over the RPC link`,
    );
    return true;
  } catch (e) {
    console.info("[tunnel] probe failed:", e);
    return false;
  }
}
