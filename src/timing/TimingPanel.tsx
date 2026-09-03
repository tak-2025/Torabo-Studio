import { useCallback, useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { fetchLayoutKeys } from "../rpc/keyboardInfo";
import { timingReadConfig, timingWriteConfig } from "../backends";
import { PhysicalLayout, KeyPosition } from "../keyboard/PhysicalLayout";
import { PanelActionBar } from "../misc/PanelActionBar";
import { usePanelStatus } from "../misc/usePanelStatus";
import { useT } from "../i18n";
import {
  Feature,
  ToraboCaps,
  canWriteFeature,
  hasSplitDebounce,
} from "../caps/toraboCaps";
import {
  HT_FLAVOR_LABEL_KEYS,
  HT_NODE_LABEL_KEYS,
  HT_PRESETS,
  HtFlavor,
  HtNode,
  HtNodeCfg,
  TMG_HT_POS_SLOTS,
  TimingConfig,
  applyHtPreset,
  decodeTiming,
  encodeTiming,
  matchHtPreset,
} from "./timingConfig";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-base-content/70 text-xs">{label}</span>
      {children}
    </label>
  );
}

/**
 * Touch adaptation (PLAN.md stage 4), shared by every slider on this panel.
 *
 * COARSE_RANGE enlarges the `<input type=range>` itself: the element box is the
 * press region, so the height alone buys a 44px-tall strip to press anywhere
 * on, and the thumb/track pseudo-elements are scaled so the thumb is actually
 * catchable by a fingertip. `--filler-offset` is daisyUI's own variable for
 * where the filled part of the track ends under the thumb; it tracks half the
 * thumb width, so it has to scale with it.
 *
 * (Comments here avoid bare Tailwind-looking tokens on purpose — the content
 * scanner reads comments too, and would emit unused non-coarse utilities.)
 *
 * STEP_BTN is the ±1 step affordance. A 0–2000ms range at step 10 is ~200
 * stops across the track — roughly one pixel each — so dragging can reach a
 * neighbourhood but never an exact value. The buttons are `hidden` by default
 * and every other class on them is `pointer-coarse:`-scoped, so on a fine
 * pointer they are `display: none` and contribute no geometry at all (flex
 * `gap` is not applied around a `display: none` item either).
 *
 * They sit AFTER the range input on purpose: `Field` wraps its children in a
 * `<label>`, whose labelled control is its FIRST labelable descendant, and
 * `<button>` is labelable. Placing them first would silently re-point the
 * field label at the − button.
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

/** A labelled range slider with a live numeric readout — the shared control for
 * every millisecond value on this panel (tapping-term / quick-tap /
 * require-prior-idle / debounce). */
function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "ms",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const clamped = Math.min(max, Math.max(min, value));
  const nudge = (dir: number) =>
    onChange(Math.min(max, Math.max(min, clamped + dir * step)));
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className={"range range-sm w-48 " + COARSE_RANGE}
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={clamped}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          className={STEP_BTN}
          aria-label={`${label} −${step}${unit}`}
          disabled={disabled || clamped <= min}
          onClick={() => nudge(-1)}
        >
          −
        </button>
        <span className="font-mono text-sm w-16 text-right tabular-nums">
          {value}
          {unit}
        </span>
        <button
          type="button"
          className={STEP_BTN}
          aria-label={`${label} +${step}${unit}`}
          disabled={disabled || clamped >= max}
          onClick={() => nudge(1)}
        >
          +
        </button>
      </div>
    </Field>
  );
}

/** Immutably patch one field of one ht node. */
function patchNode(
  cfg: TimingConfig,
  node: HtNode,
  patch: Partial<HtNodeCfg>,
): TimingConfig {
  const htNodes = cfg.htNodes.map((n, i) =>
    i === node ? { ...n, ...patch } : n,
  );
  return { ...cfg, htNodes };
}

/** Key-position chips + optional visual picker, shared by the two ht cards.
 * Mirrors the combo editor's position picker (src/dynamic_combos/CombosPanel.tsx). */
function PositionPicker({
  idPrefix,
  positions,
  layoutPositions,
  onChange,
}: {
  idPrefix: string;
  positions: number[];
  layoutPositions: KeyPosition[] | null;
  onChange: (positions: number[]) => void;
}) {
  const t = useT();
  const [showPicker, setShowPicker] = useState(false);
  const [manual, setManual] = useState(0);

  const removePos = (i: number) =>
    onChange(positions.filter((_, j) => j !== i));
  const togglePos = (idx: number) => {
    if (positions.includes(idx)) {
      onChange(positions.filter((p) => p !== idx));
    } else if (positions.length < TMG_HT_POS_SLOTS) {
      onChange([...positions, idx]);
    }
  };
  const addManual = () => {
    if (positions.length >= TMG_HT_POS_SLOTS || positions.includes(manual))
      return;
    onChange([...positions, manual]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {positions.length === 0 && (
          <span className="text-xs text-base-content/50">
            {t("tm.pos.none")}
          </span>
        )}
        {positions.map((p, i) => (
          <span
            key={i}
            className="badge badge-primary gap-1 font-mono pointer-coarse:h-11 pointer-coarse:pr-0 pointer-coarse:text-base"
          >
            {p}
            {/* daisyUI's badge is 20px tall and this × was the whole of it.
                Grow the badge and let the × fill it as a 44px square. */}
            <button
              type="button"
              className="pointer-coarse:size-11 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:text-xl"
              aria-label={t("tm.aria.removePos", { n: p })}
              onClick={() => removePos(i)}
            >
              ×
            </button>
          </span>
        ))}
        {layoutPositions && (
          <button
            type="button"
            className="btn btn-xs btn-outline gap-1 pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm"
            onClick={() => setShowPicker((v) => !v)}
          >
            {showPicker ? t("tm.pos.hideLayout") : t("tm.pos.pickLayout")}
          </button>
        )}
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            className="input input-bordered input-xs w-16 pointer-coarse:min-h-11 pointer-coarse:w-20 pointer-coarse:leading-[2.75rem] pointer-coarse:text-base"
            value={manual}
            onChange={(e) => setManual(Math.max(0, Number(e.target.value) | 0))}
            aria-label={t("tm.aria.addPosByNumber", { id: idPrefix })}
          />
          <button
            type="button"
            className="btn btn-xs gap-1 pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm"
            onClick={addManual}
            disabled={positions.length >= TMG_HT_POS_SLOTS}
          >
            {t("tm.pos.addByNumber")}
          </button>
        </span>
      </div>
      {showPicker && layoutPositions && (
        <div className="border border-base-300 rounded bg-base-200/50 h-64 overflow-hidden grid items-center justify-center">
          <PhysicalLayout
            positions={layoutPositions}
            oneU={38}
            zoom="auto"
            isPositionSelected={(idx) => positions.includes(idx)}
            onPositionClicked={togglePos}
          />
        </div>
      )}
    </div>
  );
}

function HtNodeCard({
  node,
  cfg,
  layoutPositions,
  onChange,
}: {
  node: HtNode;
  cfg: HtNodeCfg;
  layoutPositions: KeyPosition[] | null;
  onChange: (cfg: HtNodeCfg) => void;
}) {
  const t = useT();
  const set = (patch: Partial<HtNodeCfg>) => onChange({ ...cfg, ...patch });
  const presetId = matchHtPreset(node, cfg);
  const nodeLabel = t(HT_NODE_LABEL_KEYS[node]);

  return (
    <div className="rounded-md border border-base-300 p-3 flex flex-col gap-3 self-start min-w-[26rem]">
      <span className="font-bold">{nodeLabel}</span>

      <Field label={t("tm.preset")}>
        <select
          className="select select-bordered select-sm w-72 pointer-coarse:min-h-11 pointer-coarse:leading-[2.75rem]"
          aria-label={t("tm.aria.preset", { node: nodeLabel })}
          value={presetId ?? "custom"}
          onChange={(e) => {
            if (e.target.value === "custom") return;
            onChange(applyHtPreset(node, cfg, e.target.value));
          }}
        >
          {HT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.labelKey)}
            </option>
          ))}
          <option value="custom">{t("tm.preset.custom")}</option>
        </select>
      </Field>

      <details className="rounded border border-base-300 bg-base-200/30 p-2">
        {/* Padding rather than a height: a `<summary>` has to keep its default
            display or the disclosure triangle disappears. */}
        <summary className="cursor-pointer text-sm font-semibold select-none pointer-coarse:py-3">
          {t("tm.advanced")}
        </summary>
        <div className="flex flex-col gap-3 mt-3">
          <SliderField
            label={t("tm.tappingTerm")}
            value={cfg.tappingTermMs}
            min={10}
            max={2000}
            step={10}
            onChange={(v) => set({ tappingTermMs: v })}
          />

          <Field label={t("tm.flavor")}>
            <select
              className="select select-bordered select-sm w-72 pointer-coarse:min-h-11 pointer-coarse:leading-[2.75rem]"
              aria-label={t("tm.aria.flavor", { node: nodeLabel })}
              value={cfg.flavor}
              onChange={(e) =>
                set({ flavor: Number(e.target.value) as HtFlavor })
              }
            >
              {Object.entries(HT_FLAVOR_LABEL_KEYS).map(([v, key]) => (
                <option key={v} value={v}>
                  {t(key)}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              {/* The <label> already gives the row a 44px tap target; the box
                  only grows so there is something to aim at. It needs the
                  important modifier because daisyUI sizes checkboxes with
                  `[type=checkbox].checkbox-sm`, which outranks a utility. */}
              <input
                type="checkbox"
                className="checkbox checkbox-sm pointer-coarse:!size-6"
                checked={cfg.quickTapMs >= 0}
                onChange={(e) =>
                  set({ quickTapMs: e.target.checked ? 150 : -1 })
                }
              />
              {t("tm.quickTap.enable")}
            </label>
            <SliderField
              label={t("tm.quickTapMs")}
              value={cfg.quickTapMs >= 0 ? cfg.quickTapMs : 0}
              min={0}
              max={2000}
              step={10}
              disabled={cfg.quickTapMs < 0}
              onChange={(v) => set({ quickTapMs: v })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input
                type="checkbox"
                className="checkbox checkbox-sm pointer-coarse:!size-6"
                checked={cfg.requirePriorIdleMs >= 0}
                onChange={(e) =>
                  set({ requirePriorIdleMs: e.target.checked ? 150 : -1 })
                }
              />
              {t("tm.priorIdle.enable")}
            </label>
            <SliderField
              label={t("tm.priorIdleMs")}
              value={cfg.requirePriorIdleMs >= 0 ? cfg.requirePriorIdleMs : 0}
              min={0}
              max={2000}
              step={10}
              disabled={cfg.requirePriorIdleMs < 0}
              onChange={(v) => set({ requirePriorIdleMs: v })}
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-base-300 pt-2">
            <span className="text-xs font-semibold text-base-content/70">
              {t("tm.positional")}
            </span>
            <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input
                type="checkbox"
                className="checkbox checkbox-sm pointer-coarse:!size-6"
                checked={cfg.retroTap}
                onChange={(e) => set({ retroTap: e.target.checked })}
              />
              {t("tm.retroTap")}
            </label>
            <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input
                type="checkbox"
                className="checkbox checkbox-sm pointer-coarse:!size-6"
                checked={cfg.holdTriggerOnRelease}
                onChange={(e) =>
                  set({ holdTriggerOnRelease: e.target.checked })
                }
              />
              {t("tm.holdTriggerOnRelease")}
            </label>
            <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input
                type="checkbox"
                className="checkbox checkbox-sm pointer-coarse:!size-6"
                checked={cfg.holdWhileUndecided}
                onChange={(e) =>
                  set({ holdWhileUndecided: e.target.checked })
                }
              />
              {t("tm.holdWhileUndecided")}
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-sm">{t("tm.positions")}</span>
              <span className="text-xs text-base-content/60">
                {t("tm.positions.hint")}
              </span>
              <PositionPicker
                idPrefix={`ht-${node}`}
                positions={cfg.positions}
                layoutPositions={layoutPositions}
                onChange={(positions) => set({ positions })}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * @param caps what the connected firmware says it can do, passed down rather
 *   than read again here — MainPanels has already asked, and a second capability
 *   read would take its turn ahead of the panel's own. Undefined/null means we
 *   couldn't ask, which for the debounce note reads as "no split propagation":
 *   firmware that can't introduce itself predates the feature. For the write
 *   guard it reads as "allowed" instead — see canWriteFeature.
 */
export function TimingPanel({ caps }: { caps?: ToraboCaps | null }) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<TimingConfig | null>(null);
  const { status, read, write } = usePanelStatus({ onReadFailed: () => setCfg(null) });
  // Physical layout for the hold-trigger-key-positions picker — same source as
  // the combo editor's picker (fetched over the Studio RPC, on demand only).
  const [positions, setPositions] = useState<KeyPosition[] | null>(null);
  const splitDebounce = hasSplitDebounce(caps ?? null);
  // The firmware's wire is newer than encodeTiming can produce: read, but never
  // write back a config with the fields we couldn't decode stripped out.
  const writeBlocked = !canWriteFeature(caps ?? null, Feature.Timing);

  useEffect(() => {
    if (!conn) setPositions(null);
  }, [conn]);

  const loadLayout = useCallback(async () => {
    if (!conn) return;
    const keys = await fetchLayoutKeys(conn);
    if (!keys) return;
    setPositions(
      keys.map((k, i) => ({
        ...k,
        id: `tmg-pos-${i}`,
        children: <span className="text-[10px] font-mono opacity-80">{i}</span>,
      })),
    );
  }, [conn]);

  const onRead = useCallback(
    () =>
      read(async () => {
        await loadLayout();
        setCfg(decodeTiming(await timingReadConfig()));
      }),
    [loadLayout, read]
  );

  const onWrite = useCallback(() => {
    if (!cfg) return;
    return write(async () => timingWriteConfig(encodeTiming(cfg)));
  }, [cfg, write]);

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.timing")} {t("preconnect.howto")}
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">{t("tm.title")}</h2>
        <p className="text-sm text-base-content/70">{t("tm.subtitle")}</p>
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
          <section className="flex flex-col gap-2">
            <h3 className="text-base font-bold">Hold-Tap</h3>
            <p className="text-sm text-base-content/70">{t("tm.ht.desc")}</p>
            <div className="flex flex-wrap gap-4">
              {cfg.htNodes.map((node, i) => (
                <HtNodeCard
                  key={i}
                  node={i as HtNode}
                  cfg={node}
                  layoutPositions={positions}
                  onChange={(next) =>
                    setCfg((c) => (c ? patchNode(c, i as HtNode, next) : c))
                  }
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch">
            <h3 className="text-base font-bold">{t("tm.debounce.title")}</h3>
            <p className="text-sm text-base-content/70">
              {t("tm.debounce.desc")}
            </p>
            <div className="flex flex-wrap gap-6">
              <SliderField
                label={t("tm.debounce.press")}
                value={cfg.debouncePressMs}
                min={1}
                max={100}
                onChange={(v) => setCfg((c) => (c ? { ...c, debouncePressMs: v } : c))}
              />
              <SliderField
                label={t("tm.debounce.release")}
                value={cfg.debounceReleaseMs}
                min={1}
                max={100}
                onChange={(v) =>
                  setCfg((c) => (c ? { ...c, debounceReleaseMs: v } : c))
                }
              />
            </div>
            {/* Both halves scan their own matrix, so whether this setting reaches
                the other one depends on how the firmware was built. The keyboard
                tells us; don't promise what it can't do — or warn about a limit
                it no longer has. */}
            {splitDebounce ? (
              <div className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs leading-relaxed text-base-content/80">
                {t("timing.debounce.bothHalves")}
              </div>
            ) : (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-base-content/80">
                {t("timing.debounce.centralOnly")}
              </div>
            )}
          </section>

          <div className="rounded-md border border-info/40 bg-info/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-3xl">
            {t("tm.writeNote")}
          </div>
        </>
      )}
    </div>
  );
}

export default TimingPanel;
