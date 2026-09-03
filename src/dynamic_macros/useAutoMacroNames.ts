/**
 * Read the macro slot names automatically once a connection is up AND the
 * capability descriptor says this firmware has them — so `&dmac N` keycaps on
 * the keymap board show their names without the user first opening the マクロ
 * tab and pressing 読み込む (MacrosPanel.onRead did, and still does, exactly
 * this same read for a manual re-read; see its header comment for why a
 * later manual read is fine to just overwrite what this hook published).
 *
 * WHY THIS ISN'T INSIDE MacroNamesContext.tsx. That context is deliberately a
 * dumb value box (see its own header comment) — a second `useToraboCaps()`
 * call in there would re-run the capability read a second time in parallel
 * with MainPanels' own, doubling a GATT service lookup that already has to
 * wait its turn behind the keymap load. Instead this hook takes `caps` as an
 * argument, so its ONE call site (MainPanels.tsx, which already holds `caps`
 * from its own useToraboCaps()) is the only place asking.
 *
 * ORDERING. `caps` is null until useToraboCaps's own read resolves (which
 * itself waits for RPC idle before asking — see its header comment), so this
 * effect cannot fire before that read has settled. It then waits for RPC idle
 * AGAIN before its own dmac read, for the same reason useToraboCaps does: the
 * keymap/behavior load (Keyboard.tsx) can still be running well after caps
 * resolves, and jumping the GATT queue ahead of it would delay a read the user
 * is actively waiting on. Reported into SyncStatusContext (rpc/syncStatus.ts's
 * "macroNames" step) for exactly the span this hook is actually reading, so
 * the header's status line can say so.
 *
 * v1 firmware (hasMacroNames(caps) false): this hook does nothing at all — no
 * read, no context write — which is the same "byte-for-byte the panel it has
 * always been" promise MacrosPanel.tsx makes for the manual read.
 */
import { useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { waitForRpcIdle } from "../rpc/logging";
import { useSyncStep } from "../rpc/SyncStatusContext";
import { dmacReadAll } from "../backends";
import { ToraboCaps, hasMacroNames } from "../caps/toraboCaps";
import { decodeDmac } from "./dmacConfig";
import { useSetMacroNames } from "./MacroNamesContext";

/**
 * Pure gate, split out so "no read on v1 / no connection" is testable without
 * mounting a React tree (repo convention: pure-logic tests, no
 * jsdom/component tests — see useAutoMacroNames.test.ts).
 */
export function shouldAutoReadMacroNames(
  hasConn: boolean,
  caps: ToraboCaps | null
): boolean {
  return hasConn && hasMacroNames(caps);
}

export function useAutoMacroNames(caps: ToraboCaps | null): void {
  const { conn } = useContext(ConnectionContext);
  const setMacroNames = useSetMacroNames();
  const [reading, setReading] = useState(false);
  useSyncStep(reading, "macroNames");

  useEffect(() => {
    if (!shouldAutoReadMacroNames(!!conn, caps)) {
      setReading(false);
      return;
    }
    let cancelled = false;
    setReading(true);
    (async () => {
      try {
        // Same courtesy useToraboCaps pays its own read: stay off the GATT
        // queue until nothing else is mid-exchange.
        await waitForRpcIdle();
        if (cancelled) return;
        const next = decodeDmac(await dmacReadAll());
        if (cancelled) return;
        // Mirrors MacrosPanel.onRead's own publish: a v1-shaped decode (no
        // name block) is null, not a row of blanks, so the board falls back
        // to M<N> rather than labelling every macro key with nothing. Not
        // expected here — the gate above already checked hasMacroNames — but
        // decodeDmac is the single source of truth for what the blob actually
        // contained, so this defers to it rather than assuming.
        setMacroNames(next.hasNames ? next.slots.map((s) => s.name) : null);
      } catch (e) {
        // An optional step: failing here must not touch the keymap board's
        // fallback (M<N> stays exactly as it was) and must not block the
        // keymap/caps flow this hook has no part in. If the user later opens
        // the マクロ tab, its own onRead gets another try and reports its own
        // error there instead.
        console.info("auto macro-name read unavailable:", e);
      } finally {
        if (!cancelled) setReading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `conn` (object identity) rather than a boolean: a reconnect to a
    // DIFFERENT keyboard must re-run this even if `caps` happens to decode to
    // an equal-looking value, same as useToraboCaps keys its own effect on
    // `conn`.
  }, [conn, caps, setMacroNames]);
}
