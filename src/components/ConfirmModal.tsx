import { useEffect, useRef } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { t } from "../lib/i18n";

export interface ConfirmRequest {
  title: string;
  /** ข้อความหลัก — ขึ้นบรรทัดใหม่ด้วย \n ได้ (whitespace-pre-line) */
  body: string;
  /** ประโยคเตือนเพิ่ม (เช่น "จะลบบน Cloud ถาวร") — แสดงเป็นแถบสี danger แยกจาก body */
  warning?: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * โมดัลยืนยันการกระทำแบบ destructive — props-driven (ผู้เรียกถือ state เอง) ไม่ผูก AppState
 * layout/โทเคนเดียวกับ SpendGuardModal/BakeOffConfirmModal; โฟกัสปุ่มยกเลิกตอนเปิด (Enter ตามนิสัยต้องไม่ลบ)
 * Escape / คลิกนอกกรอบ / X = ยกเลิก; Tab วนอยู่ในกรอบ และคืนโฟกัสให้ปุ่มที่เปิดโมดัลตอนปิด
 */
export default function ConfirmModal({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = setTimeout(() => cancelRef.current?.focus(), 50);
    // capture บน window = ได้ก่อนทุก listener — stopPropagation กันปุ่มลัด global (เลข 1..N สลับโหมด ฯลฯ)
    // ทำงานใต้โมดัล ไม่งั้นสลับโหมดแล้วกดยืนยันจะไปลบของอีกโหมด; Enter/Space บนปุ่มยังคลิกได้ (default action)
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [request, onClose]);

  if (!request) return null;

  const confirm = () => {
    onClose();
    request.onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-overlay backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-body"
        className="w-[min(440px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-6"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 id="confirm-modal-title" className="flex items-center gap-1.5 text-base font-bold text-text">
            <Trash2 size={16} className="shrink-0 text-danger" /> {request.title}
          </h3>
          <button
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title={t("gallery.delete.cancel")}
            aria-label={t("gallery.delete.cancel")}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <div id="confirm-modal-body">
          <p className="mb-4 whitespace-pre-line text-[12.5px] leading-relaxed text-text-dim">{request.body}</p>
          {request.warning && (
            <p className="mb-4 flex items-start gap-2 rounded-[10px] border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {request.warning}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-danger py-2.5 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
            onClick={confirm}
          >
            <Trash2 size={14} /> {request.confirmLabel}
          </button>
          <button
            ref={cancelRef}
            className="flex w-full cursor-pointer items-center justify-center rounded-lg py-1.5 text-[12px] font-medium text-text-faint transition-colors hover:text-text"
            onClick={onClose}
          >
            {t("gallery.delete.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
