// Reading the whole keyboard into a backup file.
//
// The panel owns the save dialog and the status line; this owns what goes in
// the file. Every wire-blob section comes from the same table restore writes
// back from (sections.ts), so the two directions cannot drift apart.

import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client/index";
import { call_rpc } from "../rpc/logging";
import { tr } from "../i18n";
import { ToraboCaps } from "../caps/toraboCaps";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupFile,
  bytesToBase64,
} from "./backupFormat";
import { idToName, readBehaviorTable } from "./behaviorTable";
import {
  generateKeymapDts,
  BehaviorById,
  ExportLayer,
} from "./keymapExport";
import { BACKUP_SECTIONS, BLOB_RESTORE_SECTIONS, SectionKey } from "./sections";

export interface CollectedBackup {
  file: BackupFile;
  /** Section names for the "saved X + Y + Z" summary, in display order. */
  parts: string[];
}

/**
 * Read every section this keyboard can give us. Throws only when there is
 * nothing at all to save — a section the firmware lacks is simply left out.
 */
export async function collectBackup(o: {
  conn: RpcConnection;
  caps: ToraboCaps | null;
  onProgress: (msg: string) => void;
}): Promise<CollectedBackup> {
  const { conn, caps, onProgress } = o;

  // --- device name (informational only; never blocks the export) ---
  let deviceName: string | null = null;
  try {
    const info = (await call_rpc(conn, { core: { getDeviceInfo: true } }))
      ?.core?.getDeviceInfo;
    deviceName = info?.name || null;
  } catch (e) {
    console.warn("getDeviceInfo failed:", e);
  }

  // Every wire-blob section, in table order. A section the firmware was
  // not built with simply rejects the read, and is left out of the file.
  const blobs: Partial<Record<SectionKey, { wireBase64: string }>> = {};
  for (const s of BACKUP_SECTIONS) {
    if (s.supported && !s.supported(caps)) continue;
    try {
      blobs[s.key] = { wireBase64: bytesToBase64(await s.read()) };
    } catch (e) {
      console.warn(`${s.key} read skipped:`, e);
    }
  }

  // --- keymap ---
  let keymap: BackupFile["keymap"] = null;
  const km = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap
    ?.getKeymap;
  if (km?.layers) {
    keymap = {
      layers: km.layers.map((l: any) => ({
        name: l.name,
        bindings: (l.bindings ?? []).map((b: any) => ({
          behaviorId: b.behaviorId ?? 0,
          param1: b.param1 ?? 0,
          param2: b.param2 ?? 0,
        })),
      })),
    };
  }

  // --- behavior id -> name table (what makes the keymap portable) ---
  let behaviors: BackupFile["behaviors"] = null;
  if (keymap) {
    onProgress(tr("bk.busy.behaviorNames"));
    try {
      behaviors = idToName(await readBehaviorTable(conn));
    } catch (e) {
      console.warn("behavior table read failed:", e);
    }
  }

  if (!keymap && !BACKUP_SECTIONS.some((s) => blobs[s.key])) {
    throw new Error(tr("bk.err.nothingToExport"));
  }

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    trackball: blobs.trackball ?? null,
    keymap,
    macros: blobs.macros ?? null,
    combos: blobs.combos ?? null,
    trackpad: blobs.trackpad ?? null,
    behaviors,
    timing: blobs.timing ?? null,
    encoder: blobs.encoder ?? null,
    led: blobs.led ?? null,
    device: deviceName ? { name: deviceName } : null,
  };

  const parts = [
    ...BLOB_RESTORE_SECTIONS.filter((s) => blobs[s.key]).map((s) =>
      tr(s.labelKey)
    ),
    keymap
      ? tr("bk.export.keymap", {
          n: keymap.layers.length,
          note: behaviors
            ? tr("bk.export.withNames")
            : tr("bk.export.noNames"),
        })
      : null,
    blobs.macros ? tr("bk.sec.macros") : null,
    blobs.combos ? tr("bk.sec.combos") : null,
  ].filter((p): p is string => p !== null);

  return { file, parts };
}

export interface GeneratedKeymap {
  /** The .keymap text, ready to save. */
  text: string;
  layerCount: number;
}

/**
 * Render the connected keyboard's keymap as a ZMK `.keymap` file. Every
 * behavior is resolved first so each binding gets the right label and arity;
 * anything that cannot be rendered comes out as a FIXME, which the caller
 * counts to decide whether the result needs attention.
 */
export async function buildKeymapDts(conn: RpcConnection): Promise<GeneratedKeymap> {
  const km = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap
    ?.getKeymap;
  if (!km?.layers?.length) {
    throw new Error(tr("bk.err.noKeymap"));
  }

  const behaviors: BehaviorById = {};
  for (const b of await readBehaviorTable(conn)) {
    behaviors[b.id] = { displayName: b.displayName, metadata: b.metadata };
  }

  const layers: ExportLayer[] = km.layers.map((l: any) => ({
    name: l.name,
    bindings: (l.bindings ?? []).map((b: any) => ({
      behaviorId: b.behaviorId ?? 0,
      param1: b.param1 ?? 0,
      param2: b.param2 ?? 0,
    })),
  }));

  return { text: generateKeymapDts(layers, behaviors), layerCount: layers.length };
}
