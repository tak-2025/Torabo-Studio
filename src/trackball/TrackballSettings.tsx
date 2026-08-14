import { Fragment, useCallback, useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { fetchLayerInfo } from "../rpc/keyboardInfo";
import { trackballReadConfig, trackballWriteConfig } from "../backends";
import { PanelActionBar, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";
import {
  AxisCfg,
  decodeZtc,
  encodeZtc,
  LayerCfg,
  Role,
  ROLE_LABELS,
  ZtcConfig,
} from "./ztcConfig";

type Status = PanelStatus;

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

export function TrackballSettings() {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<ZtcConfig | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Number of real (claimed) keymap layers. The trackball config has a fixed,
  // compile-time layer count that also covers the torabo-reserved-layers
  // (status="reserved", appended after the real layers). getKeymap returns only
  // active layers, so we hide the trailing reserved ones from the table.
  const [activeLayers, setActiveLayers] = useState<number | null>(null);
  // Layer names by index (name || index fallback). null when not connected / RPC
  // failed → layer inputs fall back to plain number inputs. UI-only.
  const [layerNames, setLayerNames] = useState<string[] | null>(null);

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

  const onRead = useCallback(async () => {
    setStatus({ kind: "busy", msg: t("status.reading") });
    try {
      await loadLayerInfo();
      setCfg(decodeZtc(await trackballReadConfig()));
      setStatus({ kind: "ok", msg: t("status.loaded") });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [loadLayerInfo, t]);

  const onWrite = useCallback(async () => {
    if (!cfg) return;
    setStatus({ kind: "busy", msg: t("status.saving") });
    try {
      await trackballWriteConfig(encodeZtc(cfg));
      setStatus({ kind: "ok", msg: t("status.applied") });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [cfg, t]);

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
        <h2 className="text-fluid-xl font-bold">
          トラックボール設定（Bluetooth ライブ編集）
        </h2>
        <p className="text-sm text-base-content/70">
          ① <b>読み込む</b>で現在値を取得 → ② 表の値を変更 → ③ <b>書き込む</b>
          で即反映＆保存
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
          <div className="flex flex-wrap items-end gap-6 rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch">
            <h3 className="font-semibold text-base w-full">
              一時レイヤー切替（ボール操作で切替）
            </h3>
            <Field label="切替先レイヤー">
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
            <Field label="戻る時間（ms, 50〜30000）">
              <NumIn
                big
                min={50}
                max={30000}
                value={cfg.tempTimeoutMs}
                onChange={(v) => setCfg({ ...cfg, tempTimeoutMs: v })}
              />
            </Field>
          </div>

          <details className="rounded-md border border-base-300 bg-base-200/60 px-4 py-3 text-sm leading-relaxed self-start max-w-2xl">
            <summary className="cursor-pointer font-bold text-base select-none">
              {t("help.termsSummary")}
            </summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-2">
              <dt className="font-semibold text-base-content whitespace-nowrap">
                動作
              </dt>
              <dd>
                Move=カーソル移動 / Scroll=スクロール /
                Off=無効（その軸を止める）
              </dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                向き
              </dt>
              <dd>reverse にチェックで逆方向</dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">
                速度(÷)
              </dt>
              <dd>1=最速、数字が大きいほど遅い（最大32）</dd>
              <dt
                className="font-semibold text-base-content whitespace-nowrap"
                title="レイヤー（layer）"
              >
                一時レイヤー
              </dt>
              <dd>
                ✓のレイヤーでボールを動かすと、上の「切替先レイヤー」へ一時的に切替（レイヤー＝Fnキーのように切り替わるキー配置のセット）
              </dd>
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
                  <th title="レイヤー（layer）">レイヤー</th>
                  <th>軸</th>
                  <th>
                    動作
                    <br />
                    <span className="font-normal opacity-60">Role</span>
                  </th>
                  <th>
                    向き
                    <br />
                    <span className="font-normal opacity-60">reverse</span>
                  </th>
                  <th>
                    速度(÷)
                    <br />
                    <span className="font-normal opacity-60">
                      大きいほど遅い
                    </span>
                  </th>
                  <th title="レイヤー（layer）">
                    一時レイヤー
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
                            className="checkbox checkbox-sm"
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
            書き込みは即反映され、本体に保存されます。空・不正な設定は必ず通常のカーソル移動に戻ります
            （カーソルが止まることはありません）。既定値は元の挙動（レイヤー0/1=移動、2=横スクロール、3=縦スクロール）。
          </div>
        </>
      )}
    </div>
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
          className="select select-bordered select-sm"
          aria-label={`${axisLabel} axis role`}
          value={axis.role}
          onChange={(e) => onChange({ role: Number(e.target.value) as Role })}
        >
          {Object.entries(ROLE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
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
      className={
        "input input-bordered " +
        (big ? "input-md w-32 text-base" : "input-sm w-24")
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
