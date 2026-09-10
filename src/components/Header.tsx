import { useEffect, useRef, useState } from "react";
import {
  Clapperboard, Cloud, CloudOff, Download, FolderCheck, FolderInput, FolderX, History, Image,
  KeyRound, Layers, Loader2, Mic, Music, PanelLeftClose, PanelLeftOpen, RotateCcw, Send, Settings, Upload, Video, Wallet, X,
} from "lucide-react";
import { MODES, modeLabel } from "../lib/constants";
import type { Mode } from "../lib/types";

const MODE_ICONS: Record<Mode, typeof Image> = {
  home: Image,
  infographic: Layers,
  video: Video,
  cinematic: Clapperboard,
  audio: Music,
  tts: Mic,
};
import {
  cancelAll, connectAutoSaveDir, connectDrive, disconnectAutoSaveDir, disconnectDrive, exportSession,
  getSchedulerStats, getSpendLedger, importSession, isAutoSaveSupported, isDriveSaveConfigured,
  reconnectSavedAutoSaveDir, resetSpendLedger, setSpendCap, switchMode, toggleAutoSaveEnabled,
} from "../lib/actions";
import { loadExportLog, mutate, toast, useApp } from "../lib/store";

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
        <span className={"h-[7px] w-[7px] rounded-full " + (connected && s.autoSaveEnabled ? "bg-text" : "bg-text-faint")} />
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

/** "ตั้งแต่ <วันที่>" ของ ledger — ยอดสะสมข้าม session ตัวเลขลอยๆ ไม่มีความหมายถ้าไม่บอกว่านับมาตั้งแต่เมื่อไหร่ */
function fmtSince(at: number): string {
  return new Date(at).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" });
}

/**
 * F4 Spend Guard — badge ยอดสะสมข้ามโหมด + popover ตั้งเพดาน/ล้างยอด (T17)
 *
 * **โชว์ตลอด ไม่ซ่อนตอนยอดเป็น 0** — ต่างจาก RunningJobsControl ที่โผล่เฉพาะตอนมีงาน เพราะ badge นี้เป็น
 * ทางเข้าเดียวของ UI ตั้งเพดาน (AC4) ถ้าซ่อนตอนยอด 0 ผู้ใช้ใหม่จะหาที่ตั้งเพดานไม่เจอเลย กลายเป็น
 * ฟีเจอร์ที่เปิดได้เฉพาะคนที่รู้อยู่แล้วว่ามี ซึ่งคือคนที่ไม่ต้องการมันที่สุด
 *
 * อ่าน ledger ผ่าน `getSpendLedger()` ที่คืน `undefined` ได้ (optional ใน AppState ตาม contract ของ T15)
 * แต่เรียกในขณะ render ของ component ที่ subscribe `useApp()` อยู่ จึง re-render ตามทุก mutate() ที่ recordSpend ยิง
 */
function SpendGuardControl() {
  useApp(); // subscribe — ledger อยู่นอก snapshot ของ useApp() ต้องพึ่ง version counter ตัวเดียวกันให้ re-render
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const ledger = getSpendLedger();

  // เปิด popover เมื่อไหร่ ให้ draft สะท้อนเพดานจริงที่ตั้งไว้ — `capUsd === undefined` = ไม่ได้ตั้ง จึงเป็นช่องว่าง
  // เช็ค `=== undefined` ตรงๆ ห้ามใช้ truthiness เพราะ `0` = "ถามทุกครั้ง" จะถูกกลืนเป็น "ไม่ได้ตั้ง" ทันที
  useEffect(() => {
    if (!open) { setConfirmingReset(false); return; }
    const cap = getSpendLedger()?.capUsd;
    setDraft(cap === undefined ? "" : String(cap));
  }, [open]);

  // กดยืนยันล้างยอดค้างไว้แล้วไม่กดต่อ — คืนปุ่มกลับสภาพเดิม (pattern เดียวกับ RunningJobsControl)
  useEffect(() => {
    if (!confirmingReset) return;
    const id = window.setTimeout(() => setConfirmingReset(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirmingReset]);

  const total = ledger?.totalUsd ?? 0;
  const unknown = ledger?.unknownCostCount ?? 0;
  const cap = ledger?.capUsd;
  const startedAt = ledger?.startedAt;
  const over = cap !== undefined && total > cap;

  // ช่องว่าง = ล้างเพดานทิ้ง — ต้องส่ง `null` ไม่ใช่ `0` เพราะ `0` คือโหมดถามทุกครั้ง ไม่ใช่ปิดฟีเจอร์
  // ไม่ validate ซ้ำที่นี่ — `setSpendCap` ดักค่าเสีย/ติดลบพร้อม toast ให้เองแล้ว
  const applyCap = () => {
    const raw = draft.trim();
    setSpendCap(raw === "" ? null : Number(raw));
    setOpen(false);
  };

  const doReset = () => {
    if (!confirmingReset) { setConfirmingReset(true); return; }
    setConfirmingReset(false);
    resetSpendLedger();
  };

  return (
    <div className="relative">
      <button
        className={
          "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors "
          + (over
            ? "border-danger text-danger hover:opacity-80"
            : "border-border text-text-dim hover:border-border-strong hover:text-text")
        }
        title={cap === undefined
          ? "ยอดใช้จ่ายประเมินสะสมทุกโหมด — กดเพื่อตั้งเพดานเตือน"
          : "ยอดใช้จ่ายประเมินสะสมทุกโหมด — เพดาน $" + cap.toFixed(2)}
        aria-label={"ยอดใช้จ่ายประเมินสะสม " + total.toFixed(4) + " ดอลลาร์ — กดเพื่อตั้งเพดานค่าใช้จ่าย"}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <Wallet size={12} />
        <span className="font-mono">~${total.toFixed(2)}</span>
        {unknown > 0 && <span className="font-normal text-text-faint">+{unknown}?</span>}
        {cap !== undefined && <span className="font-normal text-text-faint">/ ${cap.toFixed(2)}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-[10px] border border-border-strong bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,.16)]">
            <div className="mb-2 rounded-md border border-border bg-surface-2 px-2.5 py-2">
              <div className="font-mono text-[15px] font-semibold text-text">~${total.toFixed(4)}</div>
              <div className="mt-0.5 text-[10.5px] leading-relaxed text-text-faint">
                {startedAt ? "ยอดสะสมตั้งแต่ " + fmtSince(startedAt) : "ยังไม่เริ่มนับ"} · ทุกโหมดรวมกัน
                {unknown > 0 && <span className="text-danger"> · +{unknown} ชิ้นไม่ทราบราคา</span>}
              </div>
              <div className="mt-1 text-[10.5px] leading-relaxed text-text-faint">
                เป็น<strong className="font-semibold">ยอดประเมิน</strong>จาก pricing ของโมเดล ไม่ใช่บิลจริงจาก OpenRouter ค่ะ
              </div>
            </div>

            <label htmlFor="spend-cap-input" className="text-[11px] text-text-dim">เพดานค่าใช้จ่าย (USD) — เว้นว่างคือปิดการเตือน</label>
            <div className="mt-1.5 flex gap-1.5">
              <input
                id="spend-cap-input"
                type="number"
                min="0"
                step="0.5"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") applyCap(); }}
                placeholder="เช่น 5"
                aria-label="เพดานค่าใช้จ่ายเป็นดอลลาร์ เว้นว่างเพื่อปิดการเตือน"
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12.5px] text-text outline-none transition-colors focus:border-accent"
              />
              <button
                className="shrink-0 cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
                onClick={applyCap}
              >
                บันทึก
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-faint">
              ตั้ง <span className="font-mono">0</span> = ถามยืนยันทุกครั้งที่มีค่าใช้จ่าย · เกินเพดานแล้วจะมีโมดัลขึ้นมาถามก่อนยิงค่ะ
            </p>

            <div className="mt-3 border-t border-border pt-2.5">
              <button
                className={
                  "flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors "
                  + (confirmingReset
                    ? "bg-danger text-accent-ink"
                    : "border border-border text-text-dim hover:border-danger hover:text-danger")
                }
                title="ล้างยอดสะสมให้เป็น 0 แล้วเริ่มนับใหม่ เพดานที่ตั้งไว้คงเดิม"
                onClick={doReset}
              >
                <RotateCcw size={11} />
                {confirmingReset ? "กดอีกครั้งเพื่อยืนยันล้างยอด" : "ล้างยอดสะสม เริ่มนับใหม่"}
              </button>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-faint">
                ล้างแค่ตัวเลข ไม่กระทบผลงานใน gallery และเพดานที่ตั้งไว้ยังอยู่ค่ะ
              </p>
            </div>
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
        <span className={"h-[7px] w-[7px] rounded-full " + (s.driveConnected ? "bg-text" : "bg-text-faint")} />
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

/**
 * ตัวบ่งชี้งานที่กำลังรัน + ปุ่มยกเลิกทั้งหมด (T3) — โผล่เฉพาะตอนมีงาน loading อยู่จริง ไม่งั้นซ่อนหายไป
 * ไม่กิน space ใน header ตอนว่าง
 *
 * ทำไมต้อง poll: จำนวน "กำลังยิง" กับ "รอคิว" อยู่ในตัวแปร module-level ของ governor (activeCount /
 * waitingQueue) ไม่ได้อยู่ใน AppState — mutate() ไม่ถูกเรียกตอนงานขยับจากคิวเข้า slot จึงไม่มี re-render
 * ให้เกาะ ต้องถามผ่าน getSchedulerStats() เป็นระยะเอง (1s พอสำหรับตัวเลขระดับนี้) และ poll เฉพาะตอนที่
 * มีงานค้างอยู่จริงเท่านั้น — ว่างเมื่อไหร่ interval ถูก clear ทิ้ง ไม่มี timer วิ่งเปล่าตลอดอายุแอป
 *
 * ยืนยันก่อนยกเลิก: "ยกเลิกทั้งหมด" ทีเดียวหลายชิ้นและกู้คืนไม่ได้ (งานที่ยิงไปแล้วเสียเงินไปแล้ว) —
 * ใช้ two-step ในปุ่มเดิม (กดครั้งแรกเปลี่ยนเป็น "ยืนยันยกเลิก?") แทน window.confirm/modal เพราะเบากว่า
 * และผู้ใช้กดพลาดแล้วแค่ปล่อยให้หมดเวลา 4 วินาทีก็คืนสภาพเดิมเอง ส่วนการยกเลิก "ทีละชิ้น" ในการ์ด
 * ไม่ต้องยืนยัน (ผลกระทบชิ้นเดียว เห็นตัวงานอยู่ตรงหน้า และมีปุ่มสร้างใหม่ให้กดกลับได้ทันที)
 */
function RunningJobsControl() {
  const s = useApp();
  const [stats, setStats] = useState(() => getSchedulerStats());
  const [confirming, setConfirming] = useState(false);

  // นับจาก state (ทุกโหมด) เพื่อ "ตัดสินใจว่าจะโชว์ไหม" — governor นับได้เฉพาะงานที่ผ่านมันอยู่ตอนนี้
  const loadingCount = Object.values(s.modes).reduce(
    (n, m) => n + m.images.filter(x => x.status === "loading").length, 0,
  );

  useEffect(() => {
    if (loadingCount === 0) return;
    setStats(getSchedulerStats());
    const id = window.setInterval(() => setStats(getSchedulerStats()), 1000);
    return () => window.clearInterval(id);
  }, [loadingCount]);

  // กดยืนยันค้างไว้แล้วไม่กดต่อ — คืนปุ่มกลับสภาพเดิม กัน "ยืนยันยกเลิก?" ค้างจนกดโดนทีหลังโดยไม่ตั้งใจ
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  useEffect(() => { if (loadingCount === 0) setConfirming(false); }, [loadingCount]);

  if (loadingCount === 0) return null;

  const running = Math.min(stats.active, loadingCount);
  const waiting = stats.waiting;

  const doCancelAll = () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    // ยกเลิกทุกโหมด ไม่ใช่แค่โหมดปัจจุบัน — ตัวเลขที่โชว์ก็นับรวมทุกโหมด ปุ่มต้องทำตามที่เห็น
    const n = cancelAll("user-all");
    setStats(getSchedulerStats());
    toast(n > 0 ? `ยกเลิกแล้ว ${n} งานค่ะ` : "ไม่มีงานที่ยกเลิกได้ตอนนี้ค่ะ");
  };

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 py-1 pl-2.5 pr-1">
      <span
        className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-dim"
        aria-live="polite"
        aria-label={`กำลังสร้าง ${running} งาน รอคิวอีก ${waiting} งาน`}
      >
        <Loader2 size={12} className="animate-spin text-accent" />
        กำลังสร้าง {running}
        {waiting > 0 && <span className="font-normal text-text-faint">· รอคิว {waiting}</span>}
      </span>
      <button
        className={
          "cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors " +
          (confirming
            ? "bg-danger text-accent-ink"
            : "border border-border text-text-dim hover:border-danger hover:text-danger")
        }
        title={waiting > 0
          ? `ยกเลิกทุกงานที่ค้างอยู่ — ${waiting} งานที่ยังรอคิวยังไม่ถูกยิงเลย ยกเลิกตอนนี้ไม่เสียเงิน`
          : "ยกเลิกทุกงานที่กำลังสร้างอยู่"}
        aria-label={confirming ? "กดอีกครั้งเพื่อยืนยันยกเลิกงานทั้งหมด" : "ยกเลิกงานทั้งหมดที่กำลังสร้างอยู่"}
        onClick={doCancelAll}
      >
        {confirming ? "ยืนยันยกเลิก?" : <span className="flex items-center gap-1"><X size={11} /> ยกเลิกทั้งหมด</span>}
      </button>
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
        <img src="/atelier/assets/atelier-logo.png" alt="Atelier" className="h-[42px] w-[42px] object-contain" />
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
        <SpendGuardControl />
        <RunningJobsControl />
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
          <span className={"h-[7px] w-[7px] rounded-full " + (s.apiKey ? "bg-text" : "bg-text-faint")} />
          <KeyRound size={12} />
          {s.apiKey ? "API Key พร้อมใช้" : "ใส่ API Key"}
        </button>
      </div>
    </header>
  );
}
