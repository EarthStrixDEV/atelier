import { useEffect, useRef, useState } from "react";
import { mutate, toast, useApp } from "../lib/store";

export default function KeyModal() {
  const s = useApp();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (s.keyModalOpen) {
      setValue(s.apiKey);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.keyModalOpen]);

  if (!s.keyModalOpen) return null;

  const save = () => {
    const v = value.trim();
    mutate(st => { st.apiKey = v; st.keyModalOpen = false; });
    if (v) toast("บันทึก API Key แล้วค่ะ");
  };
  const close = () => mutate(st => { st.keyModalOpen = false; });

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="w-[min(440px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-7">
        <h3 className="mb-1.5 text-base font-bold">OpenRouter API Key</h3>
        <p className="mb-[18px] text-[12.5px] leading-relaxed text-text-dim">
          สร้าง key ได้ที่ <a className="text-text underline" href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>
        </p>
        <input
          ref={inputRef}
          type="password"
          placeholder="sk-or-v1-…"
          autoComplete="off"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); }}
          className="w-full rounded-card border border-border bg-bg px-3 py-2.5 text-[13px] text-text outline-none transition-colors focus:border-accent"
        />
        <div className="mt-4 flex gap-2.5">
          <button className="flex-1 cursor-pointer rounded-[9px] border border-border py-[11px] text-[13px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text" onClick={close}>
            ยกเลิก
          </button>
          <button className="flex-1 cursor-pointer rounded-[9px] bg-accent py-[11px] text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90" onClick={save}>
            บันทึก
          </button>
        </div>
        <p className="mt-3.5 text-[11px] leading-relaxed text-text-faint">
          Key เก็บไว้ในหน่วยความจำของหน้านี้เท่านั้น ไม่ถูกบันทึกลงเครื่องหรือส่งไปที่อื่นนอกจาก OpenRouter — ปิดหน้าแล้วต้องใส่ใหม่ค่ะ
        </p>
      </div>
    </div>
  );
}
