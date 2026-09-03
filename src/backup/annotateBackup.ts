// Adding the behavior-name table to an older backup file.
//
// ZMK numbers behaviors per device, so a v1-v3 backup's raw ids only mean
// something on the unit that produced it. Running this against that unit writes
// the id -> name table a v4+ file carries, which is what lets the file be
// restored onto a different keyboard later.
//
// It has to be the source keyboard, so the ids in the file are checked against
// this one before anything is written — every id must exist here, and a
// behavior that takes no parameters must not be carrying any. When that check
// fails the caller is asked whether to go ahead anyway; the panel owns that
// dialog, this owns the reason.

import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client/index";
import { tr } from "../i18n";
import {
  BACKUP_VERSION,
  BackupFile,
  usedBehaviorIds,
} from "./backupFormat";
import { readBehaviorTable, takesParams } from "./behaviorTable";

export interface AnnotatedBackup {
  /** The file with `behaviors` filled in, ready to save. */
  out: BackupFile;
  /** id -> display name, as written into the file. */
  names: Record<string, string>;
  /** Ids this keyboard had no name for — reported, not fatal. */
  missed: number[];
}

/**
 * Returns null when the caller declined to go ahead after a mismatch warning.
 */
export async function annotateBackup(o: {
  conn: RpcConnection;
  file: BackupFile;
  /** Shown when the file's ids don't line up with this keyboard. */
  confirmMismatch: (why: string) => boolean;
}): Promise<AnnotatedBackup | null> {
  const { conn, file, confirmMismatch } = o;

  if (!file.keymap?.layers?.length) {
    throw new Error(tr("bk.err.noKeymapInFile"));
  }

  const table = await readBehaviorTable(conn);
  if (!table.length) {
    throw new Error(tr("bk.err.noBehaviorList"));
  }
  const byId = new Map(table.map((b) => [b.id, b]));
  const used = usedBehaviorIds(file);

  // Sanity: every id the file uses must exist here, and behaviors that take
  // no parameters must not carry any — otherwise this is the wrong keyboard.
  const missing: number[] = [];
  const mismatched: number[] = [];
  for (const id of used) {
    const info = byId.get(id);
    if (!info) {
      missing.push(id);
      continue;
    }
    if (!takesParams(info)) {
      const carriesParams = (file.keymap?.layers ?? []).some((l) =>
        (l.bindings ?? []).some(
          (b) => b.behaviorId === id && (b.param1 !== 0 || b.param2 !== 0)
        )
      );
      if (carriesParams) mismatched.push(id);
    }
  }
  if (missing.length || mismatched.length) {
    const why = [
      missing.length
        ? tr("bk.annotate.missingIds", { ids: missing.join(", ") })
        : null,
      mismatched.length
        ? tr("bk.annotate.mismatchedIds", { ids: mismatched.join(", ") })
        : null,
    ]
      .filter(Boolean)
      .join(" / ");
    const go = confirmMismatch(why);
    if (!go) return null;
  }

  const names: Record<string, string> = {};
  for (const id of used) {
    const info = byId.get(id);
    if (info?.displayName) names[String(id)] = info.displayName;
  }
  const out: BackupFile = {
    ...file,
    version: Math.max(file.version, BACKUP_VERSION),
    behaviors: names,
  };

  return { out, names, missed: used.filter((id) => !names[String(id)]) };
}
