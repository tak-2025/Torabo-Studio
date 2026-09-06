import { useEffect, useMemo, useRef, useState } from "react";

import {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import { validateValue } from "./parameters";
import { BindingChangeResult, settleBindingChange } from "./bindingChange";
import { useI18n } from "../i18n";
import BehaviorGuides from "./behavior-guides.json";
import HiddenBehaviors from "./keymap-hidden-behaviors.json";

export type { BindingChangeResult };

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  /**
   * Apply the change. Returning `false` (or resolving to it) rolls the picker
   * back — see BindingChangeResult. Before this contract existed the picker
   * kept showing a selection the keyboard had rejected, and the user had no way
   * to tell a saved binding from a refused one.
   */
  onBindingChanged: (binding: BehaviorBinding) => BindingChangeResult;
}

/**
 * Could this binding be valid for the selected behavior?
 *
 * Three cases, and the middle one is the point:
 *
 *   - `undefined` metadata: the firmware told us NOTHING about this behavior's
 *     parameters. That is not a statement that it takes none — it is silence,
 *     and this function cannot answer. It says so by accepting only a bare
 *     0/0 binding and leaving the real verdict to the keyboard, which runs
 *     zmk_behavior_validate_binding() on the write and rejects what it does not
 *     like. sekigon's hires_dial_radial_controller_button is exactly this
 *     case (its driver reports no parameter metadata).
 *   - an EMPTY array: the behavior positively declares zero parameter sets, so
 *     0/0 is right and anything else is not.
 *   - a non-empty array: match the value against the declared sets, as before.
 *
 * The first two used to be one branch that answered `true` for both, which read
 * as "valid" for a behavior nobody had validated.
 */
export function validateBinding(
  metadata: BehaviorBindingParametersSet[] | undefined,
  layerIds: number[],
  param1?: number,
  param2?: number
): boolean {
  if (metadata === undefined || metadata.length === 0) {
    return !param1 && !param2;
  }

  if (
    (param1 === undefined || param1 === 0) &&
    metadata.every((s) => !s.param1 || s.param1.length === 0)
  ) {
    return true;
  }

  const matchingSet = metadata.find((s) =>
    validateValue(layerIds, param1, s.param1)
  );

  if (!matchingSet) {
    return false;
  }

  return validateValue(layerIds, param2, matchingSet.param2);
}

/** Behaviors the firmware reports but that cannot sensibly go on a key — the
 *  trackball's internal move/scroll and the rotary devices' sensor behaviors.
 *  Offering them is a trap: assigning `mouse_move` to a key just makes the
 *  pointer drift. The dial tab's push-button picker is this same component and
 *  wants the same list (a rotation behavior on a push does nothing either),
 *  which is why the file is not named after the keymap alone any more.
 *  See keymap-hidden-behaviors.json for why each one is here. */
const hiddenNames = new Set(
  (HiddenBehaviors.hidden as { name: string }[]).map((h) => h.name),
);

type Guide = { ja: string; en: string };
// The file carries a `_comment` string alongside the entries, so it is read
// through `unknown` and the lookup tolerates a miss.
const guides = BehaviorGuides as unknown as Record<string, Guide | string>;

/**
 * One line saying what the selected behavior does, and which field is which.
 *
 * The firmware's own parameter names cannot answer the second question. A
 * hold-tap builds its metadata out of its two child behaviors
 * (behavior_hold_tap.c), so Mod-Tap reports "Key" for BOTH of its parameters
 * and never says the first one is the hold. Anything not in the table falls
 * back to the names the firmware did report, which is still better than
 * nothing for a behavior we have not written a line for.
 */
function behaviorGuide(
  behavior: GetBehaviorDetailsResponse | undefined,
  lang: "ja" | "en",
): string | undefined {
  if (!behavior) return undefined;

  const guide = guides[behavior.displayName];
  if (guide && typeof guide !== "string") return guide[lang] ?? guide.en;

  const names = behavior.metadata
    ?.flatMap((set) => [...(set.param1 ?? []), ...(set.param2 ?? [])])
    .map((v) => v.name)
    .filter((n): n is string => !!n);
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique.join(" / ") : undefined;
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
}: BehaviorBindingPickerProps) => {
  const { t, lang } = useI18n();
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  const sortedBehaviors = useMemo(
    () =>
      behaviors
        // Keep one that is already bound: hiding the selected option would leave
        // the <select> showing nothing and could rewrite the binding on the next
        // change. Hiding is about not offering a bad choice, not about hiding
        // what a keymap already does.
        .filter((b) => !hiddenNames.has(b.displayName) || b.id === behaviorId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [behaviors, behaviorId]
  );

  const guide = useMemo(
    () => behaviorGuide(behaviors.find((b) => b.id === behaviorId), lang),
    [behaviors, behaviorId, lang]
  );

  // The confirmed binding, for the rollback below.
  const bindingRef = useRef(binding);
  bindingRef.current = binding;

  // Which edit is the live one. A rollback from an earlier, slower write must
  // not stomp on a later selection the user has already made.
  const editSeq = useRef(0);

  useEffect(() => {
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }

    if (!metadata) {
      // Not fatal any more: a behavior the firmware describes no parameters for
      // is still assignable, and the keyboard is the one that gets to refuse it.
      console.warn(
        "No parameter metadata for the selected behaviorId; letting the keyboard validate",
        behaviorId
      );
    }

    if (
      !validateBinding(
        metadata,
        layers.map(({ id }) => id),
        param1,
        param2
      )
    ) {
      return;
    }

    const seq = ++editSeq.current;
    settleBindingChange(() =>
      onBindingChanged({
        behaviorId,
        param1: param1 || 0,
        param2: param2 || 0,
      })
    ).then((ok) => {
      if (ok) return;
      if (seq !== editSeq.current) return; // superseded by a newer edit
      // Put the dropdowns back to what is really on the keyboard. Read through
      // the ref because this runs after an await, by which time the closure's
      // copy of the prop is a render old.
      const b = bindingRef.current;
      setBehaviorId(b.behaviorId);
      setParam1(b.param1);
      setParam2(b.param2);
    });
  }, [behaviorId, param1, param2]);

  useEffect(() => {
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
  }, [binding]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label>{t("behavior.label")}: </label>
        <select
          value={behaviorId}
          aria-label={t("behavior.label")}
          className="h-8 rounded"
          onChange={(e) => {
            setBehaviorId(parseInt(e.target.value));
            setParam1(0);
            setParam2(0);
          }}
        >
          {sortedBehaviors.map((b) => (
            <option key={b.id} value={b.id}>
              {b.displayName}
            </option>
          ))}
        </select>
        {guide && (
          <span className="text-xs text-base-content/70 leading-snug">
            {guide}
          </span>
        )}
      </div>
      {metadata && (
        <BehaviorParametersPicker
          metadata={metadata}
          param1={param1}
          param2={param2}
          layers={layers}
          onParam1Changed={setParam1}
          onParam2Changed={setParam2}
        />
      )}
    </div>
  );
};
