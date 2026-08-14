import { useCallback, useContext, useState } from "react";
import { Download, Upload, FileCode, Tags } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { SetLayerBindingResponse } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { call_rpc } from "../rpc/logging";
import { StatusBadge, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";

import {
  trackballReadConfig,
  trackballWriteConfig,
  trackpadReadConfig,
  trackpadWriteConfig,
  dmacReadAll,
  dmacWriteSlot,
  comboReadAll,
  comboWriteSlot,
} from "../backends";
import {
  decodeDmac,
  encodeSlot as encodeMacroSlot,
  DM_SLOTS,
} from "../dynamic_macros/dmacConfig";
import {
  decodeCombos,
  encodeSlot as encodeComboSlot,
  CB_SLOTS,
} from "../dynamic_combos/comboConfig";
import {
  BACKUP_FILTERS,
  openBackupFile,
  saveTextFile,
} from "../backends";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupBinding,
  BackupFile,
  BackupLayer,
  backupCompatNote,
  base64ToBytes,
  bytesToBase64,
  usedBehaviorIds,
  validateBackup,
} from "./backupFormat";
import {
  generateKeymapDts,
  BehaviorById,
  ExportLayer,
} from "./keymapExport";
import {
  BehaviorInfo,
  idToName,
  nameToId,
  readBehaviorTable,
  takesParams,
} from "./behaviorTable";

type Status = PanelStatus;

/** Short human text for whatever a failed restore step threw. */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Why the keyboard rejected a setLayerBinding, in the order of the RPC enum. */
const FAIL_LABEL: Record<string, string> = {
  "1": "キー位置/レイヤーが無効",
  "2": "このFWに無いビヘイビアID",
  "3": "パラメータが無効（IDのズレでビヘイビアが別物になっている可能性）",
  other: "RPCエラー/応答なし",
};

interface KeymapRestore {
  /** Bindings actually written. */
  changed: number;
  /** Writes the keyboard rejected. */
  failed: number;
  /** failed, broken down by RPC response code (see FAIL_LABEL). */
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
    throw new Error("現在のキーマップを取得できませんでした。");
  }

  // This keyboard's behaviors: ids to check against, names to translate through.
  onProgress("ビヘイビア表を読み込み中…");
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
    onProgress(`キーマップを復元中… レイヤー ${li + 1}/${cur.layers.length}`);

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

export function BackupPanel() {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const busy = status.kind === "busy";

  const onExport = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    setStatus({ kind: "busy", msg: "エクスポート中…" });
    try {
      // --- trackball (optional; service may be absent) ---
      let trackball: BackupFile["trackball"] = null;
      try {
        const wire = await trackballReadConfig();
        trackball = { wireBase64: bytesToBase64(wire) };
      } catch (e) {
        console.warn("trackball read skipped:", e);
      }

      // --- macros (optional; service absent if FW built without it) ---
      let macros: BackupFile["macros"] = null;
      try {
        macros = { wireBase64: bytesToBase64(await dmacReadAll()) };
      } catch (e) {
        console.warn("macros read skipped:", e);
      }

      // --- combos (optional; service absent if FW built without it) ---
      let combos: BackupFile["combos"] = null;
      try {
        combos = { wireBase64: bytesToBase64(await comboReadAll()) };
      } catch (e) {
        console.warn("combos read skipped:", e);
      }

      // --- trackpad (optional; service absent if FW built without it) ---
      let trackpad: BackupFile["trackpad"] = null;
      try {
        trackpad = { wireBase64: bytesToBase64(await trackpadReadConfig()) };
      } catch (e) {
        console.warn("trackpad read skipped:", e);
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
        setStatus({ kind: "busy", msg: "ビヘイビア名を取得中…" });
        try {
          behaviors = idToName(await readBehaviorTable(conn));
        } catch (e) {
          console.warn("behavior table read failed:", e);
        }
      }

      if (!trackball && !keymap && !macros && !combos && !trackpad) {
        throw new Error("取得できる設定がありませんでした。");
      }

      const file: BackupFile = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        trackball,
        keymap,
        macros,
        combos,
        trackpad,
        behaviors,
      };
      const stamp = file.exportedAt.replace(/[:T]/g, "-").slice(0, 19);
      const saved = await saveTextFile(
        `torabo-backup-${stamp}.json`,
        JSON.stringify(file, null, 2),
        BACKUP_FILTERS
      );
      if (!saved) {
        setStatus({ kind: "idle" });
        return;
      }
      const parts = [
        trackball ? "トラックボール設定" : null,
        trackpad ? "トラックパッド設定" : null,
        keymap
          ? `キーマップ ${keymap.layers.length} レイヤー${
              behaviors ? "（ビヘイビア名付き）" : "（名前表なし: 他機に復元不可）"
            }`
          : null,
        macros ? "マクロ" : null,
        combos ? "コンボ" : null,
      ].filter(Boolean);
      setStatus({
        kind: "ok",
        msg: `保存しました（${parts.join(" + ")}）: ${saved.label}`,
      });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, t]);

  const onExportKeymap = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    setStatus({ kind: "busy", msg: "keymap.keymap を生成中…" });
    try {
      const km = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap
        ?.getKeymap;
      if (!km?.layers?.length) {
        throw new Error("キーマップを取得できませんでした。");
      }

      // Resolve every behavior so each binding gets the right label + arity.
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

      const text = generateKeymapDts(layers, behaviors);
      const saved = await saveTextFile("keymap.keymap", text, BACKUP_FILTERS);
      if (!saved) {
        setStatus({ kind: "idle" });
        return;
      }

      const fixmes = (text.match(/FIXME/g) || []).length;
      const warn = fixmes ? `（要確認 FIXME ${fixmes}件）` : "";
      setStatus({
        kind: fixmes ? "error" : "ok",
        msg: `keymap.keymap を保存しました（${layers.length} レイヤー）${warn}: ${saved.label}`,
      });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, t]);

  /**
   * Add the id -> behavior-name table to an older backup, using the currently
   * connected keyboard's numbering. Must be run against the keyboard the file
   * was taken from; the parameter shapes in the file are checked against this
   * keyboard's metadata and a mismatch is reported loudly.
   */
  const onAnnotate = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    try {
      const picked = await openBackupFile();
      if (!picked) return;
      const file = validateBackup(JSON.parse(picked.text));
      if (!file.keymap?.layers?.length) {
        throw new Error("このファイルにはキーマップが入っていません。");
      }
      setStatus({ kind: "busy", msg: "ビヘイビア名を取得中…" });

      const table = await readBehaviorTable(conn);
      if (!table.length) {
        throw new Error("キーボードからビヘイビア一覧を取得できませんでした。");
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
          missing.length ? `このキーボードに無いID: ${missing.join(", ")}` : null,
          mismatched.length
            ? `パラメータを取らないはずのIDに値が入っている: ${mismatched.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" / ");
        const go = window.confirm(
          `このバックアップは、今つないでいるキーボードのものではない可能性があります。\n${why}\n\nそれでも今のキーボードの名前表で付与しますか？`
        );
        if (!go) {
          setStatus({ kind: "idle" });
          return;
        }
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
      // picked.name is already the bare file name on every backend.
      const base = picked.name.replace(/\.json$/i, "");
      const saved = await saveTextFile(
        `${base}-named.json`,
        JSON.stringify(out, null, 2),
        BACKUP_FILTERS
      );
      if (!saved) {
        setStatus({ kind: "idle" });
        return;
      }

      const missed = used.filter((id) => !names[String(id)]);
      setStatus({
        kind: missed.length ? "error" : "ok",
        msg:
          `ビヘイビア名を付与して保存しました（${Object.keys(names).length} 個のID）: ${saved.label}` +
          (missed.length ? `\n名前を取れなかったID: ${missed.join(", ")}` : "") +
          "\nこのファイルを、復元したいキーボードで「インポート」してください。",
      });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, t]);

  const onImport = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    try {
      const picked = await openBackupFile();
      if (!picked) return;
      const file = validateBackup(JSON.parse(picked.text));

      const ok = window.confirm(
        "現在のキーボード設定を、このバックアップで上書きします。よろしいですか？"
      );
      if (!ok) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "busy", msg: "インポート中…" });

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
          skipped.push(`${label}（${errText(e)}）`);
        }
      };

      // Custom-GATT configs first (no Studio unlock needed). Each write applies
      // live + NVS on the keyboard. Macros/combos are written one slot at a time.

      // 1) trackball
      await section("トラックボール設定", async () => {
        if (!file.trackball?.wireBase64) return null;
        await trackballWriteConfig(base64ToBytes(file.trackball.wireBase64));
        return "トラックボール設定";
      });

      // 1b) trackpad (v3+; absent in older backups → skipped)
      await section("トラックパッド設定", async () => {
        if (!file.trackpad?.wireBase64) return null;
        await trackpadWriteConfig(base64ToBytes(file.trackpad.wireBase64));
        return "トラックパッド設定";
      });

      // 2) macros (per-slot write; restores every slot incl. cleared ones)
      await section("マクロ", async () => {
        if (!file.macros?.wireBase64) return null;
        setStatus({ kind: "busy", msg: "マクロを復元中…" });
        const mc = decodeDmac(base64ToBytes(file.macros.wireBase64));
        for (let i = 0; i < DM_SLOTS; i++) {
          await dmacWriteSlot(encodeMacroSlot(i, mc.slots[i]?.steps ?? []));
        }
        return `マクロ ${DM_SLOTS} スロット`;
      });

      // 3) combos (per-slot write)
      await section("コンボ", async () => {
        if (!file.combos?.wireBase64) return null;
        setStatus({ kind: "busy", msg: "コンボを復元中…" });
        const cc = decodeCombos(base64ToBytes(file.combos.wireBase64));
        for (let i = 0; i < CB_SLOTS; i++) {
          await comboWriteSlot(encodeComboSlot(i, cc.slots[i]));
        }
        return `コンボ ${CB_SLOTS} 枠`;
      });

      // 4) keymap (requires Studio unlock)
      let km: KeymapRestore | null = null;
      try {
        if (!file.keymap?.layers?.length) {
          throw new Error("バックアップに含まれていません");
        }
        if (lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
          throw new Error(
            "Studio のロック解除が必要です。キーボードで解除してから再実行してください"
          );
        }
        setStatus({ kind: "busy", msg: "キーマップを復元中…" });
        km = await restoreKeymap(conn, file.keymap.layers, file.behaviors, (msg) =>
          setStatus({ kind: "busy", msg })
        );
        const bits = [`キー ${km.changed} 個更新`];
        if (km.failed) bits.push(`失敗 ${km.failed}`);
        if (km.remapped) bits.push(`ID読み替え ${km.remapped} 個`);
        if (km.unsupported) {
          bits.push(`このFWに無いビヘイビア ${km.unsupported} 個スキップ`);
        }
        restored.push(
          `キーマップ ${km.layersSynced}/${km.layersOnKeyboard} レイヤー（${bits.join(
            " / "
          )}）`
        );

        // Behavior ids are per-keyboard. Without a name table the raw ids are
        // written as-is, which only lands correctly on the source unit.
        if (!km.hasNameTable) {
          skipped.push(
            "このファイルにはビヘイビア名表がありません（v3以前）。別のキーボードのファイルなら「ビヘイビア名を付与」を元のキーボードで実行してから読み込んでください"
          );
        }
        if (km.unmappedNames.length) {
          skipped.push(
            `このキーボードに無いビヘイビア: ${km.unmappedNames.join(", ")}`
          );
        }
        if (km.duplicateNames.length) {
          skipped.push(
            `同名ビヘイビアが複数あり読み替えが曖昧: ${km.duplicateNames.join(", ")}`
          );
        }

        // A failure count alone can't be acted on — say what the keyboard
        // actually answered, and whether we could read its behavior list.
        if (km.failed && km.selfTest !== SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) {
          skipped.push(
            `自己診断NG: キーボード自身の現在のバインディングを書き戻しても拒否されました（応答 ${km.selfTest}）。バックアップの中身ではなくキーボード側の問題です`
          );
        } else if (km.failed) {
          skipped.push(
            "自己診断OK: 同じ位置に現在値を書き戻すのは通ります（拒否されたのはファイル側の値）"
          );
        }
        for (const [code, n] of Object.entries(km.failByCode)) {
          skipped.push(`失敗内訳 ${FAIL_LABEL[code] ?? `コード ${code}`}: ${n} 件`);
        }
        if (km.abortedEarly) {
          skipped.push(
            `最初の ${FAIL_FAST_AFTER} 件が全て拒否されたため中断しました（キーボードは無変更）`
          );
        }
        if (km.failed && km.behaviorListSize === null) {
          skipped.push("FW のビヘイビア一覧が読めませんでした（事前チェック無しで書き込み）");
        }

        // Layer/key count differences are informational — the sync went ahead.
        if (km.layersInFile !== km.layersOnKeyboard) {
          skipped.push(
            `レイヤー数が違います（ファイル ${km.layersInFile} / キーボード ${km.layersOnKeyboard}）。キーボードにあるレイヤーだけ同期しました`
          );
        }
        if (km.keysUnwritten) {
          skipped.push(`ファイル側の余分なキー位置 ${km.keysUnwritten} 個`);
        }
        if (km.keysUntouched) {
          skipped.push(
            `ファイルに無いキー位置 ${km.keysUntouched} 個（現状のまま）`
          );
        }
      } catch (e) {
        console.warn("restore skipped (keymap):", e);
        skipped.push(`キーマップ（${errText(e)}）`);
      }

      // Red only when something the user asked for didn't land; a partial
      // restore (e.g. old file without trackpad data) stays green with notes.
      const attention = (km?.failed ?? 0) + (km?.unsupported ?? 0);
      const head = restored.length
        ? `復元しました（${restored.join(" / ")}）。`
        : "復元できる項目がありませんでした。";
      const tail = skipped.length ? `\nスキップ: ${skipped.join(" / ")}` : "";
      setStatus({
        kind: attention || !restored.length ? "error" : "ok",
        msg: head + tail,
      });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, lockState, t]);

  if (!conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.backup")} {t("preconnect.howto")}
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-fluid-xl font-bold">バックアップ（設定の保存・復元）</h2>
        <p className="text-sm text-base-content/70">
          トラックボール設定・トラックパッド設定・マクロ・コンボ・キーマップを1つのファイル（.json）に保存／復元します。
          ZMK での編集で設定が崩れても、ここから元に戻せます。
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap sticky top-0 z-10 bg-base-100 py-2 border-b border-base-300">
        <button
          type="button"
          className="btn btn-primary gap-2"
          onClick={onExport}
          disabled={busy}
        >
          <Download size={18} />
          <span>エクスポート</span>
          <span className="opacity-70 text-xs font-normal">ファイルに保存</span>
        </button>
        <button
          type="button"
          className="btn btn-outline gap-2"
          onClick={onExportKeymap}
          disabled={busy}
        >
          <FileCode size={18} />
          <span>keymap.keymap を保存</span>
          <span className="opacity-70 text-xs font-normal">ZMK ソース出力</span>
        </button>
        <button
          type="button"
          className="btn btn-warning gap-2"
          onClick={onImport}
          disabled={busy}
        >
          <Upload size={18} />
          <span>インポート</span>
          <span className="opacity-80 text-xs font-normal">ファイルから復元</span>
        </button>
        <button
          type="button"
          className="btn btn-outline gap-2"
          onClick={onAnnotate}
          disabled={busy}
        >
          <Tags size={18} />
          <span>ビヘイビア名を付与</span>
          <span className="opacity-70 text-xs font-normal">旧ファイルを他機に移す準備</span>
        </button>
        <StatusBadge status={status} />
      </div>

      <details className="rounded-md border border-base-300 bg-base-200/60 px-4 py-3 text-xs leading-relaxed self-start">
        <summary className="cursor-pointer font-bold text-sm select-none">
          {t("help.notesSummary")}
        </summary>
        <ul className="text-base-content/60 list-disc pl-5 leading-relaxed mt-2">
          <li>
            設定は全て「右（central）」に保存されます。左は素 FW を焼けば復活するので、このファイルだけで完全バックアップです。
          </li>
          <li>
            キーマップの復元は <b>Studio のロック解除</b>が必要です（キーボード側で解除）。トラックボール設定だけならロック不要。
          </li>
          <li>
            復元はキー位置単位で書き戻します。<b>レイヤー数やキー数が違っても中断しません</b>
            — 今のキーボードにあるレイヤーだけを先頭から順に同期し、はみ出した分はスキップします（スキップ内容は結果に表示）。
          </li>
          <li>
            トラックボール／トラックパッド／マクロ／コンボ／キーマップは<b>それぞれ独立して復元</b>します。古いファームのバックアップでどれかが読めなくても、残りはそのまま復元されます。
          </li>
          <li>
            ZMK はビヘイビアの番号（behaviorId）を<b>キーボード個体ごとに採番</b>します（同じ <code>&amp;kp</code> が別の個体では別番号）。そのためエクスポートには<b>番号↔ビヘイビア名の対応表</b>を一緒に保存し、インポート時に今のキーボードの番号へ読み替えます。
          </li>
          <li>
            <b>v3 以前の古いファイルには対応表がありません。</b>別のキーボードへ移したい場合は、
            <b>そのファイルを取った側のキーボードに接続して</b>「ビヘイビア名を付与」を実行し、出力されたファイルを移したいキーボードでインポートしてください。同じ個体に戻すだけなら付与は不要です。
          </li>
          <li>
            「keymap.keymap を保存」は<b>有効レイヤーのみ</b>を ZMK ソースとして出力します（キーコードは
            <code>EQUAL</code>/<code>LC(SPACE)</code> 等の名前、未知値は数値＋<code>/* hint */</code>）。マクロ・combos・
            予約レイヤーは含まれないので、既存の keymap.keymap にマージし<b>/* FIXME */</b>を確認してから使ってください。
          </li>
        </ul>
      </details>
    </div>
  );
}

export default BackupPanel;
