export type Mode = "home" | "infographic" | "video" | "cinematic" | "audio";
export type GenStatus = "loading" | "done" | "error";
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
}

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
