import type { Mode, ORModel, RefKind } from "./types";

export const MODES: Mode[] = ["home", "infographic", "video", "audio"];
export const MAX_QUEUE = 5;
export const MAX_HISTORY = 30;
export const MAX_CHAT_HISTORY = 60;

// ---------- reference images ----------
export const MAX_REF_BYTES = 4 * 1024 * 1024; // ต่อไฟล์ — data URL ใหญ่กว่านี้ทำให้ request บวมจนโมเดลมักปฏิเสธ
export const MAX_REFS_PER_KIND = 2;

/**
 * ต่อ ref kind: label ที่โชว์ใน UI + คำกำกับที่ส่งให้โมเดลใน content array
 * โมเดลไม่มี param แยกสำหรับ "นี่คือ style ref" — ต้องบอกด้วยข้อความคู่กับรูปแต่ละใบ
 */
export const REF_KINDS: { kind: RefKind; label: string; hint: string; instruction: string }[] = [
  {
    kind: "ref",
    label: "Reference",
    hint: "องค์ประกอบ / subject / ฉากที่ต้องการให้ยึดตาม",
    instruction: "COMPOSITION REFERENCE — follow the subject, layout and overall composition of this image.",
  },
  {
    kind: "style",
    label: "Style",
    hint: "โทนสี แสง เทคนิค การเรนเดอร์",
    instruction: "STYLE REFERENCE — copy the art style, color palette, lighting and rendering technique of this image, but not its subject.",
  },
  {
    kind: "facial",
    label: "Facial",
    hint: "ใบหน้าตัวละครที่ต้องคงเอกลักษณ์",
    instruction: "FACIAL IDENTITY REFERENCE — preserve this person's facial identity and features exactly in the generated image.",
  },
];

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
  infographic: [/^openai\/gpt-image-2$/i, /^google\/gemini-3-pro-image$/i],
  video: null, // โหมด video ใช้ list แยก (videoModels) ไม่ผ่าน filter นี้
  audio: null, // โหมด audio ใช้ list แยก (audioModels) ไม่ผ่าน filter นี้
};

// โหมด video ใช้ endpoint แยก (/api/v1/videos/models) — เรียงตามลำดับใน array นี้
export const VIDEO_MODEL_IDS = [
  "x-ai/grok-imagine-video",
  "google/veo-3.1-fast",
  "kwaivgi/kling-v3.0-std",
  "bytedance/seedance-2.0",
];

// โหมด audio: คัดจาก /api/v1/models เดียวกับภาพ — เรียงตามลำดับใน array นี้
export const AUDIO_MODEL_IDS = [
  "google/lyria-3-pro-preview",
  "google/lyria-3-clip-preview",
];

// fallback เผื่อ /api/v1/models ยังไม่ list โมเดล Lyria (merge ตาม id ไม่ให้ซ้ำ)
export const AUDIO_EXTRA_MODELS: ORModel[] = [
  {
    id: "google/lyria-3-pro-preview",
    name: "Google: Lyria 3 Pro (เพลงเต็ม)",
    pricing: {},
    architecture: { output_modalities: ["audio"] },
  },
  {
    id: "google/lyria-3-clip-preview",
    name: "Google: Lyria 3 Clip (คลิป 30 วิ)",
    pricing: {},
    architecture: { output_modalities: ["audio"] },
  },
];

// ราคาต่อเพลง/คลิป — OpenRouter ไม่ส่งราคา per-song มาใน pricing ปกติ จึง fix ไว้ที่นี่
export const AUDIO_MODEL_PRICES: Record<string, number> = {
  "google/lyria-3-pro-preview": 0.08,
  "google/lyria-3-clip-preview": 0.04,
};

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
    id: "openai/gpt-image-2",
    name: "OpenAI: GPT Image 2",
    pricing: {},
    architecture: { output_modalities: ["image", "text"] },
  },
  {
    id: "google/gemini-3-pro-image",
    name: "Google: Nano Banana Pro (Gemini 3 Pro Image)",
    pricing: { image: "0.000002" },
    architecture: { output_modalities: ["image", "text"] },
  },
  {
    id: "microsoft/mai-image-2.5-pro",
    name: "Microsoft: MAI-Image-2.5 Pro",
    pricing: {},
    architecture: { output_modalities: ["image"] },
  },
  {
    id: "krea/krea-2-large",
    name: "Krea: Krea 2 Large",
    pricing: { image: "0.06" },
    architecture: { output_modalities: ["image"] },
  },
];

interface KeywordGroup {
  label: string;
  items: string[];
}

/** สร้าง keyword 50 รายการจากคู่คำ 10 x 5 โดยคงลำดับเดิมทุกครั้ง */
function keywordPairs(left: readonly string[], right: readonly string[], join: (a: string, b: string) => string): string[] {
  return left.flatMap(a => right.map(b => join(a, b)));
}

const GENERAL_KEYWORD_ADDITIONS: Record<string, string[]> = {
  style: keywordPairs(
    ["editorial", "vintage", "surreal", "fantasy", "retro-futuristic", "art deco", "gothic", "bohemian", "Japanese-inspired", "Scandinavian"],
    ["photography", "digital illustration", "concept art", "poster art", "mixed media"],
    (a, b) => `${a} ${b}`,
  ),
  lighting: keywordPairs(
    ["soft diffused", "hard directional", "volumetric", "low-key", "high-key", "moonlit", "candlelit", "overcast", "sunset", "underwater"],
    ["key lighting", "rim lighting", "side lighting", "ambient lighting", "spotlight"],
    (a, b) => `${a} ${b}`,
  ),
  camera: keywordPairs(
    ["eye-level", "low-angle", "high-angle", "Dutch-angle", "over-the-shoulder", "bird's-eye", "worm's-eye", "three-quarter", "profile", "front-facing"],
    ["extreme close-up", "medium shot", "full-body shot", "establishing shot", "telephoto shot"],
    (a, b) => `${a} ${b}`,
  ),
  mood: keywordPairs(
    ["serene", "mysterious", "joyful", "melancholic", "romantic", "tense", "nostalgic", "ethereal", "playful", "epic"],
    ["earth-tone palette", "jewel-tone palette", "muted palette", "monochromatic palette", "complementary palette"],
    (a, b) => `${a}, ${b}`,
  ),
  detail: keywordPairs(
    ["ultra-fine", "intricate", "crisp", "natural", "polished", "weathered", "handcrafted", "ornate", "subtle", "hyperreal"],
    ["surface textures", "material details", "facial details", "environment details", "micro details"],
    (a, b) => `${a} ${b}`,
  ),
  pose: keywordPairs(
    ["confident", "relaxed", "elegant", "dynamic", "candid", "heroic", "graceful", "playful", "thoughtful", "dramatic"],
    ["standing pose", "seated pose", "walking pose", "turning pose", "reaching pose"],
    (a, b) => `${a} ${b}`,
  ),
  prop: keywordPairs(
    ["holding a lantern", "holding a camera", "carrying a backpack", "holding a smartphone", "holding a sword", "holding a paintbrush", "carrying a suitcase", "holding a vinyl record", "holding a map", "holding a crystal"],
    ["in a library", "in a forest", "on a rooftop", "at a train station", "inside a modern studio"],
    (a, b) => `${a} ${b}`,
  ),
  subject: keywordPairs(
    ["female astronaut", "male detective", "fashion model", "street musician", "forest guardian", "fox", "owl", "tiger", "white rabbit", "android"],
    ["portrait", "full-body character", "in an urban scene", "in a natural habitat", "in a fantasy world"],
    (a, b) => `${a} ${b}`,
  ),
  character: keywordPairs(
    ["silver hair", "auburn hair", "wavy black hair", "platinum blond hair", "braided hair", "buzz cut", "shoulder-length hair", "messy hair", "side-swept hair", "twin-tail hair"],
    ["with amber eyes", "with green eyes", "with a gentle smile", "with a determined expression", "with delicate facial features"],
    (a, b) => `${a} ${b}`,
  ),
  effect: keywordPairs(
    ["floating embers", "sparkling dust", "light trails", "electric arcs", "water splashes", "shattered glass", "falling petals", "fog layers", "holographic glow", "ink clouds"],
    ["in the foreground", "around the subject", "in the background", "with cinematic depth", "with subtle intensity"],
    (a, b) => `${a} ${b}`,
  ),
  clothing: keywordPairs(
    ["tailored blazer", "oversized sweater", "trench coat", "silk blouse", "denim jacket", "evening gown", "utility jumpsuit", "athletic outfit", "fantasy armor", "futuristic bodysuit"],
    ["in neutral colors", "in vibrant colors", "with gold accents", "with layered accessories", "with intricate embroidery"],
    (a, b) => `${a} ${b}`,
  ),
};

const INFOGRAPHIC_KEYWORD_ADDITIONS: Record<string, string[]> = {
  style: keywordPairs(
    ["editorial", "Swiss", "Bauhaus", "geometric", "organic", "playful", "luxury", "tech", "retro", "paper-cut"],
    ["infographic style", "data poster style", "visual report style", "educational graphic style", "presentation graphic style"],
    (a, b) => `${a} ${b}`,
  ),
  layout: keywordPairs(
    ["modular", "asymmetrical", "radial", "zigzag", "pyramid", "funnel", "roadmap", "dashboard", "card-based", "flowchart"],
    ["portrait layout", "landscape layout", "square layout", "mobile-first layout", "print-ready layout"],
    (a, b) => `${a} ${b}`,
  ),
  language: keywordPairs(
    ["formal Thai", "friendly Thai", "concise English", "professional English", "Thai-English bilingual", "Japanese", "Chinese", "Korean", "Spanish", "language-neutral"],
    ["short labels", "clear captions", "plain-language copy", "headline-focused copy", "icon-supported copy"],
    (a, b) => `${a} with ${b}`,
  ),
  header: keywordPairs(
    ["oversized", "compact", "editorial", "split", "ribbon", "boxed", "gradient", "illustrated", "number-led", "question-led"],
    ["title header", "title and subtitle", "title with icon", "title with statistic", "title with category label"],
    (a, b) => `${a} ${b}`,
  ),
  detail: keywordPairs(
    ["research-backed", "executive-summary", "beginner-friendly", "expert-level", "data-rich", "story-driven", "icon-led", "chart-led", "illustration-led", "minimal"],
    ["content detail", "data callouts", "supporting notes", "key takeaways", "source annotations"],
    (a, b) => `${a} ${b}`,
  ),
  segmentation: keywordPairs(
    ["two-column", "three-column", "four-quadrant", "six-card", "eight-card", "step-by-step", "chapter-based", "problem-solution", "cause-effect", "question-answer"],
    ["section structure", "information flow", "content breakdown", "visual hierarchy", "story sequence"],
    (a, b) => `${a} ${b}`,
  ),
};

const VIDEO_KEYWORD_ADDITIONS: Record<string, string[]> = {
  camera: keywordPairs(
    ["gentle", "rapid", "smooth", "dramatic", "subtle", "handheld", "stabilized", "cinematic", "aerial", "ground-level"],
    ["push-in movement", "pull-back movement", "lateral tracking", "orbit movement", "vertical reveal"],
    (a, b) => `${a} ${b}`,
  ),
  frametime: keywordPairs(
    ["gradual", "sudden", "rhythmic", "cinematic", "dreamlike", "energetic", "subtle", "dramatic", "seamless", "stylized"],
    ["slowdown", "speed-up", "time jump", "loop transition", "freeze-frame transition"],
    (a, b) => `${a} ${b}`,
  ),
};

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
].map((group, index) => ({
  ...group,
  items: [
    ...group.items,
    ...GENERAL_KEYWORD_ADDITIONS[["style", "lighting", "camera", "mood", "detail", "pose", "prop", "subject", "character", "effect", "clothing"][index]],
  ],
}));

const INFOGRAPHIC_KEYWORDS: KeywordGroup[] = [
  { label: "Style", items: ["flat design", "corporate style", "modern minimal", "hand-drawn style", "isometric", "gradient style", "line art icons", "3D illustrative"] },
  { label: "Layout", items: ["vertical layout", "horizontal layout", "grid layout", "circular layout", "timeline layout", "comparison layout", "single-column layout", "poster layout"] },
  { label: "Language", items: ["Thai text", "English text", "bilingual Thai-English", "no text, icons only"] },
  { label: "Header", items: ["bold title header", "centered header", "banner header", "subtitle included", "icon beside title"] },
  { label: "Detail", items: ["data-heavy detail", "minimal text detail", "with icons", "with charts", "with statistics", "with illustrations"] },
  { label: "Segmentation", items: ["3-step process", "4-part breakdown", "5-part breakdown", "before/after comparison", "timeline segments", "numbered sections", "pros vs cons split"] },
].map((group, index) => ({
  ...group,
  items: [
    ...group.items,
    ...INFOGRAPHIC_KEYWORD_ADDITIONS[["style", "layout", "language", "header", "detail", "segmentation"][index]],
  ],
}));

const VIDEO_CONTROL_KEYWORDS: KeywordGroup[] = [
  { label: "Camera Control", items: ["slow dolly in", "dolly out", "pan left", "pan right", "tilt up", "crane shot", "orbit around subject", "tracking shot", "handheld camera", "FPV drone shot", "static camera", "zoom in slowly"] },
  { label: "Frametime Control", items: ["slow motion", "timelapse", "fast motion", "speed ramp", "freeze frame ending", "seamless loop", "reverse motion", "long take"] },
].map((group, index) => ({
  ...group,
  items: [
    ...group.items,
    ...VIDEO_KEYWORD_ADDITIONS[["camera", "frametime"][index]],
  ],
}));

const AUDIO_KEYWORDS: KeywordGroup[] = [
  { label: "แนวเพลง", items: ["pop", "rock", "jazz", "lo-fi hip hop", "EDM", "acoustic folk", "classical orchestral", "synthwave", "R&B", "Thai pop", "city pop", "bossa nova"] },
  { label: "อารมณ์", items: ["upbeat", "melancholic", "dreamy", "energetic", "romantic", "epic cinematic", "chill and relaxing", "dark and moody", "nostalgic", "hopeful"] },
  { label: "เครื่องดนตรี", items: ["piano", "acoustic guitar", "electric guitar", "strings section", "synthesizer", "808 bass", "live drums", "saxophone", "violin solo", "brass section"] },
  { label: "เสียงร้อง", items: ["female vocals", "male vocals", "duet", "choir harmonies", "instrumental only", "whispery vocals", "powerful belting vocals", "rap verse"] },
  { label: "จังหวะ / Tempo", items: ["slow tempo", "mid-tempo", "fast tempo", "driving beat", "waltz rhythm", "swing groove", "syncopated rhythm", "steady 4/4 groove"] },
  { label: "โปรดักชัน", items: ["studio quality", "live recording feel", "vintage analog warmth", "modern polished production", "minimal arrangement", "lush arrangement", "wide stereo mix", "tape saturation"] },
];

export const KEYWORDS_BY_MODE: Record<Mode, KeywordGroup[]> = {
  home: HOME_KEYWORDS,
  infographic: INFOGRAPHIC_KEYWORDS,
  // โหมด video: สองกลุ่มเฉพาะวิดีโออยู่บนสุด (กลุ่มแรกเปิด default) ตามด้วยกลุ่มเดิมของ Home ทั้งหมด
  video: [
    ...VIDEO_CONTROL_KEYWORDS,
    ...HOME_KEYWORDS,
  ],
  audio: AUDIO_KEYWORDS,
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
  audio: {
    placeholder: "อธิบายเพลงที่ต้องการ… เช่น an upbeat Thai pop song about summer love, female vocals, acoustic guitar",
    empty: "ยังไม่มีเพลง — ใส่ prompt แล้วกด Generate ได้เลยค่ะ",
    title: "Audio Gallery",
    countLabel: "Songs",
    hint: "Lyria 3 Pro สร้างเพลงเต็ม (~$0.08/เพลง) ส่วน Clip สร้างคลิป 30 วิ (~$0.04/คลิป) — ใช้เวลาราวๆ 1–2 นาทีต่อเพลง Enter เพื่อสั่ง gen ได้เลย",
  },
};

export function modeLabel(mode: Mode): string {
  return mode === "audio" ? "Audio" : mode === "video" ? "Video" : mode === "infographic" ? "Infographic" : "General";
}
