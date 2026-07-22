export type Mode = "home" | "infographic" | "video";
export type GenStatus = "loading" | "done" | "error";
export type ImgFormat = "png" | "jpg";

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
}

export interface QueueJob {
  prompt: string;
  model: string;
  modelName: string;
  ratio: string;
  count: number;
  duration: number;
  audio: boolean;
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
  lbFormat: ImgFormat;
}
