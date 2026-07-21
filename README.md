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
| ⭐ **Preferred models** | โมเดลยอดนิยม (Grok Imagine, GPT Image) ลอยขึ้นบนสุดของ dropdown อัตโนมัติ |
| 📐 **Aspect Ratio 5 แบบ** | `1:1` · `4:3` · `3:4` · `16:9` · `9:16` |
| 🖼️ **Batch generation** | สั่ง gen ครั้งละ 1 / 2 / 4 / 6 ภาพ — แต่ละภาพเป็น request แยกกัน ภาพไหน error กด "ลองใหม่" เฉพาะภาพนั้นได้ |
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

### 3. Generate!

1. พิมพ์ prompt อธิบายภาพที่ต้องการ (ไทยหรืออังกฤษก็ได้ ขึ้นกับโมเดล)
2. เลือกโมเดล, aspect ratio, จำนวนภาพ
3. กดปุ่ม **Generate** หรือกด <kbd>Enter</kbd> ในช่อง prompt ได้เลย

## ⌨️ Keyboard Shortcuts

| ปุ่ม | ทำอะไร |
|---|---|
| <kbd>Enter</kbd> (ในช่อง prompt) | สั่ง generate |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | ขึ้นบรรทัดใหม่ใน prompt |
| <kbd>←</kbd> / <kbd>→</kbd> (ใน lightbox) | เลื่อนดูภาพก่อนหน้า / ถัดไป |
| <kbd>Esc</kbd> (ใน lightbox) | ปิด lightbox |

## 🏗️ How It Works

```
┌─────────────────────────────────────────────────────┐
│  index.html  (ทั้งแอปอยู่ในไฟล์เดียว)                    │
│                                                     │
│  ┌───────────┐   GET /api/v1/models                 │
│  │  Sidebar  │ ─────────────────────► OpenRouter    │
│  │  (prompt, │   กรองเฉพาะโมเดลที่มี                    │
│  │   model,  │   output_modalities: ["image"]       │
│  │   ratio)  │                                      │
│  └─────┬─────┘                                      │
│        │ Generate (N ภาพ = N requests ขนาน)          │
│        ▼                                            │
│  POST /api/v1/chat/completions                      │
│  { model, messages, modalities: ["image","text"] }  │
│        │                                            │
│        ▼                                            │
│  ┌───────────┐                                      │
│  │  Gallery  │  ภาพกลับมาเป็น data URL ใน              │
│  │  + Light- │  choices[0].message.images[0]        │
│  │    box    │  .image_url.url                      │
│  └───────────┘                                      │
└─────────────────────────────────────────────────────┘
```

รายละเอียดเชิงเทคนิค:

- **Vanilla JS ล้วน** — ไม่มี framework, ไม่มี build step, state ทั้งหมดอยู่ใน object เดียวและ render ผ่านฟังก์ชันเดียว
- **Aspect ratio** ส่งผ่าน `image_config.aspect_ratio` และแนบเป็น hint ท้าย prompt ด้วย (เผื่อโมเดลที่ไม่รองรับ `image_config`)
- **แต่ละภาพใน batch เป็น request อิสระ** — ภาพหนึ่งพังไม่กระทบภาพอื่น และ retry ได้รายภาพ

## 📁 Project Structure

```
atelier/
├── index.html   # ทั้งแอป: HTML + CSS + JS
├── CLAUDE.md    # คู่มือสำหรับ Claude Code
└── README.md    # ไฟล์นี้
```

## 📄 License

ยังไม่ได้ระบุ license
