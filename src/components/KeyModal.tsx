import { useEffect, useRef, useState } from "react";
import { Check, KeyRound, Settings, ShieldAlert, Trash2, X } from "lucide-react";
import { loadRememberApiKey, mutate, saveApiKey, state, toast, useApp } from "../lib/store";

export default function KeyModal() {
  const s = useApp();
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(loadRememberApiKey);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (s.keyModalOpen) {
      setValue(s.apiKey);
      setRemember(loadRememberApiKey());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.keyModalOpen]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // เตือนเฉพาะตอนที่ปิดแท็บแล้ว key จะหายจริงๆ — ถ้าผู้ใช้เลือกจำไว้ในเครื่องแล้ว
      // ไม่มีอะไรจะหาย การเด้ง dialog ทุกครั้งที่ refresh เป็นแค่ความรำคาญเปล่าๆ
      if (!state.apiKey || loadRememberApiKey()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  if (!s.keyModalOpen) return null;

  const save = () => {
    const v = value.trim();
    mutate(st => { st.apiKey = v; st.keyModalOpen = false; });
    saveApiKey(v, remember);
    if (v) toast(remember ? "บันทึก API Key ไว้ในเครื่องแล้วค่ะ" : "บันทึก API Key แล้วค่ะ");
  };
  const close = () => mutate(st => { st.keyModalOpen = false; });
  // ตั้งใจไม่ปิด modal (ต่างจาก save) เพราะคนที่กดลบมักตามด้วยการใส่ key ใหม่ทันที
  // — คืน focus ให้ช่องกรอกเพื่อสื่อว่าพิมพ์ต่อได้เลย ไม่ต้องเปิด modal ใหม่
  const remove = () => {
    setValue("");
    setRemember(false);
    mutate(st => { st.apiKey = ""; });
    // ส่ง remember=false เพื่อล้าง key ออกจากทั้ง localStorage และ sessionStorage พร้อมกัน
    saveApiKey("", false);
    toast("ลบ API Key ออกจากเครื่องแล้วค่ะ");
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-overlay backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="ตั้งค่า OpenRouter API Key" className="w-[min(440px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-7">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-base font-bold"><KeyRound size={16} /> OpenRouter API Key</h3>
        <p className="mb-[18px] text-[12.5px] leading-relaxed text-text-dim">
          สร้าง key ได้ที่ <a className="text-text underline" href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>
        </p>
        <input
          ref={inputRef}
          type="password"
          placeholder="sk-or-v1-…"
          autoComplete="off"
          aria-label="OpenRouter API Key"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); }}
          className="w-full rounded-card border border-border bg-bg px-3 py-2.5 text-[13px] text-text outline-none transition-colors focus:border-accent"
        />
        <label className="mt-3.5 flex cursor-pointer items-start gap-2.5 rounded-card border border-border bg-bg px-3 py-2.5 transition-colors hover:border-border-strong">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-text">จำ key นี้ไว้ในเครื่อง</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-text-faint">
              ไม่ต้องใส่ใหม่ทุกครั้งที่เปิดแอป — เลือกเฉพาะเครื่องส่วนตัวเท่านั้นนะคะ
            </span>
          </span>
        </label>

        {/* จองความสูงไว้ล่วงหน้า ไม่ให้แถวปุ่ม (ซึ่งมีปุ่มลบอยู่ด้วย) ขยับตอนติ๊ก/เอาติ๊กออก
            จนผู้ใช้กดพลาดปุ่มที่ไม่ได้ตั้งใจ */}
        <div className="mt-2 min-h-[58px]">
          {remember && (
            <p className="flex items-start gap-1.5 rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-danger">
              <ShieldAlert size={13} className="mt-px shrink-0" />
              <span>
                key จะถูกเก็บไว้ในเบราว์เซอร์ของเครื่องนี้จนกว่าจะกดลบ ใครที่เปิดเบราว์เซอร์นี้ได้ — รวมถึง
                extension หรือสคริปต์ที่รันอยู่ — ก็เข้าถึง key ได้ ห้ามใช้กับเครื่องสาธารณะหรือเครื่องที่ใช้ร่วมกับคนอื่นเด็ดขาดค่ะ
              </span>
            </p>
          )}
        </div>

        <div className="flex gap-2.5">
          <button className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-border py-[11px] text-[13px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text" aria-label="ยกเลิก ปิดหน้าต่างตั้งค่า API Key" onClick={close}>
            <X size={14} /> ยกเลิก
          </button>
          <button
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-border py-[11px] text-[13px] font-semibold text-danger transition-colors hover:border-danger disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="ลบ API Key"
            onClick={remove}
            disabled={!s.apiKey}
          >
            <Trash2 size={14} /> ลบ
          </button>
          <button className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] bg-accent py-[11px] text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90" aria-label="บันทึก API Key" onClick={save}>
            <Check size={14} /> บันทึก
          </button>
        </div>
        {/* พูดเป็นเงื่อนไข ("ถ้ากดบันทึก") ไม่ใช่ยืนยันสถานะ เพราะ remember เป็น local state ของ checkbox
            ที่ยังไม่ได้ persist — ถ้าเขียนว่า "เก็บไว้แล้ว" ผู้ใช้ที่ติ๊กแล้วกดยกเลิกจะเข้าใจผิดว่า key ถูกเซฟ */}
        <p className="mt-3.5 text-[11px] leading-relaxed text-text-faint">
          {remember
            ? "Key ไม่ถูกส่งไปที่อื่นนอกจาก OpenRouter — กดบันทึกแล้วจะถูกเก็บไว้ในเครื่องนี้จนกว่าจะกดลบ ปิดแท็บแล้วเปิดใหม่ก็ยังใช้ได้ค่ะ"
            : "Key เก็บไว้ใน session ของแท็บนี้เท่านั้น ไม่ถูกส่งไปที่อื่นนอกจาก OpenRouter — Refresh ได้สบาย แต่ปิดแท็บแล้วต้องใส่ใหม่ค่ะ ระบบจะเตือนก่อนปิดแท็บถ้ายังมี key อยู่"}
        </p>

        <div className="mt-4 border-t border-border pt-3.5">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-2 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-text hover:text-text"
            aria-label="เปิดหน้าตั้งค่าเพิ่มเติม — storage, โมเดลผู้ช่วย AI, เพิ่มโมเดลเอง"
            onClick={() => mutate(st => { st.keyModalOpen = false; st.settingsModalOpen = true; })}
          >
            <Settings size={13} /> ตั้งค่าเพิ่มเติม
          </button>
        </div>
      </div>
    </div>
  );
}
