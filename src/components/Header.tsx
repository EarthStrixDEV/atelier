import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Clapperboard, Cloud, CloudOff, Download, FolderCheck, FolderInput, FolderX, History, Image,
  Keyboard, KeyRound, Layers, Loader2, MoreHorizontal, Mic, Music, Palette, PanelLeftClose, PanelLeftOpen, RotateCcw, Send, Settings,
  Upload, Video, Wallet, X,
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
  getSchedulerStats, getSpendLedger, importSession, isAutoSaveSupported, isDriveSaveConfigured, isGenerating,
  reconnectSavedAutoSaveDir, resetSpendLedger, setSpendCap, switchMode, toggleAutoSaveEnabled,
} from "../lib/actions";
import { loadExportLog, mutate, toast, useApp } from "../lib/store";
import { confirmAction } from "../lib/alerts";
import { t } from "../lib/i18n";
import { ThemePickerPanel } from "./ThemePicker";
import Tooltip from "./Tooltip";
import InfoHint from "./InfoHint";

/** โชว์เวลาแบบสั้นๆ อ่านง่าย — ไม่ต้องเป๊ะระดับวินาที แค่พอให้แยกออกว่า export ไหนเป็นไหน */
function fmtExportedAt(at: number): string {
  return new Date(at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * เนื้อหา Export ล้วนๆ (ไม่มีปุ่มเปิด/popover chrome) — ใช้เป็น panel ตัวหนึ่งใน "เพิ่มเติม" drill-down
 * เดิมเป็น popover เดี่ยว (PHASE 15) ย้ายมาไว้ในเมนูรวมเพื่อกันปุ่ม header เบียดกันตอน layout แคบ
 * ไม่กรอก label ก็ export ได้ตามปกติ (exportSession ใช้ timestamp เป็น display string ให้เองถ้า label ว่าง)
 * ใต้ช่องกรอกโชว์ประวัติ export ล่าสุด (label/filename/เวลา/สรุปโหมด) อ่านจาก atelier_export_log — ไม่มี payload จริงเก็บอยู่
 */
function ExportPanel() {
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
    <div>
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
  );
}

/** badge จุดสถานะ + label สั้นๆ ของแถว Auto Save ในเมนูหลัก — เดิมเป็นเนื้อในปุ่ม trigger ของ popover เดี่ยว */
function autoSaveRowLabel(s: ReturnType<typeof useApp>): string {
  const connected = !!s.autoSaveDirName;
  return connected
    ? (s.autoSaveEnabled ? "เปิดอยู่" : "ปิดอยู่")
    : s.autoSaveSavedDirName ? "เชื่อมต่อ Directory เดิม" : "ยังไม่ได้ตั้งค่า";
}

/** เนื้อหา Auto Save ล้วนๆ — ย้ายมาจาก popover เดี่ยวเดิมเข้า "เพิ่มเติม" drill-down เหมือน ExportPanel */
function AutoSavePanel({ onDone }: { onDone: () => void }) {
  const s = useApp();
  const connected = !!s.autoSaveDirName;

  return (
    <div>
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
            onClick={() => { disconnectAutoSaveDir(); onDone(); }}
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
          {/* ปุ่มเชื่อมต่อต้องกดได้ จึงอยู่ inline — ย้ายเฉพาะคำอธิบายไปไว้หลัง ⓘ ข้างปุ่ม */}
          <div className="flex items-center gap-1.5">
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={s.autoSaveConnecting}
              aria-label="เลือก directory สำหรับ Auto Save"
              onClick={connectAutoSaveDir}
            >
              <FolderInput size={12} /> เลือก Directory
            </button>
            <InfoHint align="end" label="เลือก directory ไว้ล่วงหน้า — ผลลัพธ์ที่สร้างเสร็จจะถูกเซฟลงไฟล์อัตโนมัติค่ะ (รองรับเฉพาะ Chrome/Edge)" />
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
  const badgeRef = useRef<HTMLButtonElement>(null);
  const ledger = getSpendLedger();

  // เปิด popover เมื่อไหร่ ให้ draft สะท้อนเพดานจริงที่ตั้งไว้ — `capUsd === undefined` = ไม่ได้ตั้ง จึงเป็นช่องว่าง
  // เช็ค `=== undefined` ตรงๆ ห้ามใช้ truthiness เพราะ `0` = "ถามทุกครั้ง" จะถูกกลืนเป็น "ไม่ได้ตั้ง" ทันที
  useEffect(() => {
    if (!open) return;
    const cap = getSpendLedger()?.capUsd;
    setDraft(cap === undefined ? "" : String(cap));
  }, [open]);

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

  const doReset = async () => {
    // ปิด popover ก่อนเปิด dialog — ไม่งั้น click-outside ของ popover จะชนกับ backdrop ของ Swal
    setOpen(false);
    const ok = await confirmAction({
      title: t("header.SpendGuard.resetTitle"),
      body: t("header.SpendGuard.resetBody"),
      confirmLabel: t("header.SpendGuard.resetConfirm"),
    });
    if (ok) resetSpendLedger();
    // popover ที่เป็นผู้เปิด dialog ถูก unmount ไปแล้ว Swal returnFocus เลยไม่มีเป้าหมาย (โฟกัสหลุดไป body) — คืนให้ปุ่มป้ายค่าใช้จ่ายเองทั้งสองทาง
    badgeRef.current?.focus();
  };

  return (
    <Tooltip
      label={cap === undefined
        ? "ค่าใช้จ่ายประเมินสะสมทุกโหมด (ไม่ใช่บิลจริง) — กดเพื่อตั้งเพดานเตือน"
        : "ค่าใช้จ่ายประเมินสะสมทุกโหมด — เพดานเตือน $" + cap.toFixed(2) + " · กดเพื่อแก้"}
    >
    {describedBy => <div className="relative">
      <button
        ref={badgeRef}
        className={
          "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors "
          + (over
            ? "border-danger text-danger hover:opacity-80"
            : "border-border text-text-dim hover:border-border-strong hover:text-text")
        }
        aria-label={"ยอดใช้จ่ายประเมินสะสม " + total.toFixed(4) + " ดอลลาร์ — กดเพื่อตั้งเพดานค่าใช้จ่าย"}
        aria-describedby={describedBy}
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
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="spend-cap-input" className="min-w-0 text-[11px] text-text-dim">เพดานค่าใช้จ่าย (USD) — เว้นว่างคือปิดการเตือน</label>
              {/* ⓘ อยู่นอก <label> (ไม่ซ้อนปุ่มใน label) — รวมคำอธิบายยอดประเมิน + ความหมายของเพดาน 0 ไว้ที่เดียว */}
              <InfoHint
                align="end"
                label={"เป็นยอดประเมินจาก pricing ของโมเดล ไม่ใช่บิลจริงจาก OpenRouter ค่ะ\nตั้ง 0 = ถามยืนยันทุกครั้งที่มีค่าใช้จ่าย · เกินเพดานแล้วจะมีโมดัลขึ้นมาถามก่อนยิงค่ะ"}
              />
            </div>
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

            <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5">
              <button
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-danger hover:text-danger"
                title="ล้างยอดสะสมให้เป็น 0 แล้วเริ่มนับใหม่ เพดานที่ตั้งไว้คงเดิม"
                onClick={doReset}
              >
                <RotateCcw size={11} />
                ล้างยอดสะสม เริ่มนับใหม่
              </button>
              <InfoHint align="end" label="ล้างแค่ตัวเลข ไม่กระทบผลงานใน gallery และเพดานที่ตั้งไว้ยังอยู่ค่ะ" />
            </div>
          </div>
        </>
      )}
    </div>}
    </Tooltip>
  );
}


/** เนื้อหา Google Drive ล้วนๆ — ย้ายมาจาก popover เดี่ยวเดิมเข้า "เพิ่มเติม" drill-down เหมือน ExportPanel */
function DrivePanel({ onDone }: { onDone: () => void }) {
  const s = useApp();

  return (
    <div>
      {s.driveConnected ? (
        <>
          {/* สถานะ "เชื่อมต่อแล้ว" ยังเห็นได้จากแถว Google Drive ในเมนูหลัก + ปุ่มยกเลิกด้านล่าง — ย้ายเฉพาะคำอธิบายไปหลัง ⓘ */}
          <div className="flex items-center gap-1.5">
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11.5px] font-semibold text-text-dim transition-colors hover:border-danger hover:text-danger"
              aria-label="ยกเลิกการเชื่อมต่อ Google Drive"
              onClick={() => { disconnectDrive(); onDone(); }}
            >
              <CloudOff size={12} /> ยกเลิกการเชื่อมต่อ
            </button>
            <InfoHint align="end" label={'เชื่อมต่อ Google Drive แล้วค่ะ — ผลลัพธ์ที่กด "Save to Drive" จะถูกอัพโหลดขึ้นโฟลเดอร์ "Atelier Output"'} />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={s.driveConnecting}
              aria-label="เชื่อมต่อ Google Drive"
              onClick={connectDrive}
            >
              <Cloud size={12} /> {s.driveConnecting ? "กำลังเชื่อมต่อ…" : "เชื่อมต่อ Google Drive"}
            </button>
            <InfoHint
              align="end"
              label={'เชื่อมต่อ Google Drive เพื่อเซฟผลลัพธ์ขึ้นโฟลเดอร์ "Atelier Output" ได้จากปุ่ม Save to Drive บนแต่ละการ์ด (ต้องเชื่อมต่อใหม่ทุกครั้งที่เปิดแอป)'}
            />
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
 * ผ่าน confirmAction() (dialog กลาง) แทน two-step ในปุ่ม เพราะ dialog บอกจำนวนงานที่จะโดนยกเลิกได้
 * และไม่มี timer ให้ปุ่ม "ยืนยันยกเลิก?" ค้างแล้วกดโดนทีหลัง ส่วนการยกเลิก "ทีละชิ้น" ในการ์ด
 * ไม่ต้องยืนยัน (ผลกระทบชิ้นเดียว เห็นตัวงานอยู่ตรงหน้า และมีปุ่มสร้างใหม่ให้กดกลับได้ทันที)
 */
function RunningJobsControl() {
  const s = useApp();
  const [stats, setStats] = useState(() => getSchedulerStats());

  // นับจาก state (ทุกโหมด) เพื่อ "ตัดสินใจว่าจะโชว์ไหม" — governor นับได้เฉพาะงานที่ผ่านมันอยู่ตอนนี้
  const loadingCount = Object.values(s.modes).reduce(
    (n, m) => n + m.images.filter(isGenerating).length, 0,
  );

  useEffect(() => {
    if (loadingCount === 0) return;
    setStats(getSchedulerStats());
    const id = window.setInterval(() => setStats(getSchedulerStats()), 1000);
    return () => window.clearInterval(id);
  }, [loadingCount]);

  if (loadingCount === 0) return null;

  const running = Math.min(stats.active, loadingCount);
  const waiting = stats.waiting;

  const doCancelAll = async () => {
    // จำนวนใน body คือ ณ ตอนเปิด dialog — งานอาจจบระหว่างรอ (component อาจ unmount) cancelAll จะคืน 0
    // แล้ว toast "ไม่มีงานที่ยกเลิกได้" ซึ่งถูกต้อง จึงไม่เรียก setStats หลัง await (interval อัปเดตเอง)
    const ok = await confirmAction({
      title: t("header.RunningJobs.cancelAllTitle"),
      body: t("header.RunningJobs.cancelAllBody", { running, waiting })
        + (waiting > 0 ? "\n" + t("header.RunningJobs.cancelAllWaitingNote") : ""),
      confirmLabel: t("header.RunningJobs.cancelAllConfirm"),
      danger: true,
    });
    if (!ok) return;
    // ยกเลิกทุกโหมด ไม่ใช่แค่โหมดปัจจุบัน — ตัวเลขที่โชว์ก็นับรวมทุกโหมด ปุ่มต้องทำตามที่เห็น
    const n = cancelAll("user-all");
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
        className="cursor-pointer rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-text-dim transition-colors hover:border-danger hover:text-danger"
        title={waiting > 0
          ? `ยกเลิกทุกงานที่ค้างอยู่ — ${waiting} งานที่ยังรอคิวยังไม่ถูกยิงเลย ยกเลิกตอนนี้ไม่เสียเงิน`
          : "ยกเลิกทุกงานที่กำลังสร้างอยู่"}
        aria-label="ยกเลิกงานทั้งหมดที่กำลังสร้างอยู่"
        onClick={doCancelAll}
      >
        <span className="flex items-center gap-1"><X size={11} /> ยกเลิกทั้งหมด</span>
      </button>
    </div>
  );
}

/** รายการใน root list ของ "เพิ่มเติม" — id ใช้ระบุว่ากำลัง drill-in อยู่ที่ panel ไหน */
type MorePanelId = "export" | "autosave" | "drive" | "theme";

/**
 * "เพิ่มเติม" — รวม Import/Export/Auto Save/Google Drive/ธีม/ตั้งค่า เป็น dropdown เดียว (T-more)
 *
 * ก่อนหน้านี้ปุ่มพวกนี้เรียงเป็นแถวตรงๆ ใน header คลัสเตอร์ขวา — พอเพิ่ม Theme picker เข้ามาอีกตัว
 * (F3) ปุ่มก็ล้น layout บนจอแคบ (เบียดกันจนตัดคำ/ขึ้นบรรทัดใหม่) จึงยุบเป็นเมนูเดียว เหลือปุ่มที่
 * ต้องเห็นตลอดเวลานอกเมนู: Spend Guard/Running Jobs (badge สถานะที่ต้องสังเกตได้ทันที) และ API Key
 * (บ่งบอกว่าใช้แอปได้หรือยัง ซ่อนในเมนูจะทำให้ผู้ใช้ใหม่หาไม่เจอ)
 *
 * Import กับ ตั้งค่า เป็น action ตรงๆ ไม่มี panel ย่อย (คลิกแล้วทำงานเลย ปิดเมนูทันที) ส่วน
 * Export/Auto Save/Google Drive/ธีม มี state ของตัวเอง (label input, connect flow, theme list) จึง
 * เป็น "drill-down": คลิกแถวแล้วสลับเนื้อหาของ panel เดียวกันแทนที่ root list พร้อมปุ่มย้อนกลับ
 * ไม่เปิดเป็น popover ซ้อน popover เพราะจะกลายเป็น 2 ชั้นที่ backdrop ปิดยาก ต้อง track กันเอง
 */
function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<MorePanelId | null>(null);
  const s = useApp();
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoSaveAvailable = isAutoSaveSupported();
  const driveAvailable = isDriveSaveConfigured();

  const close = () => { setOpen(false); setPanel(null); };

  // Escape ปิดทั้งเมนู (ไม่ใช่แค่ถอย panel) — ตรงกับพฤติกรรม popover ตัวอื่นๆ ในไฟล์นี้ (ThemePicker เดิม ฯลฯ)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      btnRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const panelTitle: Record<MorePanelId, string> = {
    export: "Export session",
    autosave: "Auto Save",
    drive: "Google Drive",
    theme: "ธีม",
  };

  return (
    <Tooltip label="เมนูเพิ่มเติม — Import/Export, Auto Save, Google Drive, ธีม และตั้งค่า">
    {describedBy => <div className="relative">
      <button
        ref={btnRef}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
        aria-label="เมนูเพิ่มเติม"
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => { const next = !v; if (!next) setPanel(null); return next; })}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            role="menu"
            aria-label={panel ? panelTitle[panel] : "เมนูเพิ่มเติม"}
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-[10px] border border-border-strong bg-surface p-2 shadow-[0_12px_40px_rgba(0,0,0,.16)]"
          >
            {panel === null ? (
              <>
                <button
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-text transition-colors hover:bg-surface-2"
                  onClick={() => { close(); fileRef.current?.click(); }}
                >
                  <Upload size={14} className="shrink-0 text-text-dim" /> Import session
                </button>
                <button
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-text transition-colors hover:bg-surface-2"
                  onClick={() => setPanel("export")}
                >
                  <Download size={14} className="shrink-0 text-text-dim" />
                  <span className="flex-1">Export session</span>
                  <ChevronRight size={14} className="shrink-0 text-text-faint" />
                </button>

                {(autoSaveAvailable || driveAvailable) && <div className="my-1.5 border-t border-border" />}

                {autoSaveAvailable && (
                  <button
                    role="menuitem"
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-text transition-colors hover:bg-surface-2"
                    onClick={() => setPanel("autosave")}
                  >
                    <span className={"h-[7px] w-[7px] shrink-0 rounded-full " + (s.autoSaveDirName && s.autoSaveEnabled ? "bg-success" : "bg-text-faint")} />
                    <span className="flex-1">Auto Save</span>
                    <span className="shrink-0 text-[10.5px] font-normal text-text-faint">{autoSaveRowLabel(s)}</span>
                    <ChevronRight size={14} className="shrink-0 text-text-faint" />
                  </button>
                )}
                {driveAvailable && (
                  <button
                    role="menuitem"
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-text transition-colors hover:bg-surface-2"
                    onClick={() => setPanel("drive")}
                  >
                    <span className={"h-[7px] w-[7px] shrink-0 rounded-full " + (s.driveConnected ? "bg-text" : "bg-text-faint")} />
                    <span className="flex-1">Google Drive</span>
                    <span className="shrink-0 text-[10.5px] font-normal text-text-faint">{s.driveConnected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}</span>
                    <ChevronRight size={14} className="shrink-0 text-text-faint" />
                  </button>
                )}

                <div className="my-1.5 border-t border-border" />

                <button
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-text transition-colors hover:bg-surface-2"
                  onClick={() => setPanel("theme")}
                >
                  <Palette size={14} className="shrink-0 text-text-dim" />
                  <span className="flex-1">ธีม</span>
                  <ChevronRight size={14} className="shrink-0 text-text-faint" />
                </button>
                <button
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-text transition-colors hover:bg-surface-2"
                  onClick={() => { close(); mutate(st => { st.settingsModalOpen = true; }); }}
                >
                  <Settings size={14} className="shrink-0 text-text-dim" /> ตั้งค่า
                </button>
                {/* ลิงก์ "คีย์ลัดทั้งหมด" ท้าย Sidebar ถูกตัดออก — เมนูนี้เป็นทางเปิด ShortcutsModal ด้วยเมาส์ทางเดียว (นอกจาก Shift+?) */}
                <button
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-text transition-colors hover:bg-surface-2"
                  onClick={() => { close(); mutate(st => { st.shortcutsModalOpen = true; }); }}
                >
                  <Keyboard size={14} className="shrink-0 text-text-dim" /> {t("header.MoreMenu.shortcuts")}
                </button>
              </>
            ) : (
              <>
                <button
                  className="mb-1.5 flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11.5px] font-semibold text-text-dim transition-colors hover:text-text"
                  aria-label="ย้อนกลับไปเมนูเพิ่มเติม"
                  onClick={() => setPanel(null)}
                >
                  <ChevronLeft size={13} /> {panelTitle[panel]}
                </button>
                {panel === "export" && <ExportPanel />}
                {panel === "autosave" && <AutoSavePanel onDone={close} />}
                {panel === "drive" && <DrivePanel onDone={close} />}
                {panel === "theme" && <ThemePickerPanel />}
              </>
            )}
          </div>
        </>
      )}
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
    </div>}
    </Tooltip>
  );
}

/** ปุ่มเปิด/ปิด sidebar — จอ ≥900px ซ่อน/แสดงคอลัมน์ซ้าย, จอแคบกว่านั้น sidebar เป็นลิ้นชักลอย (ดู Sidebar) */
export function toggleSidebarPanel() {
  if (window.matchMedia("(max-width: 899px)").matches) {
    mutate(st => { st.sidebarDrawerOpen = !st.sidebarDrawerOpen; });
  } else {
    mutate(st => { st.sidebarCollapsed = !st.sidebarCollapsed; });
  }
}

export default function Header() {
  const s = useApp();

  return (
    <header
      aria-label="Atelier header"
      className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border px-7 max-[1180px]:grid-cols-[auto_1fr_auto] max-[899px]:h-auto max-[899px]:grid-cols-[1fr_auto] max-[899px]:gap-y-2 max-[899px]:px-4 max-[899px]:py-2.5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
          title="ซ่อน/แสดงแผงตั้งค่า"
          aria-label={s.sidebarCollapsed ? "แสดงแผงตั้งค่า" : "ซ่อนแผงตั้งค่า"}
          onClick={toggleSidebarPanel}
        >
          {s.sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        {/* ไฟล์โลโก้เป็นภาพขาวบนพื้นโปร่ง จึงต้อง invert เฉพาะตอนพื้นหลังสว่างเท่านั้น
          * ใช้ var(--logo-invert) ที่ index.css ตั้งไว้ต่อธีม แทนที่จะเช็ค state.theme ใน JS
          * เพราะถ้าเขียนเงื่อนไขที่นี่ ทุกครั้งที่เพิ่มธีมใหม่จะต้องกลับมาแก้ component นี้ด้วย
          * (drift ทันที) — ปล่อยให้ CSS cascade ตัดสินจาก [data-theme] ที่เดียวจบ */}
        <img
          src="/assets/atelier-logo.png"
          alt="Atelier"
          className="h-[42px] w-[42px] shrink-0 object-contain max-[899px]:h-8 max-[899px]:w-8"
          style={{ filter: "invert(var(--logo-invert))" }}
        />
        <h1 className="truncate text-[15px] font-semibold tracking-[0.2px]">Atelier</h1>
      </div>

      {/* จอแคบ: แท็บโหมดลงแถวที่สองเต็มความกว้าง แล้วเลื่อนแนวนอนในตัวเอง — ทั้งหน้าไม่มี horizontal scroll */}
      <div
        role="tablist"
        aria-label="สลับโหมด"
        className="flex min-w-0 justify-self-center gap-[3px] overflow-x-auto rounded-full border border-border bg-surface p-[3px] max-[899px]:order-last max-[899px]:col-span-2 max-[899px]:w-full max-[899px]:justify-self-stretch"
      >
        {MODES.map(m => {
          const ModeIcon = MODE_ICONS[m];
          return (
            <button
              key={m}
              className={
                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors max-[1180px]:px-3 " +
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
        <MoreMenu />
        <Tooltip
          label={s.apiKey
            ? "ใส่ OpenRouter API Key แล้ว พร้อมสร้างงาน — กดเพื่อเปลี่ยนหรือลบ key"
            : "ยังไม่ได้ใส่ OpenRouter API Key — ลองเล่นได้ก่อน ระบบจะขอ key ตอนกด Generate ครั้งแรก"}
        >
          {describedBy => (
            <button
              className={
                "flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                (s.apiKey
                  ? "border-border text-text-dim hover:border-border-strong hover:text-text"
                  : "border-accent text-text hover:bg-accent hover:text-accent-ink")
              }
              aria-label={s.apiKey ? "API Key: ใส่แล้ว — ตั้งค่า OpenRouter API Key" : "API Key: ยังไม่ได้ใส่ — ใส่ OpenRouter API Key"}
              aria-describedby={describedBy}
              onClick={() => mutate(st => { st.keyModalOpen = true; })}
            >
              <span className={"h-[7px] w-[7px] rounded-full " + (s.apiKey ? "bg-success" : "bg-warning")} aria-hidden />
              <KeyRound size={12} />
              <span className="max-[480px]:hidden">{s.apiKey ? "API Key ใส่แล้ว" : "ใส่ API Key"}</span>
            </button>
          )}
        </Tooltip>
      </div>
    </header>
  );
}
