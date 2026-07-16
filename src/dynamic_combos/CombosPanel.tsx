import { useCallback, useContext, useEffect, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";
import { comboReadAll, comboWriteSlot } from "../tauri/combo";
import { HidUsagePicker } from "../behaviors/HidUsagePicker";
import { PhysicalLayout, KeyPosition } from "../keyboard/PhysicalLayout";
import { PanelActionBar, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";
import {
  ComboConfig,
  ComboSlot,
  ComboTarget,
  CB_SLOTS,
  CB_MAX_POS,
  decodeCombos,
  encodeSlot,
  emptySlot,
  makeKeycode,
  splitKeycode,
  MOD_LCTL,
  MOD_LSFT,
  MOD_LALT,
  MOD_LGUI,
} from "./comboConfig";

type Status = PanelStatus;

// Keyboard/Keypad (0x07) + Consumer (0x0C) usage pages.
const USAGE_PAGES = [{ id: 0x07 }, { id: 0x0c }];

// Layers shown in the layer-mask picker. ZMK keymaps rarely exceed this; a
// combo with layer_mask=0 ("all layers") ignores this entirely.
const LAYER_CHOICES = 10;

const TARGET_LABELS: { value: ComboTarget; label: string }[] = [
  { value: ComboTarget.KeyPress, label: "キー入力 (kp)" },
  { value: ComboTarget.MomentaryLayer, label: "押している間モード切替 (mo)" },
  { value: ComboTarget.ToLayer, label: "モード切替 (to)" },
  { value: ComboTarget.ToggleLayer, label: "モード固定/解除 (tog)" },
  { value: ComboTarget.DynamicMacro, label: "マクロ (&dmac)" },
];

export function CombosPanel() {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<ComboConfig | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Unregistered (empty + disabled) combos are hidden; "add" reveals the next
  // empty slot, like adding a keymap layer.
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  // Physical layout for the visual key-position picker (each key's index IS its
  // key position). Fetched over the Studio RPC, same source as the keymap tab.
  const [positions, setPositions] = useState<KeyPosition[] | null>(null);

  useEffect(() => {
    if (!conn) {
      setPositions(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await call_rpc(conn, { keymap: { getPhysicalLayouts: true } });
        const pl = resp?.keymap?.getPhysicalLayouts;
        const layout = pl?.layouts?.[pl?.activeLayoutIndex || 0];
        if (!layout || cancelled) return;
        const ps: KeyPosition[] = layout.keys.map((k: any, i: number) => ({
          id: `cpos-${i}`,
          x: k.x / 100,
          y: k.y / 100,
          width: k.width / 100,
          height: k.height / 100,
          r: (k.r || 0) / 100,
          rx: (k.rx || 0) / 100,
          ry: (k.ry || 0) / 100,
          children: <span className="text-[10px] font-mono opacity-80">{i}</span>,
        }));
        setPositions(ps);
      } catch (e) {
        console.warn("combo layout fetch skipped:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conn]);

  const onRead = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    setStatus({ kind: "busy", msg: t("status.reading") });
    try {
      setCfg(decodeCombos(await comboReadAll()));
      setRevealed(new Set());
      setStatus({ kind: "ok", msg: t("status.loaded") });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, t]);

  const saveSlot = useCallback(
    async (idx: number, slot: ComboSlot) => {
      setStatus({ kind: "busy", msg: `コンボ ${idx} を書き込み中…` });
      try {
        await comboWriteSlot(encodeSlot(idx, slot));
        setStatus({
          kind: "ok",
          msg: `コンボ ${idx} を保存しました（次のアイドルで反映＆本体に保存）。`,
        });
      } catch (e) {
        setStatus({ kind: "error", msg: t("status.error") + String(e) });
      }
    },
    [t]
  );

  const updateSlot = (idx: number, slot: ComboSlot) =>
    setCfg((c) => (c ? { slots: c.slots.map((s, i) => (i === idx ? slot : s)) } : c));

  // A combo "exists" once enabled or given key positions; otherwise it is hidden.
  const isRegistered = (s: ComboSlot) => s.enabled || s.positions.length > 0;
  const visible = cfg
    ? cfg.slots.map((_, i) => i).filter((i) => isRegistered(cfg.slots[i]) || revealed.has(i))
    : [];
  const addCombo = () => {
    if (!cfg) return;
    const next = cfg.slots.findIndex((s, i) => !isRegistered(s) && !revealed.has(i));
    if (next < 0) return;
    updateSlot(next, emptySlot()); // clean defaults (timeout 50ms, disabled)
    setRevealed((r) => new Set(r).add(next));
  };

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.combos")} {t("preconnect.howto")}
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">ダイナミックコンボ（Bluetooth ライブ編集）</h2>
        <p className="text-sm text-base-content/70">
          複数のキー位置を同時押しすると 1 つの動作（キー入力・モード切替・マクロ）を発火します。
          キー位置の番号は keymap のキー位置（0 始まり）です。空 or 無効のコンボは何も起きません。
        </p>
      </div>

      <PanelActionBar
        onRead={onRead}
        readLabel={t("actionBar.readPlain")}
        status={status}
      />

      {!cfg ? (
        <p className="text-base-content/70 text-sm">{t("empty.combos")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((idx) => (
            <ComboEditor
              key={idx}
              index={idx}
              slot={cfg.slots[idx]}
              layoutPositions={positions}
              onChange={(s) => updateSlot(idx, s)}
              onSave={(s) => saveSlot(idx, s)}
            />
          ))}
          {visible.length === 0 && (
            <p className="text-sm text-base-content/50">
              登録済みのコンボはありません。下の「＋ コンボを追加」で作成できます。
            </p>
          )}
          {visible.length < CB_SLOTS && (
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1 self-start"
              onClick={addCombo}
            >
              <Plus size={16} /> コンボを追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ComboEditor({
  index,
  slot,
  layoutPositions,
  onChange,
  onSave,
}: {
  index: number;
  slot: ComboSlot;
  layoutPositions: KeyPosition[] | null;
  onChange: (slot: ComboSlot) => void;
  onSave: (slot: ComboSlot) => void;
}) {
  const set = (patch: Partial<ComboSlot>) => onChange({ ...slot, ...patch });
  const [showPicker, setShowPicker] = useState(false);
  const [manual, setManual] = useState(0);

  const removePos = (i: number) =>
    set({ positions: slot.positions.filter((_, j) => j !== i) });
  // Click a key on the layout → toggle that position in/out of the combo.
  const togglePos = (idx: number) => {
    if (slot.positions.includes(idx)) {
      set({ positions: slot.positions.filter((p) => p !== idx) });
    } else if (slot.positions.length < CB_MAX_POS) {
      set({ positions: [...slot.positions, idx] });
    }
  };
  const addManual = () => {
    if (slot.positions.length >= CB_MAX_POS || slot.positions.includes(manual)) return;
    set({ positions: [...slot.positions, manual] });
  };

  const allLayers = slot.layerMask === 0;
  const toggleLayer = (layer: number, on: boolean) => {
    const bit = 1 << layer;
    set({ layerMask: on ? slot.layerMask | bit : slot.layerMask & ~bit });
  };

  return (
    <div className="rounded-md border border-base-300 p-3 self-start min-w-[34rem]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-bold">
          コンボ {index}
          {!slot.enabled && <span className="opacity-50 text-sm font-normal"> （無効）</span>}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={slot.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
            />
            有効
          </label>
          <button
            type="button"
            className="btn btn-sm btn-success gap-1"
            onClick={() => onSave(slot)}
          >
            <Save size={16} /> 保存
          </button>
        </div>
      </div>

      {/* key positions */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-sm font-medium w-24 pt-1">キー位置</span>
        <div className="flex flex-col gap-2 flex-1">
          {/* selected positions as removable chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {slot.positions.length === 0 && (
              <span className="text-xs text-base-content/50">未選択</span>
            )}
            {slot.positions.map((p, i) => (
              <span key={i} className="badge badge-primary gap-1 font-mono">
                {p}
                <button
                  type="button"
                  aria-label={`位置 ${p} を削除`}
                  onClick={() => removePos(i)}
                >
                  <Trash2 size={12} />
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
            {/* manual number add (fallback) */}
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                className="input input-bordered input-xs w-16"
                value={manual}
                onChange={(e) => setManual(Math.max(0, Number(e.target.value) | 0))}
                aria-label="番号で位置を追加"
              />
              <button
                type="button"
                className="btn btn-xs gap-1"
                onClick={addManual}
                disabled={slot.positions.length >= CB_MAX_POS}
              >
                <Plus size={12} /> 番号で追加
              </button>
            </span>
          </div>

          {/* visual layout picker: click a key to toggle it into the combo */}
          {showPicker && layoutPositions && (
            <div className="border border-base-300 rounded bg-base-200/50 h-72 overflow-hidden">
              <PhysicalLayout
                positions={layoutPositions}
                oneU={42}
                zoom="auto"
                isPositionSelected={(idx) => slot.positions.includes(idx)}
                onPositionClicked={togglePos}
              />
            </div>
          )}

          {slot.positions.length < 2 && (
            <span className="text-xs text-warning">
              コンボには 2 つ以上のキー位置が必要です（最大 {CB_MAX_POS}）。
            </span>
          )}
        </div>
      </div>

      {/* target behavior */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm font-medium w-24">発火する動作</span>
        <select
          className="select select-bordered select-sm"
          aria-label="発火する動作"
          value={slot.targetType}
          onChange={(e) => set({ targetType: Number(e.target.value) as ComboTarget, param1: 0 })}
        >
          {TARGET_LABELS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <TargetParam slot={slot} set={set} />
      </div>

      {/* timing + layers */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <label className="flex items-center gap-1">
          <span className="font-medium">タイムアウト</span>
          <input
            type="number"
            min={0}
            className={
              "input input-bordered input-sm w-24" +
              (slot.timeoutMs === 0 ? " input-warning" : "")
            }
            value={slot.timeoutMs}
            onChange={(e) => set({ timeoutMs: Math.max(0, Number(e.target.value) | 0) })}
          />
          <span className="opacity-60">ms</span>
          {slot.timeoutMs === 0 && (
            <button
              type="button"
              className="btn btn-xs btn-warning"
              onClick={() => set({ timeoutMs: 50 })}
              title="同時押しと認識する制限時間。0 だと発火しません"
            >
              0だと発火しません → 50ms
            </button>
          )}
        </label>
        <label className="flex items-center gap-1">
          <span className="font-medium">直前アイドル</span>
          <input
            type="number"
            min={0}
            className="input input-bordered input-sm w-24"
            value={slot.priorIdleMs}
            onChange={(e) => set({ priorIdleMs: Math.max(0, Number(e.target.value) | 0) })}
          />
          <span className="opacity-60">ms</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={slot.slowRelease}
            onChange={(e) => set({ slowRelease: e.target.checked })}
          />
          slow-release
        </label>
      </div>

      <div className="flex items-start gap-2 mt-3 flex-wrap text-sm">
        <span className="font-medium w-24" title="レイヤー（layer）">有効モード</span>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={allLayers}
              onChange={(e) => set({ layerMask: e.target.checked ? 0 : 1 })}
            />
            全モード
          </label>
          {!allLayers &&
            Array.from({ length: LAYER_CHOICES }, (_, l) => (
              <label key={l} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={(slot.layerMask & (1 << l)) !== 0}
                  onChange={(e) => toggleLayer(l, e.target.checked)}
                />
                {l}
              </label>
            ))}
        </div>
      </div>
    </div>
  );
}

function TargetParam({
  slot,
  set,
}: {
  slot: ComboSlot;
  set: (patch: Partial<ComboSlot>) => void;
}) {
  if (slot.targetType === ComboTarget.KeyPress) {
    const { base, mods } = splitKeycode(slot.param1);
    const setMod = (bit: number, on: boolean) =>
      set({ param1: makeKeycode(base, on ? mods | bit : mods & ~bit) });
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <ModCheck label="Ctrl" on={!!(mods & MOD_LCTL)} set={(v) => setMod(MOD_LCTL, v)} />
        <ModCheck label="Shift" on={!!(mods & MOD_LSFT)} set={(v) => setMod(MOD_LSFT, v)} />
        <ModCheck label="Alt" on={!!(mods & MOD_LALT)} set={(v) => setMod(MOD_LALT, v)} />
        <ModCheck label="GUI" on={!!(mods & MOD_LGUI)} set={(v) => setMod(MOD_LGUI, v)} />
        <HidUsagePicker
          usagePages={USAGE_PAGES}
          value={base || undefined}
          onValueChanged={(v) => set({ param1: makeKeycode(v || 0, mods) })}
          collapsibleVisual
        />
      </div>
    );
  }

  const label =
    slot.targetType === ComboTarget.DynamicMacro ? "マクロ slot" : "モード番号";
  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="opacity-70">{label}</span>
      <input
        type="number"
        min={0}
        className="input input-bordered input-sm w-24"
        value={slot.param1}
        onChange={(e) => set({ param1: Math.max(0, Number(e.target.value) | 0) })}
      />
    </label>
  );
}

function ModCheck({ label, on, set }: { label: string; on: boolean; set: (on: boolean) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <input
        type="checkbox"
        className="checkbox checkbox-xs"
        checked={on}
        onChange={(e) => set(e.target.checked)}
      />
      {label}
    </label>
  );
}

export default CombosPanel;
