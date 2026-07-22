import { useRef } from "react";
import { PanelLeftClose, PanelLeftOpen, Download, Upload } from "lucide-react";
import { MODES, modeLabel } from "../lib/constants";
import { exportSession, importSession, switchMode } from "../lib/actions";
import { mutate, useApp } from "../lib/store";

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
        <div className="grid h-[26px] w-[26px] place-items-center rounded-md bg-accent text-sm font-extrabold text-accent-ink">A</div>
        <h1 className="text-[15px] font-semibold tracking-[0.2px]">
          Atelier <span className="ml-0.5 text-[11px] font-normal uppercase tracking-[1.5px] text-text-faint">image studio</span>
        </h1>
      </div>

      <div className="flex justify-self-center gap-[3px] rounded-full border border-border bg-surface p-[3px]">
        {MODES.map(m => (
          <button
            key={m}
            className={
              "cursor-pointer rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors " +
              (s.mode === m ? "bg-accent text-accent-ink" : "text-text-dim hover:text-text")
            }
            onClick={() => switchMode(m)}
          >
            {modeLabel(m)}
          </button>
        ))}
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
        <button
          className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:border-border-strong"
          title="ตั้งค่า OpenRouter API Key"
          onClick={() => mutate(st => { st.keyModalOpen = true; })}
        >
          <span className={"h-[7px] w-[7px] rounded-full " + (s.apiKey ? "bg-green-400" : "bg-text-faint")} />
          {s.apiKey ? "API Key พร้อมใช้" : "ใส่ API Key"}
        </button>
      </div>
    </header>
  );
}
