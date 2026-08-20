import { useSyncExternalStore } from "react";
import type { AppState, ChatMsg, ExportLogEntry, HistoryEntry, Mode, ModeState, ORModel, PendingJobEntry, PromptPlacement, PromptTemplate, ToastVariant } from "./types";
import { MAX_CHAT_HISTORY, MAX_EXPORT_LOG, MAX_USER_TEMPLATES, modeLabel, MODES } from "./constants";
import { PERMISSION_KEY as NOTIFY_PERMISSION_ASKED_KEY } from "./notify";

const HISTORY_KEY_PREFIX = "atelier_history_";
const CHAT_HISTORY_KEY = "atelier_chat_history";
const TEMPLATES_KEY_PREFIX = "atelier_templates_";
export const PROMPT_PLACEMENT_KEY = "atelier_prompt_placement";
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
  if (key === PENDING_JOBS_KEY) return "รายการงานค้าง (job ledger)";
  if (key === QUEUE_NONEMPTY_KEY) return "flag คิวค้างตอนปิดแท็บ";
  if (key === SESSION_SNAPSHOT_KEY) return "บันทึกเซสชันอัตโนมัติ";
  if (key === EXPORT_LOG_KEY) return "ประวัติ Export";
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

function loadApiKey(): string {
  try {
    return sessionStorage.getItem(API_KEY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string) {
  try {
    if (key) sessionStorage.setItem(API_KEY_KEY, key);
    else sessionStorage.removeItem(API_KEY_KEY);
  } catch { /* sessionStorage เต็มหรือถูกปิด — ข้ามไปเงียบๆ ไม่กระทบการใช้งานหลัก */ }
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
  };
}

// apiKey เก็บใน sessionStorage — อยู่รอด refresh แต่หายเมื่อปิด tab/browser
export const state: AppState = {
  apiKey: loadApiKey(),
  assistModelId: loadAssistModelId(),
  models: [],
  videoModels: [],
  audioModels: [],
  modelsFailed: false,
  videoModelsFailed: false,
  mode: "home",
  modes: {
    home: freshModeState("home"),
    infographic: freshModeState("infographic"),
    video: freshModeState("video"),
    cinematic: freshModeState("cinematic"),
    audio: freshModeState("audio"),
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
  driveConnecting: false,
  driveConnected: false,
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
