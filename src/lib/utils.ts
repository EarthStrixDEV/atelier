import type { GenItem, ImgFormat, ORModel } from "./types";

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const hasKeyword = (prompt: string, kw: string) =>
  new RegExp("(^|[,\\s])" + escRe(kw) + "($|[,\\s])", "i").test(prompt);

/** เพิ่ม/ลบ keyword จาก prompt พร้อมจัดการ comma ที่พ่วงอยู่ — พอร์ตจาก toggleKeyword เดิม */
export function togglePromptKeyword(prompt: string, kw: string): string {
  if (hasKeyword(prompt, kw)) {
    return prompt
      .replace(new RegExp("\\s*,\\s*" + escRe(kw) + "(?=$|[,\\s])", "i"), "")
      .replace(new RegExp("(^|[,\\s])" + escRe(kw) + "\\s*,?\\s*", "i"), "$1")
      .trim().replace(/^,\s*/, "").replace(/,\s*$/, "");
  }
  return prompt.trim() ? prompt.trim().replace(/,\s*$/, "") + ", " + kw : kw;
}

/**
 * ตัด comma-separated phrase ที่ซ้ำกันทั้งวลี (เทียบแบบ case-insensitive หลัง trim) ออก เหลือครั้งแรกที่เจอ
 * แนวทางระวังตัว — ตัดเฉพาะวลีที่คั่นด้วย comma ทั้งเส้น (แบบที่ Prompt Builder ต่อ keyword เข้าไป)
 * ไม่แตะคำที่ซ้ำกันภายในประโยคเดียว (เช่น "the cat and the cat's shadow") เพราะ tokenize แค่ระดับ comma เท่านั้น
 * วลีว่าง (จาก ", ,") จะถูกตัดทิ้งไปด้วยเป็นผลพลอยได้
 */
export function dedupCommaPhrases(prompt: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of prompt.split(",")) {
    const phrase = raw.trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(phrase);
  }
  return kept.join(", ");
}

/** ประเมินขนาดไฟล์ (byte) จาก data URL — ใช้เช็ค MAX_REF_BYTES กับภาพที่มาจาก in-memory data URL (ไม่ใช่ File ที่มี .size ตรงๆ) */
export function dataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor(base64.length * 0.75) - padding;
}

/**
 * item.mode video/cinematic ปกติแล้ว item.url เป็นไฟล์วิดีโอ (blob URL) เสมอ — ยกเว้น "synthetic root" ที่ startFromItem
 * สร้างขึ้น (ดู actions.ts) ซึ่งอาจใช้ data URL ของภาพนิ่งตรงๆ เป็น url (ยังไม่มีวิดีโอจริงจนกว่าจะกด generate ต่อ)
 * ใช้เช็คใน Gallery/Lightbox ว่าควร render เป็น <img> (poster) แทน <video> ตอนไหน
 */
export function isImageDataUrl(url: string | null): boolean {
  return !!url && url.startsWith("data:image/");
}

export function ratioCSS(r: string): string {
  const [w, h] = r.split(":").map(Number);
  return w && h ? `${w} / ${h}` : "1 / 1";
}

const RAND_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&";
export function randomFileName(ext: string): string {
  let s = "";
  for (let i = 0; i < 20; i++) s += RAND_CHARS[Math.floor(Math.random() * RAND_CHARS.length)];
  return "atelier_" + s + "." + ext;
}

/** แปลง data URL ต้นทาง (มักเป็น png) ไปเป็น jpg ผ่าน canvas เพราะ browser ไม่มี API แปลง format ตรงๆ */
export function convertDataUrl(url: string, format: ImgFormat): Promise<string> {
  return new Promise((resolve, reject) => {
    if (format === "png") { resolve(url); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      // THEME DO-NOT-TOUCH: นี่คือพื้นหลังของ "ไฟล์ JPG ที่ผู้ใช้ดาวน์โหลด" ไม่ใช่สี UI
      // JPG ไม่มี alpha channel — พื้นที่โปร่งใสต้องถูกถมเป็นขาวก่อน encode ไม่งั้นกลายเป็นดำ
      // ห้าม map เป็น theme token: ถ้าผูกกับธีม ผู้ใช้ธีมมืดจะได้ไฟล์ JPG พื้นดำโดยไม่ได้ตั้งใจ
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * ฟอร์แมต USD ให้คงเส้นคงวาข้าม Model Catalog (table + grid, ทั้ง 3 domain) — แทนการ inline .toFixed()
 * แยกๆ กันหลายแบบ ไม่ใช้กับ Sidebar usage bar เดิม (ยังใช้ .toFixed() ของตัวเองต่อไป นอก scope)
 * จำนวนทศนิยม: ปรับตามขนาดตัวเลขให้ตัวเลขเล็กๆ (เช่น ราคาต่อภาพ 0.000002) ยังอ่านความต่างออก
 */
export function fmtUsd(n: number, opts?: { trimTrailingZeros?: boolean }): string {
  const decimals = n < 0.01 ? 6 : n < 1 ? 3 : 2;
  let s = n.toFixed(decimals);
  if (opts?.trimTrailingZeros && s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return "$" + s;
}

// สรุป duration เป็นช่วงถ้าต่อเนื่องทีละ 1 (เช่น grok "1,2,...,15" → "1-15 วิ")
// ถ้าไม่ต่อเนื่อง (เช่น veo "4,6,8") แสดงเป็นลิสต์คั่นจุลภาคแทน — ทั้งสองแบบอ่านง่ายกว่าลิสต์ตัวเลขยาวๆ
export function fmtDurations(durations: number[]): string {
  const sorted = [...durations].sort((a, b) => a - b);
  const isConsecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isConsecutive && sorted.length > 2) {
    return `${sorted[0]}-${sorted[sorted.length - 1]} วิ`;
  }
  return sorted.map(d => `${d}วิ`).join(", ");
}

// ราคาต่อวินาทีที่ 720p — schema ของ pricing_skus ต่างกันต่อ provider
// (grok คิดเป็น cents, veo/kling เป็น USD ต่อวินาที, seedance เป็น token คำนวณล่วงหน้าไม่ได้ → null)
export function videoPricePerSec(m: ORModel, audio: boolean): number | null {
  const s = m.pricing_skus || {};
  const n = (k: string) => (s[k] != null ? parseFloat(String(s[k])) : null);
  const cents = n("cents_per_video_output_second_720p");
  if (cents != null) return cents / 100;
  if (audio) return n("duration_seconds_with_audio_720p") ?? n("duration_seconds_with_audio") ?? n("duration_seconds");
  return n("duration_seconds_without_audio_720p") ?? n("duration_seconds_without_audio") ?? n("duration_seconds");
}

// % ความคืบหน้าวิดีโอเป็นค่าประเมินจากเวลา (API ไม่ส่ง % จริง) ค้างสูงสุด 95% จน job เสร็จจริง
export function videoProgressPct(item: GenItem): number {
  const elapsed = (Date.now() - (item.startedAt ?? Date.now())) / 1000;
  return Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 60))));
}

export function fmtElapsed(item: GenItem): string {
  const s = Math.floor((Date.now() - (item.startedAt ?? Date.now())) / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function videoStatusText(item: GenItem): string {
  return (item.jobStatus === "in_progress" ? "กำลังสร้าง… " : "รอคิว… ") + fmtElapsed(item);
}

/** เศษวินาทีที่ถอยจากจุดจบเดิมทุกครั้งที่ frame ออกมาดำ/ว่างเปล่า — ใช้ครั้งแรกโดย ExtendTool (default เฟรมท้ายสุด) ด้วย */
export const LAST_FRAME_SEEK_OFFSET = 0.05;

/**
 * เช็คว่า canvas ที่ capture มาเป็นเฟรมดำ/ว่างเปล่าไหม — สุ่มตรวจ pixel จำนวนหนึ่งทั่ว canvas (ไม่ต้องอ่านทุก pixel
 * เพื่อความเร็ว) ถือว่า "ว่าง" เมื่อทุกจุดที่สุ่มมาเป็นสีดำสนิท (หรือเกือบดำ) ทั้งหมด — เคสที่พบได้ตอน seek video
 * ไปใกล้จุดจบมากๆ แล้ว browser ยังไม่ decode เฟรมจริงทัน (ได้เฟรมดำของ container แทน)
 */
function isBlankCanvas(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const { width, height } = canvas;
  if (!width || !height) return true;
  const samples = 24;
  let blankCount = 0;
  for (let i = 0; i < samples; i++) {
    const x = Math.floor((width / samples) * i + width / (samples * 2));
    const y = Math.floor(height / 2);
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    if (r < 8 && g < 8 && b < 8) blankCount++;
  }
  return blankCount === samples;
}

/**
 * จับเฟรมจากวิดีโอ (blob URL) ผ่าน offscreen <video> + <canvas> — ใช้กลไกเดียวกับที่ ExtendTool ทำ (seek แล้ว drawImage
 * ลง canvas) แต่ทำงานแบบ headless สร้าง <video> element ของตัวเองแทนที่จะอาศัย element ที่มองเห็นบนหน้าจอเหมือน ExtendTool
 * ใช้โดย autoExtendFromLastFrame และ startFromItem ใน actions.ts (ExtendTool เองยังใช้กลไก inline ของตัวเองต่อไป
 * เพราะต้อง bind กับ <video> ที่ผู้ใช้ scrub ตรงๆ ผ่าน ref)
 *
 * targetTime: null = ท้ายสุดของวิดีโอ (ลบ LAST_FRAME_SEEK_OFFSET กันวิดีโอจบก่อนเฟรมสุดท้าย render), หรือระบุวินาทีตรงๆ
 * ถ้าเฟรมที่ได้ออกมาดำ/ว่างเปล่า (browser quirk ตอน seek ใกล้จุดจบมากๆ) จะถอยเวลากลับมาลองใหม่อัตโนมัติสูงสุด 3 ครั้ง
 */
export function captureVideoFrame(url: string, targetTime?: number | null): Promise<{ dataUrl: string; time: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const RETRY_STEP_SEC = 0.3;
    const MAX_ATTEMPTS = 4;
    let attempt = 0;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const seekTo = (t: number) => {
      video.currentTime = Math.max(0, t);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;
      const base = targetTime != null ? targetTime : Math.max(0, duration - LAST_FRAME_SEEK_OFFSET);
      seekTo(base);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (!canvas.width || !canvas.height) throw new Error("วิดีโอยังโหลดไม่เสร็จ");
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);

        if (isBlankCanvas(canvas) && attempt < MAX_ATTEMPTS - 1) {
          attempt++;
          // ถอยเวลากลับมาก่อนหน้าเรื่อยๆ จนกว่าจะได้เฟรมที่ไม่ดำ หรือครบจำนวนครั้งที่ลอง
          seekTo(video.currentTime - RETRY_STEP_SEC);
          return;
        }

        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        const time = video.currentTime;
        cleanup();
        resolve({ dataUrl, time });
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("โหลดวิดีโอเพื่อจับเฟรมไม่สำเร็จ"));
    };
  });
}

/** ประเภทของ error ที่เกิดตอน generate — ใช้เลือกข้อความ/ไอคอน และบอกว่ากด "ลองใหม่" ช่วยได้ไหม */
export type GenErrorKind = "credit" | "rateLimit" | "policy" | "network" | "timeout" | "auth" | "unknown";

export interface GenErrorInfo {
  kind: GenErrorKind;
  /** หัวข้อสั้นๆ ที่ผู้ใช้อ่านแล้วรู้ทันทีว่าเกิดอะไร */
  title: string;
  /** บอกว่าต้องทำอะไรต่อ — ต้อง actionable ไม่ใช่แค่บรรยายอาการซ้ำ */
  hint: string;
  /** true = กดลองใหม่แล้วมีโอกาสสำเร็จโดยไม่ต้องแก้อะไรก่อน */
  retryable: boolean;
}

/**
 * เดาประเภท error จากข้อความดิบที่ได้จาก OpenRouter/fetch — จงใจใช้การ match ข้อความ
 * เพราะ error หลายจุดใน actions.ts ถูกโยนเป็น string ไปแล้ว (เช่น "HTTP 429") ไม่เหลือ status code
 * ให้อ่านตรงๆ ลำดับการเช็คสำคัญ: เคสที่เจาะจงกว่าต้องมาก่อนเคสกว้าง
 */
export function classifyGenError(raw: string): GenErrorInfo {
  const s = (raw || "").toLowerCase();

  if (/402|insufficient|not enough credit|quota exceeded|billing/.test(s)) {
    return {
      kind: "credit",
      title: "เครดิต OpenRouter ไม่พอ",
      hint: "เติมเครดิตที่ openrouter.ai แล้วค่อยกดลองใหม่นะคะ",
      retryable: false,
    };
  }
  if (/429|rate.?limit|too many requests/.test(s)) {
    return {
      kind: "rateLimit",
      title: "ยิงถี่เกินไป (rate limit)",
      hint: "รอสักครู่แล้วกดลองใหม่ได้เลยค่ะ ถ้าสร้างทีละหลายรูปลองลดจำนวนลง",
      retryable: true,
    };
  }
  if (/content policy|safety|moderation|flagged|violat|prohibited|nsfw/.test(s)) {
    return {
      kind: "policy",
      title: "prompt ติดนโยบายเนื้อหา",
      hint: "โมเดลปฏิเสธ prompt นี้ ลองแก้คำที่สุ่มเสี่ยงแล้วสร้างใหม่ค่ะ — กดลองใหม่เฉยๆ จะได้ผลเดิม",
      retryable: false,
    };
  }
  if (/401|403|unauthorized|forbidden|invalid api key|no auth/.test(s)) {
    return {
      kind: "auth",
      title: "API key ใช้ไม่ได้",
      hint: "ตรวจ key ที่ปุ่ม API Key ด้านบนขวา หรือสร้าง key ใหม่ที่ openrouter.ai/keys ค่ะ",
      retryable: false,
    };
  }
  if (/หมดเวลารอ|timeout|timed out|etimedout/.test(s)) {
    return {
      kind: "timeout",
      title: "รอผลลัพธ์นานเกินไป",
      hint: "งานอาจยังทำอยู่ที่ฝั่งเซิร์ฟเวอร์ — กดลองใหม่เพื่อเช็คงานเดิมต่อได้ ไม่เสียเงินเพิ่มค่ะ",
      retryable: true,
    };
  }
  if (/failed to fetch|network|offline|err_internet|connection|502|503|504/.test(s)) {
    return {
      kind: "network",
      title: "เชื่อมต่อไม่สำเร็จ",
      hint: "เช็คอินเทอร์เน็ตแล้วกดลองใหม่ได้เลยค่ะ",
      retryable: true,
    };
  }
  return {
    kind: "unknown",
    title: "สร้างไม่สำเร็จ",
    hint: "กดลองใหม่ได้ค่ะ ถ้ายังไม่ได้ลองเปลี่ยนโมเดลดูนะคะ",
    retryable: true,
  };
}
