import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Plus, Sparkles } from "lucide-react";
import {
  COUNTS, DURATIONS, KEYWORDS_BY_MODE, MAX_QUEUE, MODE_META, RATIOS,
} from "../lib/constants";
import {
  addToQueue, applyOptimizedPrompt, clearOptimize, computeItemCost, currentModel,
  generate, loadModels, loadVideoModels, modelsForMode, removeFromHistory,
  removeFromQueue, runOptimize, selectModel, setPrompt, toggleKeyword,
  usePromptFromHistory,
} from "../lib/actions";
import { mutate, useApp } from "../lib/store";
import { hasKeyword, videoPricePerSec } from "../lib/utils";

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;
const SIDEBAR_W_KEY = "atelier_sidebar_w";

const fieldLabel = "block text-[11px] font-semibold uppercase tracking-[1.2px] text-text-dim mb-[9px]";
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
  const isVideo = s.mode === "video";
  const model = currentModel();
  const list = modelsForMode(s.mode);

  const [width, setWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(SIDEBAR_W_KEY) ?? "", 10);
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 320;
  });
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

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
  const done = ms.images.filter(x => x.status === "done");
  const byModel = new Map<string, number>();
  let usageTotal = 0;
  let hasUnknown = false;
  for (const item of done) {
    const cost = computeItemCost(item);
    if (cost == null) { hasUnknown = true; continue; }
    usageTotal += cost;
    byModel.set(item.modelName, (byModel.get(item.modelName) || 0) + cost);
  }
  const usageRows = [...byModel.entries()].sort((a, b) => b[1] - a[1]);
  const usageMax = usageRows[0]?.[1] || 1;

  // capability ของโมเดลวิดีโอ — ใช้ disable ปุ่ม (การ snap ค่าเกิดใน applyVideoCapabilities แล้ว)
  const durs = isVideo && model?.supported_durations?.length ? model.supported_durations : null;
  const vRatios = isVideo && model?.supported_aspect_ratios?.length ? model.supported_aspect_ratios : null;
  const audioOk = isVideo && !!model?.generate_audio;

  const sourceLoaded = isVideo ? s.videoModels.length > 0 : s.models.length > 0;
  const sourceFailed = isVideo ? s.videoModelsFailed : s.modelsFailed;
  const hasPrompt = !!ms.prompt.trim();
  const canGenerate = !!s.apiKey && list.length > 0 && (hasPrompt || ms.queue.length > 0);

  let modelMeta = "";
  if (model) {
    if (isVideo) {
      const pps = videoPricePerSec(model, ms.audio);
      modelMeta = model.id + (pps != null ? "  ·  ~$" + (pps * ms.duration).toFixed(2) + " / คลิป " + ms.duration + " วิ" : "");
    } else {
      const p = model.pricing?.image && parseFloat(model.pricing.image) > 0
        ? "$" + (parseFloat(model.pricing.image) * 1000).toFixed(3).replace(/\.?0+$/, "") + " / 1k img"
        : null;
      modelMeta = model.id + (p ? "  ·  " + p : "");
    }
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

      {/* Prompt + Optimizer */}
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
                {s.optimize.result.prompt}
              </div>
              {s.optimize.result.keywords.length > 0 && (
                <>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.8px] text-text-faint">Keyword แนะนำ (กดเพื่อเพิ่มเข้า prompt ปัจจุบัน)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.optimize.result.keywords.map(kw => (
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

      {/* Prompt history */}
      {ms.history.length > 0 && (
        <details className="kw-group overflow-hidden rounded-lg border border-border bg-surface">
          <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-[9px] text-[11px] font-semibold tracking-[.5px] text-text-dim transition-colors hover:text-text">
            <span className="flex items-center gap-1.5"><Clock size={11} /> Prompt History ({ms.history.length})</span>
          </summary>
          <div className="flex flex-col gap-1.5 px-3 pb-3 pt-0.5">
            {ms.history.map(p => (
              <div key={p} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-[7px] pl-[11px] pr-2">
                <button
                  className="min-w-0 flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap text-left text-[11.5px] text-text-dim hover:text-text"
                  title={p}
                  onClick={() => usePromptFromHistory(p)}
                >
                  {p}
                </button>
                <button
                  className="shrink-0 cursor-pointer px-1 py-0.5 text-xs text-text-faint hover:text-danger"
                  title="ลบออกจากประวัติ"
                  onClick={() => removeFromHistory(s.mode, p)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Prompt builder */}
      <div>
        <label className={fieldLabel}>Prompt Builder</label>
        <div>
          {KEYWORDS_BY_MODE[s.mode].map((group, i) => (
            <details key={group.label} className="kw-group mt-[7px] overflow-hidden rounded-lg border border-border bg-surface first:mt-0" open={i === 0}>
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
      </div>

      {/* Model */}
      <div>
        <label htmlFor="model" className={fieldLabel}>Model</label>
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
              list.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)
            )}
          </select>
        </div>
        {modelMeta && <div className="mt-[7px] font-mono text-[11px] leading-normal text-text-faint">{modelMeta}</div>}
      </div>

      {/* Usage bar */}
      {usageRows.length > 0 && (
        <div>
          <label className={fieldLabel}>
            Usage <span className="normal-case tracking-normal">~${usageTotal.toFixed(4)}{hasUnknown ? " (บางโมเดลไม่ทราบราคา)" : ""}</span>
          </label>
          <div className="flex flex-col gap-2">
            {usageRows.map(([name, cost]) => (
              <div key={name}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-text-dim" title={name}>{name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-text-faint">${cost.toFixed(4)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: (cost / usageMax) * 100 + "%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aspect ratio */}
      <div>
        <label className={fieldLabel}>Aspect Ratio</label>
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
      </div>

      {/* Duration (video) */}
      {isVideo && (
        <div>
          <label className={fieldLabel}>Duration</label>
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
          <label className={fieldLabel}>Audio</label>
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
        </div>
      )}

      {/* Count */}
      <div>
        <label className={fieldLabel}>{meta.countLabel}</label>
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
          <label className={fieldLabel}>Queue <span className="normal-case tracking-normal">{ms.queue.length}/{MAX_QUEUE}</span></label>
          <div className="flex flex-col gap-1.5">
            {ms.queue.map((q, i) => (
              <div key={i} className="flex items-center gap-[9px] rounded-lg border border-border bg-surface px-2.5 py-2">
                <span className="shrink-0 font-mono text-[10px] text-text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-text">{q.prompt}</div>
                  <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-text-faint">
                    {q.modelName} · {q.ratio}
                    {isVideo && <> · {q.duration}s{q.audio ? " 🔊" : ""}</>}
                    {" · ×"}{q.count}
                  </div>
                </div>
                <button
                  className="shrink-0 cursor-pointer px-1 py-0.5 text-[13px] text-text-faint transition-colors hover:text-danger"
                  title="ลบออกจากคิว"
                  onClick={() => removeFromQueue(i)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate + queue buttons */}
      <button
        className="mt-0.5 w-full cursor-pointer rounded-card bg-accent py-[13px] text-sm font-bold tracking-[0.3px] text-accent-ink transition-all hover:opacity-90 active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-35"
        disabled={!canGenerate}
        onClick={generate}
      >
        {ms.queue.length ? `Generate Queue (${ms.queue.length})` : "Generate"}
      </button>
      <button
        className="-mt-3 flex w-full cursor-pointer items-center justify-center gap-1 rounded-card border border-dashed border-border-strong py-2.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
        disabled={!(list.length > 0 && hasPrompt && ms.queue.length < MAX_QUEUE)}
        onClick={addToQueue}
      >
        <Plus size={13} /> เพิ่มเข้าคิว (สูงสุด {MAX_QUEUE})
      </button>

      <p className="text-[11.5px] leading-relaxed text-text-faint">{meta.hint}</p>
    </aside>
  );
}
