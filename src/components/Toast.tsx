import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { TOAST_ROOT_ID } from "../lib/alerts";
import { useApp } from "../lib/store";
import type { ToastVariant } from "../lib/types";

/** ไอคอน + สีเส้นขอบซ้ายต่อ variant — คงโทน minimal ของแอปไว้ ไม่เปลี่ยนพื้นหลังทั้งก้อน */
const VARIANT_META: Record<ToastVariant, { Icon: typeof Info; iconClass: string; borderClass: string }> = {
  success: { Icon: CheckCircle2, iconClass: "text-accent", borderClass: "border-l-accent" },
  error: { Icon: AlertCircle, iconClass: "text-danger", borderClass: "border-l-danger" },
  info: { Icon: Info, iconClass: "text-text-dim", borderClass: "border-l-border-strong" },
};

/**
 * หา/สร้าง <div id="toast-root"> บน <body> — หา id ก่อนเสมอเพื่อให้เรียกซ้ำได้ (StrictMode รัน initializer สองรอบ)
 * ไม่ลบทิ้งตอน unmount: mount อื่นอาจยังใช้อยู่ และ node ว่างๆ ไม่มีผลเสีย
 * ต้องเป็นลูกตรงของ <body> เพราะ confirmAction ปลด aria-hidden ที่ Swal ใส่ให้ลูกของ body ด้วย id นี้
 */
function getToastRoot(): HTMLElement {
  let root = document.getElementById(TOAST_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = TOAST_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

export default function Toast() {
  const s = useApp();
  const [root] = useState(getToastRoot);
  const [visible, setVisible] = useState(false);
  // เก็บ msg/variant ที่ "กำลังโชว์" แยกจาก store — เคลียร์เป็นค่าว่างหลัง transition ซ่อนจบ
  // กัน screen reader ค้างอ่านข้อความเก่าซ้ำตอน toast ถูกซ่อนด้วย translate (element ยังอยู่ใน DOM ตลอดเพื่อให้ live region ทำงาน)
  const [display, setDisplay] = useState<{ msg: string; variant: ToastVariant }>({ msg: "", variant: "info" });

  useEffect(() => {
    if (!s.toast.msg) return;
    setDisplay({ msg: s.toast.msg, variant: s.toast.variant });
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(hideTimer);
  }, [s.toast.n, s.toast.msg, s.toast.variant]);

  useEffect(() => {
    if (visible) return;
    // รอ transition (duration-250) จบก่อนเคลียร์ข้อความจริง กัน flash ข้อความหายก่อนภาพเลื่อนลงสุด
    const clearTimer = setTimeout(() => setDisplay({ msg: "", variant: "info" }), 250);
    return () => clearTimeout(clearTimer);
  }, [visible]);

  const { Icon, iconClass, borderClass } = VARIANT_META[display.variant];

  // portal + z-[1100] สูงกว่า container ของ Swal (1060) — toast ต้องเห็น/ถูกประกาศได้ตอน dialog ยืนยันเปิดอยู่
  return createPortal(
    <div
      role="status"
      aria-live={display.variant === "error" ? "assertive" : "polite"}
      className={
        "fixed bottom-6 left-1/2 z-[1100] flex max-w-[80vw] -translate-x-1/2 items-center gap-2 rounded-[14px] border border-border-strong border-l-4 bg-surface px-5 py-[11px] text-[13px] shadow-[0_8px_24px_rgba(0,0,0,.14)] text-text transition-transform duration-250 " +
        borderClass + " " +
        (visible ? "translate-y-0" : "translate-y-[80px]")
      }
    >
      <Icon size={15} className={iconClass + " shrink-0"} aria-hidden="true" />
      <span>{display.msg}</span>
    </div>,
    root,
  );
}
