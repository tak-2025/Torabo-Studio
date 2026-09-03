import { Fragment, useCallback, useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { fetchLayerInfo } from "../rpc/keyboardInfo";
import { trackballReadConfig, trackballWriteConfig } from "../backends";
import { PanelActionBar } from "../misc/PanelActionBar";
import { usePanelStatus } from "../misc/usePanelStatus";
import { useT } from "../i18n";
import {
  Feature,
  ToraboCaps,
  canWriteFeature,
  hasTrackballCoast,
} from "../caps/toraboCaps";
import {
  AxisCfg,
  CoastCfg,
  decodeZtc,
  encodeZtc,
  LayerCfg,
  Role,
  ROLE_LABEL_KEYS,
  ZTC_COAST_FRICTION_MAX,
  ZTC_COAST_FRICTION_MIN,
  ZTC_COAST_THRESHOLD_MAX,
  ZTC_COAST_THRESHOLD_MIN,
  ZtcConfig,
} from "./ztcConfig";

function patchAxis(
  cfg: ZtcConfig,
  layer: number,
  axis: "x" | "y",
  patch: Partial<AxisCfg>,
): ZtcConfig {
  const layers = cfg.layers.map((l, i) =>
    i === layer ? { ...l, [axis]: { ...l[axis], ...patch } } : l,
  );
  return { ...cfg, layers };
}

function patchLayer(
  cfg: ZtcConfig,
  layer: number,
  patch: Partial<LayerCfg>,
): ZtcConfig {
  const layers = cfg.layers.map((l, i) =>
    i === layer ? { ...l, ...patch } : l,
  );
  return { ...cfg, layers };
}

/**
 * @param caps what the connected firmware says it can do, passed down rather
 *   than read again here (MainPanels has already asked; a second capability read
 *   would take its turn ahead of this panel's own). Decides whether the
 *   inertial-scroll section is offered, and whether writing is safe at all.
 */
export function TrackballSettings({ caps }: { caps?: ToraboCaps | null }) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<ZtcConfig | null>(null);
  const { status, read, write } = usePanelStatus({ onReadFailed: () => setCfg(null) });
  // Number of real (claimed) keymap layers. The trackball config has a fixed,
  // compile-time layer count that also covers the torabo-reserved-layers
  // (status="reserved", appended after the real layers). getKeymap returns only
  // active layers, so we hide the trailing reserved ones from the table.
  const [activeLayers, setActiveLayers] = useState<number | null>(null);
  // Layer names by index (name || index fallback). null when not connected / RPC
  // failed → layer inputs fall back to plain number inputs. UI-only.
  const [layerNames, setLayerNames] = useState<string[] | null>(null);
  // The firmware's wire is newer than encodeZtc can produce: read, but never
  // write back a config with the fields we couldn't decode stripped out.
  const writeBlocked = !canWriteFeature(caps ?? null, Feature.Trackball);

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
        setCfg(decodeZtc(await trackballReadConfig()));
      }),
    [loadLayerInfo, read]
  );

  const onWrite = useCallback(() => {
    if (!cfg) return;
    return write(async () => trackballWriteConfig(encodeZtc(cfg)));
  }, [cfg, write]);

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.trackball")} {t("preconnect.howto")}
      </div>
    );
  }

  // Show only real layers; reserved (unclaimed) ones are hidden.
  const layerCount = cfg
    ? Math.min(activeLayers ?? cfg.layers.length, cfg.layers.length)
    : 0;

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">{t("tb.title")}</h2>
        <p className="text-sm text-base-content/70">
          {t("tb.steps.pre")} <b>{t("tb.steps.read")}</b>
          {t("tb.steps.mid")} <b>{t("tb.steps.write")}</b>
          {t("tb.steps.post")}
        </p>
      </div>
      <PanelActionBar
        onRead={onRead}
        onWrite={onWrite}
        writeDisabled={!cfg || status.kind === "busy"}
        writeBlocked={writeBlocked}
        status={status}
      />

      {!cfg ? (
        <p className="text-base-content/70 text-sm">{t("empty.read")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6 rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch">
            <h3 className="font-semibold text-base w-full">
              {t("tb.temp.title")}
            </h3>
            <Field label={t("tb.temp.target")}>
              {layerNames ? (
                <select
                  className="select select-bordered input-md w-40 text-base"
                  aria-label="temp-layer target"
                  value={cfg.tempTarget}
                  onChange={(e) =>
                    setCfg({ ...cfg, tempTarget: Number(e.target.value) })
                  }
                >
                  {layerNames.slice(0, layerCount).map((name, i) => (
                    <option key={i} value={i}>{`${i}: ${name}`}</option>
                  ))}
                </select>
              ) : (
                <NumIn
                  big
                  max={layerCount - 1}
                  value={cfg.tempTarget}
                  onChange={(v) => setCfg({ ...cfg, tempTarget: v })}
                />
              )}
            </Field>
            <Field label={t("tb.temp.timeout")}>
              <NumIn
                big
                min={50}
                max={30000}
                value={cfg.tempTimeoutMs}
                onChange={(v) => setCfg({ ...cfg, tempTimeoutMs: v })}
              />
            </Field>
          </div>

          {/* Inertial scroll. The wire itself is the strongest evidence — a v3
              blob only comes from firmware that has the engine — so the caps bit
              only has to cover the case where the descriptor read succeeded but
              the config read has not happened yet. */}
          {cfg.hasCoast || hasTrackballCoast(caps ?? null) ? (
            <CoastCard
              coast={cfg.coast}
              onChange={(patch) =>
                setCfg({ ...cfg, coast: { ...cfg.coast, ...patch } })
              }
            />
          ) : (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-2xl">
              <span className="font-bold">{t("coast.title")}</span>
              {t("common.labelSep")}
              {t("coast.unavailable")}
            </div>
          )}

          <details className="rounded-md border border-base-300 bg-base-200/60 px-4 py-3 text-sm leading-relaxed self-start max-w-2xl">
            {/* Padding, not a height: a `<summary>` has to keep its default
                display or it loses its disclosure triangle. */}
            <summary className="cursor-pointer font-bold text-base select-none pointer-coarse:py-2.5">
              {t("help.termsSummary")}
            </summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-2">
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tb.term.role")}
              </dt>
              <dd>{t("tb.term.roleDesc")}</dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tb.term.dir")}
              </dt>
              <dd>{t("tb.term.dirDesc")}</dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                {t("tb.term.speed")}
              </dt>
              <dd>{t("tb.term.speedDesc")}</dd>
              <dt
                className="font-semibold text-base-content whitespace-nowrap"
                title={t("tb.term.layer")}
              >
                {t("tb.term.temp")}
              </dt>
              <dd>{t("tb.term.tempDesc")}</dd>
            </dl>
          </details>
          {/* shrink-0: without it, this overflow container gets min-height:0 and
              flexbox collapses it to ~0 when the panel is shorter than its content
              (table stays in the DOM but is clipped → invisible). See the same fix
              in TrackpadSettingsV2. */}
          <div className="shrink-0 overflow-x-auto max-w-full self-stretch border border-base-300 rounded-md">
            <table className="table table-zebra w-auto [&_th]:text-left [&_td]:text-left [&_th]:px-5 [&_th]:py-3 [&_td]:px-5 [&_td]:py-3 [&_td]:text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-base-200 [&_thead_th]:z-10 [&_tbody_tr:hover]:bg-base-200/50">
              <thead>
                <tr className="bg-base-200">
                  <th title={t("tb.term.layer")}>{t("tb.th.layer")}</th>
                  <th>{t("tb.th.axis")}</th>
                  <th>
                    {t("tb.term.role")}
                    <br />
                    <span className="font-normal opacity-60">Role</span>
                  </th>
                  <th>
                    {t("tb.term.dir")}
                    <br />
                    <span className="font-normal opacity-60">reverse</span>
                  </th>
                  <th>
                    {t("tb.term.speed")}
                    <br />
                    <span className="font-normal opacity-60">
                      {t("tb.th.slower")}
                    </span>
                  </th>
                  <th title={t("tb.term.layer")}>
                    {t("tb.term.temp")}
                    <br />
                    <span className="font-normal opacity-60">temp</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cfg.layers.slice(0, layerCount).map((l, i) => {
                  const layerName =
                    layerNames && layerNames[i] !== i.toLocaleString()
                      ? layerNames[i]
                      : undefined;
                  return (
                    <Fragment key={i}>
                      <AxisRow
                        firstOfLayer
                        layerCell={i}
                        layerName={layerName}
                        axisLabel="X"
                        axis={l.x}
                        onChange={(p) => setCfg(patchAxis(cfg, i, "x", p))}
                        tempCell={
                          <input
                            type="checkbox"
                            // Bare cell checkbox — no wrapping <label> to
                            // carry the tap target, so the box itself has to
                            // be 44px on a coarse pointer. Important modifier
                            // because daisyUI sizes checkboxes with
                            // `[type=checkbox].checkbox-sm`, whose specificity
                            // a plain utility cannot beat.
                            className="checkbox checkbox-sm pointer-coarse:!size-11"
                            aria-label={`layer ${i} temp-layer enable`}
                            checked={l.tempEnable}
                            onChange={(e) =>
                              setCfg(
                                patchLayer(cfg, i, {
                                  tempEnable: e.target.checked,
                                }),
                              )
                            }
                          />
                        }
                      />
                      <AxisRow
                        axisLabel="Y"
                        axis={l.y}
                        onChange={(p) => setCfg(patchAxis(cfg, i, "y", p))}
                      />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border border-info/40 bg-info/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-2xl">
            {t("tb.writeNote")}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Inertial scroll ("coast"), one set for the whole ball — it is a property of
 * the ball, not of a layer or an axis, so it sits beside the temp-layer card
 * rather than in the per-layer table.
 *
 * friction runs the same way round as the 速度(÷) column: bigger = weaker, i.e.
 * a shorter glide. The hint spells that out rather than inverting the slider,
 * so the number on screen is the number on the wire.
 */
function CoastCard({
  coast,
  onChange,
}: {
  coast: CoastCfg;
  onChange: (patch: Partial<CoastCfg>) => void;
}) {
  const t = useT();
  return (
    <section className="flex flex-col gap-3 rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch">
      <h3 className="font-semibold text-base">{t("coast.title")}</h3>
      <p className="text-sm text-base-content/70">{t("coast.desc")}</p>
      <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
        <input
          type="checkbox"
          className="checkbox checkbox-sm pointer-coarse:!size-6"
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
            min={ZTC_COAST_FRICTION_MIN}
            max={ZTC_COAST_FRICTION_MAX}
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
            min={ZTC_COAST_THRESHOLD_MIN}
            max={ZTC_COAST_THRESHOLD_MAX}
            unit={t("coast.thresholdUnit")}
            disabled={!coast.enable}
            onChange={(v) => onChange({ threshold: v })}
          />
          <span className="text-xs text-base-content/60 max-w-xs">
            {t("coast.thresholdHint")}
          </span>
        </div>
      </div>
      <p className="text-xs text-base-content/60">{t("coast.note")}</p>
    </section>
  );
}

/**
 * Touch adaptation (PLAN.md stage 4). Same pair as the timing panel's slider —
 * see src/timing/TimingPanel.tsx for the full rationale. In short: COARSE_RANGE
 * turns the range input into a 44px-tall press strip with a fingertip-sized
 * thumb, and STEP_BTN adds ±1 buttons that are `display: none` on a fine
 * pointer, so the desktop build keeps its exact geometry. The buttons follow
 * the range input because `Field`'s `<label>` binds to its first labelable
 * descendant and `<button>` is labelable.
 */
const COARSE_RANGE =
  "pointer-coarse:h-11 pointer-coarse:w-56 " +
  "pointer-coarse:[&::-webkit-slider-runnable-track]:h-2 " +
  "pointer-coarse:[&::-moz-range-track]:h-2 " +
  "pointer-coarse:[&::-webkit-slider-thumb]:size-8 " +
  "pointer-coarse:[&::-webkit-slider-thumb]:[--filler-offset:1rem] " +
  "pointer-coarse:[&::-moz-range-thumb]:size-8 " +
  "pointer-coarse:[&::-moz-range-thumb]:[--filler-offset:1rem]";

const STEP_BTN =
  "hidden pointer-coarse:inline-flex pointer-coarse:size-11 " +
  "pointer-coarse:shrink-0 pointer-coarse:items-center " +
  "pointer-coarse:justify-center pointer-coarse:rounded-md " +
  "pointer-coarse:border pointer-coarse:border-base-300 " +
  "pointer-coarse:bg-base-200 pointer-coarse:text-lg " +
  "pointer-coarse:leading-none pointer-coarse:disabled:opacity-40";

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
  const clamped = Math.min(max, Math.max(min, value));
  const nudge = (dir: number) =>
    onChange(Math.min(max, Math.max(min, clamped + dir)));
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className={"range range-sm w-48 " + COARSE_RANGE}
          aria-label={label}
          min={min}
          max={max}
          step={1}
          value={clamped}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          className={STEP_BTN}
          aria-label={`${label} −1`}
          disabled={disabled || clamped <= min}
          onClick={() => nudge(-1)}
        >
          −
        </button>
        <span className="font-mono text-sm w-20 text-right tabular-nums">
          {value}
          {unit && ` ${unit}`}
        </span>
        <button
          type="button"
          className={STEP_BTN}
          aria-label={`${label} +1`}
          disabled={disabled || clamped >= max}
          onClick={() => nudge(1)}
        >
          +
        </button>
      </div>
    </Field>
  );
}

function AxisRow({
  layerCell,
  layerName,
  axisLabel,
  axis,
  onChange,
  tempCell,
  firstOfLayer,
}: {
  layerCell?: React.ReactNode;
  /** Layer name shown under the index; omit to show the index only. */
  layerName?: string;
  axisLabel: string;
  axis: AxisCfg;
  onChange: (patch: Partial<AxisCfg>) => void;
  tempCell?: React.ReactNode;
  firstOfLayer?: boolean;
}) {
  const t = useT();
  return (
    <tr className={firstOfLayer ? "border-t-2 border-base-300" : ""}>
      {layerCell !== undefined && (
        <td rowSpan={2} className="align-middle border-r border-base-200">
          <div className="font-bold text-base">{layerCell}</div>
          {layerName && (
            <div className="text-xs font-normal text-base-content/60 mt-0.5">
              {layerName}
            </div>
          )}
        </td>
      )}
      <td className="font-medium">{axisLabel}</td>
      <td>
        <select
          className="select select-bordered select-sm pointer-coarse:min-h-11 pointer-coarse:leading-[2.75rem]"
          aria-label={`${axisLabel} axis role`}
          value={axis.role}
          onChange={(e) => onChange({ role: Number(e.target.value) as Role })}
        >
          {Object.entries(ROLE_LABEL_KEYS).map(([v, key]) => (
            <option key={v} value={v}>
              {t(key)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
          <input
            type="checkbox"
            className="checkbox checkbox-sm pointer-coarse:!size-6"
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
          value={axis.speedDiv}
          onChange={(v) => onChange({ speedDiv: v })}
        />
      </td>
      {tempCell !== undefined && (
        <td rowSpan={2} className="align-middle border-l border-base-200">
          {tempCell}
        </td>
      )}
    </tr>
  );
}

function NumIn({
  value,
  onChange,
  min = 0,
  max = 255,
  label = "value",
  big = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
  big?: boolean;
}) {
  return (
    <input
      type="number"
      // `big` is already 48px tall; only the small variant needs the coarse
      // bump. `min-height` beats daisyUI's `height: 2rem`, and the matching
      // `line-height` keeps the value vertically centred the way daisyUI's own
      // size classes do.
      className={
        "input input-bordered " +
        (big
          ? "input-md w-32 text-base"
          : "input-sm w-24 pointer-coarse:min-h-11 pointer-coarse:leading-[2.75rem]")
      }
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

export default TrackballSettings;
