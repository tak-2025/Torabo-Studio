import { useCallback, useContext, useState } from "react";
import { Save, Plus, Trash2, FileCode } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { dmacReadAll, dmacWriteSlot, openKeymapFile } from "../backends";
import { HidUsagePicker } from "../behaviors/HidUsagePicker";
import { PanelActionBar } from "../misc/PanelActionBar";
import { usePanelStatus } from "../misc/usePanelStatus";
import { useT } from "../i18n";
import { Feature, ToraboCaps, canWriteFeature, hasMacroNames } from "../caps/toraboCaps";
import {
  DmAction,
  DmConfig,
  DmStep,
  DM_NAME_MAX,
  DM_SLOTS,
  DM_STEPS,
  DM_VERSION_V1,
  decodeDmac,
  encodeMacroName,
  encodeSlot,
  fitMacroName,
  makeKeycode,
  splitKeycode,
  MOD_LCTL,
  MOD_LSFT,
  MOD_LALT,
  MOD_LGUI,
} from "./dmacConfig";
import { useSetMacroNames } from "./MacroNamesContext";
import { importMacrosFromKeymap } from "./keymapImport";

// Keyboard/Keypad (0x07) + Consumer (0x0C) usage pages.
const USAGE_PAGES = [{ id: 0x07 }, { id: 0x0c }];

function emptyConfig(): DmConfig {
  return {
    slots: Array.from({ length: DM_SLOTS }, () => ({ steps: [] as DmStep[] })),
    // Only ever used as the starting point for a keymap import, which brings
    // steps and nothing else — so it stands in for a v1 read: no names.
    version: DM_VERSION_V1,
    hasNames: false,
  };
}

/**
 * @param caps what the connected firmware says it can do, passed down rather
 *   than read again here (MainPanels has already asked; a second capability read
 *   would take its turn ahead of this panel's own). Only used to decide whether
 *   writing is safe.
 */
export function MacrosPanel({ caps }: { caps?: ToraboCaps | null }) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<DmConfig | null>(null);
  const { status, setStatus, read } = usePanelStatus();
  const [imported, setImported] = useState<number[] | null>(null);
  // Unregistered (empty) macro slots are hidden; "add" reveals the next empty
  // slot, like adding a keymap layer.
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  // The firmware's wire is newer than encodeSlot can produce: read, but never
  // write back a slot with the fields we couldn't decode stripped out. This
  // panel saves per slot rather than through one write button, so every save
  // control below is disabled and the action bar carries the explanation.
  const writeBlocked = !canWriteFeature(caps ?? null, Feature.Macros);
  // Does THIS keyboard store a name per slot (macros wire v2, see
  // PLAN-ext-fw-refactor.md フェーズ8)? On v1 firmware the whole name row is
  // absent and the panel is byte-for-byte the panel it has always been —
  // nothing to explain, because there is nothing the user could have had.
  const namesSupported = hasMacroNames(caps ?? null);
  // Published for the keymap board's `&dmac` keycaps (MacroNamesContext).
  const setMacroNames = useSetMacroNames();

  const onRead = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    await read(async () => {
      const next = decodeDmac(await dmacReadAll());
      setCfg(next);
      // The read is the only place names enter the app, so it is also where the
      // board learns them. A v1 blob publishes null, not a row of blanks: the
      // board must fall back to M<N>, not label every macro key with nothing.
      setMacroNames(next.hasNames ? next.slots.map((s) => s.name) : null);
      setRevealed(new Set());
    });
  }, [conn, read, setMacroNames, setStatus, t]);

  /**
   * Save one slot. Steps go out as a v1 write (they always will — see
   * encodeSlot); the name, when this firmware has names, follows as its own v2
   * op. Two writes because they are two independent ops on the wire, and in
   * this order because a name is worth nothing on a slot whose steps failed.
   *
   * `name === undefined` means this config never came from a v2 read — a keymap
   * import into a panel that was never read, say. Then NO name op is sent at
   * all, so the keyboard keeps the names it has rather than having them cleared
   * by an edit that was never about names. `""` is different: that is a read
   * name the user emptied, and clearing it is what they asked for.
   */
  const saveSlot = useCallback(
    async (idx: number, steps: DmStep[], name: string | undefined) => {
      setStatus({ kind: "busy", msg: t("mac.writing", { idx }) });
      try {
        await dmacWriteSlot(encodeSlot(idx, steps));
        if (namesSupported && name !== undefined) {
          const fitted = fitMacroName(name);
          await dmacWriteSlot(encodeMacroName(idx, fitted));
          // Reflect the stored form: the keyboard now holds `fitted`, which may
          // be shorter than what was typed (16 bytes, cut on a character
          // boundary), and the board must show what is actually stored.
          setCfg((c) =>
            c
              ? {
                  ...c,
                  slots: c.slots.map((s, i) => (i === idx ? { ...s, name: fitted } : s)),
                }
              : c
          );
          setMacroNames((prev) => {
            const base = prev ?? Array.from({ length: DM_SLOTS }, () => "");
            return base.map((n, i) => (i === idx ? fitted : n));
          });
        }
        setStatus({ kind: "ok", msg: t("mac.saved", { idx }) });
      } catch (e) {
        setStatus({ kind: "error", msg: t("status.error") + String(e) });
      }
    },
    [namesSupported, setMacroNames, setStatus, t]
  );

  const updateSteps = (idx: number, steps: DmStep[]) =>
    setCfg((c) =>
      c
        ? { ...c, slots: c.slots.map((s, i) => (i === idx ? { ...s, steps } : s)) }
        : c
    );

  const updateName = (idx: number, name: string) =>
    setCfg((c) =>
      c ? { ...c, slots: c.slots.map((s, i) => (i === idx ? { ...s, name } : s)) } : c
    );

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
        setStatus({ kind: "error", msg: t("mac.noMacrosNode") });
        return;
      }

      // Start from current slots (or empty) and place each macro. M<n> goes to
      // slot n; un-numbered macros fall into the lowest free slot.
      // Names are carried through untouched — an import replaces what a slot
      // types, not what it is called.
      const base = cfg
        ? cfg.slots.map((s) => ({ ...s, steps: [...s.steps] }))
        : emptyConfig().slots;
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
          warns.push(t("mac.warn.noFreeSlot", { name: m.name }));
          continue;
        }
        if (m.steps.length > DM_STEPS)
          warns.push(t("mac.warn.tooManySteps", { name: m.name, max: DM_STEPS }));
        // Steps only: a keymap's macro node has no name field this app could
        // trust as a display name (it carries a devicetree label, not something
        // the user wrote), and an import must not silently rename slots.
        base[idx] = { ...base[idx], steps: m.steps.slice(0, DM_STEPS) };
        touched.add(idx);
        placed++;
        m.warnings.forEach((w) => warns.push(`${m.name}: ${w}`));
      }

      setCfg({ ...(cfg ?? emptyConfig()), slots: base });
      const targets = [...touched].sort((a, b) => a - b);
      setImported(targets);
      const head = t("mac.imported", { n: placed, slots: targets.join(", ") });
      setStatus(
        warns.length
          ? {
              kind: "error",
              msg: `${head}\n${t("mac.warnPrefix")}${warns.join(" / ")}`,
            }
          : { kind: "ok", msg: head }
      );
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [cfg, setStatus, t]);

  // Save just the imported slots in one go (each is its own BLE write).
  const saveImported = useCallback(async () => {
    if (!cfg || !imported) return;
    for (const idx of imported) {
      setStatus({ kind: "busy", msg: t("mac.writing", { idx }) });
      try {
        await dmacWriteSlot(encodeSlot(idx, cfg.slots[idx].steps));
      } catch (e) {
        setStatus({
          kind: "error",
          msg:
            t("status.error") + t("mac.slotFailed", { idx, err: String(e) }),
        });
        return;
      }
    }
    setStatus({
      kind: "ok",
      msg: t("mac.savedImportedCount", { n: imported.length }),
    });
    setImported(null);
  }, [cfg, imported, setStatus, t]);

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
        <h2 className="text-fluid-xl font-bold">{t("mac.title")}</h2>
        <p className="text-sm text-base-content/70">
          {t("mac.desc1")} <code>&amp;dmac 0</code>
          {t("mac.desc2")}
        </p>
      </div>

      <PanelActionBar
        onRead={onRead}
        readLabel={t("actionBar.readPlain")}
        writeBlocked={writeBlocked}
        status={status}
      >
        <button type="button" className="btn gap-2" onClick={onImport}>
          <FileCode size={18} />
          <span>{t("mac.import")}</span>
        </button>
        {imported && imported.length > 0 && (
          <button
            type="button"
            className="btn btn-success gap-2"
            onClick={saveImported}
            disabled={writeBlocked}
          >
            <Save size={18} />
            <span>{t("mac.saveImported", { n: imported.length })}</span>
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
              name={cfg.slots[idx].name}
              namesSupported={namesSupported}
              onChange={(steps) => updateSteps(idx, steps)}
              onNameChange={(name) => updateName(idx, name)}
              onSave={(steps, name) => saveSlot(idx, steps, name)}
              saveDisabled={writeBlocked}
            />
          ))}
          {visible.length === 0 && (
            <p className="text-sm text-base-content/50">
              {t("mac.none")}
            </p>
          )}
          {visible.length < DM_SLOTS && (
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1 self-start"
              onClick={addMacro}
            >
              <Plus size={16} /> {t("mac.add")}
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
  name,
  namesSupported,
  onChange,
  onNameChange,
  onSave,
  saveDisabled,
}: {
  index: number;
  steps: DmStep[];
  /** The slot's stored name, or undefined on firmware that has none. */
  name?: string;
  /** Whether this keyboard stores names at all — false hides the field
   *  entirely rather than showing one that could not be saved. */
  namesSupported: boolean;
  onChange: (steps: DmStep[]) => void;
  onNameChange: (name: string) => void;
  onSave: (steps: DmStep[], name: string | undefined) => void;
  /** Firmware newer than this app's wire — the panel's action bar says why. */
  saveDisabled?: boolean;
}) {
  const t = useT();
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
            <Plus size={16} /> {t("mac.step")}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-success gap-1"
            onClick={() => onSave(steps, name)}
            disabled={saveDisabled}
          >
            <Save size={16} /> {t("common.save")}
          </button>
        </div>
      </div>
      {namesSupported && (
        // The keyboard stores 16 BYTES, not 16 characters, so maxLength cannot
        // express the limit — five Japanese characters already fill the field.
        // The input is left unrestricted and the save trims on the character
        // boundary (fitMacroName), then writes the trimmed value back here, so
        // what is on screen is always what the keyboard holds.
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm text-base-content/70" htmlFor={`mac-name-${index}`}>
            {t("mac.name")}
          </label>
          <input
            id={`mac-name-${index}`}
            type="text"
            className="input input-bordered input-sm flex-1"
            placeholder={t("mac.namePlaceholder", { idx: index })}
            value={name ?? ""}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <span className="text-xs text-base-content/50 whitespace-nowrap">
            {t("mac.nameLimit", { max: DM_NAME_MAX })}
          </span>
        </div>
      )}
      {steps.length === 0 ? (
        <p className="text-sm text-base-content/50">{t("mac.emptySlot")}</p>
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
  const t = useT();
  const { base, mods } = splitKeycode(step.keycode);
  const setMod = (bit: number, on: boolean) =>
    onChange({ keycode: makeKeycode(base, on ? mods | bit : mods & ~bit) });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="select select-bordered select-sm w-24"
        aria-label={t("mac.stepAction")}
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
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square"
        aria-label={t("mac.removeStep")}
        onClick={onRemove}
      >
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
