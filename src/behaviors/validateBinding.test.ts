/**
 * Tests for the picker's local validity check (BehaviorBindingPicker.tsx).
 *
 * It answers one question — is this binding worth sending at all? — and the
 * interesting part is the case it used to get wrong: a behavior whose parameter
 * metadata is MISSING is not the same as one that declares it takes no
 * parameters, and treating the two alike reported "valid" for a behavior nobody
 * had validated. sekigon's hires_dial_radial_controller_button is the real
 * instance.
 *
 * The keyboard remains the authority either way: this only decides whether the
 * picker bothers to ask.
 */
import { describe, it, expect } from "vitest";
import type { BehaviorBindingParametersSet } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import { validateBinding } from "./BehaviorBindingPicker";

const LAYERS = [0, 1, 2];

/** A behavior that takes a keycode. */
const KEY_PRESS: BehaviorBindingParametersSet[] = [
  { param1: [{ name: "Key", hidUsage: {} }], param2: [] },
] as unknown as BehaviorBindingParametersSet[];

/** A behavior that takes a layer id. */
const MOMENTARY: BehaviorBindingParametersSet[] = [
  { param1: [{ name: "Layer", layerId: {} }], param2: [] },
] as unknown as BehaviorBindingParametersSet[];

describe("validateBinding", () => {
  it("accepts a bare binding when the firmware declared no parameter sets", () => {
    // An EMPTY array is a positive statement: this behavior takes nothing.
    expect(validateBinding([], LAYERS, 0, 0)).toBe(true);
    expect(validateBinding([], LAYERS, undefined, undefined)).toBe(true);
  });

  it("rejects parameters on a behavior that declared none", () => {
    expect(validateBinding([], LAYERS, 4, 0)).toBe(false);
    expect(validateBinding([], LAYERS, 0, 9)).toBe(false);
  });

  it("treats MISSING metadata as unknown, not as 'takes nothing'", () => {
    // Silence from the firmware. A bare binding is the only thing we can send
    // without guessing; anything carrying parameters has to be refused here,
    // because there is nothing to check it against.
    expect(validateBinding(undefined, LAYERS, 0, 0)).toBe(true);
    expect(validateBinding(undefined, LAYERS, 4, 0)).toBe(false);
  });

  it("still accepts a zero param1 when no declared set takes one", () => {
    const noParam1 = [{ param1: [], param2: [] }] as unknown as
      BehaviorBindingParametersSet[];
    expect(validateBinding(noParam1, LAYERS, 0, 0)).toBe(true);
  });

  it("matches a value against the declared sets, as before", () => {
    expect(validateBinding(MOMENTARY, LAYERS, 2, 0)).toBe(true);
    expect(validateBinding(MOMENTARY, LAYERS, 9, 0)).toBe(false);
    // A HID usage is checked for a non-zero page and id.
    expect(validateBinding(KEY_PRESS, LAYERS, (0x07 << 16) | 0x04, 0)).toBe(true);
  });
});
