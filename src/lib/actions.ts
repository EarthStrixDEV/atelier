import {
  CHAT_MODEL, DURATIONS, EXTRA_MODELS, MAX_CHAT_HISTORY, MAX_HISTORY, MAX_QUEUE,
  MODE_MODEL_FILTER, OPTIMIZER_MODEL, PREFERRED, RATIOS, VIDEO_MODEL_IDS,
  VIDEO_POLL_MS, VIDEO_RESOLUTION, VIDEO_TIMEOUT_MS, modeLabel,
} from "./constants";
import { cur, mutate, saveChatHistory, saveHistory, state, toast } from "./store";
import type { GenItem, Mode, ORModel, QueueJob } from "./types";
import { convertDataUrl, randomFileName, sleep, togglePromptKeyword, triggerDownload, videoPricePerSec } from "./utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "unknown error";

// ---------- models ----------
export function modelsForMode(mode: Mode): ORModel[] {
  if (mode === "video") return state.videoModels;
  const filter = MODE_MODEL_FILTER[mode];
  if (!filter) return state.models;
  return state.models.filter(m => filter.some(re => re.test(m.id)));
}

export function currentModel(): ORModel | null {
  return modelsForMode(state.mode).find(m => m.id === cur().modelId) || null;
}

/** ถ้า modelId ของโหมดปัจจุบันไม่อยู่ใน list (โหลดใหม่/สลับโหมด) ให้ default เป็นตัวแรก */
function ensureModelSelection() {
  const list = modelsForMode(state.mode);
  const ms = cur();
  if (!list.some(m => m.id === ms.modelId)) ms.modelId = list[0]?.id ?? null;
}

export async function loadModels() {
  mutate(s => { s.modelsFailed = false; });
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const list: ORModel[] = ((data.data || []) as ORModel[]).filter(m =>
      (m.architecture?.output_modalities || []).includes("image") &&
      (!m.id.startsWith("openai/") || m.id === "openai/gpt-image-2")
    );
    for (const em of EXTRA_MODELS) {
      if (!list.some(m => m.id === em.id)) list.push(em);
    }
    const rank = (m: ORModel) => {
      for (let i = 0; i < PREFERRED.length; i++) {
        if (PREFERRED[i].test(m.id) || PREFERRED[i].test(m.name || "")) return i;
      }
      return PREFERRED.length;
    };
    list.sort((a, b) => rank(a) - rank(b) || (a.name || a.id).localeCompare(b.name || b.id));
    mutate(s => { s.models = list; ensureModelSelection(); applyVideoCapabilities(); });
  } catch (e) {
    mutate(s => { s.modelsFailed = true; });
    toast("โหลดรายชื่อโมเดลไม่สำเร็จ: " + errMsg(e));
  }
}

export async function loadVideoModels() {
  mutate(s => { s.videoModelsFailed = false; });
  try {
    const res = await fetch("https://openrouter.ai/api/v1/videos/models");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const list: ORModel[] = ((data.data || []) as ORModel[]).filter(m => VIDEO_MODEL_IDS.includes(m.id));
    list.sort((a, b) => VIDEO_MODEL_IDS.indexOf(a.id) - VIDEO_MODEL_IDS.indexOf(b.id));
    mutate(s => { s.videoModels = list; ensureModelSelection(); applyVideoCapabilities(); });
  } catch (e) {
    mutate(s => { s.videoModelsFailed = true; });
    toast("โหลดรายชื่อโมเดลวิดีโอไม่สำเร็จ: " + errMsg(e));
  }
}

export function selectModel(id: string) {
  mutate(() => { cur().modelId = id; applyVideoCapabilities(); });
}

// เปิด/ปิดค่า duration + ratio + audio ตาม capability ของโมเดลวิดีโอที่เลือกอยู่
// ถ้าค่าที่เลือกไว้ใช้ไม่ได้ snap ไปค่าที่ใกล้ที่สุดที่โมเดลรองรับ — พอร์ตจาก updateSegAvailability
export function applyVideoCapabilities() {
  if (state.mode !== "video") return;
  const m = currentModel();
  const ms = cur();
  const durs = m?.supported_durations?.length ? m.supported_durations : null;
  if (durs) {
    const allowed = DURATIONS.filter(d => durs.includes(d));
    if (allowed.length && !allowed.includes(ms.duration)) {
      // ค่าที่ใกล้ที่สุดจากด้านล่างก่อน (เช่น Veo: เลือก 10 ไว้ → snap เป็น 8) ไม่มีก็เอาค่าต่ำสุดที่รองรับ
      const below = allowed.filter(d => d <= ms.duration);
      ms.duration = below.length ? below[below.length - 1] : allowed[0];
    }
  }
  const ratios = m?.supported_aspect_ratios?.length ? m.supported_aspect_ratios : null;
  if (ratios && !ratios.includes(ms.ratio)) {
    const rAllowed = RATIOS.map(r => r.v).filter(v => ratios.includes(v));
    if (rAllowed.length) ms.ratio = rAllowed.includes("16:9") ? "16:9" : rAllowed[0];
  }
  if (!m?.generate_audio) ms.audio = false;
}

// ---------- prompt / mode ----------
export function setPrompt(v: string) {
  mutate(() => { cur().prompt = v; });
}

export function toggleKeyword(kw: string) {
  mutate(() => { cur().prompt = togglePromptKeyword(cur().prompt, kw); });
}

export function switchMode(mode: Mode) {
  if (mode === state.mode) return;
  mutate(s => {
    s.mode = mode;
    s.optimize = { status: "idle", result: null, error: "" }; // ผล optimize ผูกกับ prompt ของโหมดเดิม
    ensureModelSelection();
    applyVideoCapabilities();
  });
}

// ---------- history ----------
export function addToHistory(mode: Mode, prompt: string) {
  const p = prompt.trim();
  if (!p) return;
  const h = state.modes[mode].history;
  const existing = h.indexOf(p);
  if (existing !== -1) h.splice(existing, 1);
  h.unshift(p);
  if (h.length > MAX_HISTORY) h.length = MAX_HISTORY;
  saveHistory(mode);
}

export function removeFromHistory(mode: Mode, prompt: string) {
  mutate(() => {
    const h = state.modes[mode].history;
    const i = h.indexOf(prompt);
    if (i !== -1) h.splice(i, 1);
    saveHistory(mode);
  });
}

export function usePromptFromHistory(prompt: string) {
  mutate(() => { cur().prompt = prompt; });
}

// ---------- queue ----------
export function addToQueue() {
  const ms = cur();
  const prompt = ms.prompt.trim();
  const m = currentModel();
  if (!prompt || !m || ms.queue.length >= MAX_QUEUE) return;
  mutate(() => {
    ms.queue.push({
      prompt,
      model: m.id,
      modelName: m.name || m.id,
      ratio: ms.ratio,
      count: ms.count,
      duration: ms.duration,
      audio: ms.audio,
    });
  });
  toast("เพิ่มเข้าคิวแล้วค่ะ (" + ms.queue.length + "/" + MAX_QUEUE + ")");
}

export function removeFromQueue(index: number) {
  mutate(() => { cur().queue.splice(index, 1); });
}

// ---------- generation ----------
export function generate() {
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }
  const ms = cur();

  let jobs: QueueJob[];
  if (ms.queue.length) {
    jobs = ms.queue;
    mutate(() => { ms.queue = []; });
  } else {
    const prompt = ms.prompt.trim();
    const model = currentModel();
    if (!prompt || !model) return;
    jobs = [{ prompt, model: model.id, modelName: model.name || model.id, ratio: ms.ratio, count: ms.count, duration: ms.duration, audio: ms.audio }];
  }

  const mode = state.mode;
  const seen = new Set<string>();
  for (const job of jobs) {
    if (!seen.has(job.prompt)) { seen.add(job.prompt); addToHistory(mode, job.prompt); }
  }

  const batch: GenItem[] = [];
  mutate(s => {
    for (const job of jobs) {
      for (let i = 0; i < job.count; i++) {
        const item: GenItem = {
          id: ++s.seq,
          status: "loading",
          url: null,
          prompt: job.prompt,
          model: job.model,
          modelName: job.modelName,
          ratio: job.ratio,
          duration: job.duration,
          audio: job.audio,
          jobStatus: "",
          jobId: null,
          startedAt: null,
          errMsg: "",
          mode,
        };
        s.modes[mode].images.unshift(item);
        batch.push(item);
      }
    }
  });
  batch.forEach(item => runRequest(item));
}

async function runRequest(item: GenItem) {
  try {
    if (item.mode === "video") {
      item.url = await requestVideo(item);
    } else {
      const m = state.models.find(x => x.id === item.model);
      const outs = m?.architecture?.output_modalities || [];
      // โมเดล image-only (เช่น Grok Imagine) เรียกผ่าน chat/completions ไม่ได้
      // ("No endpoints found that support the requested output modalities") ต้องใช้ Image API แทน
      if (outs.length && !outs.includes("text")) {
        item.url = await requestViaImageAPI(item);
      } else {
        item.url = await requestViaChat(item);
      }
    }
    item.status = "done";
  } catch (e) {
    item.status = "error";
    item.errMsg = errMsg(e);
  }
  // item ถูก mutate ตรงๆ ใน array ของโหมดต้นทาง — broadcast ทีเดียวพอ ทุกโหมดได้ state ถูกต้อง
  mutate();
}

// Video API เป็น async job: submit ได้ job id แล้ว poll จน completed ค่อยได้ URL
// โหลดไฟล์เป็น blob ทันทีกัน unsigned URL หมดอายุระหว่างหน้ายังเปิดอยู่
async function requestVideo(item: GenItem): Promise<string> {
  item.startedAt = Date.now();
  item.jobStatus = "pending";
  mutate();

  // ถ้า item มี jobId ค้างอยู่ (เช่น สร้างเสร็จแล้วแต่โหลดไฟล์พลาด หรือ timeout)
  // ให้ poll งานเดิมต่อแทนการ submit ใหม่ — กันจ่ายเงินซ้ำสำหรับงานที่จ่ายไปแล้ว
  let resumed = !!item.jobId;
  if (!item.jobId) {
    const m = state.videoModels.find(x => x.id === item.model);
    const body: Record<string, unknown> = {
      model: item.model,
      prompt: item.prompt,
      duration: item.duration,
      resolution: VIDEO_RESOLUTION,
      aspect_ratio: item.ratio,
    };
    if (m?.generate_audio) body.generate_audio = !!item.audio;
    const res = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || ("HTTP " + res.status));
    if (!data.id) throw new Error("ไม่ได้รับ job id จาก OpenRouter");
    item.jobId = data.id;
  }

  const deadline = Date.now() + VIDEO_TIMEOUT_MS;
  while (true) {
    // งานที่ resume มา งานอาจเสร็จอยู่แล้ว — เช็คเร็วๆ รอบแรกไม่ต้องรอเต็ม 10 วิ
    await sleep(resumed ? 1500 : VIDEO_POLL_MS);
    resumed = false;
    if (Date.now() > deadline) throw new Error('หมดเวลารอผลลัพธ์ (10 นาที) — กด "ลองใหม่" เพื่อเช็คงานเดิมต่อได้ค่ะ (ไม่เสียเงินเพิ่ม)');
    const pr = await fetch("https://openrouter.ai/api/v1/videos/" + item.jobId, {
      headers: { "Authorization": "Bearer " + state.apiKey },
    });
    const pd = await pr.json().catch(() => ({}));
    if (!pr.ok) {
      // 4xx = poll งานนี้ต่อไม่ได้แล้ว (job หาย/key หมดสิทธิ์) — เคลียร์ jobId ให้ retry เริ่มงานใหม่ได้
      if (pr.status >= 400 && pr.status < 500) {
        item.jobId = null;
        throw new Error(pd.error?.message || ("HTTP " + pr.status));
      }
      continue; // 5xx/network: รอ poll รอบถัดไป
    }
    if (pd.status) { item.jobStatus = pd.status; mutate(); }
    if (pd.status === "completed") {
      const vurl = pd.unsigned_urls?.[0];
      if (!vurl) { item.jobId = null; throw new Error("ไม่พบไฟล์วิดีโอใน response"); }
      // ไฟล์อยู่หลัง endpoint ของ OpenRouter — ต้องแนบ key ด้วย ไม่งั้น 401
      const vres = await fetch(vurl, { headers: { "Authorization": "Bearer " + state.apiKey } });
      // โหลดพลาด: คง jobId ไว้ ให้ "ลองใหม่" มาโหลดซ้ำได้โดยไม่ต้อง gen ใหม่
      if (!vres.ok) throw new Error('โหลดไฟล์วิดีโอไม่สำเร็จ (HTTP ' + vres.status + ') — กด "ลองใหม่" เพื่อโหลดซ้ำได้ค่ะ (ไม่เสียเงินเพิ่ม)');
      item.jobId = null;
      return URL.createObjectURL(await vres.blob());
    }
    if (pd.status === "failed") {
      item.jobId = null; // งาน fail ถาวร — retry ครั้งหน้าต้อง submit ใหม่
      throw new Error(pd.error?.message || (typeof pd.error === "string" ? pd.error : "การสร้างวิดีโอล้มเหลว"));
    }
  }
}

async function requestViaImageAPI(item: GenItem): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: item.model, prompt: item.prompt, n: 1, aspect_ratio: item.ratio }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || ("HTTP " + res.status));
  const d = data.data?.[0];
  const url = d?.b64_json
    ? "data:" + (d.media_type || "image/png") + ";base64," + d.b64_json
    : d?.url;
  if (!url) throw new Error("ไม่พบรูปใน response");
  return url;
}

async function requestViaChat(item: GenItem): Promise<string> {
  const body: Record<string, unknown> = {
    model: item.model,
    messages: [{ role: "user", content: item.prompt }],
    modalities: ["image", "text"],
  };
  // aspect ratio ผ่าน image_config (โมเดลที่ไม่รองรับจะ ignore หรือใช้ hint ใน prompt แทน)
  if (item.ratio !== "1:1") {
    body.image_config = { aspect_ratio: item.ratio };
    body.messages = [{ role: "user", content: item.prompt + "\n\nAspect ratio: " + item.ratio }];
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || ("HTTP " + res.status));
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) {
    const txt = data.choices?.[0]?.message?.content;
    throw new Error(txt ? "โมเดลตอบเป็นข้อความแทนรูป: " + String(txt).slice(0, 120) : "ไม่พบรูปใน response");
  }
  return url;
}

export function retry(item: GenItem) {
  item.status = "loading";
  item.errMsg = "";
  mutate();
  runRequest(item);
}

// คัดลอก prompt ของ card กลับไปที่ช่อง prompt ของโหมดเดียวกับ item (สลับโหมดให้ถ้าจำเป็น)
export function copyPromptFromItem(item: GenItem) {
  mutate(s => {
    if (item.mode !== s.mode) { s.mode = item.mode; s.optimize = { status: "idle", result: null, error: "" }; ensureModelSelection(); applyVideoCapabilities(); }
    s.modes[item.mode].prompt = item.prompt;
  });
  toast("คัดลอก prompt แล้วค่ะ");
}

// gen ซ้ำด้วย prompt/model/ratio/duration/audio เดิมของ card ทันที ไม่ต้องกดปุ่ม Generate เอง
export function regenerateFromItem(item: GenItem) {
  if (item.mode !== state.mode) switchMode(item.mode);
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }
  const model = modelsForMode(item.mode).find(m => m.id === item.model);
  if (!model) { toast("ไม่พบโมเดลเดิมของภาพนี้แล้วค่ะ (อาจถูกถอดออกจาก OpenRouter)"); return; }
  let newItem!: GenItem;
  mutate(s => {
    newItem = {
      id: ++s.seq,
      status: "loading",
      url: null,
      prompt: item.prompt,
      model: item.model,
      modelName: item.modelName,
      ratio: item.ratio,
      duration: item.duration,
      audio: item.audio,
      jobStatus: "",
      jobId: null,
      startedAt: null,
      errMsg: "",
      mode: item.mode,
    };
    s.modes[item.mode].images.unshift(newItem);
  });
  runRequest(newItem);
  toast("กำลังสร้างซ้ำค่ะ~");
}

// ---------- multi-select download ----------
export function toggleSelect(id: number) {
  mutate(() => {
    const sel = cur().selected;
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
  });
}

export function clearSelection() {
  mutate(() => { cur().selected.clear(); });
}

export async function downloadSelected() {
  const ms = cur();
  const ids = [...ms.selected];
  if (!ids.length) return;
  const items = ids.map(id => ms.images.find(x => x.id === id)).filter((x): x is GenItem => !!x);
  const format = state.lbFormat;
  for (const item of items) {
    if (!item.url) continue;
    let url = item.url;
    let ext: string = format;
    if (item.mode === "video") {
      ext = "mp4";
    } else {
      try { url = await convertDataUrl(item.url, format); }
      catch { url = item.url; }
    }
    triggerDownload(url, randomFileName(ext));
    await sleep(150); // เว้นจังหวะกัน browser บล็อกดาวน์โหลดหลายไฟล์รวด
  }
  toast("ดาวน์โหลด " + items.length + " รูปแล้วค่ะ");
}

// ---------- lightbox ----------
export function openLightbox(index: number) {
  mutate(() => { cur().lbIndex = index; });
}
export function closeLightbox() {
  mutate(() => { cur().lbIndex = -1; });
}
export function doneIndices(): number[] {
  return cur().images.map((x, i) => (x.status === "done" ? i : -1)).filter(i => i >= 0);
}
export function lbStep(dir: 1 | -1) {
  const ds = doneIndices();
  const pos = ds.indexOf(cur().lbIndex);
  const next = ds[pos + dir];
  if (next !== undefined) mutate(() => { cur().lbIndex = next; });
}

export async function downloadCurrent() {
  const ms = cur();
  const item = ms.images[ms.lbIndex];
  if (!item?.url) return;
  if (item.mode === "video") {
    triggerDownload(item.url, randomFileName("mp4")); // blob URL — ดาวน์โหลดตรงได้เลย ไม่ต้องแปลง format
    return;
  }
  let url: string;
  try {
    url = await convertDataUrl(item.url, state.lbFormat);
  } catch {
    toast("แปลงไฟล์ไม่สำเร็จ ดาวน์โหลดเป็นไฟล์ต้นฉบับแทนค่ะ");
    url = item.url;
  }
  triggerDownload(url, randomFileName(state.lbFormat));
}

// ---------- usage ----------
export function computeItemCost(item: GenItem): number | null {
  if (item.mode === "video") {
    const m = state.videoModels.find(x => x.id === item.model);
    if (!m) return null;
    const pps = videoPricePerSec(m, item.audio);
    return pps != null ? pps * item.duration : null;
  }
  const m = state.models.find(x => x.id === item.model);
  const price = m?.pricing?.image ? parseFloat(m.pricing.image) : NaN;
  return price > 0 ? price : null;
}

// ---------- export / import session ----------
// เก็บเฉพาะ metadata ต่อโหมด (prompt, settings, queue, history) — ไม่รวมรูป/วิดีโอ เพราะเป็น data URL ใหญ่มาก
export function exportSession() {
  const data: Record<string, unknown> = {
    atelier_session: 1,
    exportedAt: new Date().toISOString(),
    modes: {} as Record<string, unknown>,
  };
  const modes: Record<string, unknown> = {};
  for (const mode of Object.keys(state.modes) as Mode[]) {
    const s = state.modes[mode];
    modes[mode] = {
      prompt: s.prompt,
      ratio: s.ratio,
      count: s.count,
      duration: s.duration,
      audio: s.audio,
      queue: s.queue,
      history: s.history,
    };
  }
  data.modes = modes;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  triggerDownload(href, "atelier-session.json");
  URL.revokeObjectURL(href);
  toast("Export session แล้วค่ะ");
}

export function importSession(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    let data: unknown;
    try {
      data = JSON.parse(String(reader.result));
    } catch {
      toast("ไฟล์ไม่ใช่ JSON ที่ถูกต้องค่ะ");
      return;
    }
    const d = data as { modes?: Record<string, Record<string, unknown>> };
    if (!d || typeof d !== "object" || !d.modes) {
      toast("ไฟล์นี้ไม่ใช่ session ของ Atelier ค่ะ");
      return;
    }
    mutate(() => {
      for (const mode of Object.keys(state.modes) as Mode[]) {
        const m = d.modes![mode];
        if (!m || typeof m !== "object") continue;
        const s = state.modes[mode];
        if (typeof m.prompt === "string") s.prompt = m.prompt;
        if (typeof m.ratio === "string") s.ratio = m.ratio;
        if (typeof m.count === "number") s.count = m.count;
        if (typeof m.duration === "number") s.duration = m.duration;
        if (typeof m.audio === "boolean") s.audio = m.audio;
        if (Array.isArray(m.queue)) s.queue = (m.queue as QueueJob[]).slice(0, MAX_QUEUE);
        if (Array.isArray(m.history)) {
          s.history = (m.history as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_HISTORY);
          saveHistory(mode);
        }
      }
      applyVideoCapabilities();
    });
    toast("Import session แล้วค่ะ");
  };
  reader.readAsText(file);
}

// ---------- prompt optimizer ----------
export async function runOptimize() {
  const original = cur().prompt.trim();
  if (!original || state.optimize.status === "loading") return;
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }

  mutate(s => { s.optimize = { status: "loading", result: null, error: "" }; });

  const modeName = state.mode === "video" ? "video generation" : state.mode === "infographic" ? "infographic generation" : "image generation";
  const sys = "You are a prompt engineer helping a user write better prompts for AI " + modeName + ". "
    + "Given the user's rough prompt, rewrite it into a more detailed, vivid, well-structured prompt in English "
    + "(keep any names/subjects the user specified). Also suggest 6-10 short keyword phrases (style, lighting, "
    + "composition, mood, etc.) the user could add. Respond with ONLY valid JSON, no markdown fences, in this exact shape: "
    + '{"prompt": "...", "keywords": ["...", "..."]}';

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPTIMIZER_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: original },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || ("HTTP " + res.status));
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("โมเดลไม่ตอบข้อความกลับมาค่ะ");
    const jsonText = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    let parsed: { prompt?: unknown; keywords?: unknown };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("แปลผลลัพธ์จากโมเดลไม่สำเร็จค่ะ ลองกด Optimize ใหม่อีกครั้งนะคะ");
    }
    const optPrompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === "string" && !!k.trim()).map(k => k.trim())
      : [];
    if (!optPrompt) throw new Error("ไม่พบ prompt ที่จูนแล้วในผลลัพธ์ค่ะ");
    mutate(s => { s.optimize = { status: "done", result: { prompt: optPrompt, keywords }, error: "" }; });
  } catch (e) {
    mutate(s => { s.optimize = { status: "error", result: null, error: errMsg(e) }; });
  }
}

export function applyOptimizedPrompt() {
  const r = state.optimize.result;
  if (!r) return;
  mutate(s => {
    cur().prompt = r.prompt;
    s.optimize = { status: "idle", result: null, error: "" };
  });
  toast("แทนที่ prompt แล้วค่ะ");
}

export function clearOptimize() {
  mutate(s => { s.optimize = { status: "idle", result: null, error: "" }; });
}

// ---------- chat with atelier ----------
function chatSystemPrompt(): string {
  return "You are the in-app assistant for Atelier, an AI image/video generator built on OpenRouter. "
    + "You help the user brainstorm ideas, design prompts (style, lighting, composition, mood, camera work), "
    + "and give practical advice about generating images and videos with AI models. "
    + "The user is currently in the \"" + modeLabel(state.mode) + "\" tab of the app "
    + "(General = images, Infographic = infographic images, Video = short video clips). "
    + "Keep answers concise and practical. When useful, suggest a ready-to-use prompt. Respond in the same "
    + "language the user writes in (Thai or English).";
}

export async function sendChatMessage(text: string) {
  const t = text.trim();
  if (!t || state.chatPending) return;
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }

  mutate(s => {
    s.chatMessages.push({ role: "user", content: t });
    if (s.chatMessages.length > MAX_CHAT_HISTORY) s.chatMessages.splice(0, s.chatMessages.length - MAX_CHAT_HISTORY);
    s.chatPending = true;
  });
  saveChatHistory();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: chatSystemPrompt() },
          ...state.chatMessages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || ("HTTP " + res.status));
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) throw new Error("โมเดลไม่ตอบข้อความกลับมาค่ะ");
    mutate(s => { s.chatMessages.push({ role: "assistant", content: String(reply).trim() }); });
    saveChatHistory();
  } catch (e) {
    mutate(s => { s.chatMessages.push({ role: "assistant", content: "⚠️ " + errMsg(e) }); });
  } finally {
    mutate(s => { s.chatPending = false; });
  }
}

export function clearChatHistory() {
  mutate(s => { s.chatMessages = []; });
  saveChatHistory();
}
