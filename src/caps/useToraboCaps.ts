import { useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { waitForRpcIdle } from "../rpc/logging";
import { toraboReadCaps } from "../backends";
import { ToraboCaps, decodeCaps } from "./toraboCaps";

/**
 * Read the firmware's self-description once per connection.
 *
 * Returns null while loading AND for firmware that predates the descriptor — the
 * two are deliberately the same to callers, because both mean "we don't know what
 * this keyboard can do", and the safe answer to that is to show everything and let
 * an individual feature's read fail on its own. Hiding a tab because we couldn't
 * ask would be worse than showing one that turns out to be unavailable.
 */
export function useToraboCaps(): { caps: ToraboCaps | null; loading: boolean } {
  const { conn } = useContext(ConnectionContext);
  const [caps, setCaps] = useState<ToraboCaps | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conn) {
      setCaps(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setCaps(null); // don't show the PREVIOUS keyboard's capabilities while we ask
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
        if (!cancelled) setCaps(decodeCaps(raw));
      } catch (e) {
        // Expected on firmware older than the descriptor. Not an error the user
        // needs to see: we simply fall back to the pre-capabilities behaviour.
        console.info("torabo capabilities unavailable (older firmware?):", e);
        if (!cancelled) setCaps(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conn]);

  return { caps, loading };
}
