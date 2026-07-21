<div align="center">

# 🎨 Atelier

**AI Image Studio — สร้างภาพด้วย AI ผ่าน OpenRouter ในไฟล์เดียว**

*ไม่ต้องติดตั้ง ไม่ต้อง build ไม่มี dependency — เปิดไฟล์เดียวใช้ได้เลย*

![HTML](https://img.shields.io/badge/HTML-single_file-e34f26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-f7df1e?logo=javascript&logoColor=black)
![OpenRouter](https://img.shields.io/badge/API-OpenRouter-6467f2)
![No Build](https://img.shields.io/badge/build-none-success)

</div>

---

## ✨ Features

| ฟีเจอร์ | รายละเอียด |
|---|---|
| 🤖 **เลือกโมเดลได้อิสระ** | ดึงรายชื่อโมเดลสดจาก OpenRouter — กรองเฉพาะโมเดลที่ generate ภาพได้จริง พร้อมแสดงราคาต่อ 1k ภาพ |
| ⭐ **Preferred models** | โมเดลยอดนิยม (Grok Imagine Image Quality, GPT Image) ลอยขึ้นบนสุดของ dropdown อัตโนมัติ — Grok Imagine ถูก merge เข้า list เสมอแม้ OpenRouter จะยังไม่ list ไว้ |
| 📐 **Aspect Ratio 5 แบบ** | `1:1` · `4:3` · `3:4` · `16:9` · `9:16` |
| 🖼️ **Batch generation** | สั่ง gen ครั้งละ 1 / 2 / 4 / 6 ภาพ — แต่ละภาพเป็น request แยกกัน ภาพไหน error กด "ลองใหม่" เฉพาะภาพนั้นได้ |
| 📋 **Multi-Prompt Queue** | เพิ่ม prompt + model + ratio + จำนวนภาพ เข้าคิวได้สูงสุด 5 คิว แต่ละคิวตั้งค่าต่างกันได้อิสระ ดูรายการ/ลบทีละคิวได้ แล้วกด **Generate Queue** ยิงรันทุกคิวรวดเดียว |
| 🧩 **Prompt Builder** | คลิก keyword สำเร็จรูปต่อท้าย prompt อัตโนมัติ แบ่งเป็น 8 หมวด: สไตล์ · แสง · มุมกล้อง · โทน/อารมณ์ · รายละเอียด · ท่าทาง · Prop ประกอบฉาก · บุคคล/สัตว์ (คลิกซ้ำเพื่อลบ, sync ตามข้อความใน prompt อัตโนมัติ) |
| 🏷️ **Model Tag บนภาพ** | ทุกภาพใน Gallery ติด tag ชื่อโมเดลที่ใช้ gen ไว้ที่มุมภาพ ดูย้อนหลังได้ว่าภาพไหนมาจากโมเดลไหน |
| 📐 **Sidebar พับเก็บได้** | คลิกปุ่มลูกศรที่ header เพื่อเลื่อนซ่อน/แสดง sidebar ขยายพื้นที่ Gallery เต็มจอ |
| 🔍 **Lightbox** | คลิกภาพเพื่อดูเต็มจอ เลื่อนซ้าย-ขวาด้วยปุ่มหรือคีย์บอร์ด พร้อมปุ่ม Download |
| ⚡ **Loading state** | shimmer + spinner ระหว่างรอ gen แสดงจำนวนภาพที่กำลังทำอยู่แบบ real-time |
| 🌙 **Dark theme** | UI มินิมอลโทนดำ รองรับภาษาไทย (Noto Sans Thai) และ responsive บนมือถือ |
| 🔒 **Privacy-first** | API key เก็บใน memory ของหน้าเว็บเท่านั้น — ไม่บันทึกลงเครื่อง ไม่ส่งไปที่อื่นนอกจาก OpenRouter |

## 🚀 Getting Started

### 1. เปิดแอป

ไม่ต้องติดตั้งอะไรทั้งนั้น — ดับเบิลคลิก `index.html` หรือถ้าอยากรันผ่าน local server:

```bash
# ตัวเลือกใดตัวเลือกหนึ่ง
npx serve .
python -m http.server 8000
```

### 2. ใส่ OpenRouter API Key

1. สร้าง key ได้ที่ [openrouter.ai/keys](https://openrouter.ai/keys)
2. เปิดแอปแล้ว modal จะเด้งให้ใส่ key อัตโนมัติ (หรือคลิกที่ปุ่ม **"ใส่ API Key"** มุมขวาบน)
3. วาง key รูปแบบ `sk-or-v1-…` แล้วกดบันทึก

> [!NOTE]
> Key เก็บไว้ใน memory เท่านั้น — **ปิดหน้าเว็บแล้วต้องใส่ใหม่** เป็นการออกแบบโดยตั้งใจเพื่อความปลอดภัยค่ะ

### 3. แต่ง prompt ด้วย Prompt Builder (ไม่บังคับ)

เปิดกลุ่ม keyword ใน sidebar (สไตล์ / แสง / มุมกล้อง / โทน-อารมณ์ / รายละเอียด / ท่าทาง / Prop ประกอบฉาก / บุคคล-สัตว์) แล้วคลิกคำที่ต้องการ ระบบจะต่อท้าย prompt ให้อัตโนมัติ คลิกซ้ำเพื่อเอาออก

### 4. Generate!

1. พิมพ์ prompt อธิบายภาพที่ต้องการ (ไทยหรืออังกฤษก็ได้ ขึ้นกับโมเดล)
2. เลือกโมเดล, aspect ratio, จำนวนภาพ
3. กดปุ่ม **Generate** หรือกด <kbd>Enter</kbd> ในช่อง prompt ได้เลย

### 5. หรือจะตั้งคิวหลาย prompt พร้อมกัน

1. ตั้งค่า prompt / โมเดล / ratio / จำนวนภาพ ตามต้องการ แล้วกด **"+ เพิ่มเข้าคิว"**
2. เปลี่ยน prompt หรือโมเดลแล้วเพิ่มเข้าคิวต่อได้อีก (สูงสุด 5 คิว) — แต่ละคิวมี setting เป็นของตัวเอง
3. รายการคิวจะโชว์ในหมด sidebar ลบทิ้งทีละคิวได้ด้วยปุ่ม ✕
4. กดปุ่ม **Generate Queue (n)** เพื่อรันทุกคิวพร้อมกันในครั้งเดียว

## ⌨️ Keyboard Shortcuts

| ปุ่ม | ทำอะไร |
|---|---|
| <kbd>Enter</kbd> (ในช่อง prompt) | สั่ง generate |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | ขึ้นบรรทัดใหม่ใน prompt |
| <kbd>←</kbd> / <kbd>→</kbd> (ใน lightbox) | เลื่อนดูภาพก่อนหน้า / ถัดไป |
| <kbd>Esc</kbd> (ใน lightbox) | ปิด lightbox |

## 🏗️ How It Works

```
┌───────────────────────────────────────────────────────────┐
│  index.html  (ทั้งแอปอยู่ในไฟล์เดียว)                          │
│                                                             │
│  ┌───────────┐   GET /api/v1/models                        │
│  │  Sidebar  │ ─────────────────────► OpenRouter           │
│  │ (prompt,  │   กรองเฉพาะโมเดลที่มี output_modalities:        │
│  │  builder, │   ["image"] + merge โมเดลที่ pin ไว้เอง         │
│  │  model,   │                                              │
│  │  queue)   │                                              │
│  └─────┬─────┘                                              │
│        │ Generate (คิวหรือ single prompt → N ภาพ           │
│        │           = N requests ขนาน)                       │
│        ▼                                                    │
│  แยกเส้นทางตาม output_modalities ของโมเดลที่เลือก              │
│  ┌─────────────────────┐   ┌──────────────────────────┐    │
│  │ image + text         │   │ image เท่านั้น              │    │
│  │ POST /chat/completions│  │ (เช่น Grok Imagine)        │    │
│  │ modalities:           │  │ POST /api/v1/images       │    │
│  │  ["image","text"]     │  │ { prompt, aspect_ratio }  │    │
│  └──────────┬────────────┘  └────────────┬─────────────┘   │
│             │  message.images[0]          │ data[0].b64_json│
│             ▼                             ▼                │
│  ┌───────────────────────────────────────────────┐         │
│  │  Gallery + Model Tag + Lightbox                │         │
│  │  ภาพแปลงเป็น data URL แสดงพร้อม tag ชื่อโมเดล        │         │
│  └───────────────────────────────────────────────┘         │
└───────────────────────────────────────────────────────────┘
```

รายละเอียดเชิงเทคนิค:

- **Vanilla JS ล้วน** — ไม่มี framework, ไม่มี build step, state ทั้งหมดอยู่ใน object เดียวและ render ผ่านฟังก์ชันเดียว
- **Routing ตามชนิดโมเดล** — โมเดลที่ output ได้ทั้ง image และ text (Gemini, GPT Image) ใช้ `chat/completions`; โมเดล image-only (Grok Imagine) ใช้ `POST /api/v1/images` โดยตรง เพราะ `chat/completions` จะ error "No endpoints found" ถ้าขอ modality `text` จากโมเดลที่ไม่รองรับ
- **Aspect ratio** ฝั่ง `chat/completions` ส่งผ่าน `image_config.aspect_ratio` และแนบเป็น hint ท้าย prompt ด้วย (เผื่อโมเดลไม่รองรับ `image_config`) ส่วนฝั่ง Image API ส่ง `aspect_ratio` ตรงๆ เป็น native param
- **แต่ละภาพเป็น request อิสระ** — ทั้งใน batch เดียวและข้ามคิว ภาพหนึ่งพังไม่กระทบภาพอื่น และ retry ได้รายภาพ
- **Queue** เป็นแค่ snapshot ของ (prompt, model, ratio, count) ที่เก็บใน memory — กด Generate Queue แล้วจะ flatten ทุกคิวเป็น batch เดียวแล้วยิงพร้อมกันทั้งหมด

## 📁 Project Structure

```
atelier/
├── index.html   # ทั้งแอป: HTML + CSS + JS
├── CLAUDE.md    # คู่มือสำหรับ Claude Code
└── README.md    # ไฟล์นี้
```

## 📄 License

ยังไม่ได้ระบุ license
