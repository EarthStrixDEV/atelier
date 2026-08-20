import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Send, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { modeLabel } from "../lib/constants";
import { clearChatHistory, sendChatMessage } from "../lib/actions";
import { mutate, useApp } from "../lib/store";

// เรนเดอร์เฉพาะ element ที่จำเป็นสำหรับข้อความปรึกษา prompt — ปรับ margin ที่ react-markdown
// ใส่มาให้เป็นค่า default ให้เข้ากับ bubble ขนาดเล็ก (ไม่ให้ช่องว่างบน/ล่างเกินความจำเป็น)
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="[&:not(:last-child)]:mb-2">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-0.5">{children}</li>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">{children}</a>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-bg/60 px-1 py-0.5 font-mono text-[11.5px]">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-bg/60 p-2.5 font-mono text-[11.5px] leading-relaxed last:mb-0">{children}</pre>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
};

export default function ChatPanel() {
  const s = useApp();
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.chatMessages.length, s.chatPending, s.chatOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && s.chatOpen) mutate(st => { st.chatOpen = false; });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s.chatOpen]);

  const send = () => {
    const t = input.trim();
    if (!t || s.chatPending) return;
    setInput("");
    sendChatMessage(t);
  };

  if (!s.chatOpen) {
    return (
      <button
        className="fixed bottom-6 right-6 z-150 flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4.5 text-accent-ink shadow-[0_8px_30px_rgba(0,0,0,.16)] transition-transform hover:scale-106 max-[480px]:w-[52px] max-[480px]:px-0"
        title="Chat with Atelier — ที่ปรึกษาเรื่องสร้างภาพ/วิดีโอด้วย AI"
        aria-label="เปิด Chat with Atelier — คุยกับ Atelier"
        onClick={() => {
          mutate(st => { st.chatOpen = true; st.grillOpen = false; }); // แผงซ้อนตำแหน่งเดียวกัน — เปิดทีละอัน
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <MessageCircle size={22} className="shrink-0" />
        <span aria-hidden="true" className="text-[13px] font-semibold whitespace-nowrap max-[480px]:hidden">คุยกับ Atelier</span>
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="false" aria-label="Chat with Atelier" className="fixed bottom-6 right-6 z-160 flex h-[min(560px,calc(100vh-48px))] w-[min(380px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_20px_80px_rgba(0,0,0,.14)] max-[480px]:bottom-3 max-[480px]:right-3 max-[480px]:w-[calc(100vw-24px)]">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-2 text-[13.5px]">
          <Bot size={15} />
          <strong>Chat with Atelier</strong>
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-text-faint">{modeLabel(s.mode)}</span>
        </div>
        <div className="flex gap-1.5">
          <button
            className="flex cursor-pointer items-center gap-1 rounded-[7px] border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ล้างประวัติแชท"
            aria-label="ล้างประวัติแชท"
            onClick={clearChatHistory}
          >
            <Trash2 size={11} /> ล้าง
          </button>
          <button
            className="cursor-pointer rounded-[7px] border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ปิด"
            aria-label="ปิด Chat with Atelier"
            onClick={() => mutate(st => { st.chatOpen = false; })}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {!s.chatMessages.length && (
          <div className="text-[12.5px] leading-relaxed text-text-dim">
            หนูเป็นผู้ช่วยเรื่องสร้างภาพ/วิดีโอด้วย AI ค่ะ ถามได้เลยว่าอยากได้ prompt แบบไหน หรือปรึกษาเรื่อง style, mood, keyword ก็ได้นะคะ~
          </div>
        )}
        {s.chatMessages.map((m, i) => (
          <div
            key={i}
            className={
              "max-w-[88%] break-words rounded-xl px-[13px] py-[9px] text-[13px] leading-relaxed " +
              (m.role === "user"
                ? "self-end whitespace-pre-wrap rounded-br-[4px] bg-accent text-accent-ink"
                : "self-start rounded-bl-[4px] border border-border bg-surface-2")
            }
          >
            {m.role === "assistant"
              ? <ReactMarkdown components={markdownComponents}>{m.content}</ReactMarkdown>
              : m.content}
          </div>
        ))}
        {s.chatPending && (
          <div className="max-w-[88%] self-start rounded-xl rounded-bl-[4px] border border-border bg-surface-2 px-[13px] py-[9px] text-[13px] italic text-text-faint">
            กำลังพิมพ์…
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-border p-3">
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="พิมพ์คำถามหรือปรึกษาเรื่อง prompt…"
          aria-label="ข้อความแชท"
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
          disabled={s.chatPending || !input.trim()}
          aria-label="ส่งข้อความแชท"
          onClick={send}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
