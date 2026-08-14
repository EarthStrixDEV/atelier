import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Clapperboard, Clock, CircleDollarSign, Cpu, GripVertical, Hash, Image, ImageOff, ImagePlus,
  Layers, Layers3, ListOrdered, ListTree, Music, Pin, PinOff, Plus, RectangleHorizontal, RotateCw, Search, ShieldOff, Sparkles,
  TriangleAlert, Trash2, Video, Volume2, X,
} from "lucide-react";
import {
  AUDIO_MODEL_PRICES, COUNTS, DURATIONS, KEYWORDS_BY_MODE, MAX_BAKE_OFF_MODELS, MAX_QUEUE,
  MAX_REFS_PER_KIND, modelRequiresRefImage, MODE_META, RATIOS, REF_KINDS, isNegativePromptMode, isVideoMode, modeLabel,
} from "../lib/constants";
import {
  addRefImages, addToQueue, applyOptimizedPrompt, canRunBakeOff, clearOptimize, clearRefImages,
  combinedHistory, computeItemCost, computeQueueJobCost, currentModel, generate, hasFailedAutoSaves, loadModels,
  loadVideoModels, modelsForMode, negPromptSupported, openBakeOffConfirm, refSupportLevel, refsSupported,
  removeFromHistory, removeFromQueue, removeRefImage, reorderQueue, retryFailedAutoSaves, runOptimize, selectModel,
  setNegPrompt, setPrompt, sortHistoryForDisplay, toggleAllHistoryOpen, toggleBakeOff, toggleBakeOffModel,
  toggleKeyword, togglePinHistory, usePromptFromCombinedHistory, usePromptFromHistory,
} from "../lib/actions";
import type { Mode } from "../lib/types";
import { mutate, useApp } from "../lib/store";
import { hasKeyword, videoPricePerSec } from "../lib/utils";
import PromptComposer from "./PromptComposer";
import RefCropPreview from "./RefCropPreview";

const HISTORY_MODE_ICONS: Record<Mode, typeof Image> = {
  home: Image,
  infographic: Layers,
  video: Video,
  cinematic: Clapperboard,
  audio: Music,
};

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;
const SIDEBAR_W_KEY = "atelier_sidebar_w";

const fieldLabel = "block text-[11px] font-semibold uppercase tracking-[1.2px] text-text-dim mb-[9px]";

// <option> รับได้แค่ text ล้วน — ใช้สัญลักษณ์นำหน้าชื่อโมเดลแทนไอคอนจริง แล้วอธิบายความหมายด้วย legend ที่มีไอคอนจริงด้านล่าง select
const REF_BADGE_PREFIX: Record<"none" | "optional" | "required", string> = {
  none: "✕ ",
  optional: "◐ ",
  required: "● ",
};
const segBtn = (active: boolean, disabled?: boolean) =>
  "flex cursor-pointer flex-col items-center gap-[5px] rounded-lg border px-0 py-2 text-xs font-medium transition-all " +
  (active
    ? "border-accent bg-accent font-semibold text-accent-ink"
    : "border-border bg-surface text-text-dim hover:border-border-strong hover:text-text") +
  (disabled ? " pointer-events-none opacity-30" : "");

export default function Sidebar() {
  const s = useApp();
  const ms = s.modes[s.mode];
  const meta = MODE_META[s.mode];
  const isVideo = isVideoMode(s.mode);
  const isAudio = s.mode === "audio";
  const model = currentModel();
  const list = modelsForMode(s.mode);

  const [width, setWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(SIDEBAR_W_KEY) ?? "", 10);
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 320;
  });
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // drag-to-reorder ของ Queue — index ที่กำลังลากอยู่ (native HTML5 DnD) — null = ไม่ได้ลาก
  const [dragQueueIndex, setDragQueueIndex] = useState<number | null>(null);

  // ค้นหา keyword chip — ล้างเมื่อสลับโหมดกันค้างคำค้นของโหมดก่อนหน้ามาบัง list ของโหมดใหม่
  const [kwSearch, setKwSearch] = useState("");
  useEffect(() => { setKwSearch(""); }, [s.mode]);
  const kwQuery = kwSearch.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!kwQuery) return KEYWORDS_BY_MODE[s.mode];
    return KEYWORDS_BY_MODE[s.mode]
      .map(group => ({ ...group, items: group.items.filter(kw => kw.toLowerCase().includes(kwQuery)) }))
      .filter(group => group.items.length > 0);
  }, [s.mode, kwQuery]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startW: width };
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, d.startW + (e.clientX - d.startX))));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setWidth(w => { localStorage.setItem(SIDEBAR_W_KEY, String(w)); return w; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // usage bar: ประเมินค่าใช้จ่ายจากงานที่ done ในโหมดปัจจุบัน (session-only)
  // เก็บทั้งยอดรวมและ count/duration ต่อโมเดล เพื่อแสดง label อธิบายวิธีคิดราคา (n หน่วย × rate/หน่วย)
  const done = ms.images.filter(x => x.status === "done");
  type UsageGroup = { totalCost: number; count: number; totalSeconds: number };
  const byModel = new Map<string, UsageGroup>();
  let usageTotal = 0;
  let hasUnknown = false;
  for (const item of done) {
    const cost = computeItemCost(item);
    if (cost == null) { hasUnknown = true; continue; }
    usageTotal += cost;
    const g = byModel.get(item.modelName) ?? { totalCost: 0, count: 0, totalSeconds: 0 };
    g.totalCost += cost;
    g.count += 1;
    g.totalSeconds += item.duration || 0;
    byModel.set(item.modelName, g);
  }
  const usageRows = [...byModel.entries()].sort((a, b) => b[1].totalCost - a[1].totalCost);
  const usageMax = usageRows[0]?.[1].totalCost || 1;
  const usageBreakdown = (name: string, g: UsageGroup): string => {
    // rate ต่อหน่วยคำนวณย้อนจากยอดรวม/จำนวนหน่วย — ครอบคลุมเคสที่ราคาต่างกันในกลุ่มเดียวกัน (เช่น video เปิด/ปิดเสียง) ด้วยค่าเฉลี่ย
    if (isVideo) {
      const rate = g.totalSeconds > 0 ? g.totalCost / g.totalSeconds : 0;
      return `${g.totalSeconds} วิ ใช้ ${name} ที่ ~$${rate.toFixed(4)}/วิ`;
    }
    if (isAudio) {
      const rate = g.totalCost / g.count;
      return `${g.count} เพลง ใช้ ${name} ที่ ~$${rate.toFixed(4)}/เพลง`;
    }
    const rate = g.totalCost / g.count;
    return `${g.count} รูป ใช้ ${name} ที่ ~$${rate.toFixed(4)}/รูป`;
  };

  // queue cost preview: รวมราคาประเมินของทุก job ที่รอคิวอยู่ในโหมดนี้ — ถ้ามี job ไหนราคาไม่ทราบ ต้องบอกว่ายอดนี้ไม่ครบ ห้ามนับเป็น 0 เงียบๆ
  let queueTotalCost = 0;
  let queueHasUnknown = false;
  for (const q of ms.queue) {
    const cost = computeQueueJobCost(s.mode, q);
    if (cost == null) { queueHasUnknown = true; continue; }
    queueTotalCost += cost;
  }

  // capability ของโมเดลวิดีโอ — ใช้ disable ปุ่ม (การ snap ค่าเกิดใน applyVideoCapabilities แล้ว)
  const durs = isVideo && model?.supported_durations?.length ? model.supported_durations : null;
  const vRatios = isVideo && model?.supported_aspect_ratios?.length ? model.supported_aspect_ratios : null;
  const audioOk = isVideo && !!model?.generate_audio;

  const sourceLoaded = isVideo ? s.videoModels.length > 0 : isAudio ? s.audioModels.length > 0 : s.models.length > 0;
  const sourceFailed = isVideo ? s.videoModelsFailed : s.modelsFailed;
  const canAttachRefs = refsSupported();
  const hasPrompt = !!ms.prompt.trim();
  const needsRefImage = isVideo && modelRequiresRefImage(model?.id) && !ms.refs[0];
  const canGenerate = !!s.apiKey && list.length > 0 && (hasPrompt || ms.queue.length > 0) && !needsRefImage;
  // Bake-off (PHASE 14) เปลี่ยนพฤติกรรมปุ่ม Generate หลัก — ยิงผ่าน openBakeOffConfirm (โมดัลยืนยันราคา) แทน generate() ตรงๆ
  const bakeOffActive = ms.bakeOffEnabled;
  const canGenerateOrBakeOff = bakeOffActive ? canRunBakeOff() : canGenerate;

  let modelMeta = "";
  if (model) {
    if (isVideo) {
      const pps = videoPricePerSec(model, ms.audio);
      modelMeta = model.id + (pps != null ? "  ·  ~$" + (pps * ms.duration).toFixed(2) + " / คลิป " + ms.duration + " วิ" : "");
    } else if (isAudio) {
      const p = AUDIO_MODEL_PRICES[model.id];
      modelMeta = model.id + (p != null ? "  ·  ~$" + p.toFixed(2) + " / เพลง" : "");
    } else {
      const p = model.pricing?.image && parseFloat(model.pricing.image) > 0
        ? "$" + (parseFloat(model.pricing.image) * 1000).toFixed(3).replace(/\.?0+$/, "") + " / 1k img"
        : null;
      modelMeta = model.id + (p ? "  ·  " + p : "");
    }
  }

  // สถิติสำเร็จ/ล้มเหลวของโมเดลที่เลือกอยู่ ใน session นี้ — เตือนถ้า fail rate เกิน 30% (ขั้นต่ำ 5 ครั้ง กันสุ่มน้อยแล้วตกใจ)
  const stat = model ? s.modelStats[model.id] : undefined;
  const statAttempts = stat ? stat.ok + stat.fail : 0;
  const statWarn = statAttempts >= 5 && stat!.fail / statAttempts > 0.3;

  // ส่วนต่างราคาเปิด/ปิดเสียงของโมเดลวิดีโอที่เลือกอยู่ — null เมื่อคำนวณราคาไม่ได้ (เช่น pricing แบบ token-based)
  let audioCostNote: string | null = null;
  if (isVideo && model) {
    const ppsOn = videoPricePerSec(model, true);
    const ppsOff = videoPricePerSec(model, false);
    audioCostNote = ppsOn != null && ppsOff != null
      ? (ppsOn === ppsOff ? "ไม่มีผลต่อราคา" : "+$" + ((ppsOn - ppsOff) * ms.duration).toFixed(2) + " ถ้าเปิดเสียง")
      : "ไม่ทราบผลต่อราคา (โมเดลนี้คิดราคาแบบคำนวณล่วงหน้าไม่ได้)";
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-border p-6 max-[860px]:!w-full max-[860px]:border-b max-[860px]:border-r-0"
      style={{ width }}
    >
      <div
        className="absolute right-[-3px] top-0 z-5 h-full w-1.5 cursor-col-resize hover:bg-accent/40 max-[860px]:hidden"
        onMouseDown={onDragStart}
      />

      {s.promptPlacement === "sidebar" && <PromptComposer placement="sidebar" />}

      {/* Negative prompt (PHASE 14) — เฉพาะโหมดภาพ และซ่อนทิ้งถ้าโมเดลที่เลือกอยู่ routed ผ่าน image-only API (ไม่มี text slot ให้แนบเพิ่ม) */}
      {isNegativePromptMode(s.mode) && (
        <div>
          <label htmlFor="neg-prompt" className={fieldLabel + " flex items-center gap-1.5"}>
            <ShieldOff size={12} /> Negative Prompt <span className="normal-case tracking-normal text-text-faint">(ไม่บังคับ)</span>
          </label>
          {negPromptSupported() ? (
            <>
              <textarea
                id="neg-prompt"
                value={ms.negPrompt}
                placeholder="สิ่งที่ไม่อยากเห็นในภาพ… เช่น extra fingers, blurry, watermark, text"
                onChange={e => setNegPrompt(e.target.value)}
                className="min-h-[64px] w-full resize-y rounded-card border border-border bg-surface px-3.5 py-2.5 text-[12.5px] leading-relaxed text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent"
              />
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-faint">
                เป็นแค่คำแนะนำ best-effort ให้โมเดลหลีกเลี่ยง ไม่ใช่การันตีว่าจะไม่ปรากฏในภาพนะคะ
              </p>
            </>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-text-faint">
              โมเดลนี้สร้างภาพได้อย่างเดียว (image-only) จึงไม่มีช่องข้อความเพิ่มให้แนบ Negative Prompt ค่ะ
            </p>
          )}
        </div>
      )}

      {/* Legacy prompt markup retained temporarily while the shared composer owns rendering. */}
      {false && <>
      <div>
        <label htmlFor="prompt" className={fieldLabel}>Prompt</label>
        <textarea
          id="prompt"
          value={ms.prompt}
          placeholder={meta.placeholder}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canGenerate) generate();
            }
          }}
          className="min-h-[110px] w-full resize-y rounded-card border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent"
        />
        <button
          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-[9px] text-xs font-semibold text-text-dim transition-colors hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
          disabled={!hasPrompt || s.optimize.status === "loading"}
          onClick={runOptimize}
        >
          <Sparkles size={13} />
          {s.optimize.status === "loading" ? "กำลังจูน prompt…" : "Optimize"}
        </button>
      </div>

      {/* Optimize result panel */}
      {(s.optimize.status === "done" || s.optimize.status === "error") && (
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-border-strong bg-surface p-3">
          {s.optimize.status === "error" ? (
            <>
              <div className="text-xs leading-normal text-danger">{s.optimize.error}</div>
              <button className="cursor-pointer rounded-lg border border-border py-2 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text" onClick={clearOptimize}>
                ปิด
              </button>
            </>
          ) : s.optimize.result && (
            <>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.8px] text-text-faint">Prompt ที่จูนแล้ว</div>
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-[11px] py-2.5 text-[12.5px] leading-relaxed text-text">
                {s.optimize.result!.prompt}
              </div>
              {s.optimize.result!.keywords.length > 0 && (
                <>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.8px] text-text-faint">Keyword แนะนำ (กดเพื่อเพิ่มเข้า prompt ปัจจุบัน)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.optimize.result!.keywords.map(kw => (
                      <button
                        key={kw.text}
                        className={
                          "cursor-pointer rounded-full border px-[11px] py-[5px] text-[11.5px] transition-all " +
                          (hasKeyword(ms.prompt, kw.text)
                            ? "border-accent bg-accent font-semibold text-accent-ink"
                            : "border-border bg-surface-2 text-text-dim hover:border-border-strong hover:text-text")
                        }
                        onClick={() => toggleKeyword(kw.text)}
                      >
                        {kw.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button className="flex-1 cursor-pointer rounded-lg bg-accent py-2 text-xs font-semibold text-accent-ink transition-opacity hover:opacity-90" onClick={applyOptimizedPrompt}>
                  ใช้ prompt นี้
                </button>
                <button className="flex-1 cursor-pointer rounded-lg border border-border py-2 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text" onClick={clearOptimize}>
                  ยกเลิก
                </button>
              </div>
            </>
          )}
        </div>
      )}
      </>}

      {/* Prompt history */}
      {ms.history.length > 0 && (
        <details className="kw-group overflow-hidden rounded-lg border border-border bg-surface">
          <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-[9px] text-[11px] font-semibold tracking-[.5px] text-text-dim transition-colors hover:text-text">
            <span className="flex items-center gap-1.5"><Clock size={11} /> Prompt History ({ms.history.length})</span>
          </summary>
          <div className="flex flex-col gap-1.5 px-3 pb-3 pt-0.5">
            {sortHistoryForDisplay(ms.history).map(entry => (
              <div key={entry.text} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-[7px] pl-[11px] pr-2">
                <button
                  className="min-w-0 flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap text-left text-[11.5px] text-text-dim hover:text-text"
                  title={entry.text}
                  onClick={() => usePromptFromHistory(entry)}
                >
                  {entry.text}
                </button>
                <button
                  className={"shrink-0 cursor-pointer px-1 py-0.5 " + (entry.pinned ? "text-accent" : "text-text-faint hover:text-text")}
                  title={entry.pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                  onClick={() => togglePinHistory(s.mode, entry.text)}
                >
                  {entry.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                </button>
                <button
                  className="shrink-0 cursor-pointer px-1 py-0.5 text-text-faint hover:text-danger"
                  title="ลบออกจากประวัติ"
                  onClick={() => removeFromHistory(s.mode, entry.text)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ประวัติทั้งหมด — merged view ข้ามทุกโหมด เรียงตามความล่าสุด (pinned ก่อนเสมอ) */}
      <div className="rounded-lg border border-border bg-surface">
        <button
          className="flex w-full cursor-pointer select-none items-center justify-between px-3 py-[9px] text-[11px] font-semibold tracking-[.5px] text-text-dim transition-colors hover:text-text"
          onClick={toggleAllHistoryOpen}
        >
          <span className="flex items-center gap-1.5"><ListOrdered size={11} /> ประวัติทั้งหมด</span>
          <span className="text-text-faint">{s.allHistoryOpen ? "ซ่อน" : "แสดง"}</span>
        </button>
        {s.allHistoryOpen && (
          <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto px-3 pb-3 pt-0.5">
            {combinedHistory().length === 0 ? (
              <div className="py-2 text-center text-[11.5px] text-text-faint">ยังไม่มีประวัติ prompt เลยค่ะ</div>
            ) : combinedHistory().map(entry => {
              const ModeIcon = HISTORY_MODE_ICONS[entry.mode];
              return (
                <div key={entry.mode + "|" + entry.text} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-[7px] pl-[9px] pr-2">
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-full border border-border-strong px-1.5 py-[3px] text-[9.5px] font-semibold uppercase tracking-[.3px] text-text-faint"
                    title={modeLabel(entry.mode)}
                  >
                    <ModeIcon size={10} /> {modeLabel(entry.mode)}
                  </span>
                  <button
                    className="min-w-0 flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap text-left text-[11.5px] text-text-dim hover:text-text"
                    title={entry.text}
                    onClick={() => usePromptFromCombinedHistory(entry)}
                  >
                    {entry.text}
                  </button>
                  <button
                    className={"shrink-0 cursor-pointer px-1 py-0.5 " + (entry.pinned ? "text-accent" : "text-text-faint hover:text-text")}
                    title={entry.pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                    onClick={() => togglePinHistory(entry.mode, entry.text)}
                  >
                    {entry.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                  </button>
                  <button
                    className="shrink-0 cursor-pointer px-1 py-0.5 text-text-faint hover:text-danger"
                    title="ลบออกจากประวัติ"
                    onClick={() => removeFromHistory(entry.mode, entry.text)}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Prompt builder */}
      <div>
        <label className={fieldLabel + " flex items-center gap-1.5"}><ListTree size={12} /> Prompt Builder</label>

        <div className="relative mb-2">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            type="text"
            value={kwSearch}
            onChange={e => setKwSearch(e.target.value)}
            placeholder="ค้นหา keyword…"
            className="w-full rounded-lg border border-border bg-surface py-[7px] pl-[26px] pr-8 text-[12px] text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent"
          />
          {kwSearch && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-text-faint hover:text-text"
              title="ล้างคำค้นหา"
              onClick={() => setKwSearch("")}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {!kwQuery && ms.recentKeywords.length > 0 && (
          <div className="mb-2 rounded-lg border border-border bg-surface p-2.5">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[.5px] text-text-faint">ใช้ล่าสุด</div>
            <div className="flex flex-wrap gap-1.5">
              {ms.recentKeywords.map(kw => (
                <button
                  key={kw}
                  className={
                    "cursor-pointer rounded-full border px-[11px] py-[5px] text-[11.5px] transition-all " +
                    (hasKeyword(ms.prompt, kw)
                      ? "border-accent bg-accent font-semibold text-accent-ink"
                      : "border-border bg-surface-2 text-text-dim hover:border-border-strong hover:text-text")
                  }
                  onClick={() => toggleKeyword(kw)}
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>
        )}

        {kwQuery && !filteredGroups.length ? (
          <p className="px-1 py-2 text-[11.5px] text-text-faint">ไม่พบ keyword ที่ตรงกับ "{kwSearch}" ค่ะ</p>
        ) : (
          <div>
            {filteredGroups.map((group, i) => (
              <details key={group.label} className="kw-group mt-[7px] overflow-hidden rounded-lg border border-border bg-surface first:mt-0" open={i === 0 || !!kwQuery}>
                <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-[9px] text-[11px] font-semibold tracking-[.5px] text-text-dim transition-colors hover:text-text">
                  {group.label}
                </summary>
                <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-0.5">
                  {group.items.map(kw => (
                    <button
                      key={kw}
                      className={
                        "cursor-pointer rounded-full border px-[11px] py-[5px] text-[11.5px] transition-all " +
                        (hasKeyword(ms.prompt, kw)
                          ? "border-accent bg-accent font-semibold text-accent-ink"
                          : "border-border bg-surface-2 text-text-dim hover:border-border-strong hover:text-text")
                      }
                      onClick={() => toggleKeyword(kw)}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* Attach reference / style / facial — โหมด audio ไม่รองรับภาพอ้างอิง */}
      {!isAudio && <div>
        <label className={fieldLabel + " flex items-center gap-1.5"}>
          <ImagePlus size={12} /> Attach Reference
          {ms.refs.length > 0 && (
            <button
              className="ml-auto flex cursor-pointer items-center gap-1 font-semibold normal-case tracking-normal text-text-faint hover:text-danger"
              onClick={clearRefImages}
            >
              <Trash2 size={11} /> ล้างทั้งหมด ({ms.refs.length})
            </button>
          )}
        </label>
        {isVideo ? (
          <div className={"overflow-hidden rounded-card border bg-surface " + (needsRefImage ? "border-danger" : "border-border")}>
            {needsRefImage && (
              <p className="border-b border-danger/40 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
                โมเดลนี้เป็น Image-to-Video ล้วน — ต้องแนบภาพอ้างอิงก่อนถึงจะ Generate ได้ค่ะ
              </p>
            )}
            {ms.refs[0] ? (
              <div className="group relative aspect-video overflow-hidden bg-surface-2">
                <img src={ms.refs[0].dataUrl} alt={ms.refs[0].name} className="h-full w-full object-cover" />
                <RefCropPreview ref_={ms.refs[0]} targetRatio={ms.ratio} />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8">
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-white" title={ms.refs[0].name}>{ms.refs[0].name}</span>
                  <button
                    type="button"
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur transition-colors hover:border-danger hover:text-danger"
                    onClick={() => removeRefImage(ms.refs[0])}
                  >
                    <Trash2 size={11} /> ลบภาพ
                  </button>
                </div>
                <span className="absolute left-2.5 top-2.5 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[.12em] text-white backdrop-blur">First frame</span>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2.5 border border-dashed border-transparent px-4 py-7 text-center transition-colors hover:border-border-strong hover:bg-surface-2">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-border-strong bg-surface-2 text-text-dim"><ImagePlus size={17} /></span>
                <span className="text-xs font-semibold text-text">{needsRefImage ? "แนบภาพเริ่มต้น (จำเป็น)" : "แนบภาพเริ่มต้น"}</span>
                <span className="max-w-[230px] text-[10.5px] leading-relaxed text-text-faint">ภาพนี้จะเป็นเฟรมแรกสำหรับ Image-to-Video · สูงสุด 4MB</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.length) addRefImages("ref", e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {ms.refs[0] && (
              <label className="flex cursor-pointer items-center justify-center gap-1.5 border-t border-border py-2.5 text-[11px] font-semibold text-text-dim transition-colors hover:bg-surface-2 hover:text-text">
                <ImagePlus size={12} /> เปลี่ยนภาพ
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.length) addRefImages("ref", e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        ) : !canAttachRefs ? (
          <p className="text-[11.5px] leading-relaxed text-text-faint">
            โมเดลนี้สร้างภาพได้อย่างเดียว (image-only) จึงแนบภาพอ้างอิงไม่ได้ — เลือกโมเดลแบบ image+text เช่น Gemini หรือ GPT Image ค่ะ
          </p>
        ) : (
          <div className="flex flex-col gap-[7px]">
            {REF_KINDS.map(({ kind, label, hint }) => {
              const items = ms.refs.filter(r => r.kind === kind);
              const full = items.length >= MAX_REFS_PER_KIND;
              return (
                <div key={kind} className="rounded-lg border border-border bg-surface p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] font-semibold text-text">{label}</span>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-text-faint" title={hint}>{hint}</span>
                  </div>
                  {items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {items.map((ref, i) => {
                        // เฉพาะรูปแรกของ kind "ref" (composition/layout หลัก — มีผลต่อ framing มากสุดตาม REF_KINDS) โชว์ preview ขนาดใหญ่ขึ้นพอให้เห็น overlay ชัด
                        const showCrop = kind === "ref" && i === 0;
                        return (
                          <div
                            key={kind + i}
                            className={"group relative overflow-hidden rounded-md border border-border-strong " + (showCrop ? "h-24 w-24" : "h-14 w-14")}
                          >
                            <img src={ref.dataUrl} alt={ref.name} title={ref.name} className="h-full w-full object-cover" />
                            {showCrop && <RefCropPreview ref_={ref} targetRatio={ms.ratio} />}
                            <button
                              className="absolute right-0 top-0 grid h-4 w-4 cursor-pointer place-items-center bg-bg/80 text-text-dim hover:text-danger"
                              title={"ลบ " + ref.name}
                              onClick={() => removeRefImage(ref)}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <label
                    className={
                      "mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-[7px] text-[11.5px] font-semibold transition-colors " +
                      (full
                        ? "cursor-not-allowed border-border text-text-faint opacity-50"
                        : "cursor-pointer border-border-strong text-text-dim hover:border-text hover:text-text")
                    }
                  >
                    <ImagePlus size={12} />
                    {full ? `ครบ ${MAX_REFS_PER_KIND} รูปแล้ว` : "แนบรูป"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={full}
                      className="hidden"
                      onChange={e => {
                        if (e.target.files?.length) addRefImages(kind, e.target.files);
                        e.target.value = ""; // เคลียร์เพื่อให้เลือกไฟล์เดิมซ้ำได้
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* Model */}
      <div>
        <label htmlFor="model" className={fieldLabel + " flex items-center gap-1.5"}><Cpu size={12} /> Model</label>
        <div className="relative after:pointer-events-none after:absolute after:right-3.5 after:top-1/2 after:h-[7px] after:w-[7px] after:-translate-y-[70%] after:rotate-45 after:border-b-[1.5px] after:border-r-[1.5px] after:border-text-dim">
          <select
            id="model"
            className="w-full cursor-pointer appearance-none rounded-card border border-border bg-surface px-3 py-2.5 text-[13px] text-text outline-none transition-colors focus:border-accent disabled:cursor-default"
            disabled={!sourceLoaded && !sourceFailed}
            value={ms.modelId ?? ""}
            onMouseDown={e => {
              if (!sourceLoaded && sourceFailed) {
                e.preventDefault();
                if (isVideo) loadVideoModels(); else loadModels();
              }
            }}
            onChange={e => selectModel(e.target.value)}
          >
            {!sourceLoaded ? (
              <option>{sourceFailed ? "โหลดโมเดลไม่สำเร็จ — คลิกเพื่อลองใหม่" : "กำลังโหลดรายชื่อโมเดล…"}</option>
            ) : !list.length ? (
              <option>ไม่พบโมเดลที่รองรับโหมดนี้</option>
            ) : (
              list.map(m => (
                <option key={m.id} value={m.id}>
                  {REF_BADGE_PREFIX[refSupportLevel(s.mode, m)]}{m.name || m.id}
                </option>
              ))
            )}
          </select>
        </div>
        {sourceLoaded && list.length > 0 && (
          <div className="mt-[7px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] leading-normal text-text-faint" title="สัญลักษณ์นำหน้าชื่อโมเดลในลิสต์ด้านบน — บอกว่าโมเดลนั้นรองรับภาพอ้างอิง (Attach Reference) แค่ไหน">
            <span className="flex items-center gap-1"><ImagePlus size={10} /> ● จำเป็นต้องมี ref</span>
            <span className="flex items-center gap-1"><ImagePlus size={10} /> ◐ แนบ ref ได้ (ไม่บังคับ)</span>
            <span className="flex items-center gap-1"><ImageOff size={10} /> ✕ แนบ ref ไม่ได้</span>
          </div>
        )}
        {modelMeta && <div className="mt-[7px] font-mono text-[11px] leading-normal text-text-faint">{modelMeta}</div>}
        {statAttempts > 0 && (
          <div className={"mt-[5px] flex items-center gap-1 text-[11px] leading-normal " + (statWarn ? "text-danger" : "text-text-faint")}>
            {statWarn && <TriangleAlert size={11} className="shrink-0" />}
            {stat!.ok}/{statAttempts} สำเร็จใน session นี้
            {statWarn && " — อัตราล้มเหลวสูงกว่า 30%"}
          </div>
        )}

        {/* Bake-off — เทียบหลายโมเดลพร้อมกัน (PHASE 14) — เฉพาะโหมดภาพ, ยิงอิสระ N ก้อนทันที ไม่ผ่านคิว ไม่โดน MAX_QUEUE จำกัด */}
        {isNegativePromptMode(s.mode) && sourceLoaded && list.length > 1 && (
          <div className="mt-3 rounded-lg border border-border bg-surface p-2.5">
            <label className="flex cursor-pointer select-none items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text">
                <Layers3 size={13} /> Bake-off — เทียบหลายโมเดล
              </span>
              <input
                type="checkbox"
                className="cursor-pointer accent-accent"
                checked={ms.bakeOffEnabled}
                onChange={toggleBakeOff}
              />
            </label>
            {ms.bakeOffEnabled && (
              <>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-faint">
                  เลือกโมเดลได้สูงสุด {MAX_BAKE_OFF_MODELS} ตัว — กด Generate จะยิงทุกโมเดลที่เลือกพร้อมกันด้วย prompt เดียวกัน (แยกจากปุ่มเลือกโมเดลด้านบน)
                </p>
                <div className="mt-2 flex max-h-[180px] flex-col gap-1 overflow-y-auto">
                  {list.map(m => {
                    const checked = ms.bakeOffModelIds.includes(m.id);
                    const disabled = !checked && ms.bakeOffModelIds.length >= MAX_BAKE_OFF_MODELS;
                    return (
                      <label
                        key={m.id}
                        className={
                          "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px] transition-colors " +
                          (checked ? "border-accent bg-accent/10 text-text" : "border-border text-text-dim") +
                          (disabled ? " cursor-not-allowed opacity-40" : " cursor-pointer hover:border-border-strong")
                        }
                      >
                        <input
                          type="checkbox"
                          className="cursor-pointer accent-accent disabled:cursor-not-allowed"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleBakeOffModel(m.id)}
                        />
                        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{m.name || m.id}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-1.5 text-[10.5px] text-text-faint">{ms.bakeOffModelIds.length}/{MAX_BAKE_OFF_MODELS} เลือกไว้</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Usage bar */}
      {usageRows.length > 0 && (
        <div>
          <label className={fieldLabel + " flex items-center gap-1.5"}>
            <CircleDollarSign size={12} /> Usage <span className="normal-case tracking-normal">~${usageTotal.toFixed(4)}{hasUnknown ? " (บางโมเดลไม่ทราบราคา)" : ""}</span>
          </label>
          <div className="flex flex-col gap-2.5">
            {usageRows.map(([name, g]) => (
              <div key={name}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-text-dim" title={name}>{name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-text-faint">${g.totalCost.toFixed(4)}</span>
                </div>
                <div
                  className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-text-faint"
                  title={usageBreakdown(name, g)}
                >
                  {usageBreakdown(name, g)}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: (g.totalCost / usageMax) * 100 + "%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ปุ่ม retry Auto Save ที่พลาด — โชว์เฉพาะตอนมีชิ้นที่ autoSaveStatus === "failed" ในโหมดนี้ */}
      {hasFailedAutoSaves() && (
        <button
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-danger/50 py-2 text-[11.5px] font-semibold text-danger transition-colors hover:bg-danger/10"
          title="ลองเซฟไฟล์ที่ Auto Save พลาดไปใหม่อีกครั้ง"
          onClick={retryFailedAutoSaves}
        >
          <RotateCw size={12} /> ลองเซฟไฟล์ที่พลาดใหม่
        </button>
      )}

      {/* Aspect ratio — ไม่มีผลกับเสียง */}
      {!isAudio && <div>
        <label className={fieldLabel + " flex items-center gap-1.5"}><RectangleHorizontal size={12} /> Aspect Ratio</label>
        <div className="grid grid-cols-5 gap-1.5">
          {RATIOS.map(r => {
            const disabled = !!(vRatios && !vRatios.includes(r.v));
            return (
              <button
                key={r.v}
                className={segBtn(ms.ratio === r.v, disabled)}
                disabled={disabled}
                onClick={() => mutate(() => { ms.ratio = r.v; })}
              >
                <span className="block rounded-[2px] border-[1.5px] border-current" style={{ width: r.w, height: r.h }} />
                {r.v}
              </button>
            );
          })}
        </div>
      </div>}

      {/* Duration (video) */}
      {isVideo && (
        <div>
          <label className={fieldLabel + " flex items-center gap-1.5"}><Clock size={12} /> Duration</label>
          <div className="grid grid-cols-3 gap-1.5">
            {DURATIONS.map(d => {
              const disabled = !!(durs && !durs.includes(d));
              return (
                <button
                  key={d}
                  className={segBtn(ms.duration === d, disabled) + " !text-[13px]"}
                  disabled={disabled}
                  onClick={() => mutate(() => { ms.duration = d; })}
                >
                  {d}s
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Audio (video) */}
      {isVideo && (
        <div>
          <label className={fieldLabel + " flex items-center gap-1.5"}><Volume2 size={12} /> Audio</label>
          <label className="flex cursor-pointer select-none items-center gap-[9px] text-[12.5px] text-text-dim">
            <input
              type="checkbox"
              className="cursor-pointer accent-accent disabled:cursor-not-allowed"
              disabled={!audioOk}
              checked={ms.audio}
              onChange={e => mutate(() => { ms.audio = e.target.checked; })}
            />
            <span className={audioOk ? "" : "opacity-40"}>เปิดเสียงในวิดีโอ (เฉพาะโมเดลที่รองรับ)</span>
          </label>
          {audioOk && audioCostNote && (
            <div className="mt-1.5 font-mono text-[10.5px] leading-normal text-text-faint">{audioCostNote}</div>
          )}
        </div>
      )}

      {/* Count */}
      <div>
        <label className={fieldLabel + " flex items-center gap-1.5"}><Hash size={12} /> {meta.countLabel}</label>
        <div className="grid grid-cols-4 gap-1.5">
          {COUNTS.map(c => (
            <button
              key={c}
              className={segBtn(ms.count === c) + " !text-[13px]"}
              onClick={() => mutate(() => { ms.count = c; })}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Queue */}
      {ms.queue.length > 0 && (
        <div>
          <label className={fieldLabel + " flex items-center gap-1.5"}>
            <ListOrdered size={12} /> Queue <span className="normal-case tracking-normal">{ms.queue.length}/{MAX_QUEUE}</span>
            <span className="ml-auto normal-case tracking-normal text-text-faint">
              ~${queueTotalCost.toFixed(4)}{queueHasUnknown ? " (บางงานไม่ทราบราคา)" : ""}
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            {ms.queue.map((q, i) => {
              const jobCost = computeQueueJobCost(s.mode, q);
              const isDragging = dragQueueIndex === i;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={e => { setDragQueueIndex(i); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => setDragQueueIndex(null)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragQueueIndex != null && dragQueueIndex !== i) reorderQueue(dragQueueIndex, i);
                    setDragQueueIndex(null);
                  }}
                  className={
                    "flex items-center gap-[7px] rounded-lg border bg-surface px-2.5 py-2 transition-opacity " +
                    (isDragging ? "border-accent opacity-50" : "border-border")
                  }
                >
                  <span className="shrink-0 cursor-grab text-text-faint active:cursor-grabbing" title="ลากเพื่อจัดลำดับใหม่">
                    <GripVertical size={13} />
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-text-faint">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-text">{q.prompt}</div>
                    <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-text-faint">{q.modelName}</div>
                    <div className="mt-[5px] flex flex-wrap items-center gap-1">
                      {!isAudio && (
                        <span className="rounded-full border border-border-strong px-[7px] py-[1px] text-[9.5px] font-medium text-text-dim">{q.ratio}</span>
                      )}
                      {isVideo && (
                        <>
                          <span className="rounded-full border border-border-strong px-[7px] py-[1px] text-[9.5px] font-medium text-text-dim">{q.duration}s</span>
                          <span className={"rounded-full border px-[7px] py-[1px] text-[9.5px] font-medium " + (q.audio ? "border-accent/50 text-accent" : "border-border-strong text-text-faint")}>
                            {q.audio ? "🔊 เสียงเปิด" : "เสียงปิด"}
                          </span>
                        </>
                      )}
                      <span className="rounded-full border border-border-strong px-[7px] py-[1px] text-[9.5px] font-medium text-text-dim">×{q.count}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-text-faint">
                        {jobCost != null ? "~$" + jobCost.toFixed(4) : "ราคาไม่ทราบ"}
                      </span>
                    </div>
                  </div>
                  {/* ปุ่มขึ้น/ลง — fallback ของการลากสำหรับมือถือ/แตะหน้าจอที่ native drag-and-drop ทำงานไม่คงเส้นคงวา */}
                  <div className="flex shrink-0 flex-col">
                    <button
                      className="cursor-pointer px-1 py-0.5 text-text-faint transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-25"
                      title="ย้ายขึ้น"
                      disabled={i === 0}
                      onClick={() => reorderQueue(i, i - 1)}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      className="cursor-pointer px-1 py-0.5 text-text-faint transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-25"
                      title="ย้ายลง"
                      disabled={i === ms.queue.length - 1}
                      onClick={() => reorderQueue(i, i + 1)}
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                  <button
                    className="shrink-0 cursor-pointer px-1 py-0.5 text-text-faint transition-colors hover:text-danger"
                    title="ลบออกจากคิว"
                    onClick={() => removeFromQueue(i)}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate + queue buttons */}
      <button
        className="mt-0.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-card bg-accent py-[13px] text-sm font-bold tracking-[0.3px] text-accent-ink transition-all hover:opacity-90 active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-35"
        disabled={!canGenerateOrBakeOff}
        title={bakeOffActive && !canGenerateOrBakeOff ? "เลือกโมเดลอย่างน้อย 2 ตัวและใส่ prompt ก่อนค่ะ" : undefined}
        onClick={bakeOffActive ? openBakeOffConfirm : generate}
      >
        {bakeOffActive ? <Layers3 size={15} /> : <Sparkles size={15} />}
        {bakeOffActive
          ? `Generate Bake-off (${ms.bakeOffModelIds.length})`
          : ms.queue.length ? `Generate Queue (${ms.queue.length})` : "Generate"}
      </button>
      <button
        className="-mt-3 flex w-full cursor-pointer items-center justify-center gap-1 rounded-card border border-dashed border-border-strong py-2.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
        disabled={!(list.length > 0 && hasPrompt && ms.queue.length < MAX_QUEUE) || needsRefImage}
        onClick={addToQueue}
      >
        <Plus size={13} /> เพิ่มเข้าคิว (สูงสุด {MAX_QUEUE})
      </button>

      <p className="text-[11.5px] leading-relaxed text-text-faint">{meta.hint}</p>
    </aside>
  );
}
