import { useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { waitForRpcIdle } from "../rpc/logging";
import { toraboReadCaps } from "../backends";
import { ToraboCaps, decodeCaps } from "./toraboCaps";

export interface ToraboCapsState {
  caps: ToraboCaps | null;
  /**
   * The exact bytes `caps` was decoded from, for the firmware-info tab to show
   * in a bug report.
   *
   * Kept rather than re-encoded from `caps` on demand, because a
   * reconstruction would be a different thing wearing the same name: the
   * decoder deliberately ignores an unknown desc_ver's extra fields and any
   * bytes parked after the feature table (contract rules 2 and 4 in
   * toraboCaps.ts), so re-encoding would drop precisely the bytes a report
   * about new firmware needs. One extra reference to a ~48-byte buffer we
   * already hold is the cheaper honest answer.
   *
   * Non-null exactly when `caps` is: they are set together, so a render never
   * shows one keyboard's bytes beside another's decode.
   */
  raw: Uint8Array | null;
  loading: boolean;
}

/**
 * Read the firmware's self-description once per connection.
 *
 * Returns null while loading AND for firmware that predates the descriptor — the
 * two are deliberately the same to callers, because both mean "we don't know what
 * this keyboard can do", and the safe answer to that is to show everything and let
 * an individual feature's read fail on its own. Hiding a tab because we couldn't
 * ask would be worse than showing one that turns out to be unavailable.
 */
export function useToraboCaps(): ToraboCapsState {
  const { conn } = useContext(ConnectionContext);
  // One state for both, so `caps` and `raw` can never disagree about which
  // keyboard (or which attempt) they came from.
  const [state, setState] = useState<{
    caps: ToraboCaps | null;
    raw: Uint8Array | null;
  }>({ caps: null, raw: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conn) {
      setState({ caps: null, raw: null });
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Don't show the PREVIOUS keyboard's capabilities while we ask.
    setState({ caps: null, raw: null });
    setLoading(true);
    (async () => {
      try {
        // Stay out of the RPC's way, and mean it.
        //
        // A fixed 400 ms delay was not staying out of anything: the initial load
        // (getKeymap, listAllBehaviors, then getBehaviorDetails per behavior) runs
        // for many seconds after connecting, so this landed in the middle of it.
        // Every GATT operation on a device is serialised by the browser, so a
        // service lookup here does not run beside those calls — it takes its turn
        // ahead of one, and the request behind it reaches the keyboard late or not
        // at all. The cost lands hardest on firmware built without the descriptor,
        // where the lookup has to fail before anything else can proceed, which is
        // why older keyboards stalled where newer ones did not.
        //
        // Nothing here is urgent: the tabs it decides between are not usable until
        // the keymap has loaded anyway.
        await waitForRpcIdle();
        if (cancelled) return;

        const raw = await toraboReadCaps();
        // decodeCaps before either is stored: a descriptor that fails to parse
        // is corruption (bad magic, truncated), not evolution, so it leaves the
        // hook in the same "couldn't ask" state as a missing service rather
        // than half-populated.
        const caps = decodeCaps(raw);
        if (!cancelled) setState({ caps, raw });
      } catch (e) {
        // Expected on firmware older than the descriptor. Not an error the user
        // needs to see: we simply fall back to the pre-capabilities behaviour.
        console.info("torabo capabilities unavailable (older firmware?):", e);
        if (!cancelled) setState({ caps: null, raw: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conn]);

  return { caps: state.caps, raw: state.raw, loading };
}
