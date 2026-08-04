import { Link } from "react-router-dom";
import {
  ArrowRight, Image, Layers, Music, Video, Zap, ShieldCheck, Wand2,
  Sparkles, Palette, Sun, Camera, Smile, Shirt, Play,
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
  {
    label: "Audio",
    desc: "สร้างเพลงเต็มหรือคลิปสั้นจาก text prompt ด้วย Lyria 3",
    models: ["Lyria 3 Pro (เพลงเต็ม)", "Lyria 3 Clip (คลิป 30 วินาที)"],
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
  {
    icon: Music,
    tag: "04",
    title: "Audio",
    subtitle: "เพลงจากข้อความ",
    desc: "สร้างเพลงและดนตรีจาก text prompt ด้วย Google Lyria 3 — เลือกได้ทั้งเพลงเต็มที่มีท่อน verse/chorus ครบ หรือคลิปสั้น 30 วินาที พร้อม Prompt Builder 6 หมวดสำหรับแนวเพลง อารมณ์ เครื่องดนตรี เสียงร้อง และจังหวะ ฟังในแอปได้ทันทีและดาวน์โหลดเป็น MP3",
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
          <img src="/atelier/assets/atelier-logo.png" alt="Atelier" className="h-[54px] w-[54px] object-contain" />
          <span className="text-[15px] font-semibold tracking-[0.2px]">
            Atelier <span className="ml-0.5 text-[11px] font-normal uppercase tracking-[1.5px] text-text-faint">AI media studio</span>
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
      <section className="hero-grid relative mx-auto max-w-6xl overflow-hidden px-6 pb-24 pt-12 sm:pt-20">
        <div className="hero-glow" aria-hidden="true" />
        <div className="relative z-10 grid items-center gap-14 lg:grid-cols-[1.02fr_.98fr]">
          <div className="hero-copy">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3.5 py-1.5 text-xs font-medium text-text-dim backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_12px_white]" />
              AI Media Studio · ขับเคลื่อนโดย OpenRouter
            </span>
            <h1 className="mt-8 text-[clamp(3.3rem,7vw,6.6rem)] font-bold leading-[.88] tracking-[-.065em]">
              Imagine.<br /><span className="hero-outline">Compose.</span><br />Create.
            </h1>
            <p className="mt-8 max-w-lg text-balance text-[15px] leading-7 text-text-dim sm:text-base">
              Atelier ยกระดับจาก image studio สู่ AI Media Studio เต็มรูปแบบ — เปลี่ยนทุกไอเดียให้เป็นภาพ อินโฟกราฟิก วิดีโอ และเพลง ด้วยโมเดล AI ชั้นนำในสตูดิโอเดียว คุณกำกับ ที่เหลือให้ Atelier สร้าง
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/studio" className="group flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-ink transition-transform hover:-translate-y-0.5">
                เปิด Creative Studio <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#modes" className="flex items-center gap-2 rounded-full border border-border px-5 py-3.5 text-sm font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text">
                <Play size={13} fill="currentColor" /> ดูความสามารถ
              </a>
            </div>
            <div className="mt-11 flex items-center gap-7 border-t border-border pt-5 text-[11px] uppercase tracking-[.16em] text-text-faint">
              <span>Image</span><span>Infographic</span><span>Video</span><span>Audio</span>
            </div>
          </div>
          <div className="hero-art relative mx-auto aspect-[4/5] w-full max-w-[530px]" aria-label="ตัวอย่างพื้นที่สร้างสรรค์ของ Atelier">
            <div className="absolute inset-[7%_8%_8%_8%] rotate-[3deg] rounded-[2rem] border border-white/15 bg-[#141414] shadow-2xl" />
            <div className="absolute inset-[3%_13%_12%_3%] -rotate-[4deg] overflow-hidden rounded-[2rem] border border-white/15 bg-[#d9d5cc] text-[#0a0a0a] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
              <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(#111_0.7px,transparent_0.7px)] [background-size:7px_7px]" />
              <span className="absolute left-6 top-6 font-mono text-[10px] uppercase tracking-[.2em]">Atelier / 001</span>
              <img src="/atelier/assets/atelier-logo.png" alt="" className="absolute left-1/2 top-1/2 w-[68%] -translate-x-1/2 -translate-y-1/2 invert" />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between border-t border-black/30 pt-3">
                <span className="text-xs font-bold uppercase tracking-[.14em]">Make ideas visible</span><Sparkles size={17} />
              </div>
            </div>
            <div className="hero-float absolute -right-1 top-[16%] rounded-xl border border-white/15 bg-black/75 px-4 py-3 backdrop-blur-md">
              <span className="block text-[10px] uppercase tracking-[.18em] text-text-faint">Model</span><span className="mt-1 block text-xs font-semibold">GPT Image 2</span>
            </div>
            <div className="hero-float hero-float-delay absolute -bottom-1 left-[3%] flex items-center gap-3 rounded-xl border border-white/15 bg-black/75 px-4 py-3 backdrop-blur-md">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-black"><Wand2 size={15} /></div>
              <div><span className="block text-xs font-semibold">Prompt optimized</span><span className="text-[10px] text-text-faint">Ready to generate</span></div>
            </div>
          </div>
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
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      <section id="modes" className="border-t border-border bg-surface/40">
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
              ชุด keyword ปรับตามโหมดที่ใช้งานอยู่ — General มี 11 หมวด, Infographic มี 6 หมวด, Video มี 13 หมวด, Audio มี 6 หมวด
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
