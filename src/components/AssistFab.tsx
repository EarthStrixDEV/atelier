import { useEffect, useRef, useState } from "react";
import { Flame, MessageCircle, Sparkles, X } from "lucide-react";
import { openGrill } from "../lib/actions";
import { mutate, useApp } from "../lib/store";

/**
 * จุดเข้าเดียวของผู้ช่วย AI (R10) — เดิมมีปุ่มลอยสองปุ่มซ้อนกัน ("คุยกับ Atelier" / "ตกผลึกไอเดีย") ที่ผู้ใช้แยกไม่ออก
 * ว่าต่างกันยังไง ตอนนี้เหลือปุ่มเดียว กดแล้วเลือกพร้อมคำอธิบายสั้นๆ ว่าแต่ละตัวทำอะไร
 * ซ่อนตัวเองระหว่างที่แผง Chat/Grill เปิดอยู่ (แผงทั้งสองอยู่ตำแหน่งเดียวกับปุ่มนี้)
 *
 * แถบ prompt ลอยล่าง (center) กินความกว้างเต็ม main บนจอไม่กว้างพอ — ยกปุ่มขึ้นเหนือแถบ ไม่ให้ทับปุ่ม Generate
 */
export default function AssistFab() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ลิ้นชัก sidebar (จอแคบ) ทับทั้งจอ — ปุ่มนี้ z สูงกว่าจะลอยทับลิ้นชัก ซ่อนไปก่อน
  if (s.chatOpen || s.grillOpen || s.sidebarDrawerOpen) return null;

  const lift = s.promptPlacement === "center" ? "max-[1280px]:bottom-[104px] max-[520px]:bottom-[180px]" : "";
  const pick = (which: "chat" | "grill") => {
    setOpen(false);
    if (which === "grill") openGrill();
    else mutate(st => { st.chatOpen = true; st.grillOpen = false; }); // แผงซ้อนตำแหน่งเดียวกัน — เปิดทีละอัน
  };

  return (
    <div className={"fixed bottom-6 right-6 z-150 flex flex-col items-end gap-2 max-[480px]:right-3 " + lift}>
      {open && (
        <div role="menu" aria-label="เลือกผู้ช่วย AI" className="w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-border-strong bg-surface p-2 shadow-[0_16px_60px_rgba(0,0,0,.18)]">
          <button
            role="menuitem"
            autoFocus
            className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
            onClick={() => pick("chat")}
          >
            <MessageCircle size={18} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <span className="block text-[14px] font-semibold text-text">คุยกับ Atelier</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-text-dim">ถาม-ตอบอิสระ เช่น วิธีใช้แอป เลือกโมเดล หรือขอคำแนะนำ prompt</span>
            </span>
          </button>
          <button
            role="menuitem"
            className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
            onClick={() => pick("grill")}
          >
            <Flame size={18} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <span className="block text-[14px] font-semibold text-text">ตกผลึกไอเดีย</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-text-dim">ยังคิดไม่ออก? AI จะถามทีละข้อ แล้วสรุปเป็น prompt หลายแบบให้เลือกใช้</span>
            </span>
          </button>
        </div>
      )}
      <button
        ref={btnRef}
        className="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4.5 text-accent-ink shadow-[0_8px_30px_rgba(0,0,0,.16)] transition-transform hover:scale-106 max-[480px]:w-[52px] max-[480px]:px-0"
        aria-label={open ? "ปิดเมนูผู้ช่วย AI" : "เปิดผู้ช่วย AI — คุยกับ Atelier หรือตกผลึกไอเดีย"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <X size={22} className="shrink-0" /> : <Sparkles size={22} className="shrink-0" />}
        <span aria-hidden="true" className="whitespace-nowrap text-[13px] font-semibold max-[480px]:hidden">ผู้ช่วย AI</span>
      </button>
    </div>
  );
}
