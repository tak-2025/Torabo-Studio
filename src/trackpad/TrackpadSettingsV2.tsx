/**
 * Trackpad live-config UI — wire v2 (DESIGN-trackpad-v2.md §5).
 *
 * NEW file that coexists with the v1 TrackpadSettings.tsx: the firmware is not
 * flashed yet, so both must build. This one is built on the v2 codec
 * (tpConfigV2.ts) and adds, over v1:
 *   - axis role=Encoder with a pos/neg binding pair (swipe +/-), driven either
 *     by a one-click preset (Volume / Brightness / Zoom / Browser) or fully
 *     custom bindings.
 *   - a per-layer Gestures card (tap / two-finger tap / hold) when the firmware
 *     reports gesture support (cfg.hasGestures).
 *
 * The keycode / consumer picker is the app's existing HidUsagePicker (the same
 * one used by the macro & combo editors), reused for &kp (page 7) and &cp
 * (page 12). Read → edit → Write flow is identical to v1.
 *
 * To swap this in for v1 once the FW is flashed, see MainPanels.tsx (a commented
 * note shows the one-line change). Until then it is exported but not routed.
 */
import { Fragment, useCallback, useContext, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { fetchLayerInfo } from "../rpc/keyboardInfo";
import { trackpadReadConfig, trackpadWriteConfig } from "../backends";
import { HidUsagePicker } from "../behaviors/HidUsagePicker";
import { PanelActionBar } from "../misc/PanelActionBar";
import { usePanelStatus } from "../misc/usePanelStatus";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { useT } from "../i18n";
import {
  Feature,
  ToraboCaps,
  canWriteFeature,
  hasTrackpadCoast,
} from "../caps/toraboCaps";
import {
  TpAxisCfg,
  TpBinding,
  TpCoastCfg,
  TpConfig,
  TpGestures,
  TpRole,
  TpBehavior,
  NONE_BIND,
  TP_COAST_FRICTION_MAX,
  TP_COAST_FRICTION_MIN,
  TP_COAST_THRESHOLD_MAX,
  TP_COAST_THRESHOLD_MIN,
  TP_FW_BLOB_MAX,
  presetForV1Role,
  decodeTp,
  encodeTp,
  describeDevice,
  tpFirmwareReadbackSize,
  tpReadbackTooBig,
} from "./tpConfigV2";

/** HID usage-page ids for the shared picker. */
const PAGE_KEYBOARD = 0x07;
const PAGE_CONSUMER = 0x0c;

/** The translate function returned by `useT()`, passed to non-hook helpers. */
type Translate = ReturnType<typeof useT>;

/**
 * Curated consumer (&cp) usages for the media-key dropdown. `labelKey` is a
 * message key (see i18n/panels/trackpad.ts) resolved by the consumer, and `id`
 * is the raw Consumer-page (0x0C) usage id written straight to binding.param
 * (mods always 0 for &cp). Every id below was verified against the bundled HID
 * usage table (src/keyboard-and-consumer-usage-tables.json, Consumer page) —
 * do not add an id without checking it there first.
 */
const CP_CURATED: { id: number; labelKey: string }[] = [
  { id: 0xcd, labelKey: "tp.cp.playPause" }, // Play/Pause
  { id: 0xb5, labelKey: "tp.cp.next" }, // Scan Next Track
  { id: 0xb6, labelKey: "tp.cp.prev" }, // Scan Previous Track
  { id: 0xb7, labelKey: "tp.cp.stop" }, // Stop
  { id: 0xe2, labelKey: "tp.cp.mute" }, // Mute
  { id: 0xe9, labelKey: "tp.cp.volUp" }, // Volume Increment
  { id: 0xea, labelKey: "tp.cp.volDn" }, // Volume Decrement
  { id: 0x6f, labelKey: "tp.cp.briUp" }, // Display Brightness Increment
  { id: 0x70, labelKey: "tp.cp.briDn" }, // Display Brightness Decrement
  { id: 0x224, labelKey: "tp.cp.back" }, // AC Back
  { id: 0x225, labelKey: "tp.cp.forward" }, // AC Forward
  { id: 0x223, labelKey: "tp.cp.home" }, // AC Home
  { id: 0x221, labelKey: "tp.cp.search" }, // AC Search
  { id: 0x192, labelKey: "tp.cp.calc" }, // AL Calculator
];

/* Device labels used to be hardcoded here (0 = "左パッド", 1 = "右パッド (ext)"),
 * which only held for the default build. They now come from the per-device meta
 * byte the firmware reports, so the same app serves every hardware pattern —
 * central on either half, pad on the board's own FFC or on the extender, etc.
 * See describeDevice() in tpConfigV2.ts; unknown meta degrades to "デバイス N". */

const TP_BEH_LABEL_KEYS: Record<TpBehavior, string> = {
  [TpBehavior.None]: "tp.beh.none",
  [TpBehavior.Kp]: "tp.beh.kp",
  [TpBehavior.Cp]: "tp.beh.cp",
  [TpBehavior.Mo]: "tp.beh.mo",
  [TpBehavior.To]: "tp.beh.to",
  [TpBehavior.Tog]: "tp.beh.tog",
};

/**
 * Built-in encoder presets, keyed to presetForV1Role's v1 role numbers. These
 * labels double as the direct swipe entries in the flattened 機能 dropdown
 * (v1 mental model: one click picks Volume/Brightness/Zoom/Browser).
 */
const PRESETS: { key: string; role: number; labelKey: string }[] = [
  { key: "volume", role: 3, labelKey: "tp.preset.volume" },
  { key: "brightness", role: 4, labelKey: "tp.preset.brightness" },
  { key: "zoom", role: 5, labelKey: "tp.preset.zoom" },
  { key: "browser", role: 6, labelKey: "tp.preset.browser" },
];

/** Boolean (de)serializer for useLocalStorageState (open/closed section flags). */
const BOOL_LS = {
  serialize: (v: boolean) => (v ? "1" : "0"),
  deserialize: (v: string) => v === "1",
};

/**
 * Short 機能 label for the collapsed-layer swipe summary. Derives from the same
 * FUNC_OPTIONS / AXIS_META used by the dropdown, then strips the parenthetical
 * gloss (e.g. "カーソル移動（Move）" → "カーソル移動", "Cursor (Move)" →
 * "Cursor") for a compact one-liner. Both paren styles are handled so the
 * English copy trims the same way the Japanese does.
 */
function shortFuncLabel(
  t: Translate,
  funcValue: string,
  axisLabel: "X" | "Y",
): string {
  const key =
    funcValue === "scroll"
      ? AXIS_META[axisLabel].scrollLabelKey
      : FUNC_OPTIONS.find((o) => o.value === funcValue)?.labelKey;
  const full = key ? t(key) : funcValue;
  return full.replace(/\s*[（(][^（(]*[）)]\s*$/, "");
}

const bindEq = (a: TpBinding, b: TpBinding) =>
  a.behavior === b.behavior && a.param === b.param && a.mods === b.mods;

/** Return the preset key matching the current pos/neg pair, or "custom". */
function matchPreset(pos: TpBinding, neg: TpBinding): string {
  for (const p of PRESETS) {
    const { pos: pp, neg: pn } = presetForV1Role(p.role);
    if (bindEq(pos, pp) && bindEq(neg, pn)) return p.key;
  }
  return "custom";
}

/**
 * Flattened 機能 dropdown (restores the v1 one-click mental model). Continuous
 * roles, the four swipe presets, and a free-assign "custom" all live at the top
 * level; there is no separate abstract "Encoder" step any more.
 */
const FUNC_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "move", labelKey: "tp.func.move" },
  { value: "scroll", labelKey: "tp.func.scroll" },
  ...PRESETS.map((p) => ({ value: p.key, labelKey: p.labelKey })),
  { value: "custom", labelKey: "tp.func.custom" },
  { value: "off", labelKey: "tp.func.off" },
];

/**
 * Derive which flattened option an axis currently represents:
 * a continuous role maps to its own option; Encoder maps to the matching preset
 * (matchPreset) or "custom" when the pos/neg pair matches no preset.
 */
function funcValueForAxis(a: TpAxisCfg): string {
  switch (a.role) {
    case TpRole.Move:
      return "move";
    case TpRole.Scroll:
      return "scroll";
    case TpRole.Off:
      return "off";
    default:
      return matchPreset(a.pos, a.neg);
  }
}

/**
 * The single patch produced by selecting a flattened option:
 *  - continuous options set role directly (pos/neg are ignored by the codec);
 *  - a preset sets role=Encoder + its pos/neg pair in one patch;
 *  - "custom" sets role=Encoder and keeps the current pos/neg (a preset pair
 *    becomes the starting point; a continuous role leaves them as-is/NONE).
 */
function patchForFuncValue(value: string): Partial<TpAxisCfg> {
  switch (value) {
    case "move":
      return { role: TpRole.Move };
    case "scroll":
      return { role: TpRole.Scroll };
    case "off":
      return { role: TpRole.Off };
    case "custom":
      return { role: TpRole.Encoder };
    default: {
      const p = PRESETS.find((x) => x.key === value);
      if (!p) return { role: TpRole.Encoder };
      const { pos, neg } = presetForV1Role(p.role);
      return { role: TpRole.Encoder, pos, neg };
    }
  }
}

/** Immutably patch one axis of one layer of one device. */
function patchAxis(
  cfg: TpConfig,
  dev: number,
  layer: number,
  axis: "x" | "y",
  patch: Partial<TpAxisCfg>,
): TpConfig {
  const devices = cfg.devices.map((d, di) =>
    di === dev
      ? {
          ...d,
          layers: d.layers.map((l, i) =>
            i === layer ? { ...l, [axis]: { ...l[axis], ...patch } } : l,
          ),
        }
      : d,
  );
  return { ...cfg, devices };
}

/** Immutably patch one gesture slot of one layer of one device. */
function patchGesture(
  cfg: TpConfig,
  dev: number,
  layer: number,
  slot: keyof TpGestures,
  patch: Partial<TpBinding>,
): TpConfig {
  const devices = cfg.devices.map((d, di) =>
    di === dev
      ? {
          ...d,
          layers: d.layers.map((l, i) =>
            i === layer
              ? {
                  ...l,
                  gestures: {
                    ...l.gestures,
                    [slot]: { ...l.gestures[slot], ...patch },
                  },
                }
              : l,
          ),
        }
      : d,
  );
  return { ...cfg, devices };
}

/** Immutably patch one device's inertial-scroll settings. */
function patchCoast(
  cfg: TpConfig,
  dev: number,
  patch: Partial<TpCoastCfg>,
): TpConfig {
  const devices = cfg.devices.map((d, di) =>
    di === dev ? { ...d, coast: { ...d.coast, ...patch } } : d,
  );
  return { ...cfg, devices };
}

/**
 * @param caps what the connected firmware says it can do, passed down rather
 *   than read again here (MainPanels has already asked; a second capability read
 *   would take its turn ahead of this panel's own). Decides whether the
 *   inertial-scroll section is offered, and whether writing is safe at all.
 */
export function TrackpadSettingsV2({ caps }: { caps?: ToraboCaps | null }) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<TpConfig | null>(null);
  const [dev, setDev] = useState(0);
  const { status, read, write, setStatus } = usePanelStatus({
    onReadFailed: () => setCfg(null),
  });
  // Hide trailing torabo-reserved layers (getKeymap returns only active layers).
  const [activeLayers, setActiveLayers] = useState<number | null>(null);
  // Layer names by index (name || index fallback). null when not connected / RPC
  // failed → layer pickers fall back to plain number inputs. UI-only.
  const [layerNames, setLayerNames] = useState<string[] | null>(null);
  // Axes the user explicitly switched to カスタム ("dev:layer:axis" keys) — see
  // the comment at the layers map. UI-only; never written to the wire.
  const [customAxes, setCustomAxes] = useState<Set<string>>(new Set());
  // The firmware's wire is newer than encodeTp can produce: read, but never
  // write back a config with the fields we couldn't decode stripped out.
  const versionBlocked = !canWriteFeature(caps ?? null, Feature.Trackpad);
  // The second reason a write is refused, and the worse one: the firmware would
  // ACCEPT this config and then never be able to read it back, which bricks the
  // trackpad settings for good (no read => no read-modify-write => no way out
  // from the app). See TP_FW_BLOB_MAX in tpConfigV2.ts. Today's 2-device
  // hardware reads back at 1536 B, so this can only fire on a config that
  // arrived from somewhere else — the panel itself cannot add a device.
  //
  // The budget is the firmware's Kconfig default for now. A build may have
  // raised it and a planned desc_ver 2 capability descriptor will report the
  // real value; when it does, this one line reads it off `caps` and everything
  // below already takes it as an argument.
  const blobBudget = TP_FW_BLOB_MAX;
  const readbackSize = cfg ? tpFirmwareReadbackSize(cfg) : 0;
  const sizeBlocked = !!cfg && tpReadbackTooBig(cfg, blobBudget);
  const writeBlocked = versionBlocked || sizeBlocked;
  // The version gap wins when both apply — "your app is out of date" is the
  // more basic answer, and it is the order restoreBlock resolves them in too.
  // undefined leaves PanelActionBar on its own default (the version wording).
  const writeBlockedMsg =
    sizeBlocked && !versionBlocked
      ? t("tp.blocked.readbackTooBig", { size: readbackSize, max: blobBudget })
      : undefined;

  // Section fold state (persisted, open by default). UI-only.
  const [swipeOpen, setSwipeOpen] = useLocalStorageState<boolean>(
    "torabo.tp.swipeOpen",
    true,
    BOOL_LS,
  );
  const [gestureOpen, setGestureOpen] = useLocalStorageState<boolean>(
    "torabo.tp.gestureOpen",
    true,
    BOOL_LS,
  );
  // Per-layer fold state for the swipe table (empty = all expanded). UI-only.
  const [collapsedSwipeLayers, setCollapsedSwipeLayers] = useState<Set<number>>(
    new Set(),
  );
  const toggleSwipeLayer = (i: number) =>
    setCollapsedSwipeLayers((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Cleared on disconnect only. Nothing is fetched until a read is asked for:
  // see loadLayerInfo below and rpc/keyboardInfo.ts for why.
  useEffect(() => {
    if (!conn) {
      setActiveLayers(null);
      setLayerNames(null);
    }
  }, [conn]);

  const loadLayerInfo = useCallback(async () => {
    if (!conn) return;
    const info = await fetchLayerInfo(conn);
    if (!info) return;
    setActiveLayers(info.activeLayers);
    setLayerNames(info.layerNames);
  }, [conn]);

  const onRead = useCallback(
    () =>
      read(async () => {
        await loadLayerInfo();
        const c = decodeTp(await trackpadReadConfig());
        setCfg(c);
        setCustomAxes(new Set()); // fresh read: derive 機能 purely from the data
        setDev((d) => Math.min(d, Math.max(0, c.devices.length - 1)));
      }),
    [loadLayerInfo, read]
  );

  const onWrite = useCallback(() => {
    if (!cfg) return;
    // Belt as well as braces: the button is already disabled when this trips,
    // but this is the function that actually reaches the wire, and the write it
    // would emit is unrecoverable.
    if (tpReadbackTooBig(cfg, blobBudget)) {
      setStatus({
        kind: "error",
        msg: t("tp.blocked.readbackTooBig", {
          size: tpFirmwareReadbackSize(cfg),
          max: blobBudget,
        }),
      });
      return;
    }
    return write(async () => trackpadWriteConfig(encodeTp(cfg)));
  }, [blobBudget, cfg, setStatus, t, write]);

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.trackpad")} {t("preconnect.howto")}
      </div>
    );
  }

  const device = cfg?.devices[dev];
  // How many layers to show. Robust: a 0 / NaN active-layer count (odd keymap
  // RPC result) falls back to the config's own layer count instead of hiding
  // everything, and we never show fewer than the device actually carries.
  const rawLayerCount = cfg
    ? Math.min(activeLayers || cfg.layerCount, cfg.layerCount)
    : 0;
  const layerCount =
    device && device.layers.length > 0
      ? Math.max(
          1,
          Math.min(rawLayerCount || device.layers.length, device.layers.length),
        )
      : rawLayerCount;

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">{t("tp.title")}</h2>
        <p className="text-sm text-base-content/70">
          {t("tp.intro.pre")}
          <b>{t("tp.intro.read")}</b>
          {t("tp.intro.mid")}
          <b>{t("tp.intro.write")}</b>
          {t("tp.intro.post")}
        </p>
      </div>
      <PanelActionBar
        onRead={onRead}
        onWrite={onWrite}
        writeDisabled={!cfg || status.kind === "busy"}
        writeBlocked={writeBlocked}
        writeBlockedMsg={writeBlockedMsg}
        status={status}
      />

      {!cfg || !device ? (
        <p className="text-base-content/70 text-sm">{t("empty.read")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6 rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch">
            <Field label={t("tp.device")}>
              <select
                className="select select-bordered select-md w-56"
                aria-label="trackpad device"
                value={dev}
                onChange={(e) => setDev(Number(e.target.value))}
              >
                {cfg.devices.map((d, i) => (
                  <option key={i} value={i}>
                    {describeDevice(d.deviceId, d.meta, t)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <details className="rounded-md border border-base-300 bg-base-200/60 px-4 py-3 text-sm leading-relaxed self-start max-w-3xl">
            <summary className="cursor-pointer font-bold text-base select-none">
              {t("help.termsSummary")}
            </summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-2">
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tp.th.func")}
              </dt>
              <dd>
                {t("tp.help.func.1")}
                <b>{t("tp.help.func.b1")}</b>
                {t("tp.help.func.2")}
                <b>{t("tp.help.func.b2")}</b>
                {t("tp.help.func.3")}
              </dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tp.help.swipe.dt")}
              </dt>
              <dd>
                {t("tp.help.swipe.pre")}
                <b>{t("tp.help.swipe.b1")}</b>
                {t("tp.help.swipe.mid1")}
                <b>{t("tp.help.swipe.b2")}</b>
                {t("tp.help.swipe.mid2")}
                <b>{t("tp.help.swipe.b3")}</b>
                {t("tp.help.swipe.post")}
              </dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tp.help.media.dt")}
              </dt>
              <dd>{t("tp.help.media.dd")}</dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tp.help.behavior.dt")}
              </dt>
              <dd>{t("tp.help.behavior.dd")}</dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tp.th.dir")}
              </dt>
              <dd>{t("tp.help.dir.dd")}</dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tp.th.step")}
              </dt>
              <dd>{t("tp.help.step.dd")}</dd>
            </dl>
            <p className="mt-2 text-base-content/70">
              {t("tp.help.axisNote.1")}
              <b>{t("tp.help.axisNote.b")}</b>
              {t("tp.help.axisNote.2")}
            </p>
          </details>

          {/* SWIPE section — the heading is the section-level fold toggle. */}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-1.5 text-left self-start"
              aria-expanded={swipeOpen}
              onClick={() => setSwipeOpen((o) => !o)}
            >
              {swipeOpen ? (
                <ChevronDown className="w-5 h-5 shrink-0" />
              ) : (
                <ChevronRight className="w-5 h-5 shrink-0" />
              )}
              <span className="text-base font-bold">{t("tp.swipe.title")}</span>
            </button>
            {swipeOpen && (
              <p className="text-sm text-base-content/70 pl-6">
                {t("tp.swipe.desc")}
              </p>
            )}
          </div>

          {swipeOpen && (
            <>
              <div className="flex flex-wrap gap-2 pl-6">
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => setCollapsedSwipeLayers(new Set())}
                >
                  {t("tp.expandAll")}
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() =>
                    setCollapsedSwipeLayers(
                      new Set(
                        device.layers.slice(0, layerCount).map((_, i) => i),
                      ),
                    )
                  }
                >
                  {t("tp.collapseAll")}
                </button>
              </div>
              {/* shrink-0 is REQUIRED: this is the panel's only overflow container, so
              flexbox gives it min-height:0 and, when the panel is shorter than its
              content, collapses ONLY this item to ~0 height (the table stays in the
              DOM at full size but is clipped → invisible). shrink-0 keeps its height
              and lets the panel's own overflow-auto scroll instead. */}
              <div className="shrink-0 overflow-x-auto max-w-full self-stretch border border-base-300 rounded-md">
                <table className="table table-zebra w-full [&_th]:text-left [&_td]:text-left [&_th]:px-5 [&_th]:py-3 [&_td]:px-5 [&_td]:py-3 [&_td]:text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-base-200 [&_thead_th]:z-10 [&_tbody_tr:hover]:bg-base-200/50">
                  <thead>
                    <tr className="bg-base-200">
                      <th title={t("tp.th.layerTitle")}>{t("tp.th.layer")}</th>
                      <th>{t("tp.th.axis")}</th>
                      <th>
                        {t("tp.th.func")}
                        <br />
                        <span className="font-normal opacity-60">Role</span>
                      </th>
                      <th>
                        {t("tp.th.dir")}
                        <br />
                        <span className="font-normal opacity-60">reverse</span>
                      </th>
                      <th>
                        {t("tp.th.step")}
                        <br />
                        <span className="font-normal opacity-60">
                          {t("tp.th.stepSub")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {layerCount === 0 && (
                      <tr>
                        <td colSpan={5} className="text-base-content/60">
                          {t("tp.noLayerInfo")}
                        </td>
                      </tr>
                    )}
                    {device.layers.slice(0, layerCount).map((l, i) => {
                      // "custom" must stay selectable even when pos/neg happen to
                      // equal a preset pair (e.g. switching 音量→カスタム to tweak
                      // it): matchPreset alone would snap the dropdown back to the
                      // preset and the detail row could never open. The UI-local
                      // customAxes override wins over the derived value.
                      const xKey = `${dev}:${i}:x`;
                      const yKey = `${dev}:${i}:y`;
                      const xFunc = customAxes.has(xKey)
                        ? "custom"
                        : funcValueForAxis(l.x);
                      const yFunc = customAxes.has(yKey)
                        ? "custom"
                        : funcValueForAxis(l.y);
                      const layerCollapsed = collapsedSwipeLayers.has(i);
                      // Show the layer name under the index only when a real name
                      // exists (layerNames falls back to the index string).
                      const layerName =
                        layerNames && layerNames[i] !== i.toLocaleString()
                          ? layerNames[i]
                          : undefined;
                      if (layerCollapsed) {
                        // Single summary row: ▶ toggle + レイヤー番号 + compact X/Y
                        // functions. colSpan keeps the 5-column table valid.
                        return (
                          <tr key={i} className="border-t-2 border-base-300">
                            <td className="align-middle border-r border-base-200">
                              <button
                                type="button"
                                className="flex items-start gap-1 text-left"
                                aria-label={t("tp.aria.expandLayer", { n: i })}
                                onClick={() => toggleSwipeLayer(i)}
                              >
                                <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>
                                  <span className="font-bold text-base">
                                    {i}
                                  </span>
                                  {layerName && (
                                    <span className="block text-xs font-normal text-base-content/60">
                                      {layerName}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </td>
                            <td
                              colSpan={4}
                              className="text-sm text-base-content/70"
                            >
                              X: {shortFuncLabel(t, xFunc, "X")} / Y:{" "}
                              {shortFuncLabel(t, yFunc, "Y")}
                            </td>
                          </tr>
                        );
                      }
                      const xCustom = xFunc === "custom";
                      const yCustom = yFunc === "custom";
                      const rows = 2 + (xCustom ? 1 : 0) + (yCustom ? 1 : 0);
                      const changeFunc = (
                        key: string,
                        axis: "x" | "y",
                        value: string,
                      ) => {
                        setCustomAxes((prev) => {
                          const next = new Set(prev);
                          if (value === "custom") next.add(key);
                          else next.delete(key);
                          return next;
                        });
                        setCfg(
                          patchAxis(
                            cfg,
                            dev,
                            i,
                            axis,
                            patchForFuncValue(value),
                          ),
                        );
                      };
                      return (
                        <Fragment key={i}>
                          <AxisRow
                            layerCell={i}
                            layerName={layerName}
                            layerRowSpan={rows}
                            onToggleCollapse={() => toggleSwipeLayer(i)}
                            axisLabel="X"
                            axis={l.x}
                            funcValue={xFunc}
                            onFuncChange={(v) => changeFunc(xKey, "x", v)}
                            onChange={(p) =>
                              setCfg(patchAxis(cfg, dev, i, "x", p))
                            }
                          />
                          {xCustom && (
                            <EncoderDetailRow
                              axis={l.x}
                              layerCount={layerCount}
                              layerNames={layerNames}
                              onChange={(p) =>
                                setCfg(patchAxis(cfg, dev, i, "x", p))
                              }
                            />
                          )}
                          <AxisRow
                            axisLabel="Y"
                            axis={l.y}
                            funcValue={yFunc}
                            onFuncChange={(v) => changeFunc(yKey, "y", v)}
                            onChange={(p) =>
                              setCfg(patchAxis(cfg, dev, i, "y", p))
                            }
                          />
                          {yCustom && (
                            <EncoderDetailRow
                              axis={l.y}
                              layerCount={layerCount}
                              layerNames={layerNames}
                              onChange={(p) =>
                                setCfg(patchAxis(cfg, dev, i, "y", p))
                              }
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Inertial scroll, per device. The wire itself is the strongest
              evidence — a v3 blob only comes from firmware that has the engine —
              so the caps bit only has to cover the case where the descriptor read
              succeeded but the config read has not happened yet. */}
          {cfg.hasCoast || hasTrackpadCoast(caps ?? null) ? (
            <CoastCard
              coast={device.coast}
              onChange={(patch) => setCfg(patchCoast(cfg, dev, patch))}
            />
          ) : (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-3xl">
              <span className="font-bold">{t("coast.title")}</span>
              {t("common.labelSep")}
              {t("coast.unavailable")}
            </div>
          )}

          {cfg.hasGestures && (
            <GesturesCard
              device={device}
              layerCount={layerCount}
              layerNames={layerNames}
              open={gestureOpen}
              onToggleOpen={() => setGestureOpen((o) => !o)}
              onChange={(layer, slot, patch) =>
                setCfg(patchGesture(cfg, dev, layer, slot, patch))
              }
            />
          )}

          <div className="rounded-md border border-info/40 bg-info/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-3xl">
            {t("tp.writeNote")} {t("trackpad.writeScope")}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Per-axis display strings: the 軸 cell label (direction + axis letter) and the
 * axis-specific wording of the scroll option in the 機能 dropdown. UI-only —
 * the option's value is still "scroll" and the patch is unchanged.
 */
const AXIS_META: Record<
  "X" | "Y",
  { rowLabelKey: string; scrollLabelKey: string }
> = {
  X: { rowLabelKey: "tp.axis.x", scrollLabelKey: "tp.axis.x.scroll" },
  Y: { rowLabelKey: "tp.axis.y", scrollLabelKey: "tp.axis.y.scroll" },
};

function AxisRow({
  layerCell,
  layerName,
  layerRowSpan,
  onToggleCollapse,
  axisLabel,
  axis,
  funcValue,
  onFuncChange,
  onChange,
}: {
  layerCell?: number;
  /** Layer name shown under the index; omit to show the index only. */
  layerName?: string;
  layerRowSpan?: number;
  /** When set, the レイヤー cell shows a ▼ button that folds this layer. */
  onToggleCollapse?: () => void;
  axisLabel: "X" | "Y";
  axis: TpAxisCfg;
  /** Displayed 機能 value (parent applies the customAxes override). */
  funcValue: string;
  onFuncChange: (value: string) => void;
  onChange: (patch: Partial<TpAxisCfg>) => void;
}) {
  const t = useT();
  const meta = AXIS_META[axisLabel];
  return (
    <tr className={layerCell !== undefined ? "border-t-2 border-base-300" : ""}>
      {layerCell !== undefined && (
        <td
          rowSpan={layerRowSpan}
          className="align-middle border-r border-base-200"
        >
          <div className="flex items-start gap-1">
            {onToggleCollapse && (
              <button
                type="button"
                className="shrink-0 mt-0.5"
                aria-label={t("tp.aria.collapseLayer", { n: layerCell })}
                onClick={onToggleCollapse}
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="font-bold text-base">{layerCell}</div>
              {layerName && (
                <div className="text-xs font-normal text-base-content/60 mt-0.5">
                  {layerName}
                </div>
              )}
            </div>
          </div>
        </td>
      )}
      <td className="font-medium whitespace-nowrap">{t(meta.rowLabelKey)}</td>
      <td>
        <select
          className="select select-bordered select-sm"
          aria-label={`${axisLabel} axis function`}
          value={funcValue}
          onChange={(e) => onFuncChange(e.target.value)}
        >
          {FUNC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.value === "scroll" ? meta.scrollLabelKey : o.labelKey)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={axis.reverse}
            onChange={(e) => onChange({ reverse: e.target.checked })}
          />
          reverse
        </label>
      </td>
      <td>
        <NumIn
          min={1}
          max={32}
          value={axis.step}
          onChange={(v) => onChange({ step: v })}
        />
      </td>
    </tr>
  );
}

/**
 * Full-width detail row shown under a "custom" swipe axis: the ＋/− binding
 * editors. Preset selection now lives in the 機能 dropdown, so this row only
 * appears when the axis is a free-assign custom Encoder.
 */
function EncoderDetailRow({
  axis,
  layerCount,
  layerNames,
  onChange,
}: {
  axis: TpAxisCfg;
  layerCount: number;
  layerNames: string[] | null;
  onChange: (patch: Partial<TpAxisCfg>) => void;
}) {
  const t = useT();
  return (
    <tr className="bg-base-200/30">
      <td colSpan={4} className="!py-4">
        <div className="flex flex-col gap-4 max-w-3xl">
          <span className="text-xs text-base-content/60">
            {t("tp.encDetail.hint")}
          </span>
          <BindingEditor
            label={t("tp.bind.pos")}
            binding={axis.pos}
            layerCount={layerCount}
            layerNames={layerNames}
            onChange={(p) => onChange({ pos: { ...axis.pos, ...p } })}
          />
          <BindingEditor
            label={t("tp.bind.neg")}
            binding={axis.neg}
            layerCount={layerCount}
            layerNames={layerNames}
            onChange={(p) => onChange({ neg: { ...axis.neg, ...p } })}
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * Inertial scroll ("coast") for the selected device. One set per device — it is
 * a property of the pad, not of a layer or an axis — so it lives outside the
 * per-layer table and follows the デバイス dropdown.
 *
 * friction runs the same way round as the 速さ・感度(step) column: bigger =
 * weaker, i.e. a shorter glide. The hint spells that out rather than inverting
 * the slider, so the number on screen is the number on the wire.
 */
function CoastCard({
  coast,
  onChange,
}: {
  coast: TpCoastCfg;
  onChange: (patch: Partial<TpCoastCfg>) => void;
}) {
  const t = useT();
  return (
    <section className="rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch flex flex-col gap-3">
      <h3 className="text-base font-bold">{t("coast.title")}</h3>
      <p className="text-sm text-base-content/70">{t("coast.desc")}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          aria-label="coast enable"
          checked={coast.enable}
          onChange={(e) => onChange({ enable: e.target.checked })}
        />
        {t("coast.enable")}
      </label>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1">
          <SliderField
            label={t("coast.friction")}
            value={coast.friction}
            min={TP_COAST_FRICTION_MIN}
            max={TP_COAST_FRICTION_MAX}
            unit=""
            disabled={!coast.enable}
            onChange={(v) => onChange({ friction: v })}
          />
          <span className="text-xs text-base-content/60 max-w-xs">
            {t("coast.frictionHint")}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <SliderField
            label={t("coast.threshold")}
            value={coast.threshold}
            min={TP_COAST_THRESHOLD_MIN}
            max={TP_COAST_THRESHOLD_MAX}
            unit={t("coast.thresholdUnit")}
            disabled={!coast.enable}
            onChange={(v) => onChange({ threshold: v })}
          />
          <span className="text-xs text-base-content/60 max-w-xs">
            {t("coast.thresholdHint")}
          </span>
        </div>
      </div>
      <p className="text-xs text-base-content/60">
        {t("coast.note")} {t("coast.perDevice")}
      </p>
    </section>
  );
}

/** A labelled range slider with a live numeric readout. Mirrors the timing
 * panel's control so every slider in the app reads the same. */
function SliderField({
  label,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="range range-sm w-48"
          aria-label={label}
          min={min}
          max={max}
          step={1}
          value={Math.min(max, Math.max(min, value))}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="font-mono text-sm w-20 text-right tabular-nums">
          {value}
          {unit && ` ${unit}`}
        </span>
      </div>
    </Field>
  );
}

/** Per-layer gesture bindings (tap / two-finger tap / hold). */
function GesturesCard({
  device,
  layerCount,
  layerNames,
  open,
  onToggleOpen,
  onChange,
}: {
  device: TpConfig["devices"][number];
  layerCount: number;
  layerNames: string[] | null;
  /** Section-level fold state (persisted by the parent). */
  open: boolean;
  onToggleOpen: () => void;
  onChange: (
    layer: number,
    slot: keyof TpGestures,
    patch: Partial<TpBinding>,
  ) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch flex flex-col gap-4">
      <div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-left w-full"
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          {open ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h3 className="text-base font-bold">{t("tp.gest.title")}</h3>
        </button>
        {open && (
          <p className="text-sm text-base-content/70 pl-6">
            {t("tp.gest.desc")}
          </p>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-4">
          {device.layers.slice(0, layerCount).map((l, i) => {
            const name =
              layerNames && layerNames[i] !== i.toLocaleString()
                ? layerNames[i]
                : undefined;
            return (
              <details
                key={i}
                open
                className="rounded-md border border-base-300 bg-base-100 p-3"
              >
                <summary
                  className="font-bold text-sm cursor-pointer select-none"
                  title={t("tp.th.layerTitle")}
                >
                  {t("tp.gest.layer", { n: i })}
                  {name && t("tp.gest.layerName", { name })}
                </summary>
                <div className="grid gap-4 md:grid-cols-1 mt-3">
                  <BindingEditor
                    label={t("tp.gest.tap")}
                    binding={l.gestures.tap}
                    layerCount={layerCount}
                    layerNames={layerNames}
                    onChange={(p) => onChange(i, "tap", p)}
                  />
                  <BindingEditor
                    label={t("tp.gest.dtap")}
                    binding={l.gestures.dtap}
                    layerCount={layerCount}
                    layerNames={layerNames}
                    onChange={(p) => onChange(i, "dtap", p)}
                  />
                  <BindingEditor
                    label={t("tp.gest.tap2")}
                    binding={l.gestures.tap2}
                    layerCount={layerCount}
                    layerNames={layerNames}
                    onChange={(p) => onChange(i, "tap2", p)}
                  />
                  <BindingEditor
                    label={t("tp.gest.hold")}
                    binding={l.gestures.hold}
                    layerCount={layerCount}
                    layerNames={layerNames}
                    onChange={(p) => onChange(i, "hold", p)}
                  />
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A single binding descriptor editor: behavior dropdown + a param picker that
 * depends on the behavior (HidUsagePicker for &kp/&cp, layer number for
 * &mo/&to/&tog, nothing for &none). Modifiers for &kp are handled inside
 * HidUsagePicker (encoded in the usage's high byte) and mapped to binding.mods.
 */
function BindingEditor({
  label,
  binding,
  layerCount,
  layerNames,
  onChange,
}: {
  label: string;
  binding: TpBinding;
  layerCount: number;
  /** Layer names for the レイヤー picker; null → fall back to a number input. */
  layerNames: string[] | null;
  onChange: (patch: Partial<TpBinding>) => void;
}) {
  const t = useT();
  const b = binding;
  const setBehavior = (behavior: TpBehavior) => {
    // Switching behavior type resets the param/mods to a clean NONE-like slate.
    onChange({ behavior, param: NONE_BIND.param, mods: NONE_BIND.mods });
  };

  const isLayer =
    b.behavior === TpBehavior.Mo ||
    b.behavior === TpBehavior.To ||
    b.behavior === TpBehavior.Tog;

  return (
    <div className="flex flex-col gap-2 rounded border border-base-300 bg-base-100/60 p-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold w-40 shrink-0">{label}</span>
        <select
          className="select select-bordered select-sm"
          aria-label={`${label} behavior`}
          value={b.behavior}
          onChange={(e) => setBehavior(Number(e.target.value) as TpBehavior)}
        >
          {Object.entries(TP_BEH_LABEL_KEYS).map(([v, labelKey]) => (
            <option key={v} value={v}>
              {t(labelKey)}
            </option>
          ))}
        </select>
        {isLayer && (
          <label className="flex items-center gap-2 text-sm">
            <span
              className="text-base-content/70"
              title={t("tp.th.layerTitle")}
            >
              {t("tp.th.layer")}
            </span>
            {layerNames ? (
              <select
                className="select select-bordered select-sm"
                aria-label={`${label} layer`}
                value={b.param}
                onChange={(e) => onChange({ param: Number(e.target.value) })}
              >
                {layerNames.slice(0, layerCount).map((name, i) => (
                  <option key={i} value={i}>{`${i}: ${name}`}</option>
                ))}
              </select>
            ) : (
              <NumIn
                min={0}
                max={Math.max(0, layerCount - 1)}
                value={b.param}
                onChange={(v) => onChange({ param: v })}
              />
            )}
          </label>
        )}
      </div>
      {b.behavior === TpBehavior.None && (
        <span className="text-xs text-base-content/60">
          {t("tp.bind.noneHint")}
        </span>
      )}
      {b.behavior === TpBehavior.Kp && (
        <>
          <HidUsagePicker
            usagePages={[{ id: PAGE_KEYBOARD }]}
            value={b.param ? usageFromKp(b.param, b.mods) : undefined}
            onValueChanged={(v) =>
              onChange(
                v === undefined
                  ? { param: 0, mods: 0 }
                  : { param: v & 0xffff, mods: (v >>> 24) & 0xff },
              )
            }
            collapsibleVisual
          />
          <span className="text-xs text-base-content/60">
            {t("tp.bind.kpHint")}
          </span>
        </>
      )}
      {b.behavior === TpBehavior.Cp && (
        <CpPicker param={b.param} onChange={onChange} />
      )}
    </div>
  );
}

const CP_OTHER = "__other__";
const CP_CURATED_IDS = new Set(CP_CURATED.map((c) => c.id));

/**
 * Consumer (&cp) param picker: a curated Japanese dropdown for the common media
 * keys plus an「その他」escape hatch that reveals the full HidUsagePicker
 * (consumer page). The full picker is shown either when the user picks その他 or
 * automatically when the current param is a valid-but-uncurated usage (param!=0
 * and not in CP_CURATED) so an existing custom binding stays editable.
 * param maps 1:1 to the consumer usage id; mods are always forced to 0.
 */
function CpPicker({
  param,
  onChange,
}: {
  param: number;
  onChange: (patch: Partial<TpBinding>) => void;
}) {
  const t = useT();
  const [showOther, setShowOther] = useState(false);
  const notInList = param !== 0 && !CP_CURATED_IDS.has(param);
  const useFull = showOther || notInList;

  const selectValue = useFull ? CP_OTHER : param === 0 ? "" : String(param);

  return (
    <div className="flex flex-col gap-2">
      <select
        className="select select-bordered select-sm"
        aria-label="media key"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CP_OTHER) {
            setShowOther(true);
            return;
          }
          setShowOther(false);
          onChange({ param: Number(v), mods: 0 });
        }}
      >
        <option value="" disabled>
          {t("tp.cp.placeholder")}
        </option>
        {CP_CURATED.map((c) => (
          <option key={c.id} value={c.id}>
            {t(c.labelKey)}
          </option>
        ))}
        <option value={CP_OTHER}>{t("tp.cp.other")}</option>
      </select>
      {useFull && (
        <HidUsagePicker
          usagePages={[{ id: PAGE_CONSUMER }]}
          value={param ? usageFromPage(PAGE_CONSUMER, param) : undefined}
          onValueChanged={(v) =>
            onChange(
              v === undefined
                ? { param: 0, mods: 0 }
                : { param: v & 0xffff, mods: 0 },
            )
          }
          collapsibleVisual
        />
      )}
    </div>
  );
}

/** Build a HidUsagePicker value for &kp: page 7 + usage id + mods in high byte. */
function usageFromKp(param: number, mods: number): number {
  return usageFromPage(PAGE_KEYBOARD, param) | ((mods & 0xff) << 24);
}
function usageFromPage(page: number, id: number): number {
  return (page << 16) | (id & 0xffff);
}

function NumIn({
  value,
  onChange,
  min = 0,
  max = 255,
  label = "value",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <input
      type="number"
      className="input input-bordered input-sm w-24"
      aria-label={label}
      title={label}
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = Number(e.target.value);
        onChange(
          Number.isFinite(v)
            ? Math.max(min, Math.min(max, Math.trunc(v)))
            : min,
        );
      }}
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col text-sm gap-1">
      <span className="text-base-content/70">{label}</span>
      {children}
    </label>
  );
}

export default TrackpadSettingsV2;
