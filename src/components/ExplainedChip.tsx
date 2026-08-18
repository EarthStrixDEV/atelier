import { Info } from "lucide-react";
import type { ExplainedItem } from "../lib/types";

interface ExplainedChipProps {
  item: ExplainedItem;
  active?: boolean;
  onClick?: () => void;
}

/**
 * Chip แบบ pill กดได้ — ใช้กับ keyword แนะนำของ Optimizer (PromptComposer) และมุมมองที่เลือกได้ทั่วไป
 * ถ้ามี item.why จะโชว์ไอคอน info พร้อม native tooltip (title) ต่อท้ายข้อความ — ไม่บังคับต้องมี เพราะ
 * โมเดล free-tier บางครั้งไม่ให้เหตุผลมาเลยทั้งรายการ (ดู asExplainedItem ใน actions.ts)
 */
export function ExplainedChip({ item, active, onClick }: ExplainedChipProps) {
  return (
    <button
      type="button"
      title={item.why}
      className={
        "flex cursor-pointer items-center gap-1 rounded-full border px-[11px] py-[5px] text-[11.5px] transition-all " +
        (active
          ? "border-accent bg-accent font-semibold text-accent-ink"
          : "border-border bg-surface-2 text-text-dim hover:border-border-strong hover:text-text")
      }
      aria-pressed={active}
      aria-label={(active ? "เอาคำ " + item.text + " ออกจาก prompt" : "เพิ่มคำ " + item.text + " เข้า prompt") + (item.why ? " — " + item.why : "")}
      onClick={onClick}
    >
      {item.text}
      {item.why && <Info size={11} className="shrink-0 opacity-70" />}
    </button>
  );
}

interface ExplainedNoteProps {
  why?: string;
}

/**
 * บรรทัดเหตุผลสั้นๆ ใต้การ์ด — ใช้กับ Grill me result card ที่มีพื้นที่พอโชว์ข้อความเต็มแทน tooltip
 * ไม่ render อะไรเลยถ้าไม่มี why (โมเดลไม่ได้ให้เหตุผลมาสำหรับรายการนี้)
 */
export function ExplainedNote({ why }: ExplainedNoteProps) {
  if (!why) return null;
  return (
    <div className="mt-1 flex items-start gap-1 text-[10.5px] leading-relaxed text-text-faint">
      <Info size={11} className="mt-[1.5px] shrink-0 opacity-70" />
      <span>{why}</span>
    </div>
  );
}
