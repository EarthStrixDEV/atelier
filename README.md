<div align="center">

# 🎨 Atelier

**AI Image & Video Studio — สร้างภาพและวิดีโอด้วย AI ผ่าน OpenRouter ในไฟล์เดียว**

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
| 🎬 **โหมด Video** | สร้างวิดีโอ 8–10 วินาที (720p) จาก 4 โมเดล: Grok Imagine Video · Veo 3.1 Fast · Kling v3.0 Standard · Seedance 2.0 — ปุ่ม duration/ratio ปิดเองอัตโนมัติตามที่โมเดลรองรับ พร้อม toggle เสียง, ราคาประเมินต่อคลิป และ Progress Circle ระหว่างรอ ดูรายละเอียดที่ [โหมด Video](#-โหมด-video) |
| 📐 **Aspect Ratio 5 แบบ** | `1:1` · `4:3` · `3:4` · `16:9` · `9:16` |
| 🖼️ **Batch generation** | สั่ง gen ครั้งละ 1 / 2 / 4 / 6 ภาพ — แต่ละภาพเป็น request แยกกัน ภาพไหน error กด "ลองใหม่" เฉพาะภาพนั้นได้ |
| 📋 **Multi-Prompt Queue** | เพิ่ม prompt + model + ratio + จำนวนภาพ เข้าคิวได้สูงสุด 5 คิว แต่ละคิวตั้งค่าต่างกันได้อิสระ ดูรายการ/ลบทีละคิวได้ แล้วกด **Generate Queue** ยิงรันทุกคิวรวดเดียว |
| 🧩 **Prompt Builder** | คลิก keyword สำเร็จรูปต่อท้าย prompt อัตโนมัติ (คลิกซ้ำเพื่อลบ, sync ตามข้อความใน prompt อัตโนมัติ) — ชุด keyword เปลี่ยนตามโหมดที่เลือกอยู่ ดูรายละเอียดที่หัวข้อ [Prompt Builder แต่ละโหมด](#-prompt-builder-แต่ละโหมด) |
| 🏷️ **Model Tag บนภาพ** | ทุกภาพใน Gallery ติด tag ชื่อโมเดลที่ใช้ gen ไว้ที่มุมภาพ ดูย้อนหลังได้ว่าภาพไหนมาจากโมเดลไหน |
| 📐 **Sidebar พับเก็บ + ลากปรับความกว้างได้** | คลิกปุ่มลูกศรที่ header เพื่อซ่อน/แสดง sidebar หรือลากขอบขวาของ sidebar เพื่อปรับความกว้าง (240–560px, จำค่าไว้ให้ครั้งถัดไป) |
| 🔍 **Lightbox** | คลิกภาพเพื่อดูเต็มจอ เลื่อนซ้าย-ขวาด้วยปุ่มหรือคีย์บอร์ด พร้อมปุ่ม Download |
| ⚡ **Loading state** | shimmer + spinner ระหว่างรอ gen ภาพ ส่วนวิดีโอเป็น Progress Circle พร้อม % ประเมินและเวลาที่รอ แสดงจำนวนงานที่กำลังทำอยู่แบบ real-time |
| 🌙 **Dark theme** | UI มินิมอลโทนดำ รองรับภาษาไทย (Noto Sans Thai) และ responsive บนมือถือ |
| 🔒 **Privacy-first** | API key เก็บใน memory ของหน้าเว็บเท่านั้น — ไม่บันทึกลงเครื่อง ไม่ส่งไปที่อื่นนอกจาก OpenRouter |

## 🖼️ โหมดทั้งสาม: Home / Infographic / Video

แอปมี 3 โหมด สลับได้จากแท็บกลาง header — แต่ละโหมดแยก **prompt, gallery, คิว, aspect ratio, จำนวนงาน** เป็นของตัวเอง สลับไปมาข้อมูลไม่ปนกัน และงานที่ gen ไว้ยังอยู่ครบเมื่อสลับกลับมา ส่วนอื่นๆ (API key, Batch generation, Lightbox, Sidebar, Model tag ฯลฯ) ใช้ระบบเดียวกันทุกโหมด

| | Home | Infographic | Video |
|---|---|---|---|
| **ผลลัพธ์** | ภาพนิ่ง | ภาพนิ่ง | วิดีโอ 8–10 วิ (720p) |
| **โมเดลที่เลือกได้** | ทุกโมเดล image-generation บน OpenRouter | เฉพาะ **GPT-5.4 Image 2** และ **Nano Banana Pro** | เฉพาะ 4 โมเดลวิดีโอ (ดูตารางด้านล่าง) |
| **ใช้ทำอะไร** | สร้างภาพทั่วไป (portrait, art, ฉาก ฯลฯ) | สร้าง infographic / กราฟิกให้ข้อมูล | สร้างคลิปสั้นจาก text prompt |
| **Prompt Builder** | 11 หมวด | 6 หมวด: Style · Layout · Language · Header · Detail · Segmentation | 13 หมวด (Camera + Frametime + 11 หมวดของ Home) |

### 🎬 โหมด Video

สร้างวิดีโอความยาว **8 / 9 / 10 วินาที** ที่ **720p** — ปุ่ม duration กับ aspect ratio จะ**ปิดอัตโนมัติ**ตาม capability จริงของโมเดลที่เลือก (ดึงสดจาก OpenRouter) และ snap ไปค่าที่ใกล้ที่สุดถ้าค่าเดิมใช้ไม่ได้

| โมเดล | Duration | Ratio (จาก 5 แบบ) | เสียง |
|---|---|---|---|
| **Grok Imagine Video** (`x-ai/grok-imagine-video`) | 8 / 9 / 10 ✓ | ครบทั้ง 5 | ❌ |
| **Veo 3.1 Fast** (`google/veo-3.1-fast`) | 8 เท่านั้น | 16:9, 9:16 | ✅ |
| **Kling v3.0 Standard** (`kwaivgi/kling-v3.0-std`) | 8 / 9 / 10 ✓ | 1:1, 16:9, 9:16 | ✅ |
| **Seedance 2.0** (`bytedance/seedance-2.0`) | 8 / 9 / 10 ✓ | ครบทั้ง 5 | ✅ |

จุดที่ต่างจากโหมดภาพ:

- **Toggle เสียง** (default ปิด) — โมเดลที่รองรับจะ gen เสียงมาในคลิปด้วย ราคาประเมินอัปเดตตาม toggle
- **ราคาประเมินต่อคลิป** แสดงใต้ dropdown โมเดล คำนวณจากราคาจริง × duration ที่เลือก (Seedance คิดเป็น token เลยประเมินล่วงหน้าไม่ได้)
- **Progress Circle + %** ระหว่างรอ — วิดีโอใช้เวลาสร้างราวๆ 1–3 นาทีต่อคลิป ตัวเลข % เป็นค่า*ประเมินจากเวลา* (API ไม่ส่ง % จริงมา) ค้างที่ 95% จนกว่างานเสร็จจริง พร้อมสถานะรอคิว/กำลังสร้างและเวลาที่ผ่านไป
- **Gallery เล่นวิดีโอวนแบบปิดเสียง** — คลิกเปิด lightbox เพื่อดูพร้อมเสียงและ scrub ได้ ปุ่ม Download ได้ไฟล์ `.mp4`
- ⚠️ **ปิดหน้าเว็บระหว่างรอ = งานหาย** — ฝั่ง OpenRouter ยังคิดเงิน แต่ผลลัพธ์ไม่มีที่ให้กลับมาแสดง (แอปไม่ persist ข้อมูลใดๆ โดยตั้งใจ เช่นเดียวกับ API key)

### 🧩 Prompt Builder แต่ละโหมด

<details>
<summary><b>Home</b> — 11 หมวด</summary>

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
| Character Detail | blue eyes, long hair, freckles, sharp jawline, muscular build, tattoos |
| Visual Effect | motion blur, lens flare, glowing aura, smoke effect, double exposure |
| Clothing | business suit, casual streetwear, traditional Thai dress, kimono, hoodie and jeans |

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

<details>
<summary><b>Video</b> — 13 หมวด (2 หมวดเฉพาะวิดีโออยู่บนสุด + 11 หมวดของ Home)</summary>

| หมวด | ตัวอย่าง keyword |
|---|---|
| Camera Control | slow dolly in, pan left, tilt up, crane shot, orbit around subject, tracking shot, FPV drone shot |
| Frametime Control | slow motion, timelapse, fast motion, speed ramp, freeze frame ending, seamless loop, reverse motion |
| *(+ 11 หมวดของ Home)* | ใช้ร่วมกันได้ทั้งหมด — สไตล์ แสง มุมกล้อง โทน ท่าทาง ฯลฯ |

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

### 3. เลือกโหมด: Home / Infographic / Video

คลิกแท็บที่ header — **Home** สำหรับสร้างภาพทั่วไป, **Infographic** สำหรับสร้างกราฟิกให้ข้อมูล, **Video** สำหรับสร้างคลิปสั้น 8–10 วินาที (มี control เพิ่ม: duration กับ toggle เสียง) รายละเอียดเพิ่มเติมดูที่หัวข้อ [โหมดทั้งสาม](#️-โหมดทั้งสาม-home--infographic--video)

### 4. แต่ง prompt ด้วย Prompt Builder (ไม่บังคับ)

เปิดกลุ่ม keyword ใน sidebar แล้วคลิกคำที่ต้องการ ระบบจะต่อท้าย prompt ให้อัตโนมัติ คลิกซ้ำเพื่อเอาออก — ชุด keyword จะเปลี่ยนตามโหมดที่เลือกอยู่โดยอัตโนมัติ

### 5. Generate!

1. พิมพ์ prompt อธิบายภาพ/วิดีโอที่ต้องการ (ไทยหรืออังกฤษก็ได้ ขึ้นกับโมเดล)
2. เลือกโมเดล, aspect ratio, จำนวนงาน (โหมด Video เลือก duration กับเสียงเพิ่มได้)
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
┌─────────────────────────────────────────────────────────────────┐
│  index.html  (ทั้งแอปอยู่ในไฟล์เดียว)                                │
│                                                                   │
│  ┌───────────┐   GET /api/v1/models         (โมเดลภาพ)            │
│  │  Sidebar  │ ─────────────────────► OpenRouter                 │
│  │ (prompt,  │   GET /api/v1/videos/models  (โมเดลวิดีโอ)          │
│  │  builder, │ ─────────────────────► OpenRouter                 │
│  │  model,   │   ภาพ: กรอง output_modalities ["image"]            │
│  │  queue)   │   วิดีโอ: กรองเหลือ 4 โมเดลที่กำหนดไว้                 │
│  └─────┬─────┘                                                    │
│        │ Generate (คิวหรือ single prompt → N งาน                  │
│        │           = N requests ขนาน, tag ด้วยโหมดปัจจุบัน)        │
│        ▼                                                          │
│  แยกเส้นทางตามโหมด + ชนิดโมเดล                                     │
│  ┌──────────────────┐ ┌────────────────┐ ┌────────────────────┐  │
│  │ image + text      │ │ image เท่านั้น    │ │ โหมด Video          │  │
│  │ POST              │ │ (Grok Imagine)  │ │ POST /api/v1/videos│  │
│  │ /chat/completions │ │ POST            │ │ → job id → poll    │  │
│  │ modalities:       │ │ /api/v1/images  │ │ ทุก 10 วิ จน        │  │
│  │  ["image","text"] │ │                 │ │ completed → blob   │  │
│  └────────┬──────────┘ └───────┬────────┘ └─────────┬──────────┘  │
│           │ message.images[0]  │ data[0].b64_json   │ unsigned_urls│
│           ▼                    ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────┐          │
│  │  Gallery (Home / Infographic / Video)                │          │
│  │  + Model Tag + Lightbox — render เฉพาะเมื่อโหมด        │          │
│  │  ของงานตรงกับโหมดที่แสดงอยู่บนจอ ณ ขณะนั้น               │          │
│  └─────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

รายละเอียดเชิงเทคนิค:

- **Vanilla JS ล้วน** — ไม่มี framework, ไม่มี build step
- **State แยกตามโหมด** — `apiKey` และ model list เต็มใช้ร่วมกัน ส่วน prompt / aspect ratio / จำนวนงาน / duration / เสียง / gallery / คิว เก็บแยกเป็นชุดของตัวเองต่อโหมด (Home / Infographic / Video) ผ่าน object ที่สลับ scope อัตโนมัติตามโหมดที่เลือกอยู่ สลับแท็บแล้วข้อมูลไม่ปนกันและไม่หาย
- **งานที่กำลัง generate ถูก tag ด้วยโหมดต้นทาง** — ถ้าสลับโหมดระหว่างรอผลลัพธ์ งานจะยังบันทึกถูก gallery เดิม และจะ render หน้าจอใหม่ก็ต่อเมื่อโหมดนั้นยังถูกแสดงอยู่ ป้องกันงานหลุดไปโผล่ผิดโหมด
- **Routing ตามชนิดโมเดล** — โมเดลที่ output ได้ทั้ง image และ text (Gemini, GPT Image) ใช้ `chat/completions`; โมเดล image-only (Grok Imagine) ใช้ `POST /api/v1/images` โดยตรง เพราะ `chat/completions` จะ error "No endpoints found" ถ้าขอ modality `text` จากโมเดลที่ไม่รองรับ
- **วิดีโอเป็น async job** — `POST /api/v1/videos` ได้ job id กลับมา แล้ว poll `GET /api/v1/videos/{id}` ทุก 10 วินาที (timeout 10 นาที) — poll เจอ 4xx หยุดทันที, 5xx/network error รอรอบถัดไป พอ `completed` ก็ fetch ไฟล์จาก `unsigned_urls[0]` มาเก็บเป็น blob ใน memory ทันที กันลิงก์หมดอายุระหว่างหน้ายังเปิดอยู่
- **% ความคืบหน้าวิดีโอเป็นค่าประเมิน** — API ไม่ส่ง progress จริงมา ใช้สูตร exponential จากเวลาที่ผ่านไป (`95 × (1 − e^(−t/60))`) ไต่ช้าลงเรื่อยๆ ค้างสูงสุด 95% จน job เสร็จจริง และตัว ticker อัปเดตเฉพาะวงแหวน/ตัวเลขใน DOM — ไม่ re-render ทั้ง grid เพื่อไม่ให้วิดีโอที่เสร็จแล้วเริ่มเล่นใหม่
- **Capability ของโมเดลวิดีโอดึงสด** — `supported_durations` / `supported_aspect_ratios` / `generate_audio` / `pricing_skus` มาจาก `/api/v1/videos/models` โดยตรง ปุ่มที่โมเดลไม่รองรับถูก disable และค่าที่เลือกไว้ snap ไปค่าใกล้สุดอัตโนมัติ — ถ้าวันหนึ่งโมเดลรองรับเพิ่ม ปุ่มจะปลดล็อคเองโดยไม่ต้องแก้โค้ด
- **Aspect ratio** ฝั่ง `chat/completions` ส่งผ่าน `image_config.aspect_ratio` และแนบเป็น hint ท้าย prompt ด้วย (เผื่อโมเดลไม่รองรับ `image_config`) ส่วนฝั่ง Image API / Video API ส่ง `aspect_ratio` ตรงๆ เป็น native param
- **แต่ละงานเป็น request อิสระ** — ทั้งใน batch เดียวและข้ามคิว งานหนึ่งพังไม่กระทบงานอื่น และ retry ได้รายงาน (วิดีโอ retry = submit job ใหม่)
- **Queue** เป็นแค่ snapshot ของ (prompt, model, ratio, count และ duration/เสียงในโหมด Video) ที่เก็บใน memory ต่อโหมด — กด Generate Queue แล้วจะ flatten ทุกคิวเป็น batch เดียวแล้วยิงพร้อมกันทั้งหมด

## 📁 Project Structure

```
atelier/
├── index.html   # ทั้งแอป: HTML + CSS + JS
├── CLAUDE.md    # คู่มือสำหรับ Claude Code
└── README.md    # ไฟล์นี้
```

## 📄 License

ยังไม่ได้ระบุ license
