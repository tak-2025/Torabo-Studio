// The read/write status machine every settings panel runs.
//
// Each panel used to carry its own copy of the same three transitions — busy
// while the call is in flight, ok with a message, error with whatever was
// thrown — around a try/catch that differed only in the strings it passed. The
// copies had drifted in the small ways copies always do: some panels prefixed
// the thrown text with "エラー: " and some showed the raw exception, and only
// some dropped the loaded config when a read failed, leaving a stale table on
// screen that the user could still edit.
//
// So the transitions and the wording live here, and the panel supplies only the
// part that is actually its own: what to do. `read` and `write` are named after
// the two buttons in PanelActionBar rather than being one generic runner,
// because those are the only two flows that exist and they differ (a failed
// read invalidates the panel's config, a failed write does not).
//
// The RPC calls, the codecs and the config state stay in the panel — this owns
// nothing but the status.

import { useCallback, useRef, useState } from "react";

import { useT } from "../i18n";
import type { PanelStatus } from "./PanelActionBar";

export interface PanelStatusOptions {
  /**
   * Called when a `read` throws, before the status flips to error. Panels pass
   * `() => setCfg(null)` so a failed read never leaves the previous keyboard's
   * values on screen.
   */
  onReadFailed?: () => void;
}

export interface PanelStatusApi {
  /** Pass straight to `<PanelActionBar status=...>`. */
  status: PanelStatus;
  /** Run the panel's "① 読み込む" action: 読み込み中… -> 読み込みました。 */
  read: (action: () => Promise<void>) => Promise<void>;
  /** Run the panel's "③ 書き込む" action: 保存中… -> 書き込みました。 */
  write: (action: () => Promise<void>) => Promise<void>;
  /**
   * Escape hatch for panels whose progress doesn't fit the read/write mold —
   * e.g. per-slot progress in Macros/Combos, where each slot write gets its
   * own busy/ok/error message outside the shared `run` machinery above.
   */
  setStatus: (status: PanelStatus) => void;
}

export function usePanelStatus(opts: PanelStatusOptions = {}): PanelStatusApi {
  const t = useT();
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle" });

  // Held in a ref so `read` stays stable across renders even though callers
  // pass a fresh options object every time.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Guards against a second read/write starting while one is already in
  // flight. Held in a ref rather than derived from `status` because `status`
  // is stale inside the closure for the lifetime of the call.
  const runningRef = useRef(false);

  const run = useCallback(
    async (busy: string, ok: string, action: () => Promise<void>, onFail?: () => void) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setStatus({ kind: "busy", msg: busy });
      try {
        await action();
        setStatus({ kind: "ok", msg: ok });
      } catch (e) {
        onFail?.();
        setStatus({ kind: "error", msg: t("status.error") + String(e) });
      } finally {
        runningRef.current = false;
      }
    },
    [t]
  );

  const read = useCallback(
    (action: () => Promise<void>) =>
      run(t("status.reading"), t("status.loaded"), action, () =>
        optsRef.current.onReadFailed?.()
      ),
    [run, t]
  );

  const write = useCallback(
    (action: () => Promise<void>) => run(t("status.saving"), t("status.applied"), action),
    [run, t]
  );

  return { status, read, write, setStatus };
}
