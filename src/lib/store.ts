import { useSyncExternalStore } from "react";
import type { AppState, ChatMsg, ExportLogEntry, HistoryEntry, Locale, Mode, ModeState, ORModel, PendingJobEntry, PromptPlacement, PromptTemplate, SpendLedger, ToastVariant } from "./types";
import { SPEND_LEDGER_KEY } from "./types";
import { MAX_CHAT_HISTORY, MAX_EXPORT_LOG, MAX_USER_TEMPLATES, modeLabel, MODES } from "./constants";
import { PERMISSION_KEY as NOTIFY_PERMISSION_ASKED_KEY } from "./notify";

const HISTORY_KEY_PREFIX = "atelier_history_";
const CHAT_HISTORY_KEY = "atelier_chat_history";
const TEMPLATES_KEY_PREFIX = "atelier_templates_";
export const PROMPT_PLACEMENT_KEY = "atelier_prompt_placement";
/** ภาษา UI ทั้งแอป (i18n Wave 0) — ดู loadLocale/saveLocale ท้ายไฟล์ */
export const LOCALE_KEY = "atelier_locale";
/** job ledger สำหรับ survive-reload — เขียนทันทีที่ได้ jobId (หรือเริ่มยิง request ที่ไม่มี jobId) ดู actions.ts */
export const PENDING_JOBS_KEY = "atelier_pending_jobs";
/** เขียนตอน beforeunload ว่าโหมดไหนมีคิวค้างอยู่ตอนปิด/reload — เทียบตอน boot ว่าคิวหายไปจริงไหม (ดู reconcilePendingJobs) */
const QUEUE_NONEMPTY_KEY = "atelier_queue_nonempty_modes";
/**
 * "session snapshot" (PHASE 15) — คนละเรื่องกับ "Auto Save" (เซฟไฟล์ผลลัพธ์ลงเครื่องผ่าน File System Access API)
 * snapshot นี้เก็บ metadata ต่อโหมดชุดเดียวกับ exportSession (prompt/ratio/count/duration/history/queue ฯลฯ — ไม่มีรูป)
 * เขียนทับช่องเดียวทุก ~30s (autosaveSessionSnapshot ใน actions.ts) ให้กู้คืนได้ถ้าแท็บถูกปิด/crash กะทันหันโดยไม่ได้ export มือ
 */
export const SESSION_SNAPSHOT_KEY = "atelier_session_snapshot";
/** ประวัติ export (label/filename/timestamp/summary เท่านั้น — ไม่มี payload จริง) โชว์ใต้ปุ่ม Export ใน Header */
export const EXPORT_LOG_KEY = "atelier_export_log";
/**
 * T24/#1: "id สูงสุดที่เคยลงดิสก์" ของ gallery persistence (F2) — เขียนทุกครั้งที่ saveItem/rehydrate สำเร็จ
 *
 * ทำไมต้องมี: `rehydrateGallery()` ถูกยิงแบบ **ไม่ await** จาก `reconcilePendingJobs()` โดยเจตนา (ห้ามหน่วง
 * resume ของ video job ที่จ่ายเงินไปแล้ว) แต่มัน bump `s.seq` ได้ก็ต่อเมื่อ `await loadItems()` คืนค่าแล้ว
 * ระหว่างรอ I/O นั้น `s.seq` ยังเป็น 0 — ผู้ใช้กด Generate ทันได้ item ใหม่จะได้ id 1,2,3… ชนกับ id ของ
 * record ที่กำลังจะกู้ แล้ว dedupe ด้วย id จะทิ้ง record นั้นทั้งที่เป็นคนละชิ้นกัน
 *
 * ค่าใน localStorage อ่านแบบ **sync** ได้ จึงยกพื้น `s.seq` ให้พ้น id ที่กู้แน่ๆ ได้ตั้งแต่ก่อนยิง rehydrate
 * โดยไม่ต้อง await อะไรเลย = ปิด window ทั้งหมด
 */
export const GALLERY_MAX_ID_KEY = "atelier_gallery_max_id";
/**
 * รายการโปรด (F3) — เก็บเป็น "ลายนิ้วมือของคำสั่งสร้าง" ต่อโหมด ไม่ใช่ GenItem.id
 * เพราะ id มาจาก `++s.seq` ที่รีเซ็ตเป็น 0 ทุก reload (ดู `seq: 0` ในไฟล์นี้ และ actions.ts ที่ต้อง bump seq
 * กัน id ชนตอน resume job) — เก็บ id ไว้แล้วโหลดกลับมาจะไปติดดาวให้ item ใหม่ที่ไม่เกี่ยวกันเลย
 */
const FAVORITES_KEY_PREFIX = "atelier_favorites_";
const FAVORITE_STAMPS_KEY = "atelier_favorite_stamps";
/** prefix ของทุก key ที่แอปนี้เขียนลง localStorage — ใช้คำนวณขนาดรวมในหน้า Settings */
export const STORAGE_KEY_PREFIX = "atelier_";

/**
 * เขียน localStorage แบบมี guard เดียวกันทั้งแอป — เมื่อเขียนพลาด (ส่วนใหญ่คือ QuotaExceededError)
 * จะ toast เตือนผู้ใช้ "ครั้งแรกของ session" เท่านั้น (กันเตือนถี่ยิบทุกครั้งที่ auto-save prompt/history)
 * คืนค่า true ถ้าเขียนสำเร็จ — caller เดิมส่วนใหญ่ไม่ต้องสนใจ return value (fire-and-forget เหมือนเดิม)
 */
export function writeLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    if (!state.storageQuotaWarned) {
      state.storageQuotaWarned = true;
      toast("บันทึกข้อมูลลง localStorage ไม่สำเร็จ (พื้นที่เต็ม) — history/template ล่าสุดอาจไม่ถูกเซฟค่ะ", "error");
    }
    return false;
  }
}

/** ขนาดรวมโดยประมาณ (byte) ของทุก key ที่ขึ้นต้นด้วย atelier_ ใน localStorage — ใช้โชว์ในหน้า Settings */
export function estimateAtelierStorageBytes(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
      const value = localStorage.getItem(key) ?? "";
      // UTF-16 ใน localStorage จริงๆ กินราวๆ 2 byte/ตัวอักษร — ประมาณการเท่านั้น ไม่ต้องเป๊ะ
      total += key.length * 2 + value.length * 2;
    }
  } catch { /* localStorage ถูกปิด — คืน 0 ไปเงียบๆ */ }
  return total;
}

/** เอนทรีของ per-key breakdown (PHASE 15) — หนึ่งแถวต่อหนึ่ง key ที่ขึ้นต้นด้วย atelier_ ใน localStorage จริง */
export interface StorageKeyBreakdownEntry {
  key: string;
  label: string;
  bytes: number;
}

/** label มนุษย์อ่านง่ายต่อ key ที่รู้จัก — key ที่ไม่ตรง pattern ไหนเลย (ไม่ควรเกิด แต่เผื่อไว้) ใช้ key ดิบเป็น label */
function labelForStorageKey(key: string): string {
  if (key === CHAT_HISTORY_KEY) return "ประวัติแชท Chat with Atelier";
  if (key === PROMPT_PLACEMENT_KEY) return "ตำแหน่งช่อง Prompt";
  if (key === LOCALE_KEY) return "ภาษาที่ใช้แสดงผล UI";
  if (key === PENDING_JOBS_KEY) return "รายการงานค้าง (job ledger)";
  if (key === QUEUE_NONEMPTY_KEY) return "flag คิวค้างตอนปิดแท็บ";
  if (key === SESSION_SNAPSHOT_KEY) return "บันทึกเซสชันอัตโนมัติ";
  if (key === EXPORT_LOG_KEY) return "ประวัติ Export";
  if (key === FAVORITE_STAMPS_KEY) return "เวลาที่กดดาวล่าสุดของแต่ละรายการโปรด";
  if (key === GALLERY_MAX_ID_KEY) return "id สูงสุดของผลงานที่เก็บไว้ในเครื่อง (กัน id ชนตอนกู้)";
  if (key === SPEND_LEDGER_KEY) return "ยอดใช้จ่ายประเมินสะสม + เพดาน (Spend Guard)";
  if (key.startsWith(FAVORITES_KEY_PREFIX)) return `รายการโปรดในแกลเลอรี — ${modeLabel(key.slice(FAVORITES_KEY_PREFIX.length) as Mode)}`;
  if (key === ASSIST_MODEL_KEY) return "โมเดลผู้ช่วย AI ที่เลือกไว้";
  if (key === USER_EXTRA_MODELS_KEY) return "โมเดลที่เพิ่มเอง";
  if (key === NOTIFY_PERMISSION_ASKED_KEY) return "flag เคยขอสิทธิ์ Notification";
  if (key.startsWith(HISTORY_KEY_PREFIX)) return `ประวัติ Prompt — ${modeLabel(key.slice(HISTORY_KEY_PREFIX.length) as Mode)}`;
  if (key.startsWith(TEMPLATES_KEY_PREFIX)) return `Template ที่เซฟไว้ — ${modeLabel(key.slice(TEMPLATES_KEY_PREFIX.length) as Mode)}`;
  return key;
}

/** breakdown ต่อ key จริงที่มีอยู่ใน localStorage ตอนนี้ (ไม่ list key ที่ยังไม่เคยเขียน) เรียงจากใหญ่ไปเล็ก */
export function atelierStorageBreakdown(): StorageKeyBreakdownEntry[] {
  const rows: StorageKeyBreakdownEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
      const value = localStorage.getItem(key) ?? "";
      rows.push({ key, label: labelForStorageKey(key), bytes: key.length * 2 + value.length * 2 });
    }
  } catch { /* localStorage ถูกปิด — คืน list ว่างไปเงียบๆ */ }
  rows.sort((a, b) => b.bytes - a.bytes);
  return rows;
}

/**
 * ลบ key เดียวออกจาก localStorage แล้ว sync ส่วนที่มี mirror อยู่ใน in-memory state ให้ตรงกันทันที (mutate() broadcast)
 * กัน UI โชว์ข้อมูลเก่าที่ขัดกับสิ่งที่ผู้ใช้เพิ่งลบไปจริงๆ (เช่นลบ atelier_chat_history แล้ว ChatPanel ที่เปิดอยู่ต้องเห็นว่างด้วย)
 * key ที่ไม่มี mirror ใน state (job ledger, flag ต่างๆ, session snapshot, export log) แค่ลบจาก localStorage เฉยๆ พอ
 */
export function clearStorageKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch { /* best-effort เท่านั้น */ }

  if (key === CHAT_HISTORY_KEY) {
    mutate(s => { s.chatMessages = []; });
    return;
  }
  if (key === ASSIST_MODEL_KEY) {
    mutate(s => { s.assistModelId = null; });
    return;
  }
  if (key === USER_EXTRA_MODELS_KEY) {
    mutate(s => { s.userExtraModels = []; });
    return;
  }
  if (key === PROMPT_PLACEMENT_KEY) {
    mutate(s => { s.promptPlacement = "sidebar"; });
    return;
  }
  if (key === LOCALE_KEY) {
    mutate(s => { s.locale = "th"; });
    return;
  }
  if (key === SPEND_LEDGER_KEY) {
    // ledger มี mirror ใน AppState — ลบ key แล้วต้องรีเซ็ต state ให้ตรงกันทันที ไม่งั้น gate ยังคิดจากยอดเก่า
    // ที่ลบไปแล้ว และ autosave ครั้งถัดไปจะเขียนยอดเดิมกลับลง localStorage เหมือนไม่เคยลบ
    mutate(s => { s.spendLedger = freshSpendLedger(); });
    return;
  }
  if (key.startsWith(HISTORY_KEY_PREFIX)) {
    const mode = key.slice(HISTORY_KEY_PREFIX.length) as Mode;
    if (MODES.includes(mode)) mutate(s => { s.modes[mode].history = []; });
    return;
  }
  if (key.startsWith(TEMPLATES_KEY_PREFIX)) {
    const mode = key.slice(TEMPLATES_KEY_PREFIX.length) as Mode;
    if (MODES.includes(mode)) mutate(s => { s.modes[mode].userTemplates = []; });
    return;
  }
  // atelier_pending_jobs, atelier_queue_nonempty_modes, atelier_notify_permission_asked, atelier_session_snapshot,
  // atelier_export_log — ไม่มี mirror ใน AppState (อ่านจาก localStorage ตรงๆ เฉพาะจังหวะที่ต้องใช้) ลบเฉยๆ พอ ไม่ต้อง mutate()
}

// ตัวนับ monotonic สำหรับ HistoryEntry.at — ใหม่กว่าเสมอมีค่ามากกว่า โดยไม่ต้องพึ่ง Date.now()
// กระจัดกระจายทั่วโค้ด (ตัวเดียวจบ ทั้ง migrate ของเก่าและ entry ใหม่ที่เพิ่มระหว่าง session)
let historySeq = 0;
export function nextHistorySeq(): number {
  return ++historySeq;
}

/**
 * รองรับ localStorage เดิมที่ยังเป็น string[] (ก่อน migrate) — แปลงเป็น HistoryEntry[] ทันทีตอนอ่าน
 * ของเก่า: pinned: false, at: ใช้ historySeq ไล่ตามลำดับเดิมใน array (รายการแรกในไฟล์ = ใหม่สุด ตาม addToHistory เดิม)
 */
function isHistoryEntry(x: unknown): x is HistoryEntry {
  if (!(!!x && typeof x === "object"
    && typeof (x as HistoryEntry).text === "string"
    && typeof (x as HistoryEntry).at === "number"
    && typeof (x as HistoryEntry).pinned === "boolean")) return false;
  // negPrompt (PHASE 14) เป็น field ใหม่กว่า — ยอมรับทั้ง undefined (ของเก่า) และ string ล้วน ไม่ยอมรับ shape อื่น
  const negPrompt = (x as HistoryEntry).negPrompt;
  return negPrompt === undefined || typeof negPrompt === "string";
}

/**
 * exported เพื่อให้ importSession (actions.ts) ใช้ migration เดียวกัน — ไฟล์ session เก่า/ใหม่ import ได้ทั้งคู่
 * ของเก่า (string[]) เรียงจากใหม่สุดไปเก่าสุดตาม addToHistory เดิม (unshift) — เดินจากท้าย array ขึ้นมาหน้า
 * เพื่อให้ nextHistorySeq() แจก at น้อย→มากตามลำดับเวลาจริง (รายการแรกใน array ต้องได้ at มากสุด)
 */
export function migrateHistoryList(list: unknown[]): HistoryEntry[] {
  const result: (HistoryEntry | null)[] = new Array(list.length).fill(null);
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i];
    if (isHistoryEntry(x)) result[i] = x;
    else if (typeof x === "string" && x) result[i] = { text: x, at: nextHistorySeq(), pinned: false };
  }
  return result.filter((x): x is HistoryEntry => x !== null);
}

function loadPromptPlacement(): PromptPlacement {
  try {
    return localStorage.getItem(PROMPT_PLACEMENT_KEY) === "center" ? "center" : "sidebar";
  } catch {
    return "sidebar";
  }
}

/**
 * default เป็น "th" เสมอ — ห้าม auto-detect จาก browser locale (navigator.language ฯลฯ)
 * เพราะผู้ใช้เดิมที่ไม่เคยตั้งค่านี้ต้องไม่เห็น UI เปลี่ยนภาษากะทันหันตอนแอปอัปเดตมาเวอร์ชันที่มี i18n
 */
function loadLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "th";
  } catch {
    return "th";
  }
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch { /* best-effort เท่านั้น — ไม่กระทบการใช้งานหลัก */ }
}

const ASSIST_MODEL_KEY = "atelier_assist_model";

function loadAssistModelId(): string | null {
  try {
    return localStorage.getItem(ASSIST_MODEL_KEY) || null;
  } catch {
    return null;
  }
}

/** null = เคลียร์กลับไปใช้ default hardcode — ลบ key ทิ้งแทนเขียน string ว่างเปล่า */
export function saveAssistModelId(id: string | null) {
  try {
    if (id) localStorage.setItem(ASSIST_MODEL_KEY, id);
    else localStorage.removeItem(ASSIST_MODEL_KEY);
  } catch { /* best-effort เท่านั้น — ไม่กระทบการใช้งานหลัก */ }
}

/* ---------- F4 Spend Guard: ledger persistence (คีย์เดียว SPEND_LEDGER_KEY ประกาศที่ types.ts) ---------- */

/** ledger เปล่าของรอบใหม่ — ใช้ทั้งตอน boot ที่ยังไม่มีข้อมูล, ตอนผู้ใช้กดล้างยอด และตอนลบ key จาก Advanced */
export function freshSpendLedger(): SpendLedger {
  // capUsd ไม่ใส่เลย (undefined) = ยังไม่ได้ตั้งเพดาน = ปิดฟีเจอร์ — ผู้ใช้ใหม่ต้องไม่เจอโมดัลโผล่มากวน
  return { totalUsd: 0, unknownCostCount: 0, startedAt: Date.now() };
}

/**
 * sanitize ตัวเลขที่อ่านจาก localStorage ซึ่งผู้ใช้แก้เองได้ — ยอมรับเฉพาะ finite และไม่ติดลบ
 * ค่าที่ไม่ผ่านคืน fallback แทนที่จะปล่อย NaN ไหลเข้าไปทำให้ทุกการเปรียบเทียบใน gate เป็น false เงียบๆ
 */
function sanitizeNonNegative(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : fallback;
}

function loadSpendLedger(): SpendLedger {
  const fresh = freshSpendLedger();
  try {
    const raw = localStorage.getItem(SPEND_LEDGER_KEY);
    if (!raw) return fresh;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fresh;
    const o = parsed as Partial<SpendLedger>;
    // capUsd: 0 เป็นค่าที่ถูกต้อง (โหมดถามทุกครั้ง) จึงเช็คด้วย typeof/isFinite ไม่ใช่ truthiness
    // ค่าเสีย (ติดลบ/NaN/ชนิดผิด) → undefined = ปิดฟีเจอร์ ปลอดภัยกว่าเดาเพดานมั่วให้ผู้ใช้
    const capUsd = typeof o.capUsd === "number" && Number.isFinite(o.capUsd) && o.capUsd >= 0 ? o.capUsd : undefined;
    return {
      totalUsd: sanitizeNonNegative(o.totalUsd, 0),
      unknownCostCount: Math.floor(sanitizeNonNegative(o.unknownCostCount, 0)),
      startedAt: sanitizeNonNegative(o.startedAt, fresh.startedAt),
      ...(capUsd !== undefined ? { capUsd } : {}),
    };
  } catch {
    return fresh;
  }
}

/** เขียน ledger ลง localStorage — ผ่าน writeLocalStorage เสมอ เพื่อให้ quota warning ทำงานเป็นระบบเดียวกันทั้งแอป */
export function saveSpendLedger(ledger: SpendLedger) {
  writeLocalStorage(SPEND_LEDGER_KEY, JSON.stringify(ledger));
}

const USER_EXTRA_MODELS_KEY = "atelier_user_extra_models";

function isORModelLike(x: unknown): x is ORModel {
  return !!x && typeof x === "object" && typeof (x as ORModel).id === "string" && !!(x as ORModel).id.trim();
}

function loadUserExtraModels(): ORModel[] {
  try {
    const raw = localStorage.getItem(USER_EXTRA_MODELS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isORModelLike) : [];
  } catch {
    return [];
  }
}

/** เซฟ override list เข้า localStorage ตรงๆ (ไม่ผ่าน mutate — caller เป็นคนเรียก mutate เองหลังอัพเดต state) */
export function saveUserExtraModels(list: ORModel[]) {
  writeLocalStorage(USER_EXTRA_MODELS_KEY, JSON.stringify(list));
}

const API_KEY_KEY = "atelier_api_key";

/**
 * ค่า default คือเก็บ key ใน sessionStorage (หายเมื่อปิดแท็บ) ซึ่งปลอดภัยกว่าสำหรับเครื่องที่ใช้ร่วมกัน
 * ผู้ใช้เลือก opt-in ให้จำไว้ใน localStorage ได้เองผ่าน KeyModal — เก็บ flag ไว้ที่ localStorage เสมอ
 * (ไม่ใช่ sessionStorage) เพราะต้องรู้ตั้งแต่ก่อนโหลด key ว่าจะไปอ่านจากที่ไหน
 */
const API_KEY_REMEMBER_KEY = "atelier_api_key_remember";

export function loadRememberApiKey(): boolean {
  try {
    return localStorage.getItem(API_KEY_REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * fallback เป็น one-way เท่านั้น: อ่าน localStorage ได้ก็ต่อเมื่อผู้ใช้เลือก "จำไว้" จริงๆ
 * ห้ามทำสองทางเด็ดขาด — ถ้า remember=false แล้วยังไปอ่าน localStorage เป็นตัวสำรอง
 * key ที่ผู้ใช้สั่งลบไปแล้วจะ "ฟื้นคืนชีพ" ได้เงียบๆ ในเคสที่ removeItem เคย fail
 * (เช่น storage ถูกบล็อกชั่วคราว) ซึ่งขัดกับสิ่งที่ UI สัญญาไว้ว่าลบออกจากเครื่องแล้ว
 */
function loadApiKey(): string {
  try {
    if (loadRememberApiKey()) {
      // ทางนี้ยอม fallback ได้ เพราะผู้ใช้ตั้งใจให้ key อยู่ต่ออยู่แล้ว — กันเคส localStorage
      // ถูกล้างนอกแอปแล้ว key ที่เพิ่งใส่ใน session นี้หายไปด้วยทั้งที่ยังใช้งานอยู่
      return localStorage.getItem(API_KEY_KEY) ?? sessionStorage.getItem(API_KEY_KEY) ?? "";
    }
    // remember=false → localStorage ไม่ควรมี key เลยตาม design ถ้าเจอแปลว่าเป็น stale
    // จากการลบที่เคยล้มเหลว — ลบทิ้งเลย (self-heal) แทนที่จะเอามาใช้
    try { localStorage.removeItem(API_KEY_KEY); } catch { /* best-effort */ }
    return sessionStorage.getItem(API_KEY_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * เขียน key ลงที่เดียวเท่านั้นตาม remember แล้วลบอีกที่ทิ้งเสมอ — สำคัญมากด้านความปลอดภัย
 * เพราะถ้าผู้ใช้เปลี่ยนจาก "จำไว้" กลับเป็น "ไม่จำ" key ต้องหายจาก localStorage จริงๆ
 * ไม่ใช่ค้างอยู่เงียบๆ จน reboot เครื่องก็ยังกู้กลับมาได้
 */
export function saveApiKey(key: string, remember = loadRememberApiKey()) {
  try {
    localStorage.setItem(API_KEY_REMEMBER_KEY, remember ? "1" : "0");
  } catch { /* localStorage ถูกปิด — flag จะกลับไป default (ไม่จำ) ซึ่งปลอดภัยกว่าอยู่แล้ว */ }
  const [target, other] = remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
  try {
    if (key) target.setItem(API_KEY_KEY, key);
    else target.removeItem(API_KEY_KEY);
  } catch { /* storage เต็มหรือถูกปิด — ข้ามไปเงียบๆ ไม่กระทบการใช้งานหลัก */ }
  try {
    other.removeItem(API_KEY_KEY);
  } catch { /* เช่นเดียวกัน */ }
}

function loadHistory(mode: Mode): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY_PREFIX + mode);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? migrateHistoryList(list) : [];
  } catch {
    return [];
  }
}

export function saveHistory(mode: Mode) {
  writeLocalStorage(HISTORY_KEY_PREFIX + mode, JSON.stringify(state.modes[mode].history));
}

function isPromptTemplate(x: unknown): x is PromptTemplate {
  return !!x && typeof x === "object"
    && typeof (x as PromptTemplate).id === "string"
    && typeof (x as PromptTemplate).label === "string"
    && typeof (x as PromptTemplate).text === "string";
}

function loadUserTemplates(mode: Mode): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY_PREFIX + mode);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isPromptTemplate).slice(0, MAX_USER_TEMPLATES) : [];
  } catch {
    return [];
  }
}

export function saveUserTemplates(mode: Mode) {
  writeLocalStorage(TEMPLATES_KEY_PREFIX + mode, JSON.stringify(state.modes[mode].userTemplates));
}

function loadChatHistory(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((m): m is ChatMsg => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      : [];
  } catch {
    return [];
  }
}

export function saveChatHistory() {
  writeLocalStorage(CHAT_HISTORY_KEY, JSON.stringify(state.chatMessages.slice(-MAX_CHAT_HISTORY)));
}

// ---------- pending job ledger (survive-reload) ----------
function isPendingJobEntry(x: unknown): x is PendingJobEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as PendingJobEntry;
  return typeof e.id === "number"
    && MODES.includes(e.mode)
    && (e.jobId === null || typeof e.jobId === "string")
    && typeof e.model === "string"
    && typeof e.modelName === "string"
    && typeof e.promptPreview === "string"
    && typeof e.startedAt === "number";
}

export function loadPendingJobs(): PendingJobEntry[] {
  try {
    const raw = localStorage.getItem(PENDING_JOBS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isPendingJobEntry) : [];
  } catch {
    return [];
  }
}

function savePendingJobs(list: PendingJobEntry[]) {
  writeLocalStorage(PENDING_JOBS_KEY, JSON.stringify(list));
}

/** เพิ่มเอนทรีใหม่เข้า ledger — เรียกทันทีหลัง submit job สำเร็จ (video) หรือเริ่มยิง request (audio) เพื่อลด race กับการปิดแท็บ */
export function addPendingJob(entry: PendingJobEntry) {
  const list = loadPendingJobs();
  list.push(entry);
  savePendingJobs(list);
}

/** ลบเอนทรีออกจาก ledger ทันทีที่ item ถึงสถานะ done/error — กัน ledger ค้างงานที่จบไปแล้วจริงๆ */
export function removePendingJob(id: number) {
  const list = loadPendingJobs();
  const next = list.filter(e => e.id !== id);
  if (next.length !== list.length) savePendingJobs(next);
}

// ---------- T24/#1: gallery max-id floor (กัน id ชนระหว่าง rehydrate ยังไม่จบ) ----------
/**
 * อ่าน "id สูงสุดที่เคยลงดิสก์" แบบ sync — คืน 0 เมื่อไม่มีคีย์/ค่าเสีย (ไม่มีอะไรให้ยกพื้น)
 * ค่าที่ผู้ใช้แก้เองใน localStorage ได้ จึงต้อง sanitize: ยอมรับเฉพาะ integer ที่ finite และไม่ติดลบ
 */
export function loadGalleryMaxId(): number {
  try {
    const raw = localStorage.getItem(GALLERY_MAX_ID_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/**
 * ยก high-water mark ให้ครอบ id นี้ — monotonic เท่านั้น ไม่เคยลดลง
 * (record ถูก evict/ลบทิ้งได้ แต่ id ที่เคยแจกไปแล้วต้องไม่ถูกแจกซ้ำในเซสชันหน้า ไม่งั้นบั๊กเดิมกลับมา)
 * no-op เมื่อค่าใหม่ไม่ได้มากกว่าเดิม — เลี่ยง write ทุกครั้งที่เซฟ item
 */
export function bumpGalleryMaxId(id: number) {
  if (!Number.isFinite(id) || id <= 0) return;
  if (id <= loadGalleryMaxId()) return;
  writeLocalStorage(GALLERY_MAX_ID_KEY, String(Math.floor(id)));
}

/** ล้าง high-water mark — เรียกตอนผู้ใช้ปิด opt-in F2 (record ถูกลบหมดแล้ว ไม่มีอะไรให้กัน id ชนอีก) */
export function clearGalleryMaxId() {
  try {
    localStorage.removeItem(GALLERY_MAX_ID_KEY);
  } catch { /* best-effort เท่านั้น */ }
}

// ---------- queue-nonempty flag (เขียนตอน beforeunload, เทียบตอน boot) ----------
/** เขียนก่อนแท็บปิด/reload ว่าโหมดไหนมีคิวค้างอยู่บ้าง — ใช้เทียบตอน boot ว่าคิวนั้นหายไปจริงไหม (memory-only gallery/queue) */
export function saveQueueNonEmptyFlag() {
  try {
    const modesWithQueue = MODES.filter(m => state.modes[m].queue.length > 0);
    if (modesWithQueue.length) writeLocalStorage(QUEUE_NONEMPTY_KEY, JSON.stringify(modesWithQueue));
    else localStorage.removeItem(QUEUE_NONEMPTY_KEY);
  } catch { /* best-effort เท่านั้น — ไม่กระทบการใช้งานหลัก */ }
}

/** อ่าน flag ที่เขียนไว้ตอน unload ครั้งก่อน แล้วล้างทิ้งทันที (ใช้ได้ครั้งเดียวต่อ reload) */
export function consumeQueueNonEmptyFlag(): Mode[] {
  try {
    const raw = localStorage.getItem(QUEUE_NONEMPTY_KEY);
    localStorage.removeItem(QUEUE_NONEMPTY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((m): m is Mode => MODES.includes(m)) : [];
  } catch {
    return [];
  }
}

// ---------- session snapshot (PHASE 15) ----------
// เก็บ raw JSON string ตรงๆ (build ด้วย buildSessionData เดียวกับ exportSession ใน actions.ts) — store.ts
// ไม่รู้จัก shape ของ session data เอง แค่ทำหน้าที่ read/write ช่องเดียวนี้ให้เป็นระเบียบเหมือน key อื่นๆ ในไฟล์นี้
/** อ่าน snapshot ล่าสุดที่เขียนไว้ (ถ้ามี) — คืน null ถ้าไม่มีหรือ parse ไม่ขึ้น */
export function loadSessionSnapshotRaw(): string | null {
  try {
    return localStorage.getItem(SESSION_SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

/** เขียนทับ snapshot ช่องเดียว — เรียกจาก autosaveSessionSnapshot (ทุก ~30s ถ้ามีอะไรเปลี่ยน) และตอน beforeunload */
export function saveSessionSnapshotRaw(json: string) {
  writeLocalStorage(SESSION_SNAPSHOT_KEY, json);
}

/** ลบ snapshot ทิ้ง — เรียกหลังผู้ใช้กด "กู้คืน" สำเร็จแล้ว (กันกู้ซ้ำ) หรือตอนผู้ใช้กดลบแถวนี้ในหน้า Settings */
export function clearSessionSnapshot() {
  try {
    localStorage.removeItem(SESSION_SNAPSHOT_KEY);
  } catch { /* best-effort เท่านั้น */ }
}

// ---------- export log (PHASE 15) ----------
function isExportLogEntry(x: unknown): x is ExportLogEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as ExportLogEntry;
  return typeof e.label === "string" && typeof e.filename === "string" && typeof e.at === "number" && typeof e.modeSummary === "string";
}

/** ใหม่สุดอยู่หน้าสุด (index 0) — cap ที่ MAX_EXPORT_LOG ตัด oldest ทิ้งจากท้าย array */
export function loadExportLog(): ExportLogEntry[] {
  try {
    const raw = localStorage.getItem(EXPORT_LOG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isExportLogEntry).slice(0, MAX_EXPORT_LOG) : [];
  } catch {
    return [];
  }
}

/** เพิ่มเอนทรีใหม่เข้าหน้าสุดของ log แล้วตัดเกิน cap ทิ้งจากท้าย (oldest evicted first) */
export function addExportLogEntry(entry: ExportLogEntry) {
  const list = [entry, ...loadExportLog()].slice(0, MAX_EXPORT_LOG);
  writeLocalStorage(EXPORT_LOG_KEY, JSON.stringify(list));
}

/** ลบ log ทั้งหมด — ใช้จากปุ่ม "clear" ต่อแถวในหน้า Settings */
export function clearExportLog() {
  try {
    localStorage.removeItem(EXPORT_LOG_KEY);
  } catch { /* best-effort เท่านั้น */ }
}

// ---------- favorites (F3) ----------
// ทำไมไม่เก็บ id: `state.seq` เริ่มที่ 0 ใหม่ทุก reload (ดู initial state ท้ายไฟล์นี้) ดังนั้น GenItem.id
// ของ session ก่อนหน้าจะไปทับ id ของ item ที่เพิ่งสร้างใหม่ในเซสชันนี้ — กลายเป็นดาวไปโผล่ผิดรูป
// ซึ่งเป็นบั๊กที่หนักกว่า "ดาวหาย" เดิมเสียอีก (galleryStore.ts ก็สรุปเรื่องเดียวกันไว้ตอนออกแบบ primary key)
// จึงเก็บ "ลายนิ้วมือ" ที่ derive จากเนื้อของคำสั่งสร้างแทน: item ที่ผู้ใช้เห็นว่า "รูปเดียวกัน" คือ item ที่มาจาก
// prompt/model/ratio/duration/audio ชุดเดียวกัน — ค่าเหล่านี้อยู่ใน session snapshot/F2 record และไม่ผูกกับ seq เลย
// ทางเลือกอื่นที่ตัดทิ้ง: รอ F2 (IndexedDB) เก็บให้พร้อมตัว item — แต่ F2 เป็น opt-in ที่ default ปิด
// ผู้ใช้ที่ไม่เปิดจะยังเสียดาวอยู่ดี ซึ่งขัดกับ requirement ว่าดาวต้องไม่หายแม้ไม่ได้เปิด F2
export const MAX_FAVORITES_PER_MODE = 300; // กัน localStorage บวมจาก session ที่สะสมมานาน — ตัดของเก่าสุดออกจากท้าย

/**
 * separator ของคีย์ — U+001F (UNIT SEPARATOR) เป็น control char ที่พิมพ์ลงช่อง prompt ไม่ได้
 * และ field ที่เหลือทุกตัว (mode/model/ratio/duration/audio/status) เป็น enum หรือตัวเลขจากโค้ดเอง
 * ของเดิมใช้ " " ซึ่ง prompt มีได้แน่นอน = ["a b","c"] กับ ["a","b c"] ชนกัน (key collision)
 */
const FAV_SEP = "\u001F";

/**
 * hash ของ prompt — FNV-1a สองช่อง (offset/prime ต่างกัน) รันบน 32-bit ALU ของ JS แล้วต่อกันเป็น ~64-bit
 * โปรเจกต์นี้ไม่มี crypto lib และ SubtleCrypto เป็น async ส่วน favoriteKeyOf ถูกเรียกใน render path แบบ sync
 * ไม่ต้องเป็น cryptographic — แค่ต้อง collision ต่ำพอที่ดาวจะไม่ไปโผล่ผิดใบ
 */
function fnv1a2x32(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(36) + "." + h2.toString(36);
}

/**
 * ลายนิ้วมือของ item — ต้องคำนวณจากฟิลด์ที่ "รอด" ข้าม reload เท่านั้น ห้ามใส่ id/url/startedAt ลงไป
 *
 * PROMPT ถูก hash ไม่ฝังข้อความดิบ: Optimizer/Grill ของแอปเองผลิต prompt หลักพันตัวอักษรได้ง่ายมาก
 * ถ้าฝังดิบ 300 คีย์ × 5 โหมด จะกิน localStorage ระดับหลาย MB จนทะลุ quota แล้วคีย์อื่นของแอป
 * (history/template/session snapshot) ล้มตามไปทั้งหมด — ลดเหลือ ~60 byte ต่อคีย์คงที่ ไม่โตตาม prompt
 *
 * ลด collision 3 ชั้น เพราะ prompt ต่างกันแต่ hash ชนกัน = ดาวไปโผล่ผิดใบ:
 *   1. hash 2×32-bit (ต้องชนพร้อมกันทั้งคู่)
 *   2. ความยาว prompt — prompt คนละความยาวชนกันไม่ได้เลย
 *   3. prefix 24 ตัวแรก — prompt ที่จะชนต้องขึ้นต้นเหมือนกันด้วย
 * ทั้งสามชั้นมีขนาดคงที่ ไม่โตตามความยาว prompt จริง
 *
 * STATUS อยู่ในคีย์ (normalize เหลือ done/ไม่ done): กันการ์ด cancelled/error รับดาวข้ามมาจาก twin ที่ done
 * ซึ่งทำให้มันรอด "ล้างแกลเลอรี" ทั้งที่ผู้ใช้ไม่เคยกดดาวใบนั้น — แยกแค่สองค่าพอ เพราะชิ้นเดียวกันเดินทาง
 * loading → done ระหว่างทาง ถ้าแยกทุกสถานะคีย์จะเปลี่ยนกลางคันจนดาวหลุด
 */
export function favoriteKeyOf(item: { mode: Mode; prompt: string; model: string; ratio: string; duration: number; audio: boolean; status?: string }): string {
  const p = item.prompt ?? "";
  return [
    "v2",
    item.mode,
    item.status === "done" ? "d" : "x",
    item.model,
    item.ratio,
    String(item.duration),
    item.audio ? "1" : "0",
    String(p.length),
    fnv1a2x32(p),
    p.slice(0, 24),
  ].join(FAV_SEP);
}

/**
 * อ่านคีย์โปรดของโหมด — ทิ้งคีย์รูปแบบเก่า (v1) อย่างเงียบๆ ไม่ throw
 *
 * MIGRATION: v1 ฝัง prompt ดิบและใช้ space คั่น จึงแยกส่วนกลับมาไม่ได้แน่นอน (prompt มี space ได้)
 * การเดา split ผิดแล้ว re-hash = ดาวไปโผล่ผิดใบ ซึ่งแย่กว่าดาวหาย — เลือกทิ้งคีย์เก่าแทนการเดา
 * ผลกระทบจำกัดอยู่แค่ "ดาวที่เคยกดในเวอร์ชันก่อนหน้าหายไป" ส่วนตัวไฟล์/ผลงานไม่ได้หายตาม
 * และ v1 อยู่บน branch ที่ยังไม่ปล่อยจริง (T13 คอมมิตในสปรินต์เดียวกันนี้) ฐานผู้ใช้จริงจึงเป็นศูนย์
 */
export function loadFavorites(mode: Mode): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY_PREFIX + mode);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((x): x is string => typeof x === "string" && x.startsWith("v2" + FAV_SEP))
      .slice(0, MAX_FAVORITES_PER_MODE);
  } catch {
    return [];
  }
}

export function saveFavorites(mode: Mode, keys: string[]) {
  const trimmed = keys.slice(0, MAX_FAVORITES_PER_MODE);
  if (trimmed.length) writeLocalStorage(FAVORITES_KEY_PREFIX + mode, JSON.stringify(trimmed));
  else {
    try { localStorage.removeItem(FAVORITES_KEY_PREFIX + mode); } catch { /* best-effort เท่านั้น */ }
  }
}

/**
 * เวลาที่คีย์โปรดแต่ละอันถูกกดล่าสุด — เก็บแยกจากตัวลิสต์คีย์เพราะรูปแบบของลิสต์ (array ของ string)
 * ถูกอ่าน/เขียนจากหลายที่แล้ว การยัด object เข้าไปแทนจะพัง import/export และคีย์ที่ผู้ใช้มีอยู่เดิมทันที
 * ใช้โดย pruneOrphanFavorites() ตอน F2 ปิด ซึ่งพิสูจน์การมีอยู่จริงของ item ไม่ได้ จึงตัดตามอายุแทน
 * เป็น map เดียวรวมทุกโหมด — คีย์มี mode อยู่ในตัวอยู่แล้ว (ดู favoriteKeyOf) จึงไม่ชนกันข้ามโหมด
 */
export function loadFavoriteStamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FAVORITE_STAMPS_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) if (typeof v === "number") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function saveFavoriteStamps(stamps: Record<string, number>) {
  if (Object.keys(stamps).length) writeLocalStorage(FAVORITE_STAMPS_KEY, JSON.stringify(stamps));
  else {
    try { localStorage.removeItem(FAVORITE_STAMPS_KEY); } catch { /* best-effort เท่านั้น */ }
  }
}

function freshModeState(mode: Mode): ModeState {
  return {
    prompt: "",
    modelId: null,
    ratio: "1:1",
    count: 1,
    duration: 8,
    audio: false,
    refs: [], // memory-only โดยตั้งใจ เช่นเดียวกับ apiKey/gallery — data URL ใหญ่เกินจะลง localStorage
    images: [],
    queue: [],
    history: loadHistory(mode),
    selected: new Set(),
    lbIndex: -1,
    recentKeywords: [], // memory-only เหมือน refs/gallery — ไม่ persist ข้าม reload
    userTemplates: loadUserTemplates(mode),
    refiningParentId: null,
    negPrompt: "",
    bakeOffEnabled: false,
    bakeOffModelIds: [],
    voiceId: null,
    ttsVoices: [],
    ttsVoicesLoading: false,
  };
}

// apiKey เก็บใน sessionStorage — อยู่รอด refresh แต่หายเมื่อปิด tab/browser
export const state: AppState = {
  apiKey: loadApiKey(),
  assistModelId: loadAssistModelId(),
  models: [],
  videoModels: [],
  audioModels: [],
  speechModels: [],
  modelsFailed: false,
  videoModelsFailed: false,
  mode: "home",
  modes: {
    home: freshModeState("home"),
    infographic: freshModeState("infographic"),
    video: freshModeState("video"),
    cinematic: freshModeState("cinematic"),
    audio: freshModeState("audio"),
    tts: freshModeState("tts"),
  },
  seq: 0,
  keyModalOpen: false,
  chatOpen: false,
  chatMessages: loadChatHistory(),
  chatPending: false,
  grillOpen: false,
  grillMessages: [], // memory-only โดยตั้งใจ — บทสัมภาษณ์ผูกกับไอเดียชั่วคราว ไม่ต้องรอด reload
  grillPending: false,
  grillResult: null,
  optimize: { status: "idle", result: null, error: "" },
  extendItemId: null,
  toast: { msg: "", n: 0, variant: "info" },
  sidebarCollapsed: false,
  promptPlacement: loadPromptPlacement(),
  lbFormat: "png",
  autoSaveEnabled: false,
  autoSaveDirName: null,
  autoSaveConnecting: false,
  autoSaveSavedDirName: null,
  modelStats: {},
  restoreBanner: null,
  storageQuotaWarned: false,
  allHistoryOpen: false,
  importPending: null,
  importUnknownFields: {},
  shortcutsModalOpen: false,
  settingsModalOpen: false,
  bakeOffConfirmOpen: false,
  compareItems: null,
  userExtraModels: loadUserExtraModels(),
  spendLedger: loadSpendLedger(),
  spendConfirm: null,
  driveConnecting: false,
  driveConnected: false,
  locale: loadLocale(),
};

let version = 0;
const listeners = new Set<() => void>();

/** mutate state แล้ว broadcast ให้ทุก component ที่ useApp() re-render — แทน render() เดิมของ legacy */
export function mutate(fn?: (s: AppState) => void) {
  if (fn) fn(state);
  version++;
  for (const l of listeners) l();
}

export function useApp(): AppState {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    () => version
  );
  return state;
}

export const cur = () => state.modes[state.mode];

/** default "success" เพราะข้อความส่วนใหญ่ที่เรียกอยู่คือแจ้งผลสำเร็จ — call site ที่เป็น error ให้ส่ง toast(msg, "error") ชัดเจน */
export function toast(msg: string, variant: ToastVariant = "success") {
  mutate(s => { s.toast = { msg, n: s.toast.n + 1, variant }; });
}
