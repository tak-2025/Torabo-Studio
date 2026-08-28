import { AppHeader } from "./AppHeader";

import {
  create_rpc_connection,
  type RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "./rpc/logging";

import type { Notification } from "@zmkfirmware/zmk-studio-ts-client/studio";
import { ConnectionState, ConnectionContext } from "./rpc/ConnectionContext";
import { Dispatch, useCallback, useEffect, useState } from "react";
import { ConnectModal, TransportFactory } from "./ConnectModal";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { connect as webble_connect } from "./backends/webble/transport";
import {
  connect as tauri_ble_connect,
  list_devices as ble_list_devices,
} from "./backends/tauri/ble";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "./backends/tauri/serial";
import {
  clearTauriGattAccess,
  isTauri,
  refreshTauriGattAccess,
  registerBackend,
  registeredBackend,
  unregisterBackend,
} from "./backends";
import type { ToraboBackend } from "./backends";
import { makeRpcBackend, probeRpcTunnel } from "./backends/rpc/config";
import MainPanels from "./MainPanels";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { usePub, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { UnlockModal } from "./UnlockModal";
import { valueAfter } from "./misc/async";
import { AppFooter } from "./AppFooter";
import { AboutModal } from "./AboutModal";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";

/**
 * Whether the browser can reconnect to an already-granted keyboard without the
 * chooser. Edge 151 and Chromium cannot; without it there is no way to reach a
 * keyboard that is connected to this PC, because it stops advertising and the
 * chooser only ever lists what is advertising.
 */
const canReconnectSilently =
  typeof navigator.bluetooth?.getDevices === "function";

const TRANSPORTS: TransportFactory[] = [
  navigator.serial && {
    label: "USB",
    isUsb: true,
    // What this reaches depends on the firmware, not on the browser: with the
    // settings tunnel the RPC carries the torabo config too, and without it the
    // config lives on GATT where a cable cannot see it. The note says both.
    // Only shown in the browser picker; the desktop build overrides this entry
    // below and its device list has no per-transport notes.
    noteKey: isTauri() ? undefined : "connect.note.webSerial",
    connect: serial_connect,
  },
  // Our own Web Bluetooth transport, not the ts-client one: it keeps the GATT
  // server so the torabo config services are reachable on the same link. It also
  // is not gated to Linux — upstream restricts its transport that way, but this
  // keyboard's encrypted characteristics have been exercised from Chrome on
  // Windows (see Torabo-Float-Web), so the gate would only remove a path that
  // works. A platform where it genuinely fails reports it at connect time.
  ...(!isTauri() && navigator.bluetooth
    ? [
        {
          label: "Bluetooth",
          isWireless: true,
          // Reconnects silently where the browser can do that; otherwise opens
          // a chooser listing keyboards rather than every radio in range.
          noteKey: canReconnectSilently
            ? "connect.note.webBluetooth"
            : "connect.note.webBluetoothChoose",
          // A keyboard already connected to this PC cannot be in the list at
          // all. Getting it there is fiddly, and easy to get stuck halfway
          // through, so the procedure is spelled out rather than hinted at.
          stepKeys: [
            "connect.steps.open",
            "connect.steps.switch",
            "connect.steps.switchBack",
            "connect.steps.select",
          ],
          connect: () => webble_connect(),
        },
        // The filter only matches a keyboard that is discoverable at that
        // moment, and only on what ZMK happens to broadcast. Neither is
        // guaranteed, so there is always a way to see everything.
        {
          label: "Bluetooth（すべての機器）",
          isWireless: true,
          noteKey: "connect.note.webBluetoothAll",
          connect: () => webble_connect({ allDevices: true }),
        },
      ]
    : []),
  ...(isTauri()
    ? [
        {
          label: "Bluetooth",
          isWireless: true,
          pick_and_connect: {
            connect: tauri_ble_connect,
            list: ble_list_devices,
          },
        },
      ]
    : []),
  ...(isTauri()
    ? [
        {
          label: "USB",
          isUsb: true,
          pick_and_connect: {
            connect: tauri_serial_connect,
            list: serial_list_devices,
          },
        },
      ]
    : []),
].filter((t) => t !== undefined);

async function listen_for_notifications(
  notification_stream: ReadableStream<Notification>,
  signal: AbortSignal,
): Promise<void> {
  let reader = notification_stream.getReader();
  const onAbort = () => {
    reader.cancel();
    reader.releaseLock();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  do {
    let pub = usePub();

    try {
      let { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      console.log("Notification", value);
      pub("rpc_notification", value);

      const subsystem = Object.entries(value).find(
        ([_k, v]) => v !== undefined,
      );
      if (!subsystem) {
        continue;
      }

      const [subId, subData] = subsystem;
      const event = Object.entries(subData).find(([_k, v]) => v !== undefined);

      if (!event) {
        continue;
      }

      const [eventName, eventData] = event;
      const topic = ["rpc_notification", subId, eventName].join(".");

      pub(topic, eventData);
    } catch (e) {
      signal.removeEventListener("abort", onAbort);
      reader.releaseLock();
      throw e;
    }
  } while (true);

  signal.removeEventListener("abort", onAbort);
  reader.releaseLock();
  notification_stream.cancel();
}

/**
 * Decide how this connection reaches the torabo settings, and publish it.
 *
 * Four outcomes, in order:
 *
 *  1. Web Bluetooth has already registered its GATT backend while attaching
 *     (backends/webble/transport.ts). That is the path Bluetooth has always
 *     used, it owns its own teardown, and it stays — no probe, no second
 *     registration.
 *  2. Desktop Bluetooth: `refreshTauriGattAccess` finds the native BLE device
 *     handle Rust is already holding for this connection. That wins outright,
 *     with no tunnel probe at all — its chunked GATT writes
 *     (src-tauri/src/transport/*.rs, `write_chunked`) are what a ~1.5KB
 *     torabo config (e.g. the trackpad tab) needs. Sent as an RPC tunnel
 *     frame instead, that same config is one oversized ATT write, which
 *     WinRT rejects and which used to take the whole connection down with it
 *     (src-tauri/src/transport/gatt.rs's write pump).
 *  3. Otherwise — browser USB, desktop USB — ask the keyboard whether its
 *     firmware carries the settings inside the RPC. If it does, one
 *     transport-blind backend serves both.
 *  4. If it does not, nothing is registered. A USB cable to pre-tunnel
 *     firmware is honestly keymap-only, and the panels say so instead of
 *     appearing and failing.
 *
 * Returns the teardown for whatever it published.
 */
async function setupToraboAccess(
  conn: RpcConnection,
  signal: AbortSignal,
): Promise<() => void> {
  if (registeredBackend()) return () => undefined;

  // Whether the desktop's native GATT commands can work on this connection.
  // True only for desktop Bluetooth — false for a serial connection (no BLE
  // device handle to hold) and false in the browser (no Tauri at all).
  const hasNativeGatt = await refreshTauriGattAccess(conn);
  const releaseTauri = () => clearTauriGattAccess(conn);
  signal.addEventListener("abort", releaseTauri, { once: true });

  // Desktop Bluetooth already has a working, chunked-write path straight to
  // the keyboard's GATT services (`activeBackend()`'s native-GATT fallback in
  // backends/index.ts). Registering the RPC tunnel on top would make
  // `activeBackend()` prefer it instead (it checks `registered` first), and
  // the tunnel cannot carry these payloads over this same link without the
  // ATT write splitting the native path already does. So this connection is
  // done: no probe, nothing registered here.
  if (hasNativeGatt) {
    return releaseTauri;
  }

  if (signal.aborted || !(await probeRpcTunnel(conn))) {
    return releaseTauri;
  }
  // Checked again: the probe is a round trip to the keyboard, and the link can
  // go away during it. Publishing then would register a backend whose abort
  // listener never gets a chance to run.
  if (signal.aborted) return releaseTauri;

  const backend: ToraboBackend = makeRpcBackend(conn);
  registerBackend(backend);

  const teardown = () => {
    // Both are no-ops unless this connection's registration is still the live
    // one, so a late teardown cannot disturb a newer connection.
    unregisterBackend(backend);
    releaseTauri();
  };
  signal.addEventListener("abort", teardown, { once: true });
  return teardown;
}

async function connect(
  transport: RpcTransport,
  setConn: Dispatch<ConnectionState>,
  setConnectedDeviceName: Dispatch<string | undefined>,
  signal: AbortSignal,
) {
  let conn = await create_rpc_connection(transport, { signal });

  let details = await Promise.race([
    call_rpc(conn, { core: { getDeviceInfo: true } })
      .then((r) => r?.core?.getDeviceInfo)
      .catch((e) => {
        console.error("Failed first RPC call", e);
        return undefined;
      }),
    valueAfter(undefined, 1000),
  ]);

  if (!details) {
    // TODO: Show a proper toast/alert not using `window.alert`
    window.alert("Failed to connect to the chosen device");
    return;
  }

  // Before the connection is published, so the first render of the panels
  // already knows which tabs this keyboard can actually serve.
  const releaseToraboAccess = await setupToraboAccess(conn, signal);

  const onConnectionEnded = () => {
    releaseToraboAccess();
    setConnectedDeviceName(undefined);
    setConn({ conn: null });
  };

  listen_for_notifications(conn.notification_readable, signal)
    .then(onConnectionEnded)
    .catch(onConnectionEnded);

  setConnectedDeviceName(details.name);
  setConn({ conn });
}

function App() {
  const [conn, setConn] = useState<ConnectionState>({ conn: null });
  const [connectedDeviceName, setConnectedDeviceName] = useState<
    string | undefined
  >(undefined);
  const [doIt, undo, redo, canUndo, canRedo, reset] = useUndoRedo();
  const [showAbout, setShowAbout] = useState(false);
  const [showLicenseNotice, setShowLicenseNotice] = useState(false);
  const [connectionAbort, setConnectionAbort] = useState(new AbortController());

  const [lockState, setLockState] = useState<LockState>(
    LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED,
  );

  useSub("rpc_notification.core.lockStateChanged", (ls) => {
    setLockState(ls);
  });

  useEffect(() => {
    if (!conn) {
      reset();
      setLockState(LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED);
    }

    async function updateLockState() {
      if (!conn.conn) {
        return;
      }

      let locked_resp = await call_rpc(conn.conn, {
        core: { getLockState: true },
      });

      setLockState(
        locked_resp.core?.getLockState ||
          LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED,
      );
    }

    updateLockState();
  }, [conn, setLockState]);

  const save = useCallback(() => {
    async function doSave() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, { keymap: { saveChanges: true } });
      if (!resp.keymap?.saveChanges || resp.keymap?.saveChanges.err) {
        console.error("Failed to save changes", resp.keymap?.saveChanges);
      }
    }

    doSave();
  }, [conn]);

  const discard = useCallback(() => {
    async function doDiscard() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        keymap: { discardChanges: true },
      });
      if (!resp.keymap?.discardChanges) {
        console.error("Failed to discard changes", resp);
      }

      reset();
      setConn({ conn: conn.conn });
    }

    doDiscard();
  }, [conn]);

  const resetSettings = useCallback(() => {
    async function doReset() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        core: { resetSettings: true },
      });
      if (!resp.core?.resetSettings) {
        console.error("Failed to settings reset", resp);
      }

      reset();
      setConn({ conn: conn.conn });
    }

    doReset();
  }, [conn]);

  const disconnect = useCallback(() => {
    async function doDisconnect() {
      if (!conn.conn) {
        return;
      }

      await conn.conn.request_writable.close();
      connectionAbort.abort("User disconnected");
      setConnectionAbort(new AbortController());
    }

    doDisconnect();
  }, [conn]);

  const onConnect = useCallback(
    (t: RpcTransport) => {
      const ac = new AbortController();
      setConnectionAbort(ac);
      connect(t, setConn, setConnectedDeviceName, ac.signal);
    },
    [setConn, setConnectedDeviceName, setConnectedDeviceName],
  );

  return (
    <ConnectionContext.Provider value={conn}>
      <LockStateContext.Provider value={lockState}>
        <UndoRedoContext.Provider value={doIt}>
          <UnlockModal />
          <ConnectModal
            open={!conn.conn}
            transports={TRANSPORTS}
            onTransportCreated={onConnect}
          />
          <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
          <LicenseNoticeModal
            open={showLicenseNotice}
            onClose={() => setShowLicenseNotice(false)}
          />
          <div className="bg-base-100 text-base-content h-full max-h-[100vh] w-full max-w-[100vw] inline-grid grid-cols-[auto] grid-rows-[auto_1fr_auto] overflow-hidden">
            <AppHeader
              connectedDeviceLabel={connectedDeviceName}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onSave={save}
              onDiscard={discard}
              onDisconnect={disconnect}
              onResetSettings={resetSettings}
            />
            <MainPanels />
            <AppFooter
              onShowAbout={() => setShowAbout(true)}
              onShowLicenseNotice={() => setShowLicenseNotice(true)}
            />
          </div>
        </UndoRedoContext.Provider>
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

export default App;
