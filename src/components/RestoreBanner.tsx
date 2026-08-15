import { History, TriangleAlert, X } from "lucide-react";
import { dismissRestoreBanner, restoreSessionSnapshot } from "../lib/actions";
import { useApp } from "../lib/store";

/**
 * Banner แสดงครั้งเดียวตอน boot เมื่อ reconcilePendingJobs() (actions.ts) เจองานที่ resume ไม่ได้,
 * คิวที่หายไปตอน reload, และ/หรือมี session snapshot (PHASE 15) ที่ยังไม่ได้กู้คืน — ทุกเคสถูกรวมเป็น
 * banner เดียวกันแล้วตั้งแต่ตอน reconcile (ไม่มีโมดัล/banner คนละอันสำหรับ snapshot แยกออกไปต่างหาก)
 * ปิดแล้วหายไปเลย ไม่โชว์ซ้ำจน reload ใหม่แล้วมีเคสใหม่เกิดขึ้นอีก
 * ปุ่ม "กู้คืน" โชว์เฉพาะตอน canRestoreSnapshot — เปิดโมดัล Import Preview เดียวกับ import ไฟล์ปกติ (เลือก Merge/Replace ได้)
 */
export default function RestoreBanner() {
  const s = useApp();
  if (!s.restoreBanner) return null;

  return (
    <div className="flex items-start gap-2.5 border-b border-border-strong bg-surface-2 px-7 py-2.5 text-[12.5px] text-text-dim">
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-text" />
      <span className="flex-1">{s.restoreBanner.message}</span>
      {s.restoreBanner.canRestoreSnapshot && (
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1 text-[11.5px] font-semibold text-text transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
          onClick={restoreSessionSnapshot}
        >
          <History size={11} /> กู้คืน
        </button>
      )}
      <button
        className="shrink-0 cursor-pointer text-text-faint transition-colors hover:text-text"
        title="ปิด"
        onClick={dismissRestoreBanner}
      >
        <X size={14} />
      </button>
    </div>
  );
}
