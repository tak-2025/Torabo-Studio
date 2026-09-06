/**
 * The contract between BehaviorBindingPicker and whoever applies its changes.
 *
 * The picker holds its own copy of the selection while the user is choosing, and
 * hands the finished binding to its caller. Until this existed, the caller had
 * no way to say the change had NOT taken: `onBindingChanged` returned void, so a
 * keyboard that rejected setLayerBinding left the dropdowns showing the rejected
 * choice and the user read a refusal as a save.
 *
 * Kept in its own plain module, apart from the component, so the rule below can
 * be stated once and tested without a DOM.
 */

/**
 * What a caller answers when the picker hands it a new binding.
 *
 * `false` — or a promise resolving to it — means the change did not take.
 * Anything else, including the plain `void` a caller that cannot fail returns,
 * means it did. A caller that throws is treated as a failure too: an exception
 * escaping the apply is exactly the case where the picker must not keep showing
 * the new value.
 */
export type BindingChangeResult = void | boolean | Promise<void | boolean>;

/** Is this a thenable we should wait on? */
function isPromise(v: unknown): v is Promise<void | boolean> {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

/**
 * Normalise any BindingChangeResult into the one question the picker asks:
 * did the change stick?
 *
 * Never rejects — a thrown or rejected apply resolves to `false`, because the
 * picker's answer to both is the same (put the selection back) and a rejection
 * escaping into a React effect would only become an unhandled rejection.
 */
export async function settleBindingChange(
  run: () => BindingChangeResult,
): Promise<boolean> {
  let result: BindingChangeResult;
  try {
    result = run();
  } catch (e) {
    console.error("binding change failed", e);
    return false;
  }
  if (result === false) return false;
  if (!isPromise(result)) return true;
  try {
    return (await result) !== false;
  } catch (e) {
    console.error("binding change failed", e);
    return false;
  }
}
