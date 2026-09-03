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
import { useT } from "./i18n";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import {
  clearTauriGattAccess,
  refreshTauriGattAccess,
  registerBackend,
  registeredBackend,
  unregisterBackend,
} from "./backends";
import type { ToraboBackend } from "./backends";
import { makeRpcBackend, probeRpcTunnel } from "./backends/rpc/config";
import { registerPlatformTransports } from "./platform/transports";
import MainPanels from "./MainPanels";
import { MacroNamesProvider } from "./dynamic_macros/MacroNamesContext";
import { SyncStatusProvider } from "./rpc/SyncStatusContext";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { usePub, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { UnlockModal } from "./UnlockModal";
import { valueAfter } from "./misc/async";
import { AppFooter } from "./AppFooter";
import { AboutModal } from "./AboutModal";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";

// Which radios this build can reach a keyboard over. Studio and the Android
// (Capacitor) shell genuinely disagree here — see platform/transports.tsx's
// header comment for why that file, not this constant, is the seam.
const TRANSPORTS: TransportFactory[] = registerPlatformTransports();

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

// How many times to ask for `getDeviceInfo` right after a fresh connection,
// and how long to give each attempt. A BLE reconnect (as opposed to the very
// first connection to a device) has to redo service discovery and
// resubscribe to notifications on the OS side, and the firmware needs a
// moment to be ready to answer — that can comfortably take longer than 1s,
// especially the first attempt right after the link comes up. A single 1s
// race was tuned for the fast common case and made every slow-but-fine
// reconnect look like a failure, so this gives each attempt a realistic
// budget and retries a couple of times (with a short pause in between)
// before finally giving up.
const GET_DEVICE_INFO_ATTEMPTS = 3;
const GET_DEVICE_INFO_TIMEOUT_MS = 5000;
const GET_DEVICE_INFO_RETRY_DELAY_MS = 500;

async function getDeviceInfoWithRetries(conn: RpcConnection) {
  for (let attempt = 1; attempt <= GET_DEVICE_INFO_ATTEMPTS; attempt++) {
    const details = await Promise.race([
      call_rpc(conn, { core: { getDeviceInfo: true } })
        .then((r) => r?.core?.getDeviceInfo)
        .catch((e) => {
          console.error("Failed first RPC call", e);
          return undefined;
        }),
      valueAfter(undefined, GET_DEVICE_INFO_TIMEOUT_MS),
    ]);

    if (details) return details;

    console.warn(
      `getDeviceInfo attempt ${attempt}/${GET_DEVICE_INFO_ATTEMPTS} timed out or failed`,
    );

    if (attempt < GET_DEVICE_INFO_ATTEMPTS) {
      await valueAfter(undefined, GET_DEVICE_INFO_RETRY_DELAY_MS);
    }
  }

  return undefined;
}

async function connect(
  transport: RpcTransport,
  setConn: Dispatch<ConnectionState>,
  setConnectedDeviceName: Dispatch<string | undefined>,
  signal: AbortSignal,
  t: (key: string) => string,
  isUsb?: boolean,
) {
  let conn = await create_rpc_connection(transport, { signal });

  let details = await getDeviceInfoWithRetries(conn);

  if (!details) {
    // The transport (e.g. backends/webble/transport.ts) is already fully
    // live at this point — GATT connected, characteristicvaluechanged
    // subscribed, its backend registered via registerBackend() — even though
    // no RPC has succeeded yet. Abort it before giving up, or all of that is
    // left behind: the tab's Bluetooth indicator stays lit, and
    // backends/index.ts's setupToraboAccess refuses to register anything
    // else because registeredBackend() is still truthy, breaking every
    // later reconnect (and USB fallback) until the page is reloaded.
    // `abortController` is public on RpcTransport (transport/index.d.ts)
    // for exactly this; the transport's own abort handler does the rest —
    // for webble that means removing its listeners, unregistering its
    // backend, and disconnecting the GATT server.
    transport.abortController.abort();
    // A USB link that opens but never answers has one overwhelmingly common
    // cause, and "Failed to connect" sends people looking everywhere else for
    // it: ZMK serves Studio only on the endpoint it currently has selected
    // (app/src/studio/rpc.c refresh_selected_transport stops the other one), and
    // with both USB and BLE up that is whatever `endpoints/preferred` says. A
    // keyboard whose output is on Bluetooth is silent over USB, and the setting
    // lives in its own NVS entry, so it survives keymap edits and reflashes.
    // TODO: Show a proper toast/alert not using `window.alert`
    window.alert(t(isUsb ? "connect.failedUsb" : "connect.failed"));
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
  const t = useT();
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

      // Web Bluetooth cannot reconnect within the same page after a
      // disconnect: Chromium keeps reusing the same BluetoothDevice/GATT
      // objects, and a later connect() attempt on them stalls until it hits
      // ATTACH_TIMEOUT_MS in webble/transport.ts. Reloading the page sidesteps
      // this — the browser still remembers the pairing/permission, so the user
      // only has to click connect again on the fresh page. Read this BEFORE
      // aborting: teardown() unregisters the backend as part of tearing the
      // connection down, so `registeredBackend()` is null once abort() returns.
      const isWebble = registeredBackend()?.kind === "webble";

      await conn.conn.request_writable.close();
      connectionAbort.abort("User disconnected");
      setConnectionAbort(new AbortController());

      if (isWebble) {
        // teardown() (webble/transport.ts) runs synchronously off the abort
        // signal, but give the GATT disconnect a brief moment to actually land
        // on the OS/radio side before pulling the page out from under it.
        setTimeout(() => window.location.reload(), 200);
      }
    }

    doDisconnect();
  }, [conn]);

  const onConnect = useCallback(
    (transport: RpcTransport, factory?: TransportFactory) => {
      const ac = new AbortController();
      setConnectionAbort(ac);
      connect(
        transport,
        setConn,
        setConnectedDeviceName,
        ac.signal,
        t,
        factory?.isUsb,
      );
    },
    [setConn, setConnectedDeviceName, t],
  );

  return (
    <ConnectionContext.Provider value={conn}>
      <LockStateContext.Provider value={lockState}>
        <UndoRedoContext.Provider value={doIt}>
          {/* Wraps AppHeader (the status line's one reader) and MainPanels
              (home to every step's own loading flag, which is what feeds it)
              alike — see rpc/SyncStatusContext's header comment. */}
          <SyncStatusProvider>
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
              {/* Macro slot names travel from the macros panel to the keymap
                  board's `&dmac` keycaps; both live inside MainPanels but have
                  no other reason to know about each other. See
                  dynamic_macros/MacroNamesContext. */}
              <MacroNamesProvider>
                <MainPanels />
              </MacroNamesProvider>
              <AppFooter
                onShowAbout={() => setShowAbout(true)}
                onShowLicenseNotice={() => setShowLicenseNotice(true)}
              />
            </div>
          </SyncStatusProvider>
        </UndoRedoContext.Provider>
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

export default App;
