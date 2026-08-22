import type { GenItem } from "./types";
import { captureVideoFrame, isImageDataUrl } from "./utils";
import { isVideoMode } from "./constants";

/**
 * fallback สีตายตัว ใช้เมื่ออ่าน computed style ไม่ได้ (เช่น CSS ยังไม่ถูก apply หรือมีคนเปลี่ยน
 * ชื่อ CSS variable แล้ว read() คืน string ว่าง) — ให้การ์ดยังออกมาดูได้ ไม่ล้มเงียบๆ
 *
 * **ค่าที่นี่ต้องตรงกับธีม `paper` ใน themes.ts เป๊ะทุกตัว** (paper = DEFAULT_THEME) เพราะเคสที่
 * fallback ทำงานคือเคสที่ธีมยังไม่ถูก apply ซึ่งสิ่งที่ผู้ใช้เห็นบนจอตอนนั้นก็คือ paper
 * เอาสีธีมอื่นมาใส่จะได้การ์ดที่ไม่ตรงกับอะไรเลย
 *
 * ที่นี่มี 9 ตัวไม่ใช่ 18 ตัวเต็มของ `ThemeTokens` โดยตั้งใจ — การ์ดวาดด้วยสีแค่ 9 ตัวนี้
 * ถ้าเพิ่มสีใหม่ในการ์ด ต้องเพิ่มทั้งที่นี่และใน readThemeColors() พร้อมกัน ไม่งั้น read() คืนค่าว่าง
 */
const FALLBACK_COLORS = {
  bg: "#ffffff",
  surface: "#f7f8f7",
  surface2: "#eef1ef",
  border: "#e0e3e1",
  text: "#0a0a0a",
  textDim: "#5c6360",
  textFaint: "#93998f",
  accent: "#10b981",
  accentInk: "#ffffff",
};

/** อ่านสีธีมปัจจุบันจริงๆ ผ่าน getComputedStyle ตอน render การ์ด (ไม่ hardcode ค่า) — auto-match ธีมไหนก็ตามที่ active อยู่ */
function readThemeColors(): typeof FALLBACK_COLORS {
  const cs = getComputedStyle(document.documentElement);
  const read = (varName: string, fallback: string) => {
    const v = cs.getPropertyValue(varName).trim();
    return v || fallback;
  };
  return {
    bg: read("--color-bg", FALLBACK_COLORS.bg),
    surface: read("--color-surface", FALLBACK_COLORS.surface),
    surface2: read("--color-surface-2", FALLBACK_COLORS.surface2),
    border: read("--color-border", FALLBACK_COLORS.border),
    text: read("--color-text", FALLBACK_COLORS.text),
    textDim: read("--color-text-dim", FALLBACK_COLORS.textDim),
    textFaint: read("--color-text-faint", FALLBACK_COLORS.textFaint),
    accent: read("--color-accent", FALLBACK_COLORS.accent),
    accentInk: read("--color-accent-ink", FALLBACK_COLORS.accentInk),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("โหลดภาพเพื่อทำ share card ไม่สำเร็จ"));
    img.src = src;
  });
}

/** ตัดข้อความยาวเป็นหลายบรรทัดพอดี maxWidth — คืน array บรรทัด (คำที่ยาวเกิน maxWidth เดี่ยวๆ จะถูกปล่อยผ่านทั้งคำ ไม่ตัดกลางคำ) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? current + " " + word : word;
    if (ctx.measureText(attempt).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  // ตัดคำที่เหลือทิ้งด้วย "…" ถ้ายังมีคำค้างอยู่หลังตัดครบ maxLines แล้ว
  const consumedWords = lines.join(" ").split(/\s+/).length;
  if (consumedWords < words.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.replace(/[.,;:!?]*$/, "") + "…";
  }
  return lines.slice(0, maxLines);
}

const CARD_PADDING = 48;
const CARD_MAX_MEDIA_WIDTH = 960;
const CARD_MAX_MEDIA_HEIGHT = 960;
const CARD_MIN_MEDIA_HEIGHT = 320;

/**
 * สร้าง share card เป็น PNG data URL — composite ภาพ (หรือเฟรมแรกของวิดีโอ ใช้กลไกเดียวกับ Cinematic
 * TimeFrame & Extend / autoExtendFromLastFrame ใน actions.ts ผ่าน captureVideoFrame) ลงบน branded card
 * พร้อม prompt + ชื่อโมเดล อ่านสีธีมปัจจุบันจริงจาก CSS variable เพื่อให้ตรงกับธีมที่ active อยู่เสมอ
 */
export async function generateShareCard(item: GenItem): Promise<string> {
  if (!item.url) throw new Error("ไม่มีไฟล์ผลลัพธ์ให้สร้าง share card ค่ะ");

  const colors = readThemeColors();

  // วิดีโอ (ไม่ใช่ synthetic root ที่เป็นภาพนิ่ง) — จับเฟรมแรกด้วยกลไกเดียวกับ Cinematic Extend tool
  const isVideo = isVideoMode(item.mode) && !isImageDataUrl(item.url);
  const mediaSrc = isVideo ? (await captureVideoFrame(item.url, 0)).dataUrl : item.url;
  const img = await loadImage(mediaSrc);

  // ปรับกรอบภาพให้พอดีกับกรอบการ์ด (ไม่ fix เป็นสี่เหลี่ยมจัตุรัส) — คุมทั้งความกว้างและความสูงสูงสุด
  // แล้ว fit ลงในกรอบนั้นแบบคง aspect ratio ต้นฉบับ รองรับทั้งภาพแนวนอนกว้างมากและแนวตั้งสูงมาก
  const naturalRatio = img.naturalWidth / img.naturalHeight;
  let mediaW = CARD_MAX_MEDIA_WIDTH;
  let mediaH = mediaW / naturalRatio;
  if (mediaH > CARD_MAX_MEDIA_HEIGHT) {
    mediaH = CARD_MAX_MEDIA_HEIGHT;
    mediaW = mediaH * naturalRatio;
  }
  if (mediaH < CARD_MIN_MEDIA_HEIGHT) mediaH = CARD_MIN_MEDIA_HEIGHT;

  const cardW = Math.round(mediaW + CARD_PADDING * 2);
  const footerH = 176; // พื้นที่ prompt + model + brand ด้านล่างภาพ — คงที่ไม่ขึ้นกับ aspect ratio ของภาพ
  const headerH = 64; // แถบแบรนด์ด้านบน
  const cardH = Math.round(headerH + mediaH + footerH);

  const canvas = document.createElement("canvas");
  canvas.width = cardW;
  canvas.height = cardH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ไม่รองรับ canvas 2D context ค่ะ");

  // พื้นหลังการ์ดตามธีมปัจจุบัน
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, cardW, cardH);

  // แถบแบรนด์ด้านบน
  ctx.fillStyle = colors.text;
  ctx.font = "700 22px Inter, 'Noto Sans Thai', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("AI Media Studio", CARD_PADDING, headerH / 2);
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(cardW - CARD_PADDING - 6, headerH / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  // กรอบภาพ/เฟรมวิดีโอ อยู่กึ่งกลางแนวนอนของการ์ด
  const mediaX = Math.round((cardW - mediaW) / 2);
  const mediaY = headerH;
  ctx.fillStyle = colors.surface2;
  ctx.fillRect(mediaX, mediaY, mediaW, mediaH);
  // cover fit ภายในกรอบสื่อ กันภาพยืด/บีบผิดสัดส่วน (ปกติจะพอดีเป๊ะอยู่แล้วเพราะคำนวณ mediaW/H จาก naturalRatio แต่กันไว้เผื่อ min-height ดันสัดส่วนเพี้ยน)
  const boxRatio = mediaW / mediaH;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (naturalRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else if (naturalRatio < boxRatio) {
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, mediaX, mediaY, mediaW, mediaH);
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(mediaX + 0.5, mediaY + 0.5, mediaW - 1, mediaH - 1);

  // prompt (ตัดคำ wrap สูงสุด 3 บรรทัด) + ชื่อโมเดล ด้านล่างภาพ
  const footerY = mediaY + mediaH + 32;
  const textMaxWidth = cardW - CARD_PADDING * 2;
  ctx.fillStyle = colors.text;
  ctx.font = "500 20px Inter, 'Noto Sans Thai', sans-serif";
  const promptLines = wrapText(ctx, item.prompt.trim() || "(ไม่มี prompt)", textMaxWidth, 3);
  promptLines.forEach((line, i) => {
    ctx.fillText(line, CARD_PADDING, footerY + i * 28);
  });

  ctx.fillStyle = colors.textFaint;
  ctx.font = "400 14px 'SF Mono', 'JetBrains Mono', Consolas, monospace";
  const modelY = footerY + promptLines.length * 28 + 20;
  ctx.fillText(item.modelName + (isVideo ? "  ·  " + item.ratio + "  ·  " + item.duration + "s" : "  ·  " + item.ratio), CARD_PADDING, modelY);

  return canvas.toDataURL("image/png");
}
