import { useCallback, useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { fetchLayerInfo } from "../rpc/keyboardInfo";
import { encoderReadConfig, encoderWriteConfig } from "../backends";
import { HidUsagePicker } from "../behaviors/HidUsagePicker";
import { PanelActionBar } from "../misc/PanelActionBar";
import { usePanelStatus } from "../misc/usePanelStatus";
import { useT } from "../i18n";
import { Feature, ToraboCaps, canWriteFeature } from "../caps/toraboCaps";
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
const usageFromPage = (page: number, id: number): number =>
  (page << 16) | (id & 0xffff);

/** The three things an encoder can do on a layer. */
type SlotKey = "cw" | "ccw" | "btn";

/** Message keys, resolved with t() where they are rendered. */
const SLOT_LABEL_KEY: Record<SlotKey, string> = {
  cw: "enc.slot.cw",
  ccw: "enc.slot.ccw",
  btn: "enc.slot.btn",
};

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
  const t = useT();
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
      <Field label={t("enc.field.kind")}>
        <select
          className="select select-bordered select-sm w-36"
          aria-label={t("enc.aria.behavior")}
          value={value.behavior}
          onChange={(e) => {
            const behavior = Number(e.target.value) as EncBehavior;
            // Params mean different things per behavior; don't carry a stale one over.
            onChange({ behavior, mods: 0, param: 0 });
          }}
        >
          <option value={EncBehavior.None}>{t("enc.beh.none")}</option>
          <option value={EncBehavior.Kp}>{t("enc.beh.kp")}</option>
          <option value={EncBehavior.Cp}>{t("enc.beh.cp")}</option>
          <option value={EncBehavior.Mo}>{t("enc.beh.mo")}</option>
          <option value={EncBehavior.To}>{t("enc.beh.to")}</option>
          <option value={EncBehavior.Tog}>{t("enc.beh.tog")}</option>
        </select>
      </Field>

      {(isKey || isConsumer) && (
        <Field label={t(isConsumer ? "enc.field.consumer" : "enc.field.key")}>
          {/* The picker speaks ZMK's encoded usage (page << 16 | id, mods << 24),
              while the wire keeps page/mods/id apart — convert on both edges. */}
          <HidUsagePicker
            usagePages={[{ id: isConsumer ? PAGE_CONSUMER : PAGE_KEYBOARD }]}
            collapsibleVisual
            value={
              value.param
                ? usageFromPage(
                    isConsumer ? PAGE_CONSUMER : PAGE_KEYBOARD,
                    value.param,
                  ) |
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
                    },
              )
            }
          />
        </Field>
      )}

      {isKey && (
        <Field label={t("enc.field.mods")}>
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
        <Field label={t("enc.field.layer")}>
          <select
            className="select select-bordered select-sm w-40"
            aria-label={t("enc.aria.layer")}
            value={value.param}
            onChange={(e) =>
              onChange({ ...value, param: Number(e.target.value) })
            }
          >
            {(
              layerNames ?? Array.from({ length: 10 }, (_, i) => String(i))
            ).map((name, i) => (
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
 *
 * @param caps what the connected firmware says it can do, passed down rather
 *   than read again here (MainPanels has already asked; a second capability read
 *   would take its turn ahead of this panel's own). Only used to decide whether
 *   writing is safe.
 */
export function EncoderSettings({ caps }: { caps?: ToraboCaps | null }) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<EncConfig | null>(null);
  const { status, read, write } = usePanelStatus({ onReadFailed: () => setCfg(null) });
  // getKeymap returns only the ACTIVE layers, so trailing reserved layers stay hidden.
  const [activeLayers, setActiveLayers] = useState<number | null>(null);
  const [layerNames, setLayerNames] = useState<string[] | null>(null);
  // Layers the user switched to Custom, so a pair that happens to match a preset
  // doesn't snap the dropdown back. UI-only; never written to the wire.
  const [customLayers, setCustomLayers] = useState<Set<number>>(new Set());
  // The firmware's wire is newer than encodeEnc can produce: read, but never
  // write back a config with the fields we couldn't decode stripped out.
  const writeBlocked = !canWriteFeature(caps ?? null, Feature.Encoder);

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
    // Not fatal: without names we fall back to layer indices.
    if (!info) return;
    setActiveLayers(info.activeLayers);
    setLayerNames(info.layerNames);
  }, [conn]);

  const onRead = () =>
    read(async () => {
      await loadLayerInfo();
      const raw = await encoderReadConfig();
      setCfg(decodeEnc(raw));
      setCustomLayers(new Set());
    });

  const onWrite = () => {
    if (!cfg) return;
    return write(async () => encoderWriteConfig(encodeEnc(cfg)));
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
  const shown = cfg
    ? cfg.layers.slice(0, activeLayers ?? cfg.layers.length)
    : [];

  return (
    <div className="flex flex-col items-start gap-4 p-4">
      <div className="text-base-content/70 text-sm">
        <p>
          {t("enc.intro.pre")}
          <b>{t("enc.intro.strong")}</b>
          {t("enc.intro.post")}
        </p>
        <p>
          {t("enc.note.pre")}
          <b>{t("enc.note.strong1")}</b>
          {t("enc.note.mid")}
          <b>{t("enc.note.strong2")}</b>
          {t("enc.note.post")}
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
        <div className="flex flex-col gap-4 self-stretch">
          {shown.map((layer, i) => {
            const detected = presetIdFor(layer.cw, layer.ccw);
            const isCustom = customLayers.has(i) || detected === null;
            const layerLabel =
              layerNames && layerNames[i] !== i.toLocaleString()
                ? `${i}: ${layerNames[i]}`
                : t("enc.layerN", { n: i });

            return (
              <section
                key={i}
                className="flex flex-col gap-3 rounded-md border border-base-300 bg-base-200/40 p-4"
              >
                <h3 className="text-sm font-semibold">{layerLabel}</h3>

                <Field label={t("enc.field.rotation")}>
                  <select
                    className="select select-bordered select-sm w-64"
                    aria-label={t("enc.aria.preset", { n: i })}
                    value={isCustom ? "custom" : (detected as string)}
                    onChange={(e) => applyPreset(i, e.target.value)}
                  >
                    {ENC_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t(p.labelKey)}
                      </option>
                    ))}
                    <option value="custom">{t("enc.preset.custom")}</option>
                  </select>
                </Field>

                {isCustom && (
                  <div className="flex flex-col gap-3 border-l-2 border-base-300 pl-4">
                    {(["cw", "ccw"] as SlotKey[]).map((slot) => (
                      <div key={slot} className="flex flex-col gap-1">
                        <span className="text-xs font-medium">
                          {t(SLOT_LABEL_KEY[slot])}
                        </span>
                        <BindingEditor
                          value={layer[slot]}
                          onChange={(b) =>
                            patchLayer(i, { [slot]: b } as Partial<EncLayerCfg>)
                          }
                          layerNames={layerNames}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-1 border-t border-base-300 pt-3">
                  <span className="text-xs font-medium">
                    {t(SLOT_LABEL_KEY.btn)}
                  </span>
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
