import { tr } from "../../i18n";
import type { ToraboConfigBackend } from "../types";
import {
  CONFIG_SERVICES,
  formatAcceptedLengths,
  isAcceptedLength,
  type ConfigKey,
  type ConfigService,
} from "./uuids";

/**
 * The torabo config services over Web Bluetooth.
 *
 * Each one is a single characteristic carrying the whole blob, so a backend
 * method is a read or a write and nothing else — the encoding stays in the
 * feature modules, exactly as it does for the desktop backend.
 *
 * Characteristic handles are looked up once and kept: Chrome's GATT discovery
 * costs hundreds of milliseconds, and the desktop app pays it per call only
 * because Rust caches the connection instead.
 */

/**
 * Describe a thrown value well enough to act on it.
 *
 * `e.message` alone was not enough, and the save failure that prompted this
 * proved it: the user got "…(chunk 5/5, 104 bytes): " with NOTHING after the
 * colon, because the transport rejected with an exception whose `message` was
 * the empty string. Which exception it was is the entire diagnosis — a
 * `NetworkError` says the link dropped, `NotSupportedError` says the write was
 * refused, `InvalidStateError` says the characteristic went stale — and all
 * three were being reported identically, as silence.
 *
 * So the `name` leads (every DOMException has one, and it is the part that
 * names the fault), the message follows only when it adds something, and
 * `code` comes along when the browser set one. An error with a message and no
 * useful name still reads exactly as it did before.
 */
function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);

  const name = e.name && e.name !== "Error" ? e.name : "";
  const msg = e.message?.trim() ?? "";
  // DOMException.code: legacy, often 0, and only worth printing when it is not.
  const code =
    typeof (e as DOMException).code === "number" && (e as DOMException).code
      ? ` (code ${(e as DOMException).code})`
      : "";

  if (name && msg) return `${name}: ${msg}${code}`;
  if (name) return `${name}${code}`;
  if (msg) return `${msg}${code}`;
  // Nothing to say at all — still better than an empty string, which reads as
  // a bug in the message rather than a fault on the link.
  return `${e.constructor?.name ?? "Error"} (no details)${code}`;
}

/**
 * Chunk size used when a blob has to be split across several writeValue()
 * calls — and, for the keys NOT in CHUNKABLE_KEYS below (whose firmware window
 * rejects a fragmented write outright), also the largest blob that can be sent
 * at all. Chosen to stay under one ATT MTU rather than under Web Bluetooth's
 * own 512-byte writeValue() cap, which is far too generous to be the real
 * limit here.
 *
 * Chrome usually negotiates an MTU of 247 on this hardware (matches
 * CONFIG_BT_L2CAP_TX_MTU on the zmk-tsuki side); 247 − 3 bytes of ATT opcode +
 * handle = 244 bytes of usable payload. Any single writeValue() at or below
 * that rides out as one plain ATT Write Request. Go even one byte over the
 * negotiated MTU and Chrome instead promotes that write into an ATT Write
 * Long (Prepare Write / Execute Write with a real offset) — which the
 * firmware's plain-chunk reassembler does NOT expect from an offset==0
 * splitter: it would collide with the offset-continuity check in transport
 * (A) of gatt_service.c — the transport every chunk-reassembling service
 * shares (torabo-tsuki_ext_FW: trackpad and timing, plus trackball and encoder
 * on firmware that advertises the caps-header WINDOW_READ bit — see
 * CHUNKABLE_KEYS) — and the second chunk would come back
 * BT_ATT_ERR_INVALID_OFFSET. Staying at 244 keeps every chunk on transport
 * (B) — plain Write Requests, all at offset==0 — which is the path the
 * firmware actually reassembles.
 */
export const CONFIG_WRITE_CHUNK = 244;

/**
 * ConfigKey values whose firmware reassembles a blob sent as consecutive
 * offset==0 writes (torabo-tsuki_ext_FW, transport (B) in each
 * gatt_service.c — see trackpad/src/gatt_service.c and
 * timing/src/gatt_service.c for the design note; both stage chunks into a
 * buffer, keyed off the parsed header's expected length, with a 2-second gap
 * timeout between chunks).
 *
 * `trackball` (e1f4a901) and `encoder` (e1f4ad01) joined them in the
 * torabo-tsuki_ext_FW change that moved both write handlers onto exactly that
 * path: the shared `torabo_wire_asm` chunk-reassembly buffer, plus
 * BT_GATT_PERM_PREPARE_WRITE on the attribute. That firmware is identifiable
 * on the link instead of by version string: the same change also brought the
 * client-driven windowed READ, which the caps header advertises as
 * TORABO_CAPS_HDR_WINDOW_READ — `_rsv` (byte 7) bit2, 0x04. So "advertises
 * WINDOW_READ" and "reassembles chunked trackball/encoder writes" are the
 * same firmware, and the bit is the stable way to ask.
 * Nothing else about those two characteristics moved with it — same GATT
 * attribute layout, same wire bytes, same length rules, same exact-length
 * apply check — so listing them here is the entire client-side change. They
 * need no special-casing in write() below, because the splitter is already
 * key-agnostic: offset==0 on every chunk, sequential CONFIG_WRITE_CHUNK-sized
 * pieces in order, paced by each write's own ATT response. Against firmware
 * that does not advertise WINDOW_READ, a split trackball/encoder write fails
 * on its second chunk with BT_ATT_ERR_INVALID_OFFSET, which surfaces as sys.cfg.writeFailed naming
 * that chunk — the same failure mode as any other mid-transfer GATT error.
 *
 * Every other config key's write handler still rejects offset != 0 outright
 * (led: led_write_cfg) or only ever carries a single slot that is guaranteed
 * to fit one MTU (macros/combos: DM_WRITE_MAX / CB_WRITE_MAX are both under
 * 100 bytes) — splitting those here would either be rejected on the second
 * chunk or is simply pointless. `caps` is read-only and never reaches write()
 * at all.
 *
 * Exported for the test that pins this exact membership: a key missing from
 * here is not a compile error, it is a save that fails on real hardware.
 */
export const CHUNKABLE_KEYS: ReadonlySet<ConfigKey> = new Set<ConfigKey>([
  "trackpad",
  "timing",
  "trackball",
  "encoder",
]);

export function makeConfigBackend(
  server: BluetoothRemoteGATTServer,
): ToraboConfigBackend {
  const handles = new Map<ConfigKey, BluetoothRemoteGATTCharacteristic>();

  async function characteristic(
    key: ConfigKey,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const spec: ConfigService = CONFIG_SERVICES[key];
    // Checked before the cache too: a cached handle from before a disconnect
    // is still a live JS object, so returning it straight away sent the
    // actual read/write at a dead GATT server and surfaced as a raw
    // DOMException instead of this message.
    if (!server.connected) throw new Error(tr("sys.cfg.disconnected"));

    const cached = handles.get(key);
    if (cached) return cached;

    let chr: BluetoothRemoteGATTCharacteristic;
    try {
      const svc = await server.getPrimaryService(spec.service);
      chr = await svc.getCharacteristic(spec.characteristic);
    } catch (e) {
      // Absent service is the normal answer for firmware built without the
      // feature, so say which feature rather than leaking a bare GATT error.
      throw new Error(
        tr("sys.cfg.serviceMissing", {
          label: spec.label,
          error: errText(e),
        }),
      );
    }
    handles.set(key, chr);
    return chr;
  }

  async function read(key: ConfigKey): Promise<Uint8Array> {
    const spec = CONFIG_SERVICES[key];
    const chr = await characteristic(key);
    const dv = await chr.readValue();
    // Copied, not a view: the buffer is the browser's and may be reused for the
    // next read, while callers decode this one at their leisure.
    const bytes = new Uint8Array(
      dv.buffer,
      dv.byteOffset,
      dv.byteLength,
    ).slice();

    // Macros and combos get a length check because their decoders walk slots
    // until the buffer ends instead of failing: a short read there looks exactly
    // like "the remaining slots are empty", and the next save would write that
    // emptiness to the keyboard. Every other config is checked by its own
    // decoder against a length derived from its header, so it fails loudly on
    // its own and does not need a second opinion here.
    if (!isAcceptedLength(spec.exactLength, bytes.length)) {
      throw new Error(
        tr("sys.cfg.readShort", {
          label: spec.label,
          got: bytes.length,
          need: formatAcceptedLengths(spec.exactLength),
          cause: tr(
            bytes.length === 512
              ? "sys.cfg.readShort.att"
              : "sys.cfg.readShort.mismatch",
          ),
        }),
      );
    }
    return bytes;
  }

  async function write(key: ConfigKey, data: Uint8Array): Promise<void> {
    const chr = await characteristic(key);
    const spec = CONFIG_SERVICES[key];

    // writeValue is the acknowledged write, and it is what these characteristics
    // want: each one commits to NVS, so dropping a write silently is not an
    // option.
    //
    // The cut-off is ONE ATT payload, not Web Bluetooth's 512-byte writeValue()
    // cap. Between the two, Chrome accepts the call and promotes it to an ATT
    // Write Long (Prepare Write / Execute Write, with a real offset) — see
    // CONFIG_WRITE_CHUNK above — and every firmware window served by
    // TORABO_GATT_SIMPLE_HANDLERS (torabo_common/gatt_simple.h: LED, macros,
    // combos — trackball and encoder left that set in the same ext_FW change
    // that started advertising WINDOW_READ, see CHUNKABLE_KEYS) answers a non-zero offset with
    // BT_ATT_ERR_INVALID_OFFSET. So a 245..512-byte write on those keys cannot
    // succeed; it only fails later, as a bare DOMException with no hint of why.
    // Saying so here is the difference between "the firmware's window is too
    // small for this blob" and an unexplained save failure.
    if (data.length <= CONFIG_WRITE_CHUNK) {
      await chr.writeValue(data as unknown as BufferSource);
      return;
    }

    if (!CHUNKABLE_KEYS.has(key)) {
      throw new Error(
        tr("sys.cfg.tooLarge", {
          label: spec.label,
          bytes: data.length,
          max: CONFIG_WRITE_CHUNK,
        }),
      );
    }

    // Split into MTU-sized chunks and send them as consecutive plain writes.
    // writeValue() already waits for the peripheral's ATT response before
    // resolving, so pacing is free — no extra delay between chunks is needed.
    // The firmware DOES need the chunks to keep arriving though: its
    // reassembler drops whatever it has staged once more than its gap timeout
    // (TP_ASM_TIMEOUT_MS / TMG_ASM_TIMEOUT_MS, and torabo_wire_asm's own for
    // trackball/encoder — 2000ms either way) passes between two chunks, so a
    // slow await chain here (e.g. from Chrome retrying a stalled write) can
    // still lose the transfer partway through.
    const total = Math.ceil(data.length / CONFIG_WRITE_CHUNK);
    for (let offset = 0, n = 1; offset < data.length; offset += CONFIG_WRITE_CHUNK, n++) {
      const chunk = data.subarray(offset, offset + CONFIG_WRITE_CHUNK);
      try {
        await chr.writeValue(chunk as unknown as BufferSource);
      } catch (e) {
        throw new Error(
          tr("sys.cfg.writeFailed", {
            label: spec.label,
            n,
            total,
            bytes: chunk.length,
            error: errText(e),
          }),
        );
      }
    }
  }

  return {
    toraboReadCaps: () => read("caps"),

    trackballReadConfig: () => read("trackball"),
    trackballWriteConfig: (d) => write("trackball", d),

    trackpadReadConfig: () => read("trackpad"),
    trackpadWriteConfig: (d) => write("trackpad", d),

    encoderReadConfig: () => read("encoder"),
    encoderWriteConfig: (d) => write("encoder", d),

    ledReadConfig: () => read("led"),
    ledWriteConfig: (d) => write("led", d),

    timingReadConfig: () => read("timing"),
    timingWriteConfig: (d) => write("timing", d),

    dmacReadAll: () => read("macros"),
    dmacWriteSlot: (d) => write("macros", d),

    comboReadAll: () => read("combos"),
    comboWriteSlot: (d) => write("combos", d),
  };
}
