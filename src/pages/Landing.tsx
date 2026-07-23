import { Link } from "react-router-dom";
import {
  ArrowRight, Image, Layers, Video, Zap, ShieldCheck, Wand2,
  Sparkles, Palette, Sun, Camera, Smile, Shirt,
} from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: Wand2,
    title: "Prompt Optimizer",
    desc: "ให้ AI ช่วยจูน prompt ของคุณให้ละเอียดและได้ผลลัพธ์ดีขึ้นในคลิกเดียว",
  },
  {
    icon: Zap,
    title: "Batch & Queue",
    desc: "สั่ง generate ครั้งละหลายภาพ หรือตั้งคิว prompt ล่วงหน้าได้สูงสุด 5 คิว",
  },
  {
    icon: ShieldCheck,
    title: "Privacy-first",
    desc: "API key เก็บใน memory ของเบราว์เซอร์เท่านั้น ไม่ถูกส่งไปที่อื่นนอกจาก OpenRouter",
  },
];

const MODEL_GROUPS = [
  {
    label: "Image — General",
    desc: "ทุกโมเดล image-generation บน OpenRouter เลือกได้อิสระ",
    models: ["Grok Imagine Image Quality", "GPT Image 2", "Nano Banana Pro (Gemini 3 Pro Image)", "และโมเดลภาพอื่นๆ บน OpenRouter"],
  },
  {
    label: "Image — Infographic",
    desc: "จำกัดเฉพาะโมเดลที่ทำ infographic ได้ดี ลด noise ตอนเลือก",
    models: ["GPT Image 2", "Nano Banana Pro (Gemini 3 Pro Image)"],
  },
  {
    label: "Video",
    desc: "4 โมเดลวิดีโอชั้นนำ ความยาว 8–10 วินาที ที่ 720p",
    models: ["Grok Imagine Video", "Veo 3.1 Fast", "Kling v3.0 Standard", "Seedance 2.0"],
  },
];

const MODES = [
  {
    icon: Image,
    tag: "01",
    title: "General",
    subtitle: "สร้างภาพทั่วไป",
    desc: "โหมดหลักสำหรับสร้างภาพทุกประเภท — ภาพคน, ผลิตภัณฑ์, ฉาก, งานศิลปะ — เลือกโมเดลได้ทุกตัวที่ OpenRouter รองรับ พร้อม Prompt Builder 11 หมวดครอบคลุมสไตล์ แสง มุมกล้อง ท่าทาง และรายละเอียดตัวละคร ใช้งานได้ตั้งแต่มือใหม่ยันมือโปร",
  },
  {
    icon: Layers,
    tag: "02",
    title: "Infographic",
    subtitle: "กราฟิกให้ข้อมูล",
    desc: "ออกแบบมาสำหรับสร้างภาพ infographic โดยเฉพาะ — จำกัดโมเดลเฉพาะตัวที่วางเลย์เอาต์และข้อความได้แม่นยำ พร้อม Prompt Builder 6 หมวดที่ปรับให้เหมาะกับงานข้อมูล เช่น layout, ภาษา, การแบ่งส่วนเนื้อหา เหมาะกับทำสไลด์ โซเชียลโพสต์ หรือสรุปข้อมูลเป็นภาพ",
  },
  {
    icon: Video,
    tag: "03",
    title: "Video",
    subtitle: "คลิปสั้นจากข้อความ",
    desc: "สร้างวิดีโอความยาว 8–10 วินาทีที่ 720p จาก text prompt เดียว รองรับ 4 โมเดลวิดีโอชั้นนำ พร้อมตัวเลือกเสียง ปุ่ม duration/aspect ratio ที่ปรับอัตโนมัติตามความสามารถของแต่ละโมเดล และแสดง progress การสร้างแบบเรียลไทม์จนกว่างานจะเสร็จ",
  },
];

const PROMPT_BUILDER_GROUPS = [
  { icon: Palette, label: "สไตล์", example: "photorealistic, cinematic, anime style, watercolor" },
  { icon: Sun, label: "แสง", example: "studio lighting, golden hour, neon lights" },
  { icon: Camera, label: "มุมกล้อง", example: "close-up portrait, wide angle, macro shot" },
  { icon: Smile, label: "ท่าทาง", example: "standing pose, walking, action pose" },
  { icon: Shirt, label: "Clothing", example: "business suit, casual streetwear, kimono" },
  { icon: Sparkles, label: "Visual Effect", example: "motion blur, lens flare, glowing aura" },
];

export default function Landing() {
  return (
    <div className="min-h-full bg-bg text-text">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-extrabold text-accent-ink">A</div>
          <span className="text-[15px] font-semibold tracking-[0.2px]">
            Atelier <span className="ml-0.5 text-[11px] font-normal uppercase tracking-[1.5px] text-text-faint">image studio</span>
          </span>
        </div>
        <Link
          to="/studio"
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          เปิดแอป <ArrowRight size={14} />
        </Link>
      </header>

      {/* hero */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-24">
        <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text-dim">
          ขับเคลื่อนโดย OpenRouter · ไม่มี backend
        </span>
        <h1 className="mt-7 text-4xl font-bold leading-[1.15] tracking-tight sm:text-6xl">
          สร้างภาพและวิดีโอด้วย AI
          <br />
          ในสตูดิโอเดียว
        </h1>
        <p className="mt-6 max-w-xl text-balance text-[15px] leading-relaxed text-text-dim sm:text-base">
          เลือกโมเดล AI ได้อิสระจาก OpenRouter สร้างภาพ, infographic และวิดีโอสั้น
          พร้อม prompt builder และเครื่องมือช่วยจูน prompt ในตัว — ไม่ต้องติดตั้ง ไม่ต้องสมัครสมาชิก
        </p>
        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            to="/studio"
            className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
          >
            เริ่มสร้างเลย <ArrowRight size={15} />
          </Link>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
          >
            รับ API Key ฟรี
          </a>
        </div>
      </section>

      {/* models */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-[1.5px] text-text-faint">Models</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Models ที่ใช้ร่วมกับแอปนี้</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-text-dim">
              รายชื่อโมเดลดึงสดจาก OpenRouter ทุกครั้งที่เปิดแอป — ไม่ได้ผูกตายตัวกับผู้ให้บริการรายเดียว
              เลือกโมเดลที่เหมาะกับงานแต่ละชิ้นได้อิสระตามโหมดที่ใช้งาน
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {MODEL_GROUPS.map(g => (
              <div key={g.label} className="rounded-card border border-border bg-surface p-6">
                <span className="text-[11px] font-semibold uppercase tracking-[1.2px] text-text-faint">{g.label}</span>
                <p className="mt-2 text-[13px] leading-relaxed text-text-dim">{g.desc}</p>
                <ul className="mt-5 flex flex-col gap-2.5 border-t border-border pt-5">
                  {g.models.map(m => (
                    <li key={m} className="flex items-center gap-2.5 text-[13px] text-text">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* modes */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-[1.5px] text-text-faint">Modes</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">โหมดของแอป และวิธีใช้งาน</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-text-dim">
              สลับได้จากแท็บบน header — แต่ละโหมดแยก prompt, gallery, คิว และการตั้งค่าเป็นของตัวเอง
              สลับไปมาข้อมูลไม่ปนกัน และงานที่สร้างไว้ยังอยู่ครบเมื่อสลับกลับมา
            </p>
          </div>
          <div className="mt-12 flex flex-col gap-4">
            {MODES.map(m => (
              <div
                key={m.title}
                className="grid grid-cols-1 gap-6 rounded-card border border-border bg-surface p-7 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-8"
              >
                <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-3">
                  <span className="font-mono text-xs text-text-faint">{m.tag}</span>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-text">
                    <m.icon size={19} />
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h3 className="text-lg font-semibold">{m.title}</h3>
                    <span className="text-[13px] text-text-faint">— {m.subtitle}</span>
                  </div>
                  <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-text-dim">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* prompt builder */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-[1.5px] text-text-faint">Prompt Builder</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">แต่ง prompt ได้โดยไม่ต้องพิมพ์เอง</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-text-dim">
              คลิก keyword สำเร็จรูปแล้วต่อท้าย prompt ให้อัตโนมัติ คลิกซ้ำเพื่อเอาออก
              ชุด keyword ปรับตามโหมดที่ใช้งานอยู่ — General มี 11 หมวด, Infographic มี 6 หมวด, Video มี 13 หมวด
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROMPT_BUILDER_GROUPS.map(g => (
              <div key={g.label} className="rounded-card border border-border bg-surface p-6">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-2 text-text">
                  <g.icon size={16} />
                </div>
                <h3 className="mt-4 text-[14px] font-semibold">{g.label}</h3>
                <p className="mt-1.5 font-mono text-[11.5px] leading-relaxed text-text-faint">{g.example}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* highlights */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {HIGHLIGHTS.map(f => (
              <div key={f.title} className="rounded-card border border-border bg-surface p-6 transition-colors hover:border-border-strong">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface-2 text-text">
                  <f.icon size={18} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-text-dim">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta band */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-6 py-20 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">พร้อมเริ่มสร้างผลงานแล้วหรือยัง?</h2>
          <p className="max-w-md text-[14px] leading-relaxed text-text-dim">
            ใส่ OpenRouter API key แล้วเริ่ม generate ได้ทันที ไม่มีค่าใช้จ่ายเพิ่มเติมจาก Atelier
          </p>
          <Link
            to="/studio"
            className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
          >
            เปิด Studio <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-text-faint">
        © {new Date().getFullYear()} Atelier — Built on OpenRouter
      </footer>
    </div>
  );
}
