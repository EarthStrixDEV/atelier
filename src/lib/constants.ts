import type { Mode, ORModel } from "./types";

export const MODES: Mode[] = ["home", "infographic", "video"];
export const MAX_QUEUE = 5;
export const MAX_HISTORY = 30;
export const MAX_CHAT_HISTORY = 60;

export const RATIOS = [
  { v: "1:1", w: 14, h: 14 },
  { v: "4:3", w: 16, h: 12 },
  { v: "3:4", w: 12, h: 16 },
  { v: "16:9", w: 18, h: 10 },
  { v: "9:16", w: 10, h: 18 },
];
export const COUNTS = [1, 2, 4, 6];
export const DURATIONS = [8, 9, 10];
export const VIDEO_RESOLUTION = "720p"; // fix ค่าเดียว — ทั้ง 4 โมเดลรองรับร่วมกัน และคุมราคา
export const VIDEO_POLL_MS = 10000;
export const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;

// โมเดล LLM ฟรีสำหรับ Prompt Optimizer และ Chat with Atelier
export const OPTIMIZER_MODEL = "openai/gpt-oss-20b:free";
export const CHAT_MODEL = "openai/gpt-oss-20b:free";

// โมเดลที่แต่ละโหมดอนุญาตให้เลือกได้ (null = ไม่จำกัด ใช้ list เต็ม)
export const MODE_MODEL_FILTER: Record<Mode, RegExp[] | null> = {
  home: null,
  infographic: [/^openai\/gpt-5\.4-image-2$/i, /^google\/gemini-3-pro-image$/i],
  video: null, // โหมด video ใช้ list แยก (videoModels) ไม่ผ่าน filter นี้
};

// โหมด video ใช้ endpoint แยก (/api/v1/videos/models) — เรียงตามลำดับใน array นี้
export const VIDEO_MODEL_IDS = [
  "x-ai/grok-imagine-video",
  "google/veo-3.1-fast",
  "kwaivgi/kling-v3.0-std",
  "bytedance/seedance-2.0",
];

// โมเดลที่พี่เอิร์ธอยากได้ ให้ลอยขึ้นบนสุดของ dropdown ถ้ามีบน OpenRouter
export const PREFERRED = [/grok.*imagine.*quality/i, /grok.*imagine/i, /gpt.*image/i];

// โมเดลที่ต้องมีใน list เสมอ แม้ /api/v1/models จะไม่ส่งมา (merge ตาม id ไม่ให้ซ้ำ)
export const EXTRA_MODELS: ORModel[] = [
  {
    id: "x-ai/grok-imagine-image-quality",
    name: "Grok Imagine Image Quality",
    pricing: { image: "0.05" },
    architecture: { output_modalities: ["image"] },
  },
  {
    id: "openai/gpt-5.4-image-2",
    name: "OpenAI: GPT-5.4 Image 2",
    pricing: {},
    architecture: { output_modalities: ["image", "text"] },
  },
  {
    id: "google/gemini-3-pro-image",
    name: "Google: Nano Banana Pro (Gemini 3 Pro Image)",
    pricing: { image: "0.000002" },
    architecture: { output_modalities: ["image", "text"] },
  },
];

interface KeywordGroup {
  label: string;
  items: string[];
}

const HOME_KEYWORDS: KeywordGroup[] = [
  { label: "สไตล์", items: ["photorealistic", "cinematic", "anime style", "watercolor", "oil painting", "minimalist", "cyberpunk", "3D render"] },
  { label: "แสง", items: ["studio lighting", "golden hour", "soft light", "neon lights", "dramatic lighting", "backlit"] },
  { label: "มุมกล้อง", items: ["close-up portrait", "wide angle", "top-down view", "macro shot", "bokeh background"] },
  { label: "โทน / อารมณ์", items: ["warm tones", "moody", "dreamy", "vibrant colors", "black and white", "pastel colors"] },
  { label: "รายละเอียด", items: ["highly detailed", "sharp focus", "high contrast", "8k", "film grain"] },
  { label: "ท่าทาง", items: ["standing pose", "sitting", "walking", "running", "jumping", "dancing", "action pose", "lying down", "arms crossed", "looking at camera"] },
  { label: "Prop ประกอบฉาก", items: ["holding a coffee cup", "holding flowers", "with an umbrella", "reading a book", "with balloons", "neon sign background", "vintage car", "city street background", "cozy cafe interior"] },
  { label: "บุคคล / สัตว์", items: ["young woman", "young man", "elderly person", "child", "cat", "dog", "bird", "horse", "dragon", "robot"] },
  { label: "Character Detail", items: ["blue eyes", "long hair", "short hair", "curly hair", "freckles", "sharp jawline", "muscular build", "slim build", "scar on cheek", "tattoos"] },
  { label: "Visual Effect", items: ["motion blur", "lens flare", "particle effects", "glowing aura", "smoke effect", "rain effect", "double exposure", "chromatic aberration"] },
  { label: "Clothing", items: ["business suit", "casual streetwear", "traditional Thai dress", "leather jacket", "summer dress", "military uniform", "kimono", "hoodie and jeans"] },
];

export const KEYWORDS_BY_MODE: Record<Mode, KeywordGroup[]> = {
  home: HOME_KEYWORDS,
  infographic: [
    { label: "Style", items: ["flat design", "corporate style", "modern minimal", "hand-drawn style", "isometric", "gradient style", "line art icons", "3D illustrative"] },
    { label: "Layout", items: ["vertical layout", "horizontal layout", "grid layout", "circular layout", "timeline layout", "comparison layout", "single-column layout", "poster layout"] },
    { label: "Language", items: ["Thai text", "English text", "bilingual Thai-English", "no text, icons only"] },
    { label: "Header", items: ["bold title header", "centered header", "banner header", "subtitle included", "icon beside title"] },
    { label: "Detail", items: ["data-heavy detail", "minimal text detail", "with icons", "with charts", "with statistics", "with illustrations"] },
    { label: "Segmentation", items: ["3-step process", "4-part breakdown", "5-part breakdown", "before/after comparison", "timeline segments", "numbered sections", "pros vs cons split"] },
  ],
  // โหมด video: สองกลุ่มเฉพาะวิดีโออยู่บนสุด (กลุ่มแรกเปิด default) ตามด้วยกลุ่มเดิมของ Home ทั้งหมด
  video: [
    { label: "Camera Control", items: ["slow dolly in", "dolly out", "pan left", "pan right", "tilt up", "crane shot", "orbit around subject", "tracking shot", "handheld camera", "FPV drone shot", "static camera", "zoom in slowly"] },
    { label: "Frametime Control", items: ["slow motion", "timelapse", "fast motion", "speed ramp", "freeze frame ending", "seamless loop", "reverse motion", "long take"] },
    ...HOME_KEYWORDS,
  ],
};

export const MODE_META: Record<Mode, { placeholder: string; empty: string; title: string; countLabel: string; hint: string }> = {
  home: {
    placeholder: "อธิบายภาพที่ต้องการ… เช่น a minimalist black and white portrait of a cat, studio lighting, high contrast",
    empty: "ยังไม่มีภาพ — ใส่ prompt แล้วกด Generate ได้เลยค่ะ",
    title: "Gallery",
    countLabel: "Images",
    hint: "รายชื่อโมเดลดึงสดจาก OpenRouter (เฉพาะโมเดลที่ generate ภาพได้) — Enter ใน prompt เพื่อสั่ง gen ได้เลย",
  },
  infographic: {
    placeholder: "อธิบาย infographic ที่ต้องการ… เช่น 5 tips for better sleep, modern flat style, bilingual Thai-English",
    empty: "ยังไม่มี infographic — ใส่ prompt แล้วกด Generate ได้เลยค่ะ",
    title: "Infographic Gallery",
    countLabel: "Images",
    hint: "รายชื่อโมเดลดึงสดจาก OpenRouter (เฉพาะโมเดลที่ generate ภาพได้) — Enter ใน prompt เพื่อสั่ง gen ได้เลย",
  },
  video: {
    placeholder: "อธิบายวิดีโอที่ต้องการ… เช่น a cat walking through neon-lit Tokyo streets at night, cinematic, slow dolly in",
    empty: "ยังไม่มีวิดีโอ — ใส่ prompt แล้วกด Generate ได้เลยค่ะ",
    title: "Video Gallery",
    countLabel: "Clips",
    hint: "วิดีโอ 720p ยาว 8–10 วิ — ใช้เวลาสร้างราวๆ 1–3 นาทีต่อคลิป ราคาประเมินอยู่ใต้ชื่อโมเดล — Enter เพื่อสั่ง gen ได้เลย",
  },
};

export function modeLabel(mode: Mode): string {
  return mode === "video" ? "Video" : mode === "infographic" ? "Infographic" : "Home";
}
