import { state } from "./store";
import type { Locale } from "./types";

/**
 * Dictionary กลางของทั้งแอป — key naming: `{page|shared}.{Component}.{purpose}`
 * เช่น "header.apiKey.ready", "actions.models.loadFailed", "shared.brand.tagline"
 * จัดกลุ่มด้วย comment divider ตาม section (จะเติมเข้ามาเรื่อยๆ ใน wave ถัดไปตอน migrate แต่ละไฟล์)
 *
 * KEYWORDS_BY_MODE.items (English keyword phrase ที่ส่งตรงเข้า image model prompt เช่น "photorealistic")
 * ไม่ต้องมี key ในนี้ — ไม่ใช่ UI copy ห้ามแปล
 */
const DICTIONARY: Record<Locale, Record<string, string>> = {
  th: {
    // เติมเพิ่มทีละ wave ตอน migrate แต่ละไฟล์
  },
  en: {
    // เติมเพิ่มทีละ wave ตอน migrate แต่ละไฟล์
  },
};

/**
 * แปล key เป็นข้อความตาม locale ปัจจุบัน — fallback chain: locale ปัจจุบัน → ไทย (default ของแอป) → key ดิบ
 * (เห็น key ดิบโผล่ตรงจอ = สัญญาณว่าลืมเติม key เข้า dictionary ตอน dev)
 * รองรับ named interpolation แบบ {{name}} เพื่อไม่ผูกกับลำดับคำที่ต่างกันระหว่างภาษา
 * เช่น t("actions.models.extraSaved", { count: 3 })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTIONARY[state.locale] ?? DICTIONARY.th;
  let str = dict[key] ?? DICTIONARY.th[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return str;
}
