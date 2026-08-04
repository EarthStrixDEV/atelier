import { useEffect, useState } from "react";
import { Check, Copy, Download, ImageIcon, Music, RefreshCw } from "lucide-react";
import { MODE_META } from "../lib/constants";
import {
  clearSelection, copyPromptFromItem, downloadSelected, openLightbox,
  regenerateFromItem, retry, toggleSelect,
} from "../lib/actions";
import { useApp } from "../lib/store";
import type { GenItem } from "../lib/types";
import { ratioCSS, videoProgressPct, videoStatusText } from "../lib/utils";
import PromptComposer from "./PromptComposer";

const RING_C = 176; // เส้นรอบวง r=28 (2π×28 ≈ 175.9)

// % วิดีโอเป็นค่าประเมินจากเวลา — ticker 1 วินาทีอยู่ใน component นี้เอง
// re-render เฉพาะวงแหวน ไม่กระทบ <video> ของ card ที่เสร็จแล้ว
function VideoProgress({ item }: { item: GenItem }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const pct = item.startedAt ? videoProgressPct(item) : 0;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <div className="relative h-16 w-16">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-border-strong)" strokeWidth="4" />
          <circle
            cx="32" cy="32" r="28" fill="none" stroke="var(--color-text)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - pct / 100)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-mono text-xs text-text">{pct}%</div>
      </div>
      <div className="font-mono text-[11px] text-text-dim">{item.startedAt ? videoStatusText(item) : "รอคิว…"}</div>
    </div>
  );
}

function Card({ item, index, selected }: { item: GenItem; index: number; selected: boolean }) {
  const isVid = item.mode === "video";
  const isAud = item.mode === "audio";
  const done = item.status === "done";

  return (
    <div
      className={
        "group relative overflow-hidden rounded-card border bg-surface transition-colors " +
        (selected ? "border-accent" : "border-border") +
        (done ? " cursor-zoom-in hover:border-border-strong" : "")
      }
      onClick={done ? () => openLightbox(index) : undefined}
    >
      <div className="relative w-full bg-surface-2" style={{ aspectRatio: isAud ? "2 / 1" : ratioCSS(item.ratio) }}>
        <span className="pointer-events-none absolute left-2 top-2 z-1 max-w-[calc(100%-16px)] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-border-strong bg-[rgba(10,10,10,.72)] px-[9px] py-[3px] font-mono text-[9.5px] text-text backdrop-blur-sm" title={item.model}>
          {item.modelName}
        </span>

        {done && (
          isVid ? (
            <video src={item.url ?? undefined} muted loop autoPlay playsInline className="absolute inset-0 block h-full w-full object-cover" />
          ) : isAud ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 pt-6">
              <Music size={26} className="text-text-dim" />
              {/* stopPropagation กันคลิกที่ตัวเล่นเพลงแล้วเปิด lightbox */}
              <audio src={item.url ?? undefined} controls className="h-9 w-full" onClick={e => e.stopPropagation()} />
            </div>
          ) : (
            <img src={item.url ?? undefined} alt={item.prompt} className="absolute inset-0 block h-full w-full object-cover" />
          )
        )}

        {done && (
          <button
            className={
              "absolute right-2 top-2 z-1 grid h-6 w-6 cursor-pointer place-items-center rounded-md border transition-all " +
              (selected
                ? "border-accent bg-accent text-accent-ink opacity-100"
                : "border-border-strong bg-[rgba(10,10,10,.72)] text-text opacity-0 backdrop-blur-sm group-hover:opacity-100")
            }
            title="เลือกเพื่อดาวน์โหลดหลายรูป"
            onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
          >
            <Check size={14} />
          </button>
        )}

        {!done && item.status === "loading" && (
          isVid ? (
            <VideoProgress item={item} />
          ) : (
            <>
              <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,.05)_50%,transparent_70%)] bg-[length:200%_100%]" />
              <div className="absolute left-1/2 top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-border-strong border-t-text" />
            </>
          )
        )}

        {item.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-[18px] text-center">
            <div className="max-h-[60%] overflow-hidden text-[11.5px] leading-normal text-danger">{item.errMsg}</div>
            <button
              className="cursor-pointer rounded-[7px] border border-border-strong px-4 py-1.5 text-[11.5px] text-text transition-colors hover:border-text"
              onClick={e => { e.stopPropagation(); retry(item); }}
            >
              ลองใหม่
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-between gap-2.5 border-t border-border px-3 py-2.5 text-[11px] text-text-dim">
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.prompt}</span>
        <span className="shrink-0 font-mono text-[10px] text-text-faint">{isAud ? "mp3" : item.ratio}</span>
      </div>

      {done && (
        <div className="flex gap-1.5 px-3 pb-2.5">
          <button
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
            onClick={e => { e.stopPropagation(); copyPromptFromItem(item); }}
          >
            <Copy size={10} /> Copy Prompt
          </button>
          <button
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
            onClick={e => { e.stopPropagation(); regenerateFromItem(item); }}
          >
            <RefreshCw size={10} /> Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

export default function Gallery() {
  const s = useApp();
  const ms = s.modes[s.mode];
  const meta = MODE_META[s.mode];
  const done = ms.images.filter(x => x.status === "done").length;
  const loading = ms.images.filter(x => x.status === "loading").length;
  const unit = s.mode === "video" ? " clip" : s.mode === "audio" ? " song" : " image";

  // เผื่อ item ที่เคยเลือกไว้ถูกลบ/ยังไม่ done — กรองเฉพาะที่ยัง valid
  const validIds = new Set(ms.images.filter(x => x.status === "done").map(x => x.id));
  const selectedCount = [...ms.selected].filter(id => validIds.has(id)).length;

  const centerPrompt = s.promptPlacement === "center";

  return (
    <main className="relative flex min-w-0 flex-1 overflow-hidden">
      <div className={
        "min-w-0 flex-1 overflow-y-auto p-7 max-[860px]:p-5 " +
        (centerPrompt ? "pb-44 max-[860px]:pb-40" : "")
      }>
      <div className="mb-[18px] flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.2px] text-text-dim">{meta.title}</h2>
        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <span className="flex items-center gap-2">
              <span className="text-xs text-text-dim">{selectedCount} รูปที่เลือก</span>
              <button
                className="flex cursor-pointer items-center gap-1 rounded-md border border-border-strong px-2.5 py-1 text-[11px] text-text transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
                onClick={downloadSelected}
              >
                <Download size={11} /> ดาวน์โหลด
              </button>
              <button
                className="cursor-pointer rounded-md border border-border px-2.5 py-1 text-[11px] text-text-dim transition-colors hover:border-border-strong hover:text-text"
                onClick={clearSelection}
              >
                ยกเลิก
              </button>
            </span>
          )}
          <span className="font-mono text-xs text-text-faint">
            {ms.images.length
              ? done + unit + (done !== 1 ? "s" : "") + (loading ? " · generating " + loading + "…" : "")
              : ""}
          </span>
        </div>
      </div>

      {!ms.images.length ? (
        <div className="flex min-h-[380px] flex-col items-center justify-center gap-3.5 rounded-[14px] border border-dashed border-border text-text-faint">
          {s.mode === "audio"
            ? <Music size={44} className="opacity-40" strokeWidth={1.4} />
            : <ImageIcon size={44} className="opacity-40" strokeWidth={1.4} />}
          <p className="text-[13px]">{meta.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {ms.images.map((item, i) => (
            <Card key={item.id} item={item} index={i} selected={ms.selected.has(item.id)} />
          ))}
        </div>
      )}
      </div>
      {centerPrompt && !s.chatOpen && (
        <div className="pointer-events-none absolute inset-x-6 bottom-[max(24px,env(safe-area-inset-bottom))] z-40 flex justify-center max-[860px]:inset-x-3 max-[860px]:bottom-[max(12px,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto w-full max-w-[720px]">
            <PromptComposer placement="center" />
          </div>
        </div>
      )}
      {centerPrompt && s.chatOpen && (
        <div className="pointer-events-none absolute bottom-6 left-6 right-[404px] z-40 flex justify-center max-[860px]:hidden">
          <div className="pointer-events-auto w-full max-w-[720px]">
            <PromptComposer placement="center" />
          </div>
        </div>
      )}
    </main>
  );
}
