export type Mode = "home" | "infographic" | "video" | "cinematic" | "audio";
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

export interface ORModel {
  id: string;
  name?: string;
  pricing?: { image?: string };
  architecture?: { output_modalities?: string[] };
  // ฟิลด์เฉพาะโมเดลวิดีโอ (จาก /api/v1/videos/models)
  pricing_skus?: Record<string, string | number>;
  supported_durations?: number[];
  supported_aspect_ratios?: string[];
  generate_audio?: boolean;
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
  toast: { msg: string; n: number };
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
  /** true ถ้าเปิดโมดัลยืนยันค่าใช้จ่ายก่อนยิง Bake-off จริงอยู่ (PHASE 14) — เปิดจากปุ่ม Generate ตอน bakeOffEnabled */
  bakeOffConfirmOpen: boolean;
  /**
   * snapshot ของ item ที่เลือกไว้ตอนกด Compare (2–4 ชิ้น) — เก็บสำเนา ณ ตอนเปิดเท่านั้น ไม่ live-bind กับ selection
   * ที่อาจเปลี่ยนต่อระหว่างเปิดโมดัลอยู่ — null = โมดัล Compare ปิดอยู่
   */
  compareItems: GenItem[] | null;
  /**
   * โมเดลที่ผู้ใช้เพิ่มเองผ่านช่อง "Advanced" ของ KeyModal (JSON array รูปแบบเดียวกับ EXTRA_MODELS/AUDIO_EXTRA_MODELS)
   * persist ผ่าน localStorage แยกจาก apiKey เพราะไม่ใช่ secret — merge เข้า models/audioModels ต่อจาก EXTRA_MODELS เดิม
   */
  userExtraModels: ORModel[];
}


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
