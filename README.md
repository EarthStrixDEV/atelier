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
| 🖼️ **โหมด Infographic แยกต่างหาก** | สลับโหมดได้จากแท็บบน header — จำกัดโมเดลเหลือแค่ GPT-5.4 Image 2 กับ Nano Banana Pro พร้อม Prompt Builder ชุดเฉพาะสำหรับ infographic และ gallery/prompt/คิวแยกจากโหมด Home โดยสิ้นเชิง |
| 📐 **Aspect Ratio 5 แบบ** | `1:1` · `4:3` · `3:4` · `16:9` · `9:16` |
| 🖼️ **Batch generation** | สั่ง gen ครั้งละ 1 / 2 / 4 / 6 ภาพ — แต่ละภาพเป็น request แยกกัน ภาพไหน error กด "ลองใหม่" เฉพาะภาพนั้นได้ |
| 📋 **Multi-Prompt Queue** | เพิ่ม prompt + model + ratio + จำนวนภาพ เข้าคิวได้สูงสุด 5 คิว แต่ละคิวตั้งค่าต่างกันได้อิสระ ดูรายการ/ลบทีละคิวได้ แล้วกด **Generate Queue** ยิงรันทุกคิวรวดเดียว |
| 🧩 **Prompt Builder** | คลิก keyword สำเร็จรูปต่อท้าย prompt อัตโนมัติ (คลิกซ้ำเพื่อลบ, sync ตามข้อความใน prompt อัตโนมัติ) — ชุด keyword เปลี่ยนตามโหมดที่เลือกอยู่ ดูรายละเอียดที่หัวข้อ [Prompt Builder ทั้งสองโหมด](#-prompt-builder-ทั้งสองโหมด) |
| 🏷️ **Model Tag บนภาพ** | ทุกภาพใน Gallery ติด tag ชื่อโมเดลที่ใช้ gen ไว้ที่มุมภาพ ดูย้อนหลังได้ว่าภาพไหนมาจากโมเดลไหน |
| 📐 **Sidebar พับเก็บได้** | คลิกปุ่มลูกศรที่ header เพื่อเลื่อนซ่อน/แสดง sidebar ขยายพื้นที่ Gallery เต็มจอ |
| 🔍 **Lightbox** | คลิกภาพเพื่อดูเต็มจอ เลื่อนซ้าย-ขวาด้วยปุ่มหรือคีย์บอร์ด พร้อมปุ่ม Download |
| ⚡ **Loading state** | shimmer + spinner ระหว่างรอ gen แสดงจำนวนภาพที่กำลังทำอยู่แบบ real-time |
| 🌙 **Dark theme** | UI มินิมอลโทนดำ รองรับภาษาไทย (Noto Sans Thai) และ responsive บนมือถือ |
| 🔒 **Privacy-first** | API key เก็บใน memory ของหน้าเว็บเท่านั้น — ไม่บันทึกลงเครื่อง ไม่ส่งไปที่อื่นนอกจาก OpenRouter |

## 🖼️ โหมด Home vs Infographic

แอปมี 2 โหมด สลับได้จากแท็บกลาง header — แต่ละโหมดแยก **prompt, gallery, คิว, aspect ratio, จำนวนภาพ** เป็นของตัวเอง สลับไปมาข้อมูลไม่ปนกัน และภาพที่ gen ไว้ยังอยู่ครบเมื่อสลับกลับมา ส่วนอื่นๆ (API key, Batch generation, Lightbox, Sidebar, Model tag ฯลฯ) ใช้ระบบเดียวกันทั้งสองโหมด

| | Home | Infographic |
|---|---|---|
| **โมเดลที่เลือกได้** | ทุกโมเดล image-generation บน OpenRouter | จำกัดเฉพาะ **GPT-5.4 Image 2** (`openai/gpt-5.4-image-2`) และ **Nano Banana Pro** (`google/gemini-3-pro-image`) เท่านั้น |
| **ใช้ทำอะไร** | สร้างภาพทั่วไป (portrait, art, ฉาก ฯลฯ) | สร้าง infographic / กราฟิกให้ข้อมูลโดยเฉพาะ |
| **Prompt Builder** | 8 หมวด: สไตล์ · แสง · มุมกล้อง · โทน/อารมณ์ · รายละเอียด · ท่าทาง · Prop ประกอบฉาก · บุคคล/สัตว์ | 6 หมวด: Style · Layout · Language · Header · Detail · Segmentation |

### 🧩 Prompt Builder ทั้งสองโหมด

<details>
<summary><b>Home</b> — 8 หมวด</summary>

| หมวด | ตัวอย่าง keyword |
|---|---|
| สไตล์ | photorealistic, cinematic, anime style, watercolor, cyberpunk, 3D render |
| แสง | studio lighting, golden hour, soft light, neon lights, dramatic lighting |
| มุมกล้อง | close-up portrait, wide angle, top-down view, macro shot, bokeh background |
| โทน / อารมณ์ | warm tones, moody, dreamy, vibrant colors, black and white |
| รายละเอียด | highly detailed, sharp focus, high contrast, 8k, film grain |
| ท่าทาง | standing pose, sitting, walking, running, dancing, action pose |
| Prop ประกอบฉาก | holding a coffee cup, with an umbrella, neon sign background, vintage car |
| บุคคล / สัตว์ | young woman, elderly person, child, cat, dog, dragon, robot |

</details>

<details>
<summary><b>Infographic</b> — 6 หมวด</summary>

| หมวด | ตัวอย่าง keyword |
|---|---|
| Style | flat design, corporate style, modern minimal, hand-drawn style, isometric |
| Layout | vertical layout, grid layout, circular layout, timeline layout, comparison layout |
| Language | Thai text, English text, bilingual Thai-English, no text (icons only) |
| Header | bold title header, centered header, banner header, icon beside title |
| Detail | data-heavy detail, with icons, with charts, with statistics, with illustrations |
| Segmentation | 3-step process, 4/5-part breakdown, before/after comparison, timeline segments, numbered sections |

</details>

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

### 3. เลือกโหมด: Home หรือ Infographic

คลิกแท็บที่ header — **Home** สำหรับสร้างภาพทั่วไป, **Infographic** สำหรับสร้างกราฟิกให้ข้อมูล (จะเห็นเฉพาะโมเดล GPT-5.4 Image 2 และ Nano Banana Pro ในโหมดนี้) รายละเอียดเพิ่มเติมดูที่หัวข้อ [โหมด Home vs Infographic](#️-โหมด-home-vs-infographic)

### 4. แต่ง prompt ด้วย Prompt Builder (ไม่บังคับ)

เปิดกลุ่ม keyword ใน sidebar แล้วคลิกคำที่ต้องการ ระบบจะต่อท้าย prompt ให้อัตโนมัติ คลิกซ้ำเพื่อเอาออก — ชุด keyword จะเปลี่ยนตามโหมดที่เลือกอยู่โดยอัตโนมัติ

### 5. Generate!

1. พิมพ์ prompt อธิบายภาพที่ต้องการ (ไทยหรืออังกฤษก็ได้ ขึ้นกับโมเดล)
2. เลือกโมเดล, aspect ratio, จำนวนภาพ
3. กดปุ่ม **Generate** หรือกด <kbd>Enter</kbd> ในช่อง prompt ได้เลย

### 6. หรือจะตั้งคิวหลาย prompt พร้อมกัน

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
│  │  model,   │   (list เต็มใช้ร่วมกัน, กรองซ้ำตามโหมดที่เลือก)  │
│  │  queue)   │                                              │
│  └─────┬─────┘                                              │
│        │ Generate (คิวหรือ single prompt → N ภาพ           │
│        │           = N requests ขนาน, tag ด้วยโหมดปัจจุบัน)  │
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
│  │  Gallery (Home) │ Gallery (Infographic)        │         │
│  │  + Model Tag + Lightbox — render เฉพาะเมื่อโหมด   │         │
│  │  ของภาพตรงกับโหมดที่แสดงอยู่บนจอ ณ ขณะนั้น          │         │
│  └───────────────────────────────────────────────┘         │
└───────────────────────────────────────────────────────────┘
```

รายละเอียดเชิงเทคนิค:

- **Vanilla JS ล้วน** — ไม่มี framework, ไม่มี build step
- **State แยกตามโหมด** — `apiKey` และ model list เต็มใช้ร่วมกัน ส่วน prompt / aspect ratio / จำนวนภาพ / gallery / คิว เก็บแยกเป็นชุดของตัวเองต่อโหมด (Home / Infographic) ผ่าน object ที่สลับ scope อัตโนมัติตามโหมดที่เลือกอยู่ สลับแท็บแล้วข้อมูลไม่ปนกันและไม่หาย
- **ภาพที่กำลัง generate ถูก tag ด้วยโหมดต้นทาง** — ถ้าสลับโหมดระหว่างรอผลลัพธ์ ภาพจะยังบันทึกถูก gallery เดิม และจะ render หน้าจอใหม่ก็ต่อเมื่อโหมดนั้นยังถูกแสดงอยู่ ป้องกันภาพหลุดไปโผล่ผิดโหมด
- **Routing ตามชนิดโมเดล** — โมเดลที่ output ได้ทั้ง image และ text (Gemini, GPT Image) ใช้ `chat/completions`; โมเดล image-only (Grok Imagine) ใช้ `POST /api/v1/images` โดยตรง เพราะ `chat/completions` จะ error "No endpoints found" ถ้าขอ modality `text` จากโมเดลที่ไม่รองรับ
- **Aspect ratio** ฝั่ง `chat/completions` ส่งผ่าน `image_config.aspect_ratio` และแนบเป็น hint ท้าย prompt ด้วย (เผื่อโมเดลไม่รองรับ `image_config`) ส่วนฝั่ง Image API ส่ง `aspect_ratio` ตรงๆ เป็น native param
- **แต่ละภาพเป็น request อิสระ** — ทั้งใน batch เดียวและข้ามคิว ภาพหนึ่งพังไม่กระทบภาพอื่น และ retry ได้รายภาพ
- **Queue** เป็นแค่ snapshot ของ (prompt, model, ratio, count) ที่เก็บใน memory ต่อโหมด — กด Generate Queue แล้วจะ flatten ทุกคิวเป็น batch เดียวแล้วยิงพร้อมกันทั้งหมด

## 📁 Project Structure

```
atelier/
├── index.html   # ทั้งแอป: HTML + CSS + JS
├── CLAUDE.md    # คู่มือสำหรับ Claude Code
└── README.md    # ไฟล์นี้
```

## 📄 License

ยังไม่ได้ระบุ license
