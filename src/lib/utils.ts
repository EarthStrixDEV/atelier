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
      ctx.fillStyle = "#fff"; // jpg ไม่มี alpha channel กันพื้นหลังโปร่งใสกลายเป็นดำ
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
