import { useEffect, useRef, useState } from "react";
import { Check, Flame, Lightbulb, Plus, RotateCcw, Send, X } from "lucide-react";
import { modeLabel } from "../lib/constants";
import {
  applyGrillPrompt, closeGrill, finishGrill, openGrill, queueGrillPrompt,
  resetGrill, sendGrillAnswer,
} from "../lib/actions";
import { useApp } from "../lib/store";

/**
 * Grill me — LLM สัมภาษณ์ผู้ใช้ทีละคำถามจนข้อมูลพอ แล้วตกผลึกเป็นชุด prompt หลายมุมมอง
 * แผงลอยตำแหน่งเดียวกับ ChatPanel (เปิดพร้อมกันไม่ได้ — openGrill ปิด chat ให้)
 */
export default function GrillPanel() {
  const s = useApp();
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.grillMessages.length, s.grillPending, s.grillOpen, s.grillResult]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && s.grillOpen) closeGrill();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s.grillOpen]);

  const send = () => {
    const t = input.trim();
    if (!t || s.grillPending || s.grillResult) return;
    setInput("");
    sendGrillAnswer(t);
  };

  if (!s.grillOpen) {
    return (
      <button
        className="fixed bottom-[88px] right-6 z-150 grid h-[52px] w-[52px] cursor-pointer place-items-center rounded-full border border-border-strong bg-surface text-text shadow-[0_8px_30px_rgba(0,0,0,.16)] transition-transform hover:scale-106"
        title="Grill me — ให้ AI สัมภาษณ์แล้วตกผลึกเป็นชุด prompt"
        onClick={() => {
          openGrill();
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <Flame size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-160 flex h-[min(560px,calc(100vh-48px))] w-[min(380px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_20px_80px_rgba(0,0,0,.14)] max-[480px]:bottom-3 max-[480px]:right-3 max-[480px]:w-[calc(100vw-24px)]">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-2 text-[13.5px]">
          <Flame size={15} />
          <strong>Grill me</strong>
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-text-faint">{modeLabel(s.mode)}</span>
        </div>
        <div className="flex gap-1.5">
          {s.grillMessages.length > 0 && !s.grillResult && (
            <button
              className="flex cursor-pointer items-center gap-1 rounded-[7px] border border-accent/60 px-2 py-1 text-[11px] font-semibold text-text transition-colors hover:bg-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"
              title="พอแล้ว สรุปเป็นชุด prompt เลย"
              disabled={s.grillPending}
              onClick={finishGrill}
            >
              <Lightbulb size={11} /> ตกผลึกเลย
            </button>
          )}
          {s.grillMessages.length > 0 && (
            <button
              className="flex cursor-pointer items-center gap-1 rounded-[7px] border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-border-strong hover:text-text"
              title="ล้างบทสนทนา เริ่มสัมภาษณ์ใหม่"
              onClick={resetGrill}
            >
              <RotateCcw size={11} /> เริ่มใหม่
            </button>
          )}
          <button
            className="cursor-pointer rounded-[7px] border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ปิด"
            onClick={closeGrill}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {!s.grillMessages.length && (
          <div className="text-[12.5px] leading-relaxed text-text-dim">
            เล่าไอเดียคร่าวๆ ที่อยากสร้างมาก่อนเลยค่ะ แล้วหนูจะถามเจาะทีละข้อ
            พอข้อมูลครบหนูจะตกผลึกเป็นชุด prompt หลายมุมมองให้เลือกใช้ค่ะ~
            (กด &quot;ตกผลึกเลย&quot; ได้ทุกเมื่อถ้าอยากจบเร็ว)
          </div>
        )}
        {s.grillMessages.map((m, i) => (
          <div
            key={i}
            className={
              "max-w-[88%] whitespace-pre-wrap break-words rounded-xl px-[13px] py-[9px] text-[13px] leading-relaxed " +
              (m.role === "user"
                ? "self-end rounded-br-[4px] bg-accent text-accent-ink"
                : "self-start rounded-bl-[4px] border border-border bg-surface-2")
            }
          >
            {m.content}
          </div>
        ))}
        {s.grillPending && (
          <div className="max-w-[88%] self-start rounded-xl rounded-bl-[4px] border border-border bg-surface-2 px-[13px] py-[9px] text-[13px] italic text-text-faint">
            กำลังคิด…
          </div>
        )}

        {/* ผลตกผลึก — ชุด prompt หลายมุมมอง */}
        {s.grillResult && (
          <div className="flex flex-col gap-2.5">
            {s.grillResult.map((p, i) => (
              <div key={i} className="rounded-[10px] border border-border-strong bg-surface-2 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-text-dim">{p.title}</div>
                <div className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-text">
                  {p.prompt}
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  <button
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-[11px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
                    onClick={() => applyGrillPrompt(p)}
                  >
                    <Check size={11} /> ใช้ prompt นี้
                  </button>
                  <button
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-[11px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
                    onClick={() => queueGrillPrompt(p)}
                  >
                    <Plus size={11} /> เพิ่มเข้าคิว
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!s.grillResult && (
        <div className="flex shrink-0 items-end gap-2 border-t border-border p-3">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="เล่าไอเดีย หรือพิมพ์คำตอบ…"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              const ta = e.target;
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            className="max-h-[100px] min-h-[36px] flex-1 resize-none rounded-[9px] border border-border bg-surface-2 px-[11px] py-2 text-[13px] leading-snug text-text outline-none transition-colors focus:border-accent"
          />
          <button
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-[9px] text-[12.5px] font-bold text-accent-ink disabled:cursor-not-allowed disabled:opacity-35"
            disabled={s.grillPending || !input.trim()}
            onClick={send}
          >
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
