import { memo, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, useDynamicRowHeight, type ListImperativeAPI, type RowComponentProps } from "react-window";
import {
  ArrowUp, Check, ChevronDown, CircleAlert, Clapperboard, Clock, Cloud, CloudUpload, Columns2, Copy, Crosshair, Download, FastForward, HardDriveDownload,
  ImageIcon, Layers3, ListVideo, Loader2, Music, Play, RefreshCw, RotateCcw, Sparkles, Video, Wand2, X,
} from "lucide-react";
import { MODE_META, RATIOS, isVideoMode } from "../lib/constants";
import {
  autoExtendFromLastFrame, canCompareItem, canRefineItem, canStartFrom, cinematicChains, clearSelection,
  copyPromptFromItem, downloadSelected, isAutoExtending, isChainableItem, isDriveSaveConfigured, modelsForMode, openCompare,
  openExtendTool, openLightbox, refineItem, regenerateFromItem, retry, retryWithOverride, saveItemToDrive, saveSelectedToDrive, startFromItem,
  toggleSelect, useAsVideoFirstFrame,
} from "../lib/actions";
import { state, useApp } from "../lib/store";
import type { GenItem, Mode } from "../lib/types";
import { classifyGenError, isImageDataUrl, ratioCSS, videoProgressPct, videoStatusText } from "../lib/utils";
import PromptComposer from "./PromptComposer";

const RING_C = 176; // เส้นรอบวง r=28 (2π×28 ≈ 175.9)

// ---------- virtualized grid (Phase 13) ----------
// เดิม grid ธรรมดา (CSS grid-cols auto-fill) mount ทุก Card พร้อมกันหมด — session ที่สะสม 80-150+ item
// (โดยเฉพาะวิดีโอ/cinematic/audio ที่มี blob URL ค้างอยู่) ทำให้ scroll กระตุกเพราะ DOM หนักเกินไป
// จึงย้ายมาใช้ react-window List วาดเฉพาะ "แถว" ที่โผล่ในวิวพอร์ต (+overscan) — คำนวณ columnCount เองจากความกว้าง
// จริงของ container ให้พฤติกรรม responsive เหมือน grid-cols-[repeat(auto-fill,minmax(240px,1fr))] เดิมทุกจุดพัก
const GRID_MIN_COL_PX = 240; // ต้องตรงกับ minmax(240px,1fr) เดิม
const GRID_GAP_PX = 16; // เท่ากับ gap-4 เดิม
const GRID_ROW_GAP_PX = 16;
const GRID_OVERSCAN_ROWS = 2; // เผื่อ 2 แถวเหนือ/ใต้วิวพอร์ต ตามที่ระบุใน spec

function columnCountForWidth(width: number): number {
  if (width <= 0) return 1;
  // สูตรเดียวกับที่ CSS auto-fill ใช้เลือกจำนวนคอลัมน์: จำนวนคอลัมน์มากสุดที่ยังกว้าง >= GRID_MIN_COL_PX ต่อคอลัมน์
  const n = Math.floor((width + GRID_GAP_PX) / (GRID_MIN_COL_PX + GRID_GAP_PX));
  return Math.max(1, n);
}

interface GridRowProps {
  items: GenItem[];
  columnCount: number;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onOpen: (index: number) => void;
  registerRowEl: (index: number, el: HTMLDivElement | null) => void;
  /** id ของ card ที่กำลัง focus อยู่ตอนนี้ (Gallery Focus Mode) — null = ไม่มี card ไหนถูก focus */
  focusedId: number | null;
  /** id ของ card ที่เป็นประตูเข้า tab order (roving tabindex) — ดู tabEntryId ใน useGalleryFocus */
  tabEntryId: number | null;
  onFocusCard: (id: number) => void;
  onArrowKey: (id: number, dir: "left" | "right" | "up" | "down") => void;
  onEnterKey: (index: number) => void;
}

/**
 * แถวหนึ่งแถวของ virtualized grid — เรนเดอร์ columnCount การ์ดจาก items[index*columnCount .. ]
 * ความสูงแถวไม่คงที่ (ขึ้นกับ aspect ratio + จำนวนปุ่ม action ที่โชว์จริงของแต่ละ item) จึงใช้ useDynamicRowHeight
 * ของ react-window วัดความสูงจริงหลัง render แล้ว cache ไว้ — ต้องแนบ data-react-window-index ที่ root ของแถว
 * และเรียก observeRowElements (ผ่าน registerRowEl ที่ Gallery ส่งลงมา) ให้ ResizeObserver ของ hook รู้จักแถวนี้
 */
function GridRow({
  index, style, items, columnCount, selected, onToggleSelect, onOpen, registerRowEl,
  focusedId, tabEntryId, onFocusCard, onArrowKey, onEnterKey,
}: RowComponentProps<GridRowProps>) {
  const start = index * columnCount;
  const rowItems = items.slice(start, start + columnCount);

  return (
    <div
      data-react-window-index={index}
      ref={el => registerRowEl(index, el)}
      style={{ ...style, paddingBottom: GRID_ROW_GAP_PX }}
    >
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {rowItems.map((item, i) => (
          <Card
            key={item.id}
            item={item}
            index={start + i}
            selected={selected.has(item.id)}
            autoExtending={isAutoExtending(item.id)}
            onToggleSelect={onToggleSelect}
            onOpen={onOpen}
            focused={focusedId === item.id}
            isTabEntry={tabEntryId === item.id}
            onFocusCard={onFocusCard}
            onArrowKey={onArrowKey}
            onEnterKey={onEnterKey}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * นับจำนวน Card ที่ mount จริงตอนนี้เทียบกับจำนวน item ทั้งหมดในโหมดปัจจุบัน — dev-only readout สำหรับยืนยัน
 * ว่า virtualization ทำงานจริง (ไม่ต้องพึ่ง external profiler) ตัดออกจาก production build ด้วย import.meta.env.DEV
 * (Vite tree-shake ทิ้งทั้งก้อนเพราะเงื่อนไขนี้ evaluate เป็น false ตอน build เสมอ)
 */
function VirtualGridDevReadout({ mounted, total, mode }: { mounted: number; total: number; mode: Mode }) {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 z-30 rounded-md border border-border-strong bg-[rgba(10,10,10,.82)] px-2.5 py-1 font-mono text-[10.5px] text-white/80 backdrop-blur-sm">
      [dev] mounted {mounted}/{total} cards ({mode})
    </div>
  );
}

interface VirtualGridProps {
  items: GenItem[];
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onOpen: (index: number) => void;
  mode: Mode;
  /** ยกออกมาให้ Gallery ควบคุมจากข้างนอกได้ (เช่น เลื่อนไปแถวบนสุดตอนมี item ใหม่โผล่จาก Generate) */
  listRef: RefObject<ListImperativeAPI | null>;
  /** รายงานว่าตอนนี้เห็นแถวบนสุดอยู่ไหม — Gallery ใช้ตัดสินว่าจะ auto-scroll หรือโชว์ปุ่มแทน */
  onAtTopChange: (atTop: boolean) => void;
  /** ปุ่มลอย "ผลลัพธ์ใหม่" — รับมาวางทับในกรอบเดียวกับ List แทนที่จะให้ Gallery ครอบ div เพิ่มเอง */
  newResultPill?: React.ReactNode;
}

/**
 * Gallery Focus Mode (PHASE 15) — โฟกัส card ทีละใบด้วย id ไม่ใช่ index (index เปลี่ยนได้ถ้า items ถูก reorder/ตัดทิ้ง)
 * arrow key ขยับโฟกัสไปการ์ดข้างๆ ตาม columnCount จริง (คำนวณจากความกว้าง container ที่วัดสดอยู่แล้วใน VirtualGrid)
 * ไม่ hijack native Tab order — ต้องคลิกการ์ดหรือกด action โฟกัสก่อนถึงจะเริ่มโหมดนี้
 */
function useGalleryFocus(items: GenItem[], columnCount: number, listRef: RefObject<ListImperativeAPI | null>, mode: Mode) {
  const [focusedId, setFocusedId] = useState<number | null>(null);
  // ช่วง index ของ item ที่ react-window mount อยู่จริงตอนนี้ — ใช้เลือกประตูเข้า tab order ให้เป็นการ์ด
  // ที่อยู่ใน DOM เสมอ (ดู tabEntryId) null = ยังไม่เคยได้รับรายงานจาก List
  const [renderedRange, setRenderedRange] = useState<{ start: number; stop: number } | null>(null);

  // สลับโหมด (Home/Video/…) แล้ว focus เดิมไม่มีความหมายอีกต่อไป — เคลียร์ทิ้ง
  // renderedRange ก็เป็นของ list เก่า เคลียร์ด้วยกันกัน entry point ชี้ช่วงที่ไม่ตรงกับ items ชุดใหม่
  useEffect(() => { setFocusedId(null); setRenderedRange(null); }, [mode]);

  // item ที่ focus ไว้หลุดจาก items จริง (เช่น mode reset) — เคลียร์ focus กัน state ค้าง id ที่ไม่มีอยู่แล้ว
  useEffect(() => {
    if (focusedId != null && !items.some(x => x.id === focusedId)) setFocusedId(null);
  }, [items, focusedId]);

  const onFocusCard = useCallback((id: number) => setFocusedId(id), []);

  const onArrowKey = useCallback((id: number, dir: "left" | "right" | "up" | "down") => {
    const idx = items.findIndex(x => x.id === id);
    if (idx === -1) return;
    const delta = dir === "left" ? -1 : dir === "right" ? 1 : dir === "up" ? -columnCount : columnCount;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= items.length) return;
    // ซ้าย/ขวาไม่ให้ข้ามแถว (เช่นการ์ดขวาสุดกด → ไม่ควรวนไปการ์ดแรกของแถวถัดไปแบบงงๆ)
    if ((dir === "left" || dir === "right") && Math.floor(nextIdx / columnCount) !== Math.floor(idx / columnCount)) return;
    const nextItem = items[nextIdx];
    setFocusedId(nextItem.id);
    // การ์ดเป้าหมายอาจยังไม่ mount (อยู่นอก viewport ของ virtualized grid) — สั่ง scrollToRow ให้ List
    // เอา row นั้นเข้า viewport ก่อน แล้ว Card ที่ mount ใหม่จะ auto-focus ตัวเองจาก prop `focused` (ดู CardImpl)
    const rowIndex = Math.floor(nextIdx / columnCount);
    listRef.current?.scrollToRow({ index: rowIndex, align: "auto", behavior: "auto" });
  }, [items, columnCount, listRef]);

  const onEnterKey = useCallback((index: number) => openLightbox(index), []);

  /**
   * roving tabindex — ต้องมีการ์ด "หนึ่งใบเสมอ" ที่ tabIndex=0 เป็นประตูเข้า ไม่งั้น keyboard user
   * กด Tab เข้ากริดไม่ได้เลย (การ์ด done ที่เหลือเป็น -1 เพื่อไม่ให้ Tab ไล่ทีละใบ — arrow key เป็นตัวขยับแทน)
   *
   * ประตูเข้าต้องเป็นการ์ดที่ "mount อยู่จริง" เท่านั้น เพราะ react-window unmount การ์ดนอก viewport ทิ้ง —
   * ถ้าเลือกใบที่ถูก virtualize ออกไปแล้ว DOM จะไม่เหลือ element ที่ tabIndex=0 เลย และกด Tab เข้ากริดไม่ได้
   * ทั้งที่มีการ์ดเต็มจอ ลำดับการเลือก: ใบที่ focus อยู่ (ถ้ายัง mount) → ใบ done ใบแรกในช่วงที่ mount →
   * ใบ done ใบแรกทั้ง list (fallback ตอนยังไม่เคยได้ range จาก List)
   */
  const tabEntryId = useMemo(() => {
    const visible = renderedRange
      ? items.slice(renderedRange.start, renderedRange.stop + 1)
      : items;
    if (focusedId != null && visible.some(x => x.id === focusedId)) return focusedId;
    const inView = visible.find(x => x.status === "done");
    if (inView) return inView.id;
    return items.find(x => x.status === "done")?.id ?? null;
  }, [items, focusedId, renderedRange]);

  return { focusedId, tabEntryId, setRenderedRange, onFocusCard, onArrowKey, onEnterKey };
}

/**
 * wrapper ที่คุม react-window List — วัดความกว้าง container จริงผ่าน onResize เพื่อคำนวณ columnCount เอง
 * (List ไม่รองรับ CSS grid-cols auto-fill ตรงๆ เพราะต้องรู้จำนวนคอลัมน์ล่วงหน้าเพื่อแบ่งแถว) แล้ว group items
 * เป็นแถวๆ ละ columnCount ก่อนส่งให้ List วาดทีละแถวตาม viewport — List เป็นเจ้าของ scroll container ของตัวเอง
 * (overflow-y-auto ภายใน) จึงต้องอยู่ในกล่อง flex-1 min-h-0 แยกจาก header/StoryboardStrip ที่ไม่ virtualize
 */
function VirtualGrid({ items, selected, onToggleSelect, onOpen, mode, listRef, onAtTopChange, newResultPill }: VirtualGridProps) {
  const [width, setWidth] = useState(0);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 320, key: mode });
  const rowElsRef = useRef(new Map<number, HTMLDivElement>());
  const unobserveRef = useRef<(() => void) | null>(null);
  const [mountedCount, setMountedCount] = useState(0);

  const columnCount = columnCountForWidth(width);
  const rowCount = Math.max(1, Math.ceil(items.length / columnCount));
  const { focusedId, tabEntryId, setRenderedRange, onFocusCard, onArrowKey, onEnterKey } = useGalleryFocus(items, columnCount, listRef, mode);

  const onResize = useCallback((size: { width: number; height: number }) => {
    setWidth(size.width);
  }, []);

  // ต้อง re-sync ResizeObserver ทุกครั้งที่ set แถวที่ mount จริงเปลี่ยน (scroll ทำให้แถวเก่า unmount/แถวใหม่ mount)
  // — เรียก observeRowElements ใหม่ทุกครั้งด้วย snapshot ปัจจุบันของ rowElsRef
  const registerRowEl = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) rowElsRef.current.set(index, el);
    else rowElsRef.current.delete(index);
    unobserveRef.current?.();
    unobserveRef.current = dynamicRowHeight.observeRowElements([...rowElsRef.current.values()]);
  }, [dynamicRowHeight]);

  useEffect(() => () => unobserveRef.current?.(), []);

  // ฟัง scroll ตรงๆ ด้วย เพราะ onRowsRendered ยิงเฉพาะตอน "ช่วงแถวที่ render" เปลี่ยน —
  // เลื่อนนิดเดียวในแถวเดิม (ซึ่งเปลี่ยนสถานะ "อยู่บนสุดไหม" ได้จริง) จะไม่ยิงเลย
  useEffect(() => {
    const el = listRef.current?.element;
    if (!el) return;
    const onScroll = () => onAtTopChange(el.scrollTop <= NEAR_TOP_PX);
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [listRef, onAtTopChange, items.length]);

  // เดโม/ตรวจสอบ Phase 13 เท่านั้น — นับจำนวน row ที่ react-window บอกว่ากำลัง render จริงตอนนี้ (คูณ columnCount
  // เป็นจำนวน card โดยประมาณ, แถวสุดท้ายอาจมีน้อยกว่านั้นถ้า item ไม่พอดีเต็มแถว) ตัด tree-shake ออกจาก production build
  const onRowsRendered = useCallback((visible: { startIndex: number; stopIndex: number }) => {
    // แปลงช่วง "แถว" ที่ react-window render อยู่ เป็นช่วง index ของ item เพื่อให้ roving tabindex
    // เลือกประตูเข้าจากการ์ดที่ mount อยู่จริงเท่านั้น (ดู tabEntryId) — ต้องอยู่ก่อน DEV guard ข้างล่าง
    setRenderedRange({
      start: visible.startIndex * columnCount,
      stop: (visible.stopIndex + 1) * columnCount - 1,
    });
    // วัดจาก scrollTop จริงไม่ใช่ index ของแถวที่ render — overscan ทำให้แถว 0 ยังถูก render
    // อยู่แม้เลื่อนลงไปพอสมควรแล้ว ถ้าใช้ index จะตัดสินผิดว่า "ยังอยู่บนสุด"
    const el = listRef.current?.element;
    onAtTopChange(!el || el.scrollTop <= NEAR_TOP_PX);
    if (!import.meta.env.DEV) return;
    const rowsRendered = visible.stopIndex - visible.startIndex + 1;
    const lastRowStart = (rowCount - 1) * columnCount;
    const lastRowSize = items.length - lastRowStart;
    const includesLastRow = visible.stopIndex >= rowCount - 1;
    const full = includesLastRow ? rowsRendered - 1 : rowsRendered;
    setMountedCount(Math.min(items.length, full * columnCount + (includesLastRow ? lastRowSize : columnCount)));
  }, [columnCount, rowCount, items.length, setRenderedRange, onAtTopChange]);

  const rowProps = useMemo<GridRowProps>(() => ({
    items, columnCount, selected, onToggleSelect, onOpen, registerRowEl, focusedId, tabEntryId, onFocusCard, onArrowKey, onEnterKey,
  }), [items, columnCount, selected, onToggleSelect, onOpen, registerRowEl, focusedId, tabEntryId, onFocusCard, onArrowKey, onEnterKey]);

  return (
    <div className="relative min-h-0 flex-1">
      <List
        listRef={listRef}
        rowCount={rowCount}
        rowHeight={dynamicRowHeight}
        rowComponent={GridRow}
        rowProps={rowProps}
        overscanCount={GRID_OVERSCAN_ROWS}
        onResize={onResize}
        onRowsRendered={onRowsRendered}
        style={{ height: "100%", width: "100%" }}
      />
      {newResultPill}
      <VirtualGridDevReadout mounted={mountedCount} total={items.length} mode={mode} />
    </div>
  );
}

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

/**
 * mini-panel เปลี่ยน model/ratio เฉพาะ item นี้ก่อน retry — ใช้ modelsForMode(item.mode) เสมอ
 * (ไม่ใช่ tab ที่เปิดอยู่ตอนนี้) เพราะผู้ใช้อาจสลับโหมดไปแล้วตั้งแต่ก่อนภาพนี้ error
 * ค่าเริ่มต้น = model/ratio เดิมของ item — เลือกอิสระจาก Sidebar หลัก ไม่กระทบ selection ทั่วโลก
 */
function RetryOverridePanel({ item, onClose }: { item: GenItem; onClose: () => void }) {
  const modelList = modelsForMode(item.mode);
  const [modelId, setModelId] = useState(item.model);
  const [ratio, setRatio] = useState(item.ratio);

  const selectedModel = modelList.find(m => m.id === modelId) ?? null;
  const vRatios = isVideoMode(item.mode) && selectedModel?.supported_aspect_ratios?.length
    ? selectedModel.supported_aspect_ratios
    : null;

  return (
    <div
      className="absolute inset-x-2.5 bottom-2.5 z-2 flex flex-col gap-2 rounded-lg border border-border-strong bg-surface p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,.28)]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.5px] text-text-faint">ลองใหม่ด้วย Model/Ratio อื่น</span>
        <button className="cursor-pointer text-text-faint hover:text-text" onClick={onClose} title="ปิด">
          <X size={12} />
        </button>
      </div>

      <select
        className="w-full cursor-pointer rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[11.5px] text-text outline-none focus:border-accent"
        value={modelId}
        onChange={e => setModelId(e.target.value)}
      >
        {!modelList.some(m => m.id === item.model) && <option value={item.model}>{item.modelName}</option>}
        {modelList.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
      </select>

      {item.mode !== "audio" && (
        <div className="grid grid-cols-5 gap-1">
          {RATIOS.map(r => {
            const disabled = !!(vRatios && !vRatios.includes(r.v));
            return (
              <button
                key={r.v}
                className={
                  "cursor-pointer rounded-md border py-1 text-[10px] font-medium transition-all " +
                  (ratio === r.v ? "border-accent bg-accent font-semibold text-accent-ink" : "border-border bg-surface-2 text-text-dim hover:border-border-strong") +
                  (disabled ? " pointer-events-none opacity-30" : "")
                }
                disabled={disabled}
                onClick={() => setRatio(r.v)}
              >
                {r.v}
              </button>
            );
          })}
        </div>
      )}

      <button
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-[11px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
        onClick={() => { retryWithOverride(item, modelId, ratio); onClose(); }}
      >
        <RotateCcw size={11} /> ลองใหม่ด้วยค่านี้
      </button>
    </div>
  );
}

/**
 * ปุ่ม "Start from this" + popover ยืนยัน — โชว์ตัวเลือกโหมดปลายทาง (Video/Cinematic) แล้วต้องกดยืนยันอีกครั้ง
 * ก่อนสลับโหมดจริง เพราะเป็นการพาผู้ใช้กระโดดข้ามแท็บกะทันหันจากเมนูเล็กๆ บน card
 */
function StartFromThisMenu({ item, onDone }: { item: GenItem; onDone: () => void }) {
  const [target, setTarget] = useState<"video" | "cinematic">(item.mode === "cinematic" ? "video" : "cinematic");

  return (
    <div
      className="absolute inset-x-2.5 bottom-2.5 z-2 flex flex-col gap-2 rounded-lg border border-border-strong bg-surface p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,.28)]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.5px] text-text-faint">Start from this</span>
        <button className="cursor-pointer text-text-faint hover:text-text" onClick={onDone} title="ปิด">
          <X size={12} />
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-text-dim">
        จะสลับไปโหมดที่เลือก แล้วใช้ผลลัพธ์นี้เป็นจุดเริ่มต้น scene ใหม่ค่ะ
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {(["cinematic", "video"] as const).map(m => (
          <button
            key={m}
            className={
              "cursor-pointer rounded-md border py-1.5 text-[11px] font-medium capitalize transition-all " +
              (target === m ? "border-accent bg-accent font-semibold text-accent-ink" : "border-border bg-surface-2 text-text-dim hover:border-border-strong")
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

interface CardProps {
  item: GenItem;
  index: number;
  selected: boolean;
  /** ผลของ isAutoExtending(item.id) คำนวณจาก Gallery ให้เป็น prop จริง — ตัว item เองไม่เปลี่ยน reference ตอน
   * autoExtendInFlight (module-level Set ใน actions.ts) เปลี่ยน ถ้าอ่านตรงในนี้จะเป็นค่าเก่าค้างหลัง React.memo กันได้ */
  autoExtending: boolean;
  onToggleSelect: (id: number) => void;
  onOpen: (index: number) => void;
  /** Gallery Focus Mode (PHASE 15) — true ถ้าการ์ดนี้คือใบที่ถูก focus อยู่ตอนนี้ */
  focused: boolean;
  /** true ถ้าการ์ดนี้เป็นประตูเข้า tab order ของกริด (roving tabindex — มีได้ใบเดียวเท่านั้น) */
  isTabEntry: boolean;
  onFocusCard: (id: number) => void;
  onArrowKey: (id: number, dir: "left" | "right" | "up" | "down") => void;
  onEnterKey: (index: number) => void;
}

/** เลื่อนลงมาไม่เกินเท่านี้ยังถือว่า "อยู่บนสุด" — เผื่อผู้ใช้ขยับเมาส์นิดหน่อยแล้วยังคาดหวังให้เลื่อนตามของใหม่ */
const NEAR_TOP_PX = 80;

const ARROW_KEY_DIR: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
};

/**
 * ข้อความ error บนการ์ด — แปลง error ดิบจาก OpenRouter เป็นหัวข้อ + สิ่งที่ต้องทำต่อ
 * เพราะ raw message อย่าง "HTTP 402" ไม่บอกผู้ใช้ว่าควรเติมเครดิตหรือแค่กดลองใหม่
 * ยังเก็บข้อความดิบไว้ให้กางดูได้ ไม่ทิ้งข้อมูลที่จำเป็นตอน debug
 */
function GenErrorDetail({ errMsg }: { errMsg: string }) {
  const [rawOpen, setRawOpen] = useState(false);
  const info = classifyGenError(errMsg);
  const trimmed = errMsg.trim();
  // ถ้าข้อความดิบสั้นและสื่อความอยู่แล้ว (เช่นข้อความไทยที่เราโยนเอง) การกางดูซ้ำไม่ได้ประโยชน์
  const showRaw = trimmed.length > 0 && trimmed !== info.title;

  return (
    <div className="flex max-h-full min-h-0 flex-col items-center gap-1">
      <div className="flex items-center gap-1 text-[12px] font-semibold text-danger">
        <CircleAlert size={12} className="shrink-0" />
        <span>{info.title}</span>
      </div>
      <p className="text-[11px] leading-normal text-text-dim">{info.hint}</p>
      {showRaw && (
        <>
          <button
            className="cursor-pointer text-[10.5px] text-text-faint underline transition-colors hover:text-text-dim"
            aria-expanded={rawOpen}
            onClick={e => { e.stopPropagation(); setRawOpen(o => !o); }}
          >
            {rawOpen ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
          </button>
          {rawOpen && (
            <p className="max-h-[72px] overflow-y-auto break-words px-1 text-left font-mono text-[10px] leading-normal text-text-faint">
              {trimmed}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CardImpl({ item, index, selected, autoExtending, onToggleSelect, onOpen, focused, isTabEntry, onFocusCard, onArrowKey, onEnterKey }: CardProps) {
  // synthetic root ที่ startFromItem สร้าง (ดู actions.ts) เป็น video/cinematic mode แต่ url เป็นภาพนิ่ง (ยังไม่มีวิดีโอจริง) — render เป็น <img> แทน <video>
  const isVid = isVideoMode(item.mode) && !isImageDataUrl(item.url);
  const isAud = item.mode === "audio";
  const done = item.status === "done";
  // Extend/Extend-จากเฟรมสุดท้าย ต้องมีวิดีโอจริงให้จับเฟรม — ซ่อนทั้งคู่บน synthetic root ที่ยังไม่มีวิดีโอ (url เป็นภาพนิ่ง/ไม่มี)
  const isCinematicVideoScene = item.mode === "cinematic" && !!item.url && !isImageDataUrl(item.url);
  const [retryPanelOpen, setRetryPanelOpen] = useState(false);
  const [startFromOpen, setStartFromOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // เดโม/ตรวจสอบ Phase 12 เท่านั้น — นับจำนวนครั้งที่ Card แต่ละใบ re-render จริง เพื่อยืนยันว่า
  // React.memo กันการ re-render ของ card อื่นๆ ตอนแค่ toggle selection ของ card เดียวได้ผล ตัด tree-shake ออกจาก production build
  if (import.meta.env.DEV) console.count(`Card render #${item.id}`);

  // Gallery Focus Mode (PHASE 15) — พอ prop `focused` เป็น true (รวมถึงตอน card เพิ่ง mount ใหม่จาก scrollToRow
  // ของการ์ดที่อยู่นอก viewport มาก่อนหน้านี้) ให้ .focus() DOM element จริงเพื่อให้ focus-outline โชว์และรับ key ต่อได้
  // preventScroll: true — scrollToRow (เรียกจาก onArrowKey ใน useGalleryFocus) เป็นคนคุม scroll position เองแล้ว
  // ไม่ให้ .focus() เลื่อน viewport ซ้อนแย่งกันเอง
  useEffect(() => {
    if (focused) rootRef.current?.focus({ preventScroll: true });
  }, [focused]);

  return (
    <div
      ref={rootRef}
      tabIndex={done ? (isTabEntry ? 0 : -1) : undefined}
      className={
        "group relative overflow-hidden rounded-card border bg-surface transition-colors outline-none js-focus-ring-owned " +
        (selected ? "border-accent" : focused ? "border-text" : "border-border") +
        (done ? " cursor-zoom-in hover:border-border-strong" : "") +
        (focused ? " ring-2 ring-text ring-offset-2 ring-offset-bg" : "")
      }
      role={done ? "button" : undefined}
      aria-label={done ? "เปิดดูภาพขยาย: " + item.prompt : undefined}
      onClick={done ? () => { onFocusCard(item.id); onOpen(index); } : undefined}
      // Tab เข้ามาที่ประตูเข้า (tabIndex=0) ต้องเริ่มโหมด focus ให้ทันที ไม่งั้น arrow key ไม่ทำงาน
      // เพราะ focusedId ยังเป็น null อยู่ — เช็ค !focused ก่อนกัน setState ซ้ำกับ .focus() ที่ effect เรียกเอง
      // e.target === e.currentTarget สำคัญ: onFocus ของ React bubble ขึ้นมาจากปุ่มลูกในการ์ด (Copy Prompt,
      // Crosshair, checkbox, …) ถ้าไม่กรอง แค่ Tab ผ่านปุ่มของการ์ดอื่นก็จะแย่ง focusedId ไปทั้งที่ผู้ใช้
      // ไม่ได้โฟกัสตัวการ์ดนั้น แล้ว arrow key รอบถัดไปจะยิงจาก id ผิดใบ
      onFocus={done && !focused ? (e => { if (e.target === e.currentTarget) onFocusCard(item.id); }) : undefined}
      onKeyDown={done ? (e => {
        const dir = ARROW_KEY_DIR[e.key];
        if (dir) { e.preventDefault(); onArrowKey(item.id, dir); return; }
        if (e.key === "Enter") { e.preventDefault(); onEnterKey(index); }
      }) : undefined}
    >
      <div className="relative w-full bg-surface-2" style={{ aspectRatio: isAud ? "2 / 1" : ratioCSS(item.ratio) }}>
        <span className="pointer-events-none absolute left-2 top-2 z-1 max-w-[calc(100%-16px)] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-white/15 bg-[rgba(10,10,10,.72)] px-[9px] py-[3px] font-mono text-[9.5px] text-white backdrop-blur-sm" title={item.model}>
          {item.modelName}
        </span>
        {item.bakeOffGroupId != null && (
          <span
            className="pointer-events-none absolute left-2 top-[26px] z-1 flex items-center gap-1 rounded-full border border-accent/50 bg-[rgba(10,10,10,.72)] px-[9px] py-[3px] font-mono text-[9px] text-accent backdrop-blur-sm"
            title="ส่วนหนึ่งของ Bake-off — เปรียบเทียบหลายโมเดลจาก prompt เดียวกัน"
          >
            <Layers3 size={9} /> Bake-off
          </span>
        )}

        {done && !item.url && (
          // synthetic root ที่ startFromItem สร้างจาก item ต้นทางที่เป็นเสียง (ไม่มีเฟรมให้ใช้) — โชว์ placeholder แทนช่องว่าง
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-faint">
            <Clapperboard size={28} strokeWidth={1.4} />
            <span className="text-[10.5px]">ยังไม่มีภาพเริ่มต้น — แนบภาพก่อน generate</span>
          </div>
        )}

        {done && item.url && (
          isVid ? (
            <video src={item.url} muted loop autoPlay playsInline className="absolute inset-0 block h-full w-full object-cover" />
          ) : isAud ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 pt-6">
              <Music size={26} className="text-text-dim" />
              {/* stopPropagation กันคลิกที่ตัวเล่นเพลงแล้วเปิด lightbox */}
              <audio src={item.url} controls className="h-9 w-full" onClick={e => e.stopPropagation()} />
            </div>
          ) : (
            <img src={item.url} alt={item.prompt} className="absolute inset-0 block h-full w-full object-cover" />
          )
        )}

        {done && (
          <div className="absolute right-2 top-2 z-1 flex gap-1.5">
            <button
              className={
                "grid h-6 w-6 cursor-pointer place-items-center rounded-md border transition-all " +
                (focused
                  ? "border-text bg-[rgba(10,10,10,.72)] text-text opacity-100"
                  : "border-white/15 bg-[rgba(10,10,10,.72)] text-white opacity-0 backdrop-blur-sm group-hover:opacity-100")
              }
              title="โฟกัสการ์ดนี้ (ใช้ลูกศรเลื่อนไปการ์ดข้างๆ, Enter เปิด Lightbox)"
              aria-label={"โฟกัสการ์ด: " + item.prompt}
              onClick={e => { e.stopPropagation(); onFocusCard(item.id); }}
            >
              <Crosshair size={13} />
            </button>
            <button
              className={
                "grid h-6 w-6 cursor-pointer place-items-center rounded-md border transition-all " +
                (selected
                  ? "border-accent bg-accent text-accent-ink opacity-100"
                  : "border-white/15 bg-[rgba(10,10,10,.72)] text-white opacity-0 backdrop-blur-sm group-hover:opacity-100")
              }
              title="เลือกเพื่อดาวน์โหลดหลายรูป"
              aria-pressed={selected}
              aria-label={(selected ? "ยกเลิกเลือก" : "เลือก") + "การ์ด: " + item.prompt}
              onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }}
            >
              <Check size={14} />
            </button>
          </div>
        )}

        {done && item.autoSaveStatus && item.autoSaveStatus !== "idle" && (
          <span
            className={
              "absolute bottom-2 left-2 z-1 grid h-5 w-5 place-items-center rounded-full border backdrop-blur-sm " +
              (item.autoSaveStatus === "saved"
                ? "border-accent/40 bg-[rgba(10,10,10,.72)] text-accent"
                : item.autoSaveStatus === "failed"
                ? "border-danger/40 bg-[rgba(10,10,10,.72)] text-danger"
                : "border-white/15 bg-[rgba(10,10,10,.72)] text-white")
            }
            title={
              item.autoSaveStatus === "saved" ? "Auto Save: เซฟไฟล์ลงเครื่องแล้ว"
                : item.autoSaveStatus === "failed" ? "Auto Save ไม่สำเร็จ: " + (item.autoSaveErrMsg || "ไม่ทราบสาเหตุ")
                : "Auto Save: กำลังเซฟ…"
            }
          >
            {item.autoSaveStatus === "saved" ? <HardDriveDownload size={11} />
              : item.autoSaveStatus === "failed" ? <CircleAlert size={11} />
              : <Loader2 size={11} className="animate-spin" />}
          </span>
        )}

        {done && item.driveSaveStatus && item.driveSaveStatus !== "idle" && (
          <span
            className={
              "absolute z-1 grid h-5 w-5 place-items-center rounded-full border backdrop-blur-sm " +
              (item.autoSaveStatus && item.autoSaveStatus !== "idle" ? "bottom-2 left-8" : "bottom-2 left-2") + " " +
              (item.driveSaveStatus === "saved"
                ? "border-accent/40 bg-[rgba(10,10,10,.72)] text-accent"
                : item.driveSaveStatus === "failed"
                ? "border-danger/40 bg-[rgba(10,10,10,.72)] text-danger"
                : "border-white/15 bg-[rgba(10,10,10,.72)] text-white")
            }
            title={
              item.driveSaveStatus === "saved" ? "Save to Drive: อัพโหลดขึ้น Google Drive แล้ว"
                : item.driveSaveStatus === "failed" ? "Save to Drive ไม่สำเร็จ: " + (item.driveSaveErrMsg || "ไม่ทราบสาเหตุ")
                : "Save to Drive: กำลังอัพโหลด…"
            }
          >
            {item.driveSaveStatus === "saved" ? <Cloud size={11} />
              : item.driveSaveStatus === "failed" ? <CircleAlert size={11} />
              : <Loader2 size={11} className="animate-spin" />}
          </span>
        )}

        {!done && item.status === "loading" && (
          isVid ? (
            <VideoProgress item={item} />
          ) : (
            <>
              <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(10,10,10,.06)_50%,transparent_70%)] bg-[length:200%_100%]" />
              <div className="absolute left-1/2 top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-border-strong border-t-text" />
            </>
          )
        )}

        {item.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-[18px] text-center">
            <GenErrorDetail errMsg={item.errMsg} />
            <div className="flex items-center gap-1">
              <button
                className="flex cursor-pointer items-center gap-1 rounded-[7px] border border-border-strong px-4 py-1.5 text-[11.5px] text-text transition-colors hover:border-text"
                aria-label={"ลองสร้างใหม่: " + item.prompt}
                onClick={e => { e.stopPropagation(); retry(item); }}
              >
                <RotateCcw size={11} /> ลองใหม่
              </button>
              <button
                className={
                  "grid h-[27px] w-[27px] shrink-0 cursor-pointer place-items-center rounded-[7px] border transition-colors " +
                  (retryPanelOpen ? "border-accent text-accent" : "border-border-strong text-text-dim hover:text-text")
                }
                title="ลองใหม่ด้วย model/ratio อื่น"
                aria-label={"ลองใหม่ด้วย model/ratio อื่น: " + item.prompt}
                aria-expanded={retryPanelOpen}
                onClick={e => { e.stopPropagation(); setRetryPanelOpen(v => !v); }}
              >
                <ChevronDown size={13} className={"transition-transform " + (retryPanelOpen ? "rotate-180" : "")} />
              </button>
            </div>
          </div>
        )}

        {item.status === "error" && retryPanelOpen && (
          <RetryOverridePanel item={item} onClose={() => setRetryPanelOpen(false)} />
        )}

        {done && startFromOpen && (
          <StartFromThisMenu item={item} onDone={() => setStartFromOpen(false)} />
        )}
      </div>

      <div className="flex justify-between gap-2.5 border-t border-border px-3 py-2.5 text-[11px] text-text-dim">
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.prompt}</span>
        <span className="shrink-0 font-mono text-[10px] text-text-faint">{isAud ? "mp3" : item.ratio}</span>
      </div>

      {done && (
        <div className="flex flex-col gap-1.5 px-3 pb-2.5">
          <div className="flex gap-1.5">
            <button
              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
              aria-label={"คัดลอก prompt: " + item.prompt}
              onClick={e => { e.stopPropagation(); copyPromptFromItem(item); }}
            >
              <Copy size={10} /> Copy Prompt
            </button>
            <button
              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
              aria-label={"สร้างซ้ำด้วย prompt เดิม: " + item.prompt}
              onClick={e => { e.stopPropagation(); regenerateFromItem(item); }}
            >
              <RefreshCw size={10} /> Regenerate
            </button>
            {isDriveSaveConfigured() && (
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                title="อัพโหลดขึ้น Google Drive (โฟลเดอร์ Atelier Output)"
                aria-label={"Save to Drive: " + item.prompt}
                disabled={item.driveSaveStatus === "pending"}
                onClick={e => { e.stopPropagation(); saveItemToDrive(item); }}
              >
                <CloudUpload size={10} /> Save to Drive
              </button>
            )}
            {isCinematicVideoScene && (
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-accent/60 py-1.5 text-[10.5px] font-semibold text-text transition-colors hover:bg-accent hover:text-accent-ink"
                title="เลือกเฟรมจากคลิปนี้ไปเป็นเฟรมแรกของ scene ถัดไป"
                aria-label="เปิด TimeFrame & Extend tool สำหรับคลิปนี้"
                onClick={e => { e.stopPropagation(); openExtendTool(item); }}
              >
                <ListVideo size={10} /> Extend
              </button>
            )}
          </div>
          {isCinematicVideoScene && (
            <button
              className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
              title="จับเฟรมสุดท้ายอัตโนมัติแล้วสร้าง scene ถัดไปทันที ไม่ต้องเลือกเฟรมเอง"
              aria-label={(autoExtending ? "กำลังจับเฟรมสุดท้ายอัตโนมัติ: " : "จับเฟรมสุดท้ายอัตโนมัติแล้วสร้าง scene ถัดไป: ") + item.prompt}
              disabled={autoExtending}
              onClick={e => { e.stopPropagation(); autoExtendFromLastFrame(item); }}
            >
              <FastForward size={10} /> {autoExtending ? "กำลังจับเฟรม…" : "Extend จากเฟรมสุดท้าย"}
            </button>
          )}
          <div className="flex gap-1.5">
            {isChainableItem(item) && (
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
                title="ส่งภาพนี้ไปเป็นเฟรมแรกของ Video mode"
                aria-label={"ส่งภาพนี้ไปเป็นเฟรมแรกของ Video mode: " + item.prompt}
                onClick={e => { e.stopPropagation(); useAsVideoFirstFrame(item); }}
              >
                <Video size={10} /> ใช้เป็นเฟรมแรกวิดีโอ
              </button>
            )}
            {canRefineItem(item) && (
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-accent/60 py-1.5 text-[10.5px] font-semibold text-text transition-colors hover:bg-accent hover:text-accent-ink"
                title="แนบภาพนี้เป็น reference แล้วพิมพ์สิ่งที่อยากแก้ต่อ"
                aria-label={"Refine ภาพนี้ต่อ — แนบเป็น reference แล้วพิมพ์สิ่งที่อยากแก้: " + item.prompt}
                onClick={e => { e.stopPropagation(); refineItem(item); }}
              >
                <Sparkles size={10} /> Refine this
              </button>
            )}
            {canStartFrom(item) && (
              <button
                className={
                  "flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border py-1.5 text-[10.5px] font-semibold transition-colors " +
                  (startFromOpen ? "border-accent bg-accent text-accent-ink" : "border-border text-text-dim hover:border-border-strong hover:text-text")
                }
                title="ใช้ผลลัพธ์นี้เป็นจุดเริ่มต้นของ Video/Cinematic mode"
                aria-label={"Start from this — ใช้ผลลัพธ์นี้เป็นจุดเริ่มต้นของ Video/Cinematic mode: " + item.prompt}
                aria-expanded={startFromOpen}
                onClick={e => { e.stopPropagation(); setStartFromOpen(v => !v); }}
              >
                <Wand2 size={10} /> Start from this
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * item ถูก mutate ทีละ field ใน-place เสมอ (ดู actions.ts — runRequest ฯลฯ set item.status/url/... ตรงบน object เดิม
 * แล้วค่อย mutate() broadcast) reference ของ item จึงไม่เปลี่ยนแม้เนื้อหาเปลี่ยนจริง — ต้องเทียบทีละ field ที่ Card
 * ใช้เรนเดอร์จริง ห้ามเทียบ prevProps.item === nextProps.item เฉยๆ เพราะจะกลายเป็น false positive (บอกว่า "เหมือนเดิม"
 * ทั้งที่ status เพิ่ง loading → done) แล้ว card ก็จะค้างสถานะเก่าตลอดไป
 */
function cardPropsEqual(prev: Readonly<CardProps>, next: Readonly<CardProps>): boolean {
  if (prev.index !== next.index || prev.selected !== next.selected || prev.autoExtending !== next.autoExtending) return false;
  if (prev.focused !== next.focused || prev.isTabEntry !== next.isTabEntry) return false;
  if (prev.onToggleSelect !== next.onToggleSelect || prev.onOpen !== next.onOpen) return false;
  if (prev.onFocusCard !== next.onFocusCard || prev.onArrowKey !== next.onArrowKey || prev.onEnterKey !== next.onEnterKey) return false;
  const a = prev.item;
  const b = next.item;
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.url === b.url &&
    a.prompt === b.prompt &&
    a.model === b.model &&
    a.modelName === b.modelName &&
    a.ratio === b.ratio &&
    a.mode === b.mode &&
    a.startedAt === b.startedAt &&
    a.jobStatus === b.jobStatus &&
    a.errMsg === b.errMsg &&
    a.autoSaveStatus === b.autoSaveStatus &&
    a.autoSaveErrMsg === b.autoSaveErrMsg &&
    a.duration === b.duration &&
    a.audio === b.audio
  );
}

// React.memo กัน Card ที่ไม่เกี่ยวข้อง re-render ตอน toggle selection ของ card อื่นใบเดียว (Gallery re-render ทุกครั้งที่
// mutate() broadcast แต่ prop ของ card ที่ไม่ถูกแก้ไขจริงๆ ไม่เปลี่ยน — ดู cardPropsEqual ด้านบนสำหรับเหตุผลที่ต้อง custom comparator)
const Card = memo(CardImpl, cardPropsEqual);

/**
 * Storyboard strip เฉพาะโหมด cinematic — แสดงแต่ละ chain (ไล่ตาม parentId) เป็นแถบ thumbnail แนวนอน
 * เรียงตามลำดับเวลาที่สร้าง (root ซ้ายสุด → scene ล่าสุดขวาสุด) พร้อมยอดรวมวินาที/ราคาประเมินของทั้ง chain
 * v1 ตั้งใจให้เป็น chain เส้นตรงล้วน (ดู cinematicChains ใน actions.ts) — ไม่มี UI สำหรับ branching
 */
function StoryboardStrip() {
  const chains = cinematicChains();
  if (!chains.length) return null;

  return (
    <div className="mb-6 flex flex-col gap-4">
      {chains.map(chain => (
        <div key={chain.rootId} className="rounded-card border border-border bg-surface p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.5px] text-text-faint">
              <Clapperboard size={12} /> Storyboard · {chain.scenes.length} scene{chain.scenes.length !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-3 font-mono text-[10.5px] text-text-faint">
              <span className="flex items-center gap-1" title="รวมวินาทีวิดีโอของทุก scene ใน chain นี้">
                <Clock size={10} /> {chain.totalSeconds}s
              </span>
              <span title="รวมราคาประเมินของทุก scene ใน chain นี้">
                {chain.totalCost != null ? "~$" + chain.totalCost.toFixed(4) : "ราคาไม่ทราบ"}{chain.hasUnknownCost && chain.totalCost != null ? "+" : ""}
              </span>
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chain.scenes.map((scene, i) => (
              <div key={scene.id} className="flex shrink-0 items-center gap-2">
                <button
                  className="group relative h-16 w-28 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border bg-surface-2 transition-colors hover:border-border-strong"
                  title={scene.prompt}
                  onClick={() => {
                    const idx = state.modes.cinematic.images.findIndex(x => x.id === scene.id);
                    if (idx !== -1 && scene.status === "done") openLightbox(idx);
                  }}
                >
                  {scene.status === "done" && scene.url && isImageDataUrl(scene.url) ? (
                    <img src={scene.url} alt={scene.prompt} className="h-full w-full object-cover" />
                  ) : scene.status === "done" && scene.url ? (
                    <video src={scene.url} muted loop autoPlay playsInline className="h-full w-full object-cover" />
                  ) : scene.status === "loading" ? (
                    <div className="grid h-full w-full place-items-center">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-text" />
                    </div>
                  ) : (
                    <div className="grid h-full w-full place-items-center text-danger">
                      <X size={14} />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-[1px] font-mono text-[9px] text-white">#{i + 1}</span>
                </button>
                {i < chain.scenes.length - 1 && <ChevronDown size={12} className="shrink-0 -rotate-90 text-text-faint" />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Gallery() {
  const s = useApp();
  const ms = s.modes[s.mode];
  const meta = MODE_META[s.mode];
  const done = ms.images.filter(x => x.status === "done").length;
  const loading = ms.images.filter(x => x.status === "loading").length;
  const unit = s.mode === "cinematic" ? " scene" : s.mode === "video" ? " clip" : s.mode === "audio" ? " song" : " image";

  // เผื่อ item ที่เคยเลือกไว้ถูกลบ/ยังไม่ done — กรองเฉพาะที่ยัง valid
  const validIds = new Set(ms.images.filter(x => x.status === "done").map(x => x.id));
  const selectedCount = [...ms.selected].filter(id => validIds.has(id)).length;

  // Compare เปิดได้เฉพาะ 2–4 ชิ้นที่เลือกไว้ทั้งหมด done แล้วและไม่ใช่วิดีโอ (ดู canCompareItem)
  const selectedItems = [...ms.selected].map(id => ms.images.find(x => x.id === id)).filter((x): x is typeof ms.images[number] => !!x);
  const canCompare = selectedItems.length >= 2 && selectedItems.length <= 4 && selectedItems.every(canCompareItem);

  const centerPrompt = s.promptPlacement === "center";

  // item ใหม่ถูก unshift ไว้บนสุดเสมอ — ถ้าผู้ใช้อยู่บนสุดอยู่แล้วก็เลื่อนตามให้เลย แต่ถ้ากำลังเลื่อน
  // ดูงานเก่าอยู่ ห้ามดึงกลับขึ้นไป (เป็นพฤติกรรมเดิมที่รำคาญมาก — กำลังดูอยู่ดีๆ จอกระโดด)
  // ให้ขึ้นปุ่มลอยบอกแทน กดเองเมื่อพร้อม
  // scroll จริงอยู่ใน react-window List (ดู VirtualGrid) จึงต้องสั่งผ่าน listRef.scrollToRow แทน scrollTo ของ div ธรรมดา
  const listRef = useRef<ListImperativeAPI | null>(null);
  const [atTop, setAtTop] = useState(true);
  const [pendingNew, setPendingNew] = useState(false);
  const atTopRef = useRef(true);
  const onAtTopChange = useCallback((v: boolean) => {
    atTopRef.current = v;
    setAtTop(v);
    // เลื่อนกลับขึ้นบนสุดเองเมื่อไหร่ ถือว่าเห็นของใหม่แล้ว — เก็บปุ่มทิ้ง
    if (v) setPendingNew(false);
  }, []);

  const newestId = ms.images[0]?.id;
  useEffect(() => {
    if (newestId == null) return;
    // อ่านจาก ref ไม่ใช่ state เพราะ effect นี้ผูกกับ newestId อย่างเดียว ถ้าใส่ atTop ใน deps
    // มันจะยิงซ้ำทุกครั้งที่ scroll ข้ามขอบบน ทำให้เลื่อนเด้งโดยไม่มี item ใหม่จริง
    if (atTopRef.current) listRef.current?.scrollToRow({ index: 0, align: "start", behavior: "smooth" });
    else setPendingNew(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

  const jumpToNewest = () => {
    setPendingNew(false);
    listRef.current?.scrollToRow({ index: 0, align: "start", behavior: "smooth" });
  };

  return (
    <main aria-label={meta.title} className="relative flex min-w-0 flex-1 overflow-hidden">
      <div className={
        "flex min-w-0 flex-1 flex-col overflow-hidden p-7 max-[860px]:p-5 " +
        (centerPrompt ? "pb-44 max-[860px]:pb-40" : "")
      }>
      <div className="mb-[18px] flex shrink-0 items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.2px] text-text-dim">{meta.title}</h2>
        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <span className="flex items-center gap-2">
              <span className="text-xs text-text-dim">{selectedCount} รูปที่เลือก</span>
              {selectedItems.length >= 2 && selectedItems.length <= 4 && (
                <button
                  className="flex cursor-pointer items-center gap-1 rounded-md border border-border-strong px-2.5 py-1 text-[11px] text-text transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border-strong disabled:hover:bg-transparent disabled:hover:text-text"
                  disabled={!canCompare}
                  title={canCompare ? "เปรียบเทียบรูปที่เลือกแบบเคียงข้างกัน" : "เปรียบเทียบได้เฉพาะรูปที่สร้างเสร็จแล้ว (ไม่รวมวิดีโอ)"}
                  onClick={openCompare}
                >
                  <Columns2 size={11} /> Compare
                </button>
              )}
              <button
                className="flex cursor-pointer items-center gap-1 rounded-md border border-border-strong px-2.5 py-1 text-[11px] text-text transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
                aria-label={`ดาวน์โหลดที่เลือกไว้ (${selectedCount} รายการ)`}
                onClick={downloadSelected}
              >
                <Download size={11} /> ดาวน์โหลด
              </button>
              {isDriveSaveConfigured() && (
                <button
                  className="flex cursor-pointer items-center gap-1 rounded-md border border-border-strong px-2.5 py-1 text-[11px] text-text transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
                  aria-label={`อัพโหลดที่เลือกไว้ขึ้น Google Drive (${selectedCount} รายการ)`}
                  onClick={saveSelectedToDrive}
                >
                  <CloudUpload size={11} /> Save to Drive
                </button>
              )}
              <button
                className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-text-dim transition-colors hover:border-border-strong hover:text-text"
                aria-label="ยกเลิกการเลือกทั้งหมด"
                onClick={clearSelection}
              >
                <X size={11} /> ยกเลิก
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

      {s.mode === "cinematic" && <div className="shrink-0"><StoryboardStrip /></div>}

      {!ms.images.length ? (
        <div className="flex min-h-[380px] flex-col items-center justify-center gap-3.5 rounded-[14px] border border-dashed border-border text-text-faint">
          {s.mode === "audio"
            ? <Music size={44} className="opacity-40" strokeWidth={1.4} />
            : s.mode === "cinematic"
            ? <Clapperboard size={44} className="opacity-40" strokeWidth={1.4} />
            : <ImageIcon size={44} className="opacity-40" strokeWidth={1.4} />}
          <p className="text-[13px]">{meta.empty}</p>
        </div>
      ) : (
        <VirtualGrid
          items={ms.images}
          selected={ms.selected}
          onToggleSelect={toggleSelect}
          onOpen={openLightbox}
          mode={s.mode}
          listRef={listRef}
          onAtTopChange={onAtTopChange}
          newResultPill={
            /* ปุ่มลอยแทนการดึงจอกลับขึ้นบนเอง — ผู้ใช้เลือกเองว่าจะขึ้นไปดูตอนไหน
               ต้องวางในตัว VirtualGrid เอง ห้ามครอบ div เพิ่มรอบนอก ไม่งั้น flex chain
               ของ react-window ขาด (List เป็นเจ้าของ scroll container ของตัวเอง) แล้วกริดเลื่อนไม่ได้เลย */
            pendingNew && !atTop ? (
              <button
                className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-[11.5px] font-semibold text-text shadow-[0_6px_20px_rgba(0,0,0,.12)] transition-colors hover:border-text"
                onClick={jumpToNewest}
              >
                <ArrowUp size={12} /> ผลลัพธ์ใหม่
              </button>
            ) : null
          }
        />
      )}
      </div>
      {centerPrompt && !s.chatOpen && !s.grillOpen && (
        <div className="pointer-events-none absolute inset-x-6 bottom-[max(24px,env(safe-area-inset-bottom))] z-40 flex justify-center max-[860px]:inset-x-3 max-[860px]:bottom-[max(12px,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto w-full max-w-[720px]">
            <PromptComposer placement="center" />
          </div>
        </div>
      )}
      {centerPrompt && (s.chatOpen || s.grillOpen) && (
        <div className="pointer-events-none absolute bottom-6 left-6 right-[404px] z-40 flex justify-center max-[860px]:hidden">
          <div className="pointer-events-auto w-full max-w-[720px]">
            <PromptComposer placement="center" />
          </div>
        </div>
      )}
    </main>
  );
}
