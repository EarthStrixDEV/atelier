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
    "actions.cloud.readFailed": "อ่านไฟล์ผลงานไม่สำเร็จ",
    "actions.cloud.uploadFailed": "เก็บขึ้น Cloud ไม่สำเร็จค่ะ — {{message}}",
    "actions.cloud.nothingToUpload": "ที่เลือกไว้อยู่บน Cloud แล้ว หรือกำลังอัพโหลดอยู่ค่ะ",
    "actions.cloud.uploadingBatch": "กำลังเก็บขึ้น Cloud {{count}} ไฟล์ค่ะ~",
    "actions.cloud.batchFailed": "เก็บขึ้น Cloud ไม่สำเร็จ {{failed}} จาก {{count}} ไฟล์ — กดลองใหม่ที่การ์ดได้เลยค่ะ",

    // ---------- Gallery / Lightbox: Cloud ----------
    "gallery.cloud.save": "เก็บขึ้น Cloud",
    "gallery.cloud.saveHint": "อัพโหลดไฟล์นี้ขึ้น Cloud (Supabase) ของบัญชีที่ล็อกอินอยู่",
    "gallery.cloud.uploading": "กำลังอัพโหลด…",
    "gallery.cloud.onCloud": "อยู่บน Cloud",
    "gallery.cloud.retry": "ลองอัพโหลดใหม่",
    "gallery.cloud.saveSelectedAria": "เก็บที่เลือกไว้ขึ้น Cloud ({{count}} รายการ)",

    // ---------- SettingsModal: Cloud upload ----------
    "settings.cloud.autoUpload": "อัพโหลดขึ้น Cloud อัตโนมัติ",
    "settings.cloud.autoUploadHint": "ผลงานที่สร้างเสร็จต่อจากนี้จะถูกเก็บขึ้น Cloud ให้เอง — ตั้งค่าแยกต่อเบราว์เซอร์",
    "settings.cloud.usageLoading": "กำลังอ่านพื้นที่บน Cloud…",
    "settings.cloud.usageFailed": "อ่านพื้นที่บน Cloud ไม่สำเร็จค่ะ",
    "settings.cloud.usageEmpty": "ยังไม่มีผลงานบน Cloud ค่ะ",
    "settings.cloud.usageLabel": "บน Cloud",
    "settings.cloud.usageItems": "ชิ้น",
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
    "actions.cloud.readFailed": "Couldn't read the result file",
    "actions.cloud.uploadFailed": "Couldn't save to Cloud — {{message}}",
    "actions.cloud.nothingToUpload": "The selected items are already on Cloud or uploading",
    "actions.cloud.uploadingBatch": "Saving {{count}} files to Cloud…",
    "actions.cloud.batchFailed": "{{failed}} of {{count}} files couldn't be saved to Cloud — retry from the card",

    // ---------- Gallery / Lightbox: Cloud ----------
    "gallery.cloud.save": "Save to Cloud",
    "gallery.cloud.saveHint": "Upload this file to the Cloud (Supabase) of the logged-in account",
    "gallery.cloud.uploading": "Uploading…",
    "gallery.cloud.onCloud": "On Cloud",
    "gallery.cloud.retry": "Retry upload",
    "gallery.cloud.saveSelectedAria": "Save selected to Cloud ({{count}} items)",

    // ---------- SettingsModal: Cloud upload ----------
    "settings.cloud.autoUpload": "Auto-upload to Cloud",
    "settings.cloud.autoUploadHint": "New results are saved to Cloud automatically — set per browser",
    "settings.cloud.usageLoading": "Reading Cloud usage…",
    "settings.cloud.usageFailed": "Couldn't read Cloud usage",
    "settings.cloud.usageEmpty": "Nothing on Cloud yet",
    "settings.cloud.usageLabel": "On Cloud:",
    "settings.cloud.usageItems": "items",
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
