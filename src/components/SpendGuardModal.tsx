import { useEffect, useRef } from "react";
import { AlertTriangle, CircleDollarSign, HelpCircle, ShieldAlert, X } from "lucide-react";
import { cancelSpend, confirmSpend } from "../lib/actions";
import { useApp } from "../lib/store";
import type { SpendConfirmRequest } from "../lib/types";

/** ยอดเงินประเมิน — ทศนิยม 4 ตำแหน่งเท่า BakeOffConfirmModal/usage bar เดิม ราคาต่อชิ้นมักต่ำกว่า 1 cent */
function usd(n: number): string {
  return "$" + n.toFixed(4);
}

/**
 * ข้อความหัวเรื่อง/คำอธิบายแยกตาม `reason` ทั้ง 3 ค่า — ห้ามใช้ข้อความกลางๆ อันเดียวทุกเคส เพราะสามเคสนี้
 * ผู้ใช้ต้องตัดสินใจคนละแบบ: "เกินไปแล้ว" (รู้ตัวว่าจ่ายเลยงบไปเท่าไหร่), "batch นี้จะทำให้เกิน"
 * (ตัดจำนวนลงก็ยังพอไหว), "ไม่ทราบราคา" (ยังไม่เกิน แต่ยืนยันยอดไม่ได้จึงต้องถาม)
 */
function reasonCopy(req: SpendConfirmRequest): { title: string; body: string; Icon: typeof ShieldAlert } {
  const cap = req.capUsd;
  const capText = cap === undefined ? "เพดานที่ตั้งไว้" : usd(cap);
  switch (req.reason) {
    case "already-over":
      return {
        Icon: ShieldAlert,
        title: "ยอดสะสมเกินเพดานไปแล้ว",
        body: `ยอดสะสมตอนนี้ (${usd(req.ledgerUsd)}) เกินเพดาน ${capText} ไปก่อนหน้านี้แล้วค่ะ `
          + "ถ้ายิง batch นี้ต่อ ยอดจะยิ่งเกินหนักขึ้น — ยืนยันเฉพาะตอนที่ตั้งใจจริงๆ นะคะ",
      };
    case "over-cap":
      return {
        Icon: AlertTriangle,
        title: "batch นี้จะทำให้เกินเพดาน",
        body: `ยอดสะสมเดิมบวกกับ batch นี้แล้วจะเกินเพดาน ${capText} ค่ะ `
          + "ถ้ายังไม่อยากให้เกิน กดยกเลิกแล้วลดจำนวนหรือเปลี่ยนไปโมเดลที่ถูกกว่าก่อนได้นะคะ",
      };
    case "unknown-cost":
      return {
        Icon: HelpCircle,
        title: "มีบางชิ้นที่คำนวณราคาไม่ได้",
        body: "ยอดเท่าที่คำนวณได้ยังไม่เกินเพดานค่ะ แต่ batch นี้มีชิ้นที่ไม่ทราบราคาปนอยู่ "
          + "จึงยืนยันไม่ได้ว่ายิงแล้วจะเกินเพดานหรือเปล่า — ยอดจริงอาจสูงกว่าที่เห็นนะคะ",
      };
  }
}

/**
 * F4 Spend Guard — โมดัลยืนยันก่อนยิง batch ที่ชน gate ค่าใช้จ่าย (T17)
 *
 * อ่านจาก `state.spendConfirm` ซึ่งเป็น `SpendConfirmRequest | null | undefined` (optional ใน AppState
 * ตาม contract ของ T15) จึงต้องเช็คแบบ falsy ครอบ `undefined` ด้วย ไม่ใช่ `=== null` เฉยๆ
 *
 * ตัวเลขที่แสดงเป็น **snapshot ตอน gate เด้ง** ไม่ live-bind กับ sidebar — ผู้ใช้แก้ prompt/count ระหว่าง
 * โมดัลเปิดอยู่ได้ แต่ที่ยิงจริงคือชุดเดิมที่คำนวณราคาไว้ (ดู confirmSpend ใน actions.ts)
 *
 * ทุก path ของการปิด (X / คลิกนอกกรอบ / ปุ่มยกเลิก) เรียก `cancelSpend()` ตัวเดียวกัน เพราะการปิดเฉยๆ
 * โดยไม่คืนคิวจะทำให้คิวที่ generate() เคลียร์ไปก่อนถึง gate หายเงียบ — cancelSpend เป็นคนคืนให้
 * `confirmSpend`/`cancelSpend` เรียก mutate/toast ให้เองแล้ว ที่นี่จึงห้ามเรียกซ้ำ
 */
export default function SpendGuardModal() {
  const s = useApp();
  const req = s.spendConfirm;
  const cancelRef = useRef<HTMLButtonElement>(null);

  // โฟกัสไปที่ปุ่มยกเลิกตอนเปิด — ตั้งใจไม่โฟกัสปุ่มยืนยัน เพราะโมดัลนี้เด้งขวางกลางทาง ผู้ใช้ที่กด Enter
  // ต่อจากนิสัยเดิมต้องไม่กลายเป็นการอนุมัติเงินโดยไม่ได้อ่าน (หน่วงเล็กน้อยตาม pattern ของ KeyModal)
  useEffect(() => {
    if (req) setTimeout(() => cancelRef.current?.focus(), 50);
  }, [req]);

  if (!req) return null;

  const { title, body, Icon } = reasonCopy(req);
  const projected = req.ledgerUsd + req.batchUsd;
  const cap = req.capUsd;
  const overBy = cap === undefined ? 0 : projected - cap;

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) cancelSpend(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="ยืนยันค่าใช้จ่ายก่อนสร้าง" className="w-[min(440px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-6">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Icon size={16} className="shrink-0 text-danger" /> {title}</h3>
          <button
            ref={cancelRef}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-text-dim transition-colors hover:border-border-strong hover:text-text"
            title="ยกเลิก ไม่สร้าง"
            aria-label="ยกเลิก ไม่สร้าง"
            onClick={cancelSpend}
          >
            <X size={15} />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-text-dim">{body}</p>

        {/* สามตัวเลขหลักที่ต้องเห็นครบก่อนตัดสินใจ: จะจ่ายเพิ่มเท่าไหร่ / สะสมมาแล้วเท่าไหร่ / เพดานเท่าไหร่ */}
        <div className="mb-3 flex flex-col divide-y divide-border rounded-[10px] border border-border">
          <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5">
            <span className="text-[12px] text-text">batch นี้ ({req.itemCount} ชิ้น)</span>
            <span className="shrink-0 font-mono text-[11.5px] text-text">
              ~{usd(req.batchUsd)}
              {req.batchUnknownCount > 0 && <span className="text-danger"> +{req.batchUnknownCount} ชิ้นไม่ทราบราคา</span>}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5">
            <span className="text-[12px] text-text-dim">ยอดสะสมปัจจุบัน</span>
            <span className="shrink-0 font-mono text-[11.5px] text-text-dim">~{usd(req.ledgerUsd)}</span>
          </div>
          <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5">
            <span className="text-[12px] text-text-dim">เพดานที่ตั้งไว้</span>
            <span className="shrink-0 font-mono text-[11.5px] text-text-dim">
              {cap === undefined ? "ไม่ได้ตั้ง" : cap === 0 ? "$0.0000 (ถามทุกครั้ง)" : usd(cap)}
            </span>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between gap-2 rounded-[10px] border border-border-strong bg-surface-2 px-3.5 py-3">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text"><CircleDollarSign size={13} /> รวมหลังยิง batch นี้</span>
          <span className={"shrink-0 font-mono text-[13px] font-semibold " + (overBy > 0 ? "text-danger" : "text-text")}>
            ~{usd(projected)}{overBy > 0 ? " (เกิน " + usd(overBy) + ")" : ""}
          </span>
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-text-faint">
          ทุกยอดเป็น <strong className="font-semibold">ยอดประเมิน</strong> จาก pricing ของโมเดล ไม่ใช่บิลจริงจาก OpenRouter นะคะ
          {req.batchUnknownCount > 0 ? ` — และยังมีอีก ${req.batchUnknownCount} ชิ้นที่คำนวณราคาไม่ได้ ยอดจริงจะสูงกว่านี้` : ""}
        </p>

        <div className="flex flex-col gap-2">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
            onClick={confirmSpend}
          >
            <CircleDollarSign size={14} /> ยืนยัน — สร้างต่อ {req.itemCount} ชิ้น
          </button>
          <button
            className="flex w-full cursor-pointer items-center justify-center rounded-lg py-1.5 text-[12px] font-medium text-text-faint transition-colors hover:text-text"
            onClick={cancelSpend}
          >
            ยกเลิก ไม่สร้าง
          </button>
        </div>
      </div>
    </div>
  );
}
