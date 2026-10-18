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

    // ---------- SettingsModal: Cloud (Supabase) ----------
    "settings.cloud.title": "Cloud (Supabase)",
    "settings.cloud.desc": "เข้าสู่ระบบเพื่อซิงก์ OpenRouter API Key ข้ามเครื่อง — ไม่ล็อกอินก็ใช้แอปได้ตามปกติค่ะ",
    "settings.cloud.email": "อีเมล",
    "settings.cloud.password": "รหัสผ่าน",
    "settings.cloud.login": "เข้าสู่ระบบ",
    "settings.cloud.loggingIn": "กำลังเข้าสู่ระบบ…",
    "settings.cloud.loggedInAs": "เข้าสู่ระบบอยู่ในชื่อ",
    "settings.cloud.logout": "ออกจากระบบ",
    "settings.cloud.logoutHint": "ออกจากระบบแล้ว API Key จะถูกลบออกจากเครื่องนี้ — ข้อมูลบน cloud ยังอยู่ครบค่ะ",

    // ---------- actions: Cloud (Supabase) ----------
    "actions.cloud.loggedIn": "เข้าสู่ระบบ Cloud แล้วค่ะ",
    "actions.cloud.loggedOut": "ออกจากระบบแล้วค่ะ — ลบ API Key ออกจากเครื่องนี้แล้ว",
    "actions.cloud.keySaveFailed": "ซิงก์ API Key ขึ้น cloud ไม่สำเร็จค่ะ — key ยังใช้ในเครื่องนี้ได้ตามปกติ",
    "actions.cloud.keyDeleteFailed": "ลบ API Key บน cloud ไม่สำเร็จค่ะ — ลองกดลบอีกครั้งนะคะ",
  },
  en: {
    // เติมเพิ่มทีละ wave ตอน migrate แต่ละไฟล์

    // ---------- SettingsModal: Cloud (Supabase) ----------
    "settings.cloud.title": "Cloud (Supabase)",
    "settings.cloud.desc": "Log in to sync your OpenRouter API key across devices — the app works normally without logging in.",
    "settings.cloud.email": "Email",
    "settings.cloud.password": "Password",
    "settings.cloud.login": "Log in",
    "settings.cloud.loggingIn": "Logging in…",
    "settings.cloud.loggedInAs": "Logged in as",
    "settings.cloud.logout": "Log out",
    "settings.cloud.logoutHint": "Logging out removes the API key from this device — your cloud data stays intact.",

    // ---------- actions: Cloud (Supabase) ----------
    "actions.cloud.loggedIn": "Logged in to Cloud",
    "actions.cloud.loggedOut": "Logged out — the API key was removed from this device",
    "actions.cloud.keySaveFailed": "Couldn't sync the API key to the cloud — it still works on this device",
    "actions.cloud.keyDeleteFailed": "Couldn't delete the API key from the cloud — please try removing it again",
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
