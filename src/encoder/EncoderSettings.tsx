import { useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";
import { encoderReadConfig, encoderWriteConfig } from "../tauri/encoder";
import { HidUsagePicker } from "../behaviors/HidUsagePicker";
import { PanelActionBar, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";
import {
  EncBehavior,
  EncBinding,
  EncConfig,
  EncLayerCfg,
  EncMod,
  ENC_PRESETS,
  NONE_BIND,
  bind,
  cloneBind,
  decodeEnc,
  encodeEnc,
  presetIdFor,
} from "./encConfig";

/** HID usage-page ids for the raw picker (same ids the trackpad panel uses). */
const PAGE_KEYBOARD = 0x07;
const PAGE_CONSUMER = 0x0c;

/** ZMK encodes a usage as page << 16 | id; the picker speaks that, our wire doesn't. */
const usageFromPage = (page: number, id: number): number => (page << 16) | (id & 0xffff);

type Status = PanelStatus;

/** The three things an encoder can do on a layer. */
type SlotKey = "cw" | "ccw" | "btn";

const SLOT_LABEL: Record<SlotKey, string> = {
  cw: "右回し",
  ccw: "左回し",
  btn: "押し込み",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-base-content/70 text-xs">{label}</span>
      {children}
    </label>
  );
}

/**
 * One assignable slot: pick the ZMK behavior, then its parameter. Layer behaviors
 * (&mo/&to/&tog) take a layer index; &kp/&cp take a HID usage, which we hand to
 * the shared usage picker so any keycode is reachable — the firmware synthesises
 * the binding at runtime, so there is no fixed palette to be limited by.
 */
function BindingEditor({
  value,
  onChange,
  layerNames,
}: {
  value: EncBinding;
  onChange: (b: EncBinding) => void;
  layerNames: string[] | null;
}) {
  const isKey = value.behavior === EncBehavior.Kp;
  const isConsumer = value.behavior === EncBehavior.Cp;
  const isLayer =
    value.behavior === EncBehavior.Mo ||
    value.behavior === EncBehavior.To ||
    value.behavior === EncBehavior.Tog;

  const setMod = (bit: number, on: boolean) =>
    onChange({ ...value, mods: on ? value.mods | bit : value.mods & ~bit });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="種類">
        <select
          className="select select-bordered select-sm w-36"
          aria-label="behavior"
          value={value.behavior}
          onChange={(e) => {
            const behavior = Number(e.target.value) as EncBehavior;
            // Params mean different things per behavior; don't carry a stale one over.
            onChange({ behavior, mods: 0, param: 0 });
          }}
        >
          <option value={EncBehavior.None}>なし</option>
          <option value={EncBehavior.Kp}>キー (&amp;kp)</option>
          <option value={EncBehavior.Cp}>メディア (&amp;cp)</option>
          <option value={EncBehavior.Mo}>レイヤー押下中 (&amp;mo)</option>
          <option value={EncBehavior.To}>レイヤー切替 (&amp;to)</option>
          <option value={EncBehavior.Tog}>レイヤートグル (&amp;tog)</option>
        </select>
      </Field>

      {(isKey || isConsumer) && (
        <Field label={isConsumer ? "メディア操作" : "キー"}>
          {/* The picker speaks ZMK's encoded usage (page << 16 | id, mods << 24),
              while the wire keeps page/mods/id apart — convert on both edges. */}
          <HidUsagePicker
            usagePages={[{ id: isConsumer ? PAGE_CONSUMER : PAGE_KEYBOARD }]}
            collapsibleVisual
            value={
              value.param
                ? usageFromPage(isConsumer ? PAGE_CONSUMER : PAGE_KEYBOARD, value.param) |
                  ((value.mods & 0xff) << 24)
                : undefined
            }
            onValueChanged={(v?: number) =>
              onChange(
                v === undefined
                  ? { ...value, param: 0, mods: 0 }
                  : {
                      ...value,
                      param: v & 0xffff,
                      // Consumer usages carry no modifiers.
                      mods: isConsumer ? 0 : (v >>> 24) & 0xff,
                    }
              )
            }
          />
        </Field>
      )}

      {isKey && (
        <Field label="修飾キー">
          <div className="flex gap-2">
            {(
              [
                ["Ctrl", EncMod.LCTL],
                ["Shift", EncMod.LSFT],
                ["Alt", EncMod.LALT],
                ["GUI", EncMod.LGUI],
              ] as const
            ).map(([label, bit]) => (
              <label key={label} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={(value.mods & bit) !== 0}
                  onChange={(e) => setMod(bit, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </Field>
      )}

      {isLayer && (
        <Field label="レイヤー">
          <select
            className="select select-bordered select-sm w-40"
            aria-label="layer"
            value={value.param}
            onChange={(e) => onChange({ ...value, param: Number(e.target.value) })}
          >
            {(layerNames ?? Array.from({ length: 10 }, (_, i) => String(i))).map((name, i) => (
              <option key={i} value={i}>
                {i}: {name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

/**
 * Encoder settings — per layer, what the knob does turning each way and what the
 * click does.
 *
 * The encoder is not a keymap key, so none of this lives in the keymap: the
 * firmware resolves every action from this store at the moment it fires. That is
 * why assignments apply live, with no rebuild and no key position spent.
 */
export function EncoderSettings() {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<EncConfig | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // getKeymap returns only the ACTIVE layers, so trailing reserved layers stay hidden.
  const [activeLayers, setActiveLayers] = useState<number | null>(null);
  const [layerNames, setLayerNames] = useState<string[] | null>(null);
  // Layers the user switched to カスタム, so a pair that happens to match a preset
  // doesn't snap the dropdown back. UI-only; never written to the wire.
  const [customLayers, setCustomLayers] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!conn) {
      setActiveLayers(null);
      setLayerNames(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const km = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap?.getKeymap;
        if (!cancelled && km?.layers) {
          setActiveLayers(km.layers.length);
          setLayerNames(km.layers.map((l, i) => l.name || i.toLocaleString()));
        }
      } catch (e) {
        // Not fatal: without names we fall back to layer indices.
        console.warn("encoder layer name fetch skipped:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conn]);

  const onRead = async () => {
    setStatus({ kind: "busy", msg: "読み込み中…" });
    try {
      const raw = await encoderReadConfig();
      setCfg(decodeEnc(raw));
      setCustomLayers(new Set());
      setStatus({ kind: "ok", msg: "読み込みました" });
    } catch (e) {
      setCfg(null);
      setStatus({ kind: "error", msg: String(e) });
    }
  };

  const onWrite = async () => {
    if (!cfg) return;
    setStatus({ kind: "busy", msg: "書き込み中…" });
    try {
      await encoderWriteConfig(encodeEnc(cfg));
      setStatus({ kind: "ok", msg: "書き込みました（即反映＆本体に保存）" });
    } catch (e) {
      setStatus({ kind: "error", msg: String(e) });
    }
  };

  const patchLayer = (i: number, patch: Partial<EncLayerCfg>) => {
    if (!cfg) return;
    const layers = cfg.layers.slice();
    layers[i] = { ...layers[i], ...patch };
    setCfg({ layers });
  };

  const applyPreset = (i: number, presetId: string) => {
    if (presetId === "custom") {
      setCustomLayers((prev) => new Set(prev).add(i));
      return;
    }
    const p = ENC_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setCustomLayers((prev) => {
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
    patchLayer(i, { cw: cloneBind(p.cw), ccw: cloneBind(p.ccw) });
  };

  // Only show layers the keyboard actually has, when we know.
  const shown = cfg ? cfg.layers.slice(0, activeLayers ?? cfg.layers.length) : [];

  return (
    <div className="flex flex-col items-start gap-4 p-4">
      <div className="text-base-content/70 text-sm">
        <p>
          ロータリーエンコーダの<b>右回し・左回し・押し込み</b>を、レイヤーごとに割り当てます。
        </p>
        <p>
          エンコーダはキーマップ上のキーではないため、<b>キー位置を消費しません</b>。
          <b>書き込む</b>で即反映＆本体に保存されます（再ビルド不要）。
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
        <div className="flex flex-col gap-4 self-stretch">
          {shown.map((layer, i) => {
            const detected = presetIdFor(layer.cw, layer.ccw);
            const isCustom = customLayers.has(i) || detected === null;
            const layerLabel =
              layerNames && layerNames[i] !== i.toLocaleString()
                ? `${i}: ${layerNames[i]}`
                : `レイヤー ${i}`;

            return (
              <section
                key={i}
                className="flex flex-col gap-3 rounded-md border border-base-300 bg-base-200/40 p-4"
              >
                <h3 className="text-sm font-semibold">{layerLabel}</h3>

                <Field label="回転の機能">
                  <select
                    className="select select-bordered select-sm w-64"
                    aria-label={`rotation preset layer ${i}`}
                    value={isCustom ? "custom" : (detected as string)}
                    onChange={(e) => applyPreset(i, e.target.value)}
                  >
                    {ENC_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    <option value="custom">カスタム（個別に割当）</option>
                  </select>
                </Field>

                {isCustom && (
                  <div className="flex flex-col gap-3 border-l-2 border-base-300 pl-4">
                    {(["cw", "ccw"] as SlotKey[]).map((slot) => (
                      <div key={slot} className="flex flex-col gap-1">
                        <span className="text-xs font-medium">{SLOT_LABEL[slot]}</span>
                        <BindingEditor
                          value={layer[slot]}
                          onChange={(b) => patchLayer(i, { [slot]: b } as Partial<EncLayerCfg>)}
                          layerNames={layerNames}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-1 border-t border-base-300 pt-3">
                  <span className="text-xs font-medium">{SLOT_LABEL.btn}</span>
                  <BindingEditor
                    value={layer.btn}
                    onChange={(b) => patchLayer(i, { btn: b })}
                    layerNames={layerNames}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Exported for stories/tests: a config with nothing assigned. */
export const emptyEncConfig = (layerCount: number): EncConfig => ({
  layers: Array.from({ length: layerCount }, () => ({
    cw: cloneBind(NONE_BIND),
    ccw: cloneBind(NONE_BIND),
    btn: cloneBind(NONE_BIND),
  })),
});

export const volumeEncConfig = (layerCount: number): EncConfig => ({
  layers: Array.from({ length: layerCount }, () => ({
    cw: bind(EncBehavior.Cp, 0xe9),
    ccw: bind(EncBehavior.Cp, 0xea),
    btn: bind(EncBehavior.Cp, 0xe2),
  })),
});
