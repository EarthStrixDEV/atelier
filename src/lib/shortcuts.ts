import { useEffect } from "react";
import { MODES } from "./constants";
import { generate, openBakeOffConfirm, switchMode } from "./actions";
import { cur, mutate, state, useApp } from "./store";

/**
 * true ถ้า target ปัจจุบันเป็นช่อง input ที่ผู้ใช้กำลังพิมพ์อยู่ (input/textarea/contentEditable)
 * ใช้ suppress ปุ่มลัดส่วนใหญ่ระหว่างพิมพ์ ยกเว้น Ctrl+Enter ที่ตั้งใจให้ทำงานได้แม้กำลังพิมพ์อยู่ในช่อง prompt
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Global keyboard shortcut layer — mount ครั้งเดียวใกล้ root ของแอป (ดู StudioApp.tsx)
 * - Ctrl/Cmd+Enter: สั่ง generate ทันที (ทำงานได้แม้กำลังพิมพ์อยู่ในช่อง prompt)
 * - 1-5 หรือ Alt+1-5: สลับโหมดตามลำดับใน MODES (ปรับตามจำนวนโหมดจริง ไม่ hardcode)
 * - "/": โฟกัสช่อง prompt (sidebar หรือ center แล้วแต่ promptPlacement ปัจจุบัน)
 * - Shift+?: เปิด/ปิด cheat-sheet โมดัลปุ่มลัด
 * ทุกปุ่ม (ยกเว้น Ctrl+Enter) จะถูก suppress ระหว่างพิมพ์ในช่อง input/textarea ใดๆ
 * และ suppress ทั้งหมดขณะ KeyModal/ChatPanel/GrillPanel เปิดอยู่ กัน conflict กับปุ่มลัดของแผงเหล่านั้นเอง (เช่น Enter ส่งข้อความ)
 */
export function useKeyboardShortcuts() {
  const s = useApp();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // แผงที่มี input ของตัวเองอยู่แล้ว (KeyModal, Chat, Grill) — ปิดปุ่มลัด global ทั้งหมดกัน conflict
      if (state.keyModalOpen || state.chatOpen || state.grillOpen) return;

      const typing = isTypingTarget(e.target);

      // Ctrl/Cmd+Enter — ทำงานได้เสมอแม้กำลังพิมพ์อยู่ในช่อง prompt
      // Bake-off (PHASE 14) เปิดอยู่ → เปิดโมดัลยืนยันราคาแทนยิงตรง เหมือนปุ่ม Generate ปกติ
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        // T24/#5: โมดัลยืนยันค่าใช้จ่าย (F4) เปิดค้างอยู่ = มี batch ชุดหนึ่งนอนรออยู่ใน pendingSpendJobs
        // ปุ่มลัดต้องไม่ยิงงานใหม่ทับ generate() มี guard ตัวเดียวกันอยู่แล้ว (ครอบทุกทางเข้า) — ตัวนี้ตัด
        // ตั้งแต่ต้นทางเพื่อไม่ให้กด Ctrl+Enter รัวๆ แล้วเด้ง toast ซ้ำเป็นชุด และกัน Bake-off เปิดโมดัลซ้อนโมดัล
        if (state.spendConfirm) return;
        if (cur().bakeOffEnabled) openBakeOffConfirm(); else generate();
        return;
      }

      if (typing) return; // ปุ่มลัดที่เหลือทั้งหมด suppress ระหว่างพิมพ์

      // Shift+? (มักมาเป็น "?" ตรงๆ เพราะต้องกด Shift อยู่แล้วบนคีย์บอร์ดส่วนใหญ่)
      if (e.shiftKey && e.key === "?") {
        e.preventDefault();
        mutate(st => { st.shortcutsModalOpen = !st.shortcutsModalOpen; });
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector<HTMLTextAreaElement>(
          state.promptPlacement === "sidebar" ? "#prompt-sidebar-input" : "[data-center-prompt]"
        );
        input?.focus();
        return;
      }

      // ตัวเลข 1..N หรือ Alt+1..N สลับโหมดตามลำดับจริงของ MODES (ไม่ hardcode จำนวน)
      const digit = parseInt(e.key, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= MODES.length && !e.ctrlKey && !e.metaKey) {
        const mode = MODES[digit - 1];
        if (mode) {
          e.preventDefault();
          switchMode(mode);
        }
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [s.keyModalOpen, s.chatOpen, s.grillOpen, s.promptPlacement]);
}
