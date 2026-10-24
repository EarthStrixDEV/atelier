import { Info } from "lucide-react";
import { t } from "../lib/i18n";
import Tooltip from "./Tooltip";

/**
 * ไอคอน ⓘ + tooltip แทนย่อหน้าช่วยเหลือที่เคยแปะค้างบนจอ — ข้อความ static (อธิบายว่าส่วนนี้คืออะไร)
 * ยังหาได้ตอน hover/focus แต่ไม่รก ส่วนคำเตือนตามสถานการณ์ (ทำให้ gen พัง/เสียเงิน) ห้ามย้ายมาที่นี่
 * ต้องโชว์ inline เสมอ
 *
 * ปุ่มมี onClick เพียงเพื่อ focus ตัวเอง (ให้แตะบนมือถือแล้ว tooltip โผล่) ไม่ได้ทำ action: tooltip เป็น `pointer-events-none` ของ Tooltip อยู่แล้ว ดังนั้นห้ามใส่ปุ่ม/ลิงก์ใน label
 * (กดไม่ได้) — ส่วนที่ต้องกดให้คงไว้ inline แล้วย้ายเฉพาะร้อยแก้ว
 *
 * `normal-case tracking-normal font-normal` ที่ wrapper: ตัว InfoHint มักถูกวางในหัวข้อ `fieldLabel`
 * ซึ่งเป็น uppercase + tracking กว้าง ถ้าไม่รีเซ็ตตัว tooltip จะสืบทอดไปด้วย (CSS text-transform สืบทอดได้)
 */
export default function InfoHint({
  label, align = "start",
}: {
  label: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <span className="inline-flex shrink-0 items-center align-middle font-normal normal-case tracking-normal">
      <Tooltip label={label} align={align} fit>
        {describedBy => (
          <button
            type="button"
            // iOS Safari ไม่โฟกัส <button> ตอนแตะ และ Tailwind v4 ครอบ hover ด้วย @media (hover:hover) —
            // ไม่ focus เองแตะแล้ว tooltip จะไม่โผล่เลยบน iPhone
            onClick={e => e.currentTarget.focus()}
            className="inline-flex cursor-help items-center rounded-full p-0.5 text-text-faint transition-colors hover:text-text"
            aria-label={t("shared.infoHint.label")}
            aria-describedby={describedBy}
          >
            <Info size={13} aria-hidden />
          </button>
        )}
      </Tooltip>
    </span>
  );
}
