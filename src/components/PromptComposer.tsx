import { useEffect, useRef, useState } from "react";
import {
  BookmarkPlus, Check, ChevronDown, Layers3, LayoutTemplate, PanelBottom, PanelLeft, PenLine,
  Sparkles, Trash2, WandSparkles, Wand2, X,
} from "lucide-react";
import { INFOGRAPHIC_STRUCTURAL_PRESETS, MODE_META, PROMPT_LENGTH_WARN } from "../lib/constants";
import {
  applyInfographicPreset, applyOptimizedPrompt, canRunBakeOff, clearOptimize, dedupPromptKeywords, deleteUserTemplate,
  generate, insertTemplateText, modelsForMode, openBakeOffConfirm, runOptimize, saveCurrentPromptAsTemplate, setPrompt,
  setPromptPlacement, templatesForMode, toggleKeyword,
} from "../lib/actions";
import { useApp } from "../lib/store";
import type { PromptPlacement } from "../lib/types";
import { hasKeyword } from "../lib/utils";
import { ExplainedChip } from "./ExplainedChip";

interface PromptComposerProps {
  placement: PromptPlacement;
}

/**
 * ปุ่ม "Templates" + dropdown เหนือช่อง prompt — โครง prompt สำเร็จรูป (built-in), template ที่ผู้ใช้เซฟเอง
 * และ (เฉพาะโหมด infographic) structural preset ที่ตั้ง ratio + toggle keyword ให้ด้วย
 * แทรกเข้า prompt ที่ตำแหน่ง cursor เสมอ — ไม่ทับข้อความที่พิมพ์ไว้อยู่แล้ว
 */
function TemplatesMenu({ inputRef, isCenter }: { inputRef: React.RefObject<HTMLTextAreaElement | null>; isCenter: boolean }) {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");

  const templates = templatesForMode(s.mode);
  const userTemplates = s.modes[s.mode].userTemplates;
  const isInfographic = s.mode === "infographic";

  const cursorPos = () => inputRef.current?.selectionStart ?? null;

  const apply = (text: string) => {
    const pos = cursorPos();
    const input = inputRef.current;
    const newPos = insertTemplateText(text, pos);
    setOpen(false);
    // คืน focus + วาง cursor ต่อท้ายข้อความที่เพิ่งแทรก ให้พิมพ์ต่อได้ทันที
    window.setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const applyPreset = (id: string) => {
    const preset = INFOGRAPHIC_STRUCTURAL_PRESETS.find(p => p.id === id);
    if (!preset) return;
    const pos = cursorPos();
    applyInfographicPreset(preset, pos);
    setOpen(false);
  };

  const submitSave = () => {
    if (!label.trim()) return;
    saveCurrentPromptAsTemplate(label);
    setLabel("");
    setSaving(false);
  };

  return (
    <div className={"relative " + (isCenter ? "mb-1 shrink-0" : "")}>
      <button
        type="button"
        className={
          "flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border-strong text-xs font-semibold text-text-dim transition-colors hover:border-text hover:text-text " +
          (isCenter ? "h-9 px-3" : "w-full justify-center py-[9px]")
        }
        onClick={() => setOpen(v => !v)}
      >
        <LayoutTemplate size={13} /> {!isCenter && "Templates"} <ChevronDown size={11} className={"transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSaving(false); }} />
          <div className={
            "absolute z-50 max-h-[min(60vh,420px)] w-[300px] overflow-y-auto rounded-[10px] border border-border-strong bg-surface p-2.5 shadow-[0_16px_60px_rgba(0,0,0,.18)] " +
            (isCenter ? "bottom-[calc(100%+8px)] left-0" : "left-0 top-[calc(100%+6px)]")
          }>
            <div className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[.5px] text-text-faint">โครง Prompt สำเร็จรูป</div>
            <div className="flex flex-col gap-1">
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-border-strong"
                  onClick={() => apply(tpl.text)}
                >
                  <span className="text-[11.5px] font-semibold text-text">{tpl.label}</span>
                  <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-text-faint">{tpl.text}</span>
                </button>
              ))}
            </div>

            {userTemplates.length > 0 && (
              <div className="mt-1 flex flex-col gap-1">
                {userTemplates.map(tpl => (
                  <div key={tpl.id} className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 pl-2.5 pr-1.5 py-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 py-1 text-left"
                      onClick={() => apply(tpl.text)}
                    >
                      <span className="text-[11.5px] font-semibold text-text">{tpl.label}</span>
                      <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-text-faint">{tpl.text}</span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer p-1 text-text-faint hover:text-danger"
                      title="ลบ template นี้"
                      onClick={() => deleteUserTemplate(s.mode, tpl.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isInfographic && (
              <>
                <div className="mb-1.5 mt-2.5 px-1 text-[10.5px] font-semibold uppercase tracking-[.5px] text-text-faint">Structural Preset</div>
                <div className="flex flex-col gap-1">
                  {INFOGRAPHIC_STRUCTURAL_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-border-strong"
                      onClick={() => applyPreset(preset.id)}
                    >
                      <span className="text-[11.5px] font-semibold text-text">{preset.label}</span>
                      <span className="text-[10.5px] text-text-faint">ตั้ง ratio {preset.ratio} + จัดโครงสร้าง + toggle keyword ที่เกี่ยวข้อง</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mt-2.5 border-t border-border pt-2.5">
              {saving ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") submitSave(); if (e.key === "Escape") setSaving(false); }}
                    placeholder="ตั้งชื่อ template…"
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[11.5px] text-text outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!label.trim()}
                    onClick={submitSave}
                  >
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-[7px] text-[11.5px] font-semibold text-text-dim transition-colors hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!s.modes[s.mode].prompt.trim()}
                  onClick={() => setSaving(true)}
                >
                  <BookmarkPlus size={12} /> Save as Template
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PromptComposer({ placement }: PromptComposerProps) {
  const s = useApp();
  const ms = s.modes[s.mode];
  const meta = MODE_META[s.mode];
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isCenter = placement === "center";
  const hasPrompt = !!ms.prompt.trim();
  const canGenerate = !!s.apiKey && modelsForMode(s.mode).length > 0 && (hasPrompt || ms.queue.length > 0);
  const generatingCount = ms.images.filter(x => x.status === "loading").length;
  // Bake-off (PHASE 14) เปลี่ยนพฤติกรรมปุ่ม Generate — เปิดโมดัลยืนยันราคาแทนยิงตรง (ดู Sidebar สำหรับ toggle/เลือกโมเดล)
  const bakeOffActive = ms.bakeOffEnabled;
  const canGenerateOrBakeOff = bakeOffActive ? canRunBakeOff() : canGenerate;
  const runGenerate = bakeOffActive ? openBakeOffConfirm : generate;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (isCenter) {
      input.style.height = "auto";
      input.style.height = Math.min(Math.max(input.scrollHeight, 52), 160) + "px";
    }
  }, [isCenter]);

  const resizeCenterInput = (input: HTMLTextAreaElement) => {
    if (!isCenter) return;
    input.style.height = "auto";
    input.style.height = Math.min(Math.max(input.scrollHeight, 52), 160) + "px";
  };

  const move = () => {
    const target = isCenter ? "sidebar" : "center";
    setPromptPlacement(target);
    window.setTimeout(() => {
      const input = document.querySelector<HTMLTextAreaElement>(
        target === "sidebar" ? "#prompt-sidebar-input" : "[data-center-prompt]",
      );
      input?.focus();
      if (target === "sidebar") input?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  };

  const optimizePanel = (s.optimize.status === "done" || s.optimize.status === "error") && (
    <div className={
      "flex flex-col gap-2.5 rounded-[10px] border border-border-strong bg-surface p-3 " +
      (isCenter ? "max-h-[min(50vh,420px)] overflow-y-auto shadow-[0_16px_60px_rgba(0,0,0,.16)]" : "")
    }>
      {s.optimize.status === "error" ? (
        <>
          <div className="text-xs leading-normal text-danger">{s.optimize.error}</div>
          <button className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text" aria-label="ปิดผล Optimize" onClick={clearOptimize}>
            <X size={12} /> ปิด
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
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.8px] text-text-faint">Keyword แนะนำ</div>
              <div className="flex flex-wrap gap-1.5">
                {s.optimize.result.keywords.map(kw => (
                  <ExplainedChip
                    key={kw.text}
                    item={kw}
                    active={hasKeyword(ms.prompt, kw.text)}
                    onClick={() => toggleKeyword(kw.text)}
                  />
                ))}
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-semibold text-accent-ink transition-opacity hover:opacity-90" aria-label="ใช้ prompt ที่จูนแล้ว" onClick={applyOptimizedPrompt}>
              <Check size={13} /> ใช้ Prompt นี้
            </button>
            <button className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text" aria-label="ยกเลิกผล Optimize" onClick={clearOptimize}>
              <X size={13} /> ยกเลิก
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (!isCenter) {
    return (
      <div id="prompt-sidebar">
        <div className="mb-[9px] flex items-center justify-between gap-2">
          <label htmlFor="prompt-sidebar-input" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[1.2px] text-text-dim"><PenLine size={12} /> Prompt</label>
          {/* มี label กำกับ ไม่ใช่ไอคอนเปล่า — ปุ่มนี้เคยเป็นไอคอนอย่างเดียวข้างคำว่า "Prompt"
              จนดูเหมือนปุ่มหลงทาง ผู้ใช้ส่วนใหญ่ไม่รู้เลยว่าย้ายกล่อง prompt ได้ */}
          <button
            type="button"
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ย้ายกล่อง Prompt ไปลอยกลางจอ (กว้างขึ้น เห็น Gallery เต็มตา)"
            aria-label="ย้าย Prompt ไปกลาง Gallery"
            onClick={move}
          >
            <PanelBottom size={13} /> ย้ายไปกลางจอ
          </button>
        </div>
        <div className="mb-[9px]">
          <TemplatesMenu inputRef={inputRef} isCenter={false} />
        </div>
        <textarea
          ref={inputRef}
          id="prompt-sidebar-input"
          value={ms.prompt}
          placeholder={meta.placeholder}
          aria-label="Prompt"
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape" && s.optimize.status !== "idle") clearOptimize();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canGenerateOrBakeOff) runGenerate();
            }
          }}
          className="min-h-[110px] w-full resize-y rounded-card border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className={
              "text-[10.5px] leading-normal " +
              (ms.prompt.length > PROMPT_LENGTH_WARN ? "font-semibold text-danger" : "text-text-faint")
            }
            title="ตัวเลขนี้นับเฉพาะข้อความในกล่อง — ตอนส่งจริงจะมีคำกำกับ ref/aspect ratio ต่อท้ายเพิ่มที่ไม่โชว์ตรงนี้"
          >
            ~{ms.prompt.length} ตัวอักษร{ms.prompt.length > PROMPT_LENGTH_WARN ? " (ยาวมากแล้วนะคะ)" : ""}
          </span>
          <button
            type="button"
            className="flex shrink-0 cursor-pointer items-center gap-1 text-[10.5px] font-semibold text-text-faint transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
            title="ตัดวลีที่คั่นด้วย comma แล้วซ้ำกันออกจาก prompt"
            disabled={!hasPrompt}
            onClick={dedupPromptKeywords}
          >
            <WandSparkles size={11} /> ล้าง keyword ซ้ำ
          </button>
        </div>
        <button
          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-[9px] text-xs font-semibold text-text-dim transition-colors hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
          disabled={!hasPrompt || s.optimize.status === "loading"}
          aria-label="Optimize Prompt"
          onClick={runOptimize}
        >
          <Wand2 size={13} />
          {s.optimize.status === "loading" ? "กำลังจูน Prompt…" : "Optimize"}
        </button>
        {(s.optimize.status === "done" || s.optimize.status === "error") && <div className="mt-2.5">{optimizePanel}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {optimizePanel}
      <div className="rounded-2xl border border-border-strong bg-surface/70 p-2.5 shadow-[0_18px_70px_rgba(0,0,0,.18)] backdrop-blur-xl">
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="mb-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[9px] border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ย้ายกลับ Sidebar"
            aria-label="ย้าย Prompt กลับ Sidebar"
            onClick={move}
          >
            <PanelLeft size={15} />
          </button>
          <TemplatesMenu inputRef={inputRef} isCenter />
          <textarea
            ref={inputRef}
            data-center-prompt
            rows={2}
            value={ms.prompt}
            placeholder={meta.placeholder}
            aria-label="Prompt"
            onChange={e => {
              setPrompt(e.target.value);
              resizeCenterInput(e.target);
            }}
            onKeyDown={e => {
              if (e.key === "Escape" && s.optimize.status !== "idle") clearOptimize();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canGenerateOrBakeOff) runGenerate();
              }
            }}
            className="max-h-40 min-h-[52px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[13.5px] leading-relaxed text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent"
          />
          <button
            type="button"
            className="mb-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[9px] border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
            title="Optimize Prompt"
            aria-label="Optimize Prompt"
            disabled={!hasPrompt || s.optimize.status === "loading"}
            onClick={runOptimize}
          >
            <Wand2 size={15} className={s.optimize.status === "loading" ? "animate-pulse" : ""} />
          </button>
          <button
            type="button"
            className="mb-1 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] bg-accent px-4 text-xs font-bold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 max-[520px]:px-3"
            disabled={!canGenerateOrBakeOff}
            aria-label={
              !s.apiKey
                ? "Generate ปิดใช้งานอยู่ — ต้องใส่ OpenRouter API Key ก่อน กดปุ่ม \"ใส่ API Key\" ที่ header ด้านบนขวา"
                : (generatingCount > 0 ? `กำลัง generate ${generatingCount} งานอยู่ — กดปุ่มนี้ซ้ำได้เรื่อยๆ เพื่อสร้างงานใหม่เพิ่มเข้าคิวพร้อมกัน ไม่ต้องรอให้เสร็จก่อน · ` : "")
                  + (bakeOffActive
                    ? `Generate Bake-off (${ms.bakeOffModelIds.length} โมเดล)`
                    : ms.queue.length ? `Generate ทั้งคิว (${ms.queue.length} งาน)` : "Generate ภาพ/วิดีโอจาก prompt ปัจจุบัน")
            }
            onClick={runGenerate}
          >
            {bakeOffActive ? <Layers3 size={14} /> : <Sparkles size={14} />}
            {bakeOffActive
              ? `Generate Bake-off (${ms.bakeOffModelIds.length})`
              : ms.queue.length ? `Generate Queue (${ms.queue.length})` : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
