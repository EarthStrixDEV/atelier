<div align="center">

<img src="public/assets/atelier-logo.png" alt="Atelier logo" width="112" />

# Atelier

### AI Media Studio สำหรับสร้างภาพ วิดีโอ เพลง และเสียงพูดในที่เดียว

เลือกโมเดลจาก OpenRouter · ปรับ prompt อย่างเป็นระบบ · เปรียบเทียบผลลัพธ์ · จัดเก็บงานได้จากเบราว์เซอร์

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=fff)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=fff)](https://tailwindcss.com/)
[![OpenRouter](https://img.shields.io/badge/Powered_by-OpenRouter-6366F1)](https://openrouter.ai/)

[เริ่มต้นใช้งาน](#-เริ่มต้นใช้งาน) · [ความสามารถ](#-ความสามารถหลัก) · [โครงสร้างโปรเจกต์](#-โครงสร้างโปรเจกต์) · [ความเป็นส่วนตัว](#-ข้อมูลและความเป็นส่วนตัว)

</div>

---

## ✨ Atelier คืออะไร

Atelier คือเว็บแอปแบบ client-only สำหรับงาน generative media ที่รวม workflow ตั้งแต่คิด prompt เลือกโมเดล สร้างงาน เปรียบเทียบ ไปจนถึงดาวน์โหลดและจัดเก็บไฟล์ไว้ในหน้าจอเดียว ตัวแอปเชื่อมต่อ OpenRouter โดยตรงจากเบราว์เซอร์ จึงไม่ต้องมี backend ของตัวเอง

| Route | หน้าที่ |
|---|---|
| `/` | Landing page และภาพรวมผลิตภัณฑ์ |
| `/studio` | พื้นที่สร้างและจัดการสื่อทั้ง 6 โหมด |
| `/models` | Model Catalog สำหรับเทียบราคา สเปก และงานที่เหมาะกับแต่ละโมเดล |

## 🎛️ 6 โหมดสร้างสื่อ

| โหมด | ผลลัพธ์ | เหมาะกับ |
|---|---|---|
| **General** | ภาพนิ่ง | Portrait, product shot, artwork และภาพทั่วไป |
| **Infographic** | ภาพนิ่งเชิงข้อมูล | Timeline, comparison, stat grid และกราฟิกสองภาษา |
| **Video** | วิดีโอ 720p | คลิปสั้นแบบ text-to-video หรือ image-to-video ตาม capability ของโมเดล |
| **Cinematic** | วิดีโอแบบต่อฉาก | สร้าง scene ต่อเนื่องจากเฟรมของคลิปก่อนหน้า |
| **Audio** | เพลง/คลิปเสียง | สร้างเพลงด้วยโมเดลตระกูล Lyria |
| **TTS** | เสียงพูด | แปลงบทพูดเป็นเสียงด้วย Gemini TTS พร้อมตัวเลือกเสียงพากย์ |

แต่ละโหมดมี prompt, model, settings, queue, history และ gallery แยกจากกัน สลับโหมดระหว่างสร้างงานได้โดยผลลัพธ์ไม่ไหลไปผิด gallery

## 🚀 ความสามารถหลัก

### สร้างงานและควบคุมรายละเอียด

- โหลดรายชื่อและ capability ของโมเดลจาก OpenRouter พร้อม curated fallback สำหรับโมเดลสำคัญ
- เลือกอัตราส่วน `1:1`, `4:3`, `3:4`, `16:9` และ `9:16`
- สร้าง batch ครั้งละ 1, 2, 4 หรือ 6 ชิ้น และจัด Multi-Prompt Queue ได้สูงสุด 5 รายการ
- จำกัด request ที่ทำงานพร้อมกันไม่เกิน 4 งาน เพื่อไม่ให้เบราว์เซอร์ยิงคำขอมากเกินไป
- แนบ Reference, Style และ Facial reference ได้ชนิดละสูงสุด 2 รูป ขนาดไม่เกิน 4 MB ต่อรูป เมื่อโมเดลรองรับ
- ใช้ negative prompt ในโหมด General และ Infographic
- ยกเลิกงานที่กำลังรอหรือกำลังสร้าง และ retry เฉพาะงานที่ล้มเหลวได้

### Prompt workflow ตั้งแต่ไอเดียจนพร้อมสร้าง

- **Prompt Builder** — keyword แยกตาม style, lighting, camera, mood และ continuity
- **Templates** — template สำเร็จรูป และบันทึก template ส่วนตัวได้สูงสุด 20 รายการต่อโหมด
- **Prompt Optimizer** — ให้ AI ช่วยขยาย prompt พร้อมเสนอ keyword ที่เลือกใช้ได้
- **Chat with Atelier** — ผู้ช่วยคิด prompt และให้คำแนะนำตามโหมดที่ใช้งาน
- **Grill me** — สัมภาษณ์บรีฟ 6–10 คำถาม แล้วตกผลึกเป็น prompt หลายทางเลือก
- **Prompt History** — เก็บ 30 รายการต่อโหมด พร้อม pin และ history รวมทุกโหมด

### เปรียบเทียบ ปรับต่อ และจัดการผลงาน

- **Bake-off** — ส่ง prompt เดียวกันให้โมเดลพร้อมกันได้สูงสุด 4 ตัว พร้อมสรุปราคาก่อนยืนยัน
- **Compare** — เทียบภาพ 2–4 รูป รวม swipe compare สำหรับ 2 รูป
- **Refine / Start from** — นำผลงานเดิมไปปรับต่อหรือใช้เป็นเฟรมตั้งต้นของวิดีโอ
- **TimeFrame & Extend** — เลือกเฟรมจาก timeline เพื่อสร้างฉาก Cinematic ถัดไป
- **Auto Extend** — จับเฟรมท้ายของคลิปและต่อ scene ใหม่อัตโนมัติ
- เลือกหลายรายการเพื่อดาวน์โหลดหรืออัปโหลดขึ้น Google Drive พร้อม favorite และ filter
- Lightbox สำหรับ preview, เล่นสื่อ และดาวน์โหลดไฟล์เต็ม
- สร้าง share card จากผลงานได้ในเบราว์เซอร์

### ป้องกันค่าใช้จ่ายและกู้คืนงาน

- แสดงราคาประเมินของงานตามข้อมูล pricing ที่มีอยู่
- **Spend Guard** ตั้งเพดานค่าใช้จ่ายสะสมและขอคำยืนยันก่อนยิง batch ที่เกินวงเงิน
- เก็บ pending job เพื่อพยายาม reconcile งาน async หลัง reload
- บันทึก session snapshot ทุก 30 วินาที และมี Restore Banner เมื่อพบ session ที่กู้ได้
- Export / Import session เป็น `.json` รองรับ Replace และ Merge พร้อม preview ก่อนนำเข้า

> [!IMPORTANT]
> ราคาที่แสดงเป็นค่าประเมินจาก metadata ของโมเดล ไม่ใช่ใบเสร็จหรือยอดเงินจริงจาก OpenRouter งานที่ส่งถึงผู้ให้บริการแล้วอาจยังถูกคิดเงินแม้ยกเลิกฝั่งเบราว์เซอร์

## 🏁 เริ่มต้นใช้งาน

### สิ่งที่ต้องมี

- Node.js `22.12` ขึ้นไป
- npm และ OpenRouter API key

```bash
git clone https://github.com/EarthStrixDEV/atelier.git
cd atelier
npm install
npm run dev
```

เปิด [http://localhost:5173](http://localhost:5173) แล้วใส่ API key รูปแบบ `sk-or-v1-…` ในหน้าต่าง API Key หรือสร้างใหม่จาก [OpenRouter Keys](https://openrouter.ai/keys)

### Environment variables

สร้าง `.env.local` เมื่อต้องการเปิดความสามารถ Google Drive:

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

ตัวแปรนี้เป็น optional หากไม่ตั้งค่า ปุ่ม Google Drive จะไม่แสดง ส่วน OpenRouter API key ใส่ผ่าน UI และไม่เก็บในไฟล์ environment

## 📜 คำสั่งที่ใช้บ่อย

| คำสั่ง | รายละเอียด |
|---|---|
| `npm run dev` | เปิด Vite development server |
| `npm run build` | ตรวจ TypeScript แล้วสร้าง production build ลง `dist/` |
| `npm run preview` | เปิด production build เพื่อทดสอบในเครื่อง |

โปรเจกต์ยังไม่มี script สำหรับ lint หรือ automated tests ใน `package.json`

## ⌨️ Keyboard shortcuts

| ปุ่ม | การทำงาน |
|---|---|
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> | Generate ด้วยค่าปัจจุบัน |
| <kbd>1</kbd>–<kbd>6</kbd> หรือ <kbd>Alt</kbd> + <kbd>1</kbd>–<kbd>6</kbd> | สลับโหมด General → TTS |
| <kbd>/</kbd> | โฟกัสช่อง prompt |
| <kbd>Shift</kbd> + <kbd>?</kbd> | เปิด/ปิดหน้ารวม shortcuts |
| <kbd>←</kbd> / <kbd>→</kbd> | เลื่อนผลงานใน Lightbox |
| <kbd>Esc</kbd> | ปิด modal, panel หรือ Lightbox |

## 💾 การจัดเก็บและส่งออก

| วิธี | ตำแหน่ง | พฤติกรรม |
|---|---|---|
| Gallery Persistence | IndexedDB | Opt-in; สูงสุด 60 ชิ้นต่อโหมด, รวม 500 MB, ไม่เกิน 80 MB ต่อชิ้น |
| Auto Save | โฟลเดอร์ในเครื่อง | ใช้ File System Access API และต้องอนุญาตสิทธิ์ตามข้อกำหนดเบราว์เซอร์ |
| Google Drive | `Atelier Output` | ใช้ OAuth scope `drive.file`; แอปเข้าถึงเฉพาะไฟล์ที่สร้างผ่านแอป |
| Export Session | ไฟล์ `.json` | สำรอง settings, prompt, queue และ metadata; ไม่ฝังไฟล์สื่อ |
| Download | เครื่องผู้ใช้ | ดาวน์โหลดผลงานเดี่ยวหรือหลายรายการโดยตรง |

> [!NOTE]
> Auto Save เหมาะกับ Chrome, Edge และเบราว์เซอร์ Chromium ที่รองรับ `showDirectoryPicker` ส่วนเบราว์เซอร์อื่นยังใช้ Download ได้ตามปกติ

## 🔐 ข้อมูลและความเป็นส่วนตัว

- แอปไม่มี backend ของตัวเอง คำขอสร้างสื่อถูกส่งจากเบราว์เซอร์ไป OpenRouter โดยตรง
- ค่าเริ่มต้นเก็บ API key ใน `sessionStorage` จึงอยู่รอดเมื่อ refresh แต่หายเมื่อปิดแท็บ ผู้ใช้ opt-in ให้จำใน `localStorage` ได้
- Prompt history, templates, favorites, settings, spend ledger และ session snapshot เก็บใน `localStorage`
- ไฟล์ gallery เก็บใน IndexedDB ก็ต่อเมื่อเปิด Gallery Persistence
- Reference images และ media ที่ยังไม่ได้ persist อยู่ใน memory ของแท็บ
- Google Drive ใช้ access token ใน memory และ scope จำกัด `drive.file`

ควรตรวจนโยบายข้อมูลและค่าใช้จ่ายของโมเดลบน OpenRouter ก่อนส่งข้อมูลที่เป็นความลับ

## 🏗️ สถาปัตยกรรมโดยย่อ

```text
Browser (React SPA)
├─ Landing / Model Catalog
└─ Studio
   ├─ UI: Header · Prompt Composer · Sidebar · Gallery · Modals
   ├─ Store: mutable singleton + useSyncExternalStore
   ├─ Actions: generation · queue · polling · persistence · export
   ├─ Local data: sessionStorage · localStorage · IndexedDB
   └─ External services
      ├─ OpenRouter API — models, image, video, audio, TTS และ assistant
      └─ Google Drive API — optional file upload
```

แอป route คำขอตาม modality ของโมเดล: image+text ใช้ chat completions, image-only ใช้ Image API, วิดีโอใช้ async job และ polling ส่วน audio/TTS ใช้เส้นทางที่สอดคล้องกับโมเดล งานทั้งหมดผ่าน request governor กลางเพื่อควบคุม concurrency

## 📁 โครงสร้างโปรเจกต์

```text
atelier/
├─ public/assets/atelier-logo.png      # โลโก้หลักและ favicon
├─ src/
│  ├─ components/                 # Studio UI, modal, gallery และ catalog
│  ├─ lib/
│  │  ├─ actions.ts               # orchestration และ business logic
│  │  ├─ constants.ts             # modes, models, limits และ templates
│  │  ├─ store.ts                 # global state และ browser storage
│  │  ├─ galleryStore.ts          # IndexedDB gallery persistence
│  │  ├─ fsAccess.ts              # Auto Save ลงเครื่อง
│  │  ├─ googleDrive.ts           # Google OAuth และ Drive upload
│  │  ├─ shortcuts.ts             # global keyboard shortcuts
│  │  └─ types.ts                 # TypeScript domain types
│  ├─ pages/                      # Landing, Studio และ Model Catalog
│  ├─ index.css
│  └─ main.tsx
├─ legacy/index.html              # เวอร์ชัน single-file เดิม
├─ vite.config.ts
├─ vercel.json                    # SPA rewrite สำหรับ Vercel
└─ package.json
```

## 🌐 Production และการ Deploy

```bash
npm run build
npm run preview
```

ผลลัพธ์อยู่ใน `dist/` และ deploy บน static hosting ได้ สำหรับ Vercel มี SPA rewrite เตรียมไว้แล้ว หากใช้ผู้ให้บริการอื่นต้องตั้ง fallback ของ `/studio` และ `/models` กลับเข้า `index.html`

หากเปิด Google Drive ให้เพิ่ม `VITE_GOOGLE_CLIENT_ID` ใน hosting environment และตั้ง Authorized JavaScript origins ใน Google Cloud ให้ตรงกับโดเมน production

## 🤝 แนวทางพัฒนา

1. สร้าง branch สำหรับงานที่ต้องการแก้
2. รักษา TypeScript strict และเพิ่ม domain type ใน `src/lib/types.ts`
3. รวม limits และ model metadata ไว้ใน `src/lib/constants.ts`
4. อย่าใส่ secret หรือ API key ลง source code
5. รัน `npm run build` ก่อนเปิด Pull Request

## ⚠️ ข้อจำกัดที่ควรรู้

- ความพร้อมใช้งาน ราคา และ capability ของโมเดลอาจเปลี่ยนตาม OpenRouter
- Progress ของวิดีโอเป็นค่าประเมินจากเวลา เพราะ API ไม่ส่งเปอร์เซ็นต์จริง
- การปิดแท็บระหว่างงานที่ provider รับไปแล้วอาจทำให้ผลลัพธ์กลับมาไม่สมบูรณ์
- Gallery Persistence เป็น opt-in และลบงานเก่าที่ไม่ติดดาวเมื่อเกินเพดานพื้นที่
- ระบบไม่รับรองค่าใช้จ่ายจริง ให้ตรวจยอดในบัญชี OpenRouter เสมอ

## 📄 License

โปรเจกต์นี้ยังไม่ได้ระบุ license จึงสงวนลิขสิทธิ์ตามค่าเริ่มต้น หากต้องการนำไปเผยแพร่ แก้ไข หรือแจกจ่าย ควรขออนุญาตเจ้าของ repository ก่อน

---

<div align="center">

สร้างสื่ออย่างเป็นระบบ ตั้งแต่ไอเดียแรกจนถึงไฟล์พร้อมใช้งาน — **Atelier**

</div>
