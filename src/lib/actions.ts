import {
  AUDIO_EXTRA_MODELS, AUDIO_MODEL_IDS, AUDIO_MODEL_PRICES,
  CHAT_MODEL, DURATIONS, EXTRA_MODELS, GRILL_MODEL, MAX_CHAT_HISTORY, MAX_GRILL_QUESTIONS, MAX_HISTORY, MAX_QUEUE,
  MAX_REFS_PER_KIND, MAX_REF_BYTES, MIN_GRILL_QUESTIONS, MODE_MODEL_FILTER, modelRequiresRefImage, OPTIMIZER_MODEL, PREFERRED,
  RATIOS, REF_KINDS, VIDEO_MODEL_IDS,
  VIDEO_POLL_MS, VIDEO_RESOLUTION, VIDEO_TIMEOUT_MS, isVideoMode, modeLabel,
} from "./constants";
import {
  autoSaveBlob, forgetAutoSaveDir, fsAccessSupported, isAutoSaveDirConnected, peekSavedDirName,
  pickAutoSaveDir, reconnectAutoSaveDir, urlToBlob,
} from "./fsAccess";
import { cur, mutate, PROMPT_PLACEMENT_KEY, saveChatHistory, saveHistory, state, toast } from "./store";
import type { ChatMsg, GenItem, GrillPrompt, Mode, ORModel, PromptPlacement, QueueJob, RefImage, RefKind } from "./types";
import { convertDataUrl, randomFileName, sleep, togglePromptKeyword, triggerDownload, videoPricePerSec } from "./utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "unknown error";

// ---------- models ----------
export function modelsForMode(mode: Mode): ORModel[] {
  if (isVideoMode(mode)) return state.videoModels;
  if (mode === "audio") return state.audioModels;
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
    const fetched = (data.data || []) as ORModel[];
    const list: ORModel[] = fetched.filter(m =>
      (m.architecture?.output_modalities || []).includes("image") &&
      (!m.id.startsWith("openai/") || m.id === "openai/gpt-image-2")
    );
    for (const em of EXTRA_MODELS) {
      if (!list.some(m => m.id === em.id)) list.push(em);
    }
    // โมเดลเสียง (Lyria) มาจาก fetch เดียวกัน — คัดตาม allowlist + เติม fallback ถ้ายังไม่ list
    const audioList: ORModel[] = fetched.filter(m => AUDIO_MODEL_IDS.includes(m.id));
    for (const em of AUDIO_EXTRA_MODELS) {
      if (!audioList.some(m => m.id === em.id)) audioList.push(em);
    }
    audioList.sort((a, b) => AUDIO_MODEL_IDS.indexOf(a.id) - AUDIO_MODEL_IDS.indexOf(b.id));
    const rank = (m: ORModel) => {
      for (let i = 0; i < PREFERRED.length; i++) {
        if (PREFERRED[i].test(m.id) || PREFERRED[i].test(m.name || "")) return i;
      }
      return PREFERRED.length;
    };
    list.sort((a, b) => rank(a) - rank(b) || (a.name || a.id).localeCompare(b.name || b.id));
    mutate(s => { s.models = list; s.audioModels = audioList; ensureModelSelection(); applyVideoCapabilities(); });
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
  if (!isVideoMode(state.mode)) return;
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

export function setPromptPlacement(placement: PromptPlacement) {
  mutate(s => {
    s.promptPlacement = placement;
    if (placement === "sidebar") s.sidebarCollapsed = false;
  });
  try {
    localStorage.setItem(PROMPT_PLACEMENT_KEY, placement);
  } catch { /* preference persistence is best-effort */ }
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

// ---------- reference images ----------
/** แนบ ref ผ่าน /chat/completions สำหรับภาพ และ frame_images สำหรับ Image-to-Video */
export function refsSupported(): boolean {
  if (state.mode === "audio") return false; // ยังไม่รองรับ image-to-music — ตัด ref ออกทั้งโหมด
  if (isVideoMode(state.mode)) return true;
  const m = currentModel();
  const outs = m?.architecture?.output_modalities || [];
  return !(outs.length && !outs.includes("text"));
}

export function refsOfKind(kind: RefKind): RefImage[] {
  return cur().refs.filter(r => r.kind === kind);
}

/** โมเดลวิดีโอบางตัว (เช่น Grok Imagine Video 1.5) เป็น Image-to-Video ล้วน — ต้องแนบภาพก่อนถึง generate ได้ */
export function refImageMissing(): boolean {
  if (!isVideoMode(state.mode)) return false;
  return modelRequiresRefImage(currentModel()?.id) && !cur().refs[0];
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    fr.readAsDataURL(file);
  });

export async function addRefImages(kind: RefKind, files: FileList | File[]) {
  const mode = state.mode; // ผู้ใช้อาจสลับโหมดระหว่างรออ่านไฟล์ — ผูก ref กับโหมดที่กดแนบ
  const selectedFiles = isVideoMode(mode) ? Array.from(files).slice(0, 1) : Array.from(files);
  for (const file of selectedFiles) {
    if (!file.type.startsWith("image/")) { toast(`"${file.name}" ไม่ใช่ไฟล์รูปค่ะ`); continue; }
    if (file.size > MAX_REF_BYTES) {
      toast(`"${file.name}" ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ`);
      continue;
    }
    if (state.modes[mode].refs.filter(r => r.kind === kind).length >= MAX_REFS_PER_KIND) {
      toast(`แนบได้สูงสุด ${MAX_REFS_PER_KIND} รูปต่อประเภทค่ะ`);
      break;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      mutate(() => {
        if (isVideoMode(mode)) state.modes[mode].refs = [{ kind: "ref", dataUrl, name: file.name }];
        else state.modes[mode].refs.push({ kind, dataUrl, name: file.name });
      });
    } catch (e) {
      toast(errMsg(e));
    }
  }
}

export function removeRefImage(ref: RefImage) {
  mutate(() => {
    const refs = cur().refs;
    const i = refs.indexOf(ref);
    if (i !== -1) refs.splice(i, 1);
  });
}

export function clearRefImages() {
  mutate(() => { cur().refs = []; });
}

// ---------- queue ----------
export function addToQueue() {
  const ms = cur();
  const prompt = ms.prompt.trim();
  const m = currentModel();
  if (!prompt || !m || ms.queue.length >= MAX_QUEUE) return;
  if (refImageMissing()) { toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video)"); return; }
  mutate(() => {
    ms.queue.push({
      prompt,
      model: m.id,
      modelName: m.name || m.id,
      ratio: ms.ratio,
      count: ms.count,
      duration: ms.duration,
      audio: ms.audio,
      refs: refsSupported() ? ms.refs.slice() : [],
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
    if (refImageMissing()) { toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video)"); return; }
    jobs = [{
      prompt, model: model.id, modelName: model.name || model.id, ratio: ms.ratio,
      count: ms.count, duration: ms.duration, audio: ms.audio,
      refs: refsSupported() ? ms.refs.slice() : [],
    }];
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
          refs: job.refs ?? [], // session ที่ import มาจากไฟล์เก่าไม่มีฟิลด์นี้
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
    if (isVideoMode(item.mode)) {
      item.url = await requestVideo(item);
    } else if (item.mode === "audio") {
      item.url = await requestAudio(item);
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
  if (item.status === "done") autoSaveItem(item); // fire-and-forget — ไม่บล็อก UI, error แค่ toast เตือน
}

// ---------- auto save ----------
async function autoSaveItem(item: GenItem) {
  if (!state.autoSaveEnabled || !item.url || !isAutoSaveDirConnected()) return;
  try {
    const ext = isVideoMode(item.mode) ? "mp4" : item.mode === "audio" ? "mp3" : state.lbFormat;
    const blob = await urlToBlob(
      isVideoMode(item.mode) || item.mode === "audio" ? item.url : await convertDataUrl(item.url, state.lbFormat)
    );
    await autoSaveBlob(blob, randomFileName(ext));
  } catch (e) {
    // permission หมดอายุ/ถูกถอน — ปิด auto-save อัตโนมัติกันแจ้งเตือนซ้ำทุกภาพ
    mutate(s => { s.autoSaveEnabled = false; s.autoSaveDirName = null; });
    toast("Auto Save หยุดทำงาน: " + errMsg(e));
  }
}

export function isAutoSaveSupported(): boolean {
  return fsAccessSupported();
}

/** เปิด directory picker ใหม่ — ต้องเรียกจาก user gesture (onClick) เท่านั้น */
export async function connectAutoSaveDir() {
  mutate(s => { s.autoSaveConnecting = true; });
  try {
    const name = await pickAutoSaveDir();
    mutate(s => { s.autoSaveDirName = name; s.autoSaveEnabled = true; s.autoSaveSavedDirName = null; });
    toast(`เชื่อมต่อ Auto Save กับ "${name}" แล้วค่ะ`);
  } catch (e) {
    // user กด cancel ที่ picker ก็โยน AbortError มาเหมือนกัน — เงียบไว้ไม่ต้อง toast
    if (e instanceof Error && e.name !== "AbortError") toast(errMsg(e));
  } finally {
    mutate(s => { s.autoSaveConnecting = false; });
  }
}

/** ตรวจว่ามี directory เก่าจาก session ก่อนไหม — เรียกตอนแอปโหลด (ยังไม่ขอ permission) */
export async function checkSavedAutoSaveDir() {
  if (!fsAccessSupported()) return;
  const name = await peekSavedDirName();
  if (name) mutate(s => { s.autoSaveSavedDirName = name; });
}

/** ขอ permission ซ้ำกับ directory เดิม — ต้องเรียกจาก user gesture (onClick) เท่านั้น */
export async function reconnectSavedAutoSaveDir() {
  mutate(s => { s.autoSaveConnecting = true; });
  try {
    const name = await reconnectAutoSaveDir();
    mutate(s => { s.autoSaveDirName = name; s.autoSaveEnabled = true; s.autoSaveSavedDirName = null; });
    toast(`เชื่อมต่อ Auto Save กับ "${name}" อีกครั้งแล้วค่ะ`);
  } catch (e) {
    // permission ถูกปฏิเสธ/handle เสีย — เคลียร์ IndexedDB กันปุ่มค้างโชว์ให้กดซ้ำไม่จบ
    await forgetAutoSaveDir();
    mutate(s => { s.autoSaveSavedDirName = null; });
    toast(errMsg(e));
  } finally {
    mutate(s => { s.autoSaveConnecting = false; });
  }
}

export function toggleAutoSaveEnabled() {
  mutate(s => { s.autoSaveEnabled = !s.autoSaveEnabled; });
}

/** ยกเลิกการเชื่อมต่อ directory ทั้งหมด — ลบ handle ที่จำไว้ใน IndexedDB ด้วย */
export async function disconnectAutoSaveDir() {
  await forgetAutoSaveDir();
  mutate(s => { s.autoSaveEnabled = false; s.autoSaveDirName = null; });
  toast("ยกเลิกการเชื่อมต่อ Auto Save แล้วค่ะ");
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
    if (item.refs[0]) {
      body.frame_images = [{
        type: "image_url",
        image_url: { url: item.refs[0].dataUrl },
        frame_type: "first_frame",
      }];
    }
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

// Lyria สร้างเพลงผ่าน chat/completions แต่บังคับ stream:true — เสียงทยอยมาเป็น
// base64 chunk ใน delta.audio.data ต้อง decode ทีละ chunk (ต่อ base64 string ตรงๆ ไม่ได้
// เพราะ padding) แล้วค่อยรวม bytes เป็น blob MP3 ตอนจบ
async function requestAudio(item: GenItem): Promise<string> {
  item.startedAt = Date.now();
  mutate();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: item.model,
      messages: [{ role: "user", content: item.prompt }],
      modalities: ["text", "audio"],
      audio: { format: "mp3" },
      stream: true,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || ("HTTP " + res.status));
  }
  if (!res.body) throw new Error("เบราว์เซอร์ไม่รองรับ streaming response");

  const chunks: Uint8Array[] = [];
  const pushB64 = (b64: string) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    chunks.push(bytes);
  };

  type AudioChunk = {
    error?: { message?: string };
    choices?: { delta?: { audio?: { data?: string } }; message?: { audio?: { data?: string } } }[];
  };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? ""; // บรรทัดสุดท้ายอาจยังมาไม่ครบ — เก็บไว้รอ chunk ถัดไป
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      let j: AudioChunk;
      try { j = JSON.parse(payload); } catch { continue; }
      if (j.error) throw new Error(j.error.message || "การสร้างเพลงล้มเหลว");
      const c = j.choices?.[0];
      const b64 = c?.delta?.audio?.data ?? c?.message?.audio?.data;
      if (b64) pushB64(b64);
    }
  }
  if (!chunks.length) throw new Error("ไม่พบเสียงใน response");
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "audio/mpeg" }));
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

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * ประกอบ content ของ user message
 * ไม่มี ref → ส่ง string ล้วนเหมือนเดิม (บางโมเดลจุกจิกกับ content array เมื่อไม่มีรูป)
 * มี ref → text นำ + [คำกำกับประเภท, รูป] เรียงต่อกัน เพราะ API ไม่มี param บอกว่ารูปไหนเป็น style/face
 */
function buildChatContent(item: GenItem, promptText: string): string | ChatPart[] {
  const refs = item.refs ?? [];
  if (!refs.length) return promptText;

  const parts: ChatPart[] = [{ type: "text", text: promptText }];
  let n = 0;
  for (const { kind, label, instruction } of REF_KINDS) {
    for (const ref of refs.filter(r => r.kind === kind)) {
      n++;
      parts.push({ type: "text", text: `Image ${n} — ${label}: ${instruction}` });
      parts.push({ type: "image_url", image_url: { url: ref.dataUrl } });
    }
  }
  parts.push({
    type: "text",
    text: "Use the attached images only as references as instructed above; generate a new image, do not return an attached image unchanged.",
  });
  return parts;
}

async function requestViaChat(item: GenItem): Promise<string> {
  // aspect ratio ผ่าน image_config (โมเดลที่ไม่รองรับจะ ignore หรือใช้ hint ใน prompt แทน)
  const promptText = item.ratio !== "1:1" ? item.prompt + "\n\nAspect ratio: " + item.ratio : item.prompt;
  const body: Record<string, unknown> = {
    model: item.model,
    messages: [{ role: "user", content: buildChatContent(item, promptText) }],
    modalities: ["image", "text"],
  };
  if (item.ratio !== "1:1") body.image_config = { aspect_ratio: item.ratio };
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
      refs: item.refs,
    };
    s.modes[item.mode].images.unshift(newItem);
  });
  runRequest(newItem);
  toast("กำลังสร้างซ้ำค่ะ~");
}

// ---------- TimeFrame & Extend tool (โหมด cinematic) ----------
export function openExtendTool(item: GenItem) {
  mutate(s => { s.extendItemId = item.id; });
}

export function closeExtendTool() {
  mutate(s => { s.extendItemId = null; });
}

/**
 * รับเฟรมที่ผู้ใช้เลือกจาก timeline ของ scene เดิม มาตั้งเป็น First frame (Image-to-Video)
 * ของ scene ถัดไปในโหมด cinematic — prompt เดิมถูก prefill ให้ถ้าช่องยังว่าง เพื่อแก้ต่อเป็นเนื้อเรื่องถัดไป
 */
export function applyExtendFrame(item: GenItem, frameDataUrl: string, timeSec: number) {
  const tc = Math.floor(timeSec / 60) + ":" + String(Math.floor(timeSec % 60)).padStart(2, "0");
  mutate(s => {
    const ms = s.modes.cinematic;
    ms.refs = [{ kind: "ref", dataUrl: frameDataUrl, name: `เฟรม ${tc} จาก scene ก่อนหน้า` }];
    if (!ms.prompt.trim()) ms.prompt = item.prompt;
    s.extendItemId = null;
  });
  toast("ตั้งเฟรมเริ่มต้นของ scene ถัดไปแล้วค่ะ — ปรับ prompt แล้วกด Generate ได้เลย");
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
    if (isVideoMode(item.mode)) {
      ext = "mp4";
    } else if (item.mode === "audio") {
      ext = "mp3"; // blob URL — ดาวน์โหลดตรงได้เลย
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
  if (isVideoMode(item.mode) || item.mode === "audio") {
    triggerDownload(item.url, randomFileName(item.mode === "audio" ? "mp3" : "mp4")); // blob URL — ดาวน์โหลดตรงได้เลย ไม่ต้องแปลง format
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
  if (item.mode === "audio") return AUDIO_MODEL_PRICES[item.model] ?? null;
  if (isVideoMode(item.mode)) {
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
      // ตัด refs ออก — data URL ใหญ่มาก และคง format ให้เข้ากันได้กับ export เดิม
      queue: s.queue.map(({ refs: _refs, ...q }) => q),
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
        // ref images เป็น memory-only โดยตั้งใจ — ตัดออกจาก queue ที่ import มา (ถ้าไฟล์มีติดมา)
        if (Array.isArray(m.queue)) {
          s.queue = (m.queue as QueueJob[]).slice(0, MAX_QUEUE).map(q => ({ ...q, refs: [] }));
        }
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

  const modeName = state.mode === "audio" ? "music generation"
    : state.mode === "cinematic" ? "cinematic video generation (scenes that continue from a previous shot)"
    : state.mode === "video" ? "video generation"
    : state.mode === "infographic" ? "infographic generation" : "image generation";
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
// กันคำตอบแบบ "AI slop" — ใช้ร่วมกันทั้ง Chat with Atelier และ Grill me
// (ห้ามเกริ่นนำ/วกวน, ต้องเจาะจงไม่คลุมเครือ, ห้ามเดาข้อมูลที่ไม่มี — ถามกลับแทน)
const ANTI_SLOP_RULES =
  "Never pad your response with preamble, filler, or unnecessary summaries — get straight to the point. "
  + "Be specific and concrete, never vague: instead of generic terms like 'better lighting' or 'more detail', "
  + "name the actual technique or descriptor (e.g. 'golden hour rim light', 'shallow depth of field'). "
  + "Never guess or invent details the user hasn't given you — if something is missing or ambiguous, ask instead of assuming.";

function chatSystemPrompt(): string {
  return "You are the in-app assistant for Atelier, an AI media studio built on OpenRouter that generates images, infographics, videos and music. "
    + "You help the user brainstorm ideas, design prompts (style, lighting, composition, mood, camera work, musical genre and instrumentation), "
    + "and give practical advice about generating images, videos and music with AI models. "
    + "The user is currently in the \"" + modeLabel(state.mode) + "\" tab of the app "
    + "(General = images, Infographic = infographic images, Video = short video clips, "
    + "Cinematic = video scenes that can be extended frame-to-frame into a continuing story, Audio = songs/music). "
    + "Keep answers concise and practical. When useful, suggest a ready-to-use prompt. Respond in the same "
    + "language the user writes in (Thai or English). " + ANTI_SLOP_RULES;
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

// ---------- grill me ----------
// LLM สัมภาษณ์ทีละคำถามจนข้อมูลพอ (หรือครบเพดาน) แล้ว "ตกผลึก" เป็นชุด prompt หลายมุมมอง
// โปรโตคอล: คำถามเป็น plain text — ตอนตกผลึกโมเดลต้องตอบ JSON ล้วน จึงแยกได้ด้วยการลอง parse

function grillModeNoun(): string {
  return state.mode === "audio" ? "a song / music"
    : state.mode === "cinematic" ? "a cinematic video scene"
    : state.mode === "video" ? "a short video clip"
    : state.mode === "infographic" ? "an infographic image" : "an image";
}

function grillSystemPrompt(): string {
  return "You are an expert creative interviewer for Atelier, an AI media studio. The user wants to create "
    + grillModeNoun() + " with an AI model (current tab: " + modeLabel(state.mode) + "). "
    + "Interview the user to sharpen their idea: subject, purpose, style, mood, lighting, composition, camera work "
    + "(for music: genre, mood, instruments, vocals, tempo). "
    + "Rules: ask exactly ONE short, specific question per turn, in Thai, with no preamble and no summaries. "
    + "Use your judgment on how many questions the brief actually needs — simple ideas may need as few as "
    + MIN_GRILL_QUESTIONS + ", more complex or ambiguous ones may need up to " + MAX_GRILL_QUESTIONS + ", "
    + "but never exceed " + MAX_GRILL_QUESTIONS + " questions in the whole conversation. "
    + "When you have enough information, when the limit is reached, or when the user asks you to finish, "
    + "respond with ONLY valid JSON — no markdown fences, no other text — in this exact shape: "
    + '{"done": true, "prompts": [{"title": "ชื่อมุมมองสั้นๆ ภาษาไทย", "prompt": "detailed English prompt"}]} '
    + "with 3-5 prompts, each taking a distinctly different creative angle (style / composition / mood) on the same brief. "
    + ANTI_SLOP_RULES;
}

/** ลอง parse คำตอบเป็นผลตกผลึก — คืน null ถ้าเป็นคำถามธรรมดา (plain text จะ parse ไม่ผ่าน) */
function parseGrillReply(raw: string): GrillPrompt[] | null {
  const jsonText = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let parsed: { done?: unknown; prompts?: unknown };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || parsed.done !== true || !Array.isArray(parsed.prompts)) return null;
  const prompts = parsed.prompts
    .filter((p): p is GrillPrompt =>
      !!p && typeof (p as GrillPrompt).title === "string" && typeof (p as GrillPrompt).prompt === "string" && !!(p as GrillPrompt).prompt.trim())
    .map(p => ({ title: p.title.trim(), prompt: p.prompt.trim() }))
    .slice(0, 5);
  return prompts.length ? prompts : null;
}

async function callGrillLLM(messages: ChatMsg[]): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GRILL_MODEL,
      messages: [
        { role: "system", content: grillSystemPrompt() },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || ("HTTP " + res.status));
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error("โมเดลไม่ตอบข้อความกลับมาค่ะ");
  return String(reply).trim();
}

export function openGrill() {
  mutate(s => { s.grillOpen = true; s.chatOpen = false; }); // แผงซ้อนตำแหน่งเดียวกับ Chat — เปิดทีละอัน
}

export function closeGrill() {
  mutate(s => { s.grillOpen = false; });
}

export function resetGrill() {
  mutate(s => { s.grillMessages = []; s.grillResult = null; });
}

export async function sendGrillAnswer(text: string) {
  const t = text.trim();
  if (!t || state.grillPending || state.grillResult) return;
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }

  mutate(s => { s.grillMessages.push({ role: "user", content: t }); s.grillPending = true; });
  try {
    const raw = await callGrillLLM(state.grillMessages);
    const prompts = parseGrillReply(raw);
    if (prompts) {
      mutate(s => {
        s.grillResult = prompts;
        s.grillMessages.push({ role: "assistant", content: `ตกผลึกได้ ${prompts.length} prompt แล้วค่ะ เลือกใช้ด้านล่างได้เลย~` });
      });
    } else {
      mutate(s => { s.grillMessages.push({ role: "assistant", content: raw }); });
    }
  } catch (e) {
    mutate(s => { s.grillMessages.push({ role: "assistant", content: "⚠️ " + errMsg(e) }); });
  } finally {
    mutate(s => { s.grillPending = false; });
  }
}

/** บังคับตกผลึกทันที — ส่งคำสั่งปิดสัมภาษณ์ให้โมเดลโดยไม่แสดงเป็น bubble ในบทสนทนา */
export async function finishGrill() {
  if (state.grillPending || state.grillResult || !state.grillMessages.length) return;
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }

  mutate(s => { s.grillPending = true; });
  try {
    const raw = await callGrillLLM([
      ...state.grillMessages,
      { role: "user", content: "Stop interviewing. Output the final JSON now, based on everything discussed so far." },
    ]);
    const prompts = parseGrillReply(raw);
    if (!prompts) throw new Error("แปลผลตกผลึกไม่สำเร็จค่ะ ลองกดตกผลึกอีกครั้งนะคะ");
    mutate(s => {
      s.grillResult = prompts;
      s.grillMessages.push({ role: "assistant", content: `ตกผลึกได้ ${prompts.length} prompt แล้วค่ะ เลือกใช้ด้านล่างได้เลย~` });
    });
  } catch (e) {
    mutate(s => { s.grillMessages.push({ role: "assistant", content: "⚠️ " + errMsg(e) }); });
  } finally {
    mutate(s => { s.grillPending = false; });
  }
}

export function applyGrillPrompt(p: GrillPrompt) {
  mutate(() => { cur().prompt = p.prompt; });
  toast(`ใช้ prompt "${p.title}" แล้วค่ะ`);
}

/** เพิ่ม prompt จากผลตกผลึกเข้าคิวโดยตรง ใช้ model/settings ปัจจุบันของโหมด — ไม่แตะช่อง prompt */
export function queueGrillPrompt(p: GrillPrompt) {
  const ms = cur();
  const m = currentModel();
  if (!m) { toast("ยังไม่ได้เลือกโมเดลค่ะ"); return; }
  if (ms.queue.length >= MAX_QUEUE) { toast(`คิวเต็มแล้วค่ะ (${MAX_QUEUE}/${MAX_QUEUE})`); return; }
  if (refImageMissing()) { toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video)"); return; }
  mutate(() => {
    ms.queue.push({
      prompt: p.prompt,
      model: m.id,
      modelName: m.name || m.id,
      ratio: ms.ratio,
      count: ms.count,
      duration: ms.duration,
      audio: ms.audio,
      refs: refsSupported() ? ms.refs.slice() : [],
    });
  });
  toast(`เพิ่ม "${p.title}" เข้าคิวแล้วค่ะ (${ms.queue.length}/${MAX_QUEUE})`);
}
