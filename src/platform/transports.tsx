/**
 * The one seam between Torabo Studio (this file) and the Android
 * (Capacitor) shell's protected override of the same path.
 *
 * Everything else in this app is translated verbatim from Studio into the
 * Android repo (see torabo-STUDIO-Android/scripts/translate-from-studio.mjs);
 * this file is the exception the translator is told never to touch, because
 * it is the one place the two builds must genuinely disagree: which radios
 * exist to connect over. Studio talks to Web Serial / Web Bluetooth / the
 * Tauri desktop backends; Android owns its Bluetooth stack directly through
 * `capacitor/ble.ts` and has none of the others. Keeping that one difference
 * behind a function call is what lets every file that USES the transport
 * list (App.tsx, ConnectModal.tsx) stay byte-identical between the two repos.
 */
import type { TransportFactory } from "../ConnectModal";
import type { ReactNode } from "react";

import { tr } from "../i18n";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { connect as webble_connect } from "../backends/webble/transport";
import {
  connect as tauri_ble_connect,
  list_devices as ble_list_devices,
} from "../backends/tauri/ble";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "../backends/tauri/serial";
import { isTauri } from "../backends";
import { ExternalLink } from "../misc/ExternalLink";

/**
 * Whether the browser can reconnect to an already-granted keyboard without the
 * chooser. Edge 151 and Chromium cannot; without it there is no way to reach a
 * keyboard that is connected to this PC, because it stops advertising and the
 * chooser only ever lists what is advertising.
 */
const canReconnectSilently =
  typeof navigator.bluetooth?.getDevices === "function";

/**
 * Builds the list of ways this build can reach a keyboard. Called once at
 * module load from App.tsx, same as the inline array this replaced.
 */
export function registerPlatformTransports(): TransportFactory[] {
  return [
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
            // A getter, not a plain string: TRANSPORTS is built once at module
            // load, before the language is known, and must still follow the
            // header's language toggle. Every other label here is a proper noun.
            get label() {
              return tr("sys.transport.bluetoothAll");
            },
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
}

/**
 * What ConnectModal shows when `transports` comes back empty — this build has
 * no way at all to reach a keyboard. On Studio that only happens in a browser
 * with neither Web Serial nor Web Bluetooth; the advice is to switch browser
 * or use the desktop app.
 */
export function noTransportsAdvice(tr: (key: string) => string): ReactNode {
  return (
    <div className="m-4 flex flex-col gap-2">
      <p>
        {tr("connect.unsupportedPre")}
        <ExternalLink href="https://caniuse.com/web-serial">
          Web Serial
        </ExternalLink>
        {tr("connect.unsupportedMid")}
        <ExternalLink href="https://caniuse.com/web-bluetooth">
          Web Bluetooth
        </ExternalLink>
        {tr("connect.unsupportedPost")}
      </p>

      <div>
        <p>{tr("connect.toUse")}</p>
        <ul className="list-disc list-inside">
          <li>{tr("connect.useBrowser")}</li>
          <li>
            {tr("connect.downloadPre")}
            <ExternalLink href={`${import.meta.env.BASE_URL}download.html`}>
              {tr("connect.downloadLink")}
            </ExternalLink>
            {tr("connect.downloadPost")}
          </li>
        </ul>
      </div>
    </div>
  );
}
