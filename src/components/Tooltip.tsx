import { useId, type ReactNode } from "react";

/**
 * Tooltip ที่โผล่ทั้งตอน hover และตอน keyboard focus (R9) — `title` ของเบราว์เซอร์โผล่เฉพาะ hover
 * และช้า ผู้ใช้คีย์บอร์ดไม่เคยเห็นเลย จึงทำเองด้วย CSS ล้วน (group-hover / group-focus-within)
 * ไม่มี state/portal: ตัว tooltip อยู่ใต้ trigger ในกล่อง relative เดียวกัน z-index ต่ำกว่า popover (z-50)
 * ของปุ่มเดียวกัน ดังนั้นพอกดเปิด popover แล้วตัว popover จะทับ tooltip เอง
 *
 * `whitespace-pre-line` ให้ label ที่รวมหลายย่อหน้า (InfoHint ของ Model) ขึ้นบรรทัดใหม่ด้วย "\n" ได้ —
 * label บรรทัดเดียวของผู้เรียกเดิมไม่มี "\n" จึงไม่ต่างจากเดิม
 *
 * `aria-describedby` ผูกจาก wrapper ไม่ได้ (ต้องอยู่บน element ที่โฟกัส) — ปุ่มลูกจึงรับ id ผ่าน render prop
 */
export default function Tooltip({
  label, align = "end", fit = false, children,
}: {
  label: string;
  align?: "start" | "center" | "end";
  /** ดันตัว tooltip กลับเข้ากรอบ viewport / ตู้ที่ scroll ได้ใกล้สุด ตอน hover/focus — สำหรับ InfoHint ที่อยู่กลาง sidebar
   *  (จอ 360px ลิ้นชักกว้าง ~320px tooltip กว้าง 260px ที่จุดยึดกลางแถวจะล้นขอบขวาแล้วถูก overflow ตัด) ผู้เรียกใน Header ไม่ใช้ จึงไม่เปลี่ยนพฤติกรรม */
  fit?: boolean;
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  const pos = align === "start" ? "left-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "right-0";
  const fitIntoView = () => {
    const el = document.getElementById(id);
    if (!el) return;
    // ใช้ transform (ไม่ใช่ margin-left): align "end" ยึดด้วย right-0 (left:auto) margin ซ้ายเลยไม่ขยับกล่อง
    // และ transform ซ้อนกับ property `translate` ที่ -translate-x-1/2 ของ align "center" ใช้อยู่ได้โดยไม่ทับกัน
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    let lo = 8, hi = window.innerWidth - 8;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) {
        const b = p.getBoundingClientRect();
        lo = Math.max(lo, b.left + 8);
        hi = Math.min(hi, b.right - 8);
        break;
      }
    }
    let dx = 0;
    if (r.right > hi) dx = hi - r.right;
    if (r.left + dx < lo) dx = lo - r.left;
    el.style.transform = dx ? `translateX(${dx}px)` : "";
  };
  return (
    <div className="group/tt relative" onMouseEnter={fit ? fitIntoView : undefined} onFocus={fit ? fitIntoView : undefined}>
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className={
          "pointer-events-none absolute top-[calc(100%+8px)] z-30 w-max max-w-[260px] rounded-md border border-border-strong bg-surface px-2.5 py-1.5 " +
          "whitespace-pre-line text-[13px] font-normal leading-snug text-text opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.14)] transition-opacity " +
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 " + pos
        }
      >
        {label}
      </span>
    </div>
  );
}
