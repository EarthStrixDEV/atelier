import {
  ASSIST_RATE_LIMIT_BACKOFF_MS, ASSIST_RATE_LIMIT_RETRIES,
  AUDIO_EXTRA_MODELS, AUDIO_MODEL_IDS, AUDIO_MODEL_PRICES,
  BUILTIN_TEMPLATES, CHAT_MODEL, DURATIONS, EXTRA_MODELS, GRILL_MODEL,
  MAX_BAKE_OFF_MODELS, MAX_CHAT_HISTORY, MAX_GRILL_QUESTIONS, MAX_HISTORY, MAX_QUEUE,
  MAX_REFS_PER_KIND, MAX_REF_BYTES, MAX_USER_TEMPLATES, MIN_GRILL_QUESTIONS, MODE_MODEL_FILTER, modelRequiresRefImage, OPTIMIZER_MODEL, PREFERRED,
  RATIOS, REF_KINDS, VIDEO_MODEL_IDS,
  VIDEO_POLL_MS, VIDEO_POLL_MS_HIDDEN, VIDEO_POLL_MS_MAX, VIDEO_RESOLUTION, videoTimeoutMsForModel, isNegativePromptMode, isVideoMode, modeLabel,
} from "./constants";
import {
  AutoSavePermissionError, autoSaveBlob, forgetAutoSaveDir, fsAccessSupported, isAutoSaveDirConnected, peekSavedDirName,
  pickAutoSaveDir, reconnectAutoSaveDir, urlToBlob,
} from "./fsAccess";
import { registerBlobUrl, releaseBlobUrls } from "./blobUrls";
import { beginNotifyBatch, notifyJobSettled, requestNotifyPermissionOnce } from "./notify";
import {
  addExportLogEntry, addPendingJob, clearSessionSnapshot, consumeQueueNonEmptyFlag, cur, loadPendingJobs,
  loadSessionSnapshotRaw, migrateHistoryList, mutate, nextHistorySeq,
  PROMPT_PLACEMENT_KEY, removePendingJob, saveAssistModelId, saveChatHistory, saveHistory, saveSessionSnapshotRaw,
  saveUserExtraModels, saveUserTemplates, state, toast, writeLocalStorage,
} from "./store";
import type { ChatMsg, ExplainedItem, GenItem, GrillPrompt, HistoryEntry, ImportDiffPerMode, ImportPreview, InfographicPreset, Mode, ORModel, PendingJobEntry, PromptPlacement, PromptTemplate, QueueJob, RefImage, RefKind, RefSupportLevel, StoryboardChain } from "./types";
import { captureVideoFrame, convertDataUrl, dataUrlByteSize, dedupCommaPhrases, hasKeyword, isImageDataUrl, randomFileName, sleep, togglePromptKeyword, triggerDownload, videoPricePerSec } from "./utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "unknown error";

// ---------- survive-reload job ledger ----------
const PENDING_JOB_PROMPT_PREVIEW_LEN = 80;

/** เขียน/อัพเดตเอนทรีของ item นี้ใน ledger — เรียกทันทีหลัง submit job สำเร็จ (video) หรือเริ่มยิง request (audio) */
function trackPendingJob(item: GenItem) {
  const entry: PendingJobEntry = {
    id: item.id,
    mode: item.mode,
    jobId: item.jobId,
    model: item.model,
    modelName: item.modelName,
    promptPreview: item.prompt.length > PENDING_JOB_PROMPT_PREVIEW_LEN
      ? item.prompt.slice(0, PENDING_JOB_PROMPT_PREVIEW_LEN) + "…"
      : item.prompt,
    startedAt: item.startedAt ?? Date.now(),
  };
  removePendingJob(item.id); // กันเอนทรีซ้ำถ้ามีของเก่าค้างอยู่ (เช่น resume แล้วยัง track เดิม)
  addPendingJob(entry);
}

// ---------- dev-only model-id drift check ----------
/**
 * เช็คว่า regex ใน MODE_MODEL_FILTER.infographic ยังแมตช์โมเดลจริงบน OpenRouter อยู่ไหม
 * และ id ใน EXTRA_MODELS/AUDIO_EXTRA_MODELS (fallback ที่ hardcode ไว้) ยังไม่ถูก OpenRouter list เอง
 * แค่ warn ผ่าน console — เป็น fallback ที่ตั้งใจไว้อยู่แล้วในหลายกรณี ไม่ถือเป็น error
 * ตัดออกจาก production build อัตโนมัติด้วย import.meta.env.DEV (tree-shaken โดย Vite)
 */
function checkModelIdDrift(imageModelIds: string[], allFetchedIds: string[]) {
  const infographicFilter = MODE_MODEL_FILTER.infographic;
  if (infographicFilter) {
    for (const re of infographicFilter) {
      if (!imageModelIds.some(id => re.test(id))) {
        console.warn(`[model-drift] MODE_MODEL_FILTER.infographic: regex ${re} ไม่แมตช์โมเดลใดเลยใน list ที่โหลดมาค่ะ — เช็คว่าโมเดลถูกเปลี่ยนชื่อ/ถอดออกจาก OpenRouter หรือยัง`);
      }
    }
  }
  for (const em of EXTRA_MODELS) {
    if (!allFetchedIds.includes(em.id)) {
      console.warn(`[model-drift] EXTRA_MODELS: "${em.id}" ยังไม่ถูก OpenRouter list มาเอง (อาจตั้งใจไว้เป็น fallback อยู่แล้ว — เช็คว่ายัง valid อยู่ไหม)`);
    }
  }
  for (const em of AUDIO_EXTRA_MODELS) {
    if (!allFetchedIds.includes(em.id)) {
      console.warn(`[model-drift] AUDIO_EXTRA_MODELS: "${em.id}" ยังไม่ถูก OpenRouter list มาเอง (อาจตั้งใจไว้เป็น fallback อยู่แล้ว — เช็คว่ายัง valid อยู่ไหม)`);
    }
  }
}

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
    // โมเดลที่ผู้ใช้เพิ่มเองผ่าน Advanced ของ KeyModal — merge ต่อจาก EXTRA_MODELS/AUDIO_EXTRA_MODELS ด้วย pattern เดียวกัน (ไม่ให้ id ซ้ำ)
    // แยกเข้ากลุ่มภาพ/เสียงตาม output_modalities ที่ผู้ใช้ระบุเอง — เข้ากลุ่มภาพเป็น default ถ้าไม่ได้ระบุ
    for (const em of state.userExtraModels) {
      const isAudioModel = (em.architecture?.output_modalities || []).includes("audio");
      if (isAudioModel) {
        if (!audioList.some(m => m.id === em.id)) audioList.push(em);
      } else if (!list.some(m => m.id === em.id)) {
        list.push(em);
      }
    }
    const rank = (m: ORModel) => {
      for (let i = 0; i < PREFERRED.length; i++) {
        if (PREFERRED[i].test(m.id) || PREFERRED[i].test(m.name || "")) return i;
      }
      return PREFERRED.length;
    };
    list.sort((a, b) => rank(a) - rank(b) || (a.name || a.id).localeCompare(b.name || b.id));
    mutate(s => { s.models = list; s.audioModels = audioList; ensureModelSelection(); applyVideoCapabilities(); });
    if (import.meta.env.DEV) checkModelIdDrift(list.map(m => m.id), fetched.map(m => m.id));
  } catch (e) {
    mutate(s => { s.modelsFailed = true; });
    toast("โหลดรายชื่อโมเดลไม่สำเร็จ: " + errMsg(e));
  }
}

// ---------- Advanced: EXTRA_MODELS override ที่ผู้ใช้เพิ่มเอง (KeyModal) ----------
/**
 * true ถ้ายังไม่โหลด model list เสร็จเลยสักตัว (ทั้งภาพและเสียง) — ใช้ defer การ validate id
 * ใน KeyModal แทนที่จะฟันธงว่า "ไม่รู้จัก" ทั้งหมดทั้งที่แค่ยังโหลดไม่เสร็จ
 */
export function modelListsStillLoading(): boolean {
  return state.models.length === 0 && state.audioModels.length === 0 && !state.modelsFailed;
}

/** เช็คว่า id นี้มีอยู่ใน list ที่ fetch มาแล้วไหม (ทั้งภาพ/เสียง/วิดีโอ) — ใช้เตือนก่อนเซฟ ไม่ใช่ hard block */
export function isKnownModelId(id: string): boolean {
  return state.models.some(m => m.id === id) || state.audioModels.some(m => m.id === id) || state.videoModels.some(m => m.id === id);
}

/** เขียน override list ใหม่ทั้งชุดลง state + localStorage แล้ว reload model list ให้ merge ค่าล่าสุดทันที */
export function setUserExtraModels(list: ORModel[]) {
  mutate(s => { s.userExtraModels = list; });
  saveUserExtraModels(list);
  loadModels();
  toast(`บันทึกโมเดลเพิ่มเติม ${list.length} รายการแล้วค่ะ`);
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

/**
 * true ถ้า session snapshot ที่เก็บไว้ (ถ้ามี) มีอะไร "ต่างจาก state สดที่เพิ่งสร้างใหม่ตอน boot" อย่างมีนัยสำคัญ
 * เทียบแบบเดียวกับ diffImportSession คร่าวๆ: มี prompt/history/queue อยู่ในโหมดไหนสักโหมดที่ state สดไม่มี (state สด
 * ตอน boot ว่างเปล่าเสมอ ยกเว้น history/userTemplates ที่ freshModeState โหลดจาก localStorage คนละ key อยู่แล้ว
 * — เทียบกับ history ปัจจุบันเพื่อไม่เตือนซ้ำกับสิ่งที่ persist อยู่แล้วโดยไม่ต้องพึ่ง snapshot เลย)
 */
function snapshotDiffersFromFresh(snapshot: ImportFileShape): boolean {
  for (const mode of Object.keys(state.modes) as Mode[]) {
    const m = snapshot.modes?.[mode];
    if (!m || typeof m !== "object") continue;
    const s = state.modes[mode];
    if (typeof m.prompt === "string" && m.prompt.trim() && m.prompt !== s.prompt) return true;
    if (Array.isArray(m.queue) && m.queue.length > 0) return true;
    if (Array.isArray(m.history)) {
      const existingTexts = new Set(s.history.map(e => e.text));
      if (m.history.some((e: unknown) => {
        const text = typeof e === "string" ? e : (e && typeof e === "object" ? (e as HistoryEntry).text : undefined);
        return typeof text === "string" && text && !existingTexts.has(text);
      })) return true;
    }
  }
  return false;
}

/**
 * survive-reload reconciliation — เรียกครั้งเดียวตอน boot หลัง loadVideoModels() โหลดเสร็จ (ต้องมี state.videoModels
 * พร้อมก่อน ถึงจะเช็คได้ว่าโมเดลของ entry ยังอยู่ไหม) อ่าน ledger ที่เขียนไว้ก่อนแท็บปิด/reload ครั้งก่อนแล้ว:
 * - jobId ยัง resume ได้ (โมเดลยังอยู่ + มี apiKey) → สร้าง GenItem สังเคราะห์กลับเข้า gallery ของโหมดนั้น แล้ว poll ต่อ
 *   ผ่าน runRequest เดิม (jobId ที่ยังอยู่ทำให้ requestVideo resume แทนที่จะ submit ใหม่ — ไม่จ่ายเงินซ้ำ)
 * - resume ไม่ได้ (audio ที่ไม่มี jobId ตั้งแต่แรก, โมเดลถูกถอดออกจาก OpenRouter แล้ว, หรือไม่มี apiKey ใน
 *   sessionStorage เพราะแท็บถูกปิดสนิทไปแล้ว) → ลบทิ้งจาก ledger แล้วนับเป็น "งานที่หายไป" ให้ banner แจ้งผู้ใช้
 * รวมกับผลเช็ค queue ที่หายไปตอน reload (consumeQueueNonEmptyFlag) และผลเช็ค session snapshot (PHASE 15 — ดู
 * snapshotDiffersFromFresh) เป็น banner เดียวกันเสมอ ไม่ยิงซ้อนหลายอันตอน boot
 */
export function reconcilePendingJobs() {
  const ledger = loadPendingJobs();
  const lostQueueModes = consumeQueueNonEmptyFlag().filter(m => state.modes[m].queue.length === 0);

  let snapshotRestorable = false;
  try {
    const raw = loadSessionSnapshotRaw();
    if (raw) {
      const parsed = parseSessionFile(JSON.parse(raw));
      if (parsed && snapshotDiffersFromFresh(parsed)) snapshotRestorable = true;
    }
  } catch { /* snapshot เสียหาย/parse ไม่ขึ้น — เงียบไว้ ไม่ต้อง block boot flow อื่น */ }

  if (!ledger.length && !lostQueueModes.length && !snapshotRestorable) return;

  let lostJobCount = 0;
  const resumable: { entry: PendingJobEntry; model: ORModel }[] = [];

  for (const entry of ledger) {
    // audio ไม่มี jobId ให้ resume ตั้งแต่ต้น — นับเป็นงานหายเสมอ
    const model = entry.jobId ? state.videoModels.find(m => m.id === entry.model) : undefined;
    if (entry.jobId && model && state.apiKey) {
      resumable.push({ entry, model });
    } else {
      removePendingJob(entry.id);
      lostJobCount++;
    }
  }

  if (resumable.length) {
    mutate(s => {
      for (const { entry, model } of resumable) {
        // กัน id ชนกับ item ใหม่ที่จะเกิดใน session นี้ (s.seq เริ่มนับจาก 0 ใหม่ทุกครั้งที่ reload
        // แต่ entry.id มาจาก seq ของ session ก่อนหน้า ซึ่งอาจมีค่าสูงกว่า)
        if (entry.id > s.seq) s.seq = entry.id;
        const item: GenItem = {
          id: entry.id,
          status: "loading",
          url: null,
          prompt: entry.promptPreview,
          model: model.id,
          modelName: model.name || model.id,
          ratio: "16:9",
          duration: 8,
          audio: false,
          jobStatus: "in_progress",
          jobId: entry.jobId,
          startedAt: entry.startedAt,
          errMsg: "",
          mode: entry.mode,
          refs: [],
          parentId: null,
        };
        s.modes[entry.mode].images.unshift(item);
      }
    });
    for (const { entry } of resumable) {
      const item = state.modes[entry.mode].images.find(x => x.id === entry.id);
      if (item) runRequest(item);
    }
  }

  const lostJobMsg = lostJobCount > 0
    ? `พบงาน ${lostJobCount} ชิ้นที่ค้างอยู่ตอนแท็บถูกปิด/reload และ resume ต่อไม่ได้แล้ว (โมเดลถูกถอดออก หรือไม่มี API key ในเซสชันนี้) — ต้องสร้างใหม่เองนะคะ`
    : "";
  const lostQueueMsg = lostQueueModes.length > 0
    ? `คิวที่ค้างอยู่ในโหมด ${lostQueueModes.map(modeLabel).join(", ")} หายไปตอน reload ค่ะ (คิวไม่ persist ข้าม reload โดยตั้งใจ)`
    : "";
  const snapshotMsg = snapshotRestorable
    ? "เจอบันทึกเซสชันอัตโนมัติจากรอบก่อนที่ยังไม่ได้ export ค่ะ — กดกู้คืนได้เลย"
    : "";
  if (lostJobMsg || lostQueueMsg || snapshotMsg) {
    const combined = [lostJobMsg, lostQueueMsg, snapshotMsg].filter(Boolean).join(" นอกจากนี้ ");
    mutate(s => { s.restoreBanner = { message: combined, canRestoreSnapshot: snapshotRestorable }; });
  }
}

export function dismissRestoreBanner() {
  mutate(s => { s.restoreBanner = null; });
}

/**
 * กู้คืน session snapshot (PHASE 15) กลับเข้า state ปัจจุบัน — ใช้ path เดียวกับ "Merge" ของ import ปกติ (ไม่ทับ
 * prompt/settings ปัจจุบัน แค่เพิ่ม history/queue ที่ snapshot มีแต่ปัจจุบันไม่มี) เพราะ snapshot เขียนอัตโนมัติ
 * เงียบๆ โดยผู้ใช้ไม่ได้ตั้งใจกดอะไร — ถ้าเผลอกู้ผิดจังหวะไม่ควรทำ prompt ที่พิมพ์อยู่ตอนนี้หายไปทับ
 */
export function restoreSessionSnapshot() {
  const raw = loadSessionSnapshotRaw();
  if (!raw) { dismissRestoreBanner(); return; }
  let parsed: ImportFileShape | null;
  try {
    parsed = parseSessionFile(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (!parsed) { toast("บันทึกเซสชันอัตโนมัติเสียหาย กู้คืนไม่ได้ค่ะ"); dismissRestoreBanner(); return; }
  const preview = diffImportSession(parsed);
  mutate(s => { s.importPending = { raw: parsed, preview }; s.restoreBanner = null; });
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

/** negative prompt (PHASE 14) — best-effort hint เท่านั้น เฉพาะโหมดภาพ (ดู isNegativePromptMode) */
export function setNegPrompt(v: string) {
  mutate(() => { cur().negPrompt = v; });
}

export function setPromptPlacement(placement: PromptPlacement) {
  mutate(s => {
    s.promptPlacement = placement;
    if (placement === "sidebar") s.sidebarCollapsed = false;
  });
  writeLocalStorage(PROMPT_PLACEMENT_KEY, placement);
}

const MAX_RECENT_KEYWORDS = 8;

export function toggleKeyword(kw: string) {
  mutate(() => {
    const ms = cur();
    ms.prompt = togglePromptKeyword(ms.prompt, kw);
    // เก็บ "ใช้ล่าสุด" เฉพาะตอนกดเพิ่มเข้า prompt (ไม่ใช่ตอนกดเอาออก) — ใหม่สุดขึ้นหน้าสุด ไม่ซ้ำ ตัดที่ cap
    if (hasKeyword(ms.prompt, kw)) {
      ms.recentKeywords = [kw, ...ms.recentKeywords.filter(k => k !== kw)].slice(0, MAX_RECENT_KEYWORDS);
    }
  });
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

// ---------- prompt templates / snippets library ----------
/**
 * แทรกข้อความ template เข้า prompt ปัจจุบัน ณ ตำแหน่ง cursor (ไม่ทับของเดิมที่พิมพ์ไว้แล้ว)
 * cursorPos = null/undefined (เช่น เรียกจากที่ที่ไม่มี textarea ref) → ต่อท้าย prompt เดิมแทน
 * คืนตำแหน่ง cursor ใหม่ (ท้ายข้อความที่เพิ่งแทรก) ให้ caller ใช้ set selection ต่อได้
 */
export function insertTemplateText(text: string, cursorPos?: number | null): number {
  let newPos = 0;
  mutate(() => {
    const ms = cur();
    const p = ms.prompt;
    const pos = cursorPos != null ? Math.max(0, Math.min(cursorPos, p.length)) : p.length;
    const before = p.slice(0, pos);
    const after = p.slice(pos);
    // เว้นช่องว่าง/ขึ้นบรรทัดให้ถ้าจุดแทรกติดกับข้อความเดิม กันคำมาชนกัน
    const sep = before && !/\s$/.test(before) ? " " : "";
    const sepAfter = after && !/^\s/.test(after) ? " " : "";
    const inserted = sep + text + sepAfter;
    ms.prompt = before + inserted + after;
    newPos = before.length + sep.length + text.length;
  });
  return newPos;
}

export function templatesForMode(mode: Mode): PromptTemplate[] {
  return [...BUILTIN_TEMPLATES[mode], ...state.modes[mode].userTemplates];
}

/** เซฟ prompt ปัจจุบันของโหมดนี้เป็น template ของผู้ใช้ — ใหม่สุดขึ้นหน้าสุด, cap ที่ MAX_USER_TEMPLATES (ตัดตัวเก่าสุดทิ้ง) */
export function saveCurrentPromptAsTemplate(label: string) {
  const ms = cur();
  const text = ms.prompt.trim();
  const name = label.trim();
  if (!text || !name) return;
  mutate(() => {
    const tpl: PromptTemplate = { id: "user-" + Date.now() + "-" + Math.floor(Math.random() * 1000), label: name, text };
    ms.userTemplates = [tpl, ...ms.userTemplates].slice(0, MAX_USER_TEMPLATES);
  });
  saveUserTemplates(state.mode);
  toast(`เซฟ template "${name}" แล้วค่ะ`);
}

export function deleteUserTemplate(mode: Mode, id: string) {
  mutate(() => {
    state.modes[mode].userTemplates = state.modes[mode].userTemplates.filter(t => t.id !== id);
  });
  saveUserTemplates(mode);
  toast("ลบ template แล้วค่ะ");
}

/** structural preset เฉพาะโหมด infographic — ตั้ง ratio, แทรก instruction เข้า prompt (แทรกที่ cursor เช่นเดียวกับ template ทั่วไป), แล้ว toggle keyword ที่เกี่ยวข้องให้ (ผ่าน toggleKeyword เดิม) */
export function applyInfographicPreset(preset: InfographicPreset, cursorPos?: number | null) {
  mutate(() => { cur().ratio = preset.ratio; });
  insertTemplateText(preset.instruction, cursorPos);
  for (const kw of preset.keywords) {
    if (!hasKeyword(cur().prompt, kw)) toggleKeyword(kw);
  }
  toast(`ใช้ preset "${preset.label}" แล้วค่ะ`);
}

// ---------- history ----------
/**
 * negPrompt: ค่า negative prompt ที่จับคู่ไว้ ณ ตอนกด generate (PHASE 14) — undefined/"" ไม่เซฟลง entry เลย
 * (กันเขียน negPrompt: "" ทับของเดิมที่มีอยู่แล้วตอน entry ซ้ำ text เดิมถูก re-unshift ขึ้นมาใหม่)
 */
export function addToHistory(mode: Mode, prompt: string, negPrompt?: string) {
  const p = prompt.trim();
  if (!p) return;
  const h = state.modes[mode].history;
  const existing = h.findIndex(e => e.text === p);
  const prevNegPrompt = existing !== -1 ? h[existing].negPrompt : undefined;
  if (existing !== -1) h.splice(existing, 1);
  const np = negPrompt?.trim() || prevNegPrompt;
  h.unshift({ text: p, at: nextHistorySeq(), pinned: false, ...(np ? { negPrompt: np } : {}) });
  // ตัด entry ที่เกิน cap ทิ้งจากท้ายสุด แต่ไม่แตะ pinned — กันของที่ปักหมุดไว้หลุดหายตอน history ยาว
  if (h.length > MAX_HISTORY) {
    for (let i = h.length - 1; i >= 0 && h.length > MAX_HISTORY; i--) {
      if (!h[i].pinned) h.splice(i, 1);
    }
  }
  saveHistory(mode);
}

export function removeFromHistory(mode: Mode, prompt: string) {
  mutate(() => {
    const h = state.modes[mode].history;
    const i = h.findIndex(e => e.text === prompt);
    if (i !== -1) h.splice(i, 1);
    saveHistory(mode);
  });
}

/**
 * ปักหมุด/เลิกปักหมุด entry ในประวัติของโหมดหนึ่ง — pinned entry รอดจากการตัดทิ้งตอน history ยาวเกิน MAX_HISTORY
 * (ดู addToHistory) และลอยขึ้นบนสุดของรายการเสมอ (ดู sortHistoryForDisplay)
 */
export function togglePinHistory(mode: Mode, text: string) {
  mutate(() => {
    const h = state.modes[mode].history;
    const entry = h.find(e => e.text === text);
    if (!entry) return;
    entry.pinned = !entry.pinned;
    saveHistory(mode);
  });
}

/** เรียงลำดับแสดงผลของ history: pinned ก่อนเสมอ (ใหม่สุดก่อนในกลุ่มเดียวกัน) ตามด้วยที่เหลือเรียงใหม่สุดก่อน */
export function sortHistoryForDisplay(list: HistoryEntry[]): HistoryEntry[] {
  return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at - a.at);
}

/** ใช้ prompt (+ negative prompt คู่กันถ้ามี — PHASE 14) จาก history กลับเข้าช่อง prompt ของโหมดปัจจุบัน */
export function usePromptFromHistory(entry: HistoryEntry) {
  mutate(() => {
    const ms = cur();
    ms.prompt = entry.text;
    if (isNegativePromptMode(state.mode)) ms.negPrompt = entry.negPrompt ?? "";
  });
}

/** รายการ history ของทุกโหมดรวมกัน เรียงตาม sortHistoryForDisplay ข้ามโหมด — ใช้ในแผง "ประวัติทั้งหมด" (cross-mode) */
export interface CombinedHistoryEntry extends HistoryEntry {
  mode: Mode;
}
export function combinedHistory(): CombinedHistoryEntry[] {
  const all: CombinedHistoryEntry[] = [];
  for (const mode of Object.keys(state.modes) as Mode[]) {
    for (const entry of state.modes[mode].history) all.push({ ...entry, mode });
  }
  return all.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at - a.at);
}

export function toggleAllHistoryOpen() {
  mutate(s => { s.allHistoryOpen = !s.allHistoryOpen; });
}

/** ใช้ prompt จากแผง "ประวัติทั้งหมด" — สลับไปโหมดต้นทางของ entry นั้นก่อนเสมอ (ต่างจาก usePromptFromHistory ที่ใช้กับโหมดปัจจุบันเท่านั้น) */
export function usePromptFromCombinedHistory(entry: CombinedHistoryEntry) {
  if (entry.mode !== state.mode) switchMode(entry.mode);
  mutate(() => {
    const ms = state.modes[entry.mode];
    ms.prompt = entry.text;
    if (isNegativePromptMode(entry.mode)) ms.negPrompt = entry.negPrompt ?? "";
  });
}

/** ตัดวลีที่คั่นด้วย comma แล้วซ้ำกันออกจาก prompt ปัจจุบัน — ดู dedupCommaPhrases ใน utils.ts */
export function dedupPromptKeywords() {
  mutate(() => { cur().prompt = dedupCommaPhrases(cur().prompt); });
}

// ---------- reference images ----------
/**
 * แนบ ref ผ่าน /chat/completions สำหรับภาพ และ frame_images สำหรับ Image-to-Video
 * รับ mode/model เป็นพารามิเตอร์ (ไม่อ่านจาก currentModel()/state.mode ตรงๆ) เพื่อให้ประเมินโมเดลไหนก็ได้
 * ในเวลาเดียวกัน — ใช้ทำ badge ใน dropdown เลือกโมเดล (ทุกตัวใน list) และ per-item retry override
 */
export function refsSupportedFor(mode: Mode, model: ORModel | null): boolean {
  if (mode === "audio") return false; // ยังไม่รองรับ image-to-music — ตัด ref ออกทั้งโหมด
  if (isVideoMode(mode)) return true;
  const outs = model?.architecture?.output_modalities || [];
  return !(outs.length && !outs.includes("text"));
}

/**
 * negative prompt (PHASE 14) ใช้ได้แค่โหมดภาพ (ดู isNegativePromptMode) และเฉพาะโมเดลที่ routed ผ่าน chat/completions
 * เท่านั้น — โมเดล image-only (เช่น Grok Imagine) ยิงผ่าน /api/v1/images ตรงๆ ไม่มี text slot ให้แนบ AVOID block เพิ่ม
 * เงื่อนไข routing เดียวกับ refsSupportedFor เป๊ะๆ (ดู runRequest) จึงเช็ค output_modalities แบบเดียวกันตรงๆ
 */
export function negPromptSupportedFor(mode: Mode, model: ORModel | null): boolean {
  if (!isNegativePromptMode(mode)) return false;
  const outs = model?.architecture?.output_modalities || [];
  return !(outs.length && !outs.includes("text"));
}

export function negPromptSupported(): boolean {
  return negPromptSupportedFor(state.mode, currentModel());
}

/** เวอร์ชันสะดวกใช้ — ประเมินจากโหมด/โมเดลที่เลือกอยู่ปัจจุบัน (เดิมชื่อ refsSupported ไม่รับพารามิเตอร์) */
export function refsSupported(): boolean {
  return refsSupportedFor(state.mode, currentModel());
}

/**
 * ระดับการรองรับ ref image ของโมเดลหนึ่งตัวใน mode หนึ่ง — ใช้ทำ badge ในตัวเลือกโมเดล
 * "required": โมเดล image-to-video ล้วน ต้องแนบภาพก่อนถึง generate ได้ (ดู modelRequiresRefImage)
 * "optional": แนบได้แต่ไม่บังคับ
 * "none": โมเดลนี้แนบภาพอ้างอิงไม่ได้เลย (เช่น image-only model ในโหมดภาพ, หรือโหมด audio)
 */
export function refSupportLevel(mode: Mode, model: ORModel | null): RefSupportLevel {
  if (!refsSupportedFor(mode, model)) return "none";
  if (isVideoMode(mode) && modelRequiresRefImage(model?.id)) return "required";
  return "optional";
}

export function refsOfKind(kind: RefKind): RefImage[] {
  return cur().refs.filter(r => r.kind === kind);
}

/** โหมดที่ต่อยอดข้ามโหมดได้ ("ใช้เป็นเฟรมแรกวิดีโอ" / "Refine this") — เฉพาะภาพนิ่งจาก Home/Infographic */
const CHAINABLE_MODES = new Set<Mode>(["home", "infographic"]);
export function isChainableItem(item: GenItem): boolean {
  return CHAINABLE_MODES.has(item.mode);
}

/** "Refine this" ต้องโชว์/กดได้เฉพาะตอนโมเดลของ item เองรองรับภาพอ้างอิง — reuse refsSupportedFor เดิม ไม่เดาเอง */
export function canRefineItem(item: GenItem): boolean {
  if (!isChainableItem(item)) return false;
  // ใช้ modelsForMode(item.mode) เดียวกับ retryWithOverride — โมเดลอาจถูกถอดออกจาก OpenRouter แล้วก็ได้ (ไม่พบ = ไม่รองรับ)
  const model = modelsForMode(item.mode).find(m => m.id === item.model) ?? null;
  return refsSupportedFor(item.mode, model);
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

// ---------- cross-mode chaining (image side) ----------
/**
 * ส่งภาพที่ done แล้วจาก Home/Infographic ไปเป็นเฟรมแรกของโหมด Video — สลับโหมด, แนบเป็น ref image
 * (path เดียวกับ addRefImages แต่ต้นทางเป็น data URL ในหน่วยความจำ ไม่ใช่ File เลยต้องเช็คขนาดเองตรงนี้)
 * แล้ว prefill prompt ของโหมด video ให้ถ้าช่องยังว่าง (ไม่ทับ prompt ที่ผู้ใช้พิมพ์ไว้ก่อนแล้ว)
 */
export function useAsVideoFirstFrame(item: GenItem) {
  if (!item.url || item.status !== "done") return;
  if (dataUrlByteSize(item.url) > MAX_REF_BYTES) {
    toast(`ภาพนี้ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ใช้เป็นเฟรมแรกไม่ได้`);
    return;
  }
  mutate(s => {
    s.mode = "video";
    s.optimize = { status: "idle", result: null, error: "" };
    const vs = s.modes.video;
    vs.refs = [{ kind: "ref", dataUrl: item.url!, name: "จาก " + modeLabel(item.mode) }];
    if (!vs.prompt.trim()) vs.prompt = item.prompt;
    ensureModelSelection();
    applyVideoCapabilities();
  });
  toast("ตั้งเป็นเฟรมแรกของ Video mode แล้วค่ะ");
}

/**
 * "Refine this" — ต่อยอดภาพที่ done แล้วจาก Home/Infographic เป็น image-to-image: แนบภาพเดิมเป็น ref image
 * (kind: "ref" เพื่อคง composition เดิม) แล้วเคลียร์ prompt ให้ผู้ใช้พิมพ์แค่ส่วนที่อยากแก้/เพิ่ม
 * ต้องเรียกเฉพาะตอน refsSupportedFor(item.mode, model) เป็น true — caller (Gallery/Lightbox) เป็นคน gate ปุ่มนี้
 * ตั้ง refiningParentId ไว้ให้ generate() ครั้งถัดไปผูก parentId ให้ item ใหม่อัตโนมัติ
 */
export function refineItem(item: GenItem) {
  if (!item.url || item.status !== "done") return;
  if (dataUrlByteSize(item.url) > MAX_REF_BYTES) {
    toast(`ภาพนี้ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ใช้เป็นภาพอ้างอิงไม่ได้`);
    return;
  }
  if (item.mode !== state.mode) switchMode(item.mode);
  mutate(() => {
    const ms = state.modes[item.mode];
    ms.refs = [{ kind: "ref", dataUrl: item.url!, name: "ภาพต้นฉบับที่ refine" }];
    ms.prompt = "";
    ms.refiningParentId = item.id;
  });
  toast("แนบภาพนี้เป็น reference แล้วค่ะ — พิมพ์สิ่งที่อยากแก้แล้วกด Generate ได้เลย");
}

/** "Start from this" กดได้แค่ตอน item done แล้วเท่านั้น — ใช้ได้กับทุกโหมดต้นทาง (รวม cinematic เอง) ต่างจาก isChainableItem ที่จำกัดแค่ Home/Infographic */
export function canStartFrom(item: GenItem): boolean {
  return item.status === "done" && !!item.url;
}

/**
 * "Start from this" — ต่อยอดข้ามโหมดแบบกว้างกว่า useAsVideoFirstFrame/refineItem: ใช้ได้จาก item ที่ done แล้ว
 * ของ "ทุกโหมด" (รวมถึง Cinematic เองสำหรับเริ่ม chain ใหม่จาก scene ที่เลือก) ไปเป็นจุดเริ่มต้นของ Video/Cinematic mode
 * สร้าง GenItem สังเคราะห์ (status: "done", parentId: null) ขึ้นตรงๆ ใน gallery ปลายทางเป็น "scene เริ่มต้น" ให้เห็นผล
 * ทันที ไม่ต้องรอ generate ก่อน — ใช้ภาพนิ่งของ item ต้นทางตรงๆ ถ้าเป็นภาพ, หรือ capture เฟรมสุดท้ายถ้าต้นทางเป็นวิดีโอ
 * (audio ไม่มีเฟรมให้จับ — สร้าง item สังเคราะห์แบบไม่มีภาพ ผู้ใช้ต้องแนบภาพเองก่อน generate จริง)
 * caller (Gallery/Lightbox) ต้อง gate ปุ่มนี้ด้วย item.status === "done" และแสดง confirm ก่อนเรียก เพราะเป็นการสลับโหมดกะทันหัน
 */
export async function startFromItem(item: GenItem, targetMode: "video" | "cinematic") {
  if (item.status !== "done" || !item.url) return;

  let frameDataUrl: string | null = null;
  try {
    frameDataUrl = isVideoMode(item.mode) ? (await captureVideoFrame(item.url)).dataUrl : item.mode === "audio" ? null : item.url;
  } catch (e) {
    toast("จับเฟรมจากต้นฉบับไม่สำเร็จ: " + errMsg(e));
    return;
  }
  if (frameDataUrl && dataUrlByteSize(frameDataUrl) > MAX_REF_BYTES) {
    toast(`ภาพต้นฉบับใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ใช้เป็นจุดเริ่มต้นไม่ได้`);
    return;
  }

  mutate(s => {
    s.mode = targetMode;
    s.optimize = { status: "idle", result: null, error: "" };
    const ts = s.modes[targetMode];
    // โมเดลของ item ต้นทางอาจใช้ไม่ได้ในโหมดปลายทาง (เช่นมาจาก Home) — fallback ไปโมเดลที่เลือกอยู่ในโหมดปลายทาง หรือตัวแรกในลิสต์
    const targetModel = modelsForMode(targetMode).find(m => m.id === item.model)
      ?? modelsForMode(targetMode).find(m => m.id === ts.modelId)
      ?? modelsForMode(targetMode)[0]
      ?? null;
    const rootItem: GenItem = {
      id: ++s.seq,
      status: "done",
      url: frameDataUrl,
      prompt: item.prompt,
      model: targetModel?.id ?? item.model,
      modelName: targetModel?.name ?? targetModel?.id ?? item.modelName,
      ratio: item.mode === "audio" ? ts.ratio : item.ratio,
      duration: 0, // ยังไม่มีวิดีโอจริง (แค่ภาพตั้งต้น) — 0 กันไปบวกเข้ายอดวินาที/ราคาของ storyboard chain ผิดๆ
      audio: false,
      jobStatus: "",
      jobId: null,
      startedAt: null,
      errMsg: "",
      mode: targetMode,
      refs: [],
      parentId: null, // รากใหม่ของ chain เสมอ — ไม่ผูกกับ chain เดิมของ item ต้นทาง แม้ต้นทางจะมี parentId ของตัวเองอยู่แล้ว
    };
    ts.images.unshift(rootItem);
    if (frameDataUrl) ts.refs = [{ kind: "ref", dataUrl: frameDataUrl, name: "จาก " + modeLabel(item.mode) }];
    if (!ts.prompt.trim()) ts.prompt = item.prompt;
    if (targetModel) ts.modelId = targetModel.id;
    ensureModelSelection();
    applyVideoCapabilities();
  });
  toast(`เริ่มต้น ${modeLabel(targetMode)} mode จากภาพนี้แล้วค่ะ — ปรับ prompt แล้วกด Generate scene ถัดไปได้เลย`);
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
      ...(negPromptSupportedFor(state.mode, m) && ms.negPrompt.trim() ? { negPrompt: ms.negPrompt.trim() } : {}),
    });
  });
  toast("เพิ่มเข้าคิวแล้วค่ะ (" + ms.queue.length + "/" + MAX_QUEUE + ")");
}

export function removeFromQueue(index: number) {
  mutate(() => { cur().queue.splice(index, 1); });
}

/**
 * ย้ายตำแหน่ง job ในคิวของโหมดปัจจุบัน — ใช้ทั้ง drag-and-drop และปุ่มขึ้น/ลง (fallback บนมือถือ)
 * งานในคิวทุกชิ้นยังไม่ถูกส่งจริง (generate() ถึงจะยิงทั้งคิวพร้อมกันทีเดียว) จึงไม่มีแนวคิด "งานที่กำลังประมวลผลอยู่"
 * ในคิวนี้เลย — ทุกแถวเรียงลำดับใหม่ได้อย่างอิสระ ไม่ต่างจาก removeFromQueue ที่ทำได้ทุกตำแหน่งอยู่แล้ว
 */
export function reorderQueue(fromIndex: number, toIndex: number) {
  mutate(() => {
    const q = cur().queue;
    if (fromIndex < 0 || fromIndex >= q.length || toIndex < 0 || toIndex >= q.length || fromIndex === toIndex) return;
    const [moved] = q.splice(fromIndex, 1);
    q.splice(toIndex, 0, moved);
  });
}

/**
 * ล้าง gallery ของโหมดที่ระบุกลับสู่สถานะว่าง — revoke blob URL ของวิดีโอ/เพลงทุกชิ้นก่อนทิ้ง item
 * เพื่อไม่ให้ browser ถือ memory ของไฟล์เหล่านั้นค้างไว้ทั้งที่ไม่มีใครอ้างอิงแล้ว
 */
export function resetModeGallery(mode: Mode) {
  mutate(s => {
    const ms = s.modes[mode];
    for (const item of ms.images) releaseBlobUrls(item.id);
    ms.images = [];
    ms.selected = new Set();
    ms.lbIndex = -1;
  });
}

// ---------- generation ----------
export function generate() {
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }
  // ขอสิทธิ์ notification แบบ lazy เฉพาะครั้งแรกที่กด generate ในโหมด video/cinematic — ต้องมาจาก user gesture นี้เท่านั้น
  if (isVideoMode(state.mode)) requestNotifyPermissionOnce();
  const ms = cur();

  // "Refine this" ผูก parentId ให้เฉพาะ batch ที่ยิงตรงจาก prompt (ไม่ใช่จากคิว) — ใช้ครั้งเดียวแล้วเคลียร์ทิ้งเสมอ
  // ไม่ว่าจะยิงจริงหรือไม่ เพื่อไม่ให้ค้างไปผูกกับ generate ครั้งถัดไปที่ไม่เกี่ยวข้องกันแล้ว
  const parentId = !ms.queue.length ? ms.refiningParentId : null;
  if (ms.refiningParentId != null) mutate(() => { ms.refiningParentId = null; });

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
      ...(negPromptSupportedFor(state.mode, model) && ms.negPrompt.trim() ? { negPrompt: ms.negPrompt.trim() } : {}),
    }];
  }

  const mode = state.mode;
  const seen = new Set<string>();
  for (const job of jobs) {
    if (!seen.has(job.prompt)) { seen.add(job.prompt); addToHistory(mode, job.prompt, job.negPrompt); }
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
          parentId,
          ...(job.negPrompt ? { negPrompt: job.negPrompt } : {}),
        };
        s.modes[mode].images.unshift(item);
        batch.push(item);
      }
    }
  });
  // batch > 1 งาน (คิวหลาย job หรือ count > 1) — รวมแจ้งเตือนเป็นก้อนเดียวตอนครบทุกงาน แทนแจ้งทีละงาน
  // เฉพาะโหมด video/cinematic/audio เท่านั้นที่ runRequest เรียก notifyJobSettled — โหมดอื่นไม่ต้องเปิด batch เลย (กัน batch ค้างไม่มีใคร resolve)
  const notifiable = isVideoMode(mode) || mode === "audio";
  const batchId = notifiable && batch.length > 1 ? beginNotifyBatch(batch.length) : null;
  batch.forEach(item => runRequest(item, batchId));
}

// ---------- Bake-off: multi-model side-by-side (PHASE 14) ----------
/** เปิด/ปิด Bake-off ของโหมดปัจจุบัน — ปิดแล้วเคลียร์ selection ทิ้งไปด้วย กันเลือกโมเดลเก่าค้างไว้เงียบๆ ตอนเปิดใหม่ */
export function toggleBakeOff() {
  mutate(() => {
    const ms = cur();
    ms.bakeOffEnabled = !ms.bakeOffEnabled;
    if (!ms.bakeOffEnabled) ms.bakeOffModelIds = [];
  });
}

/** สลับเลือก/ไม่เลือกโมเดลหนึ่งตัวใน Bake-off ของโหมดปัจจุบัน — เกิน MAX_BAKE_OFF_MODELS แล้วเลือกเพิ่มไม่ได้ */
export function toggleBakeOffModel(modelId: string) {
  mutate(() => {
    const ms = cur();
    if (ms.bakeOffModelIds.includes(modelId)) {
      ms.bakeOffModelIds = ms.bakeOffModelIds.filter(id => id !== modelId);
    } else {
      if (ms.bakeOffModelIds.length >= MAX_BAKE_OFF_MODELS) {
        toast(`เลือกได้สูงสุด ${MAX_BAKE_OFF_MODELS} โมเดลค่ะ`);
        return;
      }
      ms.bakeOffModelIds = [...ms.bakeOffModelIds, modelId];
    }
  });
}

/** เงื่อนไขกด "Bake-off" ได้จริง — ต้องเปิด toggle, มี prompt, มีโมเดลเลือกไว้ ≥2 ตัว (1 ตัวไม่ต่างจาก generate ปกติ) */
export function canRunBakeOff(): boolean {
  const ms = cur();
  return ms.bakeOffEnabled && !!ms.prompt.trim() && ms.bakeOffModelIds.length >= 2 && !!state.apiKey;
}

export interface BakeOffCostRow {
  modelId: string;
  modelName: string;
  cost: number | null;
}

/** สรุปราคาประเมินต่อโมเดลของ Bake-off ที่จะยิงจริง — ใช้ทั้งใน modal ยืนยันและปุ่มเปิด modal (คิดจากราคา 1 ชิ้นต่อโมเดล ไม่มี count) */
export function bakeOffCostBreakdown(): BakeOffCostRow[] {
  const ms = cur();
  const list = modelsForMode(state.mode);
  return ms.bakeOffModelIds.map(modelId => {
    const m = list.find(x => x.id === modelId) ?? null;
    return {
      modelId,
      modelName: m?.name || modelId,
      cost: m ? computeCost(state.mode, m.id, false, ms.duration) : null,
    };
  });
}

/**
 * ยิง generate จริงของ Bake-off — N request อิสระพร้อมกัน (ไม่ผ่านคิว, ไม่โดน MAX_QUEUE จำกัด ตามที่ตั้งใจไว้)
 * ใช้ prompt/negPrompt/ratio/ref เดียวกันทุกโมเดล แต่แต่ละ item ยัง routed ผ่าน runRequest ที่เช็ค output_modalities
 * ของโมเดลตัวเองอิสระ (chat/completions vs image-only API) — โมเดลหนึ่งพังไม่กระทบตัวอื่นเพราะ runRequest ดัก try/catch
 * ต่อ item อยู่แล้ว ต้องเรียกจาก caller ที่ยืนยันค่าใช้จ่ายแล้วเท่านั้น (ดู BakeOffConfirmModal)
 */
export function runBakeOff() {
  if (!canRunBakeOff()) return;
  const ms = cur();
  const mode = state.mode;
  const list = modelsForMode(mode);
  const models = ms.bakeOffModelIds.map(id => list.find(m => m.id === id)).filter((m): m is ORModel => !!m);
  if (models.length < 2) { toast("โมเดลที่เลือกไว้ไม่พร้อมใช้งานแล้วค่ะ ลองเลือกใหม่นะคะ"); return; }

  const prompt = ms.prompt.trim();
  const negPrompt = ms.negPrompt.trim();
  addToHistory(mode, prompt, negPrompt);

  const groupId = Date.now();
  const refs = refsSupported() ? ms.refs.slice() : [];
  const batch: GenItem[] = [];
  mutate(s => {
    for (const model of models) {
      const item: GenItem = {
        id: ++s.seq,
        status: "loading",
        url: null,
        prompt,
        model: model.id,
        modelName: model.name || model.id,
        ratio: ms.ratio,
        duration: ms.duration,
        audio: false,
        jobStatus: "",
        jobId: null,
        startedAt: null,
        errMsg: "",
        mode,
        refs,
        bakeOffGroupId: groupId,
        ...(negPromptSupportedFor(mode, model) && negPrompt ? { negPrompt } : {}),
      };
      s.modes[mode].images.unshift(item);
      batch.push(item);
    }
  });
  batch.forEach(item => runRequest(item));
  toast(`กำลังสร้าง Bake-off ${models.length} โมเดลพร้อมกันค่ะ~`);
}

/** เปิดโมดัลยืนยันค่าใช้จ่ายก่อนยิง Bake-off จริง — เรียกจากปุ่ม Generate ตอน bakeOffEnabled แทนยิงตรง (ดู canRunBakeOff) */
export function openBakeOffConfirm() {
  if (!canRunBakeOff()) return;
  mutate(s => { s.bakeOffConfirmOpen = true; });
}

export function closeBakeOffConfirm() {
  mutate(s => { s.bakeOffConfirmOpen = false; });
}

/** ปุ่มยืนยันในโมดัล — ปิดโมดัลแล้วค่อยยิง runBakeOff จริง */
export function confirmBakeOff() {
  mutate(s => { s.bakeOffConfirmOpen = false; });
  runBakeOff();
}

/**
 * batchId: มาจาก beginNotifyBatch() เมื่อยิงหลายงานพร้อมกัน (generate() คิว/count > 1) — ใช้รวมแจ้งเตือนเป็นก้อนเดียว
 * ตอน queue เต็ม caller ที่ไม่ผ่าน batch (retry, regenerate, auto-extend, ฯลฯ) ปล่อย null ไว้ = แจ้งทันทีทีละงาน
 */
async function runRequest(item: GenItem, batchId: number | null = null) {
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
  recordModelStat(item.model, item.status === "done");
  // ลบออกจาก pending-job ledger เมื่อไม่มีอะไรให้ resume ต่อแล้วเท่านั้น: done เสมอ, หรือ error ที่ item.jobId
  // ถูกเคลียร์ไปแล้ว (fail ถาวร/ต้อง submit ใหม่) — ส่วน error ที่ยังมี jobId ค้างอยู่ (เช่น timeout, โหลดไฟล์พลาด)
  // ต้องคง entry ไว้ เพราะ "ลองใหม่" ยัง resume งานเดิมได้โดยไม่จ่ายซ้ำ (ดู addPendingJob ใน requestVideo/requestAudio)
  if (item.status === "done" || (item.status === "error" && !item.jobId)) removePendingJob(item.id);
  // item ถูก mutate ตรงๆ ใน array ของโหมดต้นทาง — broadcast ทีเดียวพอ ทุกโหมดได้ state ถูกต้อง
  mutate();
  if (item.status === "done") autoSaveItem(item); // fire-and-forget — ไม่บล็อก UI, error แค่ toast เตือน
  // แจ้งเตือน desktop/title flicker เฉพาะงานที่ใช้เวลานาน (video/cinematic/audio) — ภาพนิ่งเร็วพอไม่ต้องรบกวน
  if (isVideoMode(item.mode) || item.mode === "audio") notifyJobSettled(item, batchId);
}

// ---------- model reliability stats (session-only) ----------
/** นับสำเร็จ/ล้มเหลวต่อโมเดลหลังยิง request จริงเท่านั้น — เรียกจาก runRequest เดียว ครอบคลุมทุก path (image/video/audio) */
function recordModelStat(modelId: string, ok: boolean) {
  const stat = state.modelStats[modelId] ?? (state.modelStats[modelId] = { ok: 0, fail: 0 });
  if (ok) stat.ok++; else stat.fail++;
}

// ---------- auto save ----------
/**
 * คิว serialize การเขียนไฟล์ทีละอันจริงๆ (ไม่ยิงพร้อมกันหลาย write ทับกัน) — ทั้ง autoSaveItem ตอน item เสร็จใหม่
 * และ retryFailedAutoSaves ที่ผู้ใช้กดเอง ต่างก็ผ่านคิวเดียวกันนี้ กัน race ระหว่างสอง path
 */
let autoSaveChain: Promise<void> = Promise.resolve();
function enqueueAutoSave(task: () => Promise<void>): Promise<void> {
  autoSaveChain = autoSaveChain.then(task, task);
  return autoSaveChain;
}

/** เขียนไฟล์จริงหนึ่งชิ้น — ตั้ง autoSaveStatus/autoSaveErrMsg ของ item ตามผลลัพธ์ แยก permission error ออกจาก error ชั่วคราว */
async function performAutoSave(item: GenItem) {
  item.autoSaveStatus = "pending";
  item.autoSaveErrMsg = "";
  mutate();
  try {
    const ext = isVideoMode(item.mode) ? "mp4" : item.mode === "audio" ? "mp3" : state.lbFormat;
    const blob = await urlToBlob(
      isVideoMode(item.mode) || item.mode === "audio" ? item.url! : await convertDataUrl(item.url!, state.lbFormat)
    );
    await autoSaveBlob(blob, randomFileName(ext));
    item.autoSaveStatus = "saved";
    item.autoSaveErrMsg = "";
  } catch (e) {
    item.autoSaveStatus = "failed";
    item.autoSaveErrMsg = errMsg(e);
    if (e instanceof AutoSavePermissionError) {
      // permission ถูกถอนจริง — ปิด auto-save ทั้งระบบกันเขียนพลาดซ้ำทุกภาพถัดไป ต้องให้ผู้ใช้เชื่อมต่อใหม่เอง
      mutate(s => { s.autoSaveEnabled = false; s.autoSaveDirName = null; });
      toast("Auto Save หยุดทำงาน: " + item.autoSaveErrMsg);
    }
    // error อื่นๆ (เขียนไฟล์พลาดชั่วคราว) — ไม่ปิด auto-save ทั้งระบบ แค่ทำเครื่องหมายชิ้นนี้ไว้ให้กด retry ทีหลังได้
  }
  mutate();
}

function autoSaveItem(item: GenItem) {
  if (!state.autoSaveEnabled || !item.url || !isAutoSaveDirConnected()) return;
  enqueueAutoSave(() => performAutoSave(item));
}

/** มี item ที่ autoSaveStatus === "failed" อยู่ในโหมดปัจจุบันไหม — ใช้โชว์/ซ่อนปุ่ม "ลองเซฟใหม่" ข้าง usage bar */
export function hasFailedAutoSaves(): boolean {
  return cur().images.some(x => x.autoSaveStatus === "failed");
}

/**
 * retry เฉพาะ item ที่ autoSaveStatus === "failed" ของโหมดปัจจุบัน — เรียงคิวทีละไฟล์ผ่าน enqueueAutoSave เดียวกับ
 * flow ปกติ (ไม่ยิง concurrent write หลายไฟล์พร้อมกัน) ถ้า permission หลุดไปแล้วต้องเชื่อมต่อใหม่ก่อน — เตือนแยกจากนี้
 */
export function retryFailedAutoSaves() {
  if (!isAutoSaveDirConnected()) {
    toast("การเชื่อมต่อ Auto Save หลุดไปแล้วค่ะ — เชื่อมต่อ directory ใหม่ก่อนถึงจะลองเซฟซ้ำได้");
    return;
  }
  const failed = cur().images.filter(x => x.autoSaveStatus === "failed");
  if (!failed.length) return;
  for (const item of failed) enqueueAutoSave(() => performAutoSave(item));
  toast(`กำลังลองเซฟใหม่ ${failed.length} ไฟล์ค่ะ~`);
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

/**
 * poll interval แบบ backoff: เริ่มที่ VIDEO_POLL_MS (~10s) แล้วไต่ขึ้นทีละน้อยตามเวลาที่ job รันมา
 * จนถึงเพดาน VIDEO_POLL_MS_MAX (~20s) — งานที่รันนานแล้วไม่ต้อง poll ถี่เท่าตอนเพิ่ง submit
 * ถ้าแท็บถูกซ่อนอยู่ (document.hidden) ใช้ VIDEO_POLL_MS_HIDDEN แทนทั้งหมด แล้วกลับมาถี่ปกติทันทีที่แท็บ focus/visible อีกครั้ง
 */
function videoPollIntervalMs(elapsedMs: number): number {
  if (typeof document !== "undefined" && document.hidden) return VIDEO_POLL_MS_HIDDEN;
  const rampMs = 5 * 60 * 1000; // ไต่เต็มเพดานภายใน 5 นาทีแรกของการ poll
  const t = Math.min(1, Math.max(0, elapsedMs / rampMs));
  return Math.round(VIDEO_POLL_MS + (VIDEO_POLL_MS_MAX - VIDEO_POLL_MS) * t);
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
    // เขียน ledger ทันทีหลัง POST สำเร็จ — ลด race ที่ผู้ใช้ปิดแท็บทันทีหลังกด generate ก่อนโค้ดตรง mutate() ด้านล่างจะทำงาน
    trackPendingJob(item);
  }

  const timeoutMs = videoTimeoutMsForModel(item.model);
  const deadline = Date.now() + timeoutMs;
  const pollStartedAt = Date.now();
  while (true) {
    // งานที่ resume มา งานอาจเสร็จอยู่แล้ว — เช็คเร็วๆ รอบแรกไม่ต้องรอเต็ม interval ปกติ
    await sleep(resumed ? 1500 : videoPollIntervalMs(Date.now() - pollStartedAt));
    resumed = false;
    if (Date.now() > deadline) {
      const timeoutMin = Math.round(timeoutMs / 60000);
      throw new Error(`หมดเวลารอผลลัพธ์ (${timeoutMin} นาที) — กด "ลองใหม่" เพื่อเช็คงานเดิมต่อได้ค่ะ (ไม่เสียเงินเพิ่ม)`);
    }
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
      const blobUrl = URL.createObjectURL(await vres.blob());
      registerBlobUrl(item.id, blobUrl);
      return blobUrl;
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
  // เสียงไม่มี job id ให้ resume (stream ตรงๆ ผ่าน chat/completions) — ยัง track ไว้ใน ledger เพื่อ "เห็นเป็นงานที่หายไป"
  // แทนที่จะหายเงียบๆ ถ้าปิดแท็บกลางคัน ตอน reconcile จะ resume ไม่ได้ (jobId: null) แล้วโชว์ banner แจ้งแทน
  trackPendingJob(item);
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
  const blobUrl = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "audio/mpeg" }));
  registerBlobUrl(item.id, blobUrl);
  return blobUrl;
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
  let promptText = item.ratio !== "1:1" ? item.prompt + "\n\nAspect ratio: " + item.ratio : item.prompt;
  // negative prompt (PHASE 14) — best-effort hint ต่อท้ายด้วย block ที่คั่นชัดเจน ไม่มี param แยกให้ใช้ใน chat/completions
  if (item.negPrompt?.trim()) promptText += "\n\nAVOID the following: " + item.negPrompt.trim();
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

/**
 * Retry พร้อมเปลี่ยน model/ratio เฉพาะ item นี้ชิ้นเดียว — ไม่แตะ selection ของ Sidebar เลย
 * model ต้องมาจาก modelsForMode(item.mode) เสมอ (โหมดของ item เอง ไม่ใช่ tab ที่เปิดอยู่ตอนนี้)
 * runRequest อ่าน routing (chat/completions vs image-only API vs video vs audio) จาก item.model สดใหม่ทุกครั้งอยู่แล้ว
 * จึงแค่เปลี่ยนฟิลด์ก่อนเรียกซ้ำ ก็ได้ path ที่ถูกต้องสำหรับโมเดลใหม่โดยอัตโนมัติ
 */
export function retryWithOverride(item: GenItem, modelId: string, ratio: string) {
  const model = modelsForMode(item.mode).find(m => m.id === modelId);
  if (!model) { toast("ไม่พบโมเดลนี้ในโหมดของภาพนี้แล้วค่ะ"); return; }
  if (isVideoMode(item.mode) && modelRequiresRefImage(model.id) && !item.refs[0]) {
    toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video) — ภาพนี้ไม่มี ref ที่แนบไว้ตอนสร้าง");
    return;
  }
  // โมเดล/ratio เปลี่ยนไป — jobId เดิม (ถ้ามี) ผูกกับ request เก่า resume ต่อไม่ได้แล้ว ลบออกจาก ledger ทิ้งไปเลย
  // (จะได้ entry ใหม่จาก addPendingJob ตอน submit งานใหม่สำเร็จ)
  removePendingJob(item.id);
  mutate(() => {
    item.jobId = null;
    item.model = model.id;
    item.modelName = model.name || model.id;
    item.ratio = ratio;
    item.status = "loading";
    item.errMsg = "";
    item.jobStatus = "";
    item.startedAt = null;
  });
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
      ...(item.negPrompt ? { negPrompt: item.negPrompt } : {}),
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

// ---------- last-frame auto-extend (โหมด cinematic) ----------
/** กันปุ่ม auto-extend ถูกกดซ้ำระหว่างรอ capture เฟรม (ก่อน item ใหม่จะเข้า gallery เป็น loading) */
const autoExtendInFlight = new Set<number>();
export function isAutoExtending(itemId: number): boolean {
  return autoExtendInFlight.has(itemId);
}

/**
 * "Extend จากเฟรมสุดท้าย" — ทางลัดของ TimeFrame & Extend tool: จับเฟรมท้ายสุดของคลิปนี้แบบ headless
 * (ไม่ต้องเปิด scrubber ให้ผู้ใช้เลือกเอง) แล้วยิง generate scene ถัดไปทันทีด้วย prompt/model/ratio/duration/audio เดิม
 * ใช้ captureVideoFrame เดียวกับกลไกจับเฟรมของ ExtendTool (รวมถึง retry อัตโนมัติเมื่อเจอเฟรมดำ)
 */
export async function autoExtendFromLastFrame(item: GenItem) {
  // isImageDataUrl กัน synthetic root ที่ startFromItem สร้าง (url เป็นภาพนิ่ง ไม่ใช่วิดีโอจริงให้จับเฟรม)
  if (item.mode !== "cinematic" || item.status !== "done" || !item.url || isImageDataUrl(item.url)) return;
  if (autoExtendInFlight.has(item.id)) return;
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }
  if (item.mode !== state.mode) switchMode(item.mode);

  const model = modelsForMode(item.mode).find(m => m.id === item.model);
  if (!model) { toast("ไม่พบโมเดลเดิมของ scene นี้แล้วค่ะ (อาจถูกถอดออกจาก OpenRouter)"); return; }

  autoExtendInFlight.add(item.id);
  mutate(); // broadcast ทันที ให้ปุ่มเปลี่ยนเป็น disabled/"กำลังจับเฟรม…" ระหว่างรอ capture
  try {
    const { dataUrl: frameDataUrl } = await captureVideoFrame(item.url);
    if (dataUrlByteSize(frameDataUrl) > MAX_REF_BYTES) {
      toast(`เฟรมที่จับได้ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ลองใช้ TimeFrame & Extend เลือกเฟรมเองแทนนะคะ`);
      return;
    }
    const ref: RefImage = { kind: "ref", dataUrl: frameDataUrl, name: "เฟรมสุดท้ายจาก scene ก่อนหน้า" };
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
        mode: "cinematic",
        refs: [ref],
        parentId: item.id,
      };
      s.modes.cinematic.images.unshift(newItem);
    });
    runRequest(newItem);
    toast("จับเฟรมสุดท้ายแล้ว กำลังสร้าง scene ถัดไปให้ค่ะ~");
  } catch (e) {
    toast("จับเฟรมสุดท้ายไม่สำเร็จ: " + errMsg(e) + " — ลองใช้ TimeFrame & Extend เลือกเฟรมเองแทนนะคะ");
  } finally {
    autoExtendInFlight.delete(item.id);
    mutate(); // broadcast อีกครั้งให้ปุ่มกลับมากดได้ปกติ
  }
}

// ---------- cinematic storyboard strip ----------
/**
 * ไล่ parentId ของ gallery cinematic ทั้งหมด ประกอบเป็น chain เส้นตรงจากทุก root (parentId: null/undefined)
 * v1 ตั้งใจไม่รองรับ branching: ถ้า item เดียวกันมีลูกมากกว่า 1 ตัว (fork) เลือกลูกที่ id ใหม่สุดมาต่อ chain เท่านั้น
 * ตัวอื่นที่ fork ออกไปจะไม่ถูกนับเป็นส่วนหนึ่งของ chain นี้ (แต่ยังโชว์ใน gallery ปกติตามเดิม ไม่หายไปไหน)
 * เรียงผลลัพธ์เป็น root ใหม่สุดก่อน (ตาม id) ให้ chain ที่กำลังทำงานอยู่ล่าสุดขึ้นบนสุดของ strip
 */
export function cinematicChains(): StoryboardChain[] {
  const images = state.modes.cinematic.images;
  const byId = new Map<number, GenItem>();
  for (const item of images) byId.set(item.id, item);

  const childrenOf = new Map<number, GenItem[]>();
  const roots: GenItem[] = [];
  for (const item of images) {
    if (item.parentId != null && byId.has(item.parentId)) {
      const list = childrenOf.get(item.parentId);
      if (list) list.push(item);
      else childrenOf.set(item.parentId, [item]);
    } else {
      roots.push(item);
    }
  }

  const chains: StoryboardChain[] = roots.map(root => {
    const scenes: GenItem[] = [root];
    let cursor = root;
    // v1 เส้นตรงล้วน — ถ้า fork (ลูกมากกว่า 1) เลือกตัว id ใหม่สุดมาต่อเท่านั้น กัน chain แตกกิ่งในการแสดงผล
    for (;;) {
      const kids = childrenOf.get(cursor.id);
      if (!kids?.length) break;
      const next = kids.reduce((a, b) => (b.id > a.id ? b : a));
      scenes.push(next);
      cursor = next;
    }

    let totalSeconds = 0;
    let totalCost = 0;
    let hasCost = false;
    let hasUnknownCost = false;
    for (const scene of scenes) {
      if (scene.status !== "done") continue;
      totalSeconds += scene.duration || 0;
      const cost = computeItemCost(scene);
      if (cost == null) hasUnknownCost = true;
      else { totalCost += cost; hasCost = true; }
    }

    return { rootId: root.id, scenes, totalSeconds, totalCost: hasCost ? totalCost : null, hasUnknownCost };
  });

  return chains.sort((a, b) => b.rootId - a.rootId);
}

// ---------- multi-select download ----------
// สร้าง Set ใหม่ทุกครั้งที่ toggle (ไม่ mutate ของเดิม) เพื่อให้ referential equality เปลี่ยนตาม membership จริง —
// จำเป็นสำหรับ React.memo comparator ในอนาคตที่จะเทียบ selected ของ Card แต่ละใบ
export function toggleSelect(id: number) {
  mutate(() => {
    const ms = cur();
    const next = new Set(ms.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    ms.selected = next;
  });
}

export function clearSelection() {
  mutate(() => { cur().selected = new Set(); });
}

// ---------- compare mode ----------
/**
 * เงื่อนไขเดียวกับปุ่ม Compare ใน Gallery — ต้อง done แล้ว, มีภาพจริงให้เทียบ (ตัด synthetic root ที่ยังไม่มี url ทิ้ง)
 * และไม่ใช่วิดีโอ/cinematic (เฉพาะเวอร์ชันนี้) หรือเสียง (ไม่มีภาพให้ดูเคียงข้างกันเลย)
 */
export function canCompareItem(item: GenItem): boolean {
  return item.status === "done" && !!item.url && !isVideoMode(item.mode) && item.mode !== "audio";
}

/**
 * เปิด Compare — snapshot รายการที่เลือกไว้ ณ ตอนนี้ (ไม่ live-bind กับ selected set ที่อาจเปลี่ยนต่อระหว่างเปิดโมดัลอยู่)
 * ต้องมี 2–4 ชิ้น และทุกชิ้นผ่าน canCompareItem — caller (Gallery) เป็นคน gate ปุ่มนี้อยู่แล้วแต่เช็คซ้ำกันพลาด
 */
export function openCompare() {
  const ms = cur();
  const items = [...ms.selected]
    .map(id => ms.images.find(x => x.id === id))
    .filter((x): x is GenItem => !!x && canCompareItem(x));
  if (items.length < 2 || items.length > 4) return;
  mutate(s => { s.compareItems = items; });
}

export function closeCompare() {
  mutate(s => { s.compareItems = null; });
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
    // synthetic root ที่ startFromItem สร้าง (ดู isImageDataUrl) เป็น video/cinematic mode แต่ url เป็นภาพนิ่ง — ดาวน์โหลดเป็นภาพตามจริง ไม่ใช่ .mp4
    if (isVideoMode(item.mode) && !isImageDataUrl(item.url)) {
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
  // synthetic root ที่ startFromItem สร้างเป็น video/cinematic mode แต่ url เป็นภาพนิ่ง — ตกไปที่ path แปลง/ดาวน์โหลดเป็นภาพด้านล่างแทน
  if ((isVideoMode(item.mode) && !isImageDataUrl(item.url)) || item.mode === "audio") {
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
/**
 * คำนวณราคาประเมินของงานหนึ่งชิ้น (ไม่คูณ count) — ใช้ร่วมกันทั้ง GenItem ที่ done แล้ว (usage bar)
 * และ QueueJob ที่ยังไม่ยิง (queue cost preview) เพราะทั้งคู่มีฟิลด์ที่ใช้คำนวณเหมือนกัน (model/audio/duration)
 * คืน null เมื่อคำนวณราคาไม่ได้ (เช่น pricing แบบ token-based) — ห้าม caller ตีความ null เป็น 0
 */
function computeCost(mode: Mode, model: string, audio: boolean, duration: number): number | null {
  if (mode === "audio") return AUDIO_MODEL_PRICES[model] ?? null;
  if (isVideoMode(mode)) {
    const m = state.videoModels.find(x => x.id === model);
    if (!m) return null;
    const pps = videoPricePerSec(m, audio);
    return pps != null ? pps * duration : null;
  }
  const m = state.models.find(x => x.id === model);
  const price = m?.pricing?.image ? parseFloat(m.pricing.image) : NaN;
  return price > 0 ? price : null;
}

export function computeItemCost(item: GenItem): number | null {
  return computeCost(item.mode, item.model, item.audio, item.duration);
}

/** ราคาประเมินของ 1 job ในคิว × count — mode คือโหมดปัจจุบัน (QueueJob ไม่มีฟิลด์ mode ของตัวเอง) */
export function computeQueueJobCost(mode: Mode, job: QueueJob): number | null {
  const unit = computeCost(mode, job.model, job.audio, job.duration);
  return unit != null ? unit * job.count : null;
}

// ---------- export / import session ----------
/**
 * เวอร์ชันของ export format — v1 (เดิม): history อาจเป็น string[] ล้วน ไม่มี timestamp/pin
 * v2: history เป็น HistoryEntry[] เสมอ (มี at + pinned จาก PHASE 1)
 * v3 (ปัจจุบัน): เพิ่ม negPrompt ต่อโหมด (PHASE 14) — bump ตอนที่เพิ่ม field ระดับนี้เข้าไปใน export จริง
 * ไฟล์ v1/v2 เก่ายัง import ได้ปกติ (negPrompt undefined = ไม่มีค่าเดิมให้กู้ ไม่ใช่ error)
 */
const SESSION_VERSION = 3;

/** field ต่อโหมดที่ build นี้รู้จักและอ่าน/เขียนเองตรงๆ — ที่เหลือถือเป็น "unknown field" เก็บ round-trip ไว้เฉยๆ */
const KNOWN_MODE_FIELDS = new Set(["prompt", "ratio", "count", "duration", "audio", "queue", "history", "negPrompt"]);

/**
 * ประกอบ session data object ตัวเดียวกันทุกครั้งที่ต้อง serialize สถานะปัจจุบัน — ใช้ร่วมกันทั้ง exportSession
 * (ดาวน์โหลดไฟล์จริง) และ autosaveSessionSnapshot (PHASE 15 — เขียนลง localStorage เงียบๆ ทุก ~30s) เพื่อไม่ให้
 * สอง path เขียน schema เพี้ยนไปคนละแบบ — label เป็น field top-level ใหม่ (PHASE 15) เก็บ label ที่ผู้ใช้พิมพ์เอง
 * ตอน export มือ (undefined ตอน autosave snapshot เพราะไม่มีช่องให้พิมพ์)
 */
function buildSessionData(label?: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    atelier_session: SESSION_VERSION,
    exportedAt: new Date().toISOString(),
    modes: {} as Record<string, unknown>,
  };
  if (label) data.label = label;
  const modes: Record<string, unknown> = {};
  for (const mode of Object.keys(state.modes) as Mode[]) {
    const s = state.modes[mode];
    modes[mode] = {
      // field ที่ build นี้ไม่รู้จักจากไฟล์ที่เคย import มาก่อนหน้านี้ — เขียนกลับไปเฉยๆ กัน forward-compat data หาย
      ...(state.importUnknownFields[mode] ?? {}),
      prompt: s.prompt,
      ratio: s.ratio,
      count: s.count,
      duration: s.duration,
      audio: s.audio,
      // ตัด refs ออก — data URL ใหญ่มาก และคง format ให้เข้ากันได้กับ export เดิม
      queue: s.queue.map(({ refs: _refs, ...q }) => q),
      history: s.history,
      negPrompt: s.negPrompt,
    };
  }
  data.modes = modes;
  return data;
}

/** สรุปสั้นๆ ต่อโหมดที่ "มีข้อมูลจริง" ตอน export — ใช้โชว์ในประวัติ Export ของ Header ("Home: 3 · Video: 1") */
function sessionModeSummary(): string {
  const parts: string[] = [];
  for (const mode of Object.keys(state.modes) as Mode[]) {
    const s = state.modes[mode];
    const count = s.history.length + s.queue.length + (s.prompt.trim() ? 1 : 0);
    if (count > 0) parts.push(`${modeLabel(mode)}: ${count}`);
  }
  return parts.length ? parts.join(" · ") : "ไม่มีข้อมูล";
}

/** เก็บเฉพาะ metadata ต่อโหมด (prompt, settings, queue, history) — ไม่รวมรูป/วิดีโอ เพราะเป็น data URL ใหญ่มาก
 * label (optional) — ข้อความที่ผู้ใช้พิมพ์กำกับไฟล์นี้เอง (ดู ExportLabelControl ใน Header.tsx) — "" /ไม่กรอก = ไม่แนบ field นี้เลย
 */
export function exportSession(label?: string) {
  const data = buildSessionData(label?.trim() || undefined);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const filename = "atelier-session.json";
  triggerDownload(href, filename);
  URL.revokeObjectURL(href);
  addExportLogEntry({
    label: label?.trim() || "",
    filename,
    at: Date.now(),
    modeSummary: sessionModeSummary(),
  });
  toast("Export session แล้วค่ะ");
}

// ---------- session snapshot autosave (PHASE 15) ----------
// คนละเรื่องกับ "Auto Save" (เซฟไฟล์ผลลัพธ์ลงเครื่องผ่าน File System Access API — ดู fsAccess.ts/AutoSaveControl)
// อันนี้เป็น "บันทึกเซสชันอัตโนมัติ" — เขียน metadata เดียวกับ exportSession ทับ localStorage ช่องเดียวทุก ~30s
// เงียบๆ ไม่ต้องกดอะไร ให้กู้คืนได้ถ้าแท็บถูกปิด/crash กะทันหันโดยไม่ได้ export มือ
let lastSnapshotJson: string | null = null;

/** เรียกจาก interval ใน StudioApp.tsx ทุก SESSION_SNAPSHOT_INTERVAL_MS และตอน beforeunload อีกครั้งนอกจังหวะ interval
 * เขียนเฉพาะตอนที่ serialize แล้วต่างจากครั้งก่อนจริงๆ (เทียบ JSON string ตรงๆ — เรียบง่ายพอสำหรับ payload ขนาดนี้
 * ไม่ต้อง deep-diff เอง) กัน localStorage ถูกเขียนทับรัวๆ โดยไม่มีอะไรเปลี่ยนเลย
 */
export function autosaveSessionSnapshot() {
  const json = JSON.stringify(buildSessionData());
  if (json === lastSnapshotJson) return;
  lastSnapshotJson = json;
  saveSessionSnapshotRaw(json);
}

type ImportModeData = {
  prompt?: unknown; ratio?: unknown; count?: unknown; duration?: unknown; audio?: unknown;
  queue?: unknown; history?: unknown; negPrompt?: unknown;
  [k: string]: unknown;
};
type ImportFileShape = { atelier_session?: unknown; modes?: Record<string, ImportModeData> };

/** ตรวจรูปร่างไฟล์คร่าวๆ พอรู้ว่าเป็นไฟล์ session ของ Atelier จริงไหม — ไม่ throw คืน null ถ้าไม่ใช่ */
function parseSessionFile(raw: unknown): ImportFileShape | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as ImportFileShape;
  if (!d.modes || typeof d.modes !== "object") return null;
  return d;
}

/**
 * เทียบไฟล์ที่จะ import กับ state ปัจจุบัน แล้วสรุปเป็น preview ให้ผู้ใช้เห็นก่อนกด Replace/Merge จริง
 * newHistoryCount: entry ในไฟล์ที่ไม่มีอยู่ใน history ปัจจุบันเลย (เทียบด้วย text) — ใช้ทั้งสองปุ่ม preview เดียวกัน
 * queueMergeCount: จำนวนงานในคิวของไฟล์ที่ "จะ" ถูกรวมเพิ่มจริงถ้ากด Merge (union ไม่เกิน MAX_QUEUE)
 */
function diffImportSession(file: ImportFileShape): ImportPreview {
  const fileVersion = typeof file.atelier_session === "number" ? file.atelier_session : 1;
  const perMode: ImportDiffPerMode[] = [];
  for (const mode of Object.keys(state.modes) as Mode[]) {
    const m = file.modes?.[mode];
    if (!m || typeof m !== "object") { perMode.push({ mode, newHistoryCount: 0, promptWillChange: false, queueMergeCount: 0 }); continue; }
    const s = state.modes[mode];

    const fileHistory = Array.isArray(m.history) ? migrateHistoryList(m.history) : [];
    const existingTexts = new Set(s.history.map(e => e.text));
    const newHistoryCount = fileHistory.filter(e => !existingTexts.has(e.text)).length;

    const promptWillChange =
      (typeof m.prompt === "string" && m.prompt !== s.prompt) ||
      (typeof m.ratio === "string" && m.ratio !== s.ratio) ||
      (typeof m.count === "number" && m.count !== s.count) ||
      (typeof m.duration === "number" && m.duration !== s.duration) ||
      (typeof m.audio === "boolean" && m.audio !== s.audio) ||
      (typeof m.negPrompt === "string" && m.negPrompt !== s.negPrompt);

    const fileQueue = Array.isArray(m.queue) ? (m.queue as QueueJob[]) : [];
    const roomLeft = Math.max(0, MAX_QUEUE - s.queue.length);
    const queueMergeCount = Math.min(fileQueue.length, roomLeft);

    perMode.push({ mode, newHistoryCount, promptWillChange, queueMergeCount });
  }
  return { fileVersion, perMode };
}

/** เลือกไฟล์ import — parse + คำนวณ diff แล้วเปิดโมดัลให้เลือก Replace/Merge เสมอ ไม่มีการ commit ใดๆ จนกว่าจะกดยืนยัน */
export function importSession(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(reader.result));
    } catch {
      toast("ไฟล์ไม่ใช่ JSON ที่ถูกต้องค่ะ");
      return;
    }
    const parsed = parseSessionFile(raw);
    if (!parsed) {
      toast("ไฟล์นี้ไม่ใช่ session ของ Atelier ค่ะ");
      return;
    }
    const preview = diffImportSession(parsed);
    mutate(s => { s.importPending = { raw: parsed, preview }; });
  };
  reader.onerror = () => toast("อ่านไฟล์ไม่สำเร็จค่ะ");
  reader.readAsText(file);
}

export function cancelImport() {
  mutate(s => { s.importPending = null; });
}

/** "Replace" — พฤติกรรมเดิมเป๊ะๆ: เขียนทับ prompt/settings/queue/history ทั้งหมดของทุกโหมดที่ไฟล์มีข้อมูล */
export function commitImportReplace() {
  const pending = state.importPending;
  if (!pending) return;
  const d = pending.raw as ImportFileShape;
  mutate(s => {
    for (const mode of Object.keys(state.modes) as Mode[]) {
      const m = d.modes?.[mode];
      if (!m || typeof m !== "object") continue;
      const ms = state.modes[mode];
      if (typeof m.prompt === "string") ms.prompt = m.prompt;
      if (typeof m.ratio === "string") ms.ratio = m.ratio;
      if (typeof m.count === "number") ms.count = m.count;
      if (typeof m.duration === "number") ms.duration = m.duration;
      if (typeof m.audio === "boolean") ms.audio = m.audio;
      // negPrompt (PHASE 14) เฉพาะโหมดภาพเท่านั้นที่มีผล แต่ยังรับค่าเก็บไว้ได้ทุกโหมด (ไม่ตีความ ไม่กระทบ mode อื่น)
      if (typeof m.negPrompt === "string") ms.negPrompt = m.negPrompt;
      // ref images เป็น memory-only โดยตั้งใจ — ตัดออกจาก queue ที่ import มา (ถ้าไฟล์มีติดมา)
      if (Array.isArray(m.queue)) {
        ms.queue = (m.queue as QueueJob[]).slice(0, MAX_QUEUE).map(q => ({ ...q, refs: [] }));
      }
      if (Array.isArray(m.history)) {
        // รองรับทั้งไฟล์ session เก่า (string[]) และใหม่ (HistoryEntry[]) ด้วย migration function เดียวกับตอนอ่าน localStorage
        ms.history = migrateHistoryList(m.history).slice(0, MAX_HISTORY);
        saveHistory(mode);
      }
      // เก็บ field ที่ build นี้ไม่รู้จักไว้ round-trip กลับตอน export ครั้งถัดไป (ดู KNOWN_MODE_FIELDS/exportSession)
      const unknown: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) if (!KNOWN_MODE_FIELDS.has(k)) unknown[k] = v;
      s.importUnknownFields[mode] = unknown;
    }
    applyVideoCapabilities();
    s.importPending = null;
  });
  // ไม่ว่าไฟล์นี้จะมาจาก "กู้คืนบันทึกเซสชันอัตโนมัติ" หรือไฟล์จริงที่ผู้ใช้เลือกเอง — ข้อมูลที่ import ไปแล้วถือว่า
  // ถูกดูดเข้า state ปัจจุบันแล้ว ไม่ต้องเก็บ snapshot เดิมไว้เตือนซ้ำอีกตอน reload รอบหน้า
  clearSessionSnapshot();
  toast("Import session แล้วค่ะ (แทนที่ทั้งหมด)");
}

/**
 * "Merge" — เพิ่ม history entry ใหม่เข้าไปต่อท้าย (ไม่ทับของเดิม, ไม่ทับที่ text ซ้ำกัน), คง prompt/ratio/count/duration/audio
 * ปัจจุบันไว้ตามเดิม (ไม่แตะเลย), และ union คิวเข้าไปจนเต็ม MAX_QUEUE (ของเดิมมาก่อนเสมอ ของใหม่เติมเท่าที่ยังมีที่ว่าง)
 */
export function commitImportMerge() {
  const pending = state.importPending;
  if (!pending) return;
  const d = pending.raw as ImportFileShape;
  mutate(s => {
    for (const mode of Object.keys(state.modes) as Mode[]) {
      const m = d.modes?.[mode];
      if (!m || typeof m !== "object") continue;
      const ms = state.modes[mode];

      if (Array.isArray(m.history)) {
        const incoming = migrateHistoryList(m.history);
        const existingTexts = new Set(ms.history.map(e => e.text));
        // entry ใหม่ที่ merge เข้ามาได้ seq ใหม่ของ session นี้ (ใหม่กว่าของเดิมเสมอ) แต่คง pinned ของไฟล์ไว้
        const merged = [
          ...ms.history,
          ...incoming.filter(e => !existingTexts.has(e.text)).map(e => ({ ...e, at: nextHistorySeq() })),
        ];
        // ตัดเกิน cap จากท้ายสุด (เก่าสุดก่อน) แต่ไม่แตะ pinned — เหมือน addToHistory
        merged.sort((a, b) => b.at - a.at);
        if (merged.length > MAX_HISTORY) {
          for (let i = merged.length - 1; i >= 0 && merged.length > MAX_HISTORY; i--) {
            if (!merged[i].pinned) merged.splice(i, 1);
          }
        }
        ms.history = merged;
        saveHistory(mode);
      }

      if (Array.isArray(m.queue)) {
        const roomLeft = Math.max(0, MAX_QUEUE - ms.queue.length);
        const incomingQueue = (m.queue as QueueJob[]).slice(0, roomLeft).map(q => ({ ...q, refs: [] }));
        ms.queue = [...ms.queue, ...incomingQueue];
      }

      // เก็บ field ที่ไม่รู้จักไว้ round-trip เหมือนกับ Replace — merge ไม่ทับของเดิมถ้ามีอยู่แล้ว
      const unknown: Record<string, unknown> = { ...(s.importUnknownFields[mode] ?? {}) };
      for (const [k, v] of Object.entries(m)) if (!KNOWN_MODE_FIELDS.has(k) && !(k in unknown)) unknown[k] = v;
      s.importUnknownFields[mode] = unknown;
    }
    applyVideoCapabilities();
    s.importPending = null;
  });
  clearSessionSnapshot(); // เหตุผลเดียวกับ commitImportReplace — ข้อมูลถูกรวมเข้า state แล้ว ไม่ต้องเตือนซ้ำ
  toast("Import session แล้วค่ะ (รวมเข้าของเดิม)");
}

// ---------- assist model (Optimizer / Chat / Grill me) ----------
/**
 * รายชื่อโมเดลที่เลือกเป็น "assist model" ได้ — ต้องเป็นโมเดล text-capable (รับ/ตอบข้อความผ่าน chat/completions ได้)
 * ใช้ state.models (list เดียวกับโหมด Home) กรองเอาตัวที่ output_modalities มี "text" — ไม่ดึง list แยกใหม่
 * เพราะ OpenRouter ไม่มี endpoint แยกสำหรับ "text-only models" และ list นี้โหลดอยู่แล้วตั้งแต่ boot
 */
export function assistModelOptions(): ORModel[] {
  return state.models.filter(m => (m.architecture?.output_modalities || []).includes("text"));
}

export function setAssistModelId(id: string | null) {
  mutate(s => { s.assistModelId = id; });
  saveAssistModelId(id);
  toast(id ? "ตั้งโมเดลผู้ช่วย AI เป็น " + id + " แล้วค่ะ" : "กลับไปใช้โมเดลผู้ช่วย AI เริ่มต้นแล้วค่ะ");
}

/** true ถ้าเคย toast แจ้ง fallback ไปแล้วอย่างน้อยหนึ่งครั้งใน session นี้ — กันเตือนซ้ำทุกครั้งที่โมเดลที่เลือกไว้ถูกถอด */
let assistFallbackWarned = false;

const isNotFoundStatus = (status: number) => status === 404 || status === 410;
const isRateLimitStatus = (status: number) => status === 429;

/**
 * เรียก chat/completions แบบใช้ร่วมกันทั้ง Optimizer/Chat/Grill me — จัดการ override โมเดลผู้ใช้ + fallback + retry ให้ที่เดียว:
 * - โมเดลที่เลือกไว้ (assistModelId) ถูกใช้ก่อนเสมอถ้ามี ไม่งั้น fallback ตรง (โมเดล hardcode ของ feature นั้น)
 * - 404/410 (โมเดลถูกถอด/เปลี่ยนชื่อ) → retry ครั้งเดียวด้วย fallback ตรง แล้ว toast แจ้งครั้งแรกของ session เท่านั้น
 * - 429 (rate limit) → retry โมเดลเดิม (ไม่สลับ) พร้อม backoff สั้นๆ สูงสุด ASSIST_RATE_LIMIT_RETRIES ครั้ง
 * คืนค่า content string ของคำตอบ — โยน error ถ้าทุกทางเลือกล้มเหลวหมด
 */
async function callAssistLLM(fallbackModel: string, messages: { role: string; content: string }[]): Promise<string> {
  const primaryModel = state.assistModelId || fallbackModel;

  const attemptOnce = async (model: string): Promise<{ ok: true; content: string } | { ok: false; status: number; message: string }> => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, message: data.error?.message || ("HTTP " + res.status) };
    }
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) return { ok: false, status: res.status, message: "โมเดลไม่ตอบข้อความกลับมาค่ะ" };
    return { ok: true, content: String(reply).trim() };
  };

  // retry รอบ rate-limit ของโมเดลหลักก่อน — คนละ path จาก fallback ตอนโมเดลหาย ต้องไม่สลับโมเดลระหว่างนี้
  let lastError = "";
  for (let attempt = 0; attempt <= ASSIST_RATE_LIMIT_RETRIES; attempt++) {
    const result = await attemptOnce(primaryModel);
    if (result.ok) return result.content;
    lastError = result.message;
    if (isRateLimitStatus(result.status) && attempt < ASSIST_RATE_LIMIT_RETRIES) {
      await sleep(ASSIST_RATE_LIMIT_BACKOFF_MS * (attempt + 1));
      continue;
    }
    if (isNotFoundStatus(result.status) && primaryModel !== fallbackModel) {
      // โมเดลที่เลือกไว้หาย/ถูกเปลี่ยนชื่อ — retry ครั้งเดียวด้วย fallback ตรง แล้วแจ้งเตือนครั้งแรกของ session
      const fallbackResult = await attemptOnce(fallbackModel);
      if (fallbackResult.ok) {
        if (!assistFallbackWarned) {
          assistFallbackWarned = true;
          toast(`โมเดลผู้ช่วย AI ที่ตั้งไว้ (${primaryModel}) ไม่พร้อมใช้งานแล้ว (${result.message}) — สลับไปใช้ ${fallbackModel} ให้ชั่วคราวค่ะ`);
        }
        return fallbackResult.content;
      }
      throw new Error(fallbackResult.message);
    }
    break; // error อื่นๆ (400/500/ฯลฯ) ไม่ retry ไม่ fallback — โยนออกไปตรงๆ
  }
  throw new Error(lastError);
}

/**
 * normalize รายการที่โมเดลแนะนำมาเป็น ExplainedItem เดียวกันเสมอ — รองรับทั้ง plain string เดิม และ shape ใหม่
 * {text/prompt/keyword, why} เพราะโมเดล free-tier ตอบไม่คงเส้นคงวา บาง element ในอาเรย์เดียวกันอาจเป็นคนละ shape
 * คืน null ถ้า element นี้ใช้ไม่ได้เลย (ไม่ใช่ string และไม่มี field ข้อความที่รู้จัก)
 */
function asExplainedItem(x: unknown, textKey = "text"): ExplainedItem | null {
  if (typeof x === "string") {
    const t = x.trim();
    return t ? { text: t } : null;
  }
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const rawText = o[textKey] ?? o.text ?? o.keyword ?? o.prompt;
    if (typeof rawText !== "string" || !rawText.trim()) return null;
    const rawWhy = o.why;
    return typeof rawWhy === "string" && rawWhy.trim() ? { text: rawText.trim(), why: rawWhy.trim() } : { text: rawText.trim() };
  }
  return null;
}

// ---------- prompt optimizer ----------
/** เอ่ยชนิด ref ที่แนบอยู่เป็นภาษาอังกฤษสั้นๆ ให้ Optimizer รู้ว่ามีภาพอ้างอิงอยู่แล้ว จะได้แนะนำแบบต่อยอด ไม่ใช่เขียนใหม่ทั้งดุ้นราวกับไม่มีอะไรอยู่เลย */
function refKindsSummary(): string | null {
  const kinds = new Set(cur().refs.map(r => r.kind));
  if (!kinds.size) return null;
  const labels = REF_KINDS.filter(rk => kinds.has(rk.kind)).map(rk => rk.label + " (" + rk.hint + ")");
  return labels.join(", ");
}

export async function runOptimize() {
  const original = cur().prompt.trim();
  if (!original || state.optimize.status === "loading") return;
  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }

  mutate(s => { s.optimize = { status: "loading", result: null, error: "" }; });

  const modeName = state.mode === "audio" ? "music generation"
    : state.mode === "cinematic" ? "cinematic video generation (scenes that continue from a previous shot)"
    : state.mode === "video" ? "video generation"
    : state.mode === "infographic" ? "infographic generation" : "image generation";

  let contextNotes = "";
  const refSummary = refKindsSummary();
  if (refSummary) {
    contextNotes += " The user already has reference image(s) attached: " + refSummary + ". "
      + "Suggest changes relative to these references (what to add/change/keep) rather than rewriting the prompt as if there were no references at all.";
  }
  if (isVideoMode(state.mode)) {
    const m = currentModel();
    if (m?.supported_durations?.length) {
      contextNotes += " The selected model supports these durations in seconds: " + m.supported_durations.join(", ") + ".";
    }
    if (!m?.generate_audio) {
      contextNotes += " The selected model CANNOT generate audio — do not suggest audio/sound/music/dialogue keyword phrasing.";
    } else {
      contextNotes += " The selected model can generate audio, so sound/dialogue/music keyword phrasing is fine if relevant.";
    }
  }

  const sys = "You are a prompt engineer helping a user write better prompts for AI " + modeName + ". "
    + "Given the user's rough prompt, rewrite it into a more detailed, vivid, well-structured prompt in English "
    + "(keep any names/subjects the user specified)." + contextNotes + " Also suggest 6-10 short keyword phrases (style, lighting, "
    + "composition, mood, etc.) the user could add, each with a short one-line reason why. Respond with ONLY valid JSON, no markdown fences, in this exact shape: "
    + '{"prompt": "...", "keywords": [{"text": "...", "why": "..."}, ...]}';

  try {
    const raw = await callAssistLLM(OPTIMIZER_MODEL, [
      { role: "system", content: sys },
      { role: "user", content: original },
    ]);
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    let parsed: { prompt?: unknown; keywords?: unknown };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("แปลผลลัพธ์จากโมเดลไม่สำเร็จค่ะ ลองกด Optimize ใหม่อีกครั้งนะคะ");
    }
    const optPrompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map(k => asExplainedItem(k, "text")).filter((k): k is ExplainedItem => k !== null)
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

const CHAT_PROMPT_CONTEXT_LEN = 300;

/** ตัด prompt ให้สั้นลงที่ขอบคำ (ไม่ตัดกลางคำ) — คืนค่าเดิมถ้าไม่เกินความยาวที่กำหนดอยู่แล้ว */
function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

// จับคำถามแนว "ควรใช้โมเดลไหนดี" ด้วย regex ล้วน (ไม่ยิง LLM เพิ่ม) — ไทย+อังกฤษ, case-insensitive
// แค่ "hit หรือไม่" เท่านั้น พลาดแล้วต้อง fallback กลับพฤติกรรมเดิมเป๊ะๆ ไม่มี error ไม่มีผลข้างเคียง
const MODEL_RECOMMEND_PATTERNS: RegExp[] = [
  /which model/i,
  /what model/i,
  /recommend.{0,15}model/i,
  /model.{0,15}recommend/i,
  /best model/i,
  /โมเดลไหนดี/i,
  /โมเดล.{0,10}ไหนดี/i,
  /model.{0,10}ไหนดี/i,
  /แนะนำโมเดล/i,
  /โมเดลอะไรดี/i,
  /ใช้โมเดลไหน/i,
  /เลือกโมเดลไหน/i,
];

function looksLikeModelRecommendQuestion(text: string): boolean {
  return MODEL_RECOMMEND_PATTERNS.some(re => re.test(text));
}

const MODEL_DIGEST_CAP = 20;

/** โน้ตความสามารถสั้นๆ ต่อโมเดล — reuse helper ที่มีอยู่แล้ว (refSupportLevel/isVideoMode/generate_audio) ไม่เดาเอง */
function modelCapabilityNote(mode: Mode, model: ORModel): string {
  const notes: string[] = [];
  if (mode === "audio") {
    notes.push("สร้างเพลง/เสียงดนตรี");
  } else if (isVideoMode(mode)) {
    notes.push("วิดีโอเท่านั้น");
    if (modelRequiresRefImage(model.id)) notes.push("ต้องแนบภาพอ้างอิงก่อน generate (image-to-video ล้วน)");
    if (model.generate_audio) notes.push("ใส่เสียงในคลิปได้");
  } else {
    const level = refSupportLevel(mode, model);
    if (level === "optional") notes.push("รองรับภาพอ้างอิง");
    else if (level === "none") notes.push("ไม่รองรับภาพอ้างอิง");
  }
  return notes.join(", ");
}

/**
 * digest รายชื่อโมเดลของโหมดที่ user เปิดอยู่ตอนนี้ (ไม่ใช่โหมดที่ chat คุยอยู่เสมอไป — global chat คนละเรื่องกับ tab)
 * ใช้ตอบคำถาม "โมเดลไหนดี" เท่านั้น — inject เข้า system prompt แค่ turn นี้ turn เดียว ไม่ persist ลง chatMessages
 */
function buildModelDigest(mode: Mode): string {
  const list = modelsForMode(mode).slice(0, MODEL_DIGEST_CAP);
  if (!list.length) return "";
  const lines = list.map(m => {
    const note = modelCapabilityNote(mode, m);
    return "- " + m.id + (m.name ? " (" + m.name + ")" : "") + (note ? " — " + note : "");
  });
  return "\n\nCurrent model catalog for the \"" + modeLabel(mode) + "\" tab (up to " + MODEL_DIGEST_CAP + " shown):\n"
    + lines.join("\n")
    + "\n\nWhen answering, explicitly state that this list is drawn from the \"" + modeLabel(mode)
    + "\" tab's catalog (e.g. \"ตามรายการโมเดลใน " + modeLabel(mode) + " mode ตอนนี้...\"), "
    + "since the user could be asking about a different mode than the one they're currently viewing. "
    + "Recommend specific model id(s) from this list based on what the user needs.";
}

function chatSystemPrompt(userMessage?: string): string {
  const ms = cur();
  let context = "";
  const promptText = ms.prompt.trim();
  if (promptText) {
    context += " The user's current prompt draft in the \"" + modeLabel(state.mode) + "\" tab is: \""
      + truncateAtWordBoundary(promptText, CHAT_PROMPT_CONTEXT_LEN) + "\".";
  }
  const lastItem = ms.images[0];
  if (lastItem && lastItem.status === "error") {
    context += " Their most recent generation attempt in this tab failed on model \"" + lastItem.model
      + "\" with error: \"" + lastItem.errMsg + "\". If relevant, help them understand or work around this.";
  }
  const digest = userMessage && looksLikeModelRecommendQuestion(userMessage) ? buildModelDigest(state.mode) : "";
  return "You are the in-app assistant for Atelier, an AI media studio built on OpenRouter that generates images, infographics, videos and music. "
    + "You help the user brainstorm ideas, design prompts (style, lighting, composition, mood, camera work, musical genre and instrumentation), "
    + "and give practical advice about generating images, videos and music with AI models. "
    + "The user is currently in the \"" + modeLabel(state.mode) + "\" tab of the app "
    + "(General = images, Infographic = infographic images, Video = short video clips, "
    + "Cinematic = video scenes that can be extended frame-to-frame into a continuing story, Audio = songs/music)."
    + context + " "
    + "Keep answers concise and practical. When useful, suggest a ready-to-use prompt. Respond in the same "
    + "language the user writes in (Thai or English). " + ANTI_SLOP_RULES + digest;
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
    const reply = await callAssistLLM(CHAT_MODEL, [
      { role: "system", content: chatSystemPrompt(t) },
      ...state.chatMessages.map(m => ({ role: m.role, content: m.content })),
    ]);
    mutate(s => { s.chatMessages.push({ role: "assistant", content: reply }); });
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
    + '{"done": true, "prompts": [{"title": "ชื่อมุมมองสั้นๆ ภาษาไทย", "prompt": "detailed English prompt", "why": "เหตุผลสั้นๆ ว่าทำไมมุมมองนี้น่าลอง"}]} '
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
  const prompts: GrillPrompt[] = [];
  for (const raw of parsed.prompts as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as { title?: unknown; prompt?: unknown; why?: unknown };
    const title = typeof p.title === "string" ? p.title.trim() : "";
    const prompt = typeof p.prompt === "string" ? p.prompt.trim() : "";
    if (!title || !prompt) continue;
    const why = typeof p.why === "string" && p.why.trim() ? p.why.trim() : undefined;
    prompts.push(why ? { title, prompt, why } : { title, prompt });
  }
  const capped = prompts.slice(0, 5);
  return capped.length ? capped : null;
}

async function callGrillLLM(messages: ChatMsg[]): Promise<string> {
  return callAssistLLM(GRILL_MODEL, [
    { role: "system", content: grillSystemPrompt() },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]);
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
      ...(negPromptSupportedFor(state.mode, m) && ms.negPrompt.trim() ? { negPrompt: ms.negPrompt.trim() } : {}),
    });
  });
  toast(`เพิ่ม "${p.title}" เข้าคิวแล้วค่ะ (${ms.queue.length}/${MAX_QUEUE})`);
}
