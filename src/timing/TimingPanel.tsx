import { useCallback, useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { fetchLayoutKeys } from "../rpc/keyboardInfo";
import { timingReadConfig, timingWriteConfig } from "../backends";
import { PhysicalLayout, KeyPosition } from "../keyboard/PhysicalLayout";
import { PanelActionBar, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";
import { ToraboCaps, hasSplitDebounce } from "../caps/toraboCaps";
import {
  HT_FLAVOR_LABELS,
  HT_NODE_LABELS,
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

type Status = PanelStatus;

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
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="range range-sm w-48"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="font-mono text-sm w-16 text-right tabular-nums">
          {value}
          {unit}
        </span>
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
            未選択（無効）
          </span>
        )}
        {positions.map((p, i) => (
          <span key={i} className="badge badge-primary gap-1 font-mono">
            {p}
            <button
              type="button"
              aria-label={`位置 ${p} を削除`}
              onClick={() => removePos(i)}
            >
              ×
            </button>
          </span>
        ))}
        {layoutPositions && (
          <button
            type="button"
            className="btn btn-xs btn-outline gap-1"
            onClick={() => setShowPicker((v) => !v)}
          >
            {showPicker ? "レイアウトを閉じる" : "レイアウトで選ぶ"}
          </button>
        )}
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            className="input input-bordered input-xs w-16"
            value={manual}
            onChange={(e) => setManual(Math.max(0, Number(e.target.value) | 0))}
            aria-label={`${idPrefix} 番号で位置を追加`}
          />
          <button
            type="button"
            className="btn btn-xs gap-1"
            onClick={addManual}
            disabled={positions.length >= TMG_HT_POS_SLOTS}
          >
            番号で追加
          </button>
        </span>
      </div>
      {showPicker && layoutPositions && (
        <div className="border border-base-300 rounded bg-base-200/50 h-64 overflow-hidden">
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
  const set = (patch: Partial<HtNodeCfg>) => onChange({ ...cfg, ...patch });
  const presetId = matchHtPreset(node, cfg);

  return (
    <div className="rounded-md border border-base-300 p-3 flex flex-col gap-3 self-start min-w-[26rem]">
      <span className="font-bold">{HT_NODE_LABELS[node]}</span>

      <Field label="プリセット">
        <select
          className="select select-bordered select-sm w-72"
          aria-label={`${HT_NODE_LABELS[node]} preset`}
          value={presetId ?? "custom"}
          onChange={(e) => {
            if (e.target.value === "custom") return;
            onChange(applyHtPreset(node, cfg, e.target.value));
          }}
        >
          {HT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.labelJa}
            </option>
          ))}
          <option value="custom">カスタム</option>
        </select>
      </Field>

      <details className="rounded border border-base-300 bg-base-200/30 p-2">
        <summary className="cursor-pointer text-sm font-semibold select-none">
          詳細設定
        </summary>
        <div className="flex flex-col gap-3 mt-3">
          <SliderField
            label="tapping-term（長押しと判定するまでの時間）"
            value={cfg.tappingTermMs}
            min={10}
            max={2000}
            step={10}
            onChange={(v) => set({ tappingTermMs: v })}
          />

          <Field label="flavor（判定方式）">
            <select
              className="select select-bordered select-sm w-72"
              aria-label={`${HT_NODE_LABELS[node]} flavor`}
              value={cfg.flavor}
              onChange={(e) =>
                set({ flavor: Number(e.target.value) as HtFlavor })
              }
            >
              {Object.entries(HT_FLAVOR_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={cfg.quickTapMs >= 0}
                onChange={(e) =>
                  set({ quickTapMs: e.target.checked ? 150 : -1 })
                }
              />
              quick-tap を有効にする
            </label>
            <SliderField
              label="quick-tap-ms（直前のタップから連打とみなす時間）"
              value={cfg.quickTapMs >= 0 ? cfg.quickTapMs : 0}
              min={0}
              max={2000}
              step={10}
              disabled={cfg.quickTapMs < 0}
              onChange={(v) => set({ quickTapMs: v })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={cfg.requirePriorIdleMs >= 0}
                onChange={(e) =>
                  set({ requirePriorIdleMs: e.target.checked ? 150 : -1 })
                }
              />
              require-prior-idle を有効にする
            </label>
            <SliderField
              label="require-prior-idle-ms（直前に何も押していない状態が必要な時間）"
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
              positional（位置による判定調整）
            </span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={cfg.retroTap}
                onChange={(e) => set({ retroTap: e.target.checked })}
              />
              retro-tap（ホールドと判定された後に単独で離した場合、タップとして送る）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={cfg.holdTriggerOnRelease}
                onChange={(e) =>
                  set({ holdTriggerOnRelease: e.target.checked })
                }
              />
              hold-trigger-on-release（他のキーが離されるまでホールド判定を待つ）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={cfg.holdWhileUndecided}
                onChange={(e) =>
                  set({ holdWhileUndecided: e.target.checked })
                }
              />
              hold-while-undecided（判定中は他のキー送信を保留する）
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-sm">hold-trigger-key-positions（対象キー位置）</span>
              <span className="text-xs text-base-content/60">
                ここに挙げたキー位置と同時に押されたときだけホールドを優先します（未選択なら無効）。
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
 *   firmware that can't introduce itself predates the feature.
 */
export function TimingPanel({ caps }: { caps?: ToraboCaps | null }) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<TimingConfig | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Physical layout for the hold-trigger-key-positions picker — same source as
  // the combo editor's picker (fetched over the Studio RPC, on demand only).
  const [positions, setPositions] = useState<KeyPosition[] | null>(null);
  const splitDebounce = hasSplitDebounce(caps ?? null);

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

  const onRead = useCallback(async () => {
    setStatus({ kind: "busy", msg: t("status.reading") });
    try {
      await loadLayout();
      setCfg(decodeTiming(await timingReadConfig()));
      setStatus({ kind: "ok", msg: t("status.loaded") });
    } catch (e) {
      setCfg(null);
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [loadLayout, t]);

  const onWrite = useCallback(async () => {
    if (!cfg) return;
    setStatus({ kind: "busy", msg: t("status.saving") });
    try {
      await timingWriteConfig(encodeTiming(cfg));
      setStatus({ kind: "ok", msg: t("status.applied") });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [cfg, t]);

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
        <h2 className="text-fluid-xl font-bold">
          タップ反応設定
        </h2>
        <p className="text-sm text-base-content/70">
          Hold-Tap（mt / lt）の判定時間とキーボードのデバウンス時間を、再ビルドなしで調整します。
        </p>
      </div>

      <PanelActionBar
        onRead={onRead}
        onWrite={onWrite}
        writeDisabled={!cfg || status.kind === "busy"}
        status={status}
      />

      {!cfg ? (
        <p className="text-base-content/70 text-sm">{t("empty.read")}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="text-base font-bold">Hold-Tap</h3>
            <p className="text-sm text-base-content/70">
              mt（&amp;mt / mod_tap）と lt（&amp;lt / layer_tap）はノード単位の設定です。
              キーマップでそれぞれを使っている全てのキーに一括で反映されます（キーごとの個別設定はできません）。
            </p>
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
            <h3 className="text-base font-bold">デバウンス</h3>
            <p className="text-sm text-base-content/70">
              キーのチャタリング防止時間です。数字が大きいほど誤入力は減りますが、反応がわずかに遅くなります。
            </p>
            <div className="flex flex-wrap gap-6">
              <SliderField
                label="press（押下時）"
                value={cfg.debouncePressMs}
                min={1}
                max={100}
                onChange={(v) => setCfg((c) => (c ? { ...c, debouncePressMs: v } : c))}
              />
              <SliderField
                label="release（離した時）"
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
            書き込みは即反映され、本体に保存されます。Hold-Tap は次の押下から新しい設定で判定されます。
          </div>
        </>
      )}
    </div>
  );
}

export default TimingPanel;
