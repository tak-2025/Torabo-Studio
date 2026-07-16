/* eslint-disable */
/**
 * One-shot generator: parse ZMK's dt-bindings headers and emit a
 * { "<usageNumber>": "ZMK_NAME" } map to src/zmk-keynames.json, used by the
 * keymap.keymap exporter to print readable `&kp EQUAL` instead of `&kp 458798`.
 *
 * Re-run if ZMK's keys change:
 *   node scripts/gen-zmk-keynames.cjs [path-to-zmk/app/include/dt-bindings/zmk]
 */
const fs = require("fs");
const path = require("path");

const ZMK_DIR =
  process.argv[2] ||
  path.resolve(
    __dirname,
    "../../zmk-feature-trackball-config/.zmk-workspace/zmk/app/include/dt-bindings/zmk"
  );

const read = (f) => fs.readFileSync(path.join(ZMK_DIR, f), "utf8");

// --- page constants: HID_USAGE_KEY (0x07) etc. ---
const pages = {};
for (const m of read("hid_usage_pages.h").matchAll(
  /^#define\s+(HID_USAGE_[A-Z0-9_]+)\s+\(?(0x[0-9a-fA-F]+|\d+)\)?/gm
)) {
  pages[m[1]] = parseInt(m[2]);
}

// --- id constants: HID_USAGE_KEY_KEYBOARD_A (0x04) etc. ---
const ids = {};
for (const m of read("hid_usage.h").matchAll(
  /^#define\s+(HID_USAGE_[A-Z0-9_]+)\s+\(?(0x[0-9a-fA-F]+|\d+)\)?/gm
)) {
  ids[m[1]] = parseInt(m[2]);
}

// --- keys.h: NAME -> usage, resolving ZMK_HID_USAGE(page,id) and aliases ---
const keysSrc = read("keys.h");
const direct = {}; // NAME -> number
const alias = {}; // NAME -> referenced NAME
for (const line of keysSrc.split("\n")) {
  if (/DEPRECATED/i.test(line)) continue; // skip deprecated aliases
  // function-like macros (LC(keycode) ...) have "(" right after the name -> skip
  let m = line.match(
    /^#define\s+([A-Z][A-Z0-9_]*)\s+\(\s*ZMK_HID_USAGE\s*\(\s*([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)\s*\)\s*\)/
  );
  if (m) {
    const page = pages[m[2]];
    const id = ids[m[3]];
    if (page !== undefined && id !== undefined) direct[m[1]] = (page << 16) | id;
    continue;
  }
  m = line.match(/^#define\s+([A-Z][A-Z0-9_]*)\s+\(\s*([A-Z][A-Z0-9_]*)\s*\)/);
  if (m && m[1] !== m[2]) alias[m[1]] = m[2];
}

// resolve aliases (a few passes is plenty for the shallow chains in keys.h)
for (let pass = 0; pass < 5; pass++) {
  for (const [name, ref] of Object.entries(alias)) {
    if (direct[name] === undefined && direct[ref] !== undefined) {
      direct[name] = direct[ref];
    }
  }
}

// usage -> best (shortest, then lexically first) name
const byUsage = {};
for (const [name, usage] of Object.entries(direct)) {
  const cur = byUsage[usage];
  if (
    cur === undefined ||
    name.length < cur.length ||
    (name.length === cur.length && name < cur)
  ) {
    byUsage[usage] = name;
  }
}

const outPath = path.resolve(__dirname, "../src/zmk-keynames.json");
fs.writeFileSync(outPath, JSON.stringify(byUsage, null, 0) + "\n");
console.log(
  `Wrote ${Object.keys(byUsage).length} usage->name entries to ${outPath}`
);

// Reverse map: every NAME (incl. aliases like LEFT_ALT) -> usage number.
// Used by the macro importer to resolve `&kp <NAME>` from keymap.keymap.
const sortedNames = Object.keys(direct).sort();
const nameToUsage = {};
for (const name of sortedNames) nameToUsage[name] = direct[name];
const revPath = path.resolve(__dirname, "../src/zmk-keycodes.json");
fs.writeFileSync(revPath, JSON.stringify(nameToUsage, null, 0) + "\n");
console.log(`Wrote ${sortedNames.length} name->usage entries to ${revPath}`);
