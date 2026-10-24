import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { t } from "./i18n";

/** id ของ container toast (Task 3 สร้าง) — Swal ใส่ aria-hidden ให้ลูกทุกตัวของ <body> ต้องปลดของ toast ออกตอนเปิด */
export const TOAST_ROOT_ID = "toast-root";

export interface ConfirmOptions {
  title: string;
  /** ข้อความหลัก — ขึ้นบรรทัดใหม่ด้วย \n ได้ (whitespace-pre-line) */
  body: string;
  /** ประโยคเตือนเพิ่ม (เช่น "จะลบบน Cloud ถาวร") — แสดงเป็นแถบสี danger แยกจาก body */
  warning?: string;
  confirmLabel: string;
  /** ค่าเริ่มต้น true — ปุ่มยืนยันสี danger */
  danger?: boolean;
}

/** shortcuts.ts ใช้ตัดปุ่มลัด global ระหว่าง dialog เปิด (ชั้นที่สอง: listener ของ popup Swal รันก่อนและ stopPropagation เองอยู่แล้ว
 *  ตามค่าเริ่มต้น stopKeydownPropagation แต่ guard นี้กันไว้เผื่อปุ่มที่ Swal ไม่ได้ดัก) */
export function isConfirmOpen(): boolean {
  return Swal.isVisible();
}

/**
 * dialog ยืนยันแบบใช่/ไม่ใช่ — true เฉพาะกดยืนยัน; Escape / คลิกนอก / ยกเลิก = false
 * โฟกัสปุ่มยกเลิกตอนเปิด (Enter ตามนิสัยต้องไม่ลบ) และคืนโฟกัสให้ปุ่มที่เปิดตอนปิด
 * ห้ามใช้ Swal ทำ toast — Swal แสดงได้ทีละ popup ซึ่งจะปิด dialog ยืนยันที่เปิดค้างอยู่
 */
export async function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  const danger = opts.danger ?? true;

  // สร้างด้วย textContent เท่านั้น — body อาจมีตัวเลข/ชื่อจากข้อมูลผู้ใช้ ห้ามต่อ string เป็น HTML
  const html = document.createElement("div");
  html.className = "text-left";
  const p = document.createElement("p");
  p.className = "whitespace-pre-line text-[12.5px] leading-relaxed text-text-dim";
  p.textContent = opts.body;
  html.appendChild(p);
  if (opts.warning) {
    const w = document.createElement("p");
    w.className =
      "mt-4 rounded-[10px] border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger";
    w.textContent = opts.warning;
    html.appendChild(w);
  }

  const result = await Swal.fire({
    title: opts.title,
    html,
    showCancelButton: true,
    confirmButtonText: opts.confirmLabel,
    cancelButtonText: t("gallery.delete.cancel"),
    focusCancel: true,
    returnFocus: true,
    // ค่าเริ่มต้น true จะยัด body.swal2-height-auto{height:auto!important} — แอปนี้พึ่ง html/body/#root height:100%
    // ถ้าปล่อยไว้ react-window ของ Gallery จะยืดเต็มความสูง virtual ทั้งหมด mount ทุกการ์ด และ scrollTop รีเซ็ตเป็น 0
    heightAuto: false,
    allowOutsideClick: true,
    allowEscapeKey: true,
    buttonsStyling: false,
    customClass: {
      popup: "rounded-[14px] border border-border-strong bg-surface text-text",
      title: "text-base font-bold text-text",
      actions: "flex w-full flex-col gap-2",
      confirmButton:
        "w-full cursor-pointer rounded-lg py-2.5 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90 " +
        (danger ? "bg-danger" : "bg-accent"),
      cancelButton:
        "w-full cursor-pointer rounded-lg py-1.5 text-[12px] font-medium text-text-faint transition-colors hover:text-text",
    },
    didOpen: () => {
      document.getElementById(TOAST_ROOT_ID)?.removeAttribute("aria-hidden");
    },
  });
  return result.isConfirmed;
}
