import { useCallback, useEffect, useMemo, useState } from "react";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import type { AvailableDevice } from "./backends";
import { Bluetooth, Languages, RefreshCw } from "lucide-react";
import { Key, ListBox, ListBoxItem, Selection } from "react-aria-components";
import { useModalRef } from "./misc/useModalRef";
import { GenericModal } from "./GenericModal";
import { LANGS, useI18n } from "./i18n";
// The "no transports at all" advice is platform-specific (Studio points at
// Web Serial/Web Bluetooth support; the Android shell has its own content) —
// see platform/transports.tsx's header comment for why this is the seam.
import { noTransportsAdvice } from "./platform/transports";

export type TransportFactory = {
  label: string;
  isWireless?: boolean;
  /**
   * A cable, so the OS gives the port to one application at a time. Used to warn
   * about that before connecting rather than after Torabo-Float has gone quiet.
   */
  isUsb?: boolean;
  /**
   * i18n key for a one-line note on what this connection can reach. What a USB
   * link reaches now depends on the firmware — with the settings tunnel it is
   * everything, without it the keymap alone — and that is better said before
   * connecting than left for someone hunting for tabs that are not there.
   *
   * A key rather than a string because the transport table is built at module
   * scope, where hooks (and so the translator) are not available.
   */
  noteKey?: string;
  /**
   * i18n keys for a numbered procedure shown below the buttons, for a transport
   * that needs one. Too long to sit under a button, and too easy to get stuck
   * in to leave out.
   */
  stepKeys?: string[];
  connect?: () => Promise<RpcTransport>;
  pick_and_connect?: {
    list: () => Promise<Array<AvailableDevice>>;
    connect: (dev: AvailableDevice) => Promise<RpcTransport>;
  };
};

export interface ConnectModalProps {
  open?: boolean;
  transports: TransportFactory[];
  /** The second argument says WHICH factory produced the transport, so the
   *  caller can tailor a failure message (a USB link that never answers has a
   *  specific, common cause; a Bluetooth one does not). */
  onTransportCreated: (t: RpcTransport, factory?: TransportFactory) => void;
}

function deviceList(
  open: boolean,
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport, factory?: TransportFactory) => void,
  tr: (key: string) => string,
) {
  const [devices, setDevices] = useState<
    Array<[TransportFactory, AvailableDevice]>
  >([]);
  const [selectedDev, setSelectedDev] = useState(new Set<Key>());
  const [refreshing, setRefreshing] = useState(false);

  async function LoadEm() {
    setRefreshing(true);
    let entries: Array<[TransportFactory, AvailableDevice]> = [];
    for (const t of transports.filter((t) => t.pick_and_connect)) {
      const devices = await t.pick_and_connect?.list();
      if (!devices) {
        continue;
      }

      entries.push(
        ...devices.map<[TransportFactory, AvailableDevice]>((d) => {
          return [t, d];
        }),
      );
    }

    setDevices(entries);
    setRefreshing(false);
  }

  useEffect(() => {
    setSelectedDev(new Set());
    setDevices([]);

    LoadEm();
  }, [transports, open, setDevices]);

  const onRefresh = useCallback(() => {
    setSelectedDev(new Set());
    setDevices([]);

    LoadEm();
  }, [setDevices]);

  const onSelect = useCallback(
    async (keys: Selection) => {
      if (keys === "all") {
        return;
      }
      const dev = devices.find(([_t, d]) => keys.has(d.id));
      if (dev) {
        dev[0]
          .pick_and_connect!.connect(dev[1])
          .then((transport) => onTransportCreated(transport, dev[0]))
          .catch((e) => alert(e));
      }
    },
    [devices, onTransportCreated],
  );

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto]">
        <label>{tr("connect.selectDevice")}</label>
        <button
          className="p-1 rounded hover:bg-base-300 disabled:bg-base-100 disabled:opacity-75"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw
            className={`size-5 transition-transform ${
              refreshing ? "animate-spin" : ""
            }`}
          />
        </button>
      </div>
      <ListBox
        aria-label="Device"
        items={devices}
        onSelectionChange={onSelect}
        selectionMode="single"
        selectedKeys={selectedDev}
        className="flex flex-col gap-1 pt-1"
      >
        {([t, d]) => (
          <ListBoxItem
            className="grid grid-cols-[1em_1fr] rounded hover:bg-base-300 cursor-pointer px-1"
            id={d.id}
            aria-label={d.label}
          >
            {t.isWireless && (
              <Bluetooth className="w-4 justify-center content-center h-full" />
            )}
            <span className="col-start-2">{d.label}</span>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}

function simpleDevicePicker(
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport, factory?: TransportFactory) => void,
  tr: (key: string) => string,
) {
  const [availableDevices, setAvailableDevices] = useState<
    AvailableDevice[] | undefined
  >(undefined);
  // Wrapped in a fresh object per selection, rather than storing the
  // TransportFactory directly, so every click is a distinct value as far as
  // React is concerned. `TRANSPORTS` in App.tsx is a module-level constant,
  // so clicking the same button twice would otherwise call
  // setSelectedTransport() with the exact same object reference both times —
  // React's same-value bailout then skips a re-render (and this effect)
  // entirely on the second click. That is invisible for a connect that
  // resolves quickly (the state gets reset to undefined in between, so the
  // next click really is a change) but leaves the button dead for a click
  // that lands while the previous attempt is still stuck (e.g. a wedged
  // attach() before its own timeout fires).
  const [selection, setSelectedTransport] = useState<
    { transport: TransportFactory } | undefined
  >(undefined);
  const selectedTransport = selection?.transport;

  useEffect(() => {
    if (!selectedTransport) {
      setAvailableDevices(undefined);
      return;
    }

    let ignore = false;

    if (selectedTransport.connect) {
      async function connectTransport() {
        try {
          const transport = await selectedTransport?.connect?.();

          if (!ignore) {
            if (transport) {
              onTransportCreated(transport, selectedTransport);
            }
            setSelectedTransport(undefined);
          }
        } catch (e) {
          if (!ignore) {
            console.error(e);
            if (e instanceof Error && !(e instanceof UserCancelledError)) {
              alert(e.message);
            }
            setSelectedTransport(undefined);
          }
        }
      }

      connectTransport();
    } else {
      async function loadAvailableDevices() {
        const devices = await selectedTransport?.pick_and_connect?.list();

        if (!ignore) {
          setAvailableDevices(devices);
        }
      }

      loadAvailableDevices();
    }

    return () => {
      ignore = true;
    };
    // Depends on `selection` (the wrapper), not `selectedTransport` (the
    // TransportFactory it unwraps to): two different wrappers can carry the
    // same TransportFactory reference — that is the whole point of wrapping,
    // see above — and depending on the unwrapped value would let React's
    // same-value bailout skip this effect on a same-button re-click again.
  }, [selection]);

  let connections = transports.map((t) => (
    <li key={t.label} className="list-none flex flex-col gap-1 max-w-44">
      <button
        className="bg-base-300 hover:bg-primary hover:text-primary-content rounded px-2 py-1 pointer-coarse:px-4 pointer-coarse:py-3"
        type="button"
        onClick={async () => setSelectedTransport({ transport: t })}
      >
        {t.label}
      </button>
      {t.noteKey && (
        <p className="text-xs text-base-content/60 leading-snug">
          {tr(t.noteKey)}
        </p>
      )}
    </li>
  ));
  const steps = transports.find((t) => t.stepKeys?.length)?.stepKeys;

  return (
    <div>
      {/* No "choose a connection type" line here: connect.intro directly above
          already says it, and the two read as a stutter. */}
      <ul className="flex gap-3 items-start">{connections}</ul>
      {steps && (
        <div className="mt-3 rounded border border-base-300 bg-base-200/50 p-2.5">
          <p className="text-xs font-semibold">{tr("connect.steps.title")}</p>
          <ol className="mt-1 list-decimal list-inside text-xs text-base-content/70 leading-relaxed">
            {steps.map((key) => (
              <li key={key}>{tr(key)}</li>
            ))}
          </ol>
        </div>
      )}
      {selectedTransport && availableDevices && (
        <ul>
          {availableDevices.map((d) => (
            <li
              key={d.id}
              // Picking a device is the whole point of this modal on Android, and
              // `p-1` around one line of text is a ~28px row. Give it a 44px tap
              // target on touch (PLAN.md stage 4).
              className="m-1 p-1 pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center pointer-coarse:px-2 pointer-coarse:cursor-pointer"
              onClick={async () => {
                onTransportCreated(
                  await selectedTransport!.pick_and_connect!.connect(d),
                  selectedTransport,
                );
                setSelectedTransport(undefined);
              }}
            >
              {d.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function connectOptions(
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport, factory?: TransportFactory) => void,
  tr: (key: string) => string,
  open?: boolean,
) {
  const useSimplePicker = useMemo(
    () => transports.every((t) => !t.pick_and_connect),
    [transports],
  );

  return useSimplePicker
    ? simpleDevicePicker(transports, onTransportCreated, tr)
    : deviceList(open || false, transports, onTransportCreated, tr);
}

export const ConnectModal = ({
  open,
  transports,
  onTransportCreated,
}: ConnectModalProps) => {
  const { t, lang, setLang } = useI18n();
  const dialog = useModalRef(open || false, false, false);

  const haveTransports = useMemo(() => transports.length > 0, [transports]);
  // Sits under the picker rather than under the USB button: the desktop's
  // device list has no room for per-transport notes, and this applies to any
  // USB connection it offers.
  const haveUsb = useMemo(() => transports.some((tf) => tf.isUsb), [transports]);

  return (
    <GenericModal ref={dialog} className="max-w-xl">
      {/* The header's language button is behind this dialog, and a modal
          <dialog> makes everything behind it inert — so before connecting there
          was no way to change language at all. This is that button, close
          enough in look and behaviour that it reads as the same control.
          pointer-coarse: matches the tap targets the rest of this build uses. */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl">{t("connect.welcome")}</h1>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded p-1.5 hover:bg-base-300 pointer-coarse:p-2.5"
          title={t("lang.label")}
          onClick={() =>
            setLang(
              LANGS[(LANGS.findIndex((l) => l.id === lang) + 1) % LANGS.length]
                .id
            )
          }
        >
          <Languages className="inline-block w-4" aria-label={t("lang.label")} />
          <span className="text-xs font-semibold whitespace-nowrap">
            {LANGS.find((l) => l.id === lang)?.label}
          </span>
        </button>
      </div>
      {haveTransports && (
        <p className="text-sm text-base-content/70 pt-1">
          {t("connect.intro")}
        </p>
      )}
      {haveTransports
        ? connectOptions(transports, onTransportCreated, t, open)
        : noTransportsAdvice(t)}
      {haveTransports && haveUsb && (
        <p className="mt-3 text-xs text-base-content/60 leading-snug">
          {t("connect.note.usbExclusive")}
        </p>
      )}
    </GenericModal>
  );
};
