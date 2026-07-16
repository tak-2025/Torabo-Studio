import { ReactNode } from "react";
import { Download, Save } from "lucide-react";

import { useT } from "../i18n";

/** Shared status shape used by every settings panel's Read/Write flow. */
export type PanelStatus =
  | { kind: "idle" }
  | { kind: "busy"; msg: string }
  | { kind: "ok"; msg: string }
  | { kind: "error"; msg: string };

/** Renders `status.msg` with the color coding (error=red, ok=green) shared by
 * every panel. Renders nothing while idle. */
export function StatusBadge({ status }: { status: PanelStatus }) {
  if (status.kind === "idle") return null;
  return (
    <span
      className={
        "whitespace-pre-wrap " +
        (status.kind === "error"
          ? "text-error text-sm font-medium"
          : status.kind === "ok"
          ? "text-success text-sm font-medium"
          : "text-sm")
      }
    >
      {status.msg}
    </span>
  );
}

export interface PanelActionBarProps {
  /** "① 読み込む" button handler — always shown. */
  onRead: () => void;
  /** "③ 書き込む" button handler. Omit to hide the button entirely (panels
   * that save per-row/per-slot instead of a single top-level write, e.g.
   * Macros/Combos, don't pass this). */
  onWrite?: () => void;
  /** Disables the write button (e.g. no config loaded yet, or busy). */
  writeDisabled?: boolean;
  /** Override the read button's main label. Defaults to the numbered
   * "① 読み込む" — pass `t("actionBar.readPlain")` for panels whose flow has
   * no corresponding "③" write step. */
  readLabel?: string;
  readSubLabel?: string;
  writeLabel?: string;
  writeSubLabel?: string;
  status: PanelStatus;
  /** Extra buttons rendered between Read and Write (e.g. Macros' "keymap から
   * 取り込み" / "取り込んだN件を保存" buttons). */
  children?: ReactNode;
}

/**
 * The "① 読み込む(Read) / ③ 書き込む(Apply+Save) / status message" sticky bar
 * shared by the Trackball / Trackpad / Trackpad v2 / Macros / Combos panels.
 * Purely presentational — callers own all state and RPC logic.
 */
export function PanelActionBar({
  onRead,
  onWrite,
  writeDisabled,
  readLabel,
  readSubLabel,
  writeLabel,
  writeSubLabel,
  status,
  children,
}: PanelActionBarProps) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 flex-wrap sticky top-0 z-10 bg-base-100 py-2 border-b border-base-300">
      <button type="button" className="btn btn-primary gap-2" onClick={onRead}>
        <Download size={18} />
        <span>{readLabel ?? t("actionBar.read")}</span>
        <span className="opacity-70 text-xs font-normal">
          {readSubLabel ?? t("actionBar.readSub")}
        </span>
      </button>
      {children}
      {onWrite && (
        <button
          type="button"
          className="btn btn-success gap-2"
          onClick={onWrite}
          disabled={writeDisabled}
        >
          <Save size={18} />
          <span>{writeLabel ?? t("actionBar.write")}</span>
          <span className="opacity-80 text-xs font-normal">
            {writeSubLabel ?? t("actionBar.writeSub")}
          </span>
        </button>
      )}
      <StatusBadge status={status} />
    </div>
  );
}

export default PanelActionBar;
