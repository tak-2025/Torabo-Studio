import { useContext, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { ledReadConfig, ledWriteConfig } from "../backends";
import { PanelActionBar } from "../misc/PanelActionBar";
import { usePanelStatus } from "../misc/usePanelStatus";
import { useT } from "../i18n";
import { Feature, LedCap, ToraboCaps, canWriteFeature } from "../caps/toraboCaps";
import {
  COLOURS,
  COLOUR_AUTO,
  Ch,
  LED_MAX_RULES,
  LedConfig,
  LedRule,
  MODS,
  PATTERNS,
  Pattern,
  SIDE_LEFT,
  SIDE_RIGHT,
  USECASES,
  USECASE_GROUPS,
  UseCase,
  decodeLed,
  emptyRule,
  encodeLed,
  usecaseInfo,
} from "./ledConfig";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-base-content/70 text-xs">{label}</span>
      {children}
    </label>
  );
}

/** One rule row. Which controls are shown depends on the use case: an indexed one
 * (profile/layer) picks its colour from the index, so offering a colour there would
 * be a lie; a modifier rule needs to know WHICH modifier. */
function RuleRow({
  rule,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  first,
  last,
}: {
  rule: LedRule;
  onChange: (r: LedRule) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  first: boolean;
  last: boolean;
}) {
  const t = useT();
  const info = usecaseInfo(rule.usecase);
  const indexed = info?.indexed ?? false;

  const setMod = (bit: number, on: boolean) =>
    onChange({ ...rule, param: on ? rule.param | bit : rule.param & ~bit });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-base-300 bg-base-100 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("led.field.trigger")}>
          <select
            className="select select-bordered select-sm w-56"
            aria-label={t("led.aria.usecase")}
            value={rule.usecase}
            onChange={(e) => {
              const usecase = Number(e.target.value) as UseCase;
              const nowIndexed = usecaseInfo(usecase)?.indexed ?? false;
              onChange({
                ...rule,
                usecase,
                // param means different things per use case; don't carry a stale one.
                param: usecase === UseCase.BatteryLow ? 15 : 0,
                // An indexed use case derives its colour from the profile/layer
                // number. Leaving a fixed colour here would make the row SAY
                // "automatic" while the firmware flashed one colour for every profile.
                colour: nowIndexed ? COLOUR_AUTO : rule.colour || Ch.Red,
              });
            }}
          >
            {USECASE_GROUPS.map((g) => (
              <optgroup key={g} label={t(`led.group.${g}`)}>
                {USECASES.filter((u) => u.group === g).map((u) => (
                  <option key={u.id} value={u.id}>
                    {t(u.labelKey)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label={t("led.field.colour")}>
          {indexed ? (
            <span className="text-base-content/60 flex h-8 items-center text-xs">
              {t("led.colour.auto")}
            </span>
          ) : (
            <select
              className="select select-bordered select-sm w-36"
              aria-label={t("led.aria.colour")}
              value={rule.colour}
              onChange={(e) => onChange({ ...rule, colour: Number(e.target.value) })}
            >
              {COLOURS.map((c) => (
                <option key={c.mask} value={c.mask}>
                  {t(c.labelKey)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t("led.field.pattern")}>
          <select
            className="select select-bordered select-sm w-44"
            aria-label={t("led.aria.pattern")}
            value={rule.pattern}
            onChange={(e) => onChange({ ...rule, pattern: Number(e.target.value) as Pattern })}
          >
            {PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.labelKey)}
              </option>
            ))}
          </select>
        </Field>

        {rule.usecase === UseCase.BatteryLow && (
          <Field label={t("led.field.threshold")}>
            <input
              type="number"
              className="input input-bordered input-sm w-24"
              min={1}
              max={99}
              value={rule.param}
              onChange={(e) => onChange({ ...rule, param: Number(e.target.value) || 0 })}
            />
          </Field>
        )}

        {rule.usecase === UseCase.Modifier && (
          <Field label={t("led.field.mod")}>
            <div className="flex gap-2">
              {MODS.map((m) => (
                <label key={m.bit} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={(rule.param & m.bit) !== 0}
                    onChange={(e) => setMod(m.bit, e.target.checked)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </Field>
        )}

        <div className="ml-auto flex gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-label={t("led.aria.moveUp")}
            disabled={first}
            onClick={onMoveUp}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-label={t("led.aria.moveDown")}
            disabled={last}
            onClick={onMoveDown}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-label={t("led.aria.remove")}
            onClick={onRemove}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {info?.noteKey && (
        <p className="text-base-content/60 text-xs">{t(info.noteKey)}</p>
      )}
    </div>
  );
}

function SidePanel({
  title,
  rules,
  ruleMax,
  onChange,
}: {
  title: string;
  rules: LedRule[];
  ruleMax: number;
  onChange: (rules: LedRule[]) => void;
}) {
  const t = useT();
  const patch = (i: number, r: LedRule) => {
    const next = rules.slice();
    next[i] = r;
    onChange(next);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const next = rules.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-base-300 bg-base-200/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          className="btn btn-sm"
          disabled={rules.length >= Math.min(ruleMax, LED_MAX_RULES)}
          onClick={() => onChange([...rules, emptyRule()])}
        >
          <Plus size={14} /> {t("led.addRule")}
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-base-content/60 text-sm">{t("led.noRules")}</p>
      ) : (
        <>
          <p className="text-base-content/60 text-xs">
            {t("led.priority.pre")}
            <b>{t("led.priority.strong")}</b>
            {t("led.priority.post")}
          </p>
          {rules.map((r, i) => (
            <RuleRow
              key={i}
              rule={r}
              first={i === 0}
              last={i === rules.length - 1}
              onChange={(nr) => patch(i, nr)}
              onRemove={() => onChange(rules.filter((_, j) => j !== i))}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, +1)}
            />
          ))}
        </>
      )}
    </section>
  );
}

/**
 * Extender LED settings.
 *
 * Which halves are shown comes from the firmware's own capability byte, not from
 * an assumption here: the LED's anode rides the extender pad's power rail, so a
 * half without that pad has no working LED and offering it would be a lie.
 *
 * @param caps what the connected firmware says it can do, passed down rather
 *   than read again here (MainPanels has already asked; a second capability read
 *   would take its turn ahead of this panel's own). Only used to decide whether
 *   writing is safe — which halves to show comes from the wire's own caps byte.
 */
export function LedSettings({ caps }: { caps?: ToraboCaps | null }) {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const [cfg, setCfg] = useState<LedConfig | null>(null);
  const { status, read, write } = usePanelStatus({ onReadFailed: () => setCfg(null) });

  useEffect(() => {
    if (!conn) setCfg(null);
  }, [conn]);

  const onRead = () => read(async () => setCfg(decodeLed(await ledReadConfig())));

  const onWrite = () => {
    if (!cfg) return;
    return write(async () => ledWriteConfig(encodeLed(cfg)));
  };

  const hasLeft = !!cfg && (cfg.caps & LedCap.Left) !== 0;
  const hasRight = !!cfg && (cfg.caps & LedCap.Right) !== 0;
  // The firmware's wire is newer than encodeLed can produce: read, but never
  // write back a config with the fields we couldn't decode stripped out.
  const writeBlocked = !canWriteFeature(caps ?? null, Feature.Led);

  return (
    <div className="flex flex-col items-start gap-4 p-4">
      <div className="text-base-content/70 text-sm">
        <p>
          {t("led.intro.pre")}
          <b>{t("led.intro.strong")}</b>
          {t("led.intro.post")}
        </p>
        <p>
          {t("led.power.pre")}
          <b>{t("led.power.strong")}</b>
          {t("led.power.post")}
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
      ) : !hasLeft && !hasRight ? (
        <p className="text-base-content/70 text-sm">{t("led.noHardware")}</p>
      ) : (
        <div className="flex w-full flex-col gap-4 lg:flex-row">
          {hasLeft && (
            <SidePanel
              title={t("led.side.left")}
              rules={cfg.sides[SIDE_LEFT] ?? []}
              ruleMax={cfg.ruleMax}
              onChange={(rules) => {
                const sides = cfg.sides.slice();
                sides[SIDE_LEFT] = rules;
                setCfg({ ...cfg, sides });
              }}
            />
          )}
          {hasRight && (
            <SidePanel
              title={t("led.side.right")}
              rules={cfg.sides[SIDE_RIGHT] ?? []}
              ruleMax={cfg.ruleMax}
              onChange={(rules) => {
                const sides = cfg.sides.slice();
                sides[SIDE_RIGHT] = rules;
                setCfg({ ...cfg, sides });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Exported for stories: a config the firmware could plausibly hand us. */
export const sampleLedConfig = (caps: number): LedConfig => ({
  caps,
  ruleMax: LED_MAX_RULES,
  sides: [
    [
      { usecase: UseCase.LinkLost, colour: 0x01, pattern: Pattern.BlinkSlow, param: 0 },
      { usecase: UseCase.Modifier, colour: 0x04, pattern: Pattern.Solid, param: 0x02 },
    ],
    [
      { usecase: UseCase.LinkLost, colour: 0x01, pattern: Pattern.BlinkSlow, param: 0 },
      { usecase: UseCase.BatteryLow, colour: 0x01, pattern: Pattern.Double, param: 15 },
      {
        usecase: UseCase.ProfileChanged,
        colour: COLOUR_AUTO,
        pattern: Pattern.FlashLong,
        param: 0,
      },
    ],
  ],
});
