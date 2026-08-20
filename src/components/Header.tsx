import { useRef, useState } from "react";
import {
  Clapperboard, Cloud, CloudOff, Download, FolderCheck, FolderInput, FolderX, History, Image,
  KeyRound, Layers, Music, PanelLeftClose, PanelLeftOpen, Send, Settings, Upload, Video,
} from "lucide-react";
import { MODES, modeLabel } from "../lib/constants";
import type { Mode } from "../lib/types";

const MODE_ICONS: Record<Mode, typeof Image> = {
  home: Image,
  infographic: Layers,
  video: Video,
  cinematic: Clapperboard,
  audio: Music,
};
import {
  connectAutoSaveDir, connectDrive, disconnectAutoSaveDir, disconnectDrive, exportSession, importSession,
  isAutoSaveSupported, isDriveSaveConfigured, reconnectSavedAutoSaveDir, switchMode, toggleAutoSaveEnabled,
} from "../lib/actions";
import { loadExportLog, mutate, useApp } from "../lib/store";

/** โชว์เวลาแบบสั้นๆ อ่านง่าย — ไม่ต้องเป๊ะระดับวินาที แค่พอให้แยกออกว่า export ไหนเป็นไหน */
function fmtExportedAt(at: number): string {
  return new Date(at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * ปุ่ม Export เดิม (ดาวน์โหลดไฟล์ตรงๆ) → เปลี่ยนเป็น popover ให้พิมพ์ label กำกับไฟล์ได้ก่อนกดจริง (PHASE 15)
 * ไม่กรอก label ก็ export ได้ตามปกติ (exportSession ใช้ timestamp เป็น display string ให้เองถ้า label ว่าง)
 * ใต้ช่องกรอกโชว์ประวัติ export ล่าสุด (label/filename/เวลา/สรุปโหมด) อ่านจาก atelier_export_log — ไม่มี payload จริงเก็บอยู่
 */
function ExportControl() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  // atelier_export_log ไม่ได้อยู่ใน AppState (อ่านตรงจาก localStorage เฉพาะจังหวะที่ต้องโชว์) — ต้อง re-read เองทุกครั้งที่ export ใหม่
  const [logTick, setLogTick] = useState(0);
  const log = loadExportLog();

  const doExport = () => {
    exportSession(label);
    setLabel("");
    setLogTick(t => t + 1);
  };

  return (
    <div className="relative">
      <button
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
        title="Export session (.json)"
        aria-label="Export session เป็นไฟล์ JSON"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <Download size={12} /> Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-[10px] border border-border-strong bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,.16)]">
            <label htmlFor="export-label-input" className="text-[11px] text-text-dim">ใส่ label กำกับไฟล์นี้ (ไม่บังคับ)</label>
            <input
              id="export-label-input"
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doExport(); }}
              placeholder="เช่น ก่อนเปลี่ยน prompt ชุดใหม่"
              aria-label="ใส่ label กำกับไฟล์ export (ไม่บังคับ)"
              className="mt-1.5 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12.5px] text-text outline-none transition-colors focus:border-accent"
            />
            <button
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
              aria-label="Export session เป็นไฟล์ JSON ตอนนี้"
              onClick={doExport}
            >
              <Send size={11} /> Export ตอนนี้
            </button>

            {log.length > 0 && (
              <div className="mt-3 border-t border-border pt-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.5px] text-text-faint">
                  <History size={11} /> ประวัติ Export ({log.length})
                </div>
                <div key={logTick} className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
                  {log.map((entry, i) => (
                    <div key={entry.at + "-" + i} className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
                      <div className="truncate text-[11.5px] text-text" title={entry.label || fmtExportedAt(entry.at)}>
                        {entry.label || fmtExportedAt(entry.at)}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9.5px] text-text-faint">
                        <span className="truncate">{fmtExportedAt(entry.at)}</span>
                        <span className="shrink-0">{entry.modeSummary}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AutoSaveControl() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  if (!isAutoSaveSupported()) return null; // Firefox/Safari — ไม่มี fallback ให้ ซ่อนปุ่มไปเลย

  const connected = !!s.autoSaveDirName;
  const label = connected
    ? (s.autoSaveEnabled ? "Auto Save เปิดอยู่" : "Auto Save ปิดอยู่")
    : s.autoSaveSavedDirName ? "เชื่อมต่อ Directory เดิม" : "ตั้งค่า Auto Save";

  return (
    <div className="relative">
      <button
        className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:border-border-strong"
        title="Auto Save ผลลัพธ์ลง Directory ที่เลือก"
        aria-label="ตั้งค่า Auto Save"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className={"h-[7px] w-[7px] rounded-full " + (connected && s.autoSaveEnabled ? "bg-green-400" : "bg-text-faint")} />
        {connected ? <FolderCheck size={12} /> : <FolderInput size={12} />}
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-[10px] border border-border-strong bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,.16)]">
            {connected ? (
              <>
                <div className="text-[11px] text-text-dim">Directory ปัจจุบัน</div>
                <div className="mt-1 truncate font-mono text-[12.5px] text-text" title={s.autoSaveDirName!}>{s.autoSaveDirName}</div>
                <label className="mt-3 flex cursor-pointer select-none items-center gap-[9px] text-[12.5px] text-text-dim">
                  <input
                    type="checkbox"
                    className="cursor-pointer accent-accent"
                    aria-label="เซฟไฟล์อัตโนมัติเมื่อสร้างเสร็จ"
                    checked={s.autoSaveEnabled}
                    onChange={toggleAutoSaveEnabled}
                  />
                  เซฟไฟล์อัตโนมัติเมื่อสร้างเสร็จ
                </label>
                <button
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-danger hover:text-danger"
                  aria-label="ยกเลิกการเชื่อมต่อ Auto Save"
                  onClick={() => { disconnectAutoSaveDir(); setOpen(false); }}
                >
                  <FolderX size={12} /> ยกเลิกการเชื่อมต่อ
                </button>
              </>
            ) : s.autoSaveSavedDirName ? (
              <>
                <div className="text-[12px] leading-relaxed text-text-dim">
                  เคยเชื่อมต่อกับ <span className="font-mono text-text">{s.autoSaveSavedDirName}</span> ไว้ค่ะ — ขอสิทธิ์เข้าถึงอีกครั้งไหมคะ?
                </div>
                <button
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={s.autoSaveConnecting}
                  aria-label={"เชื่อมต่อ directory เดิม: " + s.autoSaveSavedDirName}
                  onClick={reconnectSavedAutoSaveDir}
                >
                  <FolderCheck size={12} /> เชื่อมต่อ Directory เดิม
                </button>
                <button
                  className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={s.autoSaveConnecting}
                  aria-label="เลือก directory ใหม่สำหรับ Auto Save"
                  onClick={connectAutoSaveDir}
                >
                  <FolderInput size={12} /> เลือก Directory ใหม่
                </button>
              </>
            ) : (
              <>
                <div className="text-[12px] leading-relaxed text-text-dim">
                  เลือก directory ไว้ล่วงหน้า — ผลลัพธ์ที่สร้างเสร็จจะถูกเซฟลงไฟล์อัตโนมัติค่ะ (รองรับเฉพาะ Chrome/Edge)
                </div>
                <button
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={s.autoSaveConnecting}
                  aria-label="เลือก directory สำหรับ Auto Save"
                  onClick={connectAutoSaveDir}
                >
                  <FolderInput size={12} /> เลือก Directory
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** เชื่อมต่อ Google Drive สำหรับปุ่ม "Save to Drive" — ซ่อนไปเลยถ้ายังไม่ได้ตั้ง VITE_GOOGLE_CLIENT_ID */
function DriveControl() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  if (!isDriveSaveConfigured()) return null;

  return (
    <div className="relative">
      <button
        className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:border-border-strong"
        title="เชื่อมต่อ Google Drive สำหรับ Save to Drive"
        aria-label="ตั้งค่า Google Drive"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className={"h-[7px] w-[7px] rounded-full " + (s.driveConnected ? "bg-green-400" : "bg-text-faint")} />
        {s.driveConnected ? <Cloud size={12} /> : <CloudOff size={12} />}
        {s.driveConnected ? "Drive เชื่อมต่อแล้ว" : "เชื่อมต่อ Google Drive"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-[10px] border border-border-strong bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,.16)]">
            {s.driveConnected ? (
              <>
                <div className="text-[12px] leading-relaxed text-text-dim">
                  เชื่อมต่อ Google Drive แล้วค่ะ — ผลลัพธ์ที่กด "Save to Drive" จะถูกอัพโหลดขึ้นโฟลเดอร์ "Atelier Output"
                </div>
                <button
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-danger hover:text-danger"
                  aria-label="ยกเลิกการเชื่อมต่อ Google Drive"
                  onClick={() => { disconnectDrive(); setOpen(false); }}
                >
                  <CloudOff size={12} /> ยกเลิกการเชื่อมต่อ
                </button>
              </>
            ) : (
              <>
                <div className="text-[12px] leading-relaxed text-text-dim">
                  เชื่อมต่อ Google Drive เพื่อเซฟผลลัพธ์ขึ้นโฟลเดอร์ "Atelier Output" ได้จากปุ่ม Save to Drive บนแต่ละการ์ด
                  (ต้องเชื่อมต่อใหม่ทุกครั้งที่เปิดแอป)
                </div>
                <button
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={s.driveConnecting}
                  aria-label="เชื่อมต่อ Google Drive"
                  onClick={connectDrive}
                >
                  <Cloud size={12} /> {s.driveConnecting ? "กำลังเชื่อมต่อ…" : "เชื่อมต่อ Google Drive"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Header() {
  const s = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header aria-label="Atelier header" className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border px-7">
      <div className="flex items-center gap-3">
        <button
          className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
          title="ซ่อน/แสดง sidebar"
          aria-label={s.sidebarCollapsed ? "แสดง sidebar" : "ซ่อน sidebar"}
          onClick={() => mutate(st => { st.sidebarCollapsed = !st.sidebarCollapsed; })}
        >
          {s.sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <img src="/atelier/assets/atelier-logo.png" alt="Atelier" className="h-[42px] w-[42px] object-contain invert" />
        <h1 className="text-[15px] font-semibold tracking-[0.2px]">
          Atelier <span className="ml-0.5 text-[11px] font-normal uppercase tracking-[1.5px] text-text-faint">AI media studio</span>
        </h1>
      </div>

      <div role="tablist" aria-label="สลับโหมด" className="flex justify-self-center gap-[3px] rounded-full border border-border bg-surface p-[3px]">
        {MODES.map(m => {
          const ModeIcon = MODE_ICONS[m];
          return (
            <button
              key={m}
              className={
                "flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors " +
                (s.mode === m ? "bg-accent text-accent-ink" : "text-text-dim hover:text-text")
              }
              aria-pressed={s.mode === m}
              aria-label={"สลับไปโหมด " + modeLabel(m)}
              onClick={() => switchMode(m)}
            >
              <ModeIcon size={13} />
              {modeLabel(m)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 justify-self-end">
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
          title="Import session (.json)"
          aria-label="Import session จากไฟล์ JSON"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={12} /> Import
        </button>
        <ExportControl />
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          aria-label="เลือกไฟล์ session JSON เพื่อ import"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) importSession(file);
            e.target.value = "";
          }}
        />
        <AutoSaveControl />
        <DriveControl />
        <button
          className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
          title="ตั้งค่า"
          aria-label="เปิดหน้าตั้งค่า — storage, โมเดลผู้ช่วย AI, เพิ่มโมเดลเอง"
          onClick={() => mutate(st => { st.settingsModalOpen = true; })}
        >
          <Settings size={14} />
        </button>
        <button
          className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:border-border-strong"
          title="ตั้งค่า OpenRouter API Key"
          aria-label="ตั้งค่า OpenRouter API Key"
          onClick={() => mutate(st => { st.keyModalOpen = true; })}
        >
          <span className={"h-[7px] w-[7px] rounded-full " + (s.apiKey ? "bg-green-400" : "bg-text-faint")} />
          <KeyRound size={12} />
          {s.apiKey ? "API Key พร้อมใช้" : "ใส่ API Key"}
        </button>
      </div>
    </header>
  );
}
