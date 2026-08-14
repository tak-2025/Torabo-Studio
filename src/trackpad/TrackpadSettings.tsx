import { Fragment, useCallback, useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";
import { trackpadReadConfig, trackpadWriteConfig } from "../backends";
import { PanelActionBar, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";
import {
  TpAxisCfg,
  TpConfig,
  TpRole,
  TP_ROLE_LABELS,
  TP_DEVICE_LABELS,
  decodeTp,
  encodeTp,
} from "./tpConfig";

type Status = PanelStatus;

/** Immutably patch one axis of one layer of one device. */
function patchAxis(
  cfg: TpConfig,
  dev: number,
  layer: number,
  axis: "x" | "y",
  patch: Partial<TpAxisCfg>
): TpConfig {
  const devices = cfg.devices.map((d, di) =>
    di === dev
      ? {
          ...d,
          layers: d.layers.map((l, i) =>
            i === layer ? { ...l, [axis]: { ...l[axis], ...patch } } : l
          ),
        }
      : d
  );
  return { ...cfg, devices };
}

export function TrackpadSettings() {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<TpConfig | null>(null);
  const [dev, setDev] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Hide trailing torabo-reserved layers (getKeymap returns only active layers).
  const [activeLayers, setActiveLayers] = useState<number | null>(null);

  useEffect(() => {
    if (!conn) {
      setActiveLayers(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const km = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap
          ?.getKeymap;
        if (!cancelled && km?.layers) setActiveLayers(km.layers.length);
      } catch (e) {
        console.warn("trackpad layer count fetch skipped:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conn]);

  const onRead = useCallback(async () => {
    setStatus({ kind: "busy", msg: t("status.reading") });
    try {
      const c = decodeTp(await trackpadReadConfig());
      setCfg(c);
      setDev((d) => Math.min(d, Math.max(0, c.devices.length - 1)));
      setStatus({ kind: "ok", msg: t("status.loaded") });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [t]);

  const onWrite = useCallback(async () => {
    if (!cfg) return;
    setStatus({ kind: "busy", msg: t("status.saving") });
    try {
      await trackpadWriteConfig(encodeTp(cfg));
      setStatus({ kind: "ok", msg: t("status.applied") });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [cfg, t]);

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.trackpad")} {t("preconnect.howto")}
      </div>
    );
  }

  const device = cfg?.devices[dev];
  const layerCount = cfg
    ? Math.min(activeLayers ?? cfg.layerCount, cfg.layerCount)
    : 0;

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">トラックパッド設定（Bluetooth ライブ編集）</h2>
        <p className="text-sm text-base-content/70">
          ① <b>読み込む</b>で現在値を取得 → ② デバイスとモード（レイヤー）ごとの機能を変更 → ③{" "}
          <b>書き込む</b>で即反映＆本体に保存
        </p>
      </div>
      <PanelActionBar
        onRead={onRead}
        onWrite={onWrite}
        writeDisabled={!cfg || status.kind === "busy"}
        status={status}
      />

      {!cfg || !device ? (
        <p className="text-base-content/70 text-sm">{t("empty.read")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6 rounded-md border border-base-300 bg-base-200/40 p-4 self-stretch">
            <Field label="デバイス">
              <select
                className="select select-bordered select-md w-56"
                aria-label="trackpad device"
                value={dev}
                onChange={(e) => setDev(Number(e.target.value))}
              >
                {cfg.devices.map((d, i) => (
                  <option key={i} value={i}>
                    {TP_DEVICE_LABELS[d.deviceId] ?? `device ${d.deviceId}`}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <details className="rounded-md border border-base-300 bg-base-200/60 px-4 py-3 text-sm leading-relaxed self-start max-w-2xl">
            <summary className="cursor-pointer font-bold text-base select-none">
              {t("help.termsSummary")}
            </summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-2">
              <dt className="font-semibold text-base-content whitespace-nowrap">機能</dt>
              <dd>
                Move=カーソル / Scroll=スクロール / Off=無効 / Volume=音量 /
                Brightness=輝度 / Zoom=ズーム(Ctrl+ホイール) / Browser=進む・戻る
              </dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">向き</dt>
              <dd>reverse にチェックで逆方向（上下/増減/進む戻るが反転）</dd>
              <dt className="font-semibold text-base-content whitespace-nowrap">感度(step)</dt>
              <dd>
                1=最も敏感、数字が大きいほど鈍い（最大32）。離散機能では「1操作あたりの必要移動量」
              </dd>
            </dl>
            <p className="mt-2 text-base-content/70">
              ミニトラックパッドは実質「縦方向」の操作です。主に <b>Y 軸</b>に機能を割り当ててください。
            </p>
          </details>

          <div className="shrink-0 overflow-x-auto max-w-full self-stretch border border-base-300 rounded-md">
            <table className="table table-zebra w-auto [&_th]:text-left [&_td]:text-left [&_th]:px-5 [&_th]:py-3 [&_td]:px-5 [&_td]:py-3 [&_td]:text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-base-200 [&_thead_th]:z-10 [&_tbody_tr:hover]:bg-base-200/50">
              <thead>
                <tr className="bg-base-200">
                  <th title="レイヤー（layer）">モード</th>
                  <th>軸</th>
                  <th>
                    機能
                    <br />
                    <span className="font-normal opacity-60">Role</span>
                  </th>
                  <th>
                    向き
                    <br />
                    <span className="font-normal opacity-60">reverse</span>
                  </th>
                  <th>
                    感度(step)
                    <br />
                    <span className="font-normal opacity-60">大きいほど鈍い</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {device.layers.slice(0, layerCount).map((l, i) => (
                  <Fragment key={i}>
                    <AxisRow
                      firstOfLayer
                      layerCell={i}
                      axisLabel="X"
                      axis={l.x}
                      onChange={(p) => setCfg(patchAxis(cfg, dev, i, "x", p))}
                    />
                    <AxisRow
                      axisLabel="Y"
                      axis={l.y}
                      onChange={(p) => setCfg(patchAxis(cfg, dev, i, "y", p))}
                    />
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border border-info/40 bg-info/10 px-4 py-3 text-sm leading-relaxed text-base-content/80 self-start max-w-2xl">
            書き込みは即反映され、本体に保存されます。空・不正な設定は必ず通常のカーソル移動に戻ります。
            デバイスは上のプルダウンで切り替え、それぞれ個別に保存されます。
          </div>
        </>
      )}
    </div>
  );
}

function AxisRow({
  layerCell,
  axisLabel,
  axis,
  onChange,
  firstOfLayer,
}: {
  layerCell?: React.ReactNode;
  axisLabel: string;
  axis: TpAxisCfg;
  onChange: (patch: Partial<TpAxisCfg>) => void;
  firstOfLayer?: boolean;
}) {
  return (
    <tr className={firstOfLayer ? "border-t-2 border-base-300" : ""}>
      {layerCell !== undefined && (
        <td
          rowSpan={2}
          className="font-bold text-base align-middle border-r border-base-200"
        >
          {layerCell}
        </td>
      )}
      <td className="font-medium">{axisLabel}</td>
      <td>
        <select
          className="select select-bordered select-sm"
          aria-label={`${axisLabel} axis role`}
          value={axis.role}
          onChange={(e) => onChange({ role: Number(e.target.value) as TpRole })}
        >
          {Object.entries(TP_ROLE_LABELS).map(([v, label]) => (
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
        <NumIn min={1} max={32} value={axis.step} onChange={(v) => onChange({ step: v })} />
      </td>
    </tr>
  );
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
        onChange(Number.isFinite(v) ? Math.max(min, Math.min(max, Math.trunc(v))) : min);
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col text-sm gap-1">
      <span className="text-base-content/70">{label}</span>
      {children}
    </label>
  );
}

export default TrackpadSettings;
