import { useState } from "react";
import { Bot, Check, HardDrive, ListPlus, Settings, Trash2, TriangleAlert, X } from "lucide-react";
import { assistModelOptions, isKnownModelId, modelListsStillLoading, setAssistModelId, setUserExtraModels } from "../lib/actions";
import { atelierStorageBreakdown, clearStorageKey, estimateAtelierStorageBytes, mutate, useApp } from "../lib/store";
import type { ORModel } from "../lib/types";

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
