import { Fragment, useContext, useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { hasConfigAccess, trackpadReadConfig } from "../backends";
import { waitForRpcIdle } from "../rpc/logging";
import { useT } from "../i18n";
import { TpConn, TpSide, decodeTp } from "../trackpad/tpConfigV2";
import { Feature, ToraboCaps, fwVersionString, hasFeature } from "./toraboCaps";
import {
  decodeFeatureCaps,
  featureName,
  formatRawDescriptor,
  orderFeatures,
  toHex,
  wireGains,
  wireInfo,
} from "./fwInfo";
import {
  LayoutCell,
  LayoutDevice,
  LayoutSide,
  ModuleLayout,
  deriveModuleLayout,
  sideRole,
} from "./moduleLayout";

/**
 * One "label: value" pair in the header block.
 *
 * `mono` is off for the one value that is a sentence rather than a number: with
 * no descriptor, fwVersionString returns the "older firmware" wording, and a
 * monospace font on prose reads as a value the keyboard actually sent.
 */
function Fact({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-base-content/70 text-xs">{label}</span>
      <span className={mono ? "font-mono text-sm" : "text-sm"}>{value}</span>
    </div>
  );
}

/**
 * The descriptor's feature table, one row per entry the firmware sent, in the
 * fixed display order of fwInfo.ts's FEATURE_DISPLAY_ORDER.
 *
 * Reordered but never filtered: an id this app has never heard of still gets a
 * row (at the end), because "what does your keyboard report?" must have an
 * answer that does not depend on which version of the app is asking. A feature
 * the descriptor does NOT list has no row at all — the table says what the
 * keyboard said, and the raw bytes below have to match it row for row for that
 * to be worth anything.
 *
 * The id in hex beside each name is what ties a row back to its raw entry once
 * the order differs: it is the first byte of that entry.
 */
function FeatureTable({ caps }: { caps: ToraboCaps }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra w-auto [&_th]:text-left [&_td]:text-left [&_th]:px-5 [&_th]:py-3 [&_td]:px-5 [&_td]:py-3 [&_td]:text-sm [&_tbody_tr:hover]:bg-base-200/50">
        <thead>
          <tr>
            <th>{t("fw.col.feature")}</th>
            <th>{t("fw.col.wire")}</th>
            <th>{t("fw.col.caps")}</th>
          </tr>
        </thead>
        <tbody>
          {orderFeatures(caps.features).map((f, i) => {
            const name = featureName(f.id);
            const wire = wireInfo(f);
            // What a newer firmware wire would add for this feature. Empty for
            // firmware that is already current, and for the features whose wire
            // has never changed.
            const gains = wireGains(f);
            const { badges, unknown } = decodeFeatureCaps(f.id, f.caps);
            return (
              <tr
                key={i}
                className={wire.fwNewer ? "bg-warning/10" : undefined}
              >
                <td>
                  <span className="font-medium">{t(name.key, name.vars)}</span>
                  <span className="ml-2 font-mono text-xs text-base-content/50">
                    {toHex(f.id, 2)}
                  </span>
                </td>
                <td>
                  <span className="font-mono whitespace-nowrap">
                    {wire.appWire === null
                      ? t("fw.wire.noApp", { fw: wire.fwWire })
                      : t("fw.wire.pair", {
                          fw: wire.fwWire,
                          app: wire.appWire,
                        })}
                  </span>
                  {/* Same fact the feature's own panel states through
                      PanelActionBar's `writeBlocked` (canWriteFeature), said
                      here per row so it is visible WHICH feature is affected. */}
                  {wire.fwNewer && (
                    <span className="flex items-start gap-1 text-warning text-xs font-medium mt-1 max-w-xs">
                      <AlertTriangle
                        size={14}
                        className="shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      {t("fw.wire.fwNewer")}
                    </span>
                  )}
                  {/* The opposite case, and NOT a problem: the firmware's wire
                      predates something a newer one carries. The app reads and
                      writes this wire perfectly well — the feature simply is
                      not in that firmware. Informational styling on purpose,
                      so it cannot be mistaken for the warning above. */}
                  {gains.map((g, j) => (
                    <span
                      key={j}
                      className="flex items-start gap-1 text-info text-xs mt-1 max-w-xs"
                    >
                      <Info
                        size={14}
                        className="shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      {t("fw.wire.gain", {
                        since: g.sinceWireVer,
                        what: t(g.what.key, g.what.vars),
                      })}
                    </span>
                  ))}
                </td>
                <td>
                  {badges.length === 0 && unknown === 0 ? (
                    <span className="text-base-content/40">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {badges.map((b, j) => (
                        <span key={j} className="badge badge-outline badge-sm">
                          {t(b.key, b.vars)}
                        </span>
                      ))}
                      {/* A bit set by firmware newer than this app. Shown as
                          hex rather than hidden — it is the whole point of the
                          tab that nothing in the descriptor disappears. */}
                      {unknown !== 0 && (
                        <span
                          className="badge badge-ghost badge-sm font-mono"
                          title={t("fw.caps.unknownHint")}
                        >
                          +{toHex(unknown, 4)}
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface TrackpadDevices {
  /** null = nothing read (no trackpad feature, or the read is still running). */
  devices: LayoutDevice[] | null;
  failed: boolean;
}

/**
 * Read the trackpad wire for its per-device meta bytes — the only place the
 * firmware says where a module physically is (config.h TP_META_*).
 *
 * Keyed on `caps` rather than on a button of its own: the descriptor object is
 * replaced by every capability read, including the one the tab's Read button
 * triggers, so one press refreshes both halves of this panel and the two can
 * never describe different reads. It also means the read only ever runs after
 * we know the feature exists.
 *
 * A read is a read: no unlock, nothing written back, and a failure is not an
 * error the user has to act on — the layout section simply says the placement
 * could not be read and shows what the caps bits alone knew.
 */
function useTrackpadDevices(caps: ToraboCaps | null): TrackpadDevices {
  const [state, setState] = useState<TrackpadDevices>({
    devices: null,
    failed: false,
  });

  useEffect(() => {
    // hasFeature answers "maybe" for a null descriptor, so check caps first:
    // with no descriptor this section does not render at all, and a read here
    // would be a request nothing is waiting for.
    if (!caps || !hasFeature(caps, Feature.Trackpad)) {
      setState({ devices: null, failed: false });
      return;
    }
    let cancelled = false;
    setState({ devices: null, failed: false });
    (async () => {
      try {
        // Same courtesy the capability read pays (useToraboCaps): GATT
        // operations are serialised per device, so jumping in while the keymap
        // load is still running would delay a request the user IS waiting for.
        await waitForRpcIdle();
        if (cancelled) return;
        const cfg = decodeTp(await trackpadReadConfig());
        if (cancelled) return;
        setState({
          devices: cfg.devices.map((d) => ({
            deviceId: d.deviceId,
            meta: d.meta,
          })),
          failed: false,
        });
      } catch (e) {
        // Expected wherever the trackpad service is unreachable even though the
        // descriptor lists it. Informational: the section degrades.
        console.info("trackpad device placement unavailable:", e);
        if (!cancelled) setState({ devices: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caps]);

  return state;
}

/** One square of the 2x2 grid. An empty one means "nothing reported here",
 * which the section's own note spells out — it is not a claim that the slot is
 * empty. */
function LayoutCellBox({
  cell,
  extBase,
}: {
  cell: LayoutCell;
  extBase: boolean;
}) {
  const t = useT();
  const isExt = cell.conn === TpConn.Extension;
  return (
    <div className="bg-base-100 p-3 flex flex-col gap-1.5 min-h-[4.5rem]">
      {/* The base board is a module in its own right, and the one an LED or an
          extension-connector device proves the existence of. */}
      {isExt && extBase && (
        <span className="badge badge-outline badge-sm">
          {t("fw.mod.extBase")}
        </span>
      )}
      {cell.items.length === 0 && !(isExt && extBase) ? (
        <span className="text-base-content/40">—</span>
      ) : (
        cell.items.map((item, i) =>
          // A module the firmware placed itself and one this app worked out are
          // not the same claim, so they do not get the same badge: solid for
          // reported, dashed outline and a "(推定)" suffix for deduced.
          item.inferred ? (
            <span
              key={i}
              className="badge badge-outline badge-sm border-dashed"
              title={t("fw.mod.inferredHint")}
            >
              {t("fw.mod.inferredLabel", { item: t(item.key, item.vars) })}
            </span>
          ) : (
            <span key={i} className="badge badge-primary badge-sm">
              {t(item.key, item.vars)}
            </span>
          ),
        )
      )}
    </div>
  );
}

/**
 * What the firmware was built for, as a 2x2 of halves x connectors.
 *
 * Derived, not reported: see moduleLayout.ts for which of these facts comes
 * from the LED caps bits, which from the trackpad wire's meta byte, and which
 * module the firmware cannot place at all.
 */
function ModuleLayoutSection({ layout }: { layout: ModuleLayout | null }) {
  const t = useT();
  const sides: LayoutSide[] = [TpSide.Left, TpSide.Right];
  const cellAt = (side: LayoutSide, conn: typeof TpConn.Standard | typeof TpConn.Extension) =>
    layout?.cells.find((c) => c.side === side && c.conn === conn);

  return (
    <section className="flex flex-col gap-2 self-start max-w-3xl">
      <h3 className="text-base font-bold">{t("fw.mod.title")}</h3>
      <p className="text-sm text-base-content/70">{t("fw.mod.desc")}</p>

      {!layout ? (
        <p className="text-sm text-base-content/70">{t("fw.mod.capsUnknown")}</p>
      ) : (
        <>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-px bg-base-300 border border-base-300 rounded-md overflow-hidden">
            <div className="bg-base-200 p-2" />
            {/* Two short words, so the grid stays readable at this width. The
                full names live in the tooltip and in the section's own copy. */}
            <div
              className="bg-base-200 p-2 text-xs font-semibold"
              title={t("tp.conn.standard")}
            >
              {t("fw.mod.col.std")}
            </div>
            <div
              className="bg-base-200 p-2 text-xs font-semibold"
              title={t("fw.mod.col.extHint")}
            >
              {t("fw.mod.col.ext")}
            </div>
            {sides.map((side) => {
              const sideLabel = t(
                side === TpSide.Left ? "tp.side.left" : "tp.side.right",
              );
              // Straight from TORABO_CAPS_LED_CENTRAL_IS_LEFT: which half talks
              // to the host. Named because it is the first thing you need in
              // order to read the rest of the grid — and left off entirely when
              // the firmware never said, rather than guessed at.
              const role = sideRole(layout.central, side);
              return (
                <Fragment key={side}>
                  <div className="bg-base-200 p-2 flex flex-col gap-1 justify-center">
                    <span className="text-xs font-semibold whitespace-nowrap">
                      {role
                        ? t("fw.mod.sideRole", { side: sideLabel, role })
                        : sideLabel}
                    </span>
                  </div>
                  {[TpConn.Standard, TpConn.Extension].map((conn) => {
                    const cell = cellAt(side, conn);
                    return cell ? (
                      <LayoutCellBox
                        key={conn}
                        cell={cell}
                        extBase={layout.extBase[side]}
                      />
                    ) : null;
                  })}
                </Fragment>
              );
            })}
          </div>

          {layout.unplaced.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-base-content/70">
                {t("fw.mod.unplacedTitle")}
              </span>
              <ul className="list-disc list-inside text-sm text-base-content/80">
                {layout.unplaced.map((item, i) => (
                  <li key={i}>{t(item.key, item.vars)}</li>
                ))}
              </ul>
            </div>
          )}

          {layout.notes.map((n, i) => (
            <div
              key={i}
              className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-base-content/80"
            >
              {t(n.key, n.vars)}
            </div>
          ))}

          {/* The honest caveat, always shown: this is what the firmware said,
              not an inventory of the hardware. */}
          <p className="text-xs text-base-content/60">{t("fw.mod.note")}</p>
        </>
      )}
    </section>
  );
}

/** The bytes exactly as the keyboard sent them, grouped the way caps.h lays the
 * wire out. Collapsed: nobody needs it until something is wrong. */
function RawDescriptor({ raw }: { raw: Uint8Array }) {
  const t = useT();
  const view = formatRawDescriptor(raw);
  return (
    <details className="rounded border border-base-300 bg-base-200/30 p-2 self-start max-w-3xl">
      <summary className="cursor-pointer text-sm font-semibold select-none">
        {t("fw.raw.summary")}
      </summary>
      <div className="flex flex-col gap-2 mt-3">
        <p className="text-xs text-base-content/70">
          {t("fw.raw.desc", { bytes: raw.length })}
        </p>
        <div className="flex flex-col gap-1 font-mono text-xs">
          <div>
            <span className="text-base-content/50">{t("fw.raw.header")}: </span>
            {view.header}
          </div>
          {view.entries.map((e, i) => (
            <div key={i}>
              <span className="text-base-content/50">
                {t("fw.raw.entry", { n: i })}:{" "}
              </span>
              {e}
            </div>
          ))}
          {view.trailing && (
            <div>
              <span className="text-base-content/50">
                {t("fw.raw.trailing")}:{" "}
              </span>
              {view.trailing}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

/**
 * "What is this keyboard, exactly?" — the whole capability descriptor, shown.
 *
 * Every other panel consumes `caps` silently: it decides which tabs exist,
 * which sections a panel offers, and whether a write is safe. When one of those
 * answers is surprising there was nowhere to look. This tab is that place, and
 * doubles as the way to check a descriptor read against real hardware.
 *
 * Read-only by nature — the descriptor describes the build, so there is nothing
 * to write back (caps.c serves it from a READ-only characteristic).
 *
 * @param caps decoded descriptor, or null when the firmware could not introduce
 *   itself. Passed down rather than read again here, for the same reason every
 *   other panel takes it as a prop: MainPanels has already asked, and a second
 *   capability read would take its turn ahead of another panel's.
 * @param raw the bytes `caps` came from, for the collapsed raw section.
 * @param loading the capability read is in flight.
 *
 * There is no Read button, and that is not an omission. The descriptor is read
 * once per connection by useToraboCaps, and this panel's own trackpad read is
 * keyed on the result — so everything here arrives on its own, and a button
 * could only ask for what is already on screen. The panel says when it is
 * waiting instead.
 */
export function FirmwareInfoPanel({
  caps,
  raw,
  loading,
}: {
  caps: ToraboCaps | null;
  raw: Uint8Array | null;
  loading: boolean;
}) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  // Before the early return below: hooks run on every render or none.
  const tp = useTrackpadDevices(caps);
  const layout = deriveModuleLayout(caps, tp.devices, {
    tpReadFailed: tp.failed,
  });

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.fwinfo")} {t("preconnect.howto")}
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">{t("fw.title")}</h2>
        <p className="text-sm text-base-content/70">{t("fw.subtitle")}</p>
        {/* The only progress this panel has to report. The hook swallows a
            failed read on purpose (older firmware simply has no such service),
            so there is no error state either: "we could not ask" and "there is
            nothing to ask" are the same null, and the note further down covers
            both. */}
        {loading && (
          <p className="text-sm text-base-content/60">{t("status.reading")}</p>
        )}
      </div>

      <section className="flex flex-wrap gap-x-10 gap-y-3 rounded-md border border-base-300 bg-base-200/40 p-4 self-start">
        {/* fwVersionString is the app's one answer to "which build is this?",
            including its wording for "it could not say". The number comes from
            CONFIG_TORABO_FW_VERSION_* (caps.c), so it versions the torabo
            ext_FW modules — NOT the ZMK the keyboard is built on. Labelled
            ext_FW for that reason: read as a ZMK version it would be wrong. */}
        <Fact
          label={t("fw.hdr.version")}
          value={fwVersionString(caps)}
          mono={!!caps}
        />
        <Fact
          label={t("fw.hdr.descVersion")}
          value={caps ? String(caps.descVersion) : "—"}
        />
        <Fact
          label={t("fw.hdr.featureCount")}
          value={caps ? String(caps.features.length) : "—"}
        />
      </section>

      {/* Only once the read has finished: null while it is still running means
          "not yet", not "never", and the action bar is already saying so. */}
      {!caps && !loading && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-3xl flex flex-col gap-2">
          <span className="font-semibold">{t("fw.none.title")}</span>
          <span>{t("fw.none.desc")}</span>
          {/* A connection with no route to the config services (USB serial to
              firmware without the tunnel) lands here too, and the cause is a
              different one — say so rather than let it read as "old firmware". */}
          {!hasConfigAccess() && <span>{t("sys.backend.noToraboAccess")}</span>}
        </div>
      )}

      {caps && <FeatureTable caps={caps} />}

      {/* Outside the `caps` guard on purpose: someone who came here to see the
          module layout should find the section and a reason it is empty, not a
          gap where it used to be. With no descriptor it says so in one line and
          leaves the explaining to the block above. */}
      <ModuleLayoutSection layout={layout} />

      {caps && raw && <RawDescriptor raw={raw} />}

      <div className="rounded-md border border-info/40 bg-info/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-3xl">
        {t("fw.readOnlyNote")}
      </div>
    </div>
  );
}

export default FirmwareInfoPanel;
