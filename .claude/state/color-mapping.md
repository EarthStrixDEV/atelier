# Color → Token Mapping Table (T2)

**Sprint:** feat/theme-system · **Author:** นุ่น (Noon) — API Contract Engineer · **Date:** 2026-08-22

Deliverable บังคับสำหรับ **T9, T10, T11, T12, T13**. Dev **ห้ามตัดสินใจสีเอง** — เปิดไฟล์ตามเลขบรรทัดในเอกสารนี้แล้วแทนที่ตามคอลัมน์ "Token ใหม่" เท่านั้น. ถ้าเจอจุดที่ไม่อยู่ในเอกสารนี้ → **หยุดแล้วรายงาน MinJu** ห้ามเดา.

ทุกเลขบรรทัดในเอกสารนี้มาจากการ grep ไฟล์จริงรอบนี้ (2026-08-22, commit `67302ed`).

---

## 0. กติกา 3 บริบท — อ่านก่อนแตะโค้ด

สีที่เจอในโปรเจกต์นี้มี **3 บริบทที่ต่างกันโดยสิ้นเชิง** ห้ามรวบเป็นกฎเดียว:

| # | บริบท | นิยาม | Token ปลายทาง | ถ้า map ผิดจะเกิดอะไร |
|---|---|---|---|---|
| **1** | **app-surface** | สีของ UI ปกติ — การ์ด, พาเนล, ตัวหนังสือบนพื้นแอป | `bg`, `surface`, `surface-2`, `border`, `border-strong`, `text`, `text-dim`, `text-faint`, `accent`, `accent-ink`, `overlay` | ธีมไม่เปลี่ยนตาม — สีค้างอยู่ที่ค่า light |
| **2** | **on-media** | ตัวหนังสือ/ไอคอน/badge/เส้นขอบที่วางอยู่**บนรูปภาพหรือบนฉากมืดถาวร** ต้องอ่านออกเสมอไม่ว่าธีมอะไร | `media-scrim`, `on-media`, `on-media-dim` **(theme-invariant)** | **R1 — บั๊กร้ายแรงที่สุดของสปรินต์นี้** ธีม light จะได้ตัวหนังสือดำบนภาพมืด/พื้นดำ อ่านไม่ออกทั้งหมด |
| **3** | **semantic** | สีที่สื่อ *ความหมาย* ไม่ใช่ *ตำแหน่ง* — แดง=error/อันตราย, เขียว=success, เหลือง=warning | `danger`, `success`, `warning`, `info` | ความหมายหายไป เช่น status dot กลายเป็นสี accent ที่บางธีมเป็นสีทอง ผู้ใช้อ่านไม่ออกว่า "พร้อมใช้" |

### กฎตัดสินใน 5 วินาที

```
สีนี้อยู่ทับบนอะไร?
├─ ทับบน <img>/<video> หรือบน bg-media-scrim  → บริบท 2 (on-media) — ห้ามใช้ text/surface เด็ดขาด
├─ สื่อสถานะ (เขียวพร้อม / แดงพัง / เหลืองเตือน)  → บริบท 3 (semantic)
└─ อย่างอื่นทั้งหมด                                → บริบท 1 (app-surface)
```

**เส้นแบ่งที่พลาดบ่อยที่สุด:** `bg-black/50` ของ modal overlay คือ **บริบท 1** (มันบังพื้นแอป ไม่ใช่บังภาพ) แต่ `bg-[rgba(5,5,5,.94)]` ของ Lightbox คือ **บริบท 2** (มันคือเวทีสำหรับดูภาพ) — หน้าตาคล้ายกันแต่คนละ token คนละพฤติกรรมตอนสลับธีม.

---

## 1. Pattern → Token (ตารางสรุป — ครบ 9 กลุ่มตาม AC)

| # | Pattern เดิม | Token ใหม่ (Tailwind class) | บริบท | ใช้ได้ที่ไหน |
|---|---|---|---|---|
| 1 | `bg-black/50` (modal overlay) | `bg-overlay` | **1** app-surface | scrim ของ modal ทั้ง 6 ตัว เท่านั้น |
| 2 | `bg-[rgba(5,5,5,.94)]` (full-screen viewer) | `bg-media-scrim` | **2** on-media | พื้นหลัง Lightbox / CompareModal |
| 3 | `bg-[rgba(10,10,10,.72)]` · `bg-[rgba(10,10,10,.82)]` (badge บนภาพ) | `bg-media-scrim/80` | **2** on-media | badge/chip ที่ทับบนรูปในการ์ด Gallery |
| 4 | `bg-black/60` · `bg-black/65` · `bg-black/70` (control บนภาพ) | `bg-media-scrim/70` | **2** on-media | ปุ่ม/label/crop mask ที่ทับบนรูป |
| 5 | `text-white` | `text-on-media` | **2** on-media | ตัวหนังสือ/ไอคอนหลักบนสื่อ |
| 6 | `text-white/50` `/60` `/70` `/80` `/90` | `text-on-media-dim` | **2** on-media | ตัวหนังสือรอง/meta บนสื่อ (ดูหมายเหตุ §1.1) |
| 7 | `border-white/15` `/20` `/25` `/40` `/60` `/85` | `border-on-media-dim` (+ modifier ถ้าจำเป็น) | **2** on-media | เส้นขอบบนสื่อ (ดู §1.1) |
| 8 | `bg-white/5` · `bg-white/80` | `bg-on-media/10` · `bg-on-media` | **2** on-media | surface ยกระดับบนฉากมืด / divider สว่าง |
| 9 | `bg-green-400` (status dot) | `bg-success` | **3** semantic | จุดไฟสถานะพร้อมใช้ |
| 10 | `from-black/85` (gradient บนภาพ) | `from-media-scrim` | **2** on-media | gradient ไล่ทับภาพ ref |
| 11 | `bg-[#0a0a0a]` (hero art card) | `bg-media-scrim` | **2** on-media | การ์ด Landing hero ที่มืดถาวร |
| 12 | `rgba(10,10,10,.06)` ใน shimmer gradient | `--color-on-media` + opacity (ดู §4.4) | **2** on-media | shimmer ของ loading card |

### 1.1 ทำไม opacity หลายระดับถึงยุบเหลือ token เดียว

`text-white/50` กับ `text-white/70` ต่างกันแค่ *ความจาง* ไม่ใช่ *ความหมาย* — ทั้งคู่คือ "ตัวหนังสือรองบนสื่อ". Design decision (workflow.json `decisions.a`) ให้ `--color-on-media-dim` เป็น token เดียวครอบทั้งหมด. Dev **ยุบทุกระดับเป็น `text-on-media-dim` ตรงๆ** ไม่ต้องพยายามรักษาระดับ opacity เดิม.

**ยกเว้น 2 เคสที่ opacity เป็นข้อมูล ไม่ใช่การตกแต่ง** — ระบุไว้เป็นรายจุดใน §2 แล้ว (Gallery L436 badge ที่ต้องทึบกว่าเพื่อนบ้าน, RefCropPreview L80 เส้น crop ที่ต้องเกือบทึบ):
- Tailwind v4 รองรับ `border-on-media-dim/60` ได้ (opacity modifier compile เป็น `color-mix` ตามธีมอัตโนมัติ — ยืนยันแล้วใน workflow.json `whatIsNOTHard`) ใช้ได้ปลอดภัย

---

## 2. รายการจุดที่ต้องแก้ — แยกตาม task

**Legend บริบท:** `[1]` app-surface · `[2]` on-media · `[3]` semantic

### T9 — Modal overlay (6 ไฟล์ · 6 จุด · บริบท 1 ล้วน)

| ไฟล์ | บรรทัด | ค่าเดิม | บริบท | Token ใหม่ |
|---|---|---|---|---|
| `src/components/BakeOffConfirmModal.tsx` | 21 | `bg-black/50` | [1] | `bg-overlay` |
| `src/components/ExtendTool.tsx` | 54 | `bg-black/50` | [1] | `bg-overlay` |
| `src/components/ImportPreviewModal.tsx` | 30 | `bg-black/50` | [1] | `bg-overlay` |
| `src/components/KeyModal.tsx` | 364 | `bg-black/50` | [1] | `bg-overlay` |
| `src/components/ShortcutsModal.tsx` | 16 | `bg-black/50` | [1] | `bg-overlay` |
| `src/components/SpendGuardModal.tsx` | 78 | `bg-black/50` | [1] | `bg-overlay` |

ทั้ง 6 จุดเป็นบรรทัดเดียวกันเป๊ะ: `className="fixed inset-0 z-200 grid place-items-center bg-black/50 backdrop-blur-sm"`. Diff ต้องเป็น 6 บรรทัด ไม่มากกว่านี้.

> **เหตุผลที่เป็น [1] ไม่ใช่ [2]:** scrim ตัวนี้บังพื้นแอป (Gallery/Sidebar) ไม่ได้บังภาพ. ในธีมมืด `bg-black/50` ทับพื้นดำ = separation หายเกลี้ยง (G3) ดังนั้น `--color-overlay` **ต้องเป็น theme-varying** — ธีมมืดใช้ค่าเข้มกว่าหรือสว่างกว่าเพื่อคง separation. นี่คือเหตุผลตรงข้ามกับ media-scrim ที่ต้อง invariant.

---

### T10 — Lightbox.tsx (23 บรรทัด · บริบท 2 ล้วน)

ไฟล์นี้ทั้งไฟล์อยู่บนฉากมืดถาวร (`bg-[rgba(5,5,5,.94)]` ที่ L98) → **ทุกจุดเป็นบริบท 2 ไม่มีข้อยกเว้น**

| บรรทัด | ค่าเดิม (ที่ต้องแก้) | บริบท | Token ใหม่ |
|---|---|---|---|
| 21 | `border-white/15` | [2] | `border-on-media-dim` |
| 21 | `bg-[rgba(20,20,20,.96)]` | [2] | `bg-media-scrim` |
| 25 | `text-white/50` | [2] | `text-on-media-dim` |
| 26 | `text-white/50` + `hover:text-white` | [2] | `text-on-media-dim` + `hover:text-on-media` |
| 30 | `text-white/70` | [2] | `text-on-media-dim` |
| 37 | `border-white/20` `bg-white/5` `text-white/70` `hover:border-white/40` | [2] | `border-on-media-dim` `bg-on-media/10` `text-on-media-dim` `hover:border-on-media` |
| 98 | `bg-[rgba(5,5,5,.94)]` | [2] | `bg-media-scrim` |
| 100 | `text-white/60` | [2] | `text-on-media-dim` |
| 108 | `border-white/25` · `text-white` | [2] | `border-on-media-dim` · `text-on-media` |
| 118 | `border-white/25` · `text-white` | [2] | `border-on-media-dim` · `text-on-media` |
| 123 | `border-white/25` · `text-white` | [2] | `border-on-media-dim` · `text-on-media` |
| 134 | `border-white/25` · `text-white` | [2] | `border-on-media-dim` · `text-on-media` |
| 144 | `text-white` | [2] | `text-on-media` |
| 156 | `text-white` | [2] | `text-on-media` |
| 157 | `border-white/25` | [2] | `border-on-media-dim` |
| 169 | `border-white/25` · `text-white` | [2] | `border-on-media-dim` · `text-on-media` |
| 181 | `border-white/25` · `bg-[rgba(10,10,10,.7)]` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/70` · `text-on-media` |
| 190 | `text-white/50` | [2] | `text-on-media-dim` |
| 203 | `border-white/25` · `bg-[rgba(10,10,10,.7)]` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/70` · `text-on-media` |
| 212 | `text-white/60` | [2] | `text-on-media-dim` |

**ห้ามแตะในไฟล์นี้ (allowlist):** L21 `shadow-[0_16px_50px_rgba(0,0,0,.5)]`, L195 + L199 `shadow-[0_20px_80px_rgba(0,0,0,.6)]` — เป็นเงา ไม่ใช่สี surface.

**ห้ามแตะ (ใช้ token ถูกอยู่แล้ว):** `border-accent`, `bg-accent`, `text-accent-ink`, `border-accent/70` ทุกจุด (L37, 108, 118, 123, 134, 144, 157, 169, 181, 203) — hover state ที่เปลี่ยนเป็น accent เป็นพฤติกรรมที่ถูกและต้องคงไว้ (AC ของ T10 ระบุตรวจข้อนี้).

---

### T11 — CompareModal.tsx + RefCropPreview.tsx (บริบท 2 ล้วน)

#### CompareModal.tsx (11 บรรทัด)

| บรรทัด | ค่าเดิม | บริบท | Token ใหม่ | หมายเหตุ |
|---|---|---|---|---|
| 52 | `bg-white/80` | [2] | `bg-on-media/80` | เส้น divider กลางภาพ — ต้องสว่างเพื่อตัดกับภาพทั้งสองฝั่ง |
| 53 | `border-white/60` · `bg-black/60` · `text-white` | [2] | `border-on-media-dim/60` · `bg-media-scrim/70` · `text-on-media` | handle ลากบนภาพ |
| 57 | `border-white/20` · `bg-black/60` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/70` · `text-on-media` | label "ก่อน" |
| 58 | `border-white/20` · `bg-black/60` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/70` · `text-on-media` | label "หลัง" |
| 79 | `bg-[rgba(5,5,5,.94)]` | [2] | `bg-media-scrim` | พื้น full-screen viewer |
| 81 | `text-white/70` | [2] | `text-on-media-dim` | |
| 85 | `border-white/25` · `text-white` | [2] | `border-on-media-dim` · `text-on-media` | |
| 100 | `border-white/15` · `bg-white/5` · `text-white/70` | [2] | `border-on-media-dim` · `bg-on-media/10` · `text-on-media-dim` | การ์ด meta ในฉากมืด |
| 101 | `text-white/90` | [2] | `text-on-media` | 90% ใกล้ทึบ → ใช้ `on-media` เต็ม (ดู §5 case C) |
| 102 | `text-white/50` | [2] | `text-on-media-dim` | |
| 118 | `border-white/15` · `bg-white/5` · `text-white/70` | [2] | `border-on-media-dim` · `bg-on-media/10` · `text-on-media-dim` | คู่แฝดของ L100 |
| 119 | `text-white/90` | [2] | `text-on-media` | คู่แฝดของ L101 |
| 120 | `text-white/50` | [2] | `text-on-media-dim` | คู่แฝดของ L102 |

**ห้ามแตะ:** L52 `shadow-[0_0_8px_rgba(0,0,0,.5)]` — เงาของเส้น divider ที่ทำให้เส้นขาวอ่านออกบนภาพสว่าง. **ห้ามลบ** ไม่งั้น divider หายบนภาพขาว.

#### RefCropPreview.tsx (6 บรรทัด)

| บรรทัด | ค่าเดิม | บริบท | Token ใหม่ | หมายเหตุ |
|---|---|---|---|---|
| 69 | `bg-black/65` | [2] | `bg-media-scrim/70` | crop mask ซ้าย |
| 70 | `bg-black/65` | [2] | `bg-media-scrim/70` | crop mask ขวา |
| 74 | `bg-black/65` | [2] | `bg-media-scrim/70` | crop mask บน |
| 75 | `bg-black/65` | [2] | `bg-media-scrim/70` | crop mask ล่าง |
| 80 | `border-white/85` | [2] | `border-on-media/85` | **เส้น crop — ดู §5 case A** ต้องเกือบทึบ ห้ามลดเหลือ `on-media-dim` |
| 88 | `border-white/20` · `bg-black/70` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/70` · `text-on-media` | badge อัตราส่วน |

> **AC ของ T11 บังคับตรวจ:** crop mask ต้อง**ยังมืดพอ**ที่จะเห็นกรอบครอบตัดในธีม paper. `--color-media-scrim` เป็น theme-invariant จึงผ่านโดยอัตโนมัติ — ถ้า dev เผลอ map เป็น `bg-overlay` (theme-varying) จะพังทันที.

---

### T12 — Gallery.tsx (14 บรรทัด · **บริบท 2 ปนกับสิ่งที่ห้ามแตะ — ไฟล์เสี่ยงสุด**)

| บรรทัด | ค่าเดิม | บริบท | Token ใหม่ | หมายเหตุ |
|---|---|---|---|---|
| 104 | `bg-[rgba(10,10,10,.82)]` · `text-white/80` | [2] | `bg-media-scrim/80` · `text-on-media-dim` | dev-only readout ทับบนกริด — `border-border-strong` เดิมคงไว้ (เป็น [1] ที่ถูกอยู่แล้ว) |
| 436 | `border-white/15` · `bg-[rgba(10,10,10,.72)]` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/80` · `text-on-media` | **model badge ทับบนภาพ — จุดที่ AC ของ T12 บังคับตรวจด้วยตา** |
| 441 | `bg-[rgba(10,10,10,.72)]` | [2] | `bg-media-scrim/80` | bake-off chip — `border-accent/50` + `text-accent` **ห้ามแตะ** (accent ตั้งใจให้ตามธีม) |
| 476 | `bg-[rgba(10,10,10,.72)]` | [2] | `bg-media-scrim/80` | **NEEDS-DECISION-1** — `border-text` + `text-text` บนบรรทัดเดียวกัน ดู §6 |
| 477 | `border-white/15` · `bg-[rgba(10,10,10,.72)]` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/80` · `text-on-media` | ปุ่ม focus (unfocused) |
| 490 | `border-white/15` · `bg-[rgba(10,10,10,.72)]` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/80` · `text-on-media` | ปุ่ม select (unselected) |
| 506 | `border-white/15` · `bg-[rgba(10,10,10,.72)]` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/80` · `text-on-media` | ปุ่ม favorite (off) |
| 523 | `bg-[rgba(10,10,10,.72)]` | [2] | `bg-media-scrim/80` | autoSave "saved" — `border-accent/40` + `text-accent` **ห้ามแตะ** |
| 525 | `bg-[rgba(10,10,10,.72)]` | [2] | `bg-media-scrim/80` | autoSave "failed" — `border-danger/40` + `text-danger` **ห้ามแตะ** (เป็น [3] ที่ถูกอยู่แล้ว) |
| 526 | `border-white/15` · `bg-[rgba(10,10,10,.72)]` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/80` · `text-on-media` | autoSave "saving" |
| 545 | `bg-[linear-gradient(100deg,transparent_30%,rgba(10,10,10,.06)_50%,transparent_70%)]` | [2] | ดู §4.4 — **ต้องแก้ ห้ามข้าม** | shimmer ที่หายไปเงียบๆ ในธีมมืด |
| 801 | `bg-black/60` · `text-white` | [2] | `bg-media-scrim/70` · `text-on-media` | scene number บน thumbnail วิดีโอ |

**ห้ามแตะในไฟล์นี้ (allowlist):** L276 + L336 `shadow-[0_10px_30px_rgba(0,0,0,.28)]` — เงาของ popover, เป็น app-surface ที่ใช้ `bg-surface`/`border-border-strong` ถูกอยู่แล้ว.

> **เหตุผลที่ Gallery เสี่ยงสุด:** ไฟล์นี้มี `bg-surface` / `bg-surface-2` / `border-border-strong` (บริบท 1 ที่ถูกอยู่แล้ว) ปนกับ badge บนภาพ (บริบท 2) **ในโครงสร้าง JSX เดียวกัน**. เส้นแบ่งคือ: อะไรที่อยู่ใน `<div className="relative w-full bg-surface-2">` (L435) และมี `absolute` + `z-1`/`z-2` = ทับบนภาพ = **บริบท 2**. อะไรที่อยู่นอกกรอบนั้น = บริบท 1 = **ไม่ต้องแตะ**.

---

### T13 — Sidebar + Header + Landing + utils

#### Sidebar.tsx (4 บรรทัด · บริบท 2 ล้วน — overlay บนภาพ ref)

| บรรทัด | ค่าเดิม | บริบท | Token ใหม่ |
|---|---|---|---|
| 513 | `from-black/85` (`bg-gradient-to-t from-black/85 to-transparent`) | [2] | `from-media-scrim` |
| 514 | `text-white` | [2] | `text-on-media` |
| 517 | `border-white/20` · `bg-black/50` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/70` · `text-on-media` |
| 524 | `border-white/20` · `bg-black/60` · `text-white` | [2] | `border-on-media-dim` · `bg-media-scrim/70` · `text-on-media` |

**ห้ามแตะ L517:** `hover:border-danger hover:text-danger` — เป็นบริบท 3 (semantic: ปุ่มลบ) ที่ใช้ token ถูกอยู่แล้ว.

> **หมายเหตุ L517:** `bg-black/50` ตัวนี้ **ไม่ใช่** modal overlay ถึงแม้ค่าจะเหมือนกัน — มันเป็นปุ่ม "ลบภาพ" ที่ลอยอยู่บนภาพ ref ดังนั้น **map เป็น `bg-media-scrim/70` ไม่ใช่ `bg-overlay`**. นี่คือกับดักที่ตรงกับ §5 case B — ค่าเดิมเหมือนกันแต่บริบทคนละอัน.

#### Header.tsx (2 บรรทัด · บริบท 3 ล้วน)

| บรรทัด | ค่าเดิม | บริบท | Token ใหม่ |
|---|---|---|---|
| 126 | `bg-green-400` (auto-save dot) | [3] | `bg-success` |
| 500 | `bg-green-400` (api-key dot) | [3] | `bg-success` |

**ห้ามแตะ:** `bg-text-faint` ที่เป็น else-branch ของทั้งสองจุด (ถูกอยู่แล้ว), L60/133/281 `shadow-[...rgba(0,0,0,.16)]` (เงา), **L442 `invert` เป็นของ T14 ห้าม T13 แตะ**.

> **เหตุผลที่ห้าม map เป็น `accent`:** `accent` เปลี่ยนตามธีม — ธีม nocturne เป็นสีทอง, midnight เป็นฟ้าไซแอน. จุดไฟ "พร้อมใช้" ที่เป็นสีทองสื่อความหมายไม่ได้ ผู้ใช้ต้องอ่านว่าเขียว = OK. `success` เป็น token แยกเพื่อการนี้โดยเฉพาะ (workflow.json `decisions.a`).

#### Landing.tsx (3 บรรทัด · บริบท 2 — การ์ด hero art ที่มืดถาวรโดยเจตนา)

| บรรทัด | ค่าเดิม | บริบท | Token ใหม่ | หมายเหตุ |
|---|---|---|---|---|
| 139 | `bg-[#0a0a0a]` | [2] | `bg-media-scrim` | การ์ดต้องมืดเสมอทุกธีม (G5) |
| 139 | `text-white` | [2] | `text-on-media` | สืบทอดลงลูกทุกตัวในการ์ด |
| 140 | `[background-image:radial-gradient(#fff_0.7px,transparent_0.7px)]` | [2] | `radial-gradient(var(--color-on-media)_0.7px,transparent_0.7px)` | **จุดที่ task list ไม่ได้ระบุ — ดู §7** |
| 143 | `border-white/25` | [2] | `border-on-media-dim` | เส้นคั่นล่างในการ์ด |

**ห้ามแตะ:** L139 `shadow-[0_30px_90px_rgba(0,0,0,.18)]` (เงา), L138 `bg-surface-2` (การ์ดหลังที่**ควร**ตามธีม เป็นบริบท 1 ที่ถูกอยู่แล้ว), L142 `<img>` โลโก้ในการ์ด (เป็นของ T14 และ AC ระบุว่า**ห้าม**ผูกกับ `--logo-invert`).

> **R6 (border กลืนพื้นในธีมมืด):** L139 ใช้ `border-border-strong` ซึ่งในธีม ink/contrast อาจกลืนกับ `bg-media-scrim` ที่มืดเท่าๆ กัน. **จุดนี้ไม่ใช่การแก้สี hardcode** — เป็นการปรับ contrast ที่ AC ของ T13 สั่งให้ตรวจด้วยตา. ถ้าตรวจแล้วการ์ดหาย ให้เปลี่ยนเป็น `border-on-media-dim` (ซึ่ง invariant จึงเห็นเสมอ) **แล้วรายงาน MinJu** ว่าเปลี่ยนเพราะเหตุนี้.

#### utils.ts — **ห้ามแก้**

| บรรทัด | ค่า | สถานะ |
|---|---|---|
| 79 | `ctx.fillStyle = "#fff"` | **DO-NOT-TOUCH** (ดู §3) |

---

## 3. Do-not-touch — allowlist ฉบับเต็ม

รายการนี้คือสิ่งที่ **grep จะยังเจอหลังทำงานเสร็จ และนั่นถูกต้องแล้ว**. T16 (grep gate) ต้องใช้รายการนี้เป็น expected residue.

### 3.1 box-shadow rgba — 15 จุด ใน 8 ไฟล์

เป็น**เงา** ไม่ใช่สี surface. เงาดำโปร่งใสทำงานถูกในทุกธีม (ในธีมมืดมันแค่มองไม่ค่อยเห็น ซึ่งเป็นพฤติกรรมที่ถูกของเงา).

| ไฟล์ | บรรทัด |
|---|---|
| `src/components/ChatPanel.tsx` | 56, 70 |
| `src/components/CompareModal.tsx` | 52 |
| `src/components/Gallery.tsx` | 276, 336 |
| `src/components/GrillPanel.tsx` | 44, 58 |
| `src/components/Header.tsx` | 60, 133, 281 |
| `src/components/Lightbox.tsx` | 21, 195, 199 |
| `src/components/PromptComposer.tsx` | 82, 238, 362 |
| `src/pages/Landing.tsx` | 139 |

> **หมายเหตุ:** `ChatPanel.tsx`, `GrillPanel.tsx`, `PromptComposer.tsx` **ไม่ได้อยู่ใน task cleanup ใดๆ เลย** เพราะสแกนแล้วมีแต่ shadow rgba ล้วน ไม่มีสี foreground hardcode สักจุด — ยืนยันตรงกับ workflow.json `extraNote`. ห้ามเปิดไฟล์เหล่านี้.

### 3.2 จุดอื่นที่ห้ามแตะ

| ตำแหน่ง | เหตุผล |
|---|---|
| `src/lib/utils.ts:79` `ctx.fillStyle = "#fff"` | **พื้นหลังของไฟล์ JPG ที่ผู้ใช้ดาวน์โหลด ไม่ใช่สี UI** — JPG ไม่มี alpha channel ถ้าเปลี่ยนตามธีม ผู้ใช้ธีมมืดจะได้ไฟล์ JPG พื้นดำโดยไม่ได้ตั้งใจ. T13 ต้อง**เพิ่ม comment ยืนยัน** ไม่ใช่แก้ค่า |
| `src/lib/shareCard.ts:6-16` `FALLBACK_COLORS` | ตั้งใจให้เป็น fallback hex ตายตัวเผื่ออ่าน CSS var ไม่เจอ. **T15 sync ค่าให้ตรงธีม paper** — ไม่ใช่แปลงเป็น token |
| `src/lib/shareCard.ts:18-36` `readThemeColors()` | ทำงานถูกอยู่แล้ว (อ่าน CSS var ตอน render → ตามธีมฟรี). แก้ = ถอย |
| `src/index.css:5-15` (และ block `[data-theme]` ที่ T4 เพิ่ม) | **นี่คือ token definition เอง** hex ที่นี่คือแหล่งกำเนิดของทุก token |
| `legacy/index.html` | frozen ตาม CLAUDE.md |
| `src/pages/Landing.tsx:138` `bg-surface-2` | การ์ดหลังที่**ควร**ตามธีม — เป็น app-surface ที่ถูกอยู่แล้ว |
| `src/pages/Landing.tsx:142` `<img>` โลโก้ในการ์ด hero | ของ T14 และ AC ระบุว่าห้ามผูกกับ `--logo-invert` |
| `border-accent*` / `text-accent*` / `border-danger*` / `text-danger*` ทุกจุด | เป็น token อยู่แล้ว ตามธีมอัตโนมัติ |
| `bg-text-faint` (Header L126, L500 else-branch) | app-surface ที่ถูกอยู่แล้ว |

### 3.3 ที่ **ไม่ได้** อยู่ใน do-not-touch ถึงแม้ workflow.json จะเคยพูดถึง

`workflow.json` `decisions.f` layer 1 เขียนว่า allowlist รวม *"Landing hero art ที่ตั้งใจ"* — **ข้อนี้ล้าสมัย ห้ามใช้**. AC ของ T13 (ซึ่งใหม่กว่าและละเอียดกว่า) สั่งชัดว่า Landing L139 `bg-[#0a0a0a]` **ต้อง**เปลี่ยนเป็น `bg-media-scrim` เพื่อไม่ให้เป็น hex ลอย. ผลลัพธ์เหมือนเดิมทางสายตา (media-scrim เป็น invariant) แต่ผ่าน grep gate. **ยึดตาม AC ของ T13.**

---

## 4. เคสพิเศษที่ mechanical replace ไม่พอ

### 4.1 `bg-white/5` → `bg-on-media/10` (ไม่ใช่ `/5`)

`bg-white/5` คือพื้นสว่างจางๆ บนฉากมืด. `--color-on-media` เป็นสีขาวเช่นกัน จึงแทนได้ตรง — แต่ **ขยับ opacity จาก 5% เป็น 10%** เพราะ `on-media` ไม่ใช่ `#fff` เต็ม 100% (workflow.json ระบุว่าธีม dark ใช้ขาวนวลลด halation) การ์ดที่ 5% จะจางจนหายไป. ถ้า `--color-on-media` ที่ T3 กำหนดกลายเป็น `#ffffff` เต็ม ให้ใช้ `/5` ตามเดิมได้ — **dev ตรวจค่าจริงใน `themes.ts` ก่อนตัดสิน**.

### 4.2 `border-white/85` (RefCropPreview L80) → `border-on-media/85` (ห้ามใช้ `on-media-dim`)

เส้นประ crop ต้องเกือบทึบเพื่อให้เห็นบนภาพทุกสี. `on-media-dim` จางเกินไปสำหรับหน้าที่นี้ — ดู §5 case A.

### 4.3 `bg-white/80` (CompareModal L52) → `bg-on-media/80`

เส้น divider — เหตุผลเดียวกับ §4.2 คือมันเป็น *เส้นนำสายตา* ไม่ใช่ *ตัวหนังสือรอง*.

### 4.4 shimmer gradient (Gallery L545) — **ต้องแก้ ห้ามข้าม**

**ค่าเดิม:**
```
bg-[linear-gradient(100deg,transparent_30%,rgba(10,10,10,.06)_50%,transparent_70%)]
```

**ปัญหา:** `rgba(10,10,10,.06)` คือ "ดำจางมาก" ซึ่งเห็นได้เฉพาะบนพื้นสว่าง. ธีม ink/midnight/nocturne พื้นมืด → shimmer หายสนิท → **loading state หายไปเงียบๆ** ผู้ใช้ไม่รู้ว่าระบบกำลังทำงาน. build จับไม่ได้ ตาก็จับยากถ้าไม่ตั้งใจดู.

**ข้อสังเกตสำคัญ:** shimmer ตัวนี้ทับบน `bg-surface-2` (L435 การ์ดที่ยังไม่มีภาพ) → **ไม่ใช่ on-media จริงๆ แต่เป็น app-surface** ที่ต้องเห็นได้ทั้งพื้นสว่างและมืด. Token เดียวที่ตอบโจทย์ "เห็นได้บนทั้งสองขั้ว" ไม่มีในชุด 18 ตัว.

**ทางแก้ที่แนะนำ** — ใช้ `--color-text` ที่ contrast กับ `bg` เสมอทุกธีมอยู่แล้วตาม contrast budget:
```
bg-[linear-gradient(100deg,transparent_30%,color-mix(in_oklab,var(--color-text)_8%,transparent)_50%,transparent_70%)]
```
ธีม light → `text` เข้ม บนพื้นสว่าง = เห็น. ธีม dark → `text` สว่าง บนพื้นมืด = เห็น. ผ่าน grep gate (ไม่มี hex/rgba).

> Dev ต้อง**ตรวจด้วยตาทั้งธีม paper และ ink ตอน generate จริง** ตาม AC ของ T12 ไม่ใช่แค่แก้แล้วผ่าน build.

---

## 5. เคสตัดสินยาก — บันทึกเหตุผลไว้กันคนถามซ้ำ

### Case A — `border-white/85` vs `border-white/15`: ทำไมไม่ใช้ token เดียวกัน

**สถานการณ์:** RefCropPreview L80 (`/85`) กับ Gallery L436 (`/15`) เป็น `border-white` เหมือนกัน ตามกฎ §1.1 ควรยุบเป็น `border-on-media-dim` ทั้งคู่.

**ตัดสิน:** L80 ใช้ `border-on-media/85`, L436 ใช้ `border-on-media-dim`.

**เหตุผล:** สองจุดนี้ทำหน้าที่คนละอย่าง. `/15` คือ *ขอบตกแต่ง* ที่ช่วยแยก badge ออกจากภาพเบาๆ — จางได้. `/85` คือ *เส้นบอกขอบเขตการครอบตัด* ซึ่งเป็น **information carrier** ผู้ใช้ต้องเห็นชัดว่าภาพจะถูกตัดตรงไหน. ถ้ายุบเป็น token เดียว เส้น crop จะจางจนผู้ใช้ตัดสินใจผิดว่าภาพจะถูกครอบยังไง — เป็น functional regression ไม่ใช่แค่เรื่องสวยงาม. กฎ "ยุบ opacity" ใช้ได้กับสิ่งที่ opacity เป็นการตกแต่ง **ไม่ใช้กับสิ่งที่ opacity เป็นข้อมูล**.

### Case B — `bg-black/50` ที่ Sidebar L517 vs `bg-black/50` ที่ modal ทั้ง 6

**สถานการณ์:** ค่าเดิม identical เป๊ะ. ถ้า dev ใช้ find-replace ทั้งโปรเจกต์จะได้ `bg-overlay` ทั้งหมด.

**ตัดสิน:** modal ทั้ง 6 → `bg-overlay` (บริบท 1). Sidebar L517 → `bg-media-scrim/70` (บริบท 2).

**เหตุผล:** `--color-overlay` เป็น **theme-varying** โดยตั้งใจ (ธีมมืดต้องปรับค่าเพื่อคง separation ระหว่าง modal กับพื้นแอป — G3). ปุ่ม "ลบภาพ" ที่ Sidebar L517 ลอยอยู่บนภาพ ref ที่ผู้ใช้อัปโหลด — สีของภาพเป็นอะไรก็ได้ ไม่เกี่ยวกับธีมแอปเลย. ถ้าใช้ `bg-overlay` ในธีมที่ overlay สว่างขึ้น ปุ่มจะกลายเป็นเทาอ่อนบนภาพสว่าง แล้วตัวหนังสือ `on-media` (ขาว) จะอ่านไม่ออก. **บทเรียน: ค่าเดิมที่เหมือนกันไม่ได้แปลว่าบริบทเดียวกัน — ห้าม find-replace ข้ามไฟล์ ต้องไล่ทีละจุดตามตาราง §2.**

### Case C — `text-white/90` (CompareModal L101, L119) ควรเป็น dim หรือไม่

**ตัดสิน:** `text-on-media` (เต็ม) ไม่ใช่ `on-media-dim`.

**เหตุผล:** L101/L119 คือ prompt text ซึ่งเป็น**เนื้อหาหลัก**ของการ์ด meta ส่วน L102/L120 (`/50`) เป็น metadata รอง. 90% ในโค้ดเดิมคือการลด halation ไม่ใช่การลดลำดับความสำคัญ — สังเกตได้จากที่มันอยู่ใน `<div>` ที่ตัวพ่อเป็น `/70` แล้วลูกกลับ *สว่างกว่า* พ่อ. ถ้า map เป็น `dim` จะกลายเป็นสีเดียวกับพ่อ ลำดับชั้นภาพ (visual hierarchy) หายไป prompt จะอ่านยากเท่า metadata. `--color-on-media` เป็นขาวนวลอยู่แล้วตามดีไซน์ธีม จึงไม่เกิด halation.

---

## 6. NEEDS-DECISION — ต้องให้ MinJu ตัดสิน

### NEEDS-DECISION-1 — Gallery.tsx:476 ปุ่ม focus สถานะ "focused"

**โค้ดจริง (L473-477):**
```
(focused
  ? "border-text bg-[rgba(10,10,10,.72)] text-text opacity-100"
  : "border-white/15 bg-[rgba(10,10,10,.72)] text-white opacity-0 backdrop-blur-sm group-hover:opacity-100")
```

**ปัญหา:** สอง branch นี้ **ขัดแย้งกันในเชิงบริบท**. Branch `false` (L477) เป็น on-media ล้วน. Branch `true` (L476) กลับใช้ `border-text` + `text-text` ซึ่งเป็น **app-surface token** — บนพื้น `rgba(10,10,10,.72)` ที่มืด.

ในธีม paper ปัจจุบัน `text` = `#0a0a0a` (ดำ) → **ปุ่มที่ focus แล้วเป็นไอคอนดำบนพื้นดำ อ่านไม่ออกตั้งแต่ก่อนสปรินต์นี้แล้ว**. นี่คือบั๊กที่มีอยู่เดิม ไม่ใช่ผลจากงานกวาดสี.

**ทางเลือก:**
- **(ก)** map ตามบริบท [2]: `border-on-media` + `text-on-media` — ปุ่มที่ focus จะสว่างเต็ม ตัดกับปุ่มอื่นที่เป็น `on-media-dim` แก้บั๊กเดิมไปในตัว
- **(ข)** ใช้ `border-accent` + `text-accent` ให้เหมือนกับปุ่ม select/favorite ที่ active (L487, L503 ใช้ `border-accent bg-accent text-accent-ink`) — สอดคล้องกับภาษาภาพของปุ่มพี่น้อง แต่เปลี่ยน design intent
- **(ค)** คงพฤติกรรมเดิมเป๊ะ (map `text-text` → `text-text`) แล้วแยกเป็นบั๊กต่างหาก — งานกวาดสีไม่แก้พฤติกรรม

**นุ่นเอนไป (ก)** เพราะเป็น mechanical mapping ที่ตรงบริบทที่สุด, diff เล็ก, และ side effect คือแก้บั๊กเดิม ไม่ใช่สร้างของใหม่. **(ข)** เปลี่ยน visual design ซึ่งเกิน scope ของ cleanup task. แต่เนื่องจากมันเปลี่ยนสิ่งที่ผู้ใช้เห็น **ต้องให้ MinJu เคาะก่อน T12 เริ่ม**.

### NEEDS-DECISION-2 — Landing.tsx:140 dot texture (จุดที่ task list ตกหล่น)

**โค้ดจริง:** `[background-image:radial-gradient(#fff_0.7px,transparent_0.7px)]`

**สถานะ:** AC ของ T13 ระบุ Landing แค่ L139 กับ L143 — **ไม่มี L140**. แต่ grep gate ของ T16 (`grep -rEn '#[0-9a-fA-F]{3,8}\b|rgba?\('`) **จะจับเจอแน่นอน** และ `#fff` ไม่ใช่ box-shadow จึงไม่เข้า allowlist → **T16 จะ fail**.

**ทางเลือก:**
- **(ก)** เพิ่มเข้า scope T13: เปลี่ยนเป็น `radial-gradient(var(--color-on-media)_0.7px,transparent_0.7px)` — สอดคล้องกับการ์ดที่เป็น on-media ทั้งใบ, ผ่าน grep gate
- **(ข)** ใส่ใน allowlist ของ T16 ว่าเป็นจุดที่ตั้งใจปล่อย

**นุ่นเอนไป (ก)** เพราะการ์ดนี้ทั้งใบเป็นบริบท on-media อยู่แล้ว (L139 bg + text, L143 border) การปล่อย L140 ไว้เป็น hex ลอยจุดเดียวทำให้ allowlist ของ T16 มีข้อยกเว้นที่ไม่มีเหตุผลเชิงระบบ. **ต้องให้ MinJu อนุมัติขยาย scope T13 อีก 1 บรรทัด** — นุ่นเขียนไว้ในตาราง §2 แล้วเพื่อให้ dev เห็น แต่ห้ามแก้จนกว่าจะได้ไฟเขียว.

---

## 7. สรุปตัวเลข

| หมวด | จำนวน |
|---|---|
| **จุดต้องแก้ทั้งหมด (นับเป็นบรรทัด)** | **62 บรรทัด ใน 13 ไฟล์** |
| ├─ บริบท 1 (app-surface) | 6 บรรทัด (modal overlay ทั้งหมด) |
| ├─ บริบท 2 (on-media) | 54 บรรทัด |
| └─ บริบท 3 (semantic) | 2 บรรทัด (Header status dots) |
| **จุด do-not-touch** | **23 จุด** (15 box-shadow + 8 จุดอื่นตาม §3.2) |
| **NEEDS-DECISION** | **2 ข้อ** (Gallery L476, Landing L140) |

### แยกตาม task

| Task | ไฟล์ | บรรทัดที่แก้ | บริบทหลัก |
|---|---|---|---|
| T9 | 6 modal | 6 | [1] |
| T10 | Lightbox | 20 | [2] |
| T11 | CompareModal + RefCropPreview | 13 + 6 = 19 | [2] |
| T12 | Gallery | 12 | [2] |
| T13 | Sidebar + Header + Landing + utils | 4 + 2 + 3 (+1 pending) = 9 | [2] + [3] |

> หมายเหตุการนับ: นับเป็น "บรรทัดที่ต้องแก้" ไม่ใช่ "จำนวน class ที่เปลี่ยน" — หลายบรรทัดมี 2-3 class ต้องเปลี่ยนพร้อมกัน. รวมจำนวน class ที่เปลี่ยนจริงประมาณ 110 จุด ตรงกับที่ workflow.json ประเมินไว้ (~120).

---

## 8. Checklist ก่อนปิด task cleanup ทุกตัว

- [ ] ทุกจุดที่แก้อยู่ในตาราง §2 — ไม่มีจุดที่แก้เองนอกตาราง
- [ ] ไม่มีจุดใน §3 ถูกแตะ
- [ ] `grep -nE '\b(text|bg|border|from|to|via|ring|fill|stroke|divide|placeholder)-(white|black)(/[0-9]{1,3})?\b' <ไฟล์ที่แก้>` → 0
- [ ] `grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' <ไฟล์ที่แก้>` → เหลือเฉพาะบรรทัดที่ list ไว้ใน §3.1
- [ ] เปิดจริงในธีม **paper** — ตัวหนังสือบนภาพยัง**ขาว** ไม่กลายเป็นดำ (ถ้าดำ = map ผิดเป็น `text` แทน `on-media` = R1 เกิดแล้ว)
- [ ] เปิดจริงในธีม **ink** — modal ยังแยกจากพื้นหลังได้
- [ ] `npm run build` ผ่าน
