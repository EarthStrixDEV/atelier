# Model Select: Provider Groups + Capability Order — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แบ่งรายการใน select โมเดล (โหมดภาพ + โหมด Video) เป็นกลุ่มตาม Provider ด้วย `<optgroup>` และเรียงโมเดลตามความเก่งจากลำดับที่กำหนดเอง

**Architecture:** ลำดับความเก่งเป็นลิสต์ regex ที่ดูแลด้วยมือใน `constants.ts` (แทน `PREFERRED` เดิม) — `loadModels`/`loadVideoModels` เรียงด้วย helper ตัวเดียว แล้ว `Sidebar` จัดกลุ่มตาม provider ตอน render ลำดับกลุ่ม = ลำดับของโมเดลที่เก่งที่สุดในกลุ่มนั้น โมเดลเริ่มต้นถูกตรึงไว้แยก ไม่ขึ้นกับตัวแรกของลิสต์

**Tech Stack:** React 19, TypeScript strict, Vite, Tailwind v4

**Spec:** ไม่มีเอกสารสเปก — requirement มาจากบทสนทนา 24 ต.ค. 2026 (สรุปใน Global Constraints)

## Global Constraints

- ขอบเขต: select โมเดลใน Sidebar ของโหมดภาพ (home / infographic / cinematic) และโหมด video — **ไม่รวม** รายการ Bake-off, Audio, TTS และหน้า /models (พี่เอิร์ธตัดสิน)
- เกณฑ์ "ความเก่ง" = ลำดับที่กำหนดเองใน `constants.ts` (พี่เอิร์ธตัดสิน) โมเดลที่ไม่อยู่ในลิสต์ไปอยู่ท้ายกลุ่ม provider ของตัวเอง เรียงตามชื่อ
- **โมเดลเริ่มต้นห้ามเปลี่ยน** เพราะการเรียงใหม่ทำให้ตัวแรกของลิสต์เป็นรุ่นแพงกว่า: ภาพ = `google/gemini-3.1-flash-image`, วิดีโอ = `x-ai/grok-imagine-video` (ค่าที่ได้จากลำดับปัจจุบัน) — ถ้าไม่มีในลิสต์ fallback เป็นตัวแรก
- ฟิลเตอร์เดิมไม่เปลี่ยน: allowlist OpenAI / Nano Banana ใน `loadModels`, `VIDEO_MODEL_IDS` (ยังเป็น allowlist; ไม่ต้องเรียงลำดับใหม่ — หน้า /models อ้างลำดับนี้), `MODE_MODEL_FILTER.infographic`
- สัญลักษณ์ ref (●◐✕) นำหน้าชื่อโมเดลคงไว้
- `npm run build` ต้องผ่าน — ไม่มี test suite

## Review Focus

1. **โมเดลที่ provider ไม่รู้จัก** (เช่น user เพิ่ม custom model id `foo/bar` ใน Settings) — ต้องโผล่ในกลุ่มของตัวเองชื่อที่อ่านได้ ไม่หายจาก select (Task 1 Step 3, Task 2 Step 3)
2. **ค่าที่เลือกไว้หลังรีโหลด** — โมเดลที่ผู้ใช้เลือกค้างไว้ (session snapshot) ต้องยังถูกเลือกอยู่ และโมเดลเริ่มต้นของผู้ใช้ใหม่ยังเป็นตัวเดิม (Task 1 Step 3)
3. **โหมด Infographic** มีโมเดลน้อยหลังฟิลเตอร์ — กลุ่มที่ว่างต้องไม่ถูก render เป็น `<optgroup>` เปล่า (Task 2 Step 3)
4. **สถานะโหลด/ล้มเหลว/ไม่มีโมเดล** — option ข้อความเดิม (กำลังโหลด… / โหลดไม่สำเร็จ — คลิกเพื่อลองใหม่ / ไม่พบโมเดล) ยังแสดงเหมือนเดิม และคลิกเพื่อลองใหม่ยังทำงาน (Task 2 Step 3)
5. **ธีมมืด** — ป้าย `<optgroup>` อ่านออกใน `ink` / `midnight` (เบราว์เซอร์ render ด้วย UA style) (Task 2 Step 3)

---

### Task 1: ลำดับความเก่ง + helper จัดกลุ่ม + ตรึงโมเดลเริ่มต้น

**Files:**
- Modify: `src/lib/constants.ts` (~182 `PREFERRED` → ลบ; เพิ่ม `IMAGE_MODEL_RANK`, `VIDEO_MODEL_RANK`, `PROVIDER_LABELS`, `DEFAULT_IMAGE_MODEL_ID`, `DEFAULT_VIDEO_MODEL_ID`)
- Modify: `src/lib/utils.ts` (เพิ่ม `sortByRank`, `providerOf`, `groupByProvider`)
- Modify: `src/lib/actions.ts` (~100 `ensureModelSelection`, ~146–152 sort ใน `loadModels`, ~231 sort ใน `loadVideoModels`, import ~7)

**Interfaces:**
- Produces:
  - `export const IMAGE_MODEL_RANK: RegExp[]`, `export const VIDEO_MODEL_RANK: RegExp[]` — index น้อย = เก่งกว่า; match กับ `m.id` หรือ `m.name`; regex แรกที่ match ชนะ
  - `export const PROVIDER_LABELS: Record<string, string>` — key = prefix ของ id ก่อน `/`
  - `export const DEFAULT_IMAGE_MODEL_ID = "google/gemini-3.1-flash-image"`, `export const DEFAULT_VIDEO_MODEL_ID = "x-ai/grok-imagine-video"`
  - `export function sortByRank(list: ORModel[], rank: RegExp[]): ORModel[]` — คืน array ใหม่; ไม่อยู่ในลิสต์ = ท้าย, tie-break ด้วย `(name || id).localeCompare`
  - `export function providerOf(m: ORModel): string` — `PROVIDER_LABELS[prefix]` → ถ้าไม่มี ใช้ส่วนก่อน `": "` ใน `m.name` → ถ้าไม่มี ใช้ prefix ของ id
  - `export function groupByProvider(list: ORModel[]): { provider: string; models: ORModel[] }[]` — คงลำดับของ `list` (ที่เรียงแล้ว): กลุ่มเรียงตามตำแหน่งที่ provider ปรากฏครั้งแรก, โมเดลในกลุ่มคงลำดับเดิม; ไม่มีกลุ่มว่าง

- [ ] **Step 1: เพิ่มค่าคงที่ใน `constants.ts`**

ลบ `PREFERRED` (ใช้ที่ `actions.ts` ที่เดียว) แล้วเพิ่มค่าด้านบน — **ลำดับร่าง (มินจูร่าง พี่เอิร์ธปรับได้ก่อนลงมือ):**

```ts
export const IMAGE_MODEL_RANK = [
  /gemini-3-pro-image|nano.banana.pro/i,
  /gpt-image-2\.5/i,
  /nano.banana.2\.1/i,
  /gemini-3\.1-flash-image|nano.banana.2\b/i,
  /gpt-image-2\b/i,
  /grok.*imagine.*quality/i,
  /grok.*imagine/i,
  /seedream.*pro/i,
  /seedream/i,
  /mai-image-2\.6/i,
  /mai-image/i,
  /qwen.*image/i,
  /krea/i,
  /muse/i,
  /openrouter\/auto|auto.router/i,
];
export const VIDEO_MODEL_RANK = [
  /veo-3\.1-fast/i, /veo-3\.1-lite/i, /kling/i, /runway|gen-4\.5/i, /seedance/i,
  /grok-imagine-video-1\.5/i, /grok-imagine-video/i, /wan-2\.7/i, /wan-2\.6/i, /flux-3-video/i,
];
```

ผลลัพธ์กลุ่มที่คาด (ภาพ): Google → OpenAI → xAI → ByteDance Seed → Microsoft → Qwen → Krea → Meta → OpenRouter / (วิดีโอ): Google → Kling → Runway → ByteDance → xAI → Alibaba → Black Forest Labs

`PROVIDER_LABELS`: `google: "Google"`, `"x-ai": "xAI"`, `openai: "OpenAI"`, `openrouter: "OpenRouter"`, `"bytedance-seed": "ByteDance Seed"`, `bytedance: "ByteDance"`, `krea: "Krea"`, `meta: "Meta"`, `"meta-llama": "Meta"`, `microsoft: "Microsoft"`, `qwen: "Qwen"`, `"black-forest-labs": "Black Forest Labs"`, `kwaivgi: "Kling"`, `runway: "Runway"`, `alibaba: "Alibaba"`

- [ ] **Step 2: helper ใน `utils.ts` + ใช้ใน `actions.ts`**

- `loadModels`: แทน `rank`/`list.sort(...)` (~146–152) ด้วย `sortByRank(list, IMAGE_MODEL_RANK)` (เรียงก่อน `mutate` เหมือนเดิม)
- `loadVideoModels`: แทน sort ตาม `VIDEO_MODEL_IDS.indexOf` (~231) ด้วย `sortByRank(list, VIDEO_MODEL_RANK)` — การกรองด้วย `VIDEO_MODEL_IDS` คงไว้
- `ensureModelSelection`: ถ้า `ms.modelId` ไม่อยู่ใน `list` → เลือก `DEFAULT_VIDEO_MODEL_ID` (โหมด video) หรือ `DEFAULT_IMAGE_MODEL_ID` (อื่น ๆ) ถ้ามีใน `list`, ไม่งั้น `list[0]?.id ?? null` — ตรวจว่า `modelsForMode` คืนลิสต์ของโหมด video อย่างไรก่อนเลือก constant (audio/tts ไม่ได้อยู่ในขอบเขต: ถ้า `ensureModelSelection` ถูกเรียกในโหมดนั้น ให้คงพฤติกรรม `list[0]` เดิม)

- [ ] **Step 3: Build + ตรวจใน browser**

Run: `npm run build` — Expected: exit 0

ตรวจด้วยมือ (`/studio`):
- เคลียร์ localStorage/sessionStorage ของแอป แล้วเปิดใหม่ → โมเดลที่เลือกในโหมด General = Nano Banana 2 (Gemini 3.1 Flash Image), โหมด Video = Grok Imagine Video
- เลือกโมเดลอื่น รอ snapshot autosave (~30s) แล้วรีโหลด + กดกู้คืน → โมเดลที่เลือกยังเป็นตัวเดิม
- console: `const u = await import('/src/lib/utils.ts'); u.providerOf({id:'foo/bar', name:'Foo Model'})` → `"foo"`; `u.providerOf({id:'foo/bar', name:'Acme: Bar'})` → `"Acme"`

- [ ] **Step 4: Commit**

```bash
git add src/lib/constants.ts src/lib/utils.ts src/lib/actions.ts
git commit -m "feat: rank image/video models by curated capability order"
```

---

### Task 2: `<optgroup>` ตาม provider ใน select โมเดล

**Files:**
- Modify: `src/components/Sidebar.tsx` (~722–732 การ render `<option>`)
- Modify: `CLAUDE.md` (Model lists)

**Interfaces:**
- Consumes: `groupByProvider(list)`, `providerOf(m)` จาก Task 1

- [ ] **Step 1: render เป็นกลุ่ม**

กรณี `sourceLoaded && list.length` แทน `list.map(...)` ด้วย `groupByProvider(list).map(g => <optgroup key={g.provider} label={g.provider}>…</optgroup>)` ภายในคง `<option key={m.id} value={m.id}>` และ `REF_BADGE_PREFIX[...]` เดิม

ชื่อในแต่ละ option: ตัด prefix `"<Provider>: "` ออกเมื่อมันตรงกับชื่อกลุ่ม (เช่น `Google: Nano Banana 2 (Gemini 3.1 Flash Image)` → `Nano Banana 2 (Gemini 3.1 Flash Image)`) เพราะป้ายกลุ่มบอกแล้ว — ไม่ตรงกลุ่มให้คงชื่อเต็ม (ชื่อที่ไม่มี prefix เช่น `Grok Imagine Image Quality` คงเดิม) ทำเป็น local helper ใน Sidebar หรือ export จาก `utils.ts` คู่กับ `providerOf`

กรณีกำลังโหลด / ล้มเหลว / ไม่มีโมเดล คงเดิมทุกอย่าง

- [ ] **Step 2: อัปเดต `CLAUDE.md`**

ใน "Model lists": แทนประโยคเรื่อง `PREFERRED` ด้วย — ลำดับใน select มาจาก `IMAGE_MODEL_RANK` / `VIDEO_MODEL_RANK` (ลิสต์ดูแลด้วยมือ, โมเดลใหม่ต้องเพิ่มเองไม่งั้นไปอยู่ท้ายกลุ่ม), Sidebar จัดกลุ่มด้วย `groupByProvider` (`PROVIDER_LABELS`), และโมเดลเริ่มต้นตรึงที่ `DEFAULT_IMAGE_MODEL_ID` / `DEFAULT_VIDEO_MODEL_ID` ไม่ใช่ตัวแรกของลิสต์

- [ ] **Step 3: Build + ตรวจใน browser**

Run: `npm run build` — Expected: exit 0

ตรวจด้วยมือ (`/studio`):
- โหมด General: select แสดงกลุ่มตามลำดับ Task 1 Step 1, ในกลุ่มเรียงตามลำดับร่าง, ชื่อไม่มี prefix ซ้ำกับกลุ่ม, ●◐✕ ยังอยู่
- โหมด Infographic: ไม่มี `<optgroup>` เปล่า
- โหมด Video: กลุ่ม Google → Kling → Runway → ByteDance → xAI → Alibaba → Black Forest Labs
- Settings → เพิ่ม custom model id `foo/bar-image` (output image) → โผล่ในกลุ่ม "foo" ท้ายรายการ
- ตัด network แล้วรีโหลด → option "โหลดโมเดลไม่สำเร็จ — คลิกเพื่อลองใหม่" ยังแสดงและคลิกแล้วโหลดใหม่
- ธีม `ink` และ `midnight`: ป้ายกลุ่มอ่านออก

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx CLAUDE.md
git commit -m "feat: group model select by provider"
```
