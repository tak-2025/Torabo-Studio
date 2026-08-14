import { useContext, useEffect, useState } from "react";

import { ConnectionContext } from "../rpc/ConnectionContext";
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
        // Stay out of the connect handshake's way. WinRT does not take kindly to
        // concurrent GATT discovery — the studio service's own discovery already
        // has to retry (see src-tauri transport/gatt.rs), and firing ours on top of
        // it is a good way to make that flakier. Nothing here is urgent.
        await new Promise((r) => setTimeout(r, 400));
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
