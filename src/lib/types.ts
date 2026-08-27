export type Mode = "home" | "infographic" | "video" | "cinematic" | "audio" | "tts";
/**
 * สถานะของ GenItem หนึ่งชิ้น — F1 Request Governor เพิ่ม "cancelled" เข้ามาเป็นค่าที่ 4
 *
 * ทำไมถึงเพิ่มค่าเข้า union ตรงๆ แทนที่จะใช้ฟิลด์แยกล้วนๆ (เช่น เก็บ status = "error" แล้วดูที่ cancelledAt):
 * - ทั้งโค้ดเบสไม่มี `switch (item.status)` และไม่มี exhaustive-check helper เลยสักที่ — ที่ใช้ status
 *   ทุกจุดเป็น `===` / `!==` เทียบค่าเดียว (Gallery.tsx, Sidebar.tsx, PromptComposer.tsx, actions.ts, notify.ts)
 *   การเพิ่มค่าเข้า union จึงไม่ทำให้ tsc พังแม้แต่จุดเดียว (ดู Impact ใน commit ของ T1)
 * - ถ้าใช้ status = "error" แทน งานที่ผู้ใช้ตั้งใจยกเลิกเองจะถูกนับเป็น fail ใน recordModelStat()
 *   (actions.ts:1028) และเด้ง desktop notification "งานล้มเหลว" (notify.ts:130) ทั้งที่ไม่ใช่ความผิดพลาด
 *   — เป็นการโกหกผู้ใช้และทำให้สถิติโมเดลเพี้ยน
 * - แลกมาด้วยข้อบังคับว่า **โค้ดเดิมทุกจุดที่ทำ `status !== "done"` ยังถูกต้องอยู่** (cancelled ไม่ใช่ done)
 *   ส่วนจุดที่ทำ `status === "error"` จะ "ไม่ match" item ที่ cancelled — ซึ่งเป็นพฤติกรรมที่ต้องการ
 *   (ไม่โชว์ error card สีแดง + ปุ่ม "ลองใหม่" แบบ error จริง) ผู้ implement (T2) ต้องเพิ่ม branch
 *   `status === "cancelled"` ใน Gallery Card เองเพื่อโชว์ UI ยกเลิก + ปุ่มสร้างใหม่
 */
export type GenStatus = "loading" | "done" | "error" | "cancelled";

/**
 * เหตุผลที่งานถูกยกเลิก — แยก "ผู้ใช้กดเอง" ออกจาก "ระบบสั่งปิด" เพราะสอง path นี้ปฏิบัติต่างกัน:
 * user-cancel ต้องโชว์ผลชัดเจนใน UI ว่าถูกยกเลิก ส่วน shutdown เกิดตอนหน้ากำลังจะหายไปอยู่แล้ว
 * จึงไม่ต้อง toast/notify ซ้ำ และไม่ควรนับเป็นสถิติอะไรทั้งนั้น
 *
 * - "user"     — ผู้ใช้กดปุ่มยกเลิกของ item ชิ้นนั้นโดยตรง
 * - "user-all" — ผู้ใช้กด "ยกเลิกทั้งหมด" (ยกเลิกทุกงานที่ยัง loading ในโหมดปัจจุบัน + ล้างคิวที่ยังไม่ได้ยิง)
 * - "shutdown" — หน้าเว็บกำลังปิด/reload (beforeunload/pagehide) หรือ governor ถูก dispose
 *                ห้าม toast, ห้าม fireNotification, ห้าม recordModelStat ในเคสนี้
 */
export type CancelReason = "user" | "user-all" | "shutdown";
export type ImgFormat = "png" | "jpg";
export type PromptPlacement = "sidebar" | "center";
export type ToastVariant = "success" | "error" | "info";
/** ภาษา UI ทั้งแอป (i18n Wave 0) — default เป็น "th" เสมอ ห้าม auto-detect จาก browser locale (ดู loadLocale ใน store.ts) */
export type Locale = "th" | "en";

export interface ORModel {
  id: string;
  name?: string;
  pricing?: { image?: string };
  architecture?: { output_modalities?: string[]; voices?: (string | TtsVoice)[] };
  // ฟิลด์เฉพาะโมเดลวิดีโอ (จาก /api/v1/videos/models)
  pricing_skus?: Record<string, string | number>;
  supported_durations?: number[];
  supported_aspect_ratios?: string[];
  generate_audio?: boolean;
  /**
   * รายชื่อ voice ของโมเดล TTS — ชื่อ field จริงจาก OpenRouter ยังไม่ยืนยัน (โมเดลยังไม่ list ใน
   * /api/v1/models ตอนเขียนโค้ดนี้) เผื่อไว้ทั้ง top-level และใต้ architecture, ทั้งแบบ string ล้วน
   * และแบบ object — extractVoices() ใน actions.ts เป็นคนลอง parse ทั้งสองที่ ถ้าไม่มีเลย fallback
   * ไปใช้ TTS_FALLBACK_VOICES (constants.ts)
   */
  voices?: (string | TtsVoice)[];
}

/** เสียงพากย์หนึ่งตัวของโมเดล TTS — name เป็น optional เพราะ fallback list มีแค่ id (ชื่อเสียงเป็นชื่อเฉพาะอยู่แล้ว) */
export interface TtsVoice {
  id: string;
  name?: string;
}

/** ประเภทของภาพอ้างอิงที่แนบไปกับ prompt — กำหนดข้อความกำกับที่ส่งให้โมเดล */
export type RefKind = "ref" | "style" | "facial";

export interface RefImage {
  kind: RefKind;
  /** data URL (base64) — อ่านจากไฟล์ที่ผู้ใช้เลือก แล้วส่งตรงเป็น image_url */
  dataUrl: string;
  name: string;
}

export interface GenItem {
  id: number;
  status: GenStatus;
  url: string | null;
  prompt: string;
  model: string;
  modelName: string;
  ratio: string;
  duration: number;
  audio: boolean;
  jobStatus: string;      // pending | in_progress ระหว่างรอ video job
  jobId: string | null;   // คงไว้ตอน error ที่งานยังไม่ตาย เพื่อ retry โดยไม่จ่ายซ้ำ
  startedAt: number | null;
  errMsg: string;
  mode: Mode;
  /** snapshot ของ ref ตอนกดสร้าง — retry/regenerate ใช้ชุดเดิมแม้ผู้ใช้เปลี่ยน ref ใน sidebar ไปแล้ว */
  refs: RefImage[];
  /**
   * id (GenItem.id) ของ item ต้นทางที่ item นี้ต่อยอดมา (เช่น image-refine หรือ Cinematic storyboard chaining)
   * null/undefined = root ของ chain — สร้างจาก prompt ตรงๆ ไม่ได้ต่อยอดจาก item ไหน (หรือเป็น synthetic root
   * ที่ startFromItem สร้างขึ้นตอน "Start from this") ดู cinematicChains ใน actions.ts สำหรับ storyboard strip
   */
  parentId?: number | null;
  /**
   * สถานะ Auto Save ต่อชิ้น — undefined/"idle" = ยังไม่เคยพยายามเซฟ (Auto Save ปิดอยู่ หรือยังไม่ถึงคิว retry)
   * "pending" = กำลังเซฟ/รอคิว retry อยู่, "saved" = เซฟสำเร็จแล้ว, "failed" = เซฟไม่สำเร็จ (permission หลุดหรือ write พลาด)
   */
  autoSaveStatus?: "idle" | "pending" | "saved" | "failed";
  /** ข้อความ error ล่าสุดของ Auto Save — ใช้แยกข้อความ "permission หมดอายุ" กับ "เขียนไฟล์พลาดชั่วคราว" ตอน retry */
  autoSaveErrMsg?: string;
  /**
   * สถานะ "Save to Drive" ต่อชิ้น — undefined/"idle" = ยังไม่เคยกดเซฟ, "pending" = กำลังอัพโหลด,
   * "saved" = อัพโหลดสำเร็จแล้ว, "failed" = อัพโหลดไม่สำเร็จ (token หมดอายุหรือ upload พลาด)
   * คนละเรื่องกับ autoSaveStatus (เซฟลงเครื่องอัตโนมัติ) — อันนี้กดเซฟทีละไฟล์/หลายไฟล์เอง ไม่ auto
   */
  driveSaveStatus?: "idle" | "pending" | "saved" | "failed";
  /** ข้อความ error ล่าสุดของ Save to Drive */
  driveSaveErrMsg?: string;
  /**
   * negative prompt ที่แนบไปตอนยิง request นี้ (snapshot ตอนกด generate — PHASE 14) — undefined/"" = ไม่มี
   * เก็บไว้ที่ item เพื่อให้ retry/regenerate ใช้ค่าเดิมได้แม้ผู้ใช้แก้ negPrompt ใน sidebar ไปแล้ว
   */
  negPrompt?: string;
  /**
   * id ร่วมของ batch "Bake-off" (PHASE 14) — ทุก item ที่ยิงจากการเปรียบเทียบหลายโมเดลครั้งเดียวกันได้ id เดียวกัน
   * (Date.now() ตอนกดยืนยัน) ใช้จัดกลุ่ม/แสดง badge ใน Gallery — undefined = generate ปกติ ไม่เกี่ยวกับ Bake-off
   */
  bakeOffGroupId?: number;
  /**
   * เหตุผลที่งานชิ้นนี้ถูกยกเลิก (F1 Request Governor) — undefined = ไม่เคยถูกยกเลิก
   * เซ็ตคู่กับ status = "cancelled" เสมอ: มี cancelReason แต่ status ไม่ใช่ "cancelled" ถือว่าเป็นบั๊ก
   * item ที่ถูกยกเลิกแล้วนำไปกด "สร้างใหม่" ต้องเคลียร์ทั้ง cancelReason และ cancelledAt ทิ้งพร้อมกัน
   */
  cancelReason?: CancelReason;
  /** Date.now() ตอนที่ยกเลิกสำเร็จ — undefined = ไม่เคยถูกยกเลิก ใช้โชว์เวลาใน UI และเรียงลำดับ */
  cancelledAt?: number;
  /**
   * ผู้ใช้กดดาวไว้ (F3 Gallery Filter & Favorites) — undefined/false = ยังไม่ได้กด
   * เป็น optional เพราะ item ที่สร้างก่อนฟีเจอร์นี้ (และ session snapshot เก่า) ไม่มีฟิลด์นี้
   * ทุกจุดที่อ่านต้องเช็คแบบ truthy (`!!item.favorite`) ห้ามสมมติว่ามีค่าเสมอ
   */
  favorite?: boolean;
  /**
   * เสียงพากย์ (voice id) ที่ snapshot ไว้ตอนกดสร้าง — เฉพาะโหมด tts เท่านั้น undefined ในโหมดอื่นทั้งหมด
   * เก็บไว้ที่ item ตาม pattern เดียวกับ refs/negPrompt เพื่อไม่ให้ retry/regenerate ใช้ voice ผิดตัว
   * ถ้าผู้ใช้ไปเปลี่ยน dropdown เสียงใน sidebar หลังยิง request นี้ไปแล้ว
   */
  ttsVoiceId?: string;
}

/* ============================================================================
 * F1 — Request Governor: cap + cancel  (contract ที่ตกลงไว้กับ T2/implementation)
 * ระดับ type ล้วน ไม่มี logic ในไฟล์นี้ — actions.ts เป็นคนทำจริง
 * ========================================================================== */

/**
 * เพดานจำนวน request ที่ยิงพร้อมกันได้จริง (in-flight) ต่อทั้งแอป ไม่ใช่ต่อโหมด
 *
 * ปัญหาเดิม: actions.ts:881 (generate) และ :986 (runBakeOff) ทำ `batch.forEach(item => runRequest(item))`
 * ยิงทั้ง batch พร้อมกันหมดไม่มี cap — worst case MAX_QUEUE(5) × COUNTS สูงสุด(6) = 30 fetch พร้อมกัน
 * เกิน connection limit ของ browser (~6 ต่อ origin) → request ที่เหลือค้างคิวใน browser โดยที่ผู้ใช้
 * ไม่เห็นความคืบหน้าอะไรเลย และยกเลิกไม่ได้
 *
 * ค่านี้เป็น "จำนวน slot" ของ governor: งานที่เกิน slot ต้องรอในคิวของ governor เอง (สถานะยัง "loading"
 * ในสายตาผู้ใช้) แล้วค่อยถูกปล่อยยิงเมื่อมี slot ว่าง — งานที่ยังไม่ได้ยิงจริงตอนถูกยกเลิก ต้องหลุดจากคิว
 * โดย **ไม่ต้องมี fetch เกิดขึ้นเลย** และไม่เสียเงิน
 *
 * >> ตัวค่าคงที่ย้ายไปอยู่ที่ `MAX_CONCURRENT_REQUESTS` ใน constants.ts แล้ว (T2) — ประกาศไว้ที่นั่นที่เดียว
 *    เพราะ constants.ts import จาก types.ts อยู่แล้ว การ re-export กลับจะกลายเป็น import cycle
 *    ไฟล์นี้เหลือไว้เฉพาะเหตุผลเชิง contract ส่วนค่าจริงอ่านจาก constants.ts
 */

/**
 * signature ที่ตกลงกันแล้วของ request layer ใน actions.ts — ทั้ง 4 ตัวรับ `signal: AbortSignal`
 * **ตัวเดียวกัน** ที่ runRequest ได้รับมา (ไม่มีใครสร้าง AbortController ของตัวเองข้างใน):
 *
 *   async function runRequest(item: GenItem, batchId?: number | null, signal?: AbortSignal): Promise<void>
 *   async function requestVideo(item: GenItem, signal: AbortSignal): Promise<string>
 *   async function requestAudio(item: GenItem, signal: AbortSignal): Promise<string>
 *   async function requestViaImageAPI(item: GenItem, signal: AbortSignal): Promise<string>
 *   async function requestViaChat(item: GenItem, signal: AbortSignal): Promise<string>
 *
 * กฎการใช้ signal:
 * 1. ทุก `fetch(...)` ในสี่ฟังก์ชันนั้นต้องส่ง `{ signal }` เข้าไปด้วย — รวมถึง fetch ที่โหลดไฟล์วิดีโอ
 *    จาก unsigned_urls[0] และ streaming fetch ของ requestAudio (ต้องหยุดอ่าน reader เมื่อ abort ด้วย)
 * 2. `sleep()` ระหว่าง poll วิดีโอต้องยกเลิกได้เช่นกัน ไม่งั้นการยกเลิกจะช้าได้ถึง VIDEO_POLL_MS_MAX (~20s)
 *    ให้ใช้ helper ที่ reject/resolve ทันทีเมื่อ signal abort แทน setTimeout เปล่าๆ
 * 3. runRequest เป็นคนเดียวที่แปลง abort → state: จับ error ที่ `signal.aborted === true` แล้วเซ็ต
 *    status = "cancelled" + cancelReason + cancelledAt — **ไม่ใช่** status = "error"
 * 4. path ที่ถูก cancel ต้อง **ไม่** เรียก recordModelStat() (actions.ts:1028), **ไม่** เรียก autoSaveItem(),
 *    และ **ไม่** เรียก notifyJobSettled() — งานที่ผู้ใช้ยกเลิกเองไม่ใช่ทั้งความสำเร็จและความล้มเหลวของโมเดล
 * 5. `signal` เป็น optional บน runRequest เพราะ caller เดิมที่ยิงงานเดี่ยว (retry, regenerate, auto-extend,
 *    resume จาก pending-job ledger) ยังเรียกแบบไม่ส่ง signal ได้ระหว่าง migrate — แต่ path หลัก
 *    (generate / runBakeOff) ต้องส่งเสมอ
 *
 * ---------------------------------------------------------------------------
 * INVARIANT (บังคับ ห้ามละเมิด) — abort ระหว่าง poll วิดีโอต้องคง item.jobId ไว้เสมอ
 * ---------------------------------------------------------------------------
 * ใน `requestVideo` (actions.ts:1177) มีสามจุดที่เซ็ต `item.jobId = null` ตั้งใจไว้แล้ว คือ
 * poll ตอบ 4xx, response ที่ completed แต่ไม่มีไฟล์, และ job status = "failed" — ทั้งสามจุดคือ
 * "งานนี้ตายแล้ว ไม่มีอะไรให้ resume"
 *
 * การยกเลิกโดยผู้ใช้ **ไม่ใช่** กรณีเหล่านั้น: job ยัง live อยู่ฝั่ง OpenRouter และ**จ่ายเงินไปแล้ว**
 * ดังนั้นเมื่อ abort เกิดขึ้นระหว่าง poll loop:
 *   - ห้ามเซ็ต item.jobId = null เด็ดขาด — ต้องคงค่าเดิมไว้
 *   - ห้ามลบ entry ออกจาก pending-job ledger (removePendingJob ใน runRequest:1032 ทำเฉพาะ done
 *     กับ error-ที่ไม่มี jobId เท่านั้น เงื่อนไขนั้นต้องไม่ถูกขยายให้ครอบ cancelled)
 * เพราะ jobId ที่คงไว้คือสิ่งเดียวที่ทำให้ผู้ใช้กด "ลองใหม่" แล้ว resume งานเดิมต่อได้โดยไม่จ่ายซ้ำ
 * (ตรรกะ resume คือ `let resumed = !!item.jobId` ที่ต้นฟังก์ชัน requestVideo) — ถ้าเผลอเซ็ต null
 * ผู้ใช้จะถูกเรียกเก็บเงินรอบสองสำหรับวิดีโอชิ้นเดิม
 * ========================================================================== */

export interface QueueJob {
  prompt: string;
  model: string;
  modelName: string;
  ratio: string;
  count: number;
  duration: number;
  audio: boolean;
  refs: RefImage[];
  /** negative prompt ที่ snapshot ไว้ตอนกดเพิ่มเข้าคิว (PHASE 14) — undefined/"" = ไม่มี, ไม่มีผลนอกโหมดภาพ */
  negPrompt?: string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/**
 * รายการที่โมเดล LLM แนะนำ (keyword ของ Optimizer, prompt มุมมองของ Grill me) — พร้อมเหตุผลสั้นๆ ประกอบ (optional)
 * โมเดล free-tier ตอบไม่คงเส้นคงวา: บางรายการอาจเป็น plain string ล้วนๆ แม้ใน response เดียวกัน จึงต้อง
 * เก็บทั้งสองรูปแบบไว้ตรงๆ แล้วให้ normalize helper (asExplainedItem ใน actions.ts) รองรับทั้งคู่ตอน parse
 */
export interface ExplainedItem {
  text: string;
  /** เหตุผลสั้นๆ บรรทัดเดียวว่าทำไมถึงแนะนำ — undefined ถ้าโมเดลไม่ได้ให้มา */
  why?: string;
}

export interface OptimizeResult {
  prompt: string;
  keywords: ExplainedItem[];
}

/** prompt หนึ่งมุมมองจากการตกผลึกของ Grill me */
export interface GrillPrompt {
  title: string;
  prompt: string;
  /** เหตุผลสั้นๆ ว่าทำไมมุมมองนี้ถึงน่าลอง — undefined ถ้าโมเดลไม่ได้ให้มา */
  why?: string;
}

/** chain เส้นตรงหนึ่งเส้นในโหมด cinematic — ไล่ตาม parentId จาก root ถึงปลายสุด (ดู cinematicChains ใน actions.ts) */
export interface StoryboardChain {
  /** id ของ root item (parentId: null) — ใช้เป็น React key ของ chain ทั้งเส้น */
  rootId: number;
  /** เรียงจาก root → ปลายสุดของ chain (เก่าสุดก่อน) — v1 เป็น chain เส้นตรงล้วน ไม่รองรับ branching */
  scenes: GenItem[];
  /** รวมวินาทีของทุก scene ที่ done แล้วใน chain นี้ */
  totalSeconds: number;
  /** รวมราคาประเมินของทุก scene ที่คำนวณราคาได้ใน chain นี้ — null ถ้าไม่มี scene ไหนคำนวณราคาได้เลย */
  totalCost: number | null;
  /** true ถ้ามี scene อย่างน้อยหนึ่งชิ้นใน chain ที่คำนวณราคาไม่ได้ (เช่น pricing แบบ token-based) — โชว์ "~" นำหน้ายอดรวม */
  hasUnknownCost: boolean;
}

/**
 * รายการ prompt history ต่อโหมด — ใช้ `at` เป็นตัวเรียงลำดับ/แสดงเวลาในอนาคต (search/pin UI)
 * แทน string เดิม เพื่อรองรับ pin และ metadata อื่นๆ ที่จะเพิ่มทีหลังโดยไม่ต้อง migrate schema ซ้ำ
 */
export interface HistoryEntry {
  text: string;
  /** ลำดับเวลาแบบ monotonic (นับจาก seq ไม่ใช่ Date.now() ตรงๆ) — ใหม่กว่า = ค่ามากกว่า */
  at: number;
  pinned: boolean;
  /** negative prompt ที่จับคู่กับ prompt นี้ตอนเซฟเข้า history (PHASE 14) — undefined/"" = ไม่มี */
  negPrompt?: string;
}

export interface ModeState {
  prompt: string;
  modelId: string | null;
  ratio: string;
  count: number;
  duration: number;
  audio: boolean;
  refs: RefImage[];
  images: GenItem[];
  queue: QueueJob[];
  history: HistoryEntry[];
  selected: Set<number>;
  lbIndex: number;
  /** keyword ล่าสุดที่ถูก toggle เข้า prompt ของโหมดนี้ (ใหม่สุดอยู่หน้าสุด, cap ~8) — โชว์เป็นแถว "ใช้ล่าสุด" เหนือ Prompt Builder */
  recentKeywords: string[];
  /** template ที่ผู้ใช้เซฟเองต่อโหมด (persist ผ่าน localStorage) — ใหม่สุดอยู่หน้าสุด, cap ที่ MAX_USER_TEMPLATES */
  userTemplates: PromptTemplate[];
  /**
   * id ของ item ที่กำลัง "Refine this" อยู่ (ตั้งจาก refineItem) — generate() อ่านค่านี้ไปใส่เป็น
   * parentId ของ item ใหม่ที่สร้างจาก prompt ตรงๆ (ไม่ใช่จากคิว) แล้วเคลียร์ทิ้งหลังใช้ครั้งเดียว
   */
  refiningParentId: number | null;
  /**
   * ข้อความ "สิ่งที่ไม่อยากเห็นในภาพ" (PHASE 14) — เฉพาะโหมดภาพ (home/infographic) เท่านั้น เพราะ path video/cinematic/audio
   * ไม่มี text prompt แบบเดียวกัน แนบเป็น "AVOID the following: …" ต่อท้าย prompt หลักตอนยิง request จริง (ดู buildChatContent)
   * ซ่อน/ไม่ส่งเลยถ้าโมเดลที่เลือกอยู่ routed ผ่าน image-only API (ไม่มี text slot ให้แนบเพิ่ม)
   */
  negPrompt: string;
  /** เปิด/ปิดโหมด Bake-off (PHASE 14) — เลือกได้หลายโมเดลพร้อมกันแทนเลือกทีละตัวจาก dropdown ปกติ */
  bakeOffEnabled: boolean;
  /** id โมเดลที่เลือกไว้สำหรับ Bake-off (สูงสุด MAX_BAKE_OFF_MODELS ตัว) — ยิงอิสระต่อตัว ไม่ผ่านคิว ไม่ถูก MAX_QUEUE จำกัด */
  bakeOffModelIds: string[];
  /**
   * สามฟิลด์ต่อไปนี้เฉพาะโหมด tts เท่านั้น (โหมดอื่นมีไว้เฉยๆ ไม่ถูกอ่าน) — แยกสามฟิลด์เพราะแต่ละตัวมีอายุ/
   * เหตุผลไม่เหมือนกัน รวมเป็นฟิลด์เดียวจะสื่อความหมายผิด:
   *  - voiceId ผูกกับโมเดลที่เลือกอยู่ (แต่ละโมเดล TTS มี voice list ของตัวเอง) ต้อง reset ทุกครั้งที่เปลี่ยนโมเดล
   *    ไม่งั้นจะยิง request ด้วย voice ที่โมเดลใหม่ไม่รู้จัก
   *  - ttsVoices เก็บ options ที่ fetch มาได้ (หรือ fallback) ไว้โชว์ใน dropdown — เปลี่ยนทุกครั้งที่เปลี่ยนโมเดล
   *  - ttsVoicesLoading กัน UI โชว์ dropdown ว่างเปล่าตอนกำลังโหลด (แทนที่จะเข้าใจผิดว่าโมเดลนี้ไม่มีเสียงให้เลือก)
   */
  voiceId: string | null;
  ttsVoices: TtsVoice[];
  ttsVoicesLoading: boolean;
}

/** Prompt Templates / Snippets Library — โครงร่าง prompt พร้อม placeholder แบบ {subject} ให้ผู้ใช้แก้ต่อ */
export interface PromptTemplate {
  id: string;
  label: string;
  text: string;
}

/** structural preset เฉพาะโหมด infographic — นอกจากแทรก instruction เข้า prompt ยังตั้ง ratio และ toggle keyword ที่เกี่ยวข้องให้ */
export interface InfographicPreset {
  id: string;
  label: string;
  /** วลี structural instruction ที่แทรกเข้า prompt */
  instruction: string;
  ratio: string;
  /** keyword ที่มีอยู่แล้วใน KEYWORDS_BY_MODE.infographic — toggle ผ่าน toggleKeyword เดิม ไม่ประดิษฐ์กลไกใหม่ */
  keywords: string[];
}

/** ระดับการรองรับภาพอ้างอิงของโมเดลหนึ่งตัว ใช้ทำ badge ใน dropdown เลือกโมเดล */
export type RefSupportLevel = "none" | "optional" | "required";

/**
 * เอนทรีของ "job ledger" ที่เขียนลง localStorage ทันทีหลัง submit job วิดีโอสำเร็จ (ได้ jobId กลับมา)
 * หรือหลังเริ่มยิง request เสียง (ไม่มี jobId ให้ resume แต่ยังต้อง track ไว้กันหายเงียบๆ ถ้าปิดแท็บกลางคัน)
 * ใช้ตอน boot เพื่อ resume/แจ้งเตือนงานที่ยังค้างอยู่ตอนแท็บถูกปิด/reload ระหว่างรอผลลัพธ์ (ดู PHASE 7 ใน actions.ts)
 */
export interface PendingJobEntry {
  /** GenItem.id ของงานนี้ตอนสร้าง — ใช้ผูกกับ item สังเคราะห์ที่สร้างขึ้นใหม่ตอน resume */
  id: number;
  mode: Mode;
  /** null = ไม่มี job id ให้ resume (เช่น audio ที่ยิงผ่าน streaming chat/completions ล้วนๆ) */
  jobId: string | null;
  model: string;
  modelName: string;
  /** prompt ที่ตัดให้สั้นไว้แค่โชว์ผล — ไม่ใช่ prompt เต็มที่ใช้ resume จริง (resume ใช้ jobId poll ต่อเท่านั้น ไม่ resubmit) */
  promptPreview: string;
  startedAt: number;
}

/**
 * เอนทรีบันทึกไว้ใน "ประวัติ Export" (PHASE 15) — เก็บแค่ metadata เบาๆ ไม่เก็บ payload จริงเลย
 * (payload คือไฟล์ .json ที่ดาวน์โหลดไปแล้ว ไม่ต้องเก็บซ้ำ) แสดงใน Header ใต้ปุ่ม Export — cap ที่ MAX_EXPORT_LOG
 */
export interface ExportLogEntry {
  /** label ที่ผู้ใช้พิมพ์เอง ("" = ไม่ได้พิมพ์ → โชว์ label ด้วย fmt วันเวลาแทนตอน render) */
  label: string;
  filename: string;
  at: number; // Date.now() ตอน export
  /** สรุปสั้นๆ ว่าแต่ละโหมดมีอะไรบ้างตอน export ("Home: 3 · Video: 1" ฯลฯ) — ไม่ใช่ data จริง */
  modeSummary: string;
}

/**
 * ผลตรวจ preview ก่อนตัดสินใจ Import — คำนวณจากไฟล์ที่เลือกเทียบกับ state ปัจจุบัน
 * ใช้แสดง diff summary ในโมดัล ImportPreview ก่อนผู้ใช้เลือก Replace/Merge (ดู actions.ts diffImportSession)
 */
export interface ImportDiffPerMode {
  mode: Mode;
  /** จำนวน history entry ใหม่ที่ไฟล์นี้มีแต่ state ปัจจุบันไม่มี (เทียบด้วย text) — นับรวมทั้ง Replace/Merge preview */
  newHistoryCount: number;
  /** true ถ้า prompt/ratio/count/duration/audio ของโหมดนี้ในไฟล์ต่างจากปัจจุบัน (Replace จะเขียนทับ, Merge จะไม่แตะ) */
  promptWillChange: boolean;
  /** จำนวนงานในคิวของไฟล์นี้ที่จะถูกรวมเพิ่มเข้าไป (Merge) หลัง union ถึง MAX_QUEUE แล้ว */
  queueMergeCount: number;
}

export interface ImportPreview {
  fileVersion: number;
  perMode: ImportDiffPerMode[];
}

export interface AppState {
  apiKey: string;
  /**
   * โมเดล LLM ที่ผู้ใช้เลือกเองสำหรับ Optimizer/Chat/Grill me แทนโมเดล free-tier ที่ hardcode ไว้
   * null = ใช้ default เดิม (OPTIMIZER_MODEL/CHAT_MODEL/GRILL_MODEL) — persist ผ่าน localStorage (ไม่ใช่ secret เหมือน apiKey)
   */
  assistModelId: string | null;
  models: ORModel[];
  videoModels: ORModel[];
  /** โมเดลเสียง (Lyria) — คัดจาก fetch เดียวกับ models ตาม AUDIO_MODEL_IDS + fallback */
  audioModels: ORModel[];
  /** โมเดล TTS (Gemini 3.1 Flash TTS) — คัดจาก fetch เดียวกับ models ตาม TTS_MODEL_IDS + fallback (ดู TTS_EXTRA_MODELS) */
  speechModels: ORModel[];
  modelsFailed: boolean;
  videoModelsFailed: boolean;
  mode: Mode;
  modes: Record<Mode, ModeState>;
  seq: number;
  keyModalOpen: boolean;
  chatOpen: boolean;
  chatMessages: ChatMsg[];
  chatPending: boolean;
  /** Grill me — LLM สัมภาษณ์ทีละข้อแล้วตกผลึกเป็นชุด prompt (memory-only เหมือน gallery) */
  grillOpen: boolean;
  grillMessages: ChatMsg[];
  grillPending: boolean;
  grillResult: GrillPrompt[] | null;
  optimize: {
    status: "idle" | "loading" | "done" | "error";
    result: OptimizeResult | null;
    error: string;
  };
  /** id ของ item ที่เปิด TimeFrame & Extend tool อยู่ (โหมด cinematic) — null = ปิด */
  extendItemId: number | null;
  /** variant กำหนดสี/ไอคอนใน Toast — undefined ของ n=0 เริ่มต้น (ยังไม่เคย toast) ไม่มีผลเพราะ msg ว่างอยู่แล้ว */
  toast: { msg: string; n: number; variant: ToastVariant };
  sidebarCollapsed: boolean;
  promptPlacement: PromptPlacement;
  lbFormat: ImgFormat;
  /** Auto Save — เซฟผลลัพธ์ที่ done ลง directory ที่ user เลือกไว้ผ่าน File System Access API */
  autoSaveEnabled: boolean;
  /** ชื่อ directory ที่เลือกไว้ (แสดงผลเท่านั้น — handle จริงเก็บนอก state เพราะไม่ serializable) */
  autoSaveDirName: string | null;
  /** true ระหว่างที่รอ user เลือก/ยืนยัน permission directory */
  autoSaveConnecting: boolean;
  /** ชื่อ directory ที่เคยเชื่อมต่อไว้ใน session ก่อน (จาก IndexedDB) — ใช้โชว์ปุ่ม "เชื่อมต่อใหม่" ก่อนขอ permission จริง */
  autoSaveSavedDirName: string | null;
  /**
   * สถิติสำเร็จ/ล้มเหลวต่อโมเดลใน session นี้ (memory-only ไม่ persist) — key คือ model id
   * นับเฉพาะตอนยิง request จริงแล้วได้ผลลัพธ์ (สำเร็จ/error) ไม่นับ pre-flight validation เช่นขาดภาพอ้างอิง
   */
  modelStats: Record<string, { ok: number; fail: number }>;
  /**
   * banner "restore last session" — ตั้งค่าครั้งเดียวตอน boot จาก reconcilePendingJobs() (ดู actions.ts)
   * เมื่อเจองานที่ resume ไม่ได้ และ/หรือคิวที่หายไปตอน reload, และ/หรือมี session snapshot (PHASE 15) ที่ต่าง
   * จาก state สดที่เพิ่งสร้างใหม่ — รวมเป็น banner เดียวกันเสมอ ไม่โชว์ซ้อนสองอันตอน boot
   * canRestoreSnapshot: true ถ้ามี snapshot ให้กดกู้ได้จริง — โชว์ปุ่ม "กู้คืน" เพิ่มจากปุ่มปิดเฉยๆ
   * null = ไม่มีอะไรให้แจ้ง/ปิดไปแล้ว
   */
  restoreBanner: { message: string; canRestoreSnapshot: boolean } | null;
  /** true ถ้าเคย toast เตือน localStorage เต็มไปแล้วอย่างน้อยหนึ่งครั้งใน session นี้ — กันเตือนซ้ำทุกครั้งที่เขียนพลาด */
  storageQuotaWarned: boolean;
  /** true ถ้าเปิดแผง "ประวัติทั้งหมด" (cross-mode prompt history) อยู่ — toggle จาก Sidebar */
  allHistoryOpen: boolean;
  /** ไฟล์ที่เลือก import ไว้รอผู้ใช้ยืนยัน Replace/Merge — null = ไม่มีโมดัลค้างอยู่ (ดู ImportPreviewModal) */
  importPending: { raw: unknown; preview: ImportPreview } | null;
  /**
   * key ที่ไม่รู้จักต่อโหมด (มาจาก field ของ session version ใหม่กว่าที่ build นี้ยังไม่รองรับ) — เก็บไว้เฉยๆ
   * ไม่ตีความ/ไม่ใช้งาน แค่ round-trip กลับออกไปตอน export ครั้งถัดไป กัน forward-compat data หายระหว่างทาง
   */
  importUnknownFields: Partial<Record<Mode, Record<string, unknown>>>;
  /** true ถ้าเปิดโมดัล cheat-sheet ปุ่มลัด (Shift+?) อยู่ — toggle จาก useKeyboardShortcuts */
  shortcutsModalOpen: boolean;
  /** true ถ้าเปิด Settings modal อยู่ (storage breakdown / โมเดลผู้ช่วย AI / เพิ่มโมเดลเอง — ย้ายมาจาก Advanced ของ KeyModal) */
  settingsModalOpen: boolean;
  /** true ถ้าเปิดโมดัลยืนยันค่าใช้จ่ายก่อนยิง Bake-off จริงอยู่ (PHASE 14) — เปิดจากปุ่ม Generate ตอน bakeOffEnabled */
  bakeOffConfirmOpen: boolean;
  /**
   * snapshot ของ item ที่เลือกไว้ตอนกด Compare (2–4 ชิ้น) — เก็บสำเนา ณ ตอนเปิดเท่านั้น ไม่ live-bind กับ selection
   * ที่อาจเปลี่ยนต่อระหว่างเปิดโมดัลอยู่ — null = โมดัล Compare ปิดอยู่
   */
  compareItems: GenItem[] | null;
  /**
   * โมเดลที่ผู้ใช้เพิ่มเองผ่านหน้า Settings (JSON array รูปแบบเดียวกับ EXTRA_MODELS/AUDIO_EXTRA_MODELS)
   * persist ผ่าน localStorage แยกจาก apiKey เพราะไม่ใช่ secret — merge เข้า models/audioModels ต่อจาก EXTRA_MODELS เดิม
   */
  userExtraModels: ORModel[];
  /**
   * F4 Spend Guard — ยอดใช้จ่ายประเมินสะสมข้ามโหมด + เพดานที่ผู้ใช้ตั้ง (ดู SpendLedger ท้ายไฟล์)
   * โหลดจาก `SPEND_LEDGER_KEY` ตอน boot — `undefined` = ยังไม่ได้ initialize (build ที่ยังไม่ wire F4)
   *
   * เป็น optional โดยตั้งใจ ไม่ใช่ความมักง่าย: `state` ใน store.ts ถูกประกอบเป็น object literal ก้อนเดียว
   * ฟิลด์ required ใหม่จะทำให้ literal นั้น type error ทันที ซึ่ง T15 (contract-only, แตะได้แค่ types.ts)
   * แก้ให้ไม่ได้ — T16 เป็นคนใส่ค่า initial ที่ store.ts พร้อมกับตอน implement logic จริง
   * ทุกจุดที่อ่านต้องเผื่อ `undefined` เสมอ (`state.spendLedger?.capUsd`) ห้ามสมมติว่ามีค่า
   */
  spendLedger?: SpendLedger;
  /**
   * F4 Spend Guard — payload ของโมดัลยืนยันค่าใช้จ่ายที่ค้างอยู่ (ดู SpendConfirmRequest ท้ายไฟล์)
   * `null`/`undefined` = ไม่มีโมดัลเปิดอยู่ — pattern เดียวกับ `importPending`/`compareItems`
   *
   * นี่คือ "state flag" ที่ทำให้ `generate()` ยังเป็น sync ได้: gate ตั้งค่านี้แล้ว return
   * ส่วนปุ่มยืนยันในโมดัลเป็นคนเรียก `generate()` รอบสอง (pattern เดียวกับ bakeOffConfirmOpen)
   */
  spendConfirm?: SpendConfirmRequest | null;
  /** true ระหว่างที่รอ user ยืนยัน OAuth consent ของ Google Drive (เปิด popup GIS อยู่) */
  driveConnecting: boolean;
  /** true ถ้ามี access token ที่ยังใช้ได้อยู่ตอนนี้ (memory-only — ต้องเชื่อมต่อใหม่ทุก reload เหมือน Auto Save) */
  driveConnected: boolean;
  /**
   * ภาษา UI ทั้งแอป (i18n Wave 0) — persist ผ่าน `LOCALE_KEY` ใน localStorage (ดู store.ts)
   * required ไม่ใช่ optional เพราะ `state` ใน store.ts ประกอบ object literal แบบ synchronous เสมอ
   * ทุกจุดที่อ่านค่านี้ไม่ต้องเผื่อ undefined
   */
  locale: Locale;
}


/* ============================================================================
 * F4 — Spend Guard: contract ของยอดใช้จ่ายสะสม + จุด gate ก่อนจ่ายเงิน
 * (ตกลงไว้กับ T16/implementation) ระดับ type ล้วน ไม่มี logic ในไฟล์นี้ — actions.ts/store.ts เป็นคนทำจริง
 * ========================================================================== */

/**
 * คีย์ localStorage เดียวของ F4 — เก็บทั้ง SpendLedger (ยอดสะสม + เพดาน) เป็น JSON ก้อนเดียว
 *
 * ทำไมคีย์เดียวไม่แยกสองคีย์ (ยอด/เพดาน): ทั้งสองค่าถูกอ่านคู่กันเสมอตอน gate ตัดสินใจ ถ้าแยกคีย์แล้ว
 * เขียนพลาดไปตัวเดียว (quota เต็มกลางคัน) จะได้ ledger ครึ่งใบที่เพดานกับยอดมาจากคนละช่วงเวลา
 *
 * ต้องขึ้นต้น `atelier_` เสมอ เพราะ `estimateAtelierStorageBytes()`, per-key breakdown และปุ่มล้างใน
 * KeyModal Advanced ทั้งหมดกวาดด้วย `STORAGE_KEY_PREFIX` (store.ts:29) — คีย์ที่ไม่ขึ้นต้นแบบนี้จะกลายเป็น
 * ข้อมูลผีที่ผู้ใช้มองไม่เห็นและลบไม่ได้
 *
 * >> การเขียนต้องผ่าน `writeLocalStorage()` ของ store.ts (store.ts:36) เท่านั้น ห้ามเรียก
 *    `localStorage.setItem()` ตรงๆ — helper ตัวนั้นดัก QuotaExceededError แล้วตั้ง `storageQuotaWarned`
 *    ให้ toast เตือนครั้งเดียว การเขียนตรงจะพัง state นั้น และโยน exception กลางฟังก์ชัน gate
 */
export const SPEND_LEDGER_KEY = "atelier_spend_ledger";

/**
 * ยอดใช้จ่ายประเมินสะสม + เพดานที่ผู้ใช้ตั้งไว้ — **ข้ามโหมด** (รวม home/infographic/video/cinematic/audio
 * เป็นตัวเลขเดียว) ต่างจาก usage bar เดิมที่ Sidebar.tsx:105-123 คิดจาก `ms.images` ของโหมดปัจจุบันอย่างเดียว
 * และหายไปทุกครั้งที่สลับโหมด
 *
 * ยอดนี้เป็น **ยอดประเมิน (estimate)** ไม่ใช่ยอดจริงจาก OpenRouter — ไม่มี spend API ให้เรียก คำนวณจาก
 * `computeItemCost()` (actions.ts:2268) ล้วนๆ ทุกจุดที่แสดงผลต้องกำกับว่าเป็นค่าประมาณ ห้ามโชว์เป็นยอดบิลจริง
 *
 * --------------------------------------------------------------------------
 * นับยอดจาก item สถานะไหน — ตัดสินใจแล้ว: นับ `loading` (ที่ยิงจริงแล้ว) + `done` + `cancelled` ที่มี `jobId`
 * --------------------------------------------------------------------------
 * หลักเกณฑ์เดียวคือ **"request ถูกยิงออกไปจริงหรือยัง"** ไม่ใช่ "ได้ผลลัพธ์กลับมาหรือยัง" เพราะ ledger นี้
 * มีไว้กันเงินหมด ไม่ใช่มีไว้นับรูปที่ได้:
 *
 *  - `done`      → **นับ** ยิงไปแล้วและได้ผล จ่ายเงินแน่นอน
 *  - `loading`   → **นับ** ทันทีที่ request ถูกยิงจริง (หลุดจากคิว governor เข้า in-flight แล้ว)
 *                  ถ้ารอให้ done ค่อยนับ ผู้ใช้ยิง batch 30 ชิ้นรวดเดียวจะผ่าน gate ได้ทั้งชุด เพราะตอนเช็ค
 *                  ยอดยังเป็น 0 อยู่ — ซึ่งคือบั๊กที่ฟีเจอร์นี้มีไว้แก้พอดี
 *                  >> item ที่ยัง **รอคิวใน governor** (ยังไม่มี fetch เกิดขึ้น) ห้ามนับ แม้ status จะเป็น
 *                     "loading" ในสายตาผู้ใช้ก็ตาม — ดู MAX_CONCURRENT_REQUESTS ใน constants.ts (F1/T2)
 *  - `cancelled` **ที่ `jobId != null`** → **นับ** งานวิดีโอที่ submit ไปแล้วได้ job id กลับมา = ฝั่ง
 *                  OpenRouter เริ่มประมวลผลและคิดเงินแล้ว ผู้ใช้กดยกเลิกฝั่ง client ไม่ได้เงินคืน
 *                  (invariant จาก T1: `finalizeCancelled` ห้ามล้าง jobId ทิ้ง — พึ่งได้)
 *  - `cancelled` ที่ `jobId == null` → **ไม่นับ** ยกเลิกตั้งแต่ยังไม่หลุดคิว governor ไม่มี fetch เกิดขึ้น
 *  - `error`     → **ไม่นับ** request ล้มเหลว ไม่มี output ให้เก็บเงิน
 *                  >> ยกเว้นเคสเดียว: item ที่ `status === "error"` แต่ยังคง `jobId` ไว้เพื่อ retry
 *                     (งานวิดีโอที่ job ยังไม่ตาย ดู GenItem.jobId) — เคสนี้ **นับ** เพราะจ่ายไปแล้ว
 *                     และการกด retry จะ resume job เดิม ไม่ยิงซ้ำ (จึงไม่ต้องกลัวนับซ้ำ)
 *
 * กติกากันนับซ้ำ: หนึ่ง `GenItem.id` ต้องบวกเข้า `totalUsd` ได้ **ครั้งเดียวตลอดอายุของมัน** — item ที่เดินทาง
 * loading → done ต้องไม่ถูกบวกสองหน implementation จึงต้อง track id ที่บวกไปแล้ว ไม่ใช่ re-scan gallery
 * แล้ว sum ใหม่ทุกครั้ง (gallery ถูก evict/ลบได้ ยอดจะหดลงเองอย่างไม่ถูกต้อง — ledger ต้องเป็น monotonic)
 */
export interface SpendLedger {
  /**
   * ยอดสะสมประเมิน (USD) ของทุก item ที่เข้าเกณฑ์ "ยิงจริงแล้ว" ข้างบน — ข้ามโหมด และ **นับเฉพาะ item
   * ที่ `computeItemCost()` คืนตัวเลขได้** item ที่คืน `null` ไปโผล่ที่ `unknownCostCount` แทน ห้ามบวก 0 เข้ามาที่นี่
   *
   * monotonic ขึ้นอย่างเดียว ลดได้ทางเดียวคือผู้ใช้กดล้างยอดเอง — การลบการ์ดออกจาก gallery หรือ eviction
   * ของ F2 **ต้องไม่** ทำให้ยอดนี้ลด เพราะเงินจ่ายไปแล้วจริง
   */
  totalUsd: number;

  /**
   * จำนวน item ที่เข้าเกณฑ์นับแล้ว แต่ `computeItemCost()` คืน `null` (เช่นโมเดล pricing แบบ token-based
   * หรือโมเดลที่หลุดจาก `state.models`/`state.videoModels` ไปแล้ว) — เก็บแยกเพราะ **`null` ไม่ใช่ 0**
   *
   * ทำไมต้องมีช่องนี้: ถ้ากลืน null เป็น 0 เงียบๆ ยอดสะสมจะต่ำกว่าความจริงโดยไม่มีใครรู้ แล้ว gate จะปล่อยผ่าน
   * ทั้งที่จริงเลยเพดานไปแล้ว — ซึ่งอันตรายกว่าการเตือนเกินจริง ทุกจุดที่แสดง `totalUsd` ต้องแสดงหมายเหตุ
   * "+N ชิ้นไม่ทราบราคา" เมื่อค่านี้ > 0 (pattern เดียวกับ `hasUnknown` ใน BakeOffConfirmModal)
   *
   * gate ห้ามตีความ item ที่ไม่ทราบราคาว่า "ฟรีจึงผ่านได้" — เมื่อ batch ที่กำลังจะยิงมี item ที่ไม่ทราบราคา
   * ปนอยู่ ต้องเด้ง modal ให้ผู้ใช้เห็นเสมอ แม้ยอดที่คำนวณได้จะยังไม่ถึงเพดาน
   */
  unknownCostCount: number;

  /**
   * `Date.now()` ตอนที่เริ่มนับรอบปัจจุบัน — ตั้งครั้งแรกตอนสร้าง ledger และตั้งใหม่ทุกครั้งที่ผู้ใช้กดล้างยอด
   *
   * **ตัดสินใจแล้ว: ยอดสะสมข้าม session** (persist ลง localStorage ไม่ใช่ sessionStorage) และไม่ auto-reset
   * ตามวัน/สัปดาห์:
   *  - เงินที่จ่ายไป OpenRouter ไม่ได้หายไปตอนปิดแท็บ ledger ที่ reset เองทุก session จะสร้างความรู้สึกปลอดภัย
   *    ผิดๆ — ผู้ใช้เปิดปิดแท็บสิบรอบแล้วจ่ายจริงสิบเท่าของเพดานได้ โดย gate ไม่เคยเตือนเลยสักครั้ง
   *  - auto-reset ตามปฏิทิน (รายวัน/รายเดือน) ต้องเดา timezone และรอบบิลของผู้ใช้ ซึ่งเดาผิดแล้วเสียหายเงียบ
   *    ปล่อยให้ผู้ใช้ล้างเองตอนที่รู้ว่ารอบบิลตัดแล้วดีกว่า
   * UI จึงต้องแสดง `startedAt` คู่กับยอดเสมอ ("ยอดสะสมตั้งแต่ <วันที่>") ไม่งั้นตัวเลขจะไม่มีความหมาย
   *
   * >> การล้างยอดที่ผู้ใช้กดเอง ต้องเซ็ต `totalUsd = 0`, `unknownCostCount = 0` และ `startedAt = Date.now()`
   *    **พร้อมกันทั้งสามค่า** — reset ยอดแต่ไม่ reset เวลา = ยอดที่อ่านผิดความหมาย
   */
  startedAt: number;

  /**
   * เพดานที่ผู้ใช้ตั้งไว้ (USD) — `undefined` = **ยังไม่ได้ตั้ง = ปิดฟีเจอร์** gate ปล่อยผ่านเงียบๆ ทุกครั้ง
   *
   * แยก "ไม่ได้ตั้ง" ออกจาก "ตั้งเป็น 0" ด้วย `undefined` vs `0` โดยตั้งใจ — สองอย่างนี้ความหมายตรงข้ามกัน:
   *  - `undefined` → ไม่มีเพดาน ไม่ต้องถามอะไรเลย (ค่า default ของผู้ใช้ใหม่ ต้องไม่มี modal โผล่มากวน)
   *  - `0`         → **เพดานศูนย์ = เข้มที่สุด** ทุก generate ที่มีค่าใช้จ่าย > 0 ต้องผ่าน modal ยืนยันหมด
   *                  (โหมด "ถามฉันทุกครั้ง") ไม่ใช่ "ปิดฟีเจอร์"
   *
   * ห้าม implement ด้วย `capUsd || DEFAULT` หรือ `if (!capUsd) return` เด็ดขาด — `0` เป็น falsy จะกลืน
   * เคสเข้มที่สุดกลายเป็นเคสปิดฟีเจอร์พอดี ต้องเช็ค `capUsd === undefined` ตรงๆ เท่านั้น
   *
   * ค่าติดลบ/NaN ถือว่าไม่ถูกต้อง — ตอนอ่านจาก localStorage ที่ผู้ใช้แก้เองได้ ต้อง sanitize ทิ้งเป็น `undefined`
   */
  capUsd?: number;
}

/**
 * payload ของโมดัลยืนยันค่าใช้จ่ายก่อนยิง batch ปกติ (F4) — snapshot ณ ตอนที่ gate ตัดสินใจเด้ง
 * `null` = ไม่มีโมดัลค้างอยู่ (pattern เดียวกับ `importPending` / `compareItems` ใน AppState)
 *
 * เป็น snapshot ไม่ใช่ live-bind: ผู้ใช้อาจไปแก้ prompt/count/model ใน sidebar ระหว่างที่โมดัลเปิดอยู่
 * ตัวเลขที่เห็นตอนกดยืนยันต้องเป็นชุดเดียวกับที่คำนวณตอนเด้ง ไม่ใช่ชุดที่เปลี่ยนไปแล้ว
 */
export interface SpendConfirmRequest {
  /** จำนวน item ทั้งหมดที่ batch นี้จะสร้าง (รวมทุก job ในคิว x count ของแต่ละ job) */
  itemCount: number;
  /** ยอดประเมินของ batch นี้อย่างเดียว (USD) — ไม่รวมยอดสะสมเดิม */
  batchUsd: number;
  /** จำนวน item ใน batch นี้ที่คำนวณราคาไม่ได้ — > 0 ต้องโชว์หมายเหตุ ห้ามเงียบ (ดู unknownCostCount) */
  batchUnknownCount: number;
  /** `SpendLedger.totalUsd` ณ ตอนเด้งโมดัล — โชว์คู่กับ batchUsd ให้เห็นว่ารวมแล้วไปถึงไหน */
  ledgerUsd: number;
  /** `SpendLedger.capUsd` ณ ตอนเด้งโมดัล — undefined ที่นี่เป็นไปไม่ได้ในทางปฏิบัติ (gate จะไม่เด้งเลย) */
  capUsd?: number;
  /**
   * ทำไม gate ถึงเด้ง — ใช้เลือกข้อความในโมดัลให้ตรงเหตุ ไม่ใช่ข้อความกลางๆ อันเดียวใช้ทุกเคส
   *  - "over-cap"     — `ledgerUsd + batchUsd` เกิน `capUsd` แล้ว
   *  - "already-over" — ยอดสะสมเดิมเกินเพดานไปก่อนหน้านี้แล้ว batch นี้ยิ่งเกินหนักขึ้น
   *  - "unknown-cost" — ยังไม่เกินเพดานที่คำนวณได้ แต่ batch มี item ที่ไม่ทราบราคาปนอยู่ จึงยืนยันยอดไม่ได้
   */
  reason: "over-cap" | "already-over" | "unknown-cost";
}

/**
 * ============================================================================
 * F4 — จุดแทรก gate ใน `generate()` และเหตุผลว่าทำไมต้องตรงนั้น (สัญญากับ T16)
 * ============================================================================
 *
 * ## sync/async — `generate()` ยังคงเป็น sync function ตามเดิม
 *
 * `generate()` (actions.ts:842) เป็น `export function generate()` แบบ sync แต่ gate ที่ต้องเด้งโมดัลแล้ว
 * **รอผู้ใช้กดยืนยัน** เป็น async โดยธรรมชาติ ทางแก้ที่เลือกคือ **ทำตาม pattern เดิมของ Bake-off เป๊ะๆ
 * ไม่ประดิษฐ์ promise/callback ใหม่**:
 *
 *   Bake-off ทำแบบนี้ (อ่านจากโค้ดจริง):
 *     - `openBakeOffConfirm()`  actions.ts:1016 — ตั้ง state flag `bakeOffConfirmOpen = true` แล้ว **return ทันที**
 *     - `BakeOffConfirmModal`   render จาก flag นั้น (`if (!s.bakeOffConfirmOpen) return null`)
 *     - `confirmBakeOff()`      actions.ts:1026 — ปิด flag แล้ว **เรียก `runBakeOff()` ใหม่อีกรอบ** เป็น entry point ที่สอง
 *     - `closeBakeOffConfirm()` actions.ts:1021 — ปิด flag เฉยๆ ไม่ทำอะไรต่อ = ยกเลิก
 *   ไม่มี promise, ไม่มี callback, ไม่มี async ที่ไหนเลย — เป็น state machine ผ่าน store ล้วนๆ
 *
 * F4 ใช้กลไกเดียวกัน: gate ที่ไม่ผ่านจะ **ตั้ง `spendConfirm` (SpendConfirmRequest) แล้ว `return`** ออกจาก
 * `generate()` ทันทีโดยยังไม่สร้าง item ใดๆ จากนั้นปุ่มยืนยันในโมดัลเรียก `generate()` **ซ้ำอีกครั้ง** ในโหมด
 * bypass gate (ผ่าน flag ภายในที่ modal เซ็ตให้ก่อนเรียก) ส่วนปุ่มยกเลิกแค่เคลียร์ `spendConfirm = null`
 *
 * ผลที่ได้ตามสัญญานี้:
 *  - `generate()` **ยังเป็น sync** signature ไม่เปลี่ยน
 *  - **caller ทั้งสองตัวไม่ต้องแก้เลย** — `Sidebar.tsx:249` (`if (canGenerate) generate();`) และ
 *    `shortcuts.ts:39` (`if (cur().bakeOffEnabled) openBakeOffConfirm(); else generate();`)
 *    ทั้งคู่เรียกแบบ fire-and-forget ไม่อ่านค่า return และไม่ await อยู่แล้ว
 *  - ห้ามเปลี่ยน `generate()` เป็น `async` เด็ดขาด: จะได้ floating promise ที่ caller ทั้งสองไม่ได้ handle
 *    และ error ที่หลุดออกมาจะกลายเป็น unhandled rejection แทนที่จะเป็น toast
 *
 * ## บรรทัดที่แทรก — actions.ts:869 (บรรทัดว่างหลังบล็อก if/else ที่ปิดที่ :868)
 *
 * โครงปัจจุบันของ `generate()` (เลขบรรทัดจริง หลัง T2 merge แล้ว):
 * ```
 *   842  export function generate() {
 *   843    if (!state.apiKey) { … keyModalOpen … return; }        ← guard: ไม่มี key
 *   845    if (isVideoMode(state.mode)) requestNotifyPermissionOnce();
 *   846    const ms = cur();
 *   850-51  parentId / refiningParentId
 *   853    let jobs: QueueJob[];
 *   854-56   if (ms.queue.length) { jobs = ms.queue; … }          ← สาขา "ยิงจากคิว"
 *   857-68   else { … if (refImageMissing()) { toast(…); return; }  ← :861 guard สุดท้ายที่มีอยู่เดิม
 *   862-67         jobs = [{ … }]; }                             ← สาขา "ยิงจาก prompt ปัจจุบัน"
 *   >>> 869  *** จุดแทรก gate ของ F4 ตรงนี้ (บรรทัดว่างระหว่าง :868 กับ :870) ***
 *   870    const mode = state.mode;
 *   871-74  addToHistory() ต่อ job
 *   876    const batch: GenItem[] = [];
 *   877    mutate(s => { … });                                    ← เปิด mutate ที่สร้าง item
 *   899      addToGallery(s, mode, item);                         ← จุดแรกที่ item โผล่ใน gallery
 *   907    beginNotifyBatch(...)                                  ← T2 governor territory
 *   909    batch.forEach(item => void scheduleRequest(item, batchId));  ← T2 governor territory
 * ```
 *
 * **ทำไมต้อง :869 พอดี ไม่ใช่ก่อนหรือหลังกว่านี้:**
 *  - **หลัง `refImageMissing()` (:861)** — pre-flight validation ทั้งหมดต้องจบก่อน ไม่งั้นผู้ใช้จะโดนถาม
 *    เรื่องเงินสำหรับ batch ที่ยังไงก็ยิงไม่ได้อยู่แล้ว (ขาดภาพอ้างอิง) กด "ยืนยัน" ไปก็เจอ toast error ต่อ
 *    = ถามฟรีเสียเปล่า
 *  - **ต้องอยู่ที่ :869 ไม่ใช่ :862** — :862 อยู่ **ข้างใน** สาขา `else` (ตัว `jobs = [{…}]` literal เอง)
 *    การวาง gate ตรงนั้นจะทำให้ path "ยิงจากคิว" (:854-856 ซึ่งเป็น batch ที่ **ใหญ่ที่สุด** ได้ถึง
 *    MAX_QUEUE x count) **ข้าม gate ไปทั้งดุ้น** — พลาดเคสที่ฟีเจอร์นี้ต้องกันเป็นอันดับแรกพอดี
 *    :869 อยู่หลัง if/else ปิด (:868) จึงเป็นจุดแรกที่ `jobs[]` ถูกประกอบเสร็จ **ครบทั้งสองสาขา** และ
 *    gate อ่าน `job.count`/`job.model`/`job.duration` ของทุก job ได้จริงเพื่อคำนวณ `batchUsd`
 *  - **ก่อน `mutate` ที่สร้าง item (:877 / addToGallery :899)** — ถ้า gate อยู่ทีหลัง ผู้ใช้ที่กด "ยกเลิก"
 *    ในโมดัลจะเหลือ item status "loading" ค้างเต็มแกลเลอรีโดยไม่มี request วิ่ง (ไม่มีใคร resolve ให้
 *    เพราะ `scheduleRequest` ไม่เคยถูกเรียก) = zombie card ที่ต้องมานั่งลบเองทีละใบ
 *  - **ก่อน `addToHistory()` (:871-874)** ด้วย — batch ที่ผู้ใช้ยกเลิกไม่ควรไปโผล่ในประวัติ prompt
 *  - ผลข้างเคียงที่ยอมรับไว้: สาขาคิว (:856) ทำ `ms.queue = []` ไปแล้วก่อนถึง gate ดังนั้นตอนผู้ใช้กดยกเลิก
 *    ในโมดัล **ต้องคืนคิวกลับ** จาก `jobs[]` ที่ snapshot ไว้ ไม่ใช่ปล่อยให้คิวหายไปเฉยๆ
 *    (`SpendConfirmRequest` เก็บเฉพาะตัวเลขสำหรับแสดงผล ส่วน `jobs[]` ตัวจริงเป็นเรื่องของ T16 ที่จะเก็บไว้เอง)
 *
 * ## ไม่ทับกับบรรทัดที่ T2 แก้
 *
 * T2 (semaphore/governor) แก้ที่ `scheduleRequest` + จุดเรียกมันคือ :909 (และ :1011 ใน `runBakeOff`)
 * บวกกับ `MAX_CONCURRENT_REQUESTS` ใน constants.ts — ทั้งหมดอยู่ **หลัง** :877 ทั้งสิ้น
 * จุดแทรกของ F4 ที่ :869 อยู่ก่อนหน้านั้น 40 บรรทัด ไม่แตะโค้ดของ T2 แม้แต่บรรทัดเดียว
 * และ gate ที่ return ก่อนถึง :909 ก็แค่ทำให้ governor ไม่มีงานเข้า ซึ่งเป็นพฤติกรรมปกติของมันอยู่แล้ว
 *
 * ## ไม่ซ้อนกับ BakeOffConfirmModal เดิม — Bake-off ผ่านโมดัลเดียวเท่านั้น
 *
 * path ของ Bake-off **ไม่ผ่าน `generate()` เลย** ตรวจจากโค้ดจริงแล้ว: caller ทั้งสองตัวของ `generate()`
 * แยก branch ออกก่อนถึงมัน — `Sidebar.tsx:159` เปลี่ยนพฤติกรรมปุ่ม Generate ไปเรียก `openBakeOffConfirm()`
 * และ `shortcuts.ts:39` ทำ `if (cur().bakeOffEnabled) openBakeOffConfirm(); else generate();`
 * ส่วน `confirmBakeOff()` (:1026) เรียก `runBakeOff()` (:970) ตรงๆ ซึ่งมี `mutate`/`scheduleRequest`
 * เป็นของตัวเอง ไม่ได้ delegate มาที่ `generate()`
 *
 * ดังนั้นการวาง gate ไว้ใน `generate()` **ไม่มีทางทำให้ Bake-off เจอสองโมดัลซ้อนกันได้ในเชิงโครงสร้าง**
 * ไม่ใช่แค่ "ระวังไม่ให้เกิด"
 *
 * >> ข้อจำกัดที่รับไว้อย่างตั้งใจ: `runBakeOff()` จึง **ไม่มี** cap gate มาคุม มีแค่ BakeOffConfirmModal
 *    ที่โชว์ยอดของ batch นั้นอย่างเดียว ยอมรับได้เพราะ Bake-off ยิงได้สูงสุด MAX_BAKE_OFF_MODELS ชิ้น
 *    ต่อครั้ง (เล็กกว่า 30 ของ generate มาก) และมีโมดัลบังคับให้เห็นราคาทุกครั้งอยู่แล้ว
 *    ถ้าจะเพิ่มทีหลัง ให้ไปเสริมข้อมูล ledger ลงใน BakeOffConfirmModal ที่มีอยู่ **ห้ามเพิ่มโมดัลชั้นที่สอง**
 *
 * >> `runBakeOff()` ยังต้อง **บันทึกยอดเข้า ledger** ตามปกติ (ไม่ gate ≠ ไม่นับ) ไม่งั้นเงินที่จ่ายผ่าน
 *    Bake-off จะหายไปจากยอดสะสม แล้ว gate ของ `generate()` จะคำนวณจากฐานที่ต่ำกว่าความจริง
 */

/* ============================================================================
 * F2 — Gallery Persistence: contract ของ record ที่เขียนลงดิสก์
 * ========================================================================== */

/**
 * === ที่ตั้งของ contract: ประกาศจริงอยู่ที่ `lib/galleryStore.ts` ไฟล์นี้ re-export ให้เท่านั้น ===
 *
 * ทำไมไม่ย้ายตัว interface มาไว้ที่นี่ทั้งก้อน:
 *  1. `PersistedGenItem` เป็น **allowlist ที่ต้องอ่านคู่กับโค้ดที่บังคับใช้มัน** — เหตุผลรายฟิลด์ว่าทำไม
 *     `refs`/`jobId`/`errMsg` ห้ามลงดิสก์อยู่ในหัวไฟล์ galleryStore.ts ส่วน `favorite` มีความหมายก็ต่อเมื่อ
 *     อ่าน EVICTION POLICY ที่อยู่ไฟล์เดียวกัน ถ้าย้าย type มาที่นี่ เหตุผลจะอยู่คนละไฟล์กับนิยาม
 *     แล้วมันจะ drift — ซึ่งเกิดขึ้นมาแล้วจริงรอบนี้ (comment บอกว่า GenItem ไม่มี favorite ทั้งที่มี)
 *  2. `types.ts` เป็น leaf module ที่ไม่ import อะไรเลย ส่วน `PersistedGenItem` ต้องอ้าง `Blob`
 *     และผูกกับ `PERSISTED_ITEM_VERSION` + `migrateRecord()` ที่เป็น runtime ทั้งคู่ ย้าย type มาแต่ทิ้ง
 *     version/migration ไว้อีกไฟล์ = แตกเป็นสองแหล่งความจริงพอดี
 *  3. re-export แบบ `export type` ถูก erase ทิ้งตอน compile (isolatedModules) — ไม่เกิด import cycle
 *     ระหว่าง types.ts ↔ galleryStore.ts ตอน runtime แม้แต่นิดเดียว
 *
 * สรุปสิ่งที่ contract รับประกัน (รายละเอียดเต็มอยู่ที่ galleryStore.ts):
 *  - เป็น allowlist ระบุฟิลด์ครบทีละตัว **ไม่ใช่** `Partial<GenItem>` / `Omit<GenItem, …>` — ฟิลด์ใหม่
 *    ที่เพิ่มใน GenItem จะไม่ไหลลงดิสก์เองโดยบังเอิญ ต้องมาเพิ่มที่นี่ด้วยมือ
 *  - **ไม่มี `refs`** — เป็น data URL ของรูปที่ผู้ใช้อัปโหลดเอง (ข้อมูลส่วนตัว ไม่ใช่ผลลัพธ์ที่จ่ายเงินซื้อ)
 *    และก้อนใหญ่พอจะกิน quota จนเบียดผลลัพธ์จริงออก
 *  - **ไม่มี `jobId`** — เป็น handle ที่ผูกกับ session/งานฝั่ง OpenRouter งานที่ค้างมี PENDING_JOBS_KEY
 *    ดูแลแยกอยู่แล้ว ส่วน item ที่ done แล้วไม่ต้อง resume อีก เก็บไว้ก็เป็นแค่ข้อมูลตายที่รั่วได้
 *  - `blob` เก็บเป็น **`Blob` object ตรงๆ ไม่ใช่ data URL string** — IndexedDB เก็บ Blob เป็น binary ได้
 *    ส่วน data URL คือ base64 ที่พองขึ้น ~33% และต้อง encode/decode ทั้งก้อนทุกครั้งที่อ่าน/เขียน
 *    วิดีโอชิ้นเดียวหลายสิบ MB จะกลายเป็น string ยักษ์ที่ค้างใน JS heap ระหว่างแปลง
 *  - `version` อยู่ในตัว record (ไม่ใช่แค่ DB_VERSION ของ IndexedDB) เพื่อให้ migrate แบบ lazy per-record
 *    ตอนอ่านได้ โดยไม่ต้องอ่าน Blob ทั้ง store ขึ้นมาแปลงตอนเปิด DB
 */
export type { PersistedGenItem, RestoredGenItem } from "./galleryStore";
