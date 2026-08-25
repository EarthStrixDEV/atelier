import { useEffect, useRef, useState } from "react";
import { Bot, Check, Database, HardDrive, ListPlus, Settings, Trash2, TriangleAlert, X } from "lucide-react";
import { assistModelOptions, isKnownModelId, modelListsStillLoading, setAssistModelId, setUserExtraModels } from "../lib/actions";
import { atelierStorageBreakdown, clearStorageKey, estimateAtelierStorageBytes, mutate, toast, useApp } from "../lib/store";
import type { ORModel } from "../lib/types";
import { GALLERY_MAX_ITEMS_PER_MODE, GALLERY_MAX_TOTAL_BYTES } from "../lib/constants";
import { clearAllPersistedItems, getGalleryUsage, isGalleryPersistEnabled, setGalleryPersistEnabled } from "../lib/galleryStore";

/** โชว์ขนาดเป็นหน่วยที่อ่านง่าย — localStorage เต็มปกติจะอยู่หลัก KB ไม่ต้องรองรับหน่วยใหญ่กว่า MB */
function fmtBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

/**
 * per-key breakdown ของ localStorage (PHASE 15) — ต่อจากตัวเลขรวมเดิม โชว์ทีละ key พร้อมปุ่มลบเฉพาะแถว
 * re-compute breakdown ใหม่ทุกครั้งที่ list เปลี่ยน (หลังลบ) ด้วย local `refreshTick` เพราะ atelierStorageBreakdown
 * อ่านตรงจาก localStorage — ไม่ได้อยู่ใน AppState ที่ useApp() subscribe อยู่แล้ว จึงต้อง force re-render เอง
 */
function StorageBreakdown() {
  const [refreshTick, setRefreshTick] = useState(0);
  const rows = atelierStorageBreakdown();

  const handleClear = (key: string) => {
    clearStorageKey(key);
    setRefreshTick(t => t + 1);
  };

  if (!rows.length) {
    return <p className="mt-2 text-[11px] text-text-faint">ยังไม่มีข้อมูลใน localStorage ค่ะ</p>;
  }

  return (
    <div className="mt-2 flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
      {rows.map(r => (
        <div key={r.key + refreshTick} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11.5px] text-text" title={r.key}>{r.label}</div>
            <div className="truncate font-mono text-[9.5px] text-text-faint" title={r.key}>{r.key}</div>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-text-dim">{fmtBytes(r.bytes)}</span>
          <button
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md border border-border text-text-faint transition-colors hover:border-danger hover:text-danger"
            title={`ลบ ${r.label}`}
            aria-label={`ลบ ${r.label}`}
            onClick={() => handleClear(r.key)}
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** ป้ายโหมดสั้นๆ สำหรับ breakdown ต่อโหมด — MODE_META.title ยาวเกินไปสำหรับบรรทัดเดียว */
const MODE_LABEL: Record<string, string> = {
  home: "ภาพ",
  infographic: "Infographic",
  video: "วิดีโอ",
  cinematic: "Cinematic",
  audio: "เสียง",
};

/**
 * === F2 opt-in UI (T21) ===
 * galleryStore.ts มี API ครบตั้งแต่ T6 แต่ไม่มี UI ไหนเรียก setGalleryPersistEnabled เลย → ฟีเจอร์ปิดสนิท
 * ที่นี่คือจุดเดียวในแอปที่ผู้ใช้เปิดมันได้ และตั้งใจให้อยู่ในหน้า Settings เพราะเป็นการ **ยกเว้น** นโยบาย
 * memory-only ของแอป ไม่ใช่ค่า default ที่ควรเจอโดยบังเอิญ
 *
 * === DECISION: confirm ตอน "ปิด" ด้วย ไม่ใช่แค่ตอนล้าง ===
 * setGalleryPersistEnabled(false) เรียก clearAllPersistedItems() ทันที — ปุ่ม toggle จึงเป็น destructive
 * action ที่หน้าตาไม่ destructive เลย ผู้ใช้ที่เก็บของไว้ 400MB แล้วเผลอกด = เสียของถาวร กู้ไม่ได้
 * (ไม่มี undo, media ไม่ได้อยู่ที่อื่น) จึงต้อง confirm — **แต่ confirm เฉพาะตอนมีของจริง** (count > 0)
 * ผู้ใช้ที่เพิ่งเปิดแล้วเปลี่ยนใจปิด (0 ชิ้น) ไม่มีอะไรให้เสีย การถามจะเป็น dialog ขยะทันที
 *
 * === DECISION: เรียก getGalleryUsage() ตอนไหน ===
 * component นี้ mount เฉพาะตอน SettingsModal เปิดอยู่ (parent เป็น `{s.settingsModalOpen && …}`) → useEffect
 * ตอน mount จึงเท่ากับ "ตอนเปิดหน้า Settings" พอดี ไม่ใช่ตอน boot แอป
 * refresh อีกทีเฉพาะหลัง action ที่เปลี่ยนข้อมูลจริง (toggle / ล้าง) — ไม่มี polling เพราะ getGalleryUsage
 * ทำ getAll() ทั้ง store (อ่าน Blob ขึ้นมาด้วย) แพงเกินจะรันซ้ำๆ เอง
 */
function GalleryPersistSettings() {
  const [enabled, setEnabled] = useState(() => isGalleryPersistEnabled());
  const [usage, setUsage] = useState<{ count: number; bytes: number; perMode: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  // unmount ระหว่าง await ได้จริง (ผู้ใช้ปิด modal ตอนกำลังล้าง) — กัน setState หลัง unmount
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const refreshUsage = () => {
    getGalleryUsage().then(u => { if (aliveRef.current) setUsage(u); });
  };

  useEffect(refreshUsage, []);

  /**
   * ทั้ง toggle และปุ่มล้างเป็น async — `busy` ทำหน้าที่เป็น lock ตัวเดียวคุมทั้งสองปุ่ม
   * (disabled ทั้งคู่ระหว่างทำงาน) เพราะสองงานนี้แตะ store เดียวกัน กดสลับรัวๆ = transaction ซ้อนกัน
   * และผลลัพธ์ที่ผู้ใช้เห็นจะสลับไปมาแบบเดาไม่ได้ การ lock ทั้งแผงตรงไปตรงมากว่า queue
   */
  const toggle = async () => {
    if (busy) return;
    const next = !enabled;
    if (!next && (usage?.count ?? 0) > 0) {
      const ok = window.confirm(
        `ปิดแล้วผลงานที่เก็บไว้ ${usage!.count} ชิ้น (${fmtBytes(usage!.bytes)}) จะถูกลบออกจากเครื่องทันที กู้คืนไม่ได้นะคะ — ยืนยันไหมคะ?`
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await setGalleryPersistEnabled(next);
      if (!aliveRef.current) return;
      setEnabled(next);
      toast(next ? "เปิดเก็บผลงานลงเครื่องแล้วค่ะ — ผลงานที่ generate ต่อจากนี้จะอยู่ครบหลังปิดแท็บ" : "ปิดแล้วค่ะ ผลงานที่เก็บไว้ถูกลบออกจากเครื่องเรียบร้อย");
      refreshUsage();
    } catch (e) {
      // setGalleryPersistEnabled โยน error เฉพาะกรณีเปิดไม่สำเร็จเพราะ localStorage ถูกปิด
      if (!aliveRef.current) return;
      setEnabled(isGalleryPersistEnabled()); // sync กลับกับความจริงบนดิสก์ ไม่ใช่กับสิ่งที่ตั้งใจจะเป็น
      toast(e instanceof Error ? e.message : "เปลี่ยนการตั้งค่าไม่สำเร็จค่ะ");
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const clearAll = async () => {
    if (busy || !usage?.count) return;
    const ok = window.confirm(
      `ลบผลงานที่เก็บไว้ในเครื่องทั้ง ${usage.count} ชิ้น (${fmtBytes(usage.bytes)}) ใช่ไหมคะ? กู้คืนไม่ได้ แต่การเก็บจะยังเปิดอยู่ค่ะ`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await clearAllPersistedItems();
      if (!aliveRef.current) return;
      toast("ล้างผลงานที่เก็บไว้ในเครื่องแล้วค่ะ");
      refreshUsage();
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const perModeRows = usage
    ? Object.entries(usage.perMode).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[12px] text-text-dim">
            <Database size={13} /> เก็บผลงานไว้ในเครื่อง
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="เก็บผลงานไว้ในเครื่อง"
          disabled={busy}
          onClick={toggle}
          className={
            "relative mt-[1px] h-[20px] w-[36px] shrink-0 cursor-pointer rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
            (enabled ? "border-accent bg-accent" : "border-border-strong bg-bg")
          }
        >
          <span
            className={
              "absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all " +
              (enabled ? "left-[19px] bg-accent-ink" : "left-[2px] bg-text-faint")
            }
          />
        </button>
      </div>

      <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-faint">
        ปกติภาพ/วิดีโอที่ generate อยู่ในหน่วยความจำเท่านั้น ปิดแท็บแล้วหายหมด (session snapshot เก็บแค่ prompt/ค่าตั้ง ไม่ได้เก็บไฟล์)
        เปิดอันนี้แล้วไฟล์จริงจะถูก<strong className="font-semibold text-text-dim">เขียนลงเครื่องถาวร</strong>ผ่าน IndexedDB
        และโหลดกลับมาให้เองตอนเปิดแอปครั้งหน้า — เก็บได้สูงสุด {GALLERY_MAX_ITEMS_PER_MODE} ชิ้นต่อโหมด รวมไม่เกิน {fmtBytes(GALLERY_MAX_TOTAL_BYTES)} (เกินแล้วลบของเก่าสุดที่ไม่ติดดาวออกให้)
      </p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-text-faint">
        <strong className="font-semibold text-danger">ปิดเมื่อไหร่ ข้อมูลที่เก็บไว้ถูกลบทันที</strong> — ไม่ใช่แค่หยุดเขียนเพิ่มค่ะ
        รูป reference ที่อัปโหลดเองและ API Key ไม่ถูกเก็บลงเครื่องไม่ว่ากรณีไหน
      </p>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-[11px] text-text-dim">
          {usage === null
            ? "กำลังอ่านพื้นที่ที่ใช้…"
            : usage.count === 0
              ? "ยังไม่มีผลงานเก็บไว้ในเครื่องค่ะ"
              : <>เก็บอยู่ <span className="font-mono text-text">{usage.count}</span> ชิ้น · <span className="font-mono text-text">{fmtBytes(usage.bytes)}</span></>}
        </span>
        <button
          type="button"
          disabled={busy || !usage?.count}
          onClick={clearAll}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-dim"
        >
          <Trash2 size={11} /> ล้างข้อมูล
        </button>
      </div>

      {perModeRows.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-faint">
          {perModeRows.map(([mode, n]) => (
            <span key={mode}>{MODE_LABEL[mode] ?? mode} <span className="font-mono text-text-dim">{n}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}

/** ตรวจ shape ของ entry หนึ่งตัวว่าพอจะเป็น ORModel ได้ไหม (id string ไม่ว่างเป็นข้อบังคับเดียว ฟิลด์อื่น optional เหมือน EXTRA_MODELS จริง) */
function isValidModelEntry(x: unknown): x is ORModel {
  return !!x && typeof x === "object" && typeof (x as ORModel).id === "string" && !!(x as ORModel).id.trim();
}

/**
 * ช่อง "เพิ่มโมเดลเอง" สำหรับใส่โมเดลแบบ JSON array รูปแบบเดียวกับ EXTRA_MODELS/AUDIO_EXTRA_MODELS ใน constants.ts
 * validate id เทียบกับ model list ที่ fetch มาแล้ว (ถ้ายังโหลดไม่เสร็จ — defer ไม่ฟันธงว่า invalid) แล้วเตือนก่อนเซฟ
 * แต่ยังกด "เซฟถึงจะเตือน" (force save) ได้เสมอ เผื่อโมเดลใหม่จริงๆ ที่ OpenRouter ยังไม่ list
 */
/** ตัวอย่างที่ผ่าน isValidModelEntry จริง ให้ผู้ใช้กดแทรกแล้วแก้ค่าต่อได้ทันที */
const EXAMPLE_EXTRA_MODEL_JSON = `[
  {
    "id": "vendor/model-name",
    "name": "Vendor: Model Name",
    "architecture": { "output_modalities": ["image"] },
    "pricing": { "image": "0.004" }
  }
]`;

function ExtraModelsEditor() {
  const s = useApp();
  const [text, setText] = useState(() => JSON.stringify(s.userExtraModels, null, 2));
  const [parseError, setParseError] = useState("");
  const [unknownIds, setUnknownIds] = useState<string[]>([]);
  const [forceConfirm, setForceConfirm] = useState(false);

  const deferValidation = modelListsStillLoading();

  const validateAndMaybeSave = (force: boolean) => {
    setParseError("");
    setUnknownIds([]);
    const raw = text.trim();
    if (!raw) { setUserExtraModels([]); setForceConfirm(false); return; }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setParseError("JSON ไม่ถูกต้องค่ะ — ต้องเป็น array ของ object เช่น [{\"id\": \"vendor/model\"}]");
      return;
    }
    if (!Array.isArray(parsed)) {
      setParseError("ต้องเป็น JSON array ค่ะ (แม้มีโมเดลเดียวก็ต้องห่อด้วย [ ])");
      return;
    }
    const invalidEntries = parsed.filter(x => !isValidModelEntry(x));
    if (invalidEntries.length) {
      setParseError(`มี ${invalidEntries.length} รายการที่ไม่มี "id" เป็น string ค่ะ — เอาออกหรือแก้ก่อนนะคะ`);
      return;
    }
    const list = parsed as ORModel[];
    // ยังไม่โหลด list เสร็จ — defer การเตือน id ไม่รู้จัก ไปเลยเซฟตรงๆ (ไม่ฟันธงว่า invalid ทั้งที่แค่โหลดไม่ทัน)
    if (!force && !deferValidation) {
      const unknown = list.map(m => m.id).filter(id => !isKnownModelId(id));
      if (unknown.length) { setUnknownIds(unknown); setForceConfirm(true); return; }
    }
    setUserExtraModels(list);
    setForceConfirm(false);
    setUnknownIds([]);
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="extra-models-json" className="flex items-center gap-1.5 text-[12px] text-text-dim">
          <ListPlus size={13} /> เพิ่มโมเดลเอง (JSON)
        </label>
        {/* ให้ตัวอย่างที่แก้ต่อได้เลย — textarea เปล่ากับ placeholder ที่หายตอนโฟกัส
            ทำให้คนที่ไม่ถนัด JSON ไม่รู้จะเริ่มยังไง */}
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded-md border border-border px-2 py-1 text-[10.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
          title="ใส่ตัวอย่างที่ใช้งานได้จริงลงในช่อง แล้วแก้ค่าตามต้องการ"
          onClick={() => {
            setText(EXAMPLE_EXTRA_MODEL_JSON);
            setForceConfirm(false);
            setParseError("");
            setUnknownIds([]);
          }}
        >
          แทรกตัวอย่าง
        </button>
      </div>
      <p className="mt-1 text-[10.5px] leading-relaxed text-text-faint">
        รูปแบบเดียวกับ EXTRA_MODELS ในโค้ด — array ของ {"{"}"id", "name", "pricing", "architecture"{"}"}  จะถูก merge เข้ารายชื่อโมเดลเดิมโดยไม่ให้ id ซ้ำค่ะ
      </p>
      <textarea
        id="extra-models-json"
        value={text}
        onChange={e => { setText(e.target.value); setForceConfirm(false); setParseError(""); setUnknownIds([]); }}
        spellCheck={false}
        rows={5}
        placeholder='[{"id": "vendor/model-name", "name": "Vendor: Model Name", "architecture": {"output_modalities": ["image"]}}]'
        aria-label="เพิ่มโมเดลเอง — JSON array"
        className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text outline-none transition-colors focus:border-accent"
      />
      {parseError && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-danger">
          <TriangleAlert size={12} className="mt-[1.5px] shrink-0" /> {parseError}
        </div>
      )}
      {forceConfirm && unknownIds.length > 0 && (
        <div className="mt-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[11px] leading-relaxed text-danger">
          ไม่พบ id ต่อไปนี้ใน model list ที่โหลดมาค่ะ: {unknownIds.join(", ")} — อาจพิมพ์ผิด หรือเป็นโมเดลใหม่ที่ OpenRouter ยังไม่ list ก็ได้
          <button
            type="button"
            className="mt-1.5 block cursor-pointer font-semibold underline decoration-dotted"
            onClick={() => validateAndMaybeSave(true)}
          >
            เข้าใจแล้ว เซฟถึงจะเตือนก็ตาม
          </button>
        </div>
      )}
      {deferValidation && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-faint">
          รายชื่อโมเดลยังโหลดไม่เสร็จ — จะเซฟให้ก่อนโดยยังไม่เช็ค id ซ้ำกับ OpenRouter ค่ะ
        </p>
      )}
      <button
        type="button"
        className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
        onClick={() => validateAndMaybeSave(false)}
      >
        <Check size={12} /> บันทึกโมเดลเพิ่มเติม
      </button>
    </div>
  );
}

/**
 * Settings modal — ย้ายมาจากส่วน "Advanced" ที่เคยยุบ/ขยายอยู่ใต้ KeyModal (PHASE 16)
 * รวม storage breakdown / เลือกโมเดลผู้ช่วย AI / เพิ่มโมเดลเอง — เปิดได้ทั้งจากปุ่มใน Header โดยตรง
 * และจากปุ่ม "ตั้งค่าเพิ่มเติม" ใน KeyModal (คนละโมดัลกับ API Key แล้ว ไม่ผูกกับการมี/ไม่มี key)
 */
export default function SettingsModal() {
  const s = useApp();
  if (!s.settingsModalOpen) return null;

  const close = () => mutate(st => { st.settingsModalOpen = false; });

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="ตั้งค่า Atelier" className="w-[min(440px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-7">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Settings size={16} /> ตั้งค่า</h3>
          <button className="cursor-pointer text-text-faint hover:text-text" onClick={close} title="ปิด" aria-label="ปิดหน้าต่างตั้งค่า">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[12px] text-text-dim">
                <HardDrive size={13} /> พื้นที่ localStorage ที่ใช้อยู่
              </span>
              <span className="font-mono text-[12px] text-text">{fmtBytes(estimateAtelierStorageBytes())}</span>
            </div>
            <StorageBreakdown />
          </div>

          <GalleryPersistSettings />

          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <label htmlFor="assist-model-select" className="flex items-center gap-1.5 text-[12px] text-text-dim">
              <Bot size={13} /> โมเดลผู้ช่วย AI (Optimizer / Chat / Grill me)
            </label>
            <select
              id="assist-model-select"
              value={s.assistModelId ?? ""}
              onChange={e => setAssistModelId(e.target.value || null)}
              className="mt-2 w-full cursor-pointer rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text outline-none transition-colors focus:border-accent"
            >
              <option value="">ค่าเริ่มต้น (openai/gpt-oss-20b:free)</option>
              {assistModelOptions().map(m => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-faint">
              ถ้าโมเดลนี้ถูกถอด/rate limit ระบบจะ fallback ไปโมเดลเริ่มต้นให้อัตโนมัติ (แจ้งเตือนครั้งแรกที่เกิดค่ะ)
            </p>
          </div>

          <ExtraModelsEditor />
        </div>
      </div>
    </div>
  );
}
