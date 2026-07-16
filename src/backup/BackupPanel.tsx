import { useCallback, useContext, useState } from "react";
import { Download, Upload, FileCode } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { SetLayerBindingResponse } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { call_rpc } from "../rpc/logging";
import { StatusBadge, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";

import { trackballReadConfig, trackballWriteConfig } from "../tauri/trackball";
import { trackpadReadConfig, trackpadWriteConfig } from "../tauri/trackpad";
import { dmacReadAll, dmacWriteSlot } from "../tauri/dmac";
import { comboReadAll, comboWriteSlot } from "../tauri/combo";
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
  pickOpenPath,
  pickSavePath,
  readTextFile,
  writeTextFile,
} from "../tauri/backup";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupFile,
  base64ToBytes,
  bytesToBase64,
  validateBackup,
} from "./backupFormat";
import {
  generateKeymapDts,
  BehaviorById,
  ExportLayer,
} from "./keymapExport";

type Status = PanelStatus;

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
      };
      const stamp = file.exportedAt.replace(/[:T]/g, "-").slice(0, 19);
      const path = await pickSavePath(`torabo-backup-${stamp}.json`);
      if (!path) {
        setStatus({ kind: "idle" });
        return;
      }
      await writeTextFile(path, JSON.stringify(file, null, 2));
      const parts = [
        trackball ? "トラックボール設定" : null,
        trackpad ? "トラックパッド設定" : null,
        keymap ? `キーマップ ${keymap.layers.length} レイヤー` : null,
        macros ? "マクロ" : null,
        combos ? "コンボ" : null,
      ].filter(Boolean);
      setStatus({ kind: "ok", msg: `保存しました（${parts.join(" + ")}）: ${path}` });
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
      const list =
        (await call_rpc(conn, { behaviors: { listAllBehaviors: true } }))?.behaviors
          ?.listAllBehaviors?.behaviors ?? [];
      for (const behaviorId of list) {
        const dets = (
          await call_rpc(conn, { behaviors: { getBehaviorDetails: { behaviorId } } })
        )?.behaviors?.getBehaviorDetails;
        if (dets) {
          behaviors[dets.id] = { displayName: dets.displayName, metadata: dets.metadata };
        }
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
      const path = await pickSavePath("keymap.keymap");
      if (!path) {
        setStatus({ kind: "idle" });
        return;
      }
      await writeTextFile(path, text);

      const fixmes = (text.match(/FIXME/g) || []).length;
      const warn = fixmes ? `（要確認 FIXME ${fixmes}件）` : "";
      setStatus({
        kind: fixmes ? "error" : "ok",
        msg: `keymap.keymap を保存しました（${layers.length} レイヤー）${warn}: ${path}`,
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
      const path = await pickOpenPath();
      if (!path) return;
      const file = validateBackup(JSON.parse(await readTextFile(path)));

      const ok = window.confirm(
        "現在のキーボード設定を、このバックアップで上書きします。よろしいですか？"
      );
      if (!ok) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "busy", msg: "インポート中…" });

      // Custom-GATT configs first (no Studio unlock needed). Each write applies
      // live + NVS on the keyboard. Macros/combos are written one slot at a time.
      const restored: string[] = [];

      // 1) trackball
      if (file.trackball?.wireBase64) {
        await trackballWriteConfig(base64ToBytes(file.trackball.wireBase64));
        restored.push("トラックボール設定");
      }

      // 1b) trackpad (v3+; absent in older backups → skipped)
      if (file.trackpad?.wireBase64) {
        await trackpadWriteConfig(base64ToBytes(file.trackpad.wireBase64));
        restored.push("トラックパッド設定");
      }

      // 2) macros (per-slot write; restores every slot incl. cleared ones)
      if (file.macros?.wireBase64) {
        setStatus({ kind: "busy", msg: "マクロを復元中…" });
        const mc = decodeDmac(base64ToBytes(file.macros.wireBase64));
        for (let i = 0; i < DM_SLOTS; i++) {
          await dmacWriteSlot(encodeMacroSlot(i, mc.slots[i]?.steps ?? []));
        }
        restored.push(`マクロ ${DM_SLOTS} スロット`);
      }

      // 3) combos (per-slot write)
      if (file.combos?.wireBase64) {
        setStatus({ kind: "busy", msg: "コンボを復元中…" });
        const cc = decodeCombos(base64ToBytes(file.combos.wireBase64));
        for (let i = 0; i < CB_SLOTS; i++) {
          await comboWriteSlot(encodeComboSlot(i, cc.slots[i]));
        }
        restored.push(`コンボ ${CB_SLOTS} 枠`);
      }

      // 4) keymap (requires Studio unlock)
      if (file.keymap?.layers?.length) {
        if (lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
          const done = restored.length
            ? `（${restored.join(" / ")} は復元済みです）`
            : "";
          throw new Error(
            "キーマップ復元には Studio のロック解除が必要です。キーボードでロック解除してから再実行してください。" +
              done
          );
        }
        setStatus({ kind: "busy", msg: "キーマップを復元中…" });
        const cur = (await call_rpc(conn, { keymap: { getKeymap: true } }))?.keymap
          ?.getKeymap;
        if (!cur?.layers) {
          throw new Error("現在のキーマップを取得できませんでした。");
        }

        const layerN = Math.min(cur.layers.length, file.keymap.layers.length);
        let changed = 0;
        let failed = 0;
        for (let li = 0; li < layerN; li++) {
          const layerId = cur.layers[li].id;
          const curB = cur.layers[li].bindings ?? [];
          const savB = file.keymap.layers[li].bindings ?? [];
          const posN = Math.min(curB.length, savB.length);
          for (let kp = 0; kp < posN; kp++) {
            const b = savB[kp];
            const c: any = curB[kp] ?? {};
            if (
              c.behaviorId === b.behaviorId &&
              c.param1 === b.param1 &&
              c.param2 === b.param2
            ) {
              continue; // unchanged → skip (less BLE traffic)
            }
            const resp = await call_rpc(conn, {
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
            });
            if (
              resp.keymap?.setLayerBinding ===
              SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
            ) {
              changed++;
            } else {
              failed++;
            }
          }
        }
        await call_rpc(conn, { keymap: { saveChanges: true } });

        const warn =
          cur.layers.length !== file.keymap.layers.length
            ? `（レイヤー数が違うため先頭 ${layerN} レイヤーのみ復元）`
            : "";
        const failMsg = failed ? ` / 失敗 ${failed}` : "";
        restored.push(`キーマップ（キー ${changed} 個更新${failMsg}）`);
        setStatus({
          kind: failed ? "error" : "ok",
          msg: `復元しました（${restored.join(" / ")}）${warn}。`,
        });
      } else {
        setStatus({
          kind: "ok",
          msg: restored.length
            ? `復元しました（${restored.join(" / ")}）。`
            : "復元できる項目がありませんでした。",
        });
      }
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
            復元は<b>同じファーム／同じ物理レイアウト</b>を前提にキー位置単位で書き戻します。レイヤー数が違う場合は先頭から一致分だけ復元します。
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
