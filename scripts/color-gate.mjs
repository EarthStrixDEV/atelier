/**
 * T16 — Grep gate (F6)  ·  แพร (Prae) — QA Lead
 *
 * พิสูจน์ว่างานกวาดสี (T9–T15) กวาดหมดจริง ด้วยคำสั่งที่ **รันซ้ำได้**
 *   node scripts/color-gate.mjs
 * exit 0 = PASS, exit 1 = FAIL (พร้อมไฟล์+บรรทัดที่ยังเหลือ)
 *
 * ทำไมต้องมีไฟล์นี้: `npm run build` (tsc + vite) **จับสี hardcode ไม่ได้เลย** — `bg-white`
 * เป็น class ที่ถูกต้องตาม Tailwind, `#0a0a0a` ก็เป็น CSS ที่ถูกต้อง build จึงผ่านทั้งที่ธีมพัง
 * (gapAnalysis G4) gate นี้คือกลไกเดียวที่จับได้
 *
 * หลักการของ allowlist: **exclude ด้วยการระบุจุดที่ชัดเจน ไม่ใช่ exclude กว้างๆ**
 * ทุกข้อยกเว้นด้านล่างมีเงื่อนไขที่แคบพอที่ของจริงจะยังหลุดออกมาให้เห็น — เช่น box-shadow
 * ยกเว้นเฉพาะ pattern `shadow-[...rgba(0,0,0,.NN)]` ไม่ใช่ยกเว้นทั้งบรรทัดที่มีคำว่า shadow
 * (ถ้ายกเว้นทั้งบรรทัด `bg-[#0a0a0a] shadow-[...]` จะรอดไปทั้งที่ต้องแก้)
 *
 * ที่มาของ allowlist: .claude/state/color-mapping.md §3 (T2 · นุ่น)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const p = (...s) => join(ROOT, ...s);
const rel = f => relative(ROOT, f).split(sep).join("/");

/** เดินไฟล์แบบ recursive — ไม่พึ่ง shell glob เพื่อให้รันได้เหมือนกันทั้ง PowerShell/bash/CI */
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some(e => name.endsWith(e))) out.push(full);
  }
  return out;
}

/** คืน [{file, line, text}] ของบรรทัดที่ match re และไม่โดน allow() ยกเว้น */
function scan(files, re, allow = () => false) {
  const hits = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((text, i) => {
      re.lastIndex = 0;
      if (!re.test(text)) return;
      if (allow(text, i + 1, rel(f))) return;
      hits.push({ file: rel(f), line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

const UI = [p("src", "components"), p("src", "pages")].flatMap(d => walk(d, [".tsx", ".ts"]));
const SRC_ALL = walk(p("src"), [".tsx", ".ts", ".css"]);

const results = [];
const record = (name, cmd, hits, note) =>
  results.push({ name, cmd, count: hits.length, pass: hits.length === 0, hits, note });

/* ─────────────── AC1 · Tailwind white/black utilities ─────────────── */
record(
  "AC1 white/black utility",
  String.raw`grep -rEn '\b(text|bg|border|from|to|via|ring|fill|stroke|divide|placeholder)-(white|black)(/[0-9]{1,3})?\b' src/components src/pages`,
  scan(
    UI,
    /\b(?:text|bg|border|from|to|via|ring|fill|stroke|divide|placeholder)-(?:white|black)(?:\/[0-9]{1,3})?\b/,
  ),
);

/* ─────────────── AC2 · Tailwind palette scale ─────────────── */
const PALETTE =
  "red|green|blue|amber|emerald|yellow|orange|sky|rose|slate|zinc|neutral|stone|gray|indigo|violet|purple|teal|cyan|lime|fuchsia|pink";
record(
  "AC2 tailwind palette scale",
  String.raw`grep -rEn '\b(text|bg|border|from|to|via|ring|fill|stroke)-(${PALETTE})-[0-9]{2,3}\b' src/`,
  scan(
    SRC_ALL,
    new RegExp(String.raw`\b(?:text|bg|border|from|to|via|ring|fill|stroke)-(?:${PALETTE})-[0-9]{2,3}\b`),
    // ยกเว้นเฉพาะ "ชื่อ class ที่ถูกอ้างถึงในคอมเมนต์/สตริงเอกสาร" ไม่ใช่ class ที่ render จริง
    // แคบไว้ที่บรรทัดคอมเมนต์เท่านั้น — ถ้ามี class จริงใน JSX จะไม่เข้าเงื่อนไขนี้
    text => /^\s*(\*|\/\/|\/\*)/.test(text),
  ),
  "1 บรรทัดใน src/lib/types.ts:809 เป็นการอ้างชื่อ class ในคอมเมนต์อธิบาย token success ไม่ใช่ class ที่ render",
);

/* ─────────────── AC3 · hex / rgba ใน UI ─────────────── */
/**
 * allowlist ข้อเดียวของด่านนี้: **box-shadow rgba ดำล้วน** (color-mapping.md §3.1)
 * เงาดำโปร่งใสทำงานถูกในทุกธีม จึงไม่ต้องแปลงเป็น token
 *
 * วิธียกเว้นที่แคบโดยตั้งใจ: ลบเฉพาะ substring `shadow-[...rgba(0,0,0,.NN)]` ออกจากบรรทัด
 * **แล้วค่อยตรวจส่วนที่เหลือ** — บรรทัดที่มีทั้งเงาและสีจริง (เช่น `bg-[#0a0a0a] shadow-[...]`)
 * จะยังถูกจับได้ ต่างจากการยกเว้นทั้งบรรทัดซึ่งจะซ่อนของจริง
 */
const SHADOW_RGBA = /shadow-\[[^\]]*?rgba\(0,\s*0,\s*0,\s*\.?[0-9]+\)[^\]]*\]/g;
const HEX_OR_RGBA = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
const hexHits = [];
const shadowResidue = [];
for (const f of UI) {
  readFileSync(f, "utf8").split(/\r?\n/).forEach((text, i) => {
    if (!HEX_OR_RGBA.test(text)) return;
    const stripped = text.replace(SHADOW_RGBA, "");
    const entry = { file: rel(f), line: i + 1, text: text.trim() };
    if (HEX_OR_RGBA.test(stripped)) hexHits.push(entry);
    else shadowResidue.push(entry);
  });
}
record(
  "AC3 hex/rgba นอก allowlist",
  String.raw`grep -rEn '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components src/pages  # ลบ shadow-[..rgba(0,0,0,.n)] ออกก่อน`,
  hexHits,
  `expected residue (box-shadow rgba) = ${shadowResidue.length} บรรทัด — list ท้ายรายงาน`,
);

/* ─────────────── AC4 · invert ที่ไม่ได้ผูกกับ --logo-invert ─────────────── */
record(
  "AC4 invert นอก var(--logo-invert)",
  String.raw`grep -rn 'invert' src/components src/pages | grep -v 'var(--logo-invert)'`,
  scan(
    UI,
    /invert/,
    // ยกเว้น 2 อย่างเท่านั้น: (ก) บรรทัดที่ผูกกับ var(--logo-invert) จริง
    // (ข) บรรทัดคอมเมนต์ที่พูดถึงคำว่า invert — ไม่ใช่ utility `invert` ที่ render
    // `invisible` ไม่ match เพราะ regex คือ /invert/ ตรงๆ
    text => text.includes("var(--logo-invert)") || /^\s*(\*|\/\/|\/\*|\{\/\*)/.test(text),
  ),
  "Header.tsx:443 เป็นคอมเมนต์อธิบายเหตุผลของ --logo-invert ที่ L450 ไม่ใช่ class",
);

/* ─────────────── AC5 · hex ใน index.css ต้องอยู่แต่ใน @theme / [data-theme] ─────────────── */
{
  const css = readFileSync(p("src", "index.css"), "utf8").split(/\r?\n/);
  // หาช่วงบรรทัดของ block ที่ "อนุญาตให้มี hex ได้" = @theme + [data-theme=...] — นับวงเล็บปีกกาจริง
  const allowedRanges = [];
  for (let i = 0; i < css.length; i++) {
    if (!/^\s*(@theme|\[data-theme=)/.test(css[i])) continue;
    let depth = 0, j = i;
    do {
      depth += (css[j].match(/\{/g) || []).length - (css[j].match(/\}/g) || []).length;
      j++;
    } while (depth > 0 && j < css.length);
    allowedRanges.push([i + 1, j]);
    i = j - 1;
  }
  const inAllowed = ln => allowedRanges.some(([a, b]) => ln >= a && ln <= b);
  const stray = [];
  css.forEach((text, i) => {
    if (HEX_OR_RGBA.test(text) && !inAllowed(i + 1)) stray.push({ file: "src/index.css", line: i + 1, text: text.trim() });
  });
  record(
    "AC5 hex ใน index.css นอก @theme/[data-theme]",
    "node scripts/color-gate.mjs  # parse block ranges แล้วตรวจนอกช่วง",
    stray,
    `allowed block: ${allowedRanges.map(([a, b]) => `${a}-${b}`).join(", ")}`,
  );
}

/* ─────────────── EXTRA · drift check themes.ts ↔ index.css ─────────────── */
/**
 * ค่าสีถูกเขียนไว้ **สองที่โดยตั้งใจ** (themes.ts comment L10-13): TS ใช้กับ picker swatch,
 * CSS ต้องเป็น CSS จริงเพราะ Tailwind gen utility จาก custom property ไม่ใช่จาก object
 * ผลข้างเคียงคือ **ถ้าใครแก้ที่เดียวจะ drift เงียบๆ** — tsc จับไม่ได้ ตาก็จับไม่ได้
 * check นี้เทียบทีละ token ทีละธีม (6 ธีม × 18 token = 108 คู่ + 30 คู่ invariant ที่ต้องเท่ากันข้ามธีม)
 */
{
  const ts = readFileSync(p("src", "lib", "themes.ts"), "utf8");
  const css = readFileSync(p("src", "index.css"), "utf8");

  // CSS_VAR_BY_TOKEN: camelCase field -> --color-*  (อ่านจากไฟล์จริง ไม่ hardcode ซ้ำ)
  const mapBody = ts.match(/CSS_VAR_BY_TOKEN[^{]*\{([\s\S]*?)\n\};/)[1];
  const varByToken = Object.fromEntries([...mapBody.matchAll(/^\s*(\w+):\s*"(--color-[\w-]+)"/gm)].map(m => [m[1], m[2]]));

  // ON_MEDIA (spread เข้าทุกธีม) + palette แต่ละธีม
  const grabObj = name => {
    const m = ts.match(new RegExp(String.raw`\b${name}(?::\s*ThemeTokens)?\s*=\s*\{([\s\S]*?)\n\}`));
    return m ? Object.fromEntries([...m[1].matchAll(/^\s*(\w+):\s*"([^"]+)"/gm)].map(x => [x[1], x[2]])) : null;
  };
  const onMedia = grabObj("ON_MEDIA");
  const THEME_IDS = ["paper", "ink", "contrast", "sepia", "midnight", "nocturne"];

  /**
   * `@theme` = ค่าฐานที่ทุก block สืบทอด — block `[data-theme]` override **เฉพาะตัวที่ต่างจาก paper**
   * โดยตั้งใจ (index.css:31, :66) จึงต้อง resolve แบบ cascade จริง: หาใน block ก่อน ไม่เจอค่อยตกมาที่
   * @theme ถ้าเทียบเฉพาะ block จะ false-positive ที่ media-scrim/on-media/on-media-dim ทั้ง 6 ธีม
   * (สามตัวนี้ theme-invariant จึงไม่มีใน block ไหนเลย — และนั่นคือสิ่งที่ถูกต้อง)
   */
  const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/)[1];
  const baseVars = Object.fromEntries(
    [...themeBlock.matchAll(/^\s*(--color-[\w-]+):\s*([^;]+);/gm)].map(x => [x[1], x[2].trim()]),
  );

  const drift = [];
  let compared = 0;
  let inherited = 0;
  for (const id of THEME_IDS) {
    const tsTokens = { ...grabObj(id), ...onMedia };
    const blockRe = new RegExp(String.raw`\[data-theme="${id}"\]\s*\{([\s\S]*?)\n\}`);
    const blockMatch = css.match(blockRe);
    if (!blockMatch) { drift.push({ file: "src/index.css", line: 0, text: `ไม่พบ block [data-theme="${id}"]` }); continue; }
    const cssVars = Object.fromEntries([...blockMatch[1].matchAll(/^\s*(--color-[\w-]+):\s*([^;]+);/gm)].map(x => [x[1], x[2].trim()]));
    const cssStart = css.slice(0, blockMatch.index).split("\n").length;

    for (const [field, cssVar] of Object.entries(varByToken)) {
      const tsVal = tsTokens[field];
      const overridden = cssVar in cssVars;
      const cssVal = overridden ? cssVars[cssVar] : baseVars[cssVar];
      compared++;
      if (!overridden) inherited++;
      const norm = v => (v ?? "").toLowerCase().replace(/\s+/g, "");
      if (norm(tsVal) !== norm(cssVal)) {
        drift.push({
          file: "themes.ts ↔ index.css",
          line: cssStart,
          text: `[${id}] ${field} / ${cssVar}: ts="${tsVal ?? "MISSING"}" css="${cssVal ?? "MISSING"}"`,
        });
      }
    }
  }
  record(
    "EXTRA drift themes.ts ↔ index.css",
    "node scripts/color-gate.mjs  # เทียบ CSS_VAR_BY_TOKEN × 6 ธีม",
    drift,
    `เทียบทั้งหมด ${compared} คู่ · ตรงกัน ${compared - drift.length}/${compared} (ในนั้น ${inherited} คู่สืบทอดจาก @theme เพราะ block ไม่ override)`,
  );
}

/* ─────────────── รายงาน ─────────────── */
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - String(s).length));
console.log("\n" + pad("CHECK", 42) + pad("FOUND", 7) + "RESULT");
console.log("-".repeat(60));
for (const r of results) console.log(pad(r.name, 42) + pad(r.count, 7) + (r.pass ? "PASS" : "FAIL"));
console.log("-".repeat(60));

for (const r of results) {
  if (r.note) console.log(`  note ${r.name}: ${r.note}`);
  if (r.pass) continue;
  console.log(`\n  FAIL ${r.name}\n  cmd: ${r.cmd}`);
  for (const h of r.hits) console.log(`    ${h.file}:${h.line}  ${h.text.slice(0, 160)}`);
}

console.log(`\nexpected residue — box-shadow rgba (allowlist §3.1): ${shadowResidue.length} บรรทัด`);
for (const h of shadowResidue) console.log(`  ${h.file}:${h.line}`);

const failed = results.filter(r => !r.pass);
console.log("\n" + (failed.length ? `GATE FAIL — ${failed.length} check ไม่ผ่าน` : "GATE PASS — ทุก check ผ่าน"));
process.exit(failed.length ? 1 : 0);
