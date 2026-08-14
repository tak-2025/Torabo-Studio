/**
 * Behavior id <-> display-name table for the connected keyboard.
 *
 * ZMK assigns behavior *local ids* per device (settings-table numbering), so the
 * same number means different behaviors on different keyboards — `&kp` is id 8
 * on one unit and id 4 on another. Backups therefore store the display name of
 * each behavior they reference, and the importer translates those names into the
 * target keyboard's ids using this table.
 */

import { call_rpc } from "../rpc/logging";

export interface BehaviorInfo {
  id: number;
  displayName: string;
  /** Parameter metadata sets, as returned by getBehaviorDetails. */
  metadata: any[];
}

/** Read every behavior the connected keyboard exposes (one RPC per behavior). */
export async function readBehaviorTable(conn: any): Promise<BehaviorInfo[]> {
  const ids: number[] =
    (await call_rpc(conn, { behaviors: { listAllBehaviors: true } }))?.behaviors
      ?.listAllBehaviors?.behaviors ?? [];
  const out: BehaviorInfo[] = [];
  for (const behaviorId of ids) {
    const dets = (
      await call_rpc(conn, { behaviors: { getBehaviorDetails: { behaviorId } } })
    )?.behaviors?.getBehaviorDetails;
    if (dets) {
      out.push({
        id: dets.id ?? behaviorId,
        displayName: dets.displayName ?? "",
        metadata: dets.metadata ?? [],
      });
    }
  }
  return out;
}

/** id -> display name. */
export function idToName(table: BehaviorInfo[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of table) {
    if (b.displayName) {
      out[String(b.id)] = b.displayName;
    }
  }
  return out;
}

/**
 * display name -> id. Names are expected to be unique per keyboard; if they
 * aren't, the lowest id wins and the name is listed in `duplicates` so the
 * caller can warn.
 */
export function nameToId(table: BehaviorInfo[]): {
  map: Map<string, number>;
  duplicates: string[];
} {
  const map = new Map<string, number>();
  const duplicates: string[] = [];
  for (const b of table) {
    if (!b.displayName) continue;
    const prev = map.get(b.displayName);
    if (prev === undefined) {
      map.set(b.displayName, b.id);
    } else {
      if (!duplicates.includes(b.displayName)) duplicates.push(b.displayName);
      map.set(b.displayName, Math.min(prev, b.id));
    }
  }
  return { map, duplicates };
}

/**
 * Does this behavior take parameters at all? Used as a cheap sanity check that a
 * name table was captured on the keyboard the backup actually came from: a
 * binding carrying a keycode can't belong to a behavior with no parameters.
 */
export function takesParams(b: BehaviorInfo): boolean {
  return (b.metadata ?? []).some(
    (set: any) =>
      (set?.param1?.length ?? 0) > 0 || (set?.param2?.length ?? 0) > 0
  );
}
