/**
 * One queue for every config exchange with the keyboard, whatever the route.
 *
 * WHY THIS EXISTS. The torabo config services are separate GATT
 * characteristics, but they share ONE ATT link, and a link carries exactly one
 * operation at a time. Nothing in the app used to say so. Each panel simply
 * awaited its own read or write, and two of them awaiting at once handed the
 * transport two overlapping operations to sort out — which is not a thing a
 * transport can do well:
 *
 *   - Web Bluetooth serialises GATT operations per device, but the order is
 *     the browser's, not ours. A read issued while a multi-chunk write is
 *     partway through takes its turn BETWEEN two chunks.
 *   - The desktop path is worse: every `*_read_config` / `*_write_config`
 *     Tauri command re-runs `discover_services_with_uuid` +
 *     `discover_characteristics_with_uuid` before it touches the value (see
 *     src-tauri/src/transport/trackpad.rs's `cfg_characteristic`). That is
 *     hundreds of milliseconds of extra ATT traffic, dropped into the middle
 *     of whatever else is in flight.
 *
 * A gap between two chunks is not a slow save, it is a LOST one. The firmware
 * reassembles a split config in a staging buffer and discards it once more
 * than 2000 ms passes between chunks (TP_ASM_TIMEOUT_MS / TMG_ASM_TIMEOUT_MS,
 * and `torabo_wire_asm`'s own for trackball and encoder). The chunk that
 * arrives after the timeout is then read as a fresh write of a blob far too
 * short to be a config, and the save fails — or worse, the link itself gives
 * out and the keyboard drops.
 *
 * That is exactly the failure this module was written for: a 1080-byte
 * trackpad wire (2 devices x 14 layers) went out as five chunks, the first
 * four landed, and the fifth came back with a bare transport error carrying no
 * message at all while the keyboard reset. The background reads added
 * alongside it — the macro-name auto-read (dynamic_macros/useAutoMacroNames.ts)
 * and the firmware-info tab's trackpad placement read (caps/FirmwareInfoPanel
 * .tsx) — are both free to fire at any moment, including that one.
 *
 * WHY `waitForRpcIdle` DID NOT COVER IT. Those two readers already politely
 * call rpc/logging.ts's `waitForRpcIdle()` first. But that helper counts
 * outstanding *RPC* calls (`do_call`), and a config read or write is not an
 * RPC — it never touches that counter. So during a five-chunk GATT write the
 * link is saturated and `waitForRpcIdle()` reports it perfectly idle, then
 * releases a reader straight into the middle of the transfer. The two guards
 * are complementary, not redundant: `waitForRpcIdle` keeps config traffic off
 * the keymap's back, and this queue keeps config traffic off its own.
 *
 * WHY HERE, AND NOT IN ONE BACKEND. Every config call in the app goes through
 * the thin pass-throughs in ./index.ts, so wrapping them there fixes the
 * browser, desktop-native and RPC-tunnel routes at once and leaves no second
 * door. Fixing it inside webble/config.ts would have missed the transport the
 * reported failure actually happened on.
 *
 * WHAT IT DOES NOT DO. It does not make an operation faster or add a timeout,
 * and it deliberately does not try to cancel anything: a GATT operation cannot
 * be recalled once issued, so "give up and let the next one in" would restore
 * the very overlap this exists to prevent. An operation that never settles
 * therefore stalls the ones behind it — the same way it already stalled its
 * own panel before this queue existed. `reset()` is the way out, and ./index.ts
 * calls it when a connection is established or torn down.
 */

/**
 * Tail of the chain: resolves when everything queued so far has settled.
 *
 * Always fulfils, never rejects — a failed operation must not poison the queue
 * for the next caller, and an unhandled rejection parked here would be
 * reported as one even though the real caller handled it.
 */
let tail: Promise<void> = Promise.resolve();

/** Operations queued or running. `> 0` means the link is spoken for. */
let pending = 0;

/** A generation counter so `reset()` can orphan the old chain. */
let epoch = 0;

/** True while any config operation is queued or in flight. */
export function linkBusy(): boolean {
  return pending > 0;
}

/** How many config operations are queued or in flight. For diagnostics. */
export function linkPending(): number {
  return pending;
}

/**
 * Run `op` with exclusive use of the link, once everything queued before it has
 * settled.
 *
 * FIFO, and the whole of `op` is the critical section — which is the point for
 * a chunked write: all five of its `writeValue()` calls sit inside one turn,
 * so nothing can be scheduled between them.
 *
 * The result (or failure) of `op` is passed straight back to the caller
 * untouched; queueing is not supposed to be visible in what a call returns.
 */
export function onLink<T>(op: () => Promise<T>): Promise<T> {
  pending++;
  const mine = epoch;
  // `.then(op, op)` rather than `.then(op)`: the previous operation failing is
  // not a reason to skip this one. It has already had its turn either way.
  const run = tail.then(op, op);
  // Swallow here only — `run` itself keeps the rejection for the caller.
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  tail = settled;
  return run.finally(() => {
    // Only if this operation still belongs to the live chain: `reset()` has
    // already zeroed the counter on its way out, and decrementing again for a
    // straggler from the abandoned epoch would push it negative and leave
    // `linkBusy()` lying about a link that is free.
    if (mine === epoch) pending--;
  });
}

/**
 * Abandon the current chain: later calls no longer wait behind whatever is
 * still outstanding.
 *
 * For a connection boundary, where waiting is meaningless — operations issued
 * to a keyboard that is gone may never settle, and the next connection must not
 * inherit that stall. It does NOT cancel anything already issued; those
 * operations still settle (and still reject) on their own.
 */
export function resetLinkQueue(): void {
  epoch++;
  tail = Promise.resolve();
  pending = 0;
}
