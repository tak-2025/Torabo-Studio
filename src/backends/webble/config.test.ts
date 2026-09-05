/**
 * Tests for the write path in config.ts — specifically WHICH config keys are
 * allowed to be split across several writeValue() calls.
 *
 * CHUNKABLE_KEYS is a plain set of strings, so a key missing from it is not a
 * compile error and not a test failure anywhere else: it is a save that throws
 * sys.cfg.tooLarge on real hardware, for a firmware that would in fact have
 * accepted the split write. That is exactly what happened to `trackball` and
 * `encoder` before torabo-tsuki_ext_FW — in the same change that started
 * advertising TORABO_CAPS_HDR_WINDOW_READ in the caps header (`_rsv` bit2,
 * 0x04) — moved both write handlers onto the shared `torabo_wire_asm` chunk-reassembly
 * buffer (plus BT_GATT_PERM_PREPARE_WRITE on the attribute) — the same path
 * trackpad and timing already used — and the client was left still refusing to
 * split them. So the membership is asserted as a whole set below, not one
 * `has()` at a time: an assertion that only checks the keys it knows about
 * passes just as happily when the next feature is forgotten.
 */
import { describe, it, expect } from "vitest";
import {
  CHUNKABLE_KEYS,
  CONFIG_WRITE_CHUNK,
  makeConfigBackend,
} from "./config";
import { CONFIG_SERVICES, type ConfigKey } from "./uuids";
import {
  ZTC_COAST,
  ZTC_HDR,
  ZTC_LAYER,
  Role,
  defaultCoast,
  encodeZtc,
  type ZtcConfig,
} from "../../trackball/ztcConfig";

/** Every write that reached the fake characteristic, in the order it was sent. */
interface Recorded {
  key: ConfigKey;
  bytes: Uint8Array;
}

/**
 * The smallest thing config.ts will talk to: a connected GATT server that
 * resolves each config service by UUID and records what is written to its
 * characteristic. Only the members config.ts actually touches are implemented,
 * hence the cast — a fuller stub would be inventing a browser API surface no
 * code under test reads.
 */
function fakeGattServer(): {
  server: BluetoothRemoteGATTServer;
  writes: Recorded[];
} {
  const writes: Recorded[] = [];
  const keyOfService = new Map<string, ConfigKey>(
    (Object.keys(CONFIG_SERVICES) as ConfigKey[]).map((k) => [
      CONFIG_SERVICES[k].service,
      k,
    ]),
  );

  const server = {
    connected: true,
    async getPrimaryService(uuid: string) {
      const key = keyOfService.get(uuid);
      if (!key) throw new Error(`no service ${uuid} on this fake`);
      return {
        async getCharacteristic(_uuid: string) {
          return {
            async writeValue(value: BufferSource) {
              // Copied: config.ts hands out a subarray of the caller's buffer.
              writes.push({ key, bytes: new Uint8Array(value as Uint8Array) });
            },
          };
        },
      };
    },
  };

  return { server: server as unknown as BluetoothRemoteGATTServer, writes };
}

/** A trackball config with `layers` layers and the v3 coast trailer present. */
function ztcWithLayers(layers: number): ZtcConfig {
  return {
    layers: Array.from({ length: layers }, () => ({
      x: { role: Role.Move, reverse: false, speedDiv: 1 },
      y: { role: Role.Move, reverse: false, speedDiv: 1 },
      tempEnable: false,
    })),
    tempTarget: 0,
    tempTimeoutMs: 1000,
    coast: defaultCoast(),
    hasCoast: true,
  };
}

describe("CHUNKABLE_KEYS", () => {
  it("is exactly the set of services whose firmware reassembles chunks", () => {
    // Sorted, and compared as a whole: this fails if a key is missing AND if
    // one is added without a firmware side to reassemble it.
    expect([...CHUNKABLE_KEYS].sort()).toEqual([
      "encoder",
      "timing",
      "trackball",
      "trackpad",
    ]);
  });

  it("includes trackball and encoder (ext_FW advertising caps WINDOW_READ)", () => {
    // Spelled out separately from the set comparison above so a failure here
    // names the regression rather than a diff of four strings: these two are
    // the keys the firmware change added, and the ones a careless revert of
    // this commit would drop.
    expect(CHUNKABLE_KEYS.has("trackball")).toBe(true);
    expect(CHUNKABLE_KEYS.has("encoder")).toBe(true);
  });

  it("only names real config services, and never the read-only one", () => {
    for (const key of CHUNKABLE_KEYS) {
      expect(CONFIG_SERVICES[key]).toBeDefined();
    }
    // `caps` is read-only; it never reaches write(), so listing it would be a
    // statement about a code path that does not exist.
    expect(CHUNKABLE_KEYS.has("caps")).toBe(false);
  });
});

describe("write(): oversized blobs on chunkable keys", () => {
  it("splits a 252-byte trackball wire (20 layers) instead of rejecting it", async () => {
    // 20 layers on the v3 wire: 8 + 20*12 + 4 = 252 bytes, i.e. eight bytes
    // past CONFIG_WRITE_CHUNK. Built through encodeZtc rather than as a bare
    // Uint8Array(252) so the length stays tied to the real codec.
    const data = encodeZtc(ztcWithLayers(20));
    expect(data.length).toBe(ZTC_HDR + 20 * ZTC_LAYER + ZTC_COAST);
    expect(data.length).toBe(252);
    expect(data.length).toBeGreaterThan(CONFIG_WRITE_CHUNK);

    const { server, writes } = fakeGattServer();
    const backend = makeConfigBackend(server);

    // The regression: this used to throw sys.cfg.tooLarge ("…cannot be saved
    // over BLE"), because trackball was not in CHUNKABLE_KEYS.
    await expect(backend.trackballWriteConfig(data)).resolves.toBeUndefined();

    expect(writes.map((w) => w.key)).toEqual(["trackball", "trackball"]);
    expect(writes.map((w) => w.bytes.length)).toEqual([
      CONFIG_WRITE_CHUNK,
      252 - CONFIG_WRITE_CHUNK,
    ]);
    // Chunks are consecutive slices of the original, in order and with nothing
    // dropped or repeated — the firmware reassembler concatenates them blindly.
    const rejoined = new Uint8Array(252);
    rejoined.set(writes[0].bytes, 0);
    rejoined.set(writes[1].bytes, CONFIG_WRITE_CHUNK);
    expect(rejoined).toEqual(data);
  });

  it("splits an oversized encoder wire too", async () => {
    // 4 + layers*12; the exact contents do not matter here, only that a blob
    // past one ATT payload takes the splitter rather than the size gate.
    const data = new Uint8Array(CONFIG_WRITE_CHUNK + 60).fill(0xab);
    const { server, writes } = fakeGattServer();
    const backend = makeConfigBackend(server);

    await expect(backend.encoderWriteConfig(data)).resolves.toBeUndefined();
    expect(writes.map((w) => w.bytes.length)).toEqual([CONFIG_WRITE_CHUNK, 60]);
  });

  it("still sends a blob that fits one ATT payload as a single write", async () => {
    const data = encodeZtc(ztcWithLayers(4)); // 8 + 48 + 4 = 60 bytes
    expect(data.length).toBeLessThanOrEqual(CONFIG_WRITE_CHUNK);

    const { server, writes } = fakeGattServer();
    await makeConfigBackend(server).trackballWriteConfig(data);

    expect(writes).toHaveLength(1);
    expect(writes[0].bytes).toEqual(data);
  });

  it("still refuses an oversized blob on a key the firmware cannot reassemble", async () => {
    // The counterpart to the test above: LED's write handler is still one of
    // the TORABO_GATT_SIMPLE_HANDLERS windows that answers offset != 0 with
    // BT_ATT_ERR_INVALID_OFFSET, so the size gate has to stay for it.
    expect(CHUNKABLE_KEYS.has("led")).toBe(false);

    const { server, writes } = fakeGattServer();
    const data = new Uint8Array(CONFIG_WRITE_CHUNK + 1);

    await expect(
      makeConfigBackend(server).ledWriteConfig(data),
    ).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
});
