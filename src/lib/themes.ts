import type {
  ResolvedThemeId,
  ThemeDefinition,
  ThemeId,
  ThemeMeta,
  ThemeTokens,
} from "./types";

/* ══════════════════════════ Theme palettes (F1 · T3 palette values) ══════════════════════════
 *
 * ไฟล์นี้คือ **source of truth ของค่าสี** ส่วน shape ของมันอยู่ที่ types.ts (T1) และ mirror
 * ฝั่ง CSS อยู่ที่ index.css (T4) — ค่าที่นี่กับ block `[data-theme=...]` ใน index.css ต้องตรงกัน
 * เขียนสองที่โดยตั้งใจ: TS ใช้กับ picker UI (swatch อ่านค่าจริงจากที่นี่ ไม่ก๊อปสีซ้ำ) ส่วน CSS
 * ต้องเป็น CSS จริงเพราะ Tailwind gen utility จาก custom property ไม่ใช่จาก object ใน TS
 *
 * ── contrast budget ── (decisions.f layer 3)
 * ทุกคู่ด้านล่างวัดจริงด้วยสูตร WCAG 2.x relative luminance ไม่ใช่กะจากสายตา สีที่มี alpha
 * ถูก composite ลงบน bg ของธีมนั้นก่อนวัด (ไม่งั้นวัด rgba ตรงๆ จะได้ตัวเลขที่ไม่มีความหมาย)
 * เกณฑ์: text/bg ≥ 7, textDim/bg ≥ 4.5, textFaint/bg ≥ 3, accentInk/accent ≥ 4.5,
 * onMedia/mediaScrim ≥ 4.5 — ธีม `contrast` ยกทุกคู่ขึ้นหนึ่งขั้น (text/bg ≥ 15, textFaint/bg ≥ 4.5)
 *
 * ── ข้อยกเว้นที่รู้ตัวและตั้งใจปล่อย: ธีม paper 3 คู่ไม่ผ่านเกณฑ์ ──
 * paper ถูกล็อกให้ **byte-identical กับ index.css:5-15 เดิม** (decisions.e / R7) เพราะเป็น
 * migration target ของผู้ใช้เดิมที่ต้องเห็นแอปเหมือนเดิมทุก pixel ค่าที่วัดได้จริงคือ
 *   textFaint/bg     2.92  (เกณฑ์ 3)    — พลาดหวุดหวิด
 *   accent/bg        2.54  (เกณฑ์ 3)
 *   accentInk/accent 2.54  (เกณฑ์ 4.5)  — ขาวบนมิ้นท์ #10b981 อ่านยากจริง
 * สามคู่นี้เป็น**หนี้ที่มีอยู่แล้วในแอปปัจจุบัน ไม่ใช่ของใหม่ที่สปรินต์นี้สร้าง** — การ "แก้" ให้ผ่าน
 * คือการเปลี่ยนสีแอปของผู้ใช้เดิมโดยไม่ได้ขอ ซึ่งขัด AC ข้อที่แรงกว่าและขัด R7 โดยตรง
 * ธีมที่เหลือทั้ง 5 ตัวผ่านครบทุกคู่ ใครจะแก้หนี้ก้อนนี้ต้องเป็น decision แยกที่พี่เอิร์ธเคาะเอง
 * ไม่ใช่ผลข้างเคียงของงานเพิ่มธีม
 */

/**
 * สามตัวนี้ **theme-invariant — ค่าเท่ากันทุกธีมทั้ง 6** (ดู types.ts `ThemeTokens` block comment)
 *
 * ประกาศเป็น object เดียวแล้ว spread เข้าไปทุกธีม แทนที่จะพิมพ์ค่าซ้ำ 6 รอบ เพราะ "เท่ากันทุกธีม"
 * เป็น **ข้อบังคับ ไม่ใช่เรื่องบังเอิญ** — ถ้าพิมพ์ซ้ำ วันหนึ่งจะมีคนแก้ธีมเดียวแล้วอีก 5 ธีมไม่ตาม
 * แล้วไม่มีอะไรจับได้เลย (build ไม่รู้จักความหมายของสี) การ spread ทำให้แก้ผิดที่เดียวไม่ได้
 *
 * เหตุผลที่ต้อง invariant (gapAnalysis G2): สามตัวนี้ไม่ได้อยู่บน surface ของแอป แต่อยู่บน
 * **ภาพของผู้ใช้** ซึ่งเป็นสีอะไรก็ได้ ไม่เกี่ยวกับธีมที่เลือก — badge บนภาพและตัวหนังสือใน
 * full-screen viewer ต้องอ่านออกเสมอ ถ้าปล่อยให้ตามธีม ธีม light จะได้ตัวหนังสือสีเข้ม
 * บน scrim สีเข้ม = หายไปทั้งชั้น
 */
const ON_MEDIA = {
  /**
   * พื้น full-screen viewer — ดำ 94% ไม่ใช่ดำทึบ เพื่อให้ยังเห็นเค้าโครงพื้นหลังจางๆ ว่ายังอยู่ในแอป
   * ค่าเดิมของโค้ดคือ `rgba(5,5,5,.94)` ขยับเป็น 8 ให้ตรงกับ scrim ตัวอื่นในกลุ่มเดียวกัน
   */
  mediaScrim: "rgba(8, 8, 8, 0.94)",
  /** ขาวเต็มเสมอ — บนภาพที่เป็นสีอะไรก็ได้ ขาวคือค่าที่ปลอดภัยที่สุดเมื่อคู่กับ scrim/shadow */
  onMedia: "#ffffff",
  /**
   * ชั้นรองบนสื่อ — ขาว 72% ไม่ใช่สีเทาทึบ เพราะต้องวางทับภาพที่สีคาดเดาไม่ได้
   * alpha ทำให้มันจางลงโดย**ยังคงเป็นสีอ่อนกว่าพื้นหลังเสมอ** ส่วนเทาทึบจะกลายเป็นเข้มกว่าภาพ
   * เมื่อไปอยู่บนภาพสว่าง แล้วอ่านไม่ออกทันที
   */
  onMediaDim: "rgba(255, 255, 255, 0.72)",
} as const satisfies Pick<ThemeTokens, "mediaScrim" | "onMedia" | "onMediaDim">;

/**
 * Paper — light, default, baseline ของ migration
 *
 * **ห้ามแก้ค่าใดๆ ในธีมนี้** ทุกตัวเท่ากับ index.css:5-15 เดิมแบบ byte-identical
 * ผู้ใช้เดิมที่ยังไม่เคยมีคีย์ธีมจะได้ธีมนี้ ต้องเห็นแอปเหมือนเดิมเป๊ะ ไม่ใช่ "ใกล้เคียง"
 *
 * contrast ที่วัดได้จริง:
 *   text/bg 19.80 · textDim/bg 6.16 · textFaint/bg 2.92✗ · accentInk/accent 2.54✗
 *   onMedia/mediaScrim 17.96 · borderStrong เหนือ overlay 2.27
 * (✗ = หนี้เดิมที่ล็อกไว้ ดูหัวไฟล์)
 */
const paper: ThemeTokens = {
  bg: "#ffffff",
  surface: "#f7f8f7",
  surface2: "#eef1ef",
  borderColor: "#e0e3e1",
  borderStrong: "#c7cbc8",
  text: "#0a0a0a",
  textDim: "#5c6360",
  textFaint: "#93998f",
  accent: "#10b981",
  accentInk: "#ffffff",
  danger: "#dc2626",

  /* สามตัวนี้เป็นของใหม่ ไม่มีใน index.css เดิม จึงเลือกได้อิสระ — เลือกโทนเข้มพอที่จะอ่านออก
   * บนพื้นขาว (success 3.77, warning 5.02, info 5.93) ไม่ใช่สีสดที่จางหายบนพื้นสว่าง */
  success: "#059669",
  warning: "#b45309",
  info: "#0369a1",

  /** ดำ 50% = ค่าเดิมของ `bg-black/50` ที่ทั้ง 6 modal ใช้อยู่ ธีม light ไม่ต้องเข้มกว่านี้ */
  overlay: "rgba(10, 10, 10, 0.50)",

  ...ON_MEDIA,
};

/**
 * Ink — dark, คู่ตรงข้ามของ Paper (ธีมมืดหลักตาม requirement)
 *
 * พื้นดำหมึกอมเขียวจางๆ ให้เข้าชุดกับ accent มิ้นท์ ไม่ใช่ดำเทากลางๆ
 * `text` เป็น `#ededed` ไม่ใช่ `#ffffff` เต็ม โดยตั้งใจ — ขาวเต็มบนพื้นดำสนิททำให้เกิด halation
 * (ตัวหนังสือเรืองแสงฟุ้ง) ที่ทำให้อ่านนานๆ แล้วล้าตา ลดลงนิดเดียวยังได้ 16.74:1 ซึ่งเกินเกณฑ์เยอะ
 * `accent` ขยับจากมิ้นท์เดิม #10b981 เป็น #34d399 ที่สว่างขึ้น เพราะมิ้นท์เดิมบนพื้นดำได้แค่ 5.4:1
 * ส่วน `accentInk` เป็นเขียวเข้มเกือบดำ ไม่ใช่ขาว — ขาวบนมิ้นท์สว่างอ่านไม่ออก (นี่คือจุดที่ paper พลาด)
 *
 * contrast: text/bg 16.74 · textDim/bg 8.17 · textFaint/bg 4.65 · accentInk/accent 8.67
 *           onMedia/mediaScrim 20.00 · borderStrong เหนือ overlay 2.01
 */
const ink: ThemeTokens = {
  bg: "#0b0c0b",
  surface: "#141614",
  surface2: "#1d201d",
  borderColor: "#2a2e2b",
  borderStrong: "#3d423e",
  text: "#ededed",
  textDim: "#a2a9a5",
  textFaint: "#767d79",
  accent: "#34d399",
  accentInk: "#04231a",
  danger: "#f87171",
  success: "#34d399",
  warning: "#fbbf24",
  info: "#60a5fa",

  /**
   * ดำ 72% ไม่ใช่ 50% — ธีมมืดคือเคสที่ `bg-black/50` เดิมพังเงียบๆ (gapAnalysis G3):
   * ดำครึ่งหนึ่งบนพื้นที่ดำอยู่แล้วแทบไม่ทำให้อะไรเปลี่ยน modal จึงลอยอยู่บนพื้นที่ยังสว่างเท่าเดิม
   *
   * ข้อจำกัดที่ต้องรู้: **บนธีมมืด scrim ไม่ใช่ตัวที่แยก modal ออกจากพื้นหลัง** ไม่ว่าใส่ alpha
   * เท่าไหร่ ratio ระหว่าง surface กับพื้นที่ถูก scrim ก็ตันอยู่ราว 1.15 (วัดแล้ว) เพราะดำบนดำ
   * ไม่มีทางสร้าง luminance separation ได้ ตัวที่ทำหน้าที่นั้นจริงคือ `borderStrong` ของ modal
   * ซึ่งวัดได้ 2.01 เหนือพื้นที่ถูก scrim — QA (T17) จึงต้องดูว่า **ขอบ** modal เห็นชัด ไม่ใช่ดูว่าฉากหลังมืดพอ
   */
  overlay: "rgba(0, 0, 0, 0.72)",

  ...ON_MEDIA,
};

/**
 * High Contrast — accessible (ธีมบังคับตาม requirement)
 *
 * ธีมนี้ไม่ใช่ "ink ที่เข้มขึ้น" แต่คือธีมที่**ยกเกณฑ์ทุกคู่ขึ้นหนึ่งขั้น**: text/bg ≥ 15 (ไม่ใช่ 7)
 * และ textFaint/bg ≥ 4.5 (ไม่ใช่ 3) — ผลคือ `textFaint` ในธีมนี้ต้องไม่ faint จริง (วัดได้ 10.59)
 * ถ้าปล่อยให้จางตามชื่อ ธีมนี้จะเหลือแค่ชื่อ
 *
 * พื้นดำสนิท ตัวหนังสือขาวสนิท (ยอมรับ halation แลกกับ 21:1 ซึ่งเป็นค่าสูงสุดที่เป็นไปได้)
 * `borderColor` เป็นเทากลาง #6b6b6b ไม่ใช่เทาเข้ม — ธีมนี้ต้องเห็น**เส้นขอบทุกเส้น** ไม่ใช่แค่ตัวหนังสือ
 * accent เหลืองสด ให้ 16.57:1 กับพื้นดำ (เกณฑ์ที่ paletteDesign ขอคือ ≥ 12)
 *
 * contrast: text/bg 21.00 · textDim/bg 15.91 · textFaint/bg 10.59 · accentInk/accent 16.57
 *           onMedia/mediaScrim 20.08 · borderStrong เหนือ overlay 8.33
 */
const contrast: ThemeTokens = {
  bg: "#000000",
  surface: "#0d0d0d",
  surface2: "#1a1a1a",
  borderColor: "#6b6b6b",
  borderStrong: "#a3a3a3",
  text: "#ffffff",
  textDim: "#e0e0e0",
  textFaint: "#b8b8b8",
  accent: "#ffe600",
  accentInk: "#000000",
  danger: "#ff6b6b",
  success: "#4ade80",
  warning: "#fbbf24",
  info: "#7dd3fc",
  /** เข้มสุดในบรรดาธีมทั้งหมด — ธีม accessible ต้องการ separation มากที่สุด */
  overlay: "rgba(0, 0, 0, 0.85)",
  ...ON_MEDIA,
};

/**
 * Sepia — light อุ่น สำหรับคนที่รู้สึกว่าพื้นขาวจ้าเกินไป
 *
 * พื้นครีมกระดาษเก่า ตัวหนังสือน้ำตาลเข้ม (ไม่ใช่ดำ — ดำบนครีมให้ความรู้สึกแข็งผิดคาแรกเตอร์)
 * accent เป็น terracotta #b45309 ที่เป็นสีอุ่นเข้ากับพื้น และเข้มพอให้ `accentInk` สีครีม
 * อ่านออกได้ 4.76:1 — ถ้าใช้ส้มสดกว่านี้จะได้ปุ่มที่อ่านไม่ออกแบบเดียวกับ paper
 *
 * contrast: text/bg 13.90 · textDim/bg 5.86 · textFaint/bg 3.52 · accentInk/accent 4.76
 *           onMedia/mediaScrim 18.11 · borderStrong เหนือ overlay 1.87
 */
const sepia: ThemeTokens = {
  bg: "#f6f0e4",
  surface: "#efe7d7",
  surface2: "#e5dbc7",
  borderColor: "#d8cdb6",
  borderStrong: "#bfb094",
  text: "#2b2115",
  textDim: "#6a5a44",
  textFaint: "#8d7d66",
  accent: "#b45309",
  accentInk: "#fff8ec",
  danger: "#b91c1c",
  success: "#4d7c0f",
  warning: "#a16207",
  info: "#0e7490",
  /** scrim สีน้ำตาลเข้มไม่ใช่ดำ — ดำสนิทบนธีมอุ่นให้ความรู้สึกเป็นรูโหว่ ไม่กลมกลืนกับพื้น */
  overlay: "rgba(43, 33, 21, 0.55)",
  ...ON_MEDIA,
};

/**
 * Midnight — dark เย็น โทน studio/technical
 *
 * พื้นน้ำเงินกรมท่า **ไม่ใช่ดำเทา** เพื่อให้ต่างจาก Ink จริงในระดับคาแรกเตอร์ ไม่ใช่แค่เปลี่ยน hue
 * ของ accent — ทั้ง bg/surface/border อมน้ำเงินไล่ระดับกันทั้งชุด
 * accent ฟ้าไซแอน #38bdf8 คู่กับ `accentInk` น้ำเงินเกือบดำ ให้ 8.82:1
 *
 * contrast: text/bg 16.09 · textDim/bg 8.60 · textFaint/bg 4.99 · accentInk/accent 8.82
 *           onMedia/mediaScrim 19.97 · borderStrong เหนือ overlay 2.18
 */
const midnight: ThemeTokens = {
  bg: "#0a1020",
  surface: "#111a2e",
  surface2: "#18243d",
  borderColor: "#243350",
  borderStrong: "#36486b",
  text: "#e6edf7",
  textDim: "#9fb0c9",
  textFaint: "#74849c",
  accent: "#38bdf8",
  accentInk: "#04121f",
  danger: "#fb7185",
  success: "#34d399",
  warning: "#fbbf24",
  info: "#7dd3fc",
  /** อมน้ำเงินให้เข้าชุดกับพื้น ด้วยเหตุผลเดียวกับ sepia */
  overlay: "rgba(2, 6, 16, 0.74)",
  ...ON_MEDIA,
};

/**
 * Nocturne — dark อุ่น เน้นการดูภาพ
 *
 * พื้นน้ำตาลเข้มอมม่วง accent ทอง/อำพัน เลือกโทนนี้เพราะเป็นธีมที่ตั้งใจให้ใช้ตอนดูผลงาน:
 * สีพื้นอุ่นและอิ่มตัวต่ำ **ไม่แย่งสายตาไปจากภาพ** ต่างจาก Midnight ที่พื้นน้ำเงินอิ่มตัวกว่า
 * และจะไปตีกับภาพโทนเย็น
 * `accentInk` เป็นน้ำตาลเกือบดำ ไม่ใช่ขาว — ทองสว่าง #f0b429 คู่กับขาวคือคู่ที่อ่านไม่ออกที่สุด
 *
 * contrast: text/bg 15.46 · textDim/bg 7.67 · textFaint/bg 4.58 · accentInk/accent 9.90
 *           onMedia/mediaScrim 19.97 · borderStrong เหนือ overlay 2.17
 */
const nocturne: ThemeTokens = {
  bg: "#15100f",
  surface: "#1f1818",
  surface2: "#2a2120",
  borderColor: "#3a2e2c",
  borderStrong: "#544441",
  text: "#f0e7df",
  textDim: "#b3a297",
  textFaint: "#8a7a70",
  accent: "#f0b429",
  accentInk: "#1c1205",
  danger: "#f87171",
  success: "#5cc98c",
  warning: "#f0b429",
  info: "#7fb8e8",
  overlay: "rgba(8, 5, 4, 0.74)",
  ...ON_MEDIA,
};

/**
 * palette ทั้ง 6 พร้อม `colorScheme`
 *
 * key เป็น `ResolvedThemeId` (6 ตัว ไม่ใช่ 7) — `"system"` ไม่มีที่นี่เพราะไม่ใช่ palette
 * `Record` แบบไม่ optional บังคับให้ tsc ฟ้องทันทีถ้าเพิ่มธีมใน `ThemeId` แล้วลืมมานิยามสีที่นี่
 */
export const THEMES: Record<ResolvedThemeId, ThemeDefinition> = {
  paper: { id: "paper", colorScheme: "light", tokens: paper },
  ink: { id: "ink", colorScheme: "dark", tokens: ink },
  contrast: { id: "contrast", colorScheme: "dark", tokens: contrast },
  sepia: { id: "sepia", colorScheme: "light", tokens: sepia },
  midnight: { id: "midnight", colorScheme: "dark", tokens: midnight },
  nocturne: { id: "nocturne", colorScheme: "dark", tokens: nocturne },
};

/**
 * ธีมที่ใช้เมื่อยังไม่เคยเลือก — `"paper"` ไม่ใช่ `"system"` (decisions.e / R7)
 *
 * export เป็นค่าคงที่แทนที่จะให้แต่ละที่พิมพ์ `"paper"` เอง เพราะ fallback นี้ถูกใช้อย่างน้อย
 * 3 ที่ (loadTheme ที่ store.ts, sanitize ค่าที่อ่านจาก localStorage, และ inline script ใน
 * index.html ที่ import ไม่ได้) — ที่ที่ import ได้ควรอ้างตัวนี้ จะได้เหลือจุด duplicate จริงแค่จุดเดียว
 */
export const DEFAULT_THEME = "paper" as const satisfies ThemeId;

/**
 * ธีมที่ `"system"` resolve ไปหา ตาม `prefers-color-scheme` (decisions.c)
 *
 * มีแค่คู่เดียว ไม่ใช่คู่ light/dark ต่อทุกธีม — ถ้าทำแบบหลังจะได้ combination สิบกว่าแบบ
 * ที่ต้องออกแบบและ QA ซึ่งเกิน scope 5-8 preset ที่ตกลงกันไว้
 */
export const SYSTEM_LIGHT: ResolvedThemeId = "paper";
export const SYSTEM_DARK: ResolvedThemeId = "ink";

/**
 * ลำดับแถวใน picker — `"system"` บนสุดเสมอ (paletteDesign.themes)
 *
 * เป็น array ไม่ใช่ `Object.keys(THEMES)` เพราะลำดับต้องคงที่และตั้งใจ ส่วน key order ของ object
 * เป็นสิ่งที่ refactor แล้วสลับได้โดยไม่มีใครสังเกต และ `"system"` ก็ไม่ได้อยู่ใน THEMES ด้วย
 *
 * `swatch` เก็บ **ชื่อ field ไม่ใช่ค่าสี** — picker ต้องไปอ่านค่าจริงจาก `THEMES` ตอน render
 * ไม่งั้นจะมีสีก๊อปไว้สองที่แล้ว drift จาก palette จริงโดยไม่มีอะไรจับได้
 */
export const THEME_ORDER: readonly ThemeMeta[] = [
  {
    id: "system",
    label: "System",
    hint: "ตามการตั้งค่าของเครื่อง",
    /** `null` เพราะไม่มี palette ของตัวเอง — UI ต้องหยิบ swatch ของธีมที่ resolve ได้มาแสดงแทน */
    swatch: null,
  },
  {
    id: "paper",
    label: "Paper",
    hint: "สว่าง ขาวสะอาด มิ้นท์เป็นสีเน้น",
    swatch: ["bg", "surface", "accent"],
  },
  {
    id: "ink",
    label: "Ink",
    hint: "มืด ดำหมึก มิ้นท์สว่าง",
    swatch: ["bg", "surface", "accent"],
  },
  {
    id: "contrast",
    label: "High Contrast",
    hint: "มืดสนิท ตัดกันสูงสุด อ่านง่ายที่สุด",
    swatch: ["bg", "surface", "accent"],
  },
  {
    id: "sepia",
    label: "Sepia",
    hint: "สว่างอุ่น ครีมกระดาษเก่า สบายตา",
    swatch: ["bg", "surface", "accent"],
  },
  {
    id: "midnight",
    label: "Midnight",
    hint: "มืดเย็น น้ำเงินกรมท่า ฟ้าไซแอน",
    swatch: ["bg", "surface", "accent"],
  },
  {
    id: "nocturne",
    label: "Nocturne",
    hint: "มืดอุ่น น้ำตาลอมม่วง ทองอำพัน",
    swatch: ["bg", "surface", "accent"],
  },
];

/**
 * ชื่อ field ใน `ThemeTokens` → ชื่อ CSS custom property
 *
 * ตารางนี้ซ้ำกับ comment ใน types.ts โดยตั้งใจ — ที่นั่นเป็นเอกสารให้คนอ่าน ส่วนที่นี่เป็น**ค่าที่
 * โค้ดใช้จริง** (T4/T6 ใช้ gen CSS block และ apply ธีม) การมี `Record<keyof ThemeTokens, string>`
 * ทำให้ tsc ฟ้องถ้าเพิ่ม token ใน `ThemeTokens` แล้วลืมมาเพิ่ม mapping ที่นี่
 *
 * prefix `--color-` เป็นข้อบังคับ ไม่ใช่ convention — Tailwind v4 gen utility (`bg-*`/`text-*`/
 * `border-*`) ให้เฉพาะ custom property ที่ขึ้นต้นด้วย `--color-` เท่านั้น ตั้งเป็น `--overlay`
 * เฉยๆ จะไม่เกิด class `bg-overlay` และ build ก็ไม่ error — พังเงียบ
 */
export const CSS_VAR_BY_TOKEN: Record<keyof ThemeTokens, string> = {
  bg: "--color-bg",
  surface: "--color-surface",
  /** ชื่อไม่ตรงตรงๆ: camelCase `surface2` → kebab `surface-2` */
  surface2: "--color-surface-2",
  /** ชื่อไม่ตรงตรงๆ: field ชื่อ `borderColor` เพื่อเลี่ยงความสับสนกับ CSS shorthand `border` */
  borderColor: "--color-border",
  borderStrong: "--color-border-strong",
  text: "--color-text",
  textDim: "--color-text-dim",
  textFaint: "--color-text-faint",
  accent: "--color-accent",
  accentInk: "--color-accent-ink",
  danger: "--color-danger",
  success: "--color-success",
  warning: "--color-warning",
  info: "--color-info",
  overlay: "--color-overlay",
  mediaScrim: "--color-media-scrim",
  onMedia: "--color-on-media",
  onMediaDim: "--color-on-media-dim",
};
