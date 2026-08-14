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

export function makeConfigBackend(
  server: BluetoothRemoteGATTServer,
): ToraboConfigBackend {
  const handles = new Map<ConfigKey, BluetoothRemoteGATTCharacteristic>();

  async function characteristic(
    key: ConfigKey,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const cached = handles.get(key);
    if (cached) return cached;

    const spec: ConfigService = CONFIG_SERVICES[key];
    if (!server.connected)
      throw new Error("キーボードとの接続が切れています。");

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
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);

    // A short read is not a harmless partial result here. Some decoders stop at
    // the end of the buffer rather than failing, so missing slots come back as
    // empty ones — and the next save would write that emptiness to the keyboard.
    // Refuse instead, and say which of the two causes it is.
    const truncated = "TRUNCATED";
    const problem =
      // 512 is the largest value ATT can carry. Landing exactly on it means the
      // read stopped there, not that the config happens to be that size — so
      // this catches the runtime-sized configs too, which have no known length.
      bytes.length === 512
        ? truncated
        : spec.exactLength !== null && bytes.length !== spec.exactLength
          ? "MISMATCH"
          : null;

    if (problem) {
      const expected =
        spec.exactLength !== null ? `（${spec.exactLength} バイト必要）` : "";
      throw new Error(
        `${spec.label} の読み取りが ${bytes.length} バイトでした${expected}。` +
          (problem === truncated
            ? "ブラウザが 512 バイトで読み取りを打ち切っています。" +
              "この機能はデスクトップ版をご利用ください。"
            : "ファームウェアとアプリのバージョンが合っていない可能性があります。") +
          "\n（不完全なデータで保存するとキーボード側の設定が失われるため、中断しました）",
      );
    }
    return bytes;
  }

  async function write(key: ConfigKey, data: Uint8Array): Promise<void> {
    const chr = await characteristic(key);
    // writeValue is the acknowledged write, and it is what these characteristics
    // want: each one commits to NVS, so dropping a write silently is not an
    // option. Chrome splits anything over the MTU into a Long Write for us.
    await chr.writeValue(data as unknown as BufferSource);
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

    dmacReadAll: () => read("macros"),
    dmacWriteSlot: (d) => write("macros", d),

    comboReadAll: () => read("combos"),
    comboWriteSlot: (d) => write("combos", d),
  };
}
