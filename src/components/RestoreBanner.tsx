import { History, TriangleAlert, X } from "lucide-react";
import { dismissRestoreBanner, restoreSessionSnapshot } from "../lib/actions";
import { useApp } from "../lib/store";

/**
 * Banner แสดงครั้งเดียวตอน boot เมื่อ reconcilePendingJobs() (actions.ts) เจองานที่ resume ไม่ได้,
 * คิวที่หายไปตอน reload, และ/หรือมี session snapshot (PHASE 15) ที่ยังไม่ได้กู้คืน — ทุกเคสถูกรวมเป็น
 * banner เดียวกันแล้วตั้งแต่ตอน reconcile (ไม่มีโมดัล/banner คนละอันสำหรับ snapshot แยกออกไปต่างหาก)
 * ปิดแล้วหายไปเลย ไม่โชว์ซ้ำจน reload ใหม่แล้วมีเคสใหม่เกิดขึ้นอีก
 * ปุ่ม "กู้คืน" โชว์เฉพาะตอน canRestoreSnapshot — เปิดโมดัล Import Preview เดียวกับ import ไฟล์ปกติ (เลือก Merge/Replace ได้)
 *
 * R4 (Rework UI Studio): บังคับ 1 บรรทัดเสมอ — หัวข้อสั้นนำ แล้วรายละเอียดเต็มจาก reconcile ตัดด้วย truncate
 * (เต็มข้อความยังอ่านได้จาก title/aria-label) ปุ่มกู้คืน/ปิดเป็นปุ่มจริงขนาดกดง่าย ไม่ใช่ไอคอนจางๆ
 */
export default function RestoreBanner() {
  const s = useApp();
  if (!s.restoreBanner) return null;
  const { message, canRestoreSnapshot } = s.restoreBanner;
  const headline = canRestoreSnapshot ? "มีงานจากรอบก่อนที่กู้คืนได้" : "งานบางส่วนจากรอบก่อนไม่ได้ทำต่อ";

  return (
    <div
      role="status"
      className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border-strong bg-surface-2 px-7 text-[13px] max-[899px]:px-4"
    >
      <TriangleAlert size={15} className="shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 truncate" title={message}>
        <span className="font-semibold text-text">{headline}</span>
        <span className="text-text-dim max-[600px]:hidden"> — {message}</span>
      </p>
      {canRestoreSnapshot && (
        <button
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
          aria-label="กู้คืนงานจากรอบก่อน"
          onClick={restoreSessionSnapshot}
        >
          <History size={13} /> กู้คืน
        </button>
      )}
      <button
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border-strong px-2.5 text-[13px] font-semibold text-text-dim transition-colors hover:border-text hover:text-text"
        aria-label="ปิดแถบแจ้งเตือนงานค้าง"
        onClick={dismissRestoreBanner}
      >
        <X size={13} /> ปิด
      </button>
    </div>
  );
}
