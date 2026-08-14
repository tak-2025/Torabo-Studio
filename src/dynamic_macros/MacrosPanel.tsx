import { useCallback, useContext, useState } from "react";
import { Save, Plus, Trash2, FileCode } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { dmacReadAll, dmacWriteSlot, openKeymapFile } from "../backends";
import { HidUsagePicker } from "../behaviors/HidUsagePicker";
import { PanelActionBar, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";
import {
  DmAction,
  DmConfig,
  DmStep,
  DM_SLOTS,
  DM_STEPS,
  decodeDmac,
  encodeSlot,
  makeKeycode,
  splitKeycode,
  MOD_LCTL,
  MOD_LSFT,
  MOD_LALT,
  MOD_LGUI,
} from "./dmacConfig";
import { importMacrosFromKeymap } from "./keymapImport";

type Status = PanelStatus;

// Keyboard/Keypad (0x07) + Consumer (0x0C) usage pages.
const USAGE_PAGES = [{ id: 0x07 }, { id: 0x0c }];

function emptyConfig(): DmConfig {
  return { slots: Array.from({ length: DM_SLOTS }, () => ({ steps: [] as DmStep[] })) };
}

export function MacrosPanel() {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<DmConfig | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [imported, setImported] = useState<number[] | null>(null);
  // Unregistered (empty) macro slots are hidden; "add" reveals the next empty
  // slot, like adding a keymap layer.
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const onRead = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    setStatus({ kind: "busy", msg: t("status.reading") });
    try {
      setCfg(decodeDmac(await dmacReadAll()));
      setRevealed(new Set());
      setStatus({ kind: "ok", msg: t("status.loaded") });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, t]);

  const saveSlot = useCallback(
    async (idx: number, steps: DmStep[]) => {
      setStatus({ kind: "busy", msg: `Slot ${idx} を書き込み中…` });
      try {
        await dmacWriteSlot(encodeSlot(idx, steps));
        setStatus({ kind: "ok", msg: `Slot ${idx} を保存しました（即反映＆本体に保存）。` });
      } catch (e) {
        setStatus({ kind: "error", msg: t("status.error") + String(e) });
      }
    },
    [t]
  );

  const updateSteps = (idx: number, steps: DmStep[]) =>
    setCfg((c) => (c ? { slots: c.slots.map((s, i) => (i === idx ? { steps } : s)) } : c));

  // Import existing macros (M0, M1, ...) from a keymap.keymap into slots.
  const onImport = useCallback(async () => {
    let picked: Awaited<ReturnType<typeof openKeymapFile>>;
    try {
      picked = await openKeymapFile();
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
      return;
    }
    if (!picked) return;

    try {
      const macros = importMacrosFromKeymap(picked.text);
      if (macros.length === 0) {
        setStatus({ kind: "error", msg: "macros ノードが見つかりませんでした。" });
        return;
      }

      // Start from current slots (or empty) and place each macro. M<n> goes to
      // slot n; un-numbered macros fall into the lowest free slot.
      const base = cfg ? cfg.slots.map((s) => ({ steps: [...s.steps] })) : emptyConfig().slots;
      const touched = new Set<number>();
      const take = (pref: number | null) => {
        if (pref !== null && pref >= 0 && pref < DM_SLOTS && !touched.has(pref)) return pref;
        for (let i = 0; i < DM_SLOTS; i++) if (!touched.has(i)) return i;
        return -1;
      };

      const warns: string[] = [];
      let placed = 0;
      for (const m of macros) {
        const idx = take(m.slot);
        if (idx < 0) {
          warns.push(`スロット不足: ${m.name} を入れられません`);
          continue;
        }
        if (m.steps.length > DM_STEPS)
          warns.push(`${m.name}: ステップが${DM_STEPS}個を超え切り捨て`);
        base[idx] = { steps: m.steps.slice(0, DM_STEPS) };
        touched.add(idx);
        placed++;
        m.warnings.forEach((w) => warns.push(`${m.name}: ${w}`));
      }

      setCfg({ slots: base });
      const targets = [...touched].sort((a, b) => a - b);
      setImported(targets);
      const head = `${placed} 件取り込み（Slot ${targets.join(", ")}）。内容を確認して保存してください。`;
      setStatus(
        warns.length
          ? { kind: "error", msg: `${head}\n注意: ${warns.join(" / ")}` }
          : { kind: "ok", msg: head }
      );
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [cfg, t]);

  // Save just the imported slots in one go (each is its own BLE write).
  const saveImported = useCallback(async () => {
    if (!cfg || !imported) return;
    for (const idx of imported) {
      setStatus({ kind: "busy", msg: `Slot ${idx} を書き込み中…` });
      try {
        await dmacWriteSlot(encodeSlot(idx, cfg.slots[idx].steps));
      } catch (e) {
        setStatus({ kind: "error", msg: `${t("status.error")}Slot ${idx} で失敗: ${String(e)}` });
        return;
      }
    }
    setStatus({ kind: "ok", msg: `取り込んだ ${imported.length} スロットを保存しました。` });
    setImported(null);
  }, [cfg, imported, t]);

  // A slot "exists" once it has at least one step; empty slots are hidden.
  const visible = cfg
    ? cfg.slots.map((_, i) => i).filter((i) => cfg.slots[i].steps.length > 0 || revealed.has(i))
    : [];
  const addMacro = () => {
    if (!cfg) return;
    const next = cfg.slots.findIndex((s, i) => s.steps.length === 0 && !revealed.has(i));
    if (next >= 0) setRevealed((r) => new Set(r).add(next));
  };

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.macros")} {t("preconnect.howto")}
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">ダイナミックマクロ（Bluetooth ライブ編集）</h2>
        <p className="text-sm text-base-content/70">
          各スロットに「キーを順に入力する手順」を登録します。keymap 側で{" "}
          <code>&amp;dmac 0</code> 等を置いたキーで再生されます。修飾子チェックは「そのキーを押す間だけ」効きます（例 Ctrl+C）。
        </p>
      </div>

      <PanelActionBar
        onRead={onRead}
        readLabel={t("actionBar.readPlain")}
        status={status}
      >
        <button type="button" className="btn gap-2" onClick={onImport}>
          <FileCode size={18} />
          <span>keymap.keymap から取り込み</span>
        </button>
        {imported && imported.length > 0 && (
          <button type="button" className="btn btn-success gap-2" onClick={saveImported}>
            <Save size={18} />
            <span>取り込んだ {imported.length} 件を保存</span>
          </button>
        )}
      </PanelActionBar>

      {!cfg ? (
        <p className="text-base-content/70 text-sm">{t("empty.macros")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((idx) => (
            <SlotEditor
              key={idx}
              index={idx}
              steps={cfg.slots[idx].steps}
              onChange={(steps) => updateSteps(idx, steps)}
              onSave={(steps) => saveSlot(idx, steps)}
            />
          ))}
          {visible.length === 0 && (
            <p className="text-sm text-base-content/50">
              登録済みのマクロはありません。下の「＋ マクロを追加」で作成できます。
            </p>
          )}
          {visible.length < DM_SLOTS && (
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1 self-start"
              onClick={addMacro}
            >
              <Plus size={16} /> マクロを追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SlotEditor({
  index,
  steps,
  onChange,
  onSave,
}: {
  index: number;
  steps: DmStep[];
  onChange: (steps: DmStep[]) => void;
  onSave: (steps: DmStep[]) => void;
}) {
  const addStep = () => onChange([...steps, { action: DmAction.Tap, keycode: 0 }]);
  const setStep = (i: number, patch: Partial<DmStep>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeStep = (i: number) => onChange(steps.filter((_, j) => j !== i));

  return (
    <div className="rounded-md border border-base-300 p-3 self-start min-w-[28rem]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-bold">
          Slot {index} <span className="opacity-50 text-sm font-normal">&amp;dmac {index}</span>
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm gap-1" onClick={addStep}>
            <Plus size={16} /> ステップ
          </button>
          <button type="button" className="btn btn-sm btn-success gap-1" onClick={() => onSave(steps)}>
            <Save size={16} /> 保存
          </button>
        </div>
      </div>
      {steps.length === 0 ? (
        <p className="text-sm text-base-content/50">空（何もしない）</p>
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <StepRow
              key={i}
              step={s}
              onChange={(patch) => setStep(i, patch)}
              onRemove={() => removeStep(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({
  step,
  onChange,
  onRemove,
}: {
  step: DmStep;
  onChange: (patch: Partial<DmStep>) => void;
  onRemove: () => void;
}) {
  const { base, mods } = splitKeycode(step.keycode);
  const setMod = (bit: number, on: boolean) =>
    onChange({ keycode: makeKeycode(base, on ? mods | bit : mods & ~bit) });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="select select-bordered select-sm w-24"
        aria-label="action"
        value={step.action}
        onChange={(e) => onChange({ action: Number(e.target.value) as DmAction })}
      >
        <option value={DmAction.Tap}>Tap</option>
        <option value={DmAction.Press}>Press</option>
        <option value={DmAction.Release}>Release</option>
      </select>
      <ModCheck label="Ctrl" on={!!(mods & MOD_LCTL)} set={(v) => setMod(MOD_LCTL, v)} />
      <ModCheck label="Shift" on={!!(mods & MOD_LSFT)} set={(v) => setMod(MOD_LSFT, v)} />
      <ModCheck label="Alt" on={!!(mods & MOD_LALT)} set={(v) => setMod(MOD_LALT, v)} />
      <ModCheck label="GUI" on={!!(mods & MOD_LGUI)} set={(v) => setMod(MOD_LGUI, v)} />
      <HidUsagePicker
        usagePages={USAGE_PAGES}
        value={base || undefined}
        onValueChanged={(v) => onChange({ keycode: makeKeycode(v || 0, mods) })}
        collapsibleVisual
      />
      <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label="remove" onClick={onRemove}>
        <Trash2 size={16} />
      </button>
    </div>
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

export default MacrosPanel;
