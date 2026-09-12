import { CircleDollarSign, Layers3, X } from "lucide-react";
import { bakeOffCostBreakdown, closeBakeOffConfirm, confirmBakeOff } from "../lib/actions";
import { useApp } from "../lib/store";

/**
 * โมดัลยืนยันค่าใช้จ่ายก่อนยิง Bake-off จริง (PHASE 14) — เปิดจาก openBakeOffConfirm() ตอนกด Generate ขณะ bakeOffEnabled
 * โชว์ยอดรวมประเมินข้าม N โมเดลที่เลือกไว้ เพราะ Bake-off ยิงพร้อมกันทันที ไม่ผ่านคิว จึงพลาดคูณเงินได้ง่ายกว่าปกติมาก
 * ไม่มี path ยิงจริงไหนทำงานได้จนกว่าจะกดยืนยันในนี้ — กด X/คลิกนอกกรอบ = ยกเลิกเฉยๆ ไม่แก้ state
 */
export default function BakeOffConfirmModal() {
  const s = useApp();
  if (!s.bakeOffConfirmOpen) return null;

  const rows = bakeOffCostBreakdown();
  const known = rows.filter(r => r.cost != null);
  const total = known.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const hasUnknown = rows.some(r => r.cost == null);

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-overlay backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) closeBakeOffConfirm(); }}
    >
      <div className="w-[min(440px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-6">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Layers3 size={16} /> ยืนยัน Bake-off</h3>
          <button
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ยกเลิก"
            onClick={closeBakeOffConfirm}
          >
            <X size={15} />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-text-dim">
          จะยิง generate พร้อมกัน {rows.length} โมเดลด้วย prompt เดียวกันทันที (ไม่ผ่านคิว) ค่าใช้จ่ายจะถูกคูณตามจำนวนโมเดลค่ะ เช็คยอดรวมก่อนยืนยันนะคะ
        </p>

        <div className="mb-4 flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {rows.map(r => (
            <div key={r.modelId} className="flex items-center justify-between gap-2.5 px-3.5 py-2.5">
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-text" title={r.modelName}>{r.modelName}</span>
              <span className="shrink-0 font-mono text-[11px] text-text-faint">{r.cost != null ? "~$" + r.cost.toFixed(4) : "ไม่ทราบราคา"}</span>
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between gap-2 rounded-[10px] border border-border-strong bg-surface-2 px-3.5 py-3">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text"><CircleDollarSign size={13} /> รวมทั้งหมด</span>
          <span className="font-mono text-[13px] font-semibold text-text">~${total.toFixed(4)}{hasUnknown ? " (บางโมเดลไม่ทราบราคา)" : ""}</span>
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
            onClick={confirmBakeOff}
          >
            <Layers3 size={14} /> ยืนยัน — สร้างพร้อมกัน {rows.length} โมเดล
          </button>
          <button
            className="flex w-full cursor-pointer items-center justify-center rounded-lg py-1.5 text-[12px] font-medium text-text-faint transition-colors hover:text-text"
            onClick={closeBakeOffConfirm}
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
