/**
 * Mock-BLE checks for the Web Bluetooth backend.
 *
 * Run through the dev server (`npm run dev` -> /tools/webble-mock-test.html).
 * There is no test runner in this project, and the parts worth pinning down here
 * are the ones a real keyboard cannot easily be made to do: a truncated read, an
 * absent service, an oversized RPC frame. Those are exactly the paths where a
 * mistake is silent and expensive, so they get a harness rather than a comment.
 *
 * This is a dev tool: it is not part of any build input and ships nowhere.
 */

import { makeConfigBackend } from "../src/backends/webble/config";
import { CONFIG_SERVICES } from "../src/backends/webble/uuids";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
}

async function expectReject(
  name: string,
  fn: () => Promise<unknown>,
  matches: RegExp,
) {
  try {
    await fn();
    check(name, false, "拒否されるべきところが成功しました");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(name, matches.test(msg), msg);
  }
}

// --- a GATT server just real enough --------------------------------------

interface CharSpec {
  value: Uint8Array;
  /** Recorded writes, so chunking and payloads can be asserted. */
  writes: Uint8Array[];
}

function mockServer(chars: Record<string, CharSpec>, absent: string[] = []) {
  let discoveries = 0;
  const server = {
    connected: true,
    discoveries: () => discoveries,
    async getPrimaryService(uuid: string) {
      if (absent.includes(uuid)) throw new Error(`service ${uuid} not found`);
      discoveries++;
      return {
        async getCharacteristic(chrUuid: string) {
          const spec = chars[chrUuid];
          if (!spec) throw new Error(`characteristic ${chrUuid} not found`);
          return {
            async readValue() {
              return new DataView(
                spec.value.buffer,
                spec.value.byteOffset,
                spec.value.byteLength,
              );
            },
            async writeValue(data: BufferSource) {
              spec.writes.push(new Uint8Array(data as ArrayBuffer));
            },
          };
        },
      };
    },
  };
  return server as unknown as BluetoothRemoteGATTServer & {
    discoveries: () => number;
  };
}

async function run() {
  const macros = CONFIG_SERVICES.macros;
  const combos = CONFIG_SERVICES.combos;
  const trackball = CONFIG_SERVICES.trackball;

  check(
    "マクロの期待長は 1624B",
    macros.exactLength === 1624,
    String(macros.exactLength),
  );
  check(
    "コンボの期待長は 420B",
    combos.exactLength === 420,
    String(combos.exactLength),
  );

  // 1. A full-length read passes straight through.
  {
    const chars = {
      [macros.characteristic]: {
        value: new Uint8Array(macros.exactLength!),
        writes: [],
      },
    };
    const be = makeConfigBackend(mockServer(chars));
    const got = await be.dmacReadAll();
    check("正しい長さの読み取りは通る", got.length === macros.exactLength);
  }

  // 2. Exactly 512 bytes — the ATT ceiling — must be refused, loudly, and the
  //    message must point at the browser rather than blame the firmware.
  {
    const chars = {
      [macros.characteristic]: { value: new Uint8Array(512), writes: [] },
    };
    const be = makeConfigBackend(mockServer(chars));
    await expectReject(
      "512B の読み取りを拒否する",
      () => be.dmacReadAll(),
      /512/,
    );
    await expectReject(
      "512B のとき原因をブラウザ側と説明する",
      () => be.dmacReadAll(),
      /打ち切/,
    );
  }

  // 3. Any other short read is refused too (a decoder would silently pad it).
  {
    const chars = {
      [combos.characteristic]: { value: new Uint8Array(100), writes: [] },
    };
    const be = makeConfigBackend(mockServer(chars));
    await expectReject(
      "短い読み取りを拒否する",
      () => be.comboReadAll(),
      /100 バイト/,
    );
  }

  // 4. Runtime-sized configs must NOT be length-checked (layer count varies).
  {
    const chars = {
      [trackball.characteristic]: { value: new Uint8Array(68), writes: [] },
    };
    const be = makeConfigBackend(mockServer(chars));
    const got = await be.trackballReadConfig();
    check("可変長の設定は長さ検証しない", got.length === 68);
  }

  // 4b. ...but exactly 512 is truncation even there, since ATT cannot carry
  //     more in one attribute. Trackpad configs can genuinely exceed it.
  {
    const tp = CONFIG_SERVICES.trackpad;
    const chars = {
      [tp.characteristic]: { value: new Uint8Array(512), writes: [] },
    };
    const be = makeConfigBackend(mockServer(chars));
    await expectReject(
      "可変長でも 512B なら切り詰めと判定する",
      () => be.trackpadReadConfig(),
      /打ち切/,
    );
  }

  // 5. A missing service names the feature instead of leaking a GATT error.
  {
    const be = makeConfigBackend(mockServer({}, [CONFIG_SERVICES.led.service]));
    await expectReject(
      "無いサービスは機能名で説明する",
      () => be.ledReadConfig(),
      /LED config/,
    );
  }

  // 6. Handles are discovered once and reused.
  {
    const chars = {
      [trackball.characteristic]: { value: new Uint8Array(20), writes: [] },
    };
    const server = mockServer(chars);
    const be = makeConfigBackend(server);
    await be.trackballReadConfig();
    await be.trackballReadConfig();
    await be.trackballWriteConfig(new Uint8Array([1, 2, 3]));
    check(
      "ハンドルは1回だけ discover する",
      server.discoveries() === 1,
      `discoveries=${server.discoveries()}`,
    );
  }

  // 7. Writes go out whole: these characteristics commit to NVS, so a config
  //    must never be delivered in pieces the firmware would apply separately.
  {
    const chars = {
      [trackball.characteristic]: { value: new Uint8Array(20), writes: [] },
    };
    const be = makeConfigBackend(mockServer(chars));
    const payload = new Uint8Array(200).fill(7);
    await be.trackballWriteConfig(payload);
    const w = chars[trackball.characteristic].writes;
    check(
      "書き込みは分割しない",
      w.length === 1 && w[0].length === 200,
      `writes=${w.length}, len=${w[0]?.length}`,
    );
  }

  // Render. Details are error messages, so they go in as text, never markup.
  const el = document.getElementById("out")!;
  const failed = results.filter((r) => !r.ok);

  const head = document.createElement("h2");
  head.textContent =
    `${failed.length ? "❌ 失敗あり" : "✅ 全て成功"} ` +
    `(${results.length - failed.length}/${results.length})`;
  el.replaceChildren(head);

  for (const r of results) {
    const row = document.createElement("div");
    row.className = r.ok ? "ok" : "ng";
    row.textContent = `${r.ok ? "✅" : "❌"} ${r.name}`;
    if (r.detail) {
      const small = document.createElement("small");
      small.textContent = r.detail;
      row.append(document.createElement("br"), small);
    }
    el.append(row);
  }
  (window as unknown as { __RESULTS__: Result[] }).__RESULTS__ = results;
}

run().catch((e) => {
  document.getElementById("out")!.textContent = `harness crashed: ${e}`;
});
