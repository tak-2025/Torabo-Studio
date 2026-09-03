import { useCallback, useContext, useState } from "react";
import { Download, Upload, FileCode, Tags } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { StatusBadge, PanelStatus } from "../misc/PanelActionBar";
import { useT } from "../i18n";
import { useToraboCaps } from "../caps/useToraboCaps";

import { BACKUP_FILTERS, openBackupFile, saveTextFile } from "../backends";
import { collectBackup, buildKeymapDts } from "./exportBackup";
import { restoreBackup } from "./restoreBackup";
import { annotateBackup } from "./annotateBackup";
import { validateBackup } from "./backupFormat";


type Status = PanelStatus;

/**
 * Turn a device name into a filesystem-safe slug for the export file name.
 * Strips control chars and Windows-reserved characters, collapses runs of
 * whitespace to a single hyphen, and caps the length. Returns "" (caller
 * falls back to the name-less file name) when nothing usable is left.
 */
function slugifyDeviceName(name: string): string {
  return name
    // eslint-disable-next-line no-control-regex -- deliberately stripping control chars for a safe file name
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

export function BackupPanel() {
  const t = useT();
  const { conn } = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const { caps } = useToraboCaps();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const busy = status.kind === "busy";

  const onExport = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    setStatus({ kind: "busy", msg: t("bk.busy.export") });
    try {
      const { file, parts } = await collectBackup({
        conn,
        caps,
        onProgress: (msg) => setStatus({ kind: "busy", msg }),
      });
      const stamp = file.exportedAt.replace(/[:T]/g, "-").slice(0, 19);
      const slug = file.device?.name ? slugifyDeviceName(file.device.name) : "";
      const fileName = slug
        ? `torabo-backup-${slug}-${stamp}.json`
        : `torabo-backup-${stamp}.json`;
      const saved = await saveTextFile(
        fileName,
        JSON.stringify(file, null, 2),
        BACKUP_FILTERS
      );
      if (!saved) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({
        kind: "ok",
        msg: t("bk.ok.saved", {
          parts: parts.join(" + "),
          label: saved.label,
        }),
      });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, caps, t]);

  const onExportKeymap = useCallback(async () => {
    if (!conn) {
      setStatus({ kind: "error", msg: t("status.notConnected") });
      return;
    }
    setStatus({ kind: "busy", msg: t("bk.busy.genKeymap") });
    try {
      const { text, layerCount } = await buildKeymapDts(conn);
      const saved = await saveTextFile("keymap.keymap", text, BACKUP_FILTERS);
      if (!saved) {
        setStatus({ kind: "idle" });
        return;
      }

      const fixmes = (text.match(/FIXME/g) || []).length;
      const warn = fixmes ? t("bk.keymapFixmes", { n: fixmes }) : "";
      setStatus({
        kind: fixmes ? "error" : "ok",
        msg: t("bk.ok.keymapSaved", {
          n: layerCount,
          warn,
          label: saved.label,
        }),
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
      setStatus({ kind: "busy", msg: t("bk.busy.behaviorNames") });

      const done = await annotateBackup({
        conn,
        file,
        confirmMismatch: (why) =>
          window.confirm(t("bk.confirm.annotate", { why })),
      });
      if (!done) {
        setStatus({ kind: "idle" });
        return;
      }

      // picked.name is already the bare file name on every backend.
      const base = picked.name.replace(/\.json$/i, "");
      const saved = await saveTextFile(
        `${base}-named.json`,
        JSON.stringify(done.out, null, 2),
        BACKUP_FILTERS
      );
      if (!saved) {
        setStatus({ kind: "idle" });
        return;
      }

      setStatus({
        kind: done.missed.length ? "error" : "ok",
        msg:
          t("bk.ok.annotated", {
            n: Object.keys(done.names).length,
            label: saved.label,
          }) +
          (done.missed.length
            ? "\n" + t("bk.annotate.unnamedIds", { ids: done.missed.join(", ") })
            : "") +
          "\n" +
          t("bk.annotate.next"),
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

      const ok = window.confirm(t("bk.confirm.import"));
      if (!ok) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "busy", msg: t("bk.busy.import") });

      const { restored, skipped, attention } = await restoreBackup({
        conn,
        caps,
        lockState,
        file,
        onProgress: (msg) => setStatus({ kind: "busy", msg }),
      });

      // Red only when something the user asked for didn't land; a partial
      // restore (e.g. old file without trackpad data) stays green with notes.
      const head = restored.length
        ? t("bk.ok.restored", { parts: restored.join(" / ") })
        : t("bk.err.nothingRestored");
      const tail = skipped.length
        ? "\n" + t("bk.skipList", { items: skipped.join(" / ") })
        : "";
      setStatus({
        kind: attention || !restored.length ? "error" : "ok",
        msg: head + tail,
      });
    } catch (e) {
      setStatus({ kind: "error", msg: t("status.error") + String(e) });
    }
  }, [conn, lockState, caps, t]);

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
        <h2 className="text-fluid-xl font-bold">{t("bk.title")}</h2>
        <p className="text-sm text-base-content/70">{t("bk.intro")}</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap sticky top-0 z-10 bg-base-100 py-2 border-b border-base-300">
        <button
          type="button"
          className="btn btn-primary gap-2"
          onClick={onExport}
          disabled={busy}
        >
          <Download size={18} />
          <span>{t("bk.btn.export")}</span>
          <span className="opacity-70 text-xs font-normal">
            {t("bk.btn.exportSub")}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-outline gap-2"
          onClick={onExportKeymap}
          disabled={busy}
        >
          <FileCode size={18} />
          <span>{t("bk.btn.exportKeymap")}</span>
          <span className="opacity-70 text-xs font-normal">
            {t("bk.btn.exportKeymapSub")}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-warning gap-2"
          onClick={onImport}
          disabled={busy}
        >
          <Upload size={18} />
          <span>{t("bk.btn.import")}</span>
          <span className="opacity-80 text-xs font-normal">
            {t("bk.btn.importSub")}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-outline gap-2"
          onClick={onAnnotate}
          disabled={busy}
        >
          <Tags size={18} />
          <span>{t("bk.btn.annotate")}</span>
          <span className="opacity-70 text-xs font-normal">
            {t("bk.btn.annotateSub")}
          </span>
        </button>
        <StatusBadge status={status} />
      </div>

      <details className="rounded-md border border-base-300 bg-base-200/60 px-4 py-3 text-xs leading-relaxed self-start">
        <summary className="cursor-pointer font-bold text-sm select-none">
          {t("help.notesSummary")}
        </summary>
        <ul className="text-base-content/60 list-disc pl-5 leading-relaxed mt-2">
          <li>{t("bk.note.central")}</li>
          <li>
            {t("bk.note.unlockPre")}
            <b>{t("bk.note.unlockBold")}</b>
            {t("bk.note.unlockPost")}
          </li>
          <li>
            {t("bk.note.partialPre")}
            <b>{t("bk.note.partialBold")}</b>
            {t("bk.note.partialPost")}
          </li>
          <li>
            {t("bk.note.independentPre")}
            <b>{t("bk.note.independentBold")}</b>
            {t("bk.note.independentPost")}
          </li>
          <li>
            {t("bk.note.featureGatedPre")}
            <b>{t("bk.note.featureGatedBold")}</b>
            {t("bk.note.featureGatedPost")}
          </li>
          <li>
            {t("bk.note.idsPre")}
            <b>{t("bk.note.idsBold1")}</b>
            {t("bk.note.idsMid")}
            <code>&amp;kp</code>
            {t("bk.note.idsMid2")}
            <b>{t("bk.note.idsBold2")}</b>
            {t("bk.note.idsPost")}
          </li>
          <li>
            <b>{t("bk.note.oldBold1")}</b>
            {t("bk.note.oldMid")}
            <b>{t("bk.note.oldBold2")}</b>
            {t("bk.note.oldPost")}
          </li>
          <li>
            {t("bk.note.dtsPre")}
            <b>{t("bk.note.dtsBold")}</b>
            {t("bk.note.dtsMid")}
            <code>EQUAL</code>/<code>LC(SPACE)</code>
            {t("bk.note.dtsMid2")}
            <code>/* hint */</code>
            {t("bk.note.dtsMid3")}
            <b>{t("bk.note.dtsBold2")}</b>
            {t("bk.note.dtsPost")}
          </li>
        </ul>
      </details>
    </div>
  );
}

export default BackupPanel;
