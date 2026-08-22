import { memo, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, useDynamicRowHeight, type ListImperativeAPI, type RowComponentProps } from "react-window";
import {
  ArrowDownWideNarrow, Ban, Check, ChevronDown, CircleAlert, Clapperboard, Clock, Columns2, Copy, Crosshair, Download, FastForward,
  HardDriveDownload, ImageIcon, Layers3, ListVideo, Loader2, Music, Play, RefreshCw, RotateCcw, Search, Sparkles, Star, Trash2, Video,
  Wand2, X,
} from "lucide-react";
import { MODE_META, RATIOS, isVideoMode } from "../lib/constants";
import {
  autoExtendFromLastFrame, canCompareItem, canRefineItem, canStartFrom, cinematicChains, clearSelection,
  copyPromptFromItem, downloadSelected, isAutoExtending, isChainableItem, modelsForMode, openCompare,
  openExtendTool, openLightbox, refineItem, regenerateFromItem, resetModeGallery, retry, retryWithOverride,
  setLightboxScope, startFromItem, toggleFavorite, toggleSelect, useAsVideoFirstFrame,
} from "../lib/actions";
import { state, toast, useApp } from "../lib/store";
import type { GenItem, Mode } from "../lib/types";
import { isImageDataUrl, ratioCSS, videoProgressPct, videoStatusText } from "../lib/utils";
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
  focusedId, onFocusCard, onArrowKey, onEnterKey,
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
    <div className="pointer-events-none absolute bottom-2 right-2 z-30 rounded-md border border-border-strong bg-media-scrim/80 px-2.5 py-1 font-mono text-[10.5px] text-on-media-dim backdrop-blur-sm">
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
}

/**
 * Gallery Focus Mode (PHASE 15) — โฟกัส card ทีละใบด้วย id ไม่ใช่ index (index เปลี่ยนได้ถ้า items ถูก reorder/ตัดทิ้ง)
 * arrow key ขยับโฟกัสไปการ์ดข้างๆ ตาม columnCount จริง (คำนวณจากความกว้าง container ที่วัดสดอยู่แล้วใน VirtualGrid)
 * ไม่ hijack native Tab order — ต้องคลิกการ์ดหรือกด action โฟกัสก่อนถึงจะเริ่มโหมดนี้
 */
function useGalleryFocus(items: GenItem[], columnCount: number, listRef: RefObject<ListImperativeAPI | null>, mode: Mode) {
  const [focusedId, setFocusedId] = useState<number | null>(null);

  // สลับโหมด (Home/Video/…) แล้ว focus เดิมไม่มีความหมายอีกต่อไป — เคลียร์ทิ้ง
  useEffect(() => { setFocusedId(null); }, [mode]);

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

  return { focusedId, onFocusCard, onArrowKey, onEnterKey };
}

/**
 * wrapper ที่คุม react-window List — วัดความกว้าง container จริงผ่าน onResize เพื่อคำนวณ columnCount เอง
 * (List ไม่รองรับ CSS grid-cols auto-fill ตรงๆ เพราะต้องรู้จำนวนคอลัมน์ล่วงหน้าเพื่อแบ่งแถว) แล้ว group items
 * เป็นแถวๆ ละ columnCount ก่อนส่งให้ List วาดทีละแถวตาม viewport — List เป็นเจ้าของ scroll container ของตัวเอง
 * (overflow-y-auto ภายใน) จึงต้องอยู่ในกล่อง flex-1 min-h-0 แยกจาก header/StoryboardStrip ที่ไม่ virtualize
 */
function VirtualGrid({ items, selected, onToggleSelect, onOpen, mode, listRef }: VirtualGridProps) {
  const [width, setWidth] = useState(0);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 320, key: mode });
  const rowElsRef = useRef(new Map<number, HTMLDivElement>());
  const unobserveRef = useRef<(() => void) | null>(null);
  const [mountedCount, setMountedCount] = useState(0);

  const columnCount = columnCountForWidth(width);
  const rowCount = Math.max(1, Math.ceil(items.length / columnCount));
  // onEnterKey ของ useGalleryFocus เรียก openLightbox(index) ตรงๆ ด้วย index ของ `items` ที่ hook ถืออยู่ ซึ่งตอนนี้
  // เป็น "ลิสต์ที่ผ่านตัวกรองแล้ว" ไม่ใช่ cur().images — กด Enter ตอนเปิดตัวกรองจึงเปิดรูปผิดใบ
  // hook เป็นเขตของ roving tabindex (branch a11y) ห้ามแก้ข้างใน จึงทับที่ call site นี้ด้วย onOpen เดิมที่
  // Gallery ส่งลงมาอยู่แล้ว (openFiltered — map visibleIndex → id → realIndex) ให้ Enter กับคลิกเดินทางเดียวกันเป๊ะ
  const { focusedId, onFocusCard, onArrowKey } = useGalleryFocus(items, columnCount, listRef, mode);
  const onEnterKey = onOpen;

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

  // เดโม/ตรวจสอบ Phase 13 เท่านั้น — นับจำนวน row ที่ react-window บอกว่ากำลัง render จริงตอนนี้ (คูณ columnCount
  // เป็นจำนวน card โดยประมาณ, แถวสุดท้ายอาจมีน้อยกว่านั้นถ้า item ไม่พอดีเต็มแถว) ตัด tree-shake ออกจาก production build
  const onRowsRendered = useCallback((visible: { startIndex: number; stopIndex: number }) => {
    if (!import.meta.env.DEV) return;
    const rowsRendered = visible.stopIndex - visible.startIndex + 1;
    const lastRowStart = (rowCount - 1) * columnCount;
    const lastRowSize = items.length - lastRowStart;
    const includesLastRow = visible.stopIndex >= rowCount - 1;
    const full = includesLastRow ? rowsRendered - 1 : rowsRendered;
    setMountedCount(Math.min(items.length, full * columnCount + (includesLastRow ? lastRowSize : columnCount)));
  }, [columnCount, rowCount, items.length]);

  const rowProps = useMemo<GridRowProps>(() => ({
    items, columnCount, selected, onToggleSelect, onOpen, registerRowEl, focusedId, onFocusCard, onArrowKey, onEnterKey,
  }), [items, columnCount, selected, onToggleSelect, onOpen, registerRowEl, focusedId, onFocusCard, onArrowKey, onEnterKey]);

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
  onFocusCard: (id: number) => void;
  onArrowKey: (id: number, dir: "left" | "right" | "up" | "down") => void;
  onEnterKey: (index: number) => void;
}

const ARROW_KEY_DIR: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
};

function CardImpl({ item, index, selected, autoExtending, onToggleSelect, onOpen, focused, onFocusCard, onArrowKey, onEnterKey }: CardProps) {
  // synthetic root ที่ startFromItem สร้าง (ดู actions.ts) เป็น video/cinematic mode แต่ url เป็นภาพนิ่ง (ยังไม่มีวิดีโอจริง) — render เป็น <img> แทน <video>
  const isVid = isVideoMode(item.mode) && !isImageDataUrl(item.url);
  const isAud = item.mode === "audio";
  const done = item.status === "done";
  const favorite = !!item.favorite;
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
      tabIndex={done ? -1 : undefined}
      className={
        "group relative overflow-hidden rounded-card border bg-surface transition-colors outline-none " +
        (selected ? "border-accent" : focused ? "border-text" : "border-border") +
        (done ? " cursor-zoom-in hover:border-border-strong" : "") +
        (focused ? " ring-2 ring-text ring-offset-2 ring-offset-bg" : "")
      }
      role={done ? "button" : undefined}
      aria-label={done ? "เปิดดูภาพขยาย: " + item.prompt : undefined}
      onClick={done ? () => { onFocusCard(item.id); onOpen(index); } : undefined}
      onKeyDown={done ? (e => {
        const dir = ARROW_KEY_DIR[e.key];
        if (dir) { e.preventDefault(); onArrowKey(item.id, dir); return; }
        if (e.key === "Enter") { e.preventDefault(); onEnterKey(index); }
      }) : undefined}
    >
      <div className="relative w-full bg-surface-2" style={{ aspectRatio: isAud ? "2 / 1" : ratioCSS(item.ratio) }}>
        <span className="pointer-events-none absolute left-2 top-2 z-1 max-w-[calc(100%-16px)] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-on-media-dim bg-media-scrim/80 px-[9px] py-[3px] font-mono text-[9.5px] text-on-media backdrop-blur-sm" title={item.model}>
          {item.modelName}
        </span>
        {item.bakeOffGroupId != null && (
          <span
            className="pointer-events-none absolute left-2 top-[26px] z-1 flex items-center gap-1 rounded-full border border-accent/50 bg-media-scrim/80 px-[9px] py-[3px] font-mono text-[9px] text-accent backdrop-blur-sm"
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
                  ? "border-on-media bg-media-scrim/80 text-on-media opacity-100"
                  : "border-on-media-dim bg-media-scrim/80 text-on-media opacity-0 backdrop-blur-sm group-hover:opacity-100")
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
                  : "border-on-media-dim bg-media-scrim/80 text-on-media opacity-0 backdrop-blur-sm group-hover:opacity-100")
              }
              title="เลือกเพื่อดาวน์โหลดหลายรูป"
              aria-pressed={selected}
              aria-label={(selected ? "ยกเลิกเลือก" : "เลือก") + "การ์ด: " + item.prompt}
              onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }}
            >
              <Check size={14} />
            </button>
            <button
              className={
                "grid h-6 w-6 cursor-pointer place-items-center rounded-md border transition-all " +
                // on/off ต่างกันที่ "สี border+พื้น+ตัวไอคอน" และ fill ของดาว (โปร่ง vs ทึบ) ไม่ใช่แค่ opacity
                // ปุ่มที่ favorite แล้วต้องเห็นตลอดแม้ไม่ hover ไม่งั้นผู้ใช้ไล่หาของที่ mark ไว้บนกริดไม่เจอ
                (favorite
                  ? "border-accent bg-accent text-accent-ink opacity-100"
                  : "border-on-media-dim bg-media-scrim/80 text-on-media opacity-0 backdrop-blur-sm group-hover:opacity-100")
              }
              title={favorite ? "เอาออกจากรายการโปรด" : "เพิ่มเข้ารายการโปรด"}
              aria-pressed={favorite}
              aria-label={(favorite ? "เอาออกจากรายการโปรด: " : "เพิ่มเข้ารายการโปรด: ") + item.prompt}
              onClick={e => { e.stopPropagation(); toggleFavorite(item.id); }}
            >
              <Star size={13} fill={favorite ? "currentColor" : "none"} />
            </button>
          </div>
        )}

        {done && item.autoSaveStatus && item.autoSaveStatus !== "idle" && (
          <span
            className={
              "absolute bottom-2 left-2 z-1 grid h-5 w-5 place-items-center rounded-full border backdrop-blur-sm " +
              (item.autoSaveStatus === "saved"
                ? "border-accent/40 bg-media-scrim/80 text-accent"
                : item.autoSaveStatus === "failed"
                ? "border-danger/40 bg-media-scrim/80 text-danger"
                : "border-on-media-dim bg-media-scrim/80 text-on-media")
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

        {!done && item.status === "loading" && (
          isVid ? (
            <VideoProgress item={item} />
          ) : (
            <>
              <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,color-mix(in_oklab,var(--color-text)_8%,transparent)_50%,transparent_70%)] bg-[length:200%_100%]" />
              <div className="absolute left-1/2 top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-border-strong border-t-text" />
            </>
          )
        )}

        {item.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-[18px] text-center">
            <div className="max-h-[60%] overflow-hidden text-[11.5px] leading-normal text-danger">{item.errMsg}</div>
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

        {/*
          F1 — การ์ด "ยกเลิกแล้ว" (contract จาก types.ts:15 สั่งให้ Gallery Card เพิ่ม branch นี้เอง)
          โทนกลางๆ ตั้งใจ **ไม่ใช้ text-danger/border-danger** เพราะผู้ใช้กดยกเลิกเอง = เจตนา ไม่ใช่ความล้มเหลว
          (เหตุผลเต็มอยู่ที่ types.ts:12-14) จึงใช้ text-text-dim + ไอคอน Ban แทนสีแดงเตือนภัย
          เงินที่จ่ายไปแล้ว: งานวิดีโอจ่ายตั้งแต่ POST /videos ถ้า item ยังถือ jobId อยู่ (finalizeCancelled
          ไม่แตะ jobId — INVARIANT ที่ actions.ts:1132-1134) การกด "ทำต่อ" จะ resume job เดิม ไม่จ่ายซ้ำ
        */}
        {item.status === "cancelled" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-[18px] text-center">
            <Ban size={20} strokeWidth={1.6} className="text-text-faint" />
            <div className="text-[11.5px] leading-normal text-text-dim">
              {item.cancelReason === "shutdown"
                ? "งานถูกยกเลิกตอนปิดหน้าเว็บ"
                : item.cancelReason === "user-all"
                ? "ยกเลิกแล้ว (ยกเลิกทั้งหมด)"
                : "ยกเลิกแล้ว"}
            </div>
            {/* ข้อความเรื่องเงิน — โทนเดียวกับ timeout path ที่ actions.ts:1596 โชว์เฉพาะตอนยัง resume ได้จริง */}
            {item.jobId && (
              <div className="text-[10.5px] leading-normal text-text-faint">
                กด "ทำต่อ" เพื่อเช็คงานเดิมต่อได้ค่ะ (ไม่เสียเงินเพิ่ม)
              </div>
            )}
            <button
              className="mt-0.5 flex cursor-pointer items-center gap-1 rounded-[7px] border border-border-strong px-4 py-1.5 text-[11.5px] text-text transition-colors hover:border-text"
              title={item.jobId ? "ทำงานเดิมต่อจาก job ที่จ่ายเงินไปแล้ว" : "เริ่มงานนี้ใหม่"}
              aria-label={(item.jobId ? "ทำงานเดิมต่อ: " : "สร้างใหม่: ") + item.prompt}
              onClick={e => { e.stopPropagation(); retry(item); }}
            >
              <RotateCcw size={11} /> {item.jobId ? "ทำต่อ" : "สร้างใหม่"}
            </button>
          </div>
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
  if (prev.focused !== next.focused) return false;
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
    a.audio === b.audio &&
    // การ์ด cancelled สลับ label ปุ่ม ("ทำต่อ" vs "สร้างใหม่") และ gate ข้อความ "ไม่เสียเงินเพิ่ม" จาก jobId
    // ส่วนข้อความสถานะเลือกจาก cancelReason — ทั้งคู่จึงต้องอยู่ใน comparator ไม่งั้นการ์ดค้าง label เดิม
    // แล้วผู้ใช้เห็นไม่ตรงกับสิ่งที่ retry() จะทำจริง (ทางลงเอยคือจ่ายเงินซ้ำ)
    a.jobId === b.jobId &&
    a.cancelReason === b.cancelReason &&
    // ไม่มีบรรทัดนี้ = กดดาวแล้วการ์ดไม่ repaint เพราะ item ถูก mutate in-place (reference เดิม) — ดู comment ด้านบน
    !!a.favorite === !!b.favorite
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
                  <span className="absolute bottom-1 left-1 rounded-full bg-media-scrim/70 px-1.5 py-[1px] font-mono text-[9px] text-on-media">#{i + 1}</span>
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

/** ตัวกรองสถานะของ F3 — "all" = ไม่กรอง, ค่าที่เหลือ map ตรงกับ GenItem.status */
type StatusFilter = "all" | "done" | "error" | "loading" | "cancelled";
type SortOrder = "newest" | "oldest";

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "done", label: "สำเร็จ" },
  { value: "loading", label: "กำลังสร้าง" },
  { value: "error", label: "ล้มเหลว" },
  // F5 — ถ้าไม่มี chip นี้ item ที่ cancelled จะหาเจอได้แค่ใน "ทั้งหมด" เท่านั้น (ตัวกรองที่ :845 เทียบ status ตรงๆ)
  { value: "cancelled", label: "ยกเลิกแล้ว" },
];

/** สไตล์ chip ร่วมของแถบ filter — on/off ต่างกันที่สีพื้น+เส้นขอบ+สีตัวอักษร ไม่ใช่แค่ opacity */
function chipClass(on: boolean): string {
  return (
    "flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors " +
    (on
      ? "border-accent bg-accent text-accent-ink"
      : "border-border-strong bg-surface text-text-dim hover:border-accent hover:text-text")
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

  // item ใหม่ถูก unshift ไว้บนสุดเสมอ — ถ้าผู้ใช้เลื่อนดูรูปเก่าอยู่ตอนกด Generate จะมองไม่เห็น
  // การ์ดใหม่เลย (ทั้งที่สร้างสำเร็จ) จนกว่าจะเลื่อนขึ้นเอง จึงต้องเลื่อนขึ้นบนสุดให้ทุกครั้งที่มี item ใหม่โผล่
  // scroll จริงอยู่ใน react-window List (ดู VirtualGrid) จึงต้องสั่งผ่าน listRef.scrollToRow แทน scrollTo ของ div ธรรมดา
  const listRef = useRef<ListImperativeAPI | null>(null);
  const newestId = ms.images[0]?.id;
  useEffect(() => {
    if (newestId != null) listRef.current?.scrollToRow({ index: 0, align: "start", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

  // ---- F3: Gallery filter (T12 = local state ล้วน ยังไม่ persist — T13 จะย้ายไป store + wire index mapping ต่อ) ----
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // สลับโหมดแล้วตัวกรองเดิมไม่มีความหมายกับกริดชุดใหม่ (คนละ item คนละ prompt) — รีเซ็ตทิ้งเหมือนที่ optimizer ทำ
  useEffect(() => {
    setQuery("");
    setStatusFilter("all");
    setFavOnly(false);
    setSortOrder("newest");
  }, [s.mode]);

  const filterActive = query.trim() !== "" || statusFilter !== "all" || favOnly || sortOrder !== "newest";

  // ms.images เรียงใหม่→เก่าอยู่แล้ว (item ใหม่ถูก unshift ขึ้นหัว) — "newest" จึงคงลำดับเดิม, "oldest" แค่กลับด้าน
  // toSorted/reverse บน copy เสมอ ห้าม mutate ms.images ตรงๆ เพราะเป็น state จริงใน store
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = ms.images.filter(x => {
      if (favOnly && !x.favorite) return false;
      if (statusFilter !== "all" && x.status !== statusFilter) return false;
      if (q && !x.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortOrder === "oldest") out = [...out].reverse();
    return out;
  }, [ms.images, query, statusFilter, favOnly, sortOrder]);

  const favCount = ms.images.filter(x => !!x.favorite).length;

  // Lightbox เดินหน้า/ถอยหลังผ่าน doneIndices() ใน actions.ts ซึ่งเดิมไล่ cur().images ทั้งชุด — ผู้ใช้ที่กรองอยู่
  // จะกดลูกศรแล้วหลุดไปรูปที่ตัวกรองซ่อนไว้ ประกาศชุด id ที่มองเห็นจริงให้ actions รู้ แทนที่จะไปแก้ Lightbox.tsx
  // (อยู่คนละ branch) — ส่ง null ตอนไม่มีตัวกรองทำงาน เพื่อให้พฤติกรรมเดิมไม่เปลี่ยนเลยแม้แต่นิดเดียว
  useEffect(() => {
    setLightboxScope(filterActive ? new Set(visibleItems.map(x => x.id)) : null);
    return () => setLightboxScope(null);
  }, [filterActive, visibleItems]);

  // VirtualGrid ส่ง index ของ "ลิสต์ที่มองเห็น" กลับมา แต่ openLightbox เก็บ lbIndex ที่อ้าง cur().images ตรงๆ
  // (ดู doneIndices/lbStep ใน actions.ts) — พอมีตัวกรองสองอันนี้ไม่ตรงกันแล้ว ต้อง map กลับก่อนเสมอ
  const openFiltered = useCallback((visibleIndex: number) => {
    const target = visibleItems[visibleIndex];
    if (!target) return;
    const realIndex = ms.images.findIndex(x => x.id === target.id);
    if (realIndex >= 0) openLightbox(realIndex);
  }, [visibleItems, ms.images]);

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setFavOnly(false);
    setSortOrder("newest");
  };

  // ล้างแกลเลอรี = destructive และกู้คืนไม่ได้ (media เป็น memory-only ทั้งหมด) — ต้องยืนยันก่อนเสมอ
  // ข้าม item ที่ติดดาวไว้: ผู้ใช้กดดาว = ตั้งใจเก็บ การล้างทั้งกระดานไม่ควรลบของที่เพิ่งบอกว่าอยากเก็บ
  // resetModeGallery เป็นคน revoke blob URL ให้เฉพาะชิ้นที่ถูกลบจริง (ดู actions.ts) การ์ดที่ติดดาวจึงยังเล่นต่อได้
  const clearableCount = ms.images.filter(x => !x.favorite).length;

  const clearGallery = () => {
    if (!clearableCount) return;
    const question = favCount
      ? `ลบผลงาน ${clearableCount} ชิ้นในโหมดนี้ออกจากแกลเลอรีใช่ไหมคะ?
(${favCount} ชิ้นที่ติดดาวไว้จะถูกเก็บไว้ ส่วนที่เหลือกู้คืนไม่ได้)`
      : `ลบผลงานทั้ง ${clearableCount} ชิ้นในโหมดนี้ออกจากแกลเลอรีใช่ไหมคะ? กู้คืนไม่ได้นะคะ`;
    if (!window.confirm(question)) return;
    const removed = resetModeGallery(s.mode);
    resetFilters();
    toast(favCount ? `ล้างแกลเลอรีแล้ว ${removed} ชิ้นค่ะ (เก็บรายการโปรดไว้ ${favCount} ชิ้น)` : `ล้างแกลเลอรีแล้ว ${removed} ชิ้นค่ะ`);
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

      {/*
        แถบ filter — `shrink-0` ทำให้ไม่หดและไม่ scroll หายไปกับกริด: scroll container จริงเป็นของ react-window List
        ที่อยู่ข้างใน VirtualGrid (overflow-y-auto ของตัวเอง) ส่วนกล่องนี้เป็น flex child พี่น้องกันในคอลัมน์เดียวกัน
        จึงอยู่นิ่งตลอดโดยไม่ต้องใช้ position: sticky เลย
      */}
      {!!ms.images.length && (
        <div className="mb-3.5 flex shrink-0 flex-wrap items-center gap-2" role="search" aria-label="กรองผลงานในแกลเลอรี">
          <label className="relative flex min-w-[180px] flex-1 items-center">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-text-faint" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ค้นหาจาก prompt…"
              aria-label="ค้นหาผลงานจากข้อความใน prompt"
              className="w-full rounded-full border border-border-strong bg-surface py-1.5 pl-8 pr-3 text-[11.5px] text-text placeholder:text-text-faint transition-colors hover:border-accent"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามสถานะ">
            {STATUS_CHIPS.map(c => (
              <button
                key={c.value}
                className={chipClass(statusFilter === c.value)}
                aria-pressed={statusFilter === c.value}
                onClick={() => setStatusFilter(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <button
            className={chipClass(favOnly)}
            aria-pressed={favOnly}
            title={favCount ? `แสดงเฉพาะรายการโปรด (${favCount} ชิ้น)` : "ยังไม่มีรายการโปรด — กดดาวบนการ์ดเพื่อเพิ่ม"}
            aria-label="แสดงเฉพาะรายการโปรด"
            onClick={() => setFavOnly(v => !v)}
          >
            <Star size={11} fill={favOnly ? "currentColor" : "none"} /> โปรด{favCount ? ` (${favCount})` : ""}
          </button>

          <button
            className={chipClass(sortOrder === "oldest")}
            title="สลับลำดับการเรียงการ์ดในแกลเลอรี"
            aria-label={sortOrder === "newest" ? "เรียงใหม่สุดก่อน — กดเพื่อสลับเป็นเก่าสุดก่อน" : "เรียงเก่าสุดก่อน — กดเพื่อสลับเป็นใหม่สุดก่อน"}
            onClick={() => setSortOrder(v => (v === "newest" ? "oldest" : "newest"))}
          >
            <ArrowDownWideNarrow size={11} /> {sortOrder === "newest" ? "ใหม่สุดก่อน" : "เก่าสุดก่อน"}
          </button>

          <button
            className="ml-auto flex cursor-pointer items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-text-dim transition-colors hover:border-danger hover:text-danger"
            title={
              favCount
                ? `ลบผลงานในโหมดนี้ที่ไม่ได้ติดดาว (${clearableCount} ชิ้น) — ${favCount} ชิ้นที่ติดดาวจะถูกเก็บไว้`
                : "ลบผลงานทั้งหมดในโหมดนี้ออกจากแกลเลอรี"
            }
            aria-label="ล้างแกลเลอรีของโหมดนี้"
            disabled={!clearableCount}
            onClick={clearGallery}
          >
            <Trash2 size={11} /> ล้างแกลเลอรี
          </button>

          {filterActive && (
            <>
              <span className="font-mono text-[10.5px] text-text-faint" aria-live="polite">
                {visibleItems.length}/{ms.images.length}
              </span>
              <button
                className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-text-dim transition-colors hover:border-border-strong hover:text-text"
                aria-label="ล้างตัวกรองทั้งหมด"
                onClick={resetFilters}
              >
                <X size={11} /> ล้างตัวกรอง
              </button>
            </>
          )}
        </div>
      )}

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
      ) : !visibleItems.length ? (
        <div className="flex min-h-[240px] shrink-0 flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-border text-text-faint">
          <Search size={32} className="opacity-40" strokeWidth={1.4} />
          <p className="text-[13px]">ไม่มีผลงานที่ตรงกับตัวกรองนี้</p>
          <button
            className="flex cursor-pointer items-center gap-1 rounded-full border border-border-strong px-3 py-1 text-[11px] text-text-dim transition-colors hover:border-accent hover:text-text"
            onClick={resetFilters}
          >
            <X size={11} /> ล้างตัวกรอง
          </button>
        </div>
      ) : (
        <VirtualGrid
          items={visibleItems}
          selected={ms.selected}
          onToggleSelect={toggleSelect}
          onOpen={openFiltered}
          mode={s.mode}
          listRef={listRef}
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
