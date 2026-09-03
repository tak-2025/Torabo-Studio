/**
 * Tests for the macro half of restore — the one section that does NOT write the
 * bytes it was given.
 *
 * Restore decodes the stored macro wire and replays it as this app's own
 * per-slot ops, so the interesting behaviour is which OPS come out for a given
 * (file version, firmware) pair: steps always, in v1; names only when both the
 * file and the keyboard have them. See restoreBackup.ts's macros section and
 * BackupSection.replayDecoded in sections.ts.
 *
 * The backend is mocked at the module boundary, which is what makes the ops
 * observable: every assertion below is "what did the app try to write".
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client/index";

import { tr } from "../i18n";
import {
  CAPS_HDR,
  CAPS_FEAT,
  CAPS_MAGIC,
  CAPS_DESC_VERSION,
  Feature,
  decodeCaps,
} from "../caps/toraboCaps";
import {
  DM_MAGIC,
  DM_NAME_MAX,
  DM_SLOTS,
  DM_STEPS,
  DM_VERSION_V1,
  DM_VERSION_V2,
  DmAction,
} from "../dynamic_macros/dmacConfig";
import { bytesToBase64, type BackupFile } from "./backupFormat";
import { restoreBackup } from "./restoreBackup";

/**
 * Every op the app tried to write, in order. `vi.hoisted` because the mock
 * factory below runs while ./restoreBackup is being imported — before this
 * file's own top-level statements.
 */
const { written } = vi.hoisted(() => ({ written: [] as Uint8Array[] }));

/**
 * Every function sections.ts and restoreBackup.ts pull out of ../backends. Only
 * dmacWriteSlot is ever called here — the others exist so the module resolves.
 */
vi.mock("../backends", () => ({
  dmacWriteSlot: async (d: Uint8Array) => {
    written.push(d);
  },
  comboWriteSlot: vi.fn(async () => {}),
  dmacReadAll: vi.fn(),
  comboReadAll: vi.fn(),
  trackballReadConfig: vi.fn(),
  trackballWriteConfig: vi.fn(),
  trackpadReadConfig: vi.fn(),
  trackpadWriteConfig: vi.fn(),
  encoderReadConfig: vi.fn(),
  encoderWriteConfig: vi.fn(),
  ledReadConfig: vi.fn(),
  ledWriteConfig: vi.fn(),
  timingReadConfig: vi.fn(),
  timingWriteConfig: vi.fn(),
}));

const STEP_BYTES = 5;
const READ_SLOT = 1 + DM_STEPS * STEP_BYTES;
const READ_NAME = 1 + DM_NAME_MAX;

/** A macros READ wire as a backup file would hold it. `names` makes it v2. */
function macroWire(version: 1 | 2 | 3, names?: Record<number, string>): Uint8Array {
  const namesBase = 4 + DM_SLOTS * READ_SLOT;
  const buf = new Uint8Array(namesBase + (version === 2 ? DM_SLOTS * READ_NAME : 0));
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, DM_MAGIC, true);
  dv.setUint8(2, version);
  dv.setUint8(3, DM_SLOTS);
  // One step in slot 0, so "the steps were restored" is observable.
  dv.setUint8(4, 1);
  dv.setUint8(5, DmAction.Tap);
  dv.setUint32(6, 0x00070004, true);
  for (const [idxStr, name] of Object.entries(names ?? {})) {
    const nb = new TextEncoder().encode(name);
    const o = namesBase + Number(idxStr) * READ_NAME;
    dv.setUint8(o, nb.length);
    buf.set(nb, o + 1);
  }
  return buf;
}

function fileWith(wire: Uint8Array): BackupFile {
  return {
    format: "torabo-tsuki-backup",
    version: 5,
    exportedAt: new Date(0).toISOString(),
    trackball: null,
    keymap: null, // out of scope here; reported as its own skipped line
    macros: { wireBase64: bytesToBase64(wire) },
  };
}

/** Same builder the caps tests use. */
function caps(features: { id: number; wireVer: number }[]) {
  const buf = new Uint8Array(CAPS_HDR + features.length * CAPS_FEAT);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, CAPS_MAGIC, true);
  dv.setUint8(2, CAPS_DESC_VERSION);
  dv.setUint8(6, features.length);
  features.forEach((f, i) => {
    const o = CAPS_HDR + i * CAPS_FEAT;
    dv.setUint8(o, f.id);
    dv.setUint8(o + 1, f.wireVer);
  });
  return decodeCaps(buf);
}

const run = (wire: Uint8Array, fw: ReturnType<typeof caps> | null) =>
  restoreBackup({
    conn: {} as unknown as RpcConnection,
    caps: fw,
    lockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED,
    file: fileWith(wire),
    onProgress: () => {},
  });

/** The ops the app wrote, split by their version byte (v1 = steps, v2 = name). */
function opsWritten() {
  return {
    steps: written.filter((b) => b[0] === DM_VERSION_V1),
    names: written.filter((b) => b[0] === DM_VERSION_V2),
    all: written,
  };
}

// The keymap section is out of scope here and reports itself as skipped, which
// it does through console.warn. Quieted so a passing run stays readable.
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
afterAll(() => warn.mockRestore());

beforeEach(() => {
  written.length = 0;
});

describe("restoreBackup: macros", () => {
  it("replays a v2 backup's steps onto v1 firmware, with no name ops", async () => {
    // The relaxation: the file's bytes never reach the keyboard, and the steps
    // ops this app encodes are v1 — which v1 firmware has always accepted. A
    // whole legitimate restore used to be thrown away here.
    const out = await run(
      macroWire(2, { 0: "git" }),
      caps([{ id: Feature.Macros, wireVer: 1 }]),
    );
    const { steps, names } = opsWritten();
    expect(steps).toHaveLength(DM_SLOTS);
    expect(names).toHaveLength(0);
    // …and the user is told the names were dropped, as a note beside the
    // restore rather than instead of it.
    expect(out.restored).toContain(tr("bk.restored.macros", { n: DM_SLOTS }));
    expect(out.skipped).toContain(tr("bk.skip.macroNamesUnsupported"));
  });

  it("writes steps and names on names-capable firmware", async () => {
    const out = await run(
      macroWire(2, { 0: "git" }),
      caps([{ id: Feature.Macros, wireVer: 2 }]),
    );
    const { steps, names } = opsWritten();
    expect(steps).toHaveLength(DM_SLOTS);
    expect(names).toHaveLength(DM_SLOTS);
    // Slot 0's name op carries the stored name; every op is the 20-byte shape.
    expect(names.every((b) => b.byteLength === 20 && b[2] === 1)).toBe(true);
    expect(names[0][3]).toBe(3);
    expect(out.restored).toContain(tr("bk.restored.macrosNamed", { n: DM_SLOTS }));
    expect(out.skipped).not.toContain(tr("bk.skip.macroNamesUnsupported"));
  });

  it("sends no name ops for a v1 backup, whatever the firmware", async () => {
    // The keyboard KEEPS the names it has: steps writes are v1 and never touch
    // them. Silence is the correct behaviour, so there is no note either.
    const out = await run(macroWire(1), caps([{ id: Feature.Macros, wireVer: 2 }]));
    const { steps, names } = opsWritten();
    expect(steps).toHaveLength(DM_SLOTS);
    expect(names).toHaveLength(0);
    expect(out.skipped).not.toContain(tr("bk.skip.macroNamesUnsupported"));
  });

  it("drops names on pre-capabilities firmware rather than risk the restore", async () => {
    // caps === null predates the descriptor, which predates names by a long
    // way. Sending a v2 op there would be rejected, and the throw would
    // abandon the remaining slots.
    const out = await run(macroWire(2, { 0: "git" }), null);
    const { steps, names } = opsWritten();
    expect(steps).toHaveLength(DM_SLOTS);
    expect(names).toHaveLength(0);
    expect(out.skipped).toContain(tr("bk.skip.macroNamesUnsupported"));
  });

  it("skips a macro wire this app's codec cannot read at all", async () => {
    const out = await run(macroWire(3), caps([{ id: Feature.Macros, wireVer: 1 }]));
    expect(opsWritten().all).toHaveLength(0);
    expect(out.skipped).toContain(
      tr("bk.skip.blobNewerThanApp", {
        label: tr("bk.sec.macros"),
        file: 3,
        app: 2,
      }),
    );
  });
});
