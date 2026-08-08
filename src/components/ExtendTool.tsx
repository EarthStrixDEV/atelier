import { useEffect, useRef, useState } from "react";
import { Clapperboard, ListVideo, Pause, Play, SkipForward, X } from "lucide-react";
import { applyExtendFrame, closeExtendTool } from "../lib/actions";
import { toast, useApp } from "../lib/store";

const fmtTc = (t: number) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");

/**
 * TimeFrame & Extend Tool — เลื่อน timeline ของ scene ที่เสร็จแล้วเพื่อเลือกเฟรม
 * แล้วส่งเฟรมนั้น (จับผ่าน canvas จาก blob URL — same-origin จึงอ่าน pixel ได้)
 * ไปเป็น First frame ของ scene ถัดไปในโหมด cinematic
 */
export default function ExtendTool() {
  const s = useApp();
  const item = s.extendItemId != null
    ? s.modes.cinematic.images.find(x => x.id === s.extendItemId) ?? null
    : null;
  const open = !!item?.url;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeExtendTool(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !item) return null;

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
  };

  const useFrame = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { toast("วิดีโอยังโหลดไม่เสร็จค่ะ ลองอีกครั้งนะคะ"); return; }
    v.pause();
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    applyExtendFrame(item, canvas.toDataURL("image/jpeg", 0.92), v.currentTime);
  };

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) closeExtendTool(); }}
    >
      <div className="w-[min(720px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-bold"><Clapperboard size={16} /> TimeFrame &amp; Extend</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-dim">
              เลื่อน timeline เลือกเฟรมที่ต้องการ — เฟรมนั้นจะเป็นเฟรมแรกของ scene ถัดไปค่ะ
            </p>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ปิด"
            onClick={closeExtendTool}
          >
            <X size={15} />
          </button>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-surface-2">
          <video
            ref={videoRef}
            src={item.url ?? undefined}
            muted
            playsInline
            preload="auto"
            className="block max-h-[52vh] w-full object-contain"
            onLoadedMetadata={e => {
              const v = e.currentTarget;
              setDur(v.duration);
              v.currentTime = Math.max(0, v.duration - 0.05); // default เฟรมท้ายสุด — เคสต่อเนื้อเรื่องที่ใช้บ่อยที่สุด
            }}
            onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[9px] border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title={playing ? "หยุดชั่วคราว" : "เล่น"}
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) v.play(); else v.pause();
            }}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.05}
            value={time}
            onChange={e => seek(parseFloat(e.target.value))}
            className="min-w-0 flex-1 cursor-pointer accent-accent"
          />
          <span className="shrink-0 font-mono text-xs text-text-dim">{fmtTc(time)} / {fmtTc(dur)}</span>
          <button
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] border border-border px-3 py-2 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ข้ามไปเฟรมสุดท้าย"
            onClick={() => seek(Math.max(0, dur - 0.05))}
          >
            <SkipForward size={13} /> เฟรมสุดท้าย
          </button>
        </div>

        <button
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-card bg-accent py-[13px] text-sm font-bold tracking-[0.3px] text-accent-ink transition-all hover:opacity-90 active:scale-[.985]"
          onClick={useFrame}
        >
          <ListVideo size={15} /> ใช้เฟรม {fmtTc(time)} สร้าง Scene ถัดไป
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
          เฟรมที่เลือกจะไปอยู่ในช่อง Attach Reference เป็น First frame (Image-to-Video) และ prompt เดิมของ scene นี้จะถูกใส่ให้ถ้าช่อง prompt ยังว่าง — แก้ prompt เป็นเหตุการณ์ถัดไปแล้วกด Generate ได้เลยค่ะ
        </p>
      </div>
    </div>
  );
}
