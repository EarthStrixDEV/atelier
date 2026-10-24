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
    "actions.cloud.err.read_failed": "อ่านไฟล์ผลงานไม่สำเร็จ",
    "actions.cloud.err.not_configured": "ยังไม่ได้ตั้งค่า Cloud Sync",
    "actions.cloud.err.bad_mime": "ไฟล์ประเภทนี้อัพโหลดขึ้น Cloud ไม่ได้",
    "actions.cloud.err.not_signed_in": "ยังไม่ได้เข้าสู่ระบบ Cloud",
    "actions.cloud.err.insert_failed": "บันทึกข้อมูลขึ้น Cloud ไม่สำเร็จ",
    "actions.cloud.err.upload_failed": "อัพโหลดไฟล์ไม่สำเร็จ",
    "actions.cloud.err.network": "เชื่อมต่อ Cloud ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
    "actions.cloud.uploadFailed": "เก็บขึ้น Cloud ไม่สำเร็จค่ะ — {{message}}",
    "actions.cloud.nothingToUpload": "ที่เลือกไว้อยู่บน Cloud แล้ว หรือกำลังอัพโหลดอยู่ค่ะ",
    "actions.cloud.uploadingBatch": "กำลังเก็บขึ้น Cloud {{count}} ไฟล์ค่ะ~",
    "actions.cloud.batchFailed": "เก็บขึ้น Cloud ไม่สำเร็จ {{failed}} จาก {{count}} ไฟล์ — กดลองใหม่ที่การ์ดได้เลยค่ะ",
    "actions.cloud.restored": "กู้ผลงานจาก Cloud กลับมาแล้ว {{count}} ชิ้นค่ะ",
    "actions.cloud.err.download_failed": "โหลดไฟล์จาก Cloud ไม่สำเร็จ",

    // ---------- Gallery / Lightbox: Cloud ----------
    "gallery.cloud.save": "เก็บขึ้น Cloud",
    "gallery.cloud.saveHint": "อัพโหลดไฟล์นี้ขึ้น Cloud (Supabase) ของบัญชีที่ล็อกอินอยู่",
    "gallery.cloud.uploading": "กำลังอัพโหลด…",
    "gallery.cloud.onCloud": "อยู่บน Cloud",
    "gallery.cloud.retry": "ลองอัพโหลดใหม่",
    "gallery.cloud.saveSelectedAria": "เก็บที่เลือกไว้ขึ้น Cloud ({{count}} รายการ)",
    "gallery.cloud.restoring": "กำลังโหลดจาก Cloud…",
    "gallery.cloud.retryDownload": "ลองโหลดใหม่",

    // ---------- Gallery: ลบ (ลบที่เลือก / ล้างแกลเลอรี) + ซิงก์ Cloud ----------
    "actions.cloud.deleteFailed": "ลบสำเนาบน Cloud ไม่สำเร็จ {{count}} ชิ้นค่ะ — การ์ดถูกลบออกจากแกลเลอรีแล้ว แต่ไฟล์บน Cloud ยังอยู่",
    "actions.cloud.favoriteFailed": "อัปเดตดาวบน Cloud ไม่สำเร็จค่ะ — ดาวในเครื่องนี้ยังเปลี่ยนตามที่กด",
    "gallery.delete.selected": "ลบที่เลือก",
    "gallery.delete.selectedAria": "ลบที่เลือกไว้ออกจากแกลเลอรี ({{count}} รายการ)",
    "gallery.delete.selectedTitle": "ลบผลงานที่เลือก",
    "gallery.delete.selectedConfirm": "ลบผลงานที่เลือก {{count}} ชิ้นออกจากแกลเลอรีใช่ไหมคะ? ชิ้นที่ติดดาวไว้ก็จะถูกลบด้วย กู้คืนไม่ได้นะคะ",
    "gallery.delete.selectedDone": "ลบผลงานที่เลือกแล้ว {{count}} ชิ้นค่ะ",
    "gallery.delete.clearTitle": "ล้างแกลเลอรี",
    "gallery.delete.cloudNote": "ชิ้นที่เก็บไว้บน Cloud จะถูกลบออกจาก Cloud อย่างถาวรด้วย",
    "gallery.delete.cloudKeptNote": "ตอนนี้ไม่ได้เข้าสู่ระบบ Cloud — สำเนาบน Cloud จะไม่ถูกลบ และจะกลับมาเมื่อเข้าสู่ระบบอีกครั้ง (เข้าสู่ระบบก่อนถ้าต้องการลบออกจาก Cloud ด้วย)",
    "gallery.delete.confirm": "ลบ",
    "gallery.delete.cancel": "ยกเลิก",

    // ---------- confirm dialog: Settings + Header (ย้ายจาก window.confirm / two-step button) ----------
    "settings.GalleryPersist.disableTitle": "ปิดการเก็บผลงานลงเครื่อง",
    "settings.GalleryPersist.disableConfirm": "ปิดและลบ",
    "settings.GalleryPersist.clearTitle": "ลบผลงานที่เก็บไว้ในเครื่อง",
    "settings.GalleryPersist.clearConfirm": "ลบทั้งหมด",
    "header.SpendGuard.resetTitle": "ล้างยอดสะสม",
    "header.SpendGuard.resetBody": "ล้างยอดค่าใช้จ่ายสะสมให้เป็น $0 แล้วเริ่มนับใหม่ใช่ไหมคะ? เพดานที่ตั้งไว้และผลงานใน gallery ไม่ได้รับผลกระทบค่ะ",
    "header.SpendGuard.resetConfirm": "ล้างยอด",
    "header.RunningJobs.cancelAllTitle": "ยกเลิกงานทั้งหมด",
    "header.RunningJobs.cancelAllBody": "ยกเลิกทุกโหมด — กำลังสร้าง {{running}} งาน รอคิว {{waiting}} งาน",
    "header.RunningJobs.cancelAllWaitingNote": "งานที่ยังรอคิวยังไม่ถูกยิง ยกเลิกตอนนี้ไม่เสียเงิน",
    "header.RunningJobs.cancelAllConfirm": "ยกเลิกทั้งหมด",

    // ---------- SettingsModal: Cloud upload ----------
    "settings.cloud.autoUpload": "อัพโหลดขึ้น Cloud อัตโนมัติ",
    "settings.cloud.autoUploadHint": "ผลงานที่สร้างเสร็จต่อจากนี้จะถูกเก็บขึ้น Cloud ให้เอง — ตั้งค่าแยกต่อเบราว์เซอร์",
    "settings.cloud.usageLoading": "กำลังอ่านพื้นที่บน Cloud…",
    "settings.cloud.usageFailed": "อ่านพื้นที่บน Cloud ไม่สำเร็จค่ะ",
    "settings.cloud.usageEmpty": "ยังไม่มีผลงานบน Cloud ค่ะ",
    "settings.cloud.usageLabel": "บน Cloud",

    // ---------- InfoHint + MoreMenu ----------
    "shared.infoHint.label": "ข้อมูลเพิ่มเติม",
    "header.MoreMenu.shortcuts": "คีย์ลัดทั้งหมด",
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
    "actions.cloud.err.read_failed": "Couldn't read the result file",
    "actions.cloud.err.not_configured": "Cloud Sync isn't configured",
    "actions.cloud.err.bad_mime": "This file type can't be uploaded to Cloud",
    "actions.cloud.err.not_signed_in": "Not logged in to Cloud",
    "actions.cloud.err.insert_failed": "Couldn't save the record to Cloud",
    "actions.cloud.err.upload_failed": "Couldn't upload the file",
    "actions.cloud.err.network": "Can't reach Cloud — check your connection and try again",
    "actions.cloud.uploadFailed": "Couldn't save to Cloud — {{message}}",
    "actions.cloud.nothingToUpload": "The selected items are already on Cloud or uploading",
    "actions.cloud.uploadingBatch": "Saving {{count}} files to Cloud…",
    "actions.cloud.batchFailed": "{{failed}} of {{count}} files couldn't be saved to Cloud — retry from the card",
    "actions.cloud.restored": "Restored {{count}} items from Cloud",
    "actions.cloud.err.download_failed": "Couldn't download the file from Cloud",

    // ---------- Gallery / Lightbox: Cloud ----------
    "gallery.cloud.save": "Save to Cloud",
    "gallery.cloud.saveHint": "Upload this file to the Cloud (Supabase) of the logged-in account",
    "gallery.cloud.uploading": "Uploading…",
    "gallery.cloud.onCloud": "On Cloud",
    "gallery.cloud.retry": "Retry upload",
    "gallery.cloud.saveSelectedAria": "Save selected to Cloud ({{count}} items)",
    "gallery.cloud.restoring": "Loading from Cloud…",
    "gallery.cloud.retryDownload": "Retry download",

    // ---------- Gallery: delete (selected / clear gallery) + Cloud sync ----------
    "actions.cloud.deleteFailed": "Couldn't delete {{count}} items from Cloud — they're gone from the gallery, but the files are still on Cloud",
    "actions.cloud.favoriteFailed": "Couldn't update the favorite on Cloud — it still changed on this device",
    "gallery.delete.selected": "Delete selected",
    "gallery.delete.selectedAria": "Delete selected from the gallery ({{count}} items)",
    "gallery.delete.selectedTitle": "Delete selected items",
    "gallery.delete.selectedConfirm": "Delete {{count}} selected items from the gallery? Favorites among them will be deleted too. This can't be undone.",
    "gallery.delete.selectedDone": "Deleted {{count}} selected items",
    "gallery.delete.clearTitle": "Clear gallery",
    "gallery.delete.cloudNote": "Items stored on Cloud will also be permanently deleted from Cloud.",
    "gallery.delete.cloudKeptNote": "You are not signed in to Cloud — Cloud copies will NOT be deleted and will come back when you sign in again. Sign in first to delete them from Cloud too.",
    "gallery.delete.confirm": "Delete",
    "gallery.delete.cancel": "Cancel",

    // ---------- confirm dialog: Settings + Header ----------
    "settings.GalleryPersist.disableTitle": "Turn off saving to this device",
    "settings.GalleryPersist.disableConfirm": "Turn off and delete",
    "settings.GalleryPersist.clearTitle": "Delete saved works on this device",
    "settings.GalleryPersist.clearConfirm": "Delete all",
    "header.SpendGuard.resetTitle": "Reset cumulative spend",
    "header.SpendGuard.resetBody": "Reset the cumulative spend to $0 and start counting again? Your cap and gallery are not affected.",
    "header.SpendGuard.resetConfirm": "Reset",
    "header.RunningJobs.cancelAllTitle": "Cancel all jobs",
    "header.RunningJobs.cancelAllBody": "Cancels jobs in every mode — {{running}} running, {{waiting}} waiting",
    "header.RunningJobs.cancelAllWaitingNote": "Waiting jobs haven't been sent yet, so cancelling them costs nothing.",
    "header.RunningJobs.cancelAllConfirm": "Cancel all",

    // ---------- SettingsModal: Cloud upload ----------
    "settings.cloud.autoUpload": "Auto-upload to Cloud",
    "settings.cloud.autoUploadHint": "New results are saved to Cloud automatically — set per browser",
    "settings.cloud.usageLoading": "Reading Cloud usage…",
    "settings.cloud.usageFailed": "Couldn't read Cloud usage",
    "settings.cloud.usageEmpty": "Nothing on Cloud yet",
    "settings.cloud.usageLabel": "On Cloud:",
    "settings.cloud.usageItems": "items",

    // ---------- InfoHint + MoreMenu ----------
    "shared.infoHint.label": "More info",
    "header.MoreMenu.shortcuts": "Keyboard shortcuts",
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
