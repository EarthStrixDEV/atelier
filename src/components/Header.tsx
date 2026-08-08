import { useRef, useState } from "react";
import {
  Clapperboard, Download, FolderCheck, FolderInput, FolderX, Image,
  KeyRound, Layers, Music, PanelLeftClose, PanelLeftOpen, Upload, Video,
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
  connectAutoSaveDir, disconnectAutoSaveDir, exportSession, importSession,
  isAutoSaveSupported, reconnectSavedAutoSaveDir, switchMode, toggleAutoSaveEnabled,
} from "../lib/actions";
import { mutate, useApp } from "../lib/store";

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
                    checked={s.autoSaveEnabled}
                    onChange={toggleAutoSaveEnabled}
                  />
                  เซฟไฟล์อัตโนมัติเมื่อสร้างเสร็จ
                </label>
                <button
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-danger hover:text-danger"
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
                  onClick={reconnectSavedAutoSaveDir}
                >
                  <FolderCheck size={12} /> เชื่อมต่อ Directory เดิม
                </button>
                <button
                  className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={s.autoSaveConnecting}
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

export default function Header() {
  const s = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border px-7">
      <div className="flex items-center gap-3">
        <button
          className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
          title="ซ่อน/แสดง sidebar"
          onClick={() => mutate(st => { st.sidebarCollapsed = !st.sidebarCollapsed; })}
        >
          {s.sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <img src="/atelier/assets/atelier-logo.png" alt="Atelier" className="h-[42px] w-[42px] object-contain invert" />
        <h1 className="text-[15px] font-semibold tracking-[0.2px]">
          Atelier <span className="ml-0.5 text-[11px] font-normal uppercase tracking-[1.5px] text-text-faint">AI media studio</span>
        </h1>
      </div>

      <div className="flex justify-self-center gap-[3px] rounded-full border border-border bg-surface p-[3px]">
        {MODES.map(m => {
          const ModeIcon = MODE_ICONS[m];
          return (
            <button
              key={m}
              className={
                "flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors " +
                (s.mode === m ? "bg-accent text-accent-ink" : "text-text-dim hover:text-text")
              }
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
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={12} /> Import
        </button>
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
          title="Export session (.json)"
          onClick={exportSession}
        >
          <Download size={12} /> Export
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) importSession(file);
            e.target.value = "";
          }}
        />
        <AutoSaveControl />
        <button
          className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:border-border-strong"
          title="ตั้งค่า OpenRouter API Key"
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
