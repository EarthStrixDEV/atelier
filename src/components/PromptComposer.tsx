import { useEffect, useRef } from "react";
import { PanelBottom, PanelLeft, Sparkles } from "lucide-react";
import { MODE_META } from "../lib/constants";
import {
  applyOptimizedPrompt, clearOptimize, generate, modelsForMode,
  runOptimize, setPrompt, setPromptPlacement, toggleKeyword,
} from "../lib/actions";
import { useApp } from "../lib/store";
import type { PromptPlacement } from "../lib/types";
import { hasKeyword } from "../lib/utils";

interface PromptComposerProps {
  placement: PromptPlacement;
}

export default function PromptComposer({ placement }: PromptComposerProps) {
  const s = useApp();
  const ms = s.modes[s.mode];
  const meta = MODE_META[s.mode];
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isCenter = placement === "center";
  const hasPrompt = !!ms.prompt.trim();
  const canGenerate = !!s.apiKey && modelsForMode(s.mode).length > 0 && (hasPrompt || ms.queue.length > 0);

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
      (isCenter ? "max-h-[min(50vh,420px)] overflow-y-auto shadow-[0_16px_60px_rgba(0,0,0,.55)]" : "")
    }>
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
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.8px] text-text-faint">Keyword แนะนำ</div>
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
              ใช้ Prompt นี้
            </button>
            <button className="flex-1 cursor-pointer rounded-lg border border-border py-2 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text" onClick={clearOptimize}>
              ยกเลิก
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
          <label htmlFor="prompt-sidebar-input" className="text-[11px] font-semibold uppercase tracking-[1.2px] text-text-dim">Prompt</label>
          <button
            type="button"
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ย้ายไปกลาง Gallery"
            aria-label="ย้าย Prompt ไปกลาง Gallery"
            onClick={move}
          >
            <PanelBottom size={13} />
          </button>
        </div>
        <textarea
          ref={inputRef}
          id="prompt-sidebar-input"
          value={ms.prompt}
          placeholder={meta.placeholder}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape" && s.optimize.status !== "idle") clearOptimize();
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
          {s.optimize.status === "loading" ? "กำลังจูน Prompt…" : "Optimize"}
        </button>
        {(s.optimize.status === "done" || s.optimize.status === "error") && <div className="mt-2.5">{optimizePanel}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {optimizePanel}
      <div className="rounded-2xl border border-border-strong bg-surface/95 p-2.5 shadow-[0_18px_70px_rgba(0,0,0,.65)] backdrop-blur-xl">
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
          <textarea
            ref={inputRef}
            data-center-prompt
            rows={2}
            value={ms.prompt}
            placeholder={meta.placeholder}
            onChange={e => {
              setPrompt(e.target.value);
              resizeCenterInput(e.target);
            }}
            onKeyDown={e => {
              if (e.key === "Escape" && s.optimize.status !== "idle") clearOptimize();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canGenerate) generate();
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
            <Sparkles size={15} className={s.optimize.status === "loading" ? "animate-pulse" : ""} />
          </button>
          <button
            type="button"
            className="mb-1 h-9 shrink-0 cursor-pointer rounded-[9px] bg-accent px-4 text-xs font-bold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 max-[520px]:px-3"
            disabled={!canGenerate}
            onClick={generate}
          >
            {ms.queue.length ? `Generate Queue (${ms.queue.length})` : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
