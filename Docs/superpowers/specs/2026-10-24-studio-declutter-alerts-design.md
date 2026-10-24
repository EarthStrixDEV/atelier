# Studio Declutter + SweetAlert2 — Design

24 ต.ค. 2026 · ต่อยอดจาก `Docs/Requirement-Rework-UI-Studio.md` (ปัญหา #5, #6)

## ทำไม

หน้า Studio มีข้อความอธิบายตัวเล็กแปะค้างอยู่หลายจุด (legend ของ ref, id โมเดล, หมายเหตุ Negative Prompt, คำอธิบายรายชื่อโมเดล ฯลฯ) และมี widget ที่ไม่ได้ช่วยอะไร ทำให้หน้าดูรก พี่เอิร์ธต้องการให้หน้าดู clean: ข้อมูลยังหาได้เมื่ออยากรู้ แต่ไม่แปะค้างบนจอ

ส่วนการยืนยันก่อนทำ action และการแจ้งว่า action เสร็จแล้ว ให้ใช้ SweetAlert2 ผ่าน helper กลางที่ reuse ได้ (พี่เอิร์ธขอเป็น "CodeHelper")

## เป้าหมาย

1. ข้อความอธิบายที่โชว์ค้าง ย้ายไปหลังไอคอน ⓘ (tooltip ตอน hover/focus) — ทั้งในหน้าหลัก Studio และใน popover/modal ที่ผู้ใช้เปิดเอง
2. ตัด widget ที่ไม่จำเป็นออก (รายการด้านล่าง)
3. การยืนยันแบบง่ายทั้งหมดใช้ SweetAlert2 ผ่าน helper เดียว
4. การแจ้งผล action ใช้ toast ที่เรียกผ่าน `toast()` เดิม

## ไม่ทำ (non-goals)

- ไม่แปลง modal ที่มีเนื้อหาเยอะเป็น SweetAlert2: `BakeOffConfirmModal`, `SpendGuardModal`, `ImportPreviewModal` คงเป็น modal เดิม (พี่เอิร์ธตัดสิน)
- ไม่แตะหน้า `/` (Landing) และ `/models`
- ไม่เปลี่ยนเนื้อหาของข้อความ — แค่ย้ายที่แสดง
- ไม่แก้จุดเรียก `toast()` ทั้ง ~98 จุด

## ห้ามพัง (anti-goals)

- **ข้อความเตือนตามสถานการณ์ต้องยังโชว์ทันที** — ถ้าซ่อนไว้หลัง ⓘ ผู้ใช้จะพลาดคำเตือนที่ทำให้ gen พังหรือเสียเงิน ได้แก่ แถบแดง Image-to-Video ต้องแนบภาพ (`Sidebar.tsx` ~559), "ไม่พบ keyword", อัตราสำเร็จสีแดง, "มีโมเดลที่ไม่ทราบราคา", error ของ optimizer, ข้อความสถานะการ์ดใน Gallery, คำเตือน storage/cloud ใน Settings ฯลฯ (รายการ "conditional" ทั้งหมดจากการสำรวจ)
- **ปุ่มลัด global ต้องไม่ทำงานใต้ dialog ยืนยัน** — `ConfirmModal` ปัจจุบันดัก keydown แบบ capture แล้ว `stopPropagation` เพราะถ้ากดเลขสลับโหมดใต้ modal แล้วกดยืนยัน จะไปลบของอีกโหมด SweetAlert2 ต้องคงพฤติกรรมนี้
- **ปุ่มที่ถูกโฟกัสตอนเปิด dialog ลบต้องเป็น "ยกเลิก"** (Enter ตามนิสัยต้องไม่ลบ) และโฟกัสต้องกลับไปปุ่มที่เปิด dialog ตอนปิด
- **toast ต้องไม่ปิด dialog ยืนยันที่เปิดค้าง** — SweetAlert2 แสดงได้ทีละ popup จึงห้ามเรียก `Swal.fire` เพื่อแสดง toast (ดูหัวข้อ 4)
- ทุกสีต้องมาจากโทเคนธีม ใช้ได้ครบ 7 ธีม — ห้าม hardcode สี (กฎใน CLAUDE.md)
- error toast ยังประกาศแบบ `aria-live="assertive"`, อื่น ๆ `polite`

## ข้อจำกัด

- React 19 + TS strict + Tailwind v4; `npm run build` ต้องผ่าน; ไม่มี test suite
- `sweetalert2` ยังไม่ได้ติดตั้ง — เพิ่มเป็น dependency ใหม่
- ข้อความ UI เป็นภาษาไทย ผ่าน `t()` ใน `lib/i18n` ตามแบบที่ไฟล์รอบข้างใช้

## สิ่งที่ตัดสินแล้ว

### 1. `InfoHint` — ไอคอน ⓘ + tooltip (ตัดสินร่วมกัน)

- คอมโพเนนต์ใหม่ต่อยอดจาก `components/Tooltip.tsx` ที่มีอยู่ (CSS ล้วน, hover + focus-within, `role="tooltip"` + `aria-describedby`)
- trigger เป็น `<button type="button">` ที่มีไอคอน `Info` ของ lucide และ `aria-label` ภาษาไทย ("ข้อมูลเพิ่มเติม" หรือใกล้เคียง) โฟกัสด้วย Tab ได้
- วางข้างหัวข้อ/label ของส่วนนั้น แทนบรรทัดข้อความที่เคยแปะค้าง

**ย้ายไปหลัง ⓘ** (static help text):

| ที่ | ข้อความ |
|---|---|
| `Sidebar.tsx` ~511 | `MODE_META[mode].hint` (คำอธิบายรายชื่อโมเดลประจำโหมด) |
| `Sidebar.tsx` ~527–531 | หมายเหตุ best-effort ของ Negative Prompt |
| `Sidebar.tsx` ~585 | คำอธิบาย drop zone เฟรมแรกของวิดีโอ |
| `Sidebar.tsx` ~718–722 | legend ●◐✕ ของ ref |
| `Sidebar.tsx` ~724 | ราคาโมเดล (ส่วนของ `modelMeta`) — id โมเดลดิบตัดทิ้ง |
| `Sidebar.tsx` ~749–751 | คำอธิบาย Bake-off |
| `Sidebar.tsx` ~922–924 | `audioCostNote` |
| `Header.tsx` popovers | Spend (260–266, 290–292, 308–310), Export (52), Auto Save (156–158), Drive (329–331, 342–345) |
| `SettingsModal.tsx` | ย่อหน้าช่วยเหลือ `text-[10.5px] text-text-faint` ราว 10 จุด |
| `KeyModal.tsx` | คำอธิบายการเก็บ key (~144–148) — **ยกเว้น** ข้อความเตือน (~119–120) ที่ต้องโชว์ค้าง |
| `SpendGuardModal.tsx` 124–126, `ImportPreviewModal.tsx` 46 | หมายเหตุท้าย modal |
| `ExtendTool.tsx`, `ShortcutsModal.tsx` 27 | คำอธิบายวิธีใช้ |

(เลขบรรทัดมาจากการสำรวจวันนี้ ใช้เป็นจุดเริ่มค้นหา)

**คงไว้ตามเดิม (มินจูตัดสิน):**
- คำว่า "(ไม่บังคับ)" ข้าง label Negative Prompt — สั้น เป็นส่วนของ label
- `REF_KINDS` hint ในการ์ด ref (~627) — เป็นคำบรรยายการ์ดที่ตัดบรรทัดและมี `title=` อยู่แล้ว
- ข้อความ empty state: Gallery hero, intro ของ ChatPanel/GrillPanel, ประวัติ prompt ว่าง — เป็นเนื้อหาของหน้าตอนว่าง ไม่ใช่ hint
- คำบรรยายใต้เมนู 2 ตัวเลือกใน `AssistFab` และ caption ปุ่มใน `ImportPreviewModal` (80, 87) — เป็นส่วนของตัวเลือกที่ต้องอ่านก่อนเลือก
- ตัวนับตัวอักษร prompt ใน `PromptComposer` — เป็นสถานะ ไม่ใช่ hint
- หมายเหตุ "โมเดลนี้สร้างภาพได้อย่างเดียว (image-only)" ใน Negative tab (~534–536) และ Reference tab (~612–617) — ข้อความนี้แสดง *แทน* ช่องกรอก/ช่องแนบที่ถูกซ่อน และขึ้นเฉพาะบางโมเดล จึงนับเป็นข้อความตามสถานการณ์ ถ้าซ่อนไว้ผู้ใช้จะเห็นหัวข้อเปล่าโดยไม่รู้สาเหตุ

**นอกขอบเขต (มินจูตัดสิน):** การปรับขนาด/สีของข้อความเตือนที่ยังโชว์อยู่ให้ผ่าน R8 (≥13px, WCAG AA) เป็นงานแยก — รอบนี้แค่ย้ายที่แสดง

### 2. ตัด widget (พี่เอิร์ธตัดสิน: "ตัดออกให้หมด")

- tagline "AI media studio" ข้างโลโก้ (`Header.tsx` ~649)
- บรรทัด "Ctrl + Enter เพื่อ Generate" + ลิงก์ "คีย์ลัดทั้งหมด" ท้าย Sidebar (`Sidebar.tsx` ~1104–1118) — ลิงก์นี้เป็นทางเปิด ShortcutsModal ด้วยเมาส์ทางเดียว (นอกจาก Shift+?) จึงย้ายรายการ "คีย์ลัดทั้งหมด" ไปไว้ใน MoreMenu (⋯)
- id โมเดลดิบใต้ช่องเลือกโมเดล

**ไม่ตัด:** ป้ายค่าใช้จ่าย `SpendGuardControl` คงโชว์ตลอดแม้ยอดเป็น $0 (พี่เอิร์ธตัดสิน) — เป็นทางเดียวที่เข้าไปตั้งเพดานงบ Spend Guard ได้ ตามเกณฑ์ AC4 ที่คอมเมนต์ใน `Header.tsx` ~180–183 ระบุไว้

### 3. `lib/alerts.ts` — helper SweetAlert2 กลาง (พี่เอิร์ธขอให้เป็น helper reuse ได้)

- `confirmAction(opts): Promise<boolean>` — `opts` อย่างน้อย `{ title, body, warning?, confirmLabel, danger? }` (ยก field จาก `ConfirmRequest` เดิม) คืน `true` เมื่อกดยืนยันเท่านั้น; Escape / คลิกนอก / ยกเลิก = `false`
- ตั้งค่ากลางครั้งเดียวใน helper: `focusCancel`, `buttonsStyling: false` + class จากโทเคนธีม, `returnFocus`, ข้อความปุ่มภาษาไทย
- ระหว่าง dialog เปิด ปุ่มลัด global ใน `lib/shortcuts.ts` ต้องไม่ทำงาน (anti-goal ข้างบน) — listener ของ `shortcuts.ts` อยู่ระดับ document และรันก่อน listener ของ Swal; Ctrl+Enter ยิงได้แม้อยู่ใน input จึงต้องมี guard ชัดเจน (เช่น เช็ก `Swal.isVisible()` หรือ flag จาก helper)
- ข้อความปุ่ม/หัวข้อผ่าน `t()` ใส่ทั้ง key ภาษาไทยและอังกฤษ (แอปมีตัวสลับภาษา)

**ย้ายมาใช้ `confirmAction()`:**
- `ConfirmModal` (ลบทั้งหมด / ลบที่เลือก ใน `Gallery.tsx` ~1211–1256, 1466) — แล้วลบ `ConfirmModal.tsx` ทิ้ง
- `window.confirm` ใน `SettingsModal.tsx` 114, 138
- ปุ่มกดสองทีใน Header: ล้างยอด spend ledger (~192–228) และ "ยกเลิกทั้งหมด" (~377–438)

**ไม่ย้าย:** popover "Start from this" (`Gallery.tsx` 417–455, `Lightbox.tsx`) — เป็นการเลือกโหมดปลายทาง ไม่ใช่ยืนยันแบบใช่/ไม่ใช่

### 4. Toast

- API `toast(msg, variant)` ใน `lib/store.ts` และ `ToastVariant` คงเดิม จุดเรียกไม่แก้
- พฤติกรรมคงเดิม: ทีละอัน ข้อความใหม่แทนอันเก่า, ~3.2 วินาที, aria-live ตาม variant
- ตัวแสดงผล: **`Toast.tsx` เดิม** (พี่เอิร์ธตัดสิน) — SweetAlert2 ใช้เฉพาะ dialog ยืนยัน ไม่ใช้โหมด toast ของ SweetAlert2
- ปรับหน้าตา `Toast.tsx` ให้เข้าชุดกับ dialog ของ SweetAlert2 (มุมโค้ง เงา ตัวอักษร ไอคอน) ด้วยโทเคนธีมเดิม
- ต้องแก้สองจุดเพื่อให้ toast ใช้งานได้ระหว่าง dialog เปิด:
  - **z-index:** `Toast.tsx` อยู่ที่ `z-300` ต่ำกว่า container ของ Swal (ค่าเริ่มต้น 1060) ต้องยก toast ให้อยู่เหนือ backdrop ของ dialog
  - **screen reader:** Swal ใส่ `aria-hidden="true"` ให้ลูกทุกตัวของ `<body>` ยกเว้น container ของตัวเอง toast ที่อยู่ใน React root จึงเงียบระหว่าง dialog เปิด — ต้อง portal toast ไปไว้ที่ `<body>` นอก root (และตรวจว่า Swal ไม่ซ่อน node นั้น) เพื่อให้ error toast ยังประกาศแบบ assertive

### 5. เอกสาร

อัปเดต `CLAUDE.md` ส่วน Conventions/Toasts และรายการ components ให้ตรงกับ `alerts.ts`, `InfoHint` และการลบ `ConfirmModal`

## เหลือให้ builder ตัดสิน

- รูปแบบ API ละเอียดของ `InfoHint` (props, ขนาดไอคอน, การจัดวาง)
- วิธีผูกโทเคนธีมเข้ากับ SweetAlert2 (customClass ด้วย Tailwind utilities หรือ override `.swal2-*` ใน `index.css` ด้วย `var(--color-*)`)
- tooltip ที่ถูกตัดขอบใน container ที่ `overflow` ซ่อน (sidebar, modal) — แก้ด้วยการเลือก `align` หรือปรับ `Tooltip` ตามจำเป็น
- ลำดับ commit
