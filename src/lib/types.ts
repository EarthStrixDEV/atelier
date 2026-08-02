export type Mode = "home" | "infographic" | "video";
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
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface OptimizeResult {
  prompt: string;
  keywords: string[];
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
  history: string[];
  selected: Set<number>;
  lbIndex: number;
}

export interface AppState {
  apiKey: string;
  models: ORModel[];
  videoModels: ORModel[];
  modelsFailed: boolean;
  videoModelsFailed: boolean;
  mode: Mode;
  modes: Record<Mode, ModeState>;
  seq: number;
  keyModalOpen: boolean;
  chatOpen: boolean;
  chatMessages: ChatMsg[];
  chatPending: boolean;
  optimize: {
    status: "idle" | "loading" | "done" | "error";
    result: OptimizeResult | null;
    error: string;
  };
  toast: { msg: string; n: number };
  sidebarCollapsed: boolean;
  promptPlacement: PromptPlacement;
  lbFormat: ImgFormat;
}
