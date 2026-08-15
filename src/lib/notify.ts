import type { GenItem } from "./types";

/**
 * Desktop notification + tab title flicker เมื่องาน video/audio/cinematic เสร็จ (done/error) ขณะแท็บถูกซ่อนอยู่
 * (document.hidden) — ผู้ใช้ที่สลับแท็บไปทำงานอื่นระหว่างรอ video job (มักใช้เวลา 1-3 นาที) จะได้รู้ทันทีที่เสร็จ
 *
 * ออกแบบเป็น "batch": generate() เรียก beginNotifyBatch() ก่อนยิง request ของ batch หนึ่งชุด (รู้จำนวนงานทั้งหมด)
 * แล้วแต่ละงานเรียก notifyJobSettled() ตอนเสร็จ/error — เมื่อครบทุกงานในคิว (ไม่ว่าจะ done หรือ error) จึงค่อยยิง
 * แจ้งเตือนเดียวสรุปผล ("4/5 เสร็จ, 1 ล้มเหลว") แทนที่จะแจ้งทีละงาน (เฉพาะ batch ที่มีมากกว่า 1 งาน)
 * batch ที่มีงานเดียวแจ้งทันทีตอนงานนั้นเสร็จ ไม่ต้องรอ "ครบ batch" ให้ดูซับซ้อนเกินจำเป็น
 */

/** exported เพื่อให้ store.ts (atelierStorageBreakdown/clearStorageKey) รู้จัก key นี้โดยไม่ต้อง hardcode string ซ้ำ */
export const PERMISSION_KEY = "atelier_notify_permission_asked";

/** เคยถามสิทธิ์ (ไม่ว่าผลจะเป็นอะไร) หรือยัง — ใช้กันการขอสิทธิ์ซ้ำทุกครั้งที่ generate video */
function hasAskedPermission(): boolean {
  try {
    return localStorage.getItem(PERMISSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markPermissionAsked() {
  try {
    localStorage.setItem(PERMISSION_KEY, "1");
  } catch { /* localStorage เต็มหรือถูกปิด — ข้ามไปเงียบๆ ไม่กระทบการใช้งานหลัก */ }
}

/**
 * ขอสิทธิ์ Notification แบบ lazy — เรียกเฉพาะตอน "ครั้งแรก" ที่ผู้ใช้กด generate ในโหมด video เท่านั้น
 * (ดู requestNotifyPermissionOnce ที่ generate() เรียก) ผลลัพธ์ (grant/deny) ถูกจำไว้ผ่าน hasAskedPermission
 * เพื่อไม่ให้เบราว์เซอร์เด้งขอสิทธิ์ซ้ำทุกครั้งที่ generate — ต้องเรียกจาก user gesture (onClick) เท่านั้น
 */
export function requestNotifyPermissionOnce() {
  if (typeof Notification === "undefined") return;
  if (hasAskedPermission()) return;
  markPermissionAsked();
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => { /* เบราว์เซอร์บาง build ปฏิเสธ promise ตรงๆ — เงียบไว้ */ });
  }
}

function canNotify(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function fireNotification(title: string, body: string) {
  if (!canNotify()) return;
  try {
    const n = new Notification(title, { body, silent: false });
    // โฟกัสกลับมาที่แท็บนี้เมื่อผู้ใช้คลิก notification
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch { /* บาง browser (เช่น mobile) โยน error ตอน new Notification() ตรงๆ — เงียบไว้ไม่ใช่ error ร้ายแรง */ }
}

// ---------- tab title flicker ----------
let originalTitle: string | null = null;
let flickerTimer: ReturnType<typeof setInterval> | null = null;
let flickerOn = false;

/** เริ่มกระพริบ document.title จนกว่าแท็บจะกลับมา focus/visible — เรียกซ้ำได้ ไม่ซ้อนกันเป็นหลาย interval */
function startTitleFlicker(flashText: string) {
  if (typeof document === "undefined") return;
  if (originalTitle == null) originalTitle = document.title;
  if (flickerTimer != null) return; // กำลังกระพริบอยู่แล้ว — ไม่ต้องเริ่มซ้ำ
  flickerTimer = setInterval(() => {
    flickerOn = !flickerOn;
    document.title = flickerOn ? flashText : (originalTitle ?? flashText);
  }, 1200);
}

function stopTitleFlicker() {
  if (flickerTimer != null) {
    clearInterval(flickerTimer);
    flickerTimer = null;
  }
  if (originalTitle != null) {
    document.title = originalTitle;
    originalTitle = null;
  }
  flickerOn = false;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) stopTitleFlicker();
  });
}

// ---------- batch tracking ----------
interface BatchState {
  total: number;
  done: number;
  failed: number;
  settled: number;
}
let batchSeq = 0;
const batches = new Map<number, BatchState>();

/** เรียกตอนเริ่ม batch ใหม่ (generate()) — คืน batchId ให้แต่ละ item ใน batch อ้างอิงตอนเสร็จ */
export function beginNotifyBatch(jobCount: number): number {
  const id = ++batchSeq;
  batches.set(id, { total: jobCount, done: 0, failed: 0, settled: 0 });
  return id;
}

const unitLabelFor = (item: GenItem): string =>
  item.mode === "audio" ? "เพลง" : item.mode === "cinematic" ? "scene" : "คลิป";

/**
 * เรียกทุกครั้งที่งาน video/audio/cinematic หนึ่งชิ้น settle (done หรือ error) โดยไม่สนใจว่าแท็บ hidden อยู่ไหม —
 * ต้อง tally สถานะ batch เสมอไม่ว่าแท็บจะ hidden หรือไม่ ไม่งั้น batch ที่จบตอนแท็บยังเปิดอยู่จะค้างใน `batches`
 * ตลอดไป (ไม่มีใคร delete ทิ้ง) การเช็ค document.hidden ทำแค่ตอนจะยิง notification/flicker จริงเท่านั้น
 */
export function notifyJobSettled(item: GenItem, batchId: number | null) {
  const hidden = typeof document !== "undefined" && document.hidden;

  const batch = batchId != null ? batches.get(batchId) : undefined;
  if (!batch || batch.total <= 1) {
    // batch เดี่ยว (หรือไม่รู้จัก batch) — แจ้งทันทีทีละงาน ไม่ต้องรอ
    if (batchId != null) batches.delete(batchId);
    if (!hidden) return; // แท็บยังเปิดดูอยู่ — ไม่ต้องแจ้ง
    const label = unitLabelFor(item);
    fireNotification(
      item.status === "error" ? "Atelier — งานล้มเหลว" : "Atelier — งานเสร็จแล้ว",
      item.status === "error" ? `${label}ของคุณสร้างไม่สำเร็จ: ${item.errMsg.slice(0, 120)}` : `${label}ของคุณพร้อมดูแล้วค่ะ`,
    );
    startTitleFlicker(item.status === "error" ? "❌ งานล้มเหลว — Atelier" : "✅ งานเสร็จแล้ว — Atelier");
    return;
  }

  if (item.status === "done") batch.done++; else batch.failed++;
  batch.settled++;

  if (batch.settled >= batch.total) {
    batches.delete(batchId!);
    if (!hidden) return; // แท็บยังเปิดดูอยู่ตอน batch จบ — ไม่ต้องแจ้ง
    const label = unitLabelFor(item);
    const summary = batch.failed > 0
      ? `${batch.done}/${batch.total} เสร็จ, ${batch.failed} ล้มเหลว`
      : `${label}ทั้งหมด ${batch.total} ชิ้นเสร็จเรียบร้อยแล้วค่ะ`;
    fireNotification("Atelier — คิวเสร็จแล้ว", summary);
    startTitleFlicker(batch.failed > 0 ? "⚠️ คิวเสร็จ (มีล้มเหลว) — Atelier" : "✅ คิวเสร็จแล้ว — Atelier");
  }
}
