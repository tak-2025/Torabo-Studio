/**
 * Tests for the LED rule-table wire codec, per ledConfig.ts's own header
 * comment (torabo-tsuki_ext_FW/led/include/zmk_led_config/config.h — no
 * separate markdown design doc exists for this feature in this workspace):
 * header(6B) = magic u16(0x656c), version u8, caps u8, ruleMax u8, _rsv u8;
 * per side (left, right): ruleCount u8, then LED_MAX_RULES(8) rules of 4B
 * each (usecase, colour, pattern, param).
 */
import { describe, it, expect } from "vitest";
import {
  LED_MAGIC,
  LED_VERSION,
  LED_HDR,
  LED_RULE,
  LED_MAX_RULES,
  LED_SIDES,
  SIDE_LEFT,
  SIDE_RIGHT,
  Ch,
  CH_MASK,
  Pattern,
  UseCase,
  decodeLed,
  encodeLed,
  ledWireLen,
  type LedConfig,
} from "./ledConfig";

describe("ledConfig wire constants", () => {
  it("matches the documented header", () => {
    expect(LED_MAGIC).toBe(0x656c);
    expect(LED_HDR).toBe(6);
    expect(LED_RULE).toBe(4);
    expect(LED_MAX_RULES).toBe(8);
    expect(LED_SIDES).toBe(2);
  });

  it("ledWireLen = header + 2 sides * (1 count byte + 8 rules * 4B) = 72", () => {
    expect(ledWireLen()).toBe(72);
  });
});

describe("decodeLed: golden bytes", () => {
  it("decodes a hand-built rule table (2 left rules, 0 right rules)", () => {
    const buf = new Uint8Array(ledWireLen());
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, LED_MAGIC, true);
    dv.setUint8(2, LED_VERSION);
    dv.setUint8(3, 0x03); // caps: left+right present
    dv.setUint8(4, LED_MAX_RULES);

    let o = LED_HDR;
    dv.setUint8(o, 2); // left ruleCount
    o += 1;
    dv.setUint8(o, UseCase.BatteryLow);
    dv.setUint8(o + 1, Ch.Red);
    dv.setUint8(o + 2, Pattern.BlinkSlow);
    dv.setUint8(o + 3, 20);
    o += LED_RULE;
    dv.setUint8(o, UseCase.CapsLock);
    dv.setUint8(o + 1, Ch.Green);
    dv.setUint8(o + 2, Pattern.Solid);
    dv.setUint8(o + 3, 0);
    o += LED_RULE * (LED_MAX_RULES - 1); // skip remaining left rule slots
    dv.setUint8(o, 0); // right ruleCount

    const cfg = decodeLed(buf);
    expect(cfg.caps).toBe(0x03);
    expect(cfg.ruleMax).toBe(LED_MAX_RULES);
    expect(cfg.sides[SIDE_LEFT]).toEqual([
      { usecase: UseCase.BatteryLow, colour: Ch.Red, pattern: Pattern.BlinkSlow, param: 20 },
      { usecase: UseCase.CapsLock, colour: Ch.Green, pattern: Pattern.Solid, param: 0 },
    ]);
    expect(cfg.sides[SIDE_RIGHT]).toEqual([]);
  });

  it("masks the colour byte to CH_MASK(0x07)", () => {
    const buf = new Uint8Array(ledWireLen());
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, LED_MAGIC, true);
    dv.setUint8(2, LED_VERSION);
    dv.setUint8(4, LED_MAX_RULES);
    dv.setUint8(LED_HDR, 1); // left ruleCount
    dv.setUint8(LED_HDR + 1 + 1, 0xff); // colour byte, out-of-range bits set
    const cfg = decodeLed(buf);
    expect(cfg.sides[SIDE_LEFT][0].colour).toBe(0xff & CH_MASK);
  });

  it("throws on a bad magic, bad version, and truncated buffer", () => {
    const good = new Uint8Array(ledWireLen());
    const dv = new DataView(good.buffer);
    dv.setUint16(0, LED_MAGIC, true);
    dv.setUint8(2, LED_VERSION);

    const badMagic = good.slice();
    new DataView(badMagic.buffer).setUint16(0, 0x9999, true);
    expect(() => decodeLed(badMagic)).toThrow();

    const badVersion = good.slice();
    badVersion[2] = 9;
    expect(() => decodeLed(badVersion)).toThrow();

    expect(() => decodeLed(good.slice(0, LED_HDR - 1))).toThrow();
    expect(() => decodeLed(good.slice(0, ledWireLen() - 1))).toThrow();
  });
});

describe("encodeLed / decodeLed round-trip", () => {
  it("round-trips a config with rules on both sides", () => {
    const cfg: LedConfig = {
      caps: 0x03,
      ruleMax: LED_MAX_RULES,
      sides: [
        [
          { usecase: UseCase.LinkLost, colour: Ch.Red, pattern: Pattern.Flash, param: 0 },
          { usecase: UseCase.Modifier, colour: Ch.YellowGreen, pattern: Pattern.Double, param: 0x03 },
        ],
        [{ usecase: UseCase.ProfileChanged, colour: 0, pattern: Pattern.FlashLong, param: 0 }],
      ],
    };
    expect(decodeLed(encodeLed(cfg))).toEqual(cfg);
  });

  it("truncates a side with more than LED_MAX_RULES rules", () => {
    const tooMany = Array.from({ length: LED_MAX_RULES + 3 }, () => ({
      usecase: UseCase.None,
      colour: Ch.Red,
      pattern: Pattern.Solid,
      param: 0,
    }));
    const cfg: LedConfig = { caps: 0, ruleMax: LED_MAX_RULES, sides: [tooMany, []] };
    const decoded = decodeLed(encodeLed(cfg));
    expect(decoded.sides[SIDE_LEFT]).toHaveLength(LED_MAX_RULES);
  });
});
