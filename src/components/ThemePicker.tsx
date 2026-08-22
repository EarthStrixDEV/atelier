import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { resolveTheme, setTheme } from "../lib/actions";
import { THEMES, THEME_ORDER } from "../lib/themes";
import { useApp } from "../lib/store";
import type { ThemeId, ThemeMeta, ThemeTokens } from "../lib/types";

/**
 * F3 · T8 — Theme picker popover
 *
 * แยกออกมาจาก Header.tsx เพราะไฟล์นั้นยาว 500+ บรรทัดและมี control อยู่แล้ว 4 ตัว
 * แต่ **pattern ข้างในเหมือน ExportControl/AutoSaveControl/SpendGuardControl เป๊ะ** ตั้งใจไม่คิดใหม่:
 * useState(open) + backdrop `fixed inset-0 z-40` + panel `absolute right-0 top-[calc(100%+6px)] z-50`
 */

/**
 * แถวหนึ่งของ picker ต้องรู้ว่า "จะเอาสีจาก palette ไหนมาวาด swatch"
 *
 * `"system"` ไม่มี palette ของตัวเอง (`meta.swatch === null` ตาม contract ของ themes.ts) จึงต้อง
 * ยืมของธีมที่ resolve ได้ ณ ตอนนี้ — ทำแบบนี้แล้วแถว System เปลี่ยน swatch ตาม OS จริง ไม่ใช่
 * ช่องว่างหรือสีปลอมที่ไม่สื่ออะไร ส่วนธีมอื่นใช้ palette ของตัวเองตรงๆ
 *
 * คืน field ที่จะวาดกลับมาด้วย ไม่ hardcode `["bg","surface","accent"]` ซ้ำที่นี่ — ลำดับและ
 * จำนวนช่องเป็นของ `THEME_ORDER` ถ้าวันหนึ่งมีธีมที่อยากโชว์ 4 ช่อง แก้ที่ themes.ts ที่เดียวจบ
 */
function swatchColors(meta: ThemeMeta, systemResolved: ThemeId): string[] {
  const paletteId = meta.swatch === null ? systemResolved : meta.id;
  // paletteId ณ จุดนี้ไม่มีทางเป็น "system" แล้ว (ถ้า swatch เป็น null เราแทนด้วยค่าที่ resolve มาแล้ว)
  // แต่ TS ยังเห็นเป็น ThemeId เต็ม จึง guard ไว้แทนการ cast — กัน THEME_ORDER แถวใหม่ที่ลืมใส่ swatch
  const def = paletteId === "system" ? undefined : THEMES[paletteId];
  if (!def) return [];
  const fields: readonly (keyof ThemeTokens)[] = meta.swatch ?? ["bg", "surface", "accent"];
  return fields.map(f => def.tokens[f]);
}

export default function ThemePicker() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  // ref ของทุกแถว — ใช้ย้าย DOM focus ตอนกดลูกศร (roving focus) ไม่ได้เก็บ "แถวที่ถูกเลือก" ไว้เป็น state ซ้อน
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);

  /**
   * Escape ปิด popover — ผูกที่ document เหมือน CompareModal/ExtendTool ไม่ใช่ onKeyDown ของ panel
   * เพราะตอนเพิ่งเปิด focus ยังอยู่ที่ปุ่มเปิด (นอก panel) การผูกที่ panel จะทำให้ Escape ไม่ทำงาน
   * จนกว่าจะกด Tab เข้าไปก่อน แล้วคืน focus กลับปุ่มเปิด เพื่อไม่ให้ focus หล่นไปที่ <body>
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // เปิดแล้วโยน focus เข้าแถวธีมที่ใช้อยู่ทันที — คนใช้คีย์บอร์ดจะได้กดลูกศรต่อได้เลยโดยไม่ต้อง Tab ไล่
  useEffect(() => {
    if (!open) return;
    const i = THEME_ORDER.findIndex(t => t.id === s.theme);
    rowRefs.current[i < 0 ? 0 : i]?.focus();
    // ตั้งใจไม่ใส่ s.theme ใน deps — ต้องการโฟกัสครั้งเดียวตอน "เปิด" ถ้าใส่ด้วย การเลือกธีม
    // จะดึง focus กระโดดไปมาระหว่างที่ popover ยังเปิดอยู่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const systemResolved = resolveTheme("system");
  const currentMeta = THEME_ORDER.find(t => t.id === s.theme);

  const choose = (id: ThemeId) => {
    setTheme(id); // ตัวเดียวจบ: mutate + persist + ทา data-theme (ห้ามเรียก saveTheme/applyTheme แยก)
    setOpen(false);
    btnRef.current?.focus();
  };

  /** ลูกศรขึ้น/ลง วนรอบ + Home/End — pattern มาตรฐานของ menu ที่คนใช้ screen reader คาดหวัง */
  const onRowKey = (e: React.KeyboardEvent, i: number) => {
    const n = THEME_ORDER.length;
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault(); // กันหน้าเลื่อนตามลูกศร
    rowRefs.current[next]?.focus();
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
        title="เปลี่ยนธีมสีของแอป"
        aria-label={"เลือกธีมสี — ตอนนี้ใช้ " + (currentMeta?.label ?? s.theme)}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => !v)}
      >
        <Palette size={12} /> ธีม
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="รายการธีมสี"
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-[10px] border border-border-strong bg-surface p-2 shadow-[0_12px_40px_rgba(0,0,0,.16)]"
          >
            {THEME_ORDER.map((meta, i) => {
              const active = meta.id === s.theme;
              const colors = swatchColors(meta, systemResolved);
              // แถว System ต้องบอกว่า "ตอนนี้ resolve เป็นอะไร" ไม่ใช่คำว่า System ลอยๆ (AC) —
              // ค่าที่ resolve ได้เปลี่ยนตาม OS จึงอ่านจาก resolveTheme() ทุกครั้งที่ render ไม่ cache
              const hint = meta.swatch === null
                ? meta.hint + " — ตอนนี้เป็น" + (THEMES[systemResolved].colorScheme === "dark" ? "โหมดมืด" : "โหมดสว่าง")
                : meta.hint;
              return (
                <button
                  key={meta.id}
                  ref={el => { rowRefs.current[i] = el; }}
                  role="menuitemradio"
                  aria-checked={active}
                  aria-label={"ใช้ธีม " + meta.label + " — " + hint + (active ? " (กำลังใช้อยู่)" : "")}
                  tabIndex={0}
                  className={
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors "
                    + (active ? "bg-surface-2" : "hover:bg-surface-2")
                  }
                  onClick={() => choose(meta.id)}
                  onKeyDown={e => onRowKey(e, i)}
                >
                  {/* swatch = สีจริงจาก THEMES ไม่ใช่ utility class — ค่าพวกนี้เป็น "ข้อมูลของธีมอื่น"
                    * ที่ต้องแสดงพร้อมกันในธีมปัจจุบัน จึงต้องเป็น inline style ไม่มีทางเป็น token
                    * ของหน้าจอตอนนี้ได้ (7 ธีมพร้อมกันใน 1 หน้าจอ) — ไม่ใช่การ hardcode สี */}
                  <span
                    className="flex shrink-0 overflow-hidden rounded-md border border-border-strong"
                    aria-hidden="true"
                  >
                    {colors.map((c, ci) => (
                      <span key={ci} className="h-[18px] w-[9px]" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-text">{meta.label}</span>
                    <span className="block truncate text-[10.5px] text-text-faint">{hint}</span>
                  </span>
                  {/* indicator เป็น "รูปทรง" ไม่ใช่สีอย่างเดียว — ธีม high-contrast และคนตาบอดสี
                    * ต้องแยกออกว่าแถวไหนถูกเลือก การพึ่งพื้นหลังเข้มขึ้นอย่างเดียวไม่พอ */}
                  <Check
                    size={14}
                    className={"shrink-0 text-accent " + (active ? "" : "invisible")}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
