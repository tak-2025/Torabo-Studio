import type { ToraboConfigBackend } from "../types";
import { CONFIG_SERVICES, type ConfigKey, type ConfigService } from "./uuids";

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

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Web Bluetooth's own ceiling on a single writeValue(): the spec caps the ATT
 * value at 512 bytes regardless of the negotiated MTU, and Chrome enforces it
 * client-side with `InvalidModificationError: Value can't exceed 512 bytes`
 * before the request ever reaches the radio. Below this, one writeValue() is
 * always a single plain ATT Write Request — nothing here needs splitting.
 */
const WEB_BLUETOOTH_WRITE_VALUE_LIMIT = 512;

/**
 * Chunk size used when a blob has to be split across several writeValue()
 * calls, chosen to stay UNDER one ATT MTU rather than under the 512-byte
 * limit above.
 *
 * Chrome usually negotiates an MTU of 247 on this hardware (matches
 * CONFIG_BT_L2CAP_TX_MTU on the zmk-tsuki side); 247 − 3 bytes of ATT opcode +
 * handle = 244 bytes of usable payload. Any single writeValue() at or below
 * that rides out as one plain ATT Write Request. Go even one byte over the
 * negotiated MTU and Chrome instead promotes that write into an ATT Write
 * Long (Prepare Write / Execute Write with a real offset) — which the
 * firmware's plain-chunk reassembler does NOT expect from an offset==0
 * splitter: it would collide with the offset-continuity check in transport
 * (A) of gatt_service.c (torabo-tsuki_ext_FW, trackpad and timing services)
 * and the second chunk would come back BT_ATT_ERR_INVALID_OFFSET. Staying at
 * 244 keeps every chunk on transport (B) — plain Write Requests, all at
 * offset==0 — which is the path the firmware actually reassembles.
 */
const CONFIG_WRITE_CHUNK = 244;

/**
 * ConfigKey values whose firmware reassembles a blob sent as consecutive
 * offset==0 writes (torabo-tsuki_ext_FW, transport (B) in each
 * gatt_service.c — see trackpad/src/gatt_service.c and
 * timing/src/gatt_service.c for the design note; both stage chunks into a
 * buffer, keyed off the parsed header's expected length, with a 2-second gap
 * timeout between chunks).
 *
 * Every other config key's write handler rejects offset != 0 outright
 * (trackball/encoder/led: ztc_write_cfg / enc_write_cfg / led_write_cfg) or
 * only ever carries a single slot that is guaranteed to fit one MTU
 * (macros/combos: DM_WRITE_MAX / CB_WRITE_MAX are both under 100 bytes) —
 * splitting those here would either be rejected on the second chunk or is
 * simply pointless. `caps` is read-only and never reaches write() at all.
 */
const CHUNKABLE_KEYS: ReadonlySet<ConfigKey> = new Set<ConfigKey>([
  "trackpad",
  "timing",
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
    if (!server.connected)
      throw new Error("キーボードとの接続が切れています。");

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
        `${spec.label} サービスがこのキーボードにありません` +
          `（その機能を含まないファームウェアの可能性があります）: ${errText(e)}`,
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
    if (spec.exactLength !== null && bytes.length !== spec.exactLength) {
      throw new Error(
        `${spec.label} の読み取りが ${bytes.length} バイトでした` +
          `（${spec.exactLength} バイト必要）。` +
          (bytes.length === 512
            ? "ブラウザが ATT の上限 512 バイトで読み取りを打ち切った可能性があります。"
            : "ファームウェアとアプリのバージョンが合っていない可能性があります。") +
          "\n（不完全なデータで保存するとキーボード側の設定が失われるため、中断しました）",
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
    // NOTE this is NOT "Chrome splits anything over the MTU into a Long Write
    // for us" (an earlier version of this comment claimed that). It doesn't:
    // Web Bluetooth caps a single writeValue() at 512 bytes unconditionally
    // and Chrome throws InvalidModificationError before anything goes over
    // the air. Below the cap, one call here is exactly one plain ATT Write
    // Request — untouched from before this function grew a split path.
    if (data.length <= WEB_BLUETOOTH_WRITE_VALUE_LIMIT) {
      await chr.writeValue(data as unknown as BufferSource);
      return;
    }

    if (!CHUNKABLE_KEYS.has(key)) {
      throw new Error(
        `${spec.label} が ${data.length} バイトあり、512 バイトを超えています。` +
          "このファームウェアはブラウザからの分割書き込みに対応していません" +
          "（デスクトップ版アプリからの保存をお試しください）。",
      );
    }

    // Split into MTU-sized chunks and send them as consecutive plain writes.
    // writeValue() already waits for the peripheral's ATT response before
    // resolving, so pacing is free — no extra delay between chunks is needed.
    // The firmware DOES need the chunks to keep arriving though: its
    // reassembler drops whatever it has staged if more than
    // TP_ASM_TIMEOUT_MS / TMG_ASM_TIMEOUT_MS (2000ms) passes between two
    // chunks, so a slow await chain here (e.g. from Chrome retrying a stalled
    // write) can still lose the transfer partway through.
    const total = Math.ceil(data.length / CONFIG_WRITE_CHUNK);
    for (let offset = 0, n = 1; offset < data.length; offset += CONFIG_WRITE_CHUNK, n++) {
      const chunk = data.subarray(offset, offset + CONFIG_WRITE_CHUNK);
      try {
        await chr.writeValue(chunk as unknown as BufferSource);
      } catch (e) {
        throw new Error(
          `${spec.label} の書き込みに失敗しました` +
            `（チャンク ${n}/${total}, ${chunk.length} バイト）: ${errText(e)}`,
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
