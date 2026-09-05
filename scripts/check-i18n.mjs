/**
 * Checks the i18n dictionaries for the three ways a translation quietly rots:
 *
 *   1. a key present in one language but not the other (falls back to English,
 *      or to the raw key, with no warning at runtime)
 *   2. a key defined in two different panel files (one silently shadows the
 *      other once they are merged)
 *   3. an "English" value that still contains Japanese
 *
 * It also lists keys that are never referenced from source, and `t("…")` calls
 * whose key exists in no dictionary. Both of those are heuristics — a key built
 * at runtime (`t(rule.labelKey)`) cannot be seen here — so they are reported
 * separately as hints rather than failures.
 *
 * Run: npm run check:i18n
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const JP = /[぀-ヿ㐀-鿿]/;

/** Pull `const <name>: Dict = { … };` out of a TS module by brace matching. */
function block(text, declaration) {
  const start = text.indexOf(declaration);
  if (start < 0) return null;
  let depth = 0;
  for (let i = text.indexOf("{", start); i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Keys at the top level of a dictionary block. */
function keysOf(source) {
  return [...source.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]);
}

/** Values, for the "still Japanese" check. Only single-line entries. */
function entriesOf(source) {
  return [...source.matchAll(/^ {2}"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?$/gm)].map(
    (m) => [m[1], m[2]]
  );
}

function readDict(path, exportName) {
  const text = readFileSync(path, "utf8");
  for (const decl of [
    `const ${exportName}: Dict = {`,
    `export const ${exportName}: Dict = {`,
  ]) {
    const found = block(text, decl);
    if (found) return found;
  }
  return null;
}

const files = [
  { path: join(SRC, "i18n", "messages.ts"), area: "messages" },
  ...readdirSync(join(SRC, "i18n", "panels"))
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => ({ path: join(SRC, "i18n", "panels", f), area: f.slice(0, -3) })),
  // The platform seam's dictionary (see src/platform/messages.ts's header
  // comment). Empty on Studio's own main; a derivative target's protected
  // override fills it in, so this still needs checking there too.
  { path: join(SRC, "platform", "messages.ts"), area: "platform/messages" },
];

const problems = [];
const owner = new Map(); // key -> area, for the shadowing check
const allKeys = new Set();

for (const { path, area } of files) {
  const ja = readDict(path, "ja");
  const en = readDict(path, "en");
  if (!ja || !en) {
    problems.push(`${area}: could not find both a ja and an en dictionary`);
    continue;
  }

  const kja = new Set(keysOf(ja));
  const ken = new Set(keysOf(en));

  for (const k of kja) {
    if (!ken.has(k)) problems.push(`${area}: "${k}" has no English`);
    if (owner.has(k) && owner.get(k) !== area) {
      problems.push(`${area}: "${k}" is also defined in ${owner.get(k)}`);
    }
    owner.set(k, area);
    allKeys.add(k);
  }
  for (const k of ken) {
    if (!kja.has(k)) problems.push(`${area}: "${k}" has no Japanese`);
    allKeys.add(k);
  }

  for (const [k, v] of entriesOf(en)) {
    if (JP.test(v)) problems.push(`${area}: "${k}" is still Japanese in en`);
  }
}

// --- heuristics -------------------------------------------------------------

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(entry.name) && !p.includes(`${join("src", "i18n")}`)) {
      out.push(p);
    }
  }
  return out;
}

const referenced = new Set();
for (const p of sources(SRC)) {
  const text = readFileSync(p, "utf8");
  for (const m of text.matchAll(/\b(?:t|tr)\(\s*"([^"]+)"/g)) referenced.add(m[1]);
  // Keys held as data: `labelKey: "led.color.red"`.
  for (const m of text.matchAll(/(?:label|note|title)Key:\s*"([^"]+)"/g)) {
    referenced.add(m[1]);
  }
}

const unknown = [...referenced].filter((k) => !allKeys.has(k));
const unused = [...allKeys].filter((k) => !referenced.has(k));

console.log(`${allKeys.size} keys across ${files.length} dictionaries`);

if (unknown.length) {
  console.log(`\n${unknown.length} key(s) used in source but not defined:`);
  for (const k of unknown.sort()) console.log(`  ${k}`);
}
if (unused.length) {
  console.log(
    `\n${unused.length} key(s) defined but not referenced by a literal ` +
      `(may be built at runtime):`
  );
  for (const k of unused.sort()) console.log(`  ${k}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.sort()) console.error(`  ${p}`);
  process.exit(1);
}
console.log("\ni18n OK");
