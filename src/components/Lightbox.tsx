import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ImageDown, Play, Sparkles, Video, Wand2, X } from "lucide-react";
import { isVideoMode } from "../lib/constants";
import {
  canRefineItem, canStartFrom, closeLightbox, doneIndices, downloadCurrent, isChainableItem, lbStep, refineItem,
  startFromItem, useAsVideoFirstFrame,
} from "../lib/actions";
import { generateShareCard } from "../lib/shareCard";
import { mutate, toast, useApp } from "../lib/store";
import type { GenItem } from "../lib/types";
import { isImageDataUrl, randomFileName, triggerDownload } from "../lib/utils";

/**
 * Popover ยืนยันโหมดปลายทางของ "Start from this" ใน Lightbox — เหมือนกับใน Gallery Card
 * ต้องยืนยันอีกครั้งก่อนสลับโหมดจริง เพราะพาผู้ใช้กระโดดข้ามแท็บกะทันหันจากปุ่มเล็กๆ บน toolbar
 */
function StartFromThisPopover({ item, onDone }: { item: GenItem; onDone: () => void }) {
  const [target, setTarget] = useState<"video" | "cinematic">(item.mode === "cinematic" ? "video" : "cinematic");
  return (
    <div
      className="absolute right-6 top-[calc(100%+6px)] z-10 flex w-[240px] flex-col gap-2 rounded-xl border border-white/15 bg-[rgba(20,20,20,.96)] p-3 text-left shadow-[0_16px_50px_rgba(0,0,0,.5)] backdrop-blur-xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.5px] text-white/50">Start from this</span>
        <button className="cursor-pointer text-white/50 hover:text-white" onClick={onDone} title="ปิด">
          <X size={12} />
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-white/70">จะสลับไปโหมดที่เลือก แล้วใช้ผลลัพธ์นี้เป็นจุดเริ่มต้น scene ใหม่ค่ะ</p>
      <div className="grid grid-cols-2 gap-1.5">
        {(["cinematic", "video"] as const).map(m => (
          <button
            key={m}
            className={
              "cursor-pointer rounded-md border py-1.5 text-[11px] font-medium capitalize transition-all " +
              (target === m ? "border-accent bg-accent font-semibold text-accent-ink" : "border-white/20 bg-white/5 text-white/70 hover:border-white/40")
            }
            onClick={() => setTarget(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <button
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-[11px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
        onClick={() => { startFromItem(item, target); onDone(); }}
      >
        <Play size={11} /> ยืนยัน — ไป {target}
      </button>
    </div>
  );
}

export default function Lightbox() {
  const s = useApp();
  const ms = s.modes[s.mode];
  const item = ms.images[ms.lbIndex];
  const open = ms.lbIndex >= 0 && !!item;
  const [startFromOpen, setStartFromOpen] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lbStep(-1);
      if (e.key === "ArrowRight") lbStep(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => { setStartFromOpen(false); }, [ms.lbIndex]);

  if (!open) return null;

  // synthetic root ที่ startFromItem สร้าง (ดู actions.ts) เป็น video/cinematic mode แต่ url เป็นภาพนิ่ง — แสดงเป็นรูปแทนวิดีโอ
  const isVid = isVideoMode(item.mode) && !isImageDataUrl(item.url);
  const isAud = item.mode === "audio";
  const ds = doneIndices();
  const pos = ds.indexOf(ms.lbIndex);

  const shareCard = async () => {
    if (!item.url || sharingCard) return;
    setSharingCard(true);
    try {
      const dataUrl = await generateShareCard(item);
      triggerDownload(dataUrl, randomFileName("png"));
    } catch (e) {
      toast(e instanceof Error ? e.message : "สร้าง share card ไม่สำเร็จค่ะ", "error");
    } finally {
      setSharingCard(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="ดูภาพขยาย" className="fixed inset-0 z-100 flex flex-col bg-[rgba(5,5,5,.94)] backdrop-blur-lg">
      <div className="flex shrink-0 items-center justify-between px-6 py-4">
        <div className="font-mono text-xs text-white/60">
          {item.modelName}
          {!isAud && <>&nbsp;&nbsp;·&nbsp;&nbsp;{item.ratio}</>}
          {isVid && <>&nbsp;&nbsp;·&nbsp;&nbsp;{item.duration}s</>}
        </div>
        <div className="flex gap-2.5">
          {!isVid && !isAud && (
            <select
              className="cursor-pointer appearance-none rounded-lg border border-white/25 bg-transparent px-2 py-2 text-xs text-white outline-none focus:border-accent"
              title="รูปแบบไฟล์ที่จะดาวน์โหลด"
              aria-label="รูปแบบไฟล์ที่จะดาวน์โหลด"
              value={s.lbFormat}
              onChange={e => mutate(st => { st.lbFormat = e.target.value as "png" | "jpg"; })}
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          )}
          <button className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 px-4 py-2 text-[12.5px] text-white transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink" aria-label="ดาวน์โหลดไฟล์นี้" onClick={downloadCurrent}>
            <Download size={13} /> Download
          </button>
          {!isAud && !!item.url && (
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 px-4 py-2 text-[12.5px] text-white transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
              title="สร้างการ์ดสวยๆ พร้อม prompt/model ไว้แชร์"
              aria-label={sharingCard ? "กำลังสร้าง share card" : "สร้าง share card พร้อม prompt/model"}
              disabled={sharingCard}
              onClick={shareCard}
            >
              <ImageDown size={13} /> {sharingCard ? "กำลังสร้าง…" : "Share card"}
            </button>
          )}
          {isChainableItem(item) && (
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 px-4 py-2 text-[12.5px] text-white transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
              title="ส่งภาพนี้ไปเป็นเฟรมแรกของ Video mode"
              aria-label="ส่งภาพนี้ไปเป็นเฟรมแรกของ Video mode"
              onClick={() => useAsVideoFirstFrame(item)}
            >
              <Video size={13} /> เฟรมแรกวิดีโอ
            </button>
          )}
          {canRefineItem(item) && (
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-accent/70 px-4 py-2 text-[12.5px] text-white transition-colors hover:bg-accent hover:text-accent-ink"
              title="แนบภาพนี้เป็น reference แล้วพิมพ์สิ่งที่อยากแก้ต่อ"
              aria-label="Refine ภาพนี้ต่อ — แนบเป็น reference แล้วพิมพ์สิ่งที่อยากแก้"
              onClick={() => { refineItem(item); closeLightbox(); }}
            >
              <Sparkles size={13} /> Refine this
            </button>
          )}
          {canStartFrom(item) && (
            <div className="relative">
              <button
                className={
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border px-4 py-2 text-[12.5px] text-white transition-colors " +
                  (startFromOpen ? "border-accent bg-accent text-accent-ink" : "border-white/25 hover:border-accent hover:bg-accent hover:text-accent-ink")
                }
                title="ใช้ผลลัพธ์นี้เป็นจุดเริ่มต้นของ Video/Cinematic mode"
                aria-label="Start from this — ใช้ผลลัพธ์นี้เป็นจุดเริ่มต้นของ Video/Cinematic mode"
                aria-expanded={startFromOpen}
                onClick={() => setStartFromOpen(v => !v)}
              >
                <Wand2 size={13} /> Start from this
              </button>
              {startFromOpen && <StartFromThisPopover item={item} onDone={() => setStartFromOpen(false)} />}
            </div>
          )}
          <button className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 px-4 py-2 text-[12.5px] text-white transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink" aria-label="ปิด Lightbox" onClick={closeLightbox}>
            Close <X size={13} />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-[70px] pb-5"
        onClick={e => { if (e.target === e.currentTarget) closeLightbox(); }}
      >
        {pos > 0 && (
          <button
            className="absolute left-[18px] top-1/2 grid h-[42px] w-[42px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/25 bg-[rgba(10,10,10,.7)] text-white transition-colors hover:bg-accent hover:text-accent-ink"
            aria-label="ภาพก่อนหน้า"
            onClick={() => lbStep(-1)}
          >
            <ChevronLeft size={17} />
          </button>
        )}
        {!item.url ? (
          // synthetic root ที่ startFromItem สร้างจาก item ต้นทางที่เป็นเสียง (ไม่มีเฟรมให้ใช้)
          <div className="flex flex-col items-center gap-3 text-white/50">
            <Video size={40} strokeWidth={1.3} />
            <p className="text-[13px]">ยังไม่มีภาพเริ่มต้น — แนบภาพก่อน generate ได้เลยค่ะ</p>
          </div>
        ) : isVid ? (
          <video src={item.url} controls className="max-h-full max-w-full rounded-lg shadow-[0_20px_80px_rgba(0,0,0,.6)]" />
        ) : isAud ? (
          <audio src={item.url} controls autoPlay className="w-full max-w-[560px]" />
        ) : (
          <img src={item.url} alt="preview" className="max-h-full max-w-full rounded-lg shadow-[0_20px_80px_rgba(0,0,0,.6)]" />
        )}
        {pos < ds.length - 1 && (
          <button
            className="absolute right-[18px] top-1/2 grid h-[42px] w-[42px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/25 bg-[rgba(10,10,10,.7)] text-white transition-colors hover:bg-accent hover:text-accent-ink"
            aria-label="ภาพถัดไป"
            onClick={() => lbStep(1)}
          >
            <ChevronRight size={17} />
          </button>
        )}
      </div>

      <div className="max-h-[70px] shrink-0 overflow-y-auto px-6 pb-5 text-center text-[13px] leading-normal text-white/60">
        {item.prompt}
      </div>
    </div>
  );
}
