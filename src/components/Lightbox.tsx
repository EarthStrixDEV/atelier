import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { closeLightbox, doneIndices, downloadCurrent, lbStep } from "../lib/actions";
import { mutate, useApp } from "../lib/store";

export default function Lightbox() {
  const s = useApp();
  const ms = s.modes[s.mode];
  const item = ms.images[ms.lbIndex];
  const open = ms.lbIndex >= 0 && !!item;

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

  if (!open) return null;

  const isVid = item.mode === "video";
  const ds = doneIndices();
  const pos = ds.indexOf(ms.lbIndex);

  return (
    <div className="fixed inset-0 z-100 flex flex-col bg-[rgba(5,5,5,.94)] backdrop-blur-lg">
      <div className="flex shrink-0 items-center justify-between px-6 py-4">
        <div className="font-mono text-xs text-text-dim">
          {item.modelName}&nbsp;&nbsp;·&nbsp;&nbsp;{item.ratio}
          {isVid && <>&nbsp;&nbsp;·&nbsp;&nbsp;{item.duration}s</>}
        </div>
        <div className="flex gap-2.5">
          {!isVid && (
            <select
              className="cursor-pointer appearance-none rounded-lg border border-border-strong bg-transparent px-2 py-2 text-xs text-text outline-none focus:border-accent"
              title="รูปแบบไฟล์ที่จะดาวน์โหลด"
              value={s.lbFormat}
              onChange={e => mutate(st => { st.lbFormat = e.target.value as "png" | "jpg"; })}
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          )}
          <button className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong px-4 py-2 text-[12.5px] text-text transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink" onClick={downloadCurrent}>
            <Download size={13} /> Download
          </button>
          <button className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong px-4 py-2 text-[12.5px] text-text transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink" onClick={closeLightbox}>
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
            className="absolute left-[18px] top-1/2 grid h-[42px] w-[42px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-border-strong bg-[rgba(10,10,10,.7)] text-text transition-colors hover:bg-accent hover:text-accent-ink"
            onClick={() => lbStep(-1)}
          >
            <ChevronLeft size={17} />
          </button>
        )}
        {isVid ? (
          <video src={item.url ?? undefined} controls className="max-h-full max-w-full rounded-lg shadow-[0_20px_80px_rgba(0,0,0,.6)]" />
        ) : (
          <img src={item.url ?? undefined} alt="preview" className="max-h-full max-w-full rounded-lg shadow-[0_20px_80px_rgba(0,0,0,.6)]" />
        )}
        {pos < ds.length - 1 && (
          <button
            className="absolute right-[18px] top-1/2 grid h-[42px] w-[42px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-border-strong bg-[rgba(10,10,10,.7)] text-text transition-colors hover:bg-accent hover:text-accent-ink"
            onClick={() => lbStep(1)}
          >
            <ChevronRight size={17} />
          </button>
        )}
      </div>

      <div className="max-h-[70px] shrink-0 overflow-y-auto px-6 pb-5 text-center text-[13px] leading-normal text-text-dim">
        {item.prompt}
      </div>
    </div>
  );
}
