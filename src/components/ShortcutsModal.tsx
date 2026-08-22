import { Keyboard, X } from "lucide-react";
import { MODES, modeLabel } from "../lib/constants";
import { mutate, useApp } from "../lib/store";

const ROW_CLASS = "flex items-center justify-between gap-4 py-2";
const KEY_CLASS = "rounded-md border border-border-strong bg-surface-2 px-2 py-1 font-mono text-[11px] text-text";

export default function ShortcutsModal() {
  const s = useApp();
  if (!s.shortcutsModalOpen) return null;

  const close = () => mutate(st => { st.shortcutsModalOpen = false; });

  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-overlay backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="w-[min(420px,calc(100vw-40px))] rounded-[14px] border border-border-strong bg-surface p-7">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Keyboard size={16} /> ปุ่มลัดคีย์บอร์ด</h3>
          <button className="cursor-pointer text-text-faint hover:text-text" onClick={close} title="ปิด">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-text-dim">
          ปุ่มลัดจะไม่ทำงานระหว่างพิมพ์อยู่ในช่อง input/textarea (ยกเว้น Ctrl+Enter) และปิดทั้งหมดขณะเปิด API Key / Chat / Grill me ค่ะ
        </p>
        <div className="divide-y divide-border">
          <div className={ROW_CLASS}>
            <span className="text-[12.5px] text-text-dim">สั่ง Generate</span>
            <span className={KEY_CLASS}>Ctrl + Enter</span>
          </div>
          <div className={ROW_CLASS}>
            <span className="text-[12.5px] text-text-dim">โฟกัสช่อง Prompt</span>
            <span className={KEY_CLASS}>/</span>
          </div>
          <div className={ROW_CLASS}>
            <span className="text-[12.5px] text-text-dim">เปิด/ปิดหน้านี้</span>
            <span className={KEY_CLASS}>Shift + ?</span>
          </div>
          {MODES.map((m, i) => (
            <div key={m} className={ROW_CLASS}>
              <span className="text-[12.5px] text-text-dim">สลับไปโหมด {modeLabel(m)}</span>
              <span className={KEY_CLASS}>{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
