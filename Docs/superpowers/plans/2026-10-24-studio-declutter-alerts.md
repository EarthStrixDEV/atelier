# Studio Declutter + SweetAlert2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้าย hint ที่แปะค้างไปหลังไอคอน ⓘ, ตัด widget ที่ไม่จำเป็น, ใช้ SweetAlert2 กับ dialog ยืนยันแบบง่ายผ่าน helper กลาง และปรับ `Toast.tsx` ให้เข้าชุดและใช้งานได้ระหว่าง dialog เปิด

**Architecture:** `lib/alerts.ts` ห่อ SweetAlert2 เป็น `confirmAction()` ตัวเดียวที่ทุกจุดยืนยันเรียก (ธีมผ่าน Tailwind token classes + override ใน `index.css`) `Toast.tsx` ยังเป็นตัวแสดง toast แต่ portal ไปที่ `<body>` และยก z-index เหนือ Swal `InfoHint.tsx` ต่อยอด `Tooltip.tsx` เดิมเป็นปุ่ม ⓘ ที่ใช้แทนย่อหน้าช่วยเหลือ

**Tech Stack:** React 19, TypeScript strict, Tailwind v4, Vite, `sweetalert2` (ใหม่), `lucide-react`

**Spec:** `Docs/superpowers/specs/2026-10-24-studio-declutter-alerts-design.md` — อ่านคู่กันเสมอ ตารางว่าข้อความไหนย้าย/คงไว้อยู่ในสเปก

## Global Constraints

- `npm run build` (tsc strict + vite build) ต้องผ่านหลังทุก task — ไม่มี test suite ในโปรเจกต์ และแผนนี้ไม่เพิ่ม
- ห้าม hardcode สี — ใช้ utility จากโทเคน (`bg-surface`, `text-text-dim`, `bg-danger`, `bg-overlay`, …) หรือ `var(--color-*)` ต้องดูถูกต้องครบ 7 ธีม
- ข้อความ UI ใหม่ผ่าน `t()` ใน `lib/i18n.ts` ใส่ key ทั้ง `th` และ `en` ตาม naming `{page|shared}.{Component}.{purpose}`
- ไม่เปลี่ยนเนื้อหาของ hint — แค่ย้ายที่แสดง
- ไม่แก้จุดเรียก `toast()` และไม่เปลี่ยน signature `toast(msg, variant)`
- ไม่แตะ `BakeOffConfirmModal`, `SpendGuardModal` (ยกเว้นย้ายหมายเหตุท้าย modal ใน Task 5), `ImportPreviewModal` (เช่นกัน), หน้า Landing, หน้า /models
- ข้อความเตือนที่ขึ้นตามสถานการณ์ (รายการ "conditional" ในสเปก) ต้องยังโชว์ inline
- ป้ายค่าใช้จ่าย `SpendGuardControl` คงโชว์ตลอด
- ทดสอบใน browser ที่ `http://localhost:<port>/studio`; ทดสอบ focus/คีย์ด้วยการกดจริง (`.focus()`/`dispatchEvent` ไม่ trigger `:focus-visible` หรือ React handler)

## Review Focus

1. **Toast ระหว่าง dialog เปิด** — งาน gen จบ/ล้มขณะ dialog ลบเปิดอยู่: dialog ต้องไม่ปิด, toast ต้องเห็นเหนือ backdrop และ error ต้องถูกประกาศ (Task 3 Step 3)
2. **ปุ่มลัดใต้ dialog** — กดเลข `1..N` หรือ `Ctrl+Enter` ตอน dialog เปิด ต้องไม่สลับโหมด/ไม่ generate (Task 1 Step 6)
3. **Enter ทันทีหลัง dialog ลบเปิด** — ต้องเป็นการยกเลิก ไม่ใช่ลบ และโฟกัสกลับปุ่มที่เปิด (Task 1 Step 6)
4. **ธีมมืด** — dialog และ toast ในธีม `ink` / `midnight` / `contrast` อ่านออก ไม่มีสีขาวค้างจาก CSS ของ Swal (Task 1 Step 6, Task 3 Step 3)
5. **tooltip ถูกตัดขอบ** — ⓘ ใน sidebar และใน modal ที่จอ 360px tooltip ต้องอ่านได้ครบ ไม่ทำให้เกิด horizontal scroll (Task 4 Step 5, Task 5 Step 3)

---

### Task 1: `lib/alerts.ts` + ย้ายการยืนยันลบใน Gallery

**Files:**
- Modify: `package.json` (เพิ่ม `sweetalert2`)
- Create: `src/lib/alerts.ts`
- Modify: `src/index.css` (override `.swal2-*` ด้วยโทเคน)
- Modify: `src/lib/shortcuts.ts:29-31` (guard)
- Modify: `src/components/Gallery.tsx:~1209-1256, ~1466`
- Delete: `src/components/ConfirmModal.tsx`
- Modify: `CLAUDE.md` (รายการ components + Conventions)

**Interfaces:**
- Produces:
  - `export interface ConfirmOptions { title: string; body: string; warning?: string; confirmLabel: string; danger?: boolean }` (`danger` ค่าเริ่มต้น `true`)
  - `export function confirmAction(opts: ConfirmOptions): Promise<boolean>` — `true` เฉพาะกดยืนยัน; Escape / คลิกนอก / ยกเลิก = `false`
  - `export function isConfirmOpen(): boolean` — ห่อ `Swal.isVisible()`
  - `export const TOAST_ROOT_ID = "toast-root"` — Task 3 ใช้

- [ ] **Step 1: ติดตั้ง dependency**

Run: `npm install sweetalert2`
Expected: `package.json` มี `"sweetalert2"` ใน `dependencies`

- [ ] **Step 2: เขียน `src/lib/alerts.ts`**

ค่าตั้งที่ต้องมีใน `Swal.fire`:
- `icon` ไม่ใช้ (ใช้ title ตรง ๆ ให้ minimal เหมือน `ConfirmModal` เดิม)
- `showCancelButton: true`, `focusCancel: true`, `returnFocus: true`, `allowOutsideClick: true`, `allowEscapeKey: true`
- `buttonsStyling: false` + `customClass` ด้วย Tailwind token utilities — ยก class จาก `ConfirmModal.tsx` เดิม: popup `rounded-[14px] border border-border-strong bg-surface text-text`, ปุ่มยืนยัน (danger) `bg-danger text-accent-ink`, ปุ่มยืนยัน (ไม่ danger) `bg-accent text-accent-ink`, ปุ่มยกเลิก `text-text-faint hover:text-text`
- `html`: สร้างเป็น `HTMLElement` ด้วย `document.createElement` + `textContent` (ห้ามต่อ string เป็น HTML — body มีตัวเลข/ชื่อที่มาจากข้อมูลผู้ใช้) — `<p>` body ใส่ `whitespace-pre-line` เพราะ body เดิมขึ้นบรรทัดด้วย `\n`; ถ้ามี `warning` เพิ่ม `<p>` สไตล์เดียวกับแถบ danger ใน `ConfirmModal.tsx:95`
- ข้อความปุ่มยกเลิกใช้ `t("gallery.delete.cancel")` ที่มีอยู่แล้ว (หรือย้ายเป็น `shared.confirm.cancel` ถ้าจะใช้ข้ามไฟล์ — เพิ่ม key ทั้ง th/en)
- `didOpen`: ลบ `aria-hidden` ออกจาก `document.getElementById(TOAST_ROOT_ID)` (Swal ซ่อนลูกทุกตัวของ `<body>` จาก screen reader — ดู Task 3)
- คืน `result.isConfirmed`

Import CSS ฐานของ Swal ในไฟล์นี้: `import "sweetalert2/dist/sweetalert2.min.css";`

- [ ] **Step 3: override ธีมใน `src/index.css`**

เพิ่มกฎ unlayered ให้ `.swal2-container.swal2-backdrop-show` ใช้ `background: var(--color-overlay)` และ `.swal2-popup` ใช้ `background`/`color` จาก `var(--color-surface)`/`var(--color-text)` — ต้องชนะค่าเริ่มต้นสีขาวของ Swal ในทุกธีม (ตรวจใน `dist/assets/*.css` หลัง build ว่ากฎอยู่หลัง CSS ของ Swal หรือ specificity สูงกว่า)

- [ ] **Step 4: guard ปุ่มลัดใน `src/lib/shortcuts.ts`**

ใน `onKeyDown` บรรทัดแรก (ก่อนเช็ก `keyModalOpen`) เพิ่ม `if (isConfirmOpen()) return;` — listener นี้อยู่บน `document` และรันก่อนของ Swal และ `Ctrl+Enter` ยิงได้แม้อยู่ใน input จึงต้องตัดตั้งแต่ต้น

- [ ] **Step 5: ย้าย Gallery ไปใช้ `confirmAction()` แล้วลบ `ConfirmModal`**

ใน `clearGallery` และ `deleteSelectedItems` แทน `setConfirmReq({...onConfirm})` ด้วย `if (await confirmAction({title, body, warning, confirmLabel})) { ...โค้ดใน onConfirm เดิม... }` (ฟังก์ชันกลายเป็น `async`) ลบ `confirmReq`/`closeConfirm` state, การ render `<ConfirmModal>` (~1466), import และไฟล์ `ConfirmModal.tsx`

Note: `mode` ถูกจับไว้ก่อนเปิด dialog แล้ว (`const mode = s.mode`) — คงไว้แบบนั้น เพื่อไม่ให้ลบผิดโหมด

- [ ] **Step 6: Build + ตรวจใน browser**

Run: `npm run build`
Expected: exit 0

ตรวจด้วยมือ (`npm run dev` → `/studio`, generate หรือมีของในแกลเลอรีสัก 2 ชิ้น):
- กด "ล้างแกลเลอรี" → dialog ขึ้น ข้อความหลายบรรทัดขึ้นบรรทัดถูก, แถบเตือน cloud โชว์เมื่อเกี่ยวข้อง
- กด Enter ทันที → dialog ปิด ไม่มีอะไรถูกลบ โฟกัสกลับปุ่ม "ล้างแกลเลอรี"
- เปิด dialog อีกครั้ง กด `2` และ `Ctrl+Enter` → ไม่สลับโหมด ไม่ generate
- กดยืนยัน → ลบจริง + toast สำเร็จ
- "ลบที่เลือก" ทำงานแบบเดียวกัน
- สลับธีม `paper`, `ink`, `midnight`, `contrast` → dialog/backdrop ใช้สีธีม ไม่มีพื้นขาวค้าง

- [ ] **Step 7: อัปเดต `CLAUDE.md`**

ในรายการ components: ลบ `ConfirmModal.tsx`, เพิ่มบรรทัด `lib/alerts.ts` ในรายการ lib ("SweetAlert2 wrapper — `confirmAction()` for every simple confirm") ใน Conventions เพิ่มหัวข้อสั้น "Confirmations": การยืนยันแบบใช่/ไม่ใช่ใช้ `confirmAction()`, modal ที่มีเนื้อหาเยอะ (BakeOff/SpendGuard/ImportPreview) คงเป็น React modal, ห้ามเรียก `Swal.fire` ตรงที่อื่น และห้ามใช้ Swal ทำ toast (Swal โชว์ได้ทีละ popup)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/alerts.ts src/index.css src/lib/shortcuts.ts src/components/Gallery.tsx src/components/ConfirmModal.tsx CLAUDE.md
git commit -m "feat: SweetAlert2 confirm helper, migrate gallery delete confirms"
```

---

### Task 2: ย้ายการยืนยันที่เหลือมาใช้ `confirmAction()`

**Files:**
- Modify: `src/components/SettingsModal.tsx:~114, ~138`
- Modify: `src/components/Header.tsx:~192-230` (`SpendGuardControl` ล้างยอด), `~377-442` (`RunningJobsControl` ยกเลิกทั้งหมด)
- Modify: `src/lib/i18n.ts` (title/confirmLabel ใหม่)

**Interfaces:**
- Consumes: `confirmAction(opts: ConfirmOptions): Promise<boolean>` จาก Task 1

- [ ] **Step 1: `SettingsModal` — แทน `window.confirm` สองจุด**

`toggle` และ `clearAll` เป็น `async` อยู่แล้ว: แทน `const ok = window.confirm(text)` ด้วย `const ok = await confirmAction({ title, body: text, confirmLabel })` ข้อความ body เดิมคงไว้ทั้งประโยค เพิ่ม title/confirmLabel ผ่าน `t()` หลัง `await` เพิ่ม `if (!aliveRef.current) return;` (SettingsModal อาจถูกปิดระหว่าง dialog เปิด) — ไม่ต้องกันกดซ้ำ เพราะ backdrop ของ Swal บังปุ่มอยู่แล้ว

Note: `SettingsModal` เป็น React modal ที่ z-index ต่ำกว่า Swal — Swal จะทับขึ้นมาถูกต้อง แต่ตรวจว่า focus trap / Escape listener ของ `SettingsModal` ไม่ปิด SettingsModal ตอนกด Escape เพื่อยกเลิก dialog (ถ้าปิดด้วย ให้ `SettingsModal` ข้าม Escape เมื่อ `isConfirmOpen()`)

- [ ] **Step 2: `SpendGuardControl` — ล้างยอด**

ลบ state `confirmingReset` และ effect 4 วินาทีของมัน `doReset` กลายเป็น: `setOpen(false)` (ปิด popover ก่อน เพื่อไม่ให้ click-outside ของ popover ชนกับ dialog) แล้ว `if (await confirmAction({...})) resetSpendLedger();` ปุ่มล้างยอดกลับเป็น label ปกติเสมอ

- [ ] **Step 3: `RunningJobsControl` — ยกเลิกทั้งหมด**

ลบ state `confirming` และ effect ทั้งสองตัวที่รีเซ็ตมัน `doCancelAll` กลายเป็น `if (!(await confirmAction({...}))) return;` แล้วโค้ดเดิม (`cancelAll("user-all")`, `toast(...)`) body ของ dialog บอกจำนวนงาน `running`/`waiting` ณ ตอนเปิด และคง `title` ข้อความเดิมของปุ่ม (ส่วน "ยกเลิกตอนนี้ไม่เสียเงิน") ไว้ใน body ใช้ `danger: true`

Note: ถ้างานจบหมดระหว่าง dialog เปิด component จะ unmount — promise ยัง resolve; `cancelAll` คืน 0 แล้วโชว์ toast "ไม่มีงานที่ยกเลิกได้" ซึ่งถูกต้อง ห้ามเรียก `setStats` หลัง await (ลบบรรทัดนั้นได้ — interval อัปเดตเอง)

- [ ] **Step 4: Build + ตรวจใน browser**

Run: `npm run build`
Expected: exit 0

ตรวจด้วยมือ:
- Settings → ปิดการเก็บผลงาน (มีของเก็บไว้) → dialog → ยกเลิก: toggle ยังเปิด, SettingsModal ยังเปิด; ยืนยัน: ปิดและ toast
- Settings → ล้างผลงานที่เก็บไว้ → ยกเลิก/ยืนยัน ทำงานถูก
- ป้ายค่าใช้จ่าย → ล้างยอด → dialog → ยืนยัน: ยอดเป็น $0
- generate หลายรูป → "ยกเลิกทั้งหมด" → dialog → ยกเลิก: งานยังวิ่ง; ยืนยัน: งานถูกยกเลิก + toast

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.tsx src/components/Header.tsx src/lib/i18n.ts
git commit -m "feat: route settings and header confirms through confirmAction"
```

---

### Task 3: `Toast.tsx` — portal, z-index, หน้าตาเข้าชุด

**Files:**
- Modify: `src/components/Toast.tsx`
- Modify: `CLAUDE.md` (Conventions → Toasts)

**Interfaces:**
- Consumes: `TOAST_ROOT_ID` จาก Task 1

- [ ] **Step 1: portal + z-index**

render ผ่าน `createPortal(…, root)` โดย `root` คือ `<div id={TOAST_ROOT_ID}>` ที่สร้างและ append เข้า `document.body` ครั้งเดียว (หาด้วย id ก่อน ถ้ามีแล้วใช้ตัวเดิม) เปลี่ยน `z-300` เป็นค่าที่สูงกว่า container ของ Swal (1060) เช่น `z-[1100]` คง `role="status"` และ `aria-live` ตาม variant, เวลา 3200ms, การเคลียร์ข้อความหลัง 250ms ไว้ทั้งหมด

- [ ] **Step 2: หน้าตาเข้าชุดกับ dialog**

ใช้ภาษาภาพเดียวกับ popup ใน `alerts.ts`: `rounded-[14px]`, `border-border-strong`, `bg-surface`, เงาเดียวกับ `Tooltip.tsx` (`shadow-[0_8px_24px_rgba(0,0,0,.14)]`), ขนาดตัวอักษร 13px คงไอคอน/สีตาม variant ใน `VARIANT_META`

- [ ] **Step 3: Build + ตรวจใน browser**

Run: `npm run build`
Expected: exit 0

ตรวจด้วยมือ:
- generate 1 รูปที่ใช้เวลาสักพัก แล้วเปิด dialog "ล้างแกลเลอรี" ค้างไว้ระหว่างรอ → เมื่องานจบ/ล้ม toast โชว์เหนือ backdrop และ dialog ยังเปิดอยู่
- ใน DevTools ระหว่าง dialog เปิด: `#toast-root` ไม่มี `aria-hidden="true"`; error toast มี `aria-live="assertive"`
- toast ในธีม `paper`, `ink`, `midnight`, `contrast` อ่านออก

- [ ] **Step 4: อัปเดต `CLAUDE.md` หัวข้อ Toasts**

เพิ่มหนึ่งประโยค: `Toast.tsx` portal ไป `#toast-root` บน `<body>` และอยู่เหนือ SweetAlert2 เพื่อให้เห็น/ประกาศได้ระหว่าง dialog ยืนยันเปิด (`confirmAction` ลบ `aria-hidden` ที่ Swal ใส่ให้ node นี้)

- [ ] **Step 5: Commit**

```bash
git add src/components/Toast.tsx CLAUDE.md
git commit -m "feat: portal toast above SweetAlert2 and match dialog styling"
```

---

### Task 4: `InfoHint` + เคลียร์หน้าหลัก Studio

**Files:**
- Create: `src/components/InfoHint.tsx`
- Modify: `src/components/Sidebar.tsx` (~511, ~527–531, ~585, ~718–724, ~749–751, ~922–924, ~1104–1118)
- Modify: `src/components/Header.tsx` (~649 tagline, `MoreMenu` ~460–610)
- Modify: `src/lib/i18n.ts` (aria-label ของ ⓘ, รายการเมนูคีย์ลัด ถ้ายังไม่มี key)
- Modify: `CLAUDE.md` (รายการ components)

**Interfaces:**
- Consumes: `Tooltip({ label, align, children })` จาก `src/components/Tooltip.tsx` (มีอยู่แล้ว)
- Produces: `export default function InfoHint({ label, align = "start" }: { label: string; align?: "start" | "center" | "end" }): JSX.Element`

- [ ] **Step 1: เขียน `src/components/InfoHint.tsx`**

`<Tooltip label align>` ห่อ `<button type="button">` ที่มีไอคอน `Info` (lucide, ~13px, `text-text-faint hover:text-text`), `aria-label={t("shared.infoHint.label")}` ("ข้อมูลเพิ่มเติม" / "More info") และ `aria-describedby` จาก render prop ปุ่มไม่มี `onClick` — tooltip โผล่จาก hover/focus อย่างเดียว ใช้ `inline-flex` ให้วางต่อท้าย label ได้

- [ ] **Step 2: ย้าย hint ใน `Sidebar.tsx` ไปหลัง `InfoHint`**

แต่ละจุด: ลบบรรทัดที่แปะค้าง แล้ววาง `<InfoHint label={…ข้อความเดิม…} />` ต่อท้ายหัวข้อ/label ของส่วนนั้น
- ~511 `meta.hint` → ข้าง label ส่วน Prompt/โมเดล
- ~527–531 หมายเหตุ best-effort → ข้าง label "Negative Prompt" (เฉพาะเมื่อ `negPromptSupported()`)
- ~585 คำอธิบาย drop zone วิดีโอ → ข้างหัวข้อ Reference ของโหมดวิดีโอ
- ~718–722 legend ●◐✕ → ข้าง label "Model"
- ~724 `modelMeta`: ตัด id โมเดลดิบทิ้ง ส่วนราคาย้ายเข้า `InfoHint` ข้าง label "Model" (รวมกับ legend เป็น label เดียว คั่นบรรทัด หรือแยกเป็นสอง ⓘ — เลือกอันที่อ่านง่าย)
- ~749–751 คำอธิบาย Bake-off → ข้างหัวข้อ Bake-off
- ~922–924 `audioCostNote` → ข้าง label Audio

**คงไว้ inline (ห้ามย้าย):** หมายเหตุ image-only (~534–536, ~612–617), แถบแดง Image-to-Video, "ไม่พบ keyword", อัตราสำเร็จ (~725–731), ตัวนับ Bake-off (~804–811), "มีโมเดลที่ไม่ทราบราคา" (~812–814), "(ไม่บังคับ)" (~518), `REF_KINDS` hint (~627) — ดูสเปกส่วน "คงไว้ตามเดิม"

กฎ: ถ้า hint มีปุ่ม/ลิงก์อยู่ข้างใน tooltip กดไม่ได้ (`pointer-events-none`) — คงส่วนที่กดได้ไว้ inline ย้ายเฉพาะร้อยแก้ว

- [ ] **Step 3: ตัด widget**

- `Sidebar.tsx` ~1104–1118: ลบบรรทัด "Ctrl + Enter เพื่อ Generate" และลิงก์ "คีย์ลัดทั้งหมด"
- `Header.tsx` `MoreMenu`: เพิ่มรายการ "คีย์ลัดทั้งหมด" ที่ทำ `mutate(st => { st.shortcutsModalOpen = true; })` ตาม pattern รายการอื่นในเมนู
- `Header.tsx` ~649: ลบ tagline "AI media studio" (และ key `t()` ถ้าไม่มีที่อื่นใช้ — เช็กด้วย grep)

- [ ] **Step 4: อัปเดต `CLAUDE.md`**

เพิ่ม `InfoHint.tsx` ในรายการ components ("ⓘ button + Tooltip — use instead of always-visible help paragraphs") และเพิ่มหนึ่งประโยคใน Conventions: ข้อความช่วยเหลือแบบ static ใช้ `InfoHint`; คำเตือนตามสถานการณ์ยังโชว์ inline

- [ ] **Step 5: Build + ตรวจใน browser**

Run: `npm run build`
Expected: exit 0

ตรวจด้วยมือ:
- ทุกแท็บของ Sidebar ในโหมด General และ Video: ไม่มีย่อหน้าช่วยเหลือแปะค้าง; ⓘ แต่ละตัว hover แล้วเห็นข้อความเดิมครบ
- กด Tab ไปที่ ⓘ → tooltip โผล่ + วงโฟกัสเห็นชัด
- เลือกโมเดล image-only → หมายเหตุ image-only ยังโชว์ inline; เลือกโมเดล Image-to-Video ล้วน → แถบแดงยังโชว์
- ไม่มี id โมเดลดิบใต้ช่องเลือกโมเดล; ราคาอยู่ใน ⓘ
- เมนู ⋯ → "คีย์ลัดทั้งหมด" เปิด ShortcutsModal; Shift+? ยังใช้ได้
- ไม่มี tagline ข้างโลโก้; ป้ายค่าใช้จ่ายยังโชว์ที่ $0
- ปรับหน้าต่างกว้าง 360px → tooltip ของ ⓘ ใน sidebar อ่านได้ครบ ไม่มี horizontal scroll (ถ้าถูกตัด ปรับ `align` หรือแก้ `Tooltip.tsx` ให้จำกัดความกว้างตาม viewport)

- [ ] **Step 6: Commit**

```bash
git add src/components/InfoHint.tsx src/components/Sidebar.tsx src/components/Header.tsx src/lib/i18n.ts CLAUDE.md
git commit -m "feat: move sidebar help text behind InfoHint and trim studio widgets"
```

---

### Task 5: `InfoHint` ใน popover และ modal

**Files:**
- Modify: `src/components/Header.tsx` (Spend popover 260–266, 290–292, 308–310; Export 52; Auto Save 156–158; Drive 329–331, 342–345)
- Modify: `src/components/SettingsModal.tsx` (ย่อหน้า `text-[10.5px] text-text-faint` ราว 10 จุด: 186–193, 297, 301, 334, 449–450, 549–551 ฯลฯ)
- Modify: `src/components/KeyModal.tsx` (~144–148)
- Modify: `src/components/SpendGuardModal.tsx` (124–126), `src/components/ImportPreviewModal.tsx` (46)
- Modify: `src/components/ExtendTool.tsx` (62, 96, 141), `src/components/ShortcutsModal.tsx` (27)

**Interfaces:**
- Consumes: `InfoHint({ label, align })` จาก Task 4

- [ ] **Step 1: ย้ายย่อหน้าช่วยเหลือในแต่ละไฟล์ไปหลัง `InfoHint`**

กฎเดียวกับ Task 4 Step 2 วาง ⓘ ข้างหัวข้อ/label ของส่วนที่ย่อหน้านั้นอธิบาย

**คงไว้ inline:**
- `KeyModal.tsx` ข้อความเตือน (~119–120)
- `SettingsModal.tsx` คำเตือน storage/cloud/custom-model (34, 322–326, 469, 481)
- `Header.tsx` Spend popover: ถ้าบรรทัดไหนผสมข้อความ static กับคำเตือน "ไม่ทราบราคา" ให้แยก — ส่วนคำเตือนคงไว้ inline (โชว์เมื่อ `unknown > 0`)
- `Header.tsx:135` ข้อความชวน reconnect Auto Save
- `ImportPreviewModal.tsx` caption ใต้ปุ่ม (80, 87)

- [ ] **Step 2: ตรวจ tooltip ใน container ที่ตัดขอบ**

modal/popover ที่มี `overflow-hidden` หรือ `overflow-y-auto` อาจตัด tooltip ที่อยู่ใกล้ขอบ — เลือก `align` ให้ tooltip ยื่นเข้าด้านใน หรือย้าย ⓘ ไปตำแหน่งที่มีที่ว่างพอ

- [ ] **Step 3: Build + ตรวจใน browser**

Run: `npm run build`
Expected: exit 0

ตรวจด้วยมือ: เปิดทุก popover ใน Header, SettingsModal (ทุก section), KeyModal, ExtendTool, ShortcutsModal, ImportPreviewModal (นำเข้าไฟล์ export), SpendGuardModal (ตั้งเพดาน $0 แล้ว generate) — ไม่มีย่อหน้าช่วยเหลือแปะค้าง, ⓘ อ่านได้ครบทั้ง hover และ Tab, คำเตือนที่ระบุให้คงไว้ยังโชว์ ทำซ้ำที่ความกว้าง 360px

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx src/components/SettingsModal.tsx src/components/KeyModal.tsx src/components/SpendGuardModal.tsx src/components/ImportPreviewModal.tsx src/components/ExtendTool.tsx src/components/ShortcutsModal.tsx src/lib/i18n.ts
git commit -m "feat: move popover and modal help text behind InfoHint"
```
