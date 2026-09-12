import { useCallback, useEffect, useRef, useState } from "react";
import { Columns2, X } from "lucide-react";
import { closeCompare } from "../lib/actions";
import { useApp } from "../lib/store";
import { ratioCSS } from "../lib/utils";

/**
 * Swipe-style before/after comparison — เฉพาะตอนมี item พอดี 2 ชิ้น
 * ลากเส้นแบ่งซ้าย/ขวาด้วย mouse/touch — ภาพซ้ายอยู่ด้านล่างเต็มเฟรม ภาพขวาถูก clip ทับด้านบนตามตำแหน่งเส้น
 */
function SwipeCompare({ a, b }: { a: string; b: string }) {
  const [pct, setPct] = useState(50); // % จากซ้าย ที่แสดงภาพ b (ขวา)
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(100, Math.max(0, next)));
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (draggingRef.current) updateFromClientX(e.clientX); };
    const onTouchMove = (e: TouchEvent) => { if (draggingRef.current && e.touches[0]) updateFromClientX(e.touches[0].clientX); };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [updateFromClientX]);

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden rounded-lg bg-surface-2">
      <img src={a} alt="ก่อน" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
        <img src={b} alt="หลัง" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      </div>
      <div
        className="absolute inset-y-0 z-10 flex w-0 -translate-x-1/2 cursor-ew-resize items-center justify-center"
        style={{ left: pct + "%" }}
        onMouseDown={e => { e.preventDefault(); draggingRef.current = true; }}
        onTouchStart={() => { draggingRef.current = true; }}
      >
        <div className="h-full w-[2px] bg-on-media/80 shadow-[0_0_8px_rgba(0,0,0,.5)]" />
        <div className="absolute grid h-8 w-8 place-items-center rounded-full border border-on-media-dim/60 bg-media-scrim/70 text-on-media backdrop-blur">
          <Columns2 size={14} />
        </div>
      </div>
      <span className="absolute left-2 top-2 rounded-full border border-on-media-dim bg-media-scrim/70 px-2 py-0.5 text-[10px] font-semibold text-on-media">ก่อน</span>
      <span className="absolute right-2 top-2 rounded-full border border-on-media-dim bg-media-scrim/70 px-2 py-0.5 text-[10px] font-semibold text-on-media">หลัง</span>
    </div>
  );
}

export default function CompareModal() {
  const s = useApp();
  const items = s.compareItems;

  useEffect(() => {
    if (!items) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeCompare(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items]);

  if (!items || items.length < 2) return null;

  const isSwipe = items.length === 2;

  return (
    <div className="fixed inset-0 z-190 flex flex-col bg-media-scrim backdrop-blur-lg">
      <div className="flex shrink-0 items-center justify-between px-6 py-4">
        {/* บอกโหมดที่ใช้อยู่ — layout เปลี่ยนเองตามจำนวนรูป (2 = เลื่อนทับกัน, 3-4 = เรียงข้างกัน)
            ถ้าไม่บอก ผู้ใช้ที่เคยเทียบ 2 รูปแล้วมาเทียบ 3 รูปจะนึกว่าเครื่องมือพัง */}
        <div className="flex items-center gap-2 text-[13px] text-on-media-dim">
          <Columns2 size={15} /> Compare ({items.length} รูป)
          <span className="text-on-media-dim/70">· {isSwipe ? "เลื่อนเทียบซ้าย-ขวา" : "ดูเรียงข้างกัน"}</span>
        </div>
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-on-media-dim px-4 py-2 text-[12.5px] text-on-media transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
          onClick={closeCompare}
        >
          Close <X size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {isSwipe ? (
          <div className="mx-auto flex h-full max-w-[900px] flex-col gap-4">
            <div className="min-h-0 flex-1" style={{ aspectRatio: ratioCSS(items[0].ratio) }}>
              <SwipeCompare a={items[0].url!} b={items[1].url!} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {items.map(item => (
                <div key={item.id} className="rounded-lg border border-on-media-dim bg-on-media/10 p-3 text-[11.5px] text-on-media-dim">
                  <div className="mb-1 line-clamp-2 text-on-media">{item.prompt}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-on-media-dim">
                    <span>{item.modelName}</span>
                    <span>·</span>
                    <span>{item.ratio}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={"grid h-full gap-4 " + (items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
            {items.map(item => (
              <div key={item.id} className="flex min-h-0 flex-col gap-2.5">
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-surface-2" style={{ aspectRatio: ratioCSS(item.ratio) }}>
                  <img src={item.url!} alt={item.prompt} className="h-full w-full object-contain" />
                </div>
                <div className="rounded-lg border border-on-media-dim bg-on-media/10 p-3 text-[11.5px] text-on-media-dim">
                  <div className="mb-1 line-clamp-2 text-on-media">{item.prompt}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-on-media-dim">
                    <span>{item.modelName}</span>
                    <span>·</span>
                    <span>{item.ratio}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
