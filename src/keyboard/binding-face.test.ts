/**
 * Tests for the `&dmac` keycap legend — the one part of resolveBindingFace that
 * does not follow from the firmware's own parameter metadata.
 *
 * `&dmac`'s param1 is a bare `RANGE 0..DM_SLOTS-1`: no hidUsage, no layerId, no
 * named constants (torabo-tsuki_ext_FW features/macros/src/dmac_behavior.c). So
 * every metadata rule falls through and the SLOT NUMBER used to be drawn as if
 * it were a HID usage, i.e. an empty keycap. The resolver special-cases it by
 * display name (PLAN-keycap-legends.md §5) and labels it with the slot's name
 * when the app has one, `M<N>` when it does not.
 *
 * Pure function, no DOM — the repo's vitest runs in the node environment.
 */
import { describe, it, expect } from "vitest";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { resolveBindingFace, type LayerRef } from "./binding-face";

const LAYERS: LayerRef[] = [
  { id: 0, name: "Base" },
  { id: 1, name: "Nav" },
];

const dmac = (slot: number): BehaviorBinding =>
  ({ behaviorId: 42, param1: slot, param2: 0 }) as BehaviorBinding;

/**
 * What the firmware reports for `&dmac`: the overlay's display-name, and
 * metadata whose param1 is a plain range. Built by hand rather than captured,
 * so the shape the resolver has to survive is visible here.
 */
const MACRO_BEHAVIOR = {
  id: 42,
  displayName: "Dynamic Macro",
  metadata: [{ param1: [{ range: { min: 0, max: 19 } }], param2: [] }],
} as unknown as GetBehaviorDetailsResponse;

describe("resolveBindingFace: &dmac", () => {
  it("draws M<N> when no names are known", () => {
    // v1 firmware, or a v2 keyboard whose macros panel has not been read yet.
    expect(resolveBindingFace(dmac(0), MACRO_BEHAVIOR, LAYERS)).toEqual({
      text: "M0",
      muted: false,
    });
    expect(resolveBindingFace(dmac(19), MACRO_BEHAVIOR, LAYERS, null).text).toBe("M19");
  });

  it("draws the slot's name once one has been read", () => {
    const names = ["git", undefined, "コピー"];
    expect(resolveBindingFace(dmac(0), MACRO_BEHAVIOR, LAYERS, names).text).toBe("git");
    expect(resolveBindingFace(dmac(2), MACRO_BEHAVIOR, LAYERS, names).text).toBe("コピー");
  });

  it("falls back to M<N> per slot, not per keyboard", () => {
    // A names-capable keyboard with only some slots named: the unnamed ones
    // must still say which slot they are, not go blank.
    const names = ["git", "", undefined];
    expect(resolveBindingFace(dmac(1), MACRO_BEHAVIOR, LAYERS, names).text).toBe("M1");
    expect(resolveBindingFace(dmac(2), MACRO_BEHAVIOR, LAYERS, names).text).toBe("M2");
    // A slot past the end of the names we hold (a shorter read) is the same case.
    expect(resolveBindingFace(dmac(7), MACRO_BEHAVIOR, LAYERS, names).text).toBe("M7");
  });

  it("clips a long name to the key body budget", () => {
    const names = ["screenshot area"];
    const face = resolveBindingFace(dmac(0), MACRO_BEHAVIOR, LAYERS, names);
    expect(face.text).toBe("screens"); // MAX_BODY_LABEL = 7
  });

  it("never draws the slot number as a HID usage", () => {
    // The regression this branch exists for: `usage` is what made the keycap
    // render blank, because slot 3 is not usage 3.
    const face = resolveBindingFace(dmac(3), MACRO_BEHAVIOR, LAYERS);
    expect(face.usage).toBeUndefined();
  });

  it("leaves every other behavior alone", () => {
    // &kp A — param1 is a HID usage, and the macro branch must not intercept it.
    const kp = {
      id: 1,
      displayName: "Key Press",
      metadata: [{ param1: [{ hidUsage: { keyboardMax: 0xffff } }], param2: [] }],
    } as unknown as GetBehaviorDetailsResponse;
    const face = resolveBindingFace(
      { behaviorId: 1, param1: 0x00070004, param2: 0 } as BehaviorBinding,
      kp,
      LAYERS,
      ["git"],
    );
    expect(face).toEqual({ usage: 0x00070004, muted: false });
  });
});
