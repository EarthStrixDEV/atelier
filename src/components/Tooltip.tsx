import { useId, type ReactNode } from "react";

/**
 * Tooltip ที่โผล่ทั้งตอน hover และตอน keyboard focus (R9) — `title` ของเบราว์เซอร์โผล่เฉพาะ hover
 * และช้า ผู้ใช้คีย์บอร์ดไม่เคยเห็นเลย จึงทำเองด้วย CSS ล้วน (group-hover / group-focus-within)
 * ไม่มี state/portal: ตัว tooltip อยู่ใต้ trigger ในกล่อง relative เดียวกัน z-index ต่ำกว่า popover (z-50)
 * ของปุ่มเดียวกัน ดังนั้นพอกดเปิด popover แล้วตัว popover จะทับ tooltip เอง
 *
 * `aria-describedby` ผูกจาก wrapper ไม่ได้ (ต้องอยู่บน element ที่โฟกัส) — ปุ่มลูกจึงรับ id ผ่าน render prop
 */
export default function Tooltip({
  label, align = "end", children,
}: {
  label: string;
  align?: "start" | "center" | "end";
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  const pos = align === "start" ? "left-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "right-0";
  return (
    <div className="group/tt relative">
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className={
          "pointer-events-none absolute top-[calc(100%+8px)] z-30 w-max max-w-[260px] rounded-md border border-border-strong bg-surface px-2.5 py-1.5 " +
          "text-[13px] font-normal leading-snug text-text opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.14)] transition-opacity " +
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 " + pos
        }
      >
        {label}
      </span>
    </div>
  );
}
