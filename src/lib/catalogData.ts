/**
 * เนื้อหา editorial ของหน้า Model Catalog (`/models`) — curated ด้วยมือ ไม่ใช่ข้อมูลจาก OpenRouter API
 * เพราะ ORModel ไม่มี description/quality score/benchmark ใดๆ ให้ดึงมาใช้ตรงๆ (ดู types.ts)
 *
 * MODEL_QUALITY_TAGS เป็น tag คำบรรยายสั้นๆ (ไม่ใช่สกอร์ตัวเลข) — โมเดลที่ไม่มี entry ที่นี่ให้ปล่อย
 * คอลัมน์/chip ว่างไปเลยในหน้า catalog ห้ามใส่ "N/A" filler
 *
 * WORKFLOW_RECOMMENDATIONS อ้างอิง modelId ตรงตาม id จริงใน VIDEO_MODEL_IDS/AUDIO_MODEL_IDS/EXTRA_MODELS
 * (constants.ts) — หน้า catalog จะ resolve กับ live model list ที่ fetch มา ถ้าไม่เจอ (โมเดลถูกถอดออกจาก
 * OpenRouter แล้ว) จะโชว์ id ดิบแทนพร้อมหมายเหตุ ไม่ทำให้หน้าพัง
 */

export type CatalogDomain = "image" | "video" | "audio";

export interface WorkflowRecommendation {
  id: string;
  domain: CatalogDomain;
  /** ชื่องาน/use case สั้นๆ ที่ผู้ใช้ค้นหา เช่น "ภาพสินค้า/ถ่ายภาพสมจริง" */
  useCase: string;
  modelId: string;
  /** เหตุผลสั้นๆ บรรทัดเดียวว่าทำไมโมเดลนี้ถึงเหมาะกับงานนี้ */
  rationale: string;
}

export const WORKFLOW_RECOMMENDATIONS: WorkflowRecommendation[] = [
  // ---------- image ----------
  {
    id: "image-product-shot",
    domain: "image",
    useCase: "ภาพสินค้า / ถ่ายภาพสมจริง",
    modelId: "google/gemini-3-pro-image",
    rationale: "รายละเอียดพื้นผิวและแสงคมชัดสมจริง เหมาะกับภาพสินค้าเชิงพาณิชย์ที่ต้องการความแม่นยำสูง",
  },
  {
    id: "image-quick-concept",
    domain: "image",
    useCase: "งานร่างเร็ว / ทดลองไอเดีย",
    modelId: "x-ai/grok-imagine-image-2.0",
    rationale: "เร็วและราคาถูก เหมาะกับการลองผิดลองถูกหลายเวอร์ชันก่อนเลือกทิศทางที่ใช่",
  },
  {
    id: "image-infographic-layout",
    domain: "image",
    useCase: "Infographic / วางเลย์เอาต์ข้อความ",
    modelId: "openai/gpt-image-2",
    rationale: "วางตัวอักษรและโครงสร้างข้อมูลได้แม่นยำ อ่านออกจริง เหมาะกับสไลด์และโพสต์ให้ข้อมูล",
  },

  // ---------- video ----------
  {
    id: "video-talking-head",
    domain: "video",
    useCase: "วิดีโอคนพูด / talking-head",
    modelId: "google/veo-3.1-fast",
    rationale: "ท่าทางและการขยับปากเป็นธรรมชาติ เรนเดอร์เร็วกว่ารุ่นมาตรฐาน เหมาะกับคลิปพูดสั้นๆ",
  },
  {
    id: "video-cinematic",
    domain: "video",
    useCase: "โมชันภาพยนตร์ / cinematic",
    modelId: "kwaivgi/kling-v3.0-std",
    rationale: "ควบคุมมุมกล้องและจังหวะการเคลื่อนไหวได้ดี ให้ฟีลภาพยนตร์มากกว่าคลิปทั่วไป",
  },
  {
    id: "video-image-to-video",
    domain: "video",
    useCase: "ต่อยอดจากภาพนิ่ง (image-to-video)",
    modelId: "x-ai/grok-imagine-video-1.5",
    rationale: "ออกแบบมาสำหรับ image-to-video โดยเฉพาะ ใช้ภาพอ้างอิงเป็นเฟรมแรกได้แม่นยำ",
  },

  // ---------- audio ----------
  {
    id: "audio-background-score",
    domain: "audio",
    useCase: "เพลงประกอบพื้นหลัง",
    modelId: "google/lyria-3-pro-preview",
    rationale: "สร้างเพลงเต็มที่มีท่อน verse/chorus ครบ เหมาะกับใช้เป็นเพลงประกอบวิดีโอหรืองานยาว",
  },
  {
    id: "audio-social-clip",
    domain: "audio",
    useCase: "คลิปสั้นโซเชียล",
    modelId: "google/lyria-3-clip-preview",
    rationale: "คลิป 30 วินาที ราคาถูกกว่าเพลงเต็ม พอดีกับความยาวคลิป Reels/TikTok",
  },
];

/**
 * Tag คำบรรยายคุณภาพ/จุดเด่นของแต่ละโมเดล — ไม่ใช่สกอร์ตัวเลข ไม่ fact-check กับ benchmark ใดๆ
 * โมเดลที่ไม่มี entry ที่นี่จะไม่แสดง quality tags ในตาราง/การ์ด (ไม่ใช่ error, แค่ยังไม่ได้ curate)
 */
export const MODEL_QUALITY_TAGS: Record<string, string[]> = {
  // ---------- image ----------
  "google/gemini-3-pro-image": ["สมจริงสูง", "รายละเอียดคม", "ตัวอักษรแม่นยำ"],
  "google/gemini-3.1-flash-image": ["เร็ว", "ราคาประหยัด", "เหมาะร่างไอเดีย"],
  "openai/gpt-image-2": ["วางเลย์เอาต์แม่น", "ข้อความอ่านง่าย", "เหมาะ infographic"],
  "x-ai/grok-imagine-image-quality": ["สมจริงสูง", "โทนภาพเป็นธรรมชาติ"],
  "x-ai/grok-imagine-image-2.0": ["เร็ว เหมาะร่างไอเดีย", "ราคาประหยัด"],
  "bytedance-seed/seedream-5-0-pro": ["สีสันจัดจ้าน", "สไตล์ภาพประกอบ"],
  "bytedance-seed/seedream-5-0-lite": ["เร็ว", "ราคาประหยัด"],
  "qwen/qwen-image-3-pro": ["รองรับข้อความภาษาเอเชียดี", "รายละเอียดคม"],
  "krea/krea-2-large": ["สไตล์ศิลปะ", "เหมาะงาน concept art"],

  // ---------- video ----------
  "google/veo-3.1-fast": ["เรนเดอร์เร็ว", "ท่าทางเป็นธรรมชาติ", "เหมาะ talking-head"],
  "google/veo-3.1-lite": ["ราคาประหยัด", "เหมาะทดลองไอเดีย"],
  "kwaivgi/kling-v3.0-std": ["คุมมุมกล้องได้ดี", "ฟีลภาพยนตร์"],
  "x-ai/grok-imagine-video": ["ทั่วไปครบเครื่อง", "โทนภาพเป็นธรรมชาติ"],
  "x-ai/grok-imagine-video-1.5": ["เหมาะ image-to-video", "รักษาองค์ประกอบต้นฉบับ"],
  "bytedance/seedance-2.0": ["โมชันลื่นไหล", "รายละเอียดคม"],
  "black-forest-labs/flux-3-video": ["สไตล์ภาพนิ่งคมชัดต่อเนื่อง"],
  "runway/gen-4.5": ["คุมกล้องซับซ้อนได้", "เหมาะงาน production"],
  "alibaba/wan-2.7": ["รองรับคลิปยาวขึ้น", "รายละเอียดคม"],
  "alibaba/wan-2.6": ["ราคาประหยัด", "ทั่วไปครบเครื่อง"],

  // ---------- audio ----------
  "google/lyria-3-pro-preview": ["เพลงเต็มมี verse/chorus", "โปรดักชันคุณภาพสตูดิโอ"],
  "google/lyria-3-clip-preview": ["เร็ว เหมาะคลิปสั้น", "ราคาประหยัด"],
};
