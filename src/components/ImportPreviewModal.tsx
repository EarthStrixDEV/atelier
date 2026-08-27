import { Clapperboard, FileWarning, GitMerge, Image, Layers, Mic, Music, RefreshCw, Video, X } from "lucide-react";
import { cancelImport, commitImportMerge, commitImportReplace } from "../lib/actions";
import { modeLabel } from "../lib/constants";
import { useApp } from "../lib/store";
import type { Mode } from "../lib/types";

const MODE_ICONS: Record<Mode, typeof Image> = {
  home: Image,
  infographic: Layers,
  video: Video,
  cinematic: Clapperboard,
  audio: Music,
  tts: Mic,
};

/**
 * โมดัลยืนยันก่อน import จริง — เปิดจาก importSession() หลัง parse + diff ไฟล์สำเร็จ (ดู actions.ts)
 * แสดง diff summary ต่อโหมดแล้วให้เลือก Replace (พฤติกรรมเดิม เขียนทับหมด) หรือ Merge (รวมเข้าของเดิม)
 * ไม่มี path commit ไหนรันได้จนกว่าจะกดปุ่มใดปุ่มหนึ่งในนี้ — กด X/คลิกนอกกรอบ = ยกเลิกเฉยๆ ไม่แก้ state
 */
export default function ImportPreviewModal() {
  const s = useApp();
  const pending = s.importPending;
  if (!pending) return null;

  const { preview } = pending;
  const rows = preview.perMode.filter(r => r.newHistoryCount > 0 || r.promptWillChange || r.queueMergeCount > 0);

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) cancelImport(); }}
    >
      <div className="w-[min(520px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-6">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-base font-bold"><FileWarning size={16} /> ยืนยันการ Import</h3>
          <button
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ยกเลิก"
            onClick={cancelImport}
          >
            <X size={15} />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-text-dim">
          ไฟล์นี้เป็น session format เวอร์ชัน {preview.fileVersion} — เลือกวิธี import ได้ค่ะ
        </p>

        <div className="mb-4 max-h-[240px] overflow-y-auto rounded-[10px] border border-border">
          {rows.length === 0 ? (
            <div className="px-3.5 py-3 text-[12.5px] text-text-faint">ไฟล์นี้ไม่มีอะไรต่างจากข้อมูลปัจจุบันเลยค่ะ</div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {rows.map(r => {
                const ModeIcon = MODE_ICONS[r.mode];
                const parts: string[] = [];
                if (r.newHistoryCount > 0) parts.push(`จะเพิ่มประวัติ ${r.newHistoryCount} รายการ`);
                if (r.promptWillChange) parts.push(`แทนที่พรอมต์ของ ${modeLabel(r.mode)} (เฉพาะ Replace)`);
                if (r.queueMergeCount > 0) parts.push(`รวมคิว ${r.queueMergeCount} งาน (เฉพาะ Merge)`);
                return (
                  <div key={r.mode} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <ModeIcon size={13} className="mt-0.5 shrink-0 text-text-dim" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-semibold text-text">{modeLabel(r.mode)}</div>
                      <div className="text-[11.5px] leading-relaxed text-text-dim">{parts.join(" · ")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg bg-accent py-2.5 text-accent-ink transition-opacity hover:opacity-90"
            onClick={commitImportMerge}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold"><GitMerge size={14} /> Merge — รวมเข้ากับข้อมูลปัจจุบัน</span>
            <span className="text-[11px] opacity-80">เก็บของเดิมไว้ทั้งหมด แค่เพิ่มประวัติและรวมคิวเข้าไปค่ะ</span>
          </button>
          <button
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-border py-2.5 text-text-dim transition-colors hover:border-danger hover:text-danger"
            onClick={commitImportReplace}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold"><RefreshCw size={14} /> Replace — แทนที่ทั้งหมดด้วยไฟล์นี้</span>
            <span className="text-[11px] text-text-faint">ลบข้อมูลเดิมทั้งหมด แล้วใช้ไฟล์นี้แทนค่ะ</span>
          </button>
          <button
            className="flex w-full cursor-pointer items-center justify-center rounded-lg py-1.5 text-[12px] font-medium text-text-faint transition-colors hover:text-text"
            onClick={cancelImport}
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
