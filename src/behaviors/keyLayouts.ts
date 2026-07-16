// Visual QWERTY key layouts for the clickable key picker (request #2).
//
// Every assignable key carries the HID Keyboard/Keypad usage *id* on page 0x07
// (the same page used by `&kp`). The picker turns a click into
// `hid_usage_from_page_and_id(7, usage)` while preserving any implicit
// modifiers already set on the binding.
//
// HID Keyboard/Keypad Page (0x07) ids — see the USB HID Usage Tables.

export interface KeyDef {
  /** Primary legend shown on the key. */
  label: string;
  /** Optional shifted legend, shown small in the corner. */
  sub?: string;
  /** HID usage id on page 0x07. */
  usage: number;
  /** Width in key units (1u default). */
  w?: number;
}

export type KeyLayout = KeyDef[][];

// Page 0x07 usage ids
const A = 0x04; // a..z are contiguous: A=0x04 .. Z=0x1d
const id = (letter: string) => A + (letter.charCodeAt(0) - "a".charCodeAt(0));

const N1 = 0x1e; // 1..9 contiguous, 0 = 0x27
const num = (n: number) => (n === 0 ? 0x27 : N1 + (n - 1));

const ENTER = 0x28;
const ESC = 0x29;
const BSPC = 0x2a;
const TAB = 0x2b;
const SPACE = 0x2c;
const MINUS = 0x2d;
const EQUAL = 0x2e;
const LBKT = 0x2f;
const RBKT = 0x30;
const BSLH = 0x31;
const NUHS = 0x32; // non-US hash (JIS `]`)
const SEMI = 0x33;
const QUOT = 0x34;
const GRAVE = 0x35;
const COMMA = 0x36;
const DOT = 0x37;
const SLASH = 0x38;
const CAPS = 0x39;
const F = (n: number) => 0x3a + (n - 1); // F1..F12

const INS = 0x49;
const HOME = 0x4a;
const PGUP = 0x4b;
const DEL = 0x4c;
const END = 0x4d;
const PGDN = 0x4e;
const RIGHT = 0x4f;
const LEFT = 0x50;
const DOWN = 0x51;
const UP = 0x52;

const MENU = 0x65;

// JIS international keys
const INT1 = 0x87; // ろ  \_
const INT2 = 0x88; // かな
const INT3 = 0x89; // ¥ |
const INT4 = 0x8a; // 変換
const INT5 = 0x8b; // 無変換

// Modifiers
const LCTL = 0xe0;
const LSFT = 0xe1;
const LALT = 0xe2;
const LGUI = 0xe3;
const RCTL = 0xe4;
const RALT = 0xe6;
const RGUI = 0xe7;

const letters = (s: string): KeyDef[] =>
  s.split("").map((c) => ({ label: c.toUpperCase(), usage: id(c) }));

const functionRow: KeyDef[] = [
  { label: "Esc", usage: ESC },
  ...Array.from({ length: 12 }, (_, i) => ({
    label: `F${i + 1}`,
    usage: F(i + 1),
  })),
];

const navRow: KeyDef[] = [
  { label: "Ins", usage: INS },
  { label: "Home", usage: HOME },
  { label: "PgUp", usage: PGUP },
  { label: "Del", usage: DEL },
  { label: "End", usage: END },
  { label: "PgDn", usage: PGDN },
  { label: "←", usage: LEFT },
  { label: "↑", usage: UP },
  { label: "↓", usage: DOWN },
  { label: "→", usage: RIGHT },
];

export const US_LAYOUT: KeyLayout = [
  functionRow,
  [
    { label: "`", sub: "~", usage: GRAVE },
    { label: "1", sub: "!", usage: num(1) },
    { label: "2", sub: "@", usage: num(2) },
    { label: "3", sub: "#", usage: num(3) },
    { label: "4", sub: "$", usage: num(4) },
    { label: "5", sub: "%", usage: num(5) },
    { label: "6", sub: "^", usage: num(6) },
    { label: "7", sub: "&", usage: num(7) },
    { label: "8", sub: "*", usage: num(8) },
    { label: "9", sub: "(", usage: num(9) },
    { label: "0", sub: ")", usage: num(0) },
    { label: "-", sub: "_", usage: MINUS },
    { label: "=", sub: "+", usage: EQUAL },
    { label: "Backspace", usage: BSPC, w: 2 },
  ],
  [
    { label: "Tab", usage: TAB, w: 1.5 },
    ...letters("qwertyuiop"),
    { label: "[", sub: "{", usage: LBKT },
    { label: "]", sub: "}", usage: RBKT },
    { label: "\\", sub: "|", usage: BSLH, w: 1.5 },
  ],
  [
    { label: "Caps", usage: CAPS, w: 1.75 },
    ...letters("asdfghjkl"),
    { label: ";", sub: ":", usage: SEMI },
    { label: "'", sub: '"', usage: QUOT },
    { label: "Enter", usage: ENTER, w: 2.25 },
  ],
  [
    { label: "Shift", usage: LSFT, w: 2.25 },
    ...letters("zxcvbnm"),
    { label: ",", sub: "<", usage: COMMA },
    { label: ".", sub: ">", usage: DOT },
    { label: "/", sub: "?", usage: SLASH },
    { label: "Shift", usage: 0xe5, w: 2.75 },
  ],
  [
    { label: "Ctrl", usage: LCTL, w: 1.25 },
    { label: "GUI", usage: LGUI, w: 1.25 },
    { label: "Alt", usage: LALT, w: 1.25 },
    { label: "Space", usage: SPACE, w: 6.25 },
    { label: "Alt", usage: RALT, w: 1.25 },
    { label: "GUI", usage: RGUI, w: 1.25 },
    { label: "Menu", usage: MENU, w: 1.25 },
    { label: "Ctrl", usage: RCTL, w: 1.25 },
  ],
  navRow,
];

export const JIS_LAYOUT: KeyLayout = [
  functionRow,
  [
    { label: "半/全", usage: GRAVE },
    { label: "1", sub: "!", usage: num(1) },
    { label: "2", sub: '"', usage: num(2) },
    { label: "3", sub: "#", usage: num(3) },
    { label: "4", sub: "$", usage: num(4) },
    { label: "5", sub: "%", usage: num(5) },
    { label: "6", sub: "&", usage: num(6) },
    { label: "7", sub: "'", usage: num(7) },
    { label: "8", sub: "(", usage: num(8) },
    { label: "9", sub: ")", usage: num(9) },
    { label: "0", usage: num(0) },
    { label: "-", sub: "=", usage: MINUS },
    { label: "^", sub: "~", usage: EQUAL },
    { label: "¥", sub: "|", usage: INT3 },
    { label: "BS", usage: BSPC },
  ],
  [
    { label: "Tab", usage: TAB, w: 1.5 },
    ...letters("qwertyuiop"),
    { label: "@", sub: "`", usage: LBKT },
    { label: "[", sub: "{", usage: RBKT },
    { label: "Enter", usage: ENTER, w: 1.5 },
  ],
  [
    { label: "Caps", usage: CAPS, w: 1.75 },
    ...letters("asdfghjkl"),
    { label: ";", sub: "+", usage: SEMI },
    { label: ":", sub: "*", usage: QUOT },
    { label: "]", sub: "}", usage: NUHS },
  ],
  [
    { label: "Shift", usage: LSFT, w: 2.25 },
    ...letters("zxcvbnm"),
    { label: ",", sub: "<", usage: COMMA },
    { label: ".", sub: ">", usage: DOT },
    { label: "/", sub: "?", usage: SLASH },
    { label: "\\", sub: "ろ", usage: INT1 },
    { label: "Shift", usage: 0xe5, w: 1.75 },
  ],
  [
    { label: "Ctrl", usage: LCTL, w: 1.25 },
    { label: "GUI", usage: LGUI, w: 1.25 },
    { label: "Alt", usage: LALT },
    { label: "無変換", usage: INT5 },
    { label: "Space", usage: SPACE, w: 4 },
    { label: "変換", usage: INT4 },
    { label: "かな", usage: INT2 },
    { label: "Alt", usage: RALT },
    { label: "GUI", usage: RGUI, w: 1.25 },
    { label: "Menu", usage: MENU },
    { label: "Ctrl", usage: RCTL, w: 1.25 },
  ],
  navRow,
];
