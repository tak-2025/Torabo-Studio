// Putting a backup file back onto the keyboard.
//
// Lifted out of BackupPanel unchanged: the panel opens the file, asks for
// confirmation and paints the result, and everything between those two points
// lives here. It is the longest single flow in the app — nine sections, three of
// which report their own per-slot progress — and it used to sit in the middle of
// a 670-line component next to export, keymap generation and annotation.
//
// Nothing here throws for a section that fails. Every section is attempted
// independently and its failure recorded, because a backup whose trackball wire
// no longer matches this firmware must not stop the keymap from being restored.

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { SetLayerBindingResponse } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client/index";
import { call_rpc } from "../rpc/logging";
import { tr } from "../i18n";
import { ToraboCaps, hasMacroNames } from "../caps/toraboCaps";
import { dmacWriteSlot, comboWriteSlot } from "../backends";
import {
  decodeDmac,
  encodeMacroName,
  encodeSlot as encodeMacroSlot,
  DM_SLOTS,
} from "../dynamic_macros/dmacConfig";
import {
  decodeCombos,
  encodeSlot as encodeComboSlot,
  CB_SLOTS,
} from "../dynamic_combos/comboConfig";
import {
  BackupBinding,
  BackupFile,
  BackupLayer,
  backupCompatNote,
  base64ToBytes,
} from "./backupFormat";
import { BehaviorInfo, nameToId, readBehaviorTable } from "./behaviorTable";
import {
  BLOB_RESTORE_SECTIONS,
  BackupSection,
  SECTION_BY_KEY,
  restoreBlock,
} from "./sections";

/** Short human text for whatever a failed restore step threw. */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Why the keyboard rejected a setLayerBinding, in the order of the RPC enum.
 * Values are message keys — the text is looked up at report time so it follows
 * the current language.
 */
const FAIL_LABEL_KEY: Record<string, string> = {
  "1": "bk.fail.1",
  "2": "bk.fail.2",
  "3": "bk.fail.3",
  other: "bk.fail.other",
};

/** Localized reason for a setLayerBinding response code. */
function failLabel(code: string): string {
  const key = FAIL_LABEL_KEY[code];
  return key ? tr(key) : tr("bk.fail.code", { code });
}

interface KeymapRestore {
  /** Bindings actually written. */
  changed: number;
  /** Writes the keyboard rejected. */
  failed: number;
  /** failed, broken down by RPC response code (see FAIL_LABEL_KEY). */
  failByCode: Record<string, number>;
  /** Bindings whose behavior does not exist on this firmware. */
  unsupported: number;
  /** True when the file carries an id -> behavior-name table (v4+). */
  hasNameTable: boolean;
  /** Bindings whose behavior id was translated to this keyboard's numbering. */
  remapped: number;
  /** Behavior names in the file that this keyboard doesn't have. */
  unmappedNames: string[];
  /** Behavior names this keyboard uses more than once (translation ambiguous). */
  duplicateNames: string[];
  /** Layers on the keyboard that the file had data for. */
  layersSynced: number;
  layersOnKeyboard: number;
  layersInFile: number;
  /** File key positions past the end of the keyboard's layer. */
  keysUnwritten: number;
  /** Keyboard key positions the file had no data for. */
  keysUntouched: number;
  /** Size of the firmware's behavior-id list, or null if it couldn't be read. */
  behaviorListSize: number | null;
  /**
   * Response code from writing the keyboard's *own* current binding back to
   * layer 0 / position 0 (a no-op the firmware must accept). Anything but OK
   * means the keyboard is refusing every write, whatever the backup contains.
   */
  selfTest: number | string;
  /** Set when we gave up early because nothing at all was being accepted. */
  abortedEarly: boolean;
}

/** Stop hammering the BLE link once it's clear every write is being rejected. */
const FAIL_FAST_AFTER = 20;

/**
 * Write the backup's bindings onto the layers the keyboard currently has.
 *
 * Behavior ids are translated through the backup's name table (v4+) into this
 * keyboard's numbering — ZMK assigns ids per device, so a raw id from another
 * unit points at a different behavior and gets rejected. Files without a name
 * table are written with their raw ids, which only works on the source unit.
 *
 * Layer/key counts in the file are treated as advisory only: layers are matched
 * by index against the keyboard's *existing* (unlocked) layers, extra layers and
 * key positions in the file are ignored, and positions the file doesn't cover
 * are left alone. Nothing here aborts on a size mismatch — a keymap saved by an
 * older firmware still restores as far as it lines up.
 */
async function restoreKeymap(
  conn: any,
  backupLayers: BackupLayer[],
  fileBehaviors: Record<string, string> | null | undefined,
  onProgress: (msg: string) => void
): Promise<KeymapRestore> {
  const cur = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap
    ?.getKeymap;
  if (!cur?.layers?.length) {
    throw new Error(tr("bk.err.noCurrentKeymap"));
  }

  // This keyboard's behaviors: ids to check against, names to translate through.
  onProgress(tr("bk.busy.behaviorTable"));
  let table: BehaviorInfo[] = [];
  try {
    table = await readBehaviorTable(conn);
  } catch (e) {
    console.warn("behavior table unavailable; writing every binding:", e);
  }
  const known: Set<number> | null = table.length
    ? new Set(table.map((b) => b.id))
    : null;
  const { map: nameMap, duplicates } = nameToId(table);

  // file id -> this keyboard's id (identity when the file has no name table).
  const translated = new Map<number, number | null>();
  const unmappedNames: string[] = [];
  const idOf = (fileId: number): number | null => {
    if (translated.has(fileId)) return translated.get(fileId)!;
    let out: number | null = fileId;
    const name = fileBehaviors?.[String(fileId)];
    if (name) {
      const target = nameMap.get(name);
      out = target ?? null;
      if (target === undefined && !unmappedNames.includes(name)) {
        unmappedNames.push(name);
      }
    }
    translated.set(fileId, out);
    return out;
  };

  const r: KeymapRestore = {
    changed: 0,
    failed: 0,
    failByCode: {},
    unsupported: 0,
    layersSynced: 0,
    layersOnKeyboard: cur.layers.length,
    layersInFile: backupLayers.length,
    keysUnwritten: 0,
    keysUntouched: 0,
    behaviorListSize: known ? known.size : null,
    hasNameTable: !!fileBehaviors,
    remapped: 0,
    unmappedNames,
    duplicateNames: duplicates,
    selfTest: "skipped",
    abortedEarly: false,
  };

  // Sanity probe: write layer 0 / position 0's existing binding back unchanged.
  // The firmware validates it exactly like any other write but stores nothing
  // (it memcmps first), so this separates "the backup's data is bad" from "this
  // keyboard rejects setLayerBinding outright".
  {
    const self0: any = (cur.layers[0].bindings ?? [])[0];
    if (self0) {
      const resp = await call_rpc(conn, {
        keymap: {
          setLayerBinding: {
            layerId: cur.layers[0].id,
            keyPosition: 0,
            binding: {
              behaviorId: self0.behaviorId ?? 0,
              param1: self0.param1 ?? 0,
              param2: self0.param2 ?? 0,
            },
          },
        },
      });
      const code = resp?.keymap?.setLayerBinding;
      r.selfTest = typeof code === "number" ? code : errText(resp);
      console.log("keymap self-test write", { binding: self0, response: resp });
    }
  }

  for (let li = 0; li < cur.layers.length && !r.abortedEarly; li++) {
    const sav = backupLayers[li];
    if (!sav) continue; // file has fewer layers → leave this one as-is
    const layerId = cur.layers[li].id;
    const curB = cur.layers[li].bindings ?? [];
    const savB = sav.bindings ?? [];
    r.keysUnwritten += Math.max(0, savB.length - curB.length);
    r.keysUntouched += Math.max(0, curB.length - savB.length);
    r.layersSynced++;
    onProgress(
      tr("bk.busy.restoreLayer", { n: li + 1, total: cur.layers.length })
    );

    const posN = Math.min(curB.length, savB.length);
    for (let kp = 0; kp < posN; kp++) {
      const saved = savB[kp];
      if (!saved) continue;
      // Translate the file's behavior id into this keyboard's numbering first —
      // everything below (including the "unchanged" check) works on local ids.
      const localId = idOf(saved.behaviorId);
      if (localId === null) {
        r.unsupported++;
        continue; // behavior name absent on this keyboard
      }
      if (localId !== saved.behaviorId) r.remapped++;
      const b: BackupBinding = { ...saved, behaviorId: localId };
      const c: any = curB[kp] ?? {};
      if (
        c.behaviorId === b.behaviorId &&
        c.param1 === b.param1 &&
        c.param2 === b.param2
      ) {
        continue; // unchanged → skip (less BLE traffic)
      }
      if (known && !known.has(b.behaviorId)) {
        r.unsupported++;
        continue;
      }
      const req = {
        keymap: {
          setLayerBinding: {
            layerId,
            keyPosition: kp,
            binding: {
              behaviorId: b.behaviorId,
              param1: b.param1,
              param2: b.param2,
            },
          },
        },
      };
      const resp = await call_rpc(conn, req);
      const code = resp?.keymap?.setLayerBinding;
      if (code === SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) {
        r.changed++;
        continue;
      }
      // Anything else: record why. `call_rpc` returns the Error object instead
      // of throwing, so a transport/simple error shows up as a missing code.
      const key = typeof code === "number" ? String(code) : "other";
      r.failByCode[key] = (r.failByCode[key] ?? 0) + 1;
      r.failed++;
      if (r.failed <= 5) {
        console.warn(
          `setLayerBinding failed: layer ${li} (id ${layerId}) pos ${kp} ` +
            `behavior ${b.behaviorId} params 0x${(b.param1 >>> 0).toString(16)}/` +
            `0x${(b.param2 >>> 0).toString(16)} → code ${code ?? errText(resp)}`,
          { request: req, response: resp, current: curB[kp] }
        );
      }
      if (r.changed === 0 && r.failed >= FAIL_FAST_AFTER) {
        r.abortedEarly = true;
        break;
      }
    }
  }

  if (r.changed) {
    await call_rpc(conn, { keymap: { saveChanges: true } });
  }
  return r;
}

/** Turn a completed keymap restore into restored/skipped summary lines. */
function reportKeymapOutcome(
  km: KeymapRestore,
  restored: string[],
  skipped: string[]
): void {
  const bits = [tr("bk.km.changed", { n: km.changed })];
  if (km.failed) bits.push(tr("bk.km.failed", { n: km.failed }));
  if (km.remapped) bits.push(tr("bk.km.remapped", { n: km.remapped }));
  if (km.unsupported) {
    bits.push(tr("bk.km.unsupported", { n: km.unsupported }));
  }
  restored.push(
    tr("bk.restored.keymap", {
      done: km.layersSynced,
      total: km.layersOnKeyboard,
      bits: bits.join(" / "),
    })
  );

  // Behavior ids are per-keyboard. Without a name table the raw ids are
  // written as-is, which only lands correctly on the source unit.
  if (!km.hasNameTable) {
    skipped.push(tr("bk.skip.noNameTable"));
  }
  if (km.unmappedNames.length) {
    skipped.push(
      tr("bk.skip.unmappedNames", { names: km.unmappedNames.join(", ") })
    );
  }
  if (km.duplicateNames.length) {
    skipped.push(
      tr("bk.skip.duplicateNames", { names: km.duplicateNames.join(", ") })
    );
  }

  // A failure count alone can't be acted on — say what the keyboard
  // actually answered, and whether we could read its behavior list.
  if (km.failed && km.selfTest !== SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) {
    skipped.push(tr("bk.skip.selfTestNg", { code: km.selfTest }));
  } else if (km.failed) {
    skipped.push(tr("bk.skip.selfTestOk"));
  }
  for (const [code, n] of Object.entries(km.failByCode)) {
    skipped.push(
      tr("bk.skip.failBreakdown", { label: failLabel(code), n })
    );
  }
  if (km.abortedEarly) {
    skipped.push(tr("bk.skip.abortedEarly", { n: FAIL_FAST_AFTER }));
  }
  if (km.failed && km.behaviorListSize === null) {
    skipped.push(tr("bk.skip.noBehaviorList"));
  }

  // Layer/key count differences are informational — the sync went ahead.
  if (km.layersInFile !== km.layersOnKeyboard) {
    skipped.push(
      tr("bk.skip.layerCount", {
        file: km.layersInFile,
        kbd: km.layersOnKeyboard,
      })
    );
  }
  if (km.keysUnwritten) {
    skipped.push(tr("bk.skip.keysUnwritten", { n: km.keysUnwritten }));
  }
  if (km.keysUntouched) {
    skipped.push(tr("bk.skip.keysUntouched", { n: km.keysUntouched }));
  }
}

export interface RestoreOutcome {
  /** One line per section that landed, for the summary. */
  restored: string[];
  /** One line per section that did not, with the reason. */
  skipped: string[];
  /** Bindings the keyboard refused or did not understand. */
  attention: number;
}

export async function restoreBackup(o: {
  conn: RpcConnection;
  caps: ToraboCaps | null;
  lockState: LockState;
  file: BackupFile;
  /** Called with each step's busy message — per-slot writes take a while. */
  onProgress: (msg: string) => void;
}): Promise<RestoreOutcome> {
  const { conn, caps, lockState, file, onProgress } = o;

  // Every section is restored independently: a backup whose trackball /
  // macro / combo wire no longer matches this firmware must not stop the
  // keymap from being restored (that mismatch used to abort the whole
  // import). Failures are collected and reported, never thrown.
  const restored: string[] = [];
  const skipped: string[] = [];
  const note = backupCompatNote(file);
  if (note) skipped.push(note);

  const section = async (
    label: string,
    fn: () => Promise<string | null>
  ) => {
    try {
      const done = await fn();
      if (done) restored.push(done);
    } catch (e) {
      console.warn(`restore skipped (${label}):`, e);
      skipped.push(tr("bk.sectionFailed", { label, err: errText(e) }));
    }
  };

  /**
   * Run the wire-version gates on a section's stored blob before it is written.
   *
   * Returns the bytes when the write may go ahead, or null after recording why
   * it may not — a mismatch in either direction (see sections.ts's
   * restoreBlock) is a skipped section with a reason, never a write we hope the
   * firmware will refuse.
   */
  const gated = (s: BackupSection, wire: string): Uint8Array | null => {
    const bytes = base64ToBytes(wire);
    const block = restoreBlock(s, bytes, caps);
    if (!block) return bytes;
    skipped.push(tr(block.key, { label: tr(s.labelKey), ...block.vars }));
    return null;
  };

  // Custom-GATT configs first (no Studio unlock needed). Each write applies
  // live + NVS on the keyboard. Macros/combos are written one slot at a time.

  // 1) the wire-blob sections, in table order. A section the backup does
  //    not carry is silently absent (older format); one this keyboard has
  //    no hardware/firmware for is reported as skipped rather than written.
  for (const s of BLOB_RESTORE_SECTIONS) {
    const label = tr(s.labelKey);
    await section(label, async () => {
      const wire = file[s.key]?.wireBase64;
      if (!wire) return null;
      if (s.supported && !s.supported(caps)) {
        if (s.skipKey) skipped.push(tr(s.skipKey));
        return null;
      }
      const bytes = gated(s, wire);
      if (!bytes) return null;
      await s.write(bytes);
      return label;
    });
  }

  // 2) macros (per-slot write; restores every slot incl. cleared ones)
  //
  // Names ride along when both sides have them. The v5 backup stores the READ
  // wire verbatim, so a blob taken off names-capable firmware IS a dm v2 image
  // and carries the name block (PLAN-ext-fw-refactor.md フェーズ8) — no backup
  // format bump was needed for this, and none happened.
  //
  // Steps and names are gated separately, because they are separate ops and
  // only one of them depends on the firmware being new:
  //   STEPS always go, whatever version the file is, because encodeMacroSlot
  //     emits v1 and always will. This is why the macros section opts out of
  //     the generic blob-newer-than-firmware gate (sections.ts, replayDecoded):
  //     a v2 backup restores its steps onto v1 firmware perfectly.
  //   NAMES need a keyboard that has somewhere to put them. Sent only when the
  //     file carries them AND the descriptor reports the v2 macros wire. When
  //     the file has names and the keyboard does not, that is not a failure —
  //     the restore is real and the steps are right — so it is reported as a
  //     note rather than a skipped section.
  //
  // hasMacroNames(null) is false, which is the right answer for firmware that
  // cannot introduce itself: it predates the capability descriptor, which
  // predates names by a long way. Guessing "maybe" here would mean sending a v2
  // op to firmware that rejects it, and the thrown error would abandon the rest
  // of the slots — losing a restore that was otherwise working.
  await section(tr("bk.sec.macros"), async () => {
    if (!file.macros?.wireBase64) return null;
    const bytes = gated(SECTION_BY_KEY.macros, file.macros.wireBase64);
    if (!bytes) return null;
    onProgress(tr("bk.busy.restoreMacros"));
    const mc = decodeDmac(bytes);
    const writeNames = mc.hasNames && hasMacroNames(caps);
    for (let i = 0; i < DM_SLOTS; i++) {
      await dmacWriteSlot(encodeMacroSlot(i, mc.slots[i]?.steps ?? []));
      if (writeNames) {
        // After the steps write, so a slot whose steps failed does not end up
        // named after a macro it no longer holds.
        await dmacWriteSlot(encodeMacroName(i, mc.slots[i]?.name ?? ""));
      }
    }
    if (mc.hasNames && !writeNames) {
      skipped.push(tr("bk.skip.macroNamesUnsupported"));
    }
    // Two literal calls rather than a computed key: scripts/check-i18n.mjs
    // finds referenced keys by scanning for a string literal directly inside a
    // tr() call, and a ternary there would leave both of these reported as
    // unreferenced.
    return writeNames
      ? tr("bk.restored.macrosNamed", { n: DM_SLOTS })
      : tr("bk.restored.macros", { n: DM_SLOTS });
  });

  // 3) combos (per-slot write)
  await section(tr("bk.sec.combos"), async () => {
    if (!file.combos?.wireBase64) return null;
    const bytes = gated(SECTION_BY_KEY.combos, file.combos.wireBase64);
    if (!bytes) return null;
    onProgress(tr("bk.busy.restoreCombos"));
    const cc = decodeCombos(bytes);
    for (let i = 0; i < CB_SLOTS; i++) {
      await comboWriteSlot(encodeComboSlot(i, cc.slots[i]));
    }
    return tr("bk.restored.combos", { n: CB_SLOTS });
  });

  // 4) keymap (requires Studio unlock)
  let km: KeymapRestore | null = null;
  try {
    if (!file.keymap?.layers?.length) {
      throw new Error(tr("bk.err.notInBackup"));
    }
    if (lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
      throw new Error(tr("bk.err.needUnlock"));
    }
    onProgress(tr("bk.busy.restoreKeymap"));
    km = await restoreKeymap(
      conn,
      file.keymap.layers,
      file.behaviors,
      onProgress
    );
    reportKeymapOutcome(km, restored, skipped);
  } catch (e) {
    console.warn("restore skipped (keymap):", e);
    skipped.push(
      tr("bk.sectionFailed", {
        label: tr("bk.sec.keymap"),
        err: errText(e),
      })
    );
  }

  return {
    restored,
    skipped,
    attention: (km?.failed ?? 0) + (km?.unsupported ?? 0),
  };
}
