import {
  ASSIST_RATE_LIMIT_BACKOFF_MS, ASSIST_RATE_LIMIT_RETRIES,
  AUDIO_EXTRA_MODELS, AUDIO_MODEL_IDS, AUDIO_MODEL_PRICES,
  BUILTIN_TEMPLATES, CHAT_MODEL, DURATIONS, EXTRA_MODELS, GRILL_MODEL,
  MAX_BAKE_OFF_MODELS, MAX_CHAT_HISTORY, MAX_CONCURRENT_REQUESTS, MAX_GRILL_QUESTIONS, MAX_HISTORY, MAX_QUEUE,
  MAX_REFS_PER_KIND, MAX_REF_BYTES, MAX_USER_TEMPLATES, MIN_GRILL_QUESTIONS, MODE_MODEL_FILTER, modelRequiresRefImage,
  NANO_BANANA_ALLOWED_IDS, NANO_BANANA_ID_PATTERN, OPTIMIZER_MODEL, PREFERRED,
  RATIOS, REF_KINDS, TTS_EXTRA_MODELS, TTS_FALLBACK_VOICES, TTS_MODEL_IDS, VIDEO_MODEL_IDS,
  VIDEO_POLL_MS, VIDEO_POLL_MS_HIDDEN, VIDEO_POLL_MS_MAX, VIDEO_RESOLUTION, videoTimeoutMsForModel, isNegativePromptMode, isVideoMode, modeLabel,
} from "./constants";
import {
  AutoSavePermissionError, autoSaveBlob, forgetAutoSaveDir, fsAccessSupported, isAutoSaveDirConnected, peekSavedDirName,
  pickAutoSaveDir, reconnectAutoSaveDir, urlToBlob,
} from "./fsAccess";
import { connectDrive as gdriveConnect, disconnectDrive as gdriveDisconnect, DrivePermissionError, isDriveConfigured, isDriveConnected, uploadToDrive } from "./googleDrive";
import { registerBlobUrl, releaseBlobUrls } from "./blobUrls";
import { deleteItem, isGalleryPersistEnabled, loadItems, onGalleryPersistDisabled, saveItem, setFavorite } from "./galleryStore";
import { beginNotifyBatch, dropFromNotifyBatch, notifyJobSettled, requestNotifyPermissionOnce } from "./notify";
import { SYSTEM_DARK, SYSTEM_LIGHT } from "./themes";
import {
  addExportLogEntry, addPendingJob, applyThemeAttr, bumpGalleryMaxId, clearGalleryMaxId, clearSessionSnapshot, consumeQueueNonEmptyFlag, cur, favoriteKeyOf, loadFavorites, loadFavoriteStamps, saveFavoriteStamps, MAX_FAVORITES_PER_MODE,
  freshSpendLedger, loadGalleryMaxId, loadPendingJobs, loadSessionSnapshotRaw, migrateHistoryList, mutate, nextHistorySeq,
  PROMPT_PLACEMENT_KEY, removePendingJob, saveAssistModelId, saveChatHistory, saveFavorites, saveHistory, saveLocale, saveSessionSnapshotRaw,
  saveSpendLedger, saveTheme, saveUserExtraModels, saveUserTemplates, state, toast, writeLocalStorage,
} from "./store";
import type { AppState, CancelReason, ChatMsg, ExplainedItem, GenItem, GrillPrompt, HistoryEntry, ImportDiffPerMode, ImportPreview, InfographicPreset, Locale, Mode, ORModel, PendingJobEntry, PromptPlacement, PromptTemplate, QueueJob, RefImage, RefKind, RefSupportLevel, ResolvedThemeId, SpendConfirmRequest, SpendLedger, StoryboardChain, ThemeId, TtsVoice } from "./types";
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
  if (mode === "tts") return state.speechModels;
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
      (!m.id.startsWith("openai/") || m.id === "openai/gpt-image-2" || m.id === "openai/gpt-image-2.5-flare") &&
      // ตระกูล Nano Banana (Google Gemini image-gen): จำกัดเหลือแค่ 2 ตัวใน NANO_BANANA_ALLOWED_IDS เท่านั้น
      // (เติมกลับผ่าน EXTRA_MODELS ด้านล่างถ้า OpenRouter ยังไม่ list เอง) — กันรุ่น/preview อื่นโผล่มาเพิ่ม
      (!NANO_BANANA_ID_PATTERN.test(m.id) || NANO_BANANA_ALLOWED_IDS.includes(m.id))
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
    // โมเดล TTS (Gemini 3.1 Flash TTS) มาจาก fetch เดียวกัน — คัดตาม allowlist + เติม fallback ถ้ายังไม่ list
    // (ยังไม่ list ใน /api/v1/models จริงตอนเขียนโค้ดนี้ — ทั้ง list นี้จึงมาจาก TTS_EXTRA_MODELS ล้วนๆ ตอนนี้)
    const speechList: ORModel[] = fetched.filter(m => TTS_MODEL_IDS.includes(m.id));
    for (const em of TTS_EXTRA_MODELS) {
      if (!speechList.some(m => m.id === em.id)) speechList.push(em);
    }
    speechList.sort((a, b) => TTS_MODEL_IDS.indexOf(a.id) - TTS_MODEL_IDS.indexOf(b.id));
    // โมเดลที่ผู้ใช้เพิ่มเองผ่าน SettingsModal — merge ต่อจาก EXTRA_MODELS/AUDIO_EXTRA_MODELS ด้วย pattern เดียวกัน (ไม่ให้ id ซ้ำ)
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
    mutate(s => { s.models = list; s.audioModels = audioList; s.speechModels = speechList; ensureModelSelection(); applyVideoCapabilities(); });
    if (import.meta.env.DEV) checkModelIdDrift(list.map(m => m.id), fetched.map(m => m.id));
  } catch (e) {
    mutate(s => { s.modelsFailed = true; });
    toast("โหลดรายชื่อโมเดลไม่สำเร็จ: " + errMsg(e), "error");
  }
}

// ---------- TTS voices ----------
/**
 * ลอง parse voice list จาก field ที่เป็นไปได้ของโมเดล (ยังไม่ยืนยัน field name จริงจาก OpenRouter เพราะ
 * โมเดลนี้ยังไม่ list ใน /api/v1/models) — เช็ค `model.voices` ก่อน แล้วค่อย `model.architecture?.voices`
 * ถ้าไม่มีเลยสักที่ fallback เป็น TTS_FALLBACK_VOICES (รายชื่อ 30 voice จาก Google Cloud TTS docs)
 * field จาก API ทั้งสองที่รองรับทั้งแบบ string ล้วนและแบบ { id, name } — normalize ให้เป็น TtsVoice เสมอ
 */
function extractVoices(model: ORModel): TtsVoice[] {
  const raw = model.voices ?? model.architecture?.voices;
  if (raw && raw.length) {
    return raw.map(v => (typeof v === "string" ? { id: v } : v));
  }
  return TTS_FALLBACK_VOICES;
}

/**
 * โหลด voice list ของโมเดลที่เลือกอยู่ในโหมด tts — เรียกตอนเปลี่ยนโมเดลในโหมดนี้ (ดู selectModel)
 * ไม่มี fetch จริงเพิ่มเติม (voice list มาจาก model object ที่โหลดไว้แล้วหรือ fallback ล้วนๆ) แต่ยังทำเป็น
 * async + ttsVoicesLoading flag ไว้ เผื่อวันหน้า OpenRouter list voices ผ่าน endpoint แยกจริงๆ
 */
export async function loadVoicesForModel(modelId: string): Promise<void> {
  mutate(() => { cur().ttsVoicesLoading = true; });
  try {
    const model = state.speechModels.find(m => m.id === modelId);
    const voices = model ? extractVoices(model) : TTS_FALLBACK_VOICES;
    mutate(() => {
      const ms = cur();
      ms.ttsVoices = voices;
      if (!voices.some(v => v.id === ms.voiceId)) ms.voiceId = voices[0]?.id ?? null;
    });
  } finally {
    mutate(() => { cur().ttsVoicesLoading = false; });
  }
}

/** ตั้งเสียงพากย์ของโหมด tts — no-op ถ้าไม่ได้อยู่โหมด tts (ปุ่มเลือกเสียงใน sidebar โผล่เฉพาะโหมดนี้อยู่แล้ว) */
export function selectVoice(voiceId: string): void {
  if (state.mode !== "tts") return;
  mutate(() => { cur().voiceId = voiceId; });
}

// ---------- Settings: EXTRA_MODELS override ที่ผู้ใช้เพิ่มเอง (SettingsModal) ----------
/**
 * true ถ้ายังไม่โหลด model list เสร็จเลยสักตัว (ทั้งภาพและเสียง) — ใช้ defer การ validate id
 * ใน SettingsModal แทนที่จะฟันธงว่า "ไม่รู้จัก" ทั้งหมดทั้งที่แค่ยังโหลดไม่เสร็จ
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
    toast("โหลดรายชื่อโมเดลวิดีโอไม่สำเร็จ: " + errMsg(e), "error");
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
  // F2: กู้ผลงานที่เก็บไว้ใน IndexedDB กลับเข้าแกลเลอรี — เกาะจุดบูตนี้เพราะเป็นฟังก์ชันเดียวใน actions.ts
  // ที่ StudioApp เรียกให้ครั้งเดียวตอน mount อยู่แล้ว (StudioApp.tsx ไม่ได้อยู่ในขอบเขตงานนี้)
  // ยิงก่อนตัดสินใจ return ด้านล่าง เพราะ ledger ว่างไม่ได้แปลว่าไม่มีของให้กู้
  // T24/#1: ยกพื้น s.seq ให้พ้น id สูงสุดที่เคยลงดิสก์ **ก่อน** ยิง rehydrate — sync ล้วน ไม่มี await
  //
  // เดิม s.seq ถูก bump อยู่ข้างใน rehydrateGallery() ซึ่งอยู่หลัง `await loadItems()` ระหว่างรอ I/O นั้น
  // s.seq ยังเป็น 0 ผู้ใช้ที่กด Generate ทันจะได้ item id 1,2,3… ชนกับ id ของ record ที่กำลังจะกู้พอดี
  // แล้ว dedupe ด้วย id ใน rehydrateGallery จะทิ้ง record นั้นทั้งที่เป็นคนละชิ้นกัน (ของกู้ไม่ขึ้นจอ +
  // toast รายงานเลขต่ำกว่าจริง) — อ่าน localStorage ตรงนี้ปิด window ได้ทั้งหมดโดยไม่ต้อง await
  //
  // การ bump ข้างใน rehydrateGallery ยังคงอยู่ (belt-and-braces): high-water mark อาจต่ำกว่าความจริงได้
  // ถ้า localStorage เขียนไม่ผ่าน/ผู้ใช้ลบคีย์ทิ้ง — ค่าที่อ่านจาก record จริงยังเป็นแหล่งความจริงสุดท้าย
  const persistedMaxId = loadGalleryMaxId();
  if (persistedMaxId > 0) mutate(s => { if (persistedMaxId > s.seq) s.seq = persistedMaxId; });
  // ไม่ await: การกู้ต้องไม่หน่วง resume ของ video job ที่จ่ายเงินไปแล้ว (rehydrateGallery no-op ถ้า opt-in ปิด)
  // เก็บ promise ไว้ให้ pruneOrphanFavorites() รอ — ห้าม await ตรงนี้ (จะหน่วง resume video job ที่จ่ายเงินแล้ว)
  galleryRehydrated = rehydrateGallery().catch(() => {});
  // ล้างคีย์โปรดกำพร้าตอนบูต — fire-and-forget, รอ rehydrate เองข้างใน (ดู pruneOrphanFavorites)
  void pruneOrphanFavorites();

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
        addToGallery(s, entry.mode, item);
      }
    });
    for (const { entry } of resumable) {
      const item = state.modes[entry.mode].images.find(x => x.id === entry.id);
      if (item) void scheduleRequest(item);
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
  if (!parsed) { toast("บันทึกเซสชันอัตโนมัติเสียหาย กู้คืนไม่ได้ค่ะ", "error"); dismissRestoreBanner(); return; }
  const preview = diffImportSession(parsed);
  mutate(s => { s.importPending = { raw: parsed, preview }; s.restoreBanner = null; });
}

export function selectModel(id: string) {
  mutate(() => { cur().modelId = id; applyVideoCapabilities(); });
  // เปลี่ยนโมเดลในโหมด tts ต้องโหลด voice list ใหม่เสมอ — voice ผูกกับโมเดล ค้างของโมเดลก่อนหน้าไว้ไม่ได้
  if (state.mode === "tts") void loadVoicesForModel(id);
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

// ---------- theme (F2 / T6) ----------

/**
 * media query ตัวเดียวของทั้งแอป — สร้างครั้งเดียวตอน module โหลด ไม่สร้างใหม่ทุกครั้งที่ resolve
 *
 * `null` ได้จริง 2 กรณี: เบราว์เซอร์เก่าที่ไม่มี matchMedia และ environment ที่ไม่มี window เลย
 * (เช่นถ้าวันหนึ่งมีใครลาก actions.ts ไปรันนอก browser) — ทุกจุดที่ใช้ต้องเช็ค null ก่อน
 * ไม่งั้นธีมพังทั้งแอปเพราะ API ที่ไม่มีอยู่ตัวเดียว
 */
const darkQuery: MediaQueryList | null =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

/**
 * แปลงค่าที่ผู้ใช้เลือกเป็นธีมที่ทาได้จริง — `"system"` เท่านั้นที่ถูกแปลง ธีมอื่นคืนตัวเอง
 *
 * `"system"` resolve ได้แค่ `ink` (dark) หรือ `paper` (light) เท่านั้น ไม่ใช่ "ธีมที่เลือกไว้เวอร์ชันมืด"
 * (workflow decisions.c) — ถ้าให้ทุกธีมมีคู่ light/dark จะกลายเป็นสิบกว่า combination ที่ต้อง QA
 *
 * ⚠️ logic ตรงนี้ duplicate กับ inline script ใน index.html (บรรทัด 26-31) โดยตั้งใจ —
 * index.html ไม่ผ่าน bundler จึง import มาไม่ได้ ถ้าแก้เกณฑ์ที่นี่ **ต้องแก้ที่นั่นด้วย**
 * ไม่งั้นธีมจะกระพริบตอน React mount (script ทาค่าหนึ่ง แล้ว setTheme มาทาทับอีกค่า)
 */
export function resolveTheme(id: ThemeId): ResolvedThemeId {
  if (id !== "system") return id;
  return darkQuery?.matches ? SYSTEM_DARK : SYSTEM_LIGHT;
}

/** ทาธีมลง DOM — จุดเดียวที่ actions.ts แตะ data-theme และมันก็ delegate ให้ applyThemeAttr ของ store.ts ต่อ */
export function applyTheme(id: ThemeId) {
  applyThemeAttr(resolveTheme(id));
}

/** เปลี่ยนธีม: state + persistence + DOM ครบในที่เดียว — ที่อื่นห้ามทำสามอย่างนี้แยกกันเอง */
export function setTheme(id: ThemeId) {
  mutate(s => { s.theme = id; });
  saveTheme(id);
  applyTheme(id);
}

/**
 * subscribe การเปลี่ยนธีมของ OS — ต้องทำงานเฉพาะตอน `state.theme === "system"` เท่านั้น
 * ธีมที่ผู้ใช้เลือกเจาะจงต้องชนะเสมอ จึงเช็ค state **ตอน event ยิง** ไม่ใช่ตอน subscribe
 * (ถ้าเช็คตอน subscribe แล้ว unsubscribe/resubscribe ตาม state จะต้องผูก listener เข้ากับ React lifecycle
 * ซึ่งเป็นทางที่ leak ง่ายกว่าและได้ประโยชน์เท่ากัน)
 *
 * StrictMode-safe ยังไง: `refCount` ทำให้ addEventListener ถูกเรียกจริงครั้งเดียวไม่ว่าจะถูก subscribe
 * กี่รอบ (React 19 StrictMode รัน effect setup→cleanup→setup ใน dev) และ cleanup แต่ละใบเป็น idempotent
 * ด้วย flag `released` — เรียกซ้ำแล้วนับ refCount ลดเกินจริงไม่ได้ listener จริงจึงมีได้ไม่เกิน 1 ตัวเสมอ
 *
 * คืนฟังก์ชัน cleanup ให้ caller เอาไป return จาก useEffect ตรงๆ
 */
let systemThemeRefCount = 0;
let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

export function subscribeSystemTheme(): () => void {
  if (!darkQuery) return () => { /* ไม่มี matchMedia = ไม่มีอะไรให้ subscribe แต่ caller ยังต้องได้ cleanup ที่เรียกได้ */ };

  if (systemThemeRefCount === 0) {
    systemThemeListener = () => {
      // ผู้ใช้เลือกธีมเจาะจงไว้ = OS เปลี่ยนก็ไม่เกี่ยว ปล่อยผ่านเงียบๆ ไม่แตะ DOM และไม่ mutate
      if (state.theme !== "system") return;
      // ไม่แตะ state.theme (ยังเป็น "system" อยู่ถูกแล้ว) แค่ทาค่าที่ resolve ใหม่ลง DOM
      // ทั้งแอปอ่านสีจาก CSS var จึงเปลี่ยนตามทันทีโดยไม่ต้อง re-render React แม้แต่ component เดียว
      applyTheme("system");
    };
    darkQuery.addEventListener("change", systemThemeListener);
  }
  systemThemeRefCount++;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    systemThemeRefCount--;
    if (systemThemeRefCount === 0 && systemThemeListener) {
      darkQuery.removeEventListener("change", systemThemeListener);
      systemThemeListener = null;
    }
  };
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
  if (mode === "audio" || mode === "tts") return false; // ยังไม่รองรับ image-to-music/เสียงพูดจากภาพ — ตัด ref ออกทั้งสองโหมด
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
    if (!file.type.startsWith("image/")) { toast(`"${file.name}" ไม่ใช่ไฟล์รูปค่ะ`, "error"); continue; }
    if (file.size > MAX_REF_BYTES) {
      toast(`"${file.name}" ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ`, "error");
      continue;
    }
    if (state.modes[mode].refs.filter(r => r.kind === kind).length >= MAX_REFS_PER_KIND) {
      toast(`แนบได้สูงสุด ${MAX_REFS_PER_KIND} รูปต่อประเภทค่ะ`, "error");
      break;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      mutate(() => {
        if (isVideoMode(mode)) state.modes[mode].refs = [{ kind: "ref", dataUrl, name: file.name }];
        else state.modes[mode].refs.push({ kind, dataUrl, name: file.name });
      });
    } catch (e) {
      toast(errMsg(e), "error");
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
    toast(`ภาพนี้ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ใช้เป็นเฟรมแรกไม่ได้`, "error");
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
    toast(`ภาพนี้ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ใช้เป็นภาพอ้างอิงไม่ได้`, "error");
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
    frameDataUrl = isVideoMode(item.mode) ? (await captureVideoFrame(item.url)).dataUrl : (item.mode === "audio" || item.mode === "tts") ? null : item.url;
  } catch (e) {
    toast("จับเฟรมจากต้นฉบับไม่สำเร็จ: " + errMsg(e), "error");
    return;
  }
  if (frameDataUrl && dataUrlByteSize(frameDataUrl) > MAX_REF_BYTES) {
    toast(`ภาพต้นฉบับใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ใช้เป็นจุดเริ่มต้นไม่ได้`, "error");
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
      ratio: (item.mode === "audio" || item.mode === "tts") ? ts.ratio : item.ratio,
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
    addToGallery(s, targetMode, rootItem);
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
  if (refImageMissing()) { toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video)", "error"); return; }
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
 * ล้าง gallery ของโหมดที่ระบุ — revoke blob URL ของวิดีโอ/เพลงเฉพาะชิ้นที่ถูกทิ้งจริง เพื่อไม่ให้ browser
 * ถือ memory ของไฟล์เหล่านั้นค้างไว้ทั้งที่ไม่มีใครอ้างอิงแล้ว
 *
 * item ที่ผู้ใช้กดดาวไว้ถือว่า "ตั้งใจเก็บ" — คงไว้เสมอ และห้าม releaseBlobUrls ของชิ้นเหล่านั้นเด็ดขาด
 * ไม่งั้น <video>/<audio> ของการ์ดที่ยังอยู่บนจอจะชี้ไปยัง blob URL ที่ถูก revoke ไปแล้ว (เล่นไม่ได้/จอดำ)
 * คืนจำนวน item ที่ลบไปจริง เพื่อให้ caller รายงานผลให้ผู้ใช้ได้แม่นตรง
 */
export function resetModeGallery(mode: Mode): number {
  let removed = 0;
  // id ของชิ้นที่ถูกลบจริงในรอบนี้ — เก็บไว้ลบ record ใน IndexedDB หลัง mutate() จบ (ดู forgetPersistedItems)
  // ต้องเป็น "เฉพาะชิ้นที่ลบจริง" ไม่ใช่ทั้งโหมด ไม่งั้นของที่ติดดาวจะหายจากดิสก์ทั้งที่การ์ดยังอยู่
  const droppedIds: number[] = [];
  mutate(s => {
    const ms = s.modes[mode];
    const kept: GenItem[] = [];
    for (const item of ms.images) {
      if (item.favorite) { kept.push(item); continue; }
      releaseBlobUrls(item.id);
      droppedIds.push(item.id);
      removed++;
    }
    ms.images = kept;
    // selected key ด้วย id — เหลือไว้เฉพาะ id ที่ยังมีตัวจริงอยู่ ไม่ใช่เคลียร์ทิ้งทั้งชุด
    const keptIds = new Set(kept.map(x => x.id));
    ms.selected = new Set([...ms.selected].filter(id => keptIds.has(id)));
    ms.lbIndex = -1;
  });
  // fire-and-forget หลัง mutate() สำเร็จ — no-op เงียบถ้า opt-in ปิด (pattern เดียวกับ syncFavoriteToGallery)
  // ห้ามทำ resetModeGallery เป็น async: Gallery.tsx เรียกใน onClick แล้วใช้ค่า return ต่อทันที
  forgetPersistedItems(droppedIds);
  return removed;
}

// ---------- generation ----------
/**
 * `approved` — batch ที่ผู้ใช้เพิ่งกดยืนยันในโมดัล Spend Guard ส่งเข้ามาจาก `confirmSpend()` เท่านั้น (T24/#4)
 *
 * ปัญหาที่แก้: `confirmSpend` คืน jobs เข้า `s.modes[pending.mode].queue` ถูกต้องแล้ว แต่ generate() รอบสอง
 * ประกอบ batch จาก `cur()` = โหมดที่เปิดอยู่ **ตอนนี้** ถ้าผู้ใช้สลับโหมดระหว่างโมดัลเปิดค้าง รอบสองจะไปอ่าน
 * คิวของโหมดใหม่ (ว่าง) และ prompt ของโหมดใหม่ (ว่าง) → return เงียบสนิท ทั้งที่ผู้ใช้กดยืนยันจ่ายเงินไปแล้ว
 *
 * เลือกทาง "ยิงงานของโหมดต้นทางจริง" ไม่ใช่ "เตือนแล้วไม่ยิง": สิ่งที่ผู้ใช้อนุมัติคือ jobs ชุดนั้นของโหมดนั้น
 * พร้อมยอดเงินที่โมดัลแสดง (snapshot ตอน gate เด้ง ไม่ live-bind ตามสัญญาของ SpendConfirmRequest) การยิง
 * ตามสิ่งที่เขาเพิ่งกดอนุมัติจึงตรงเจตนาที่สุด — โหมดที่เปิดอยู่บนจอเป็นเรื่อง "จะเห็นผลที่แท็บไหน" ไม่ใช่
 * "จะยิงอะไร" และ `item.mode` ทำให้ผลลัพธ์ลงแกลเลอรีถูกโหมดอยู่แล้วแม้ผู้ใช้จะค้างอยู่แท็บอื่น
 *
 * ส่ง jobs สำเร็จรูปเข้ามาเลย ไม่ใช่แค่ชื่อโหมด เพราะสาขา "ยิงจาก prompt" ประกอบ job ผ่าน `currentModel()` /
 * `refsSupported()` / `refImageMissing()` ซึ่งอ่าน `state.mode` กันหมด — รอบ bypass จึงไม่มีทางประกอบ job
 * ของโหมดอื่นได้ถูกต้อง และไม่ควรประกอบใหม่อยู่ดี (ผู้ใช้อาจแก้ prompt/count ระหว่างโมดัลเปิดอยู่)
 */
/**
 * ทางเข้าสาธารณะ — **ต้องไม่รับพารามิเตอร์** เพราะ Sidebar/PromptComposer ผูกมันเป็น `onClick={generate}`
 * ตรงๆ ถ้ารับ arg เมื่อไหร่ React จะส่ง MouseEvent เข้ามาเป็น payload เงียบๆ (tsc จับได้ในเคสนี้พอดี
 * แต่กติกานี้สำคัญพอที่จะเขียนไว้ ไม่ใช่ให้จำเอง)
 */
export function generate() {
  runGenerate();
}

function runGenerate(approved?: { mode: Mode; jobs: QueueJob[] }) {
  // F4: อ่าน+เคลียร์ bypass เป็นบรรทัดแรกสุด **ก่อน early return ทุกจุด** — ถ้าเคลียร์ทีหลัง (เช่นตรงจุด gate)
  // แล้ว generate() หลุดออกทาง `!state.apiKey` / `!prompt || !model` / `refImageMissing()` flag จะค้าง true
  // ตลอดไป แล้ว batch ถัดไป "ยิงเงินโดยไม่ถาม" ซึ่งคือสิ่งที่ฟีเจอร์นี้มีไว้กันพอดี (แพร T18 จับได้)
  const bypassed = bypassSpendGate;
  bypassSpendGate = false;

  // T24/#5: โมดัลยืนยันค่าใช้จ่ายเปิดค้างอยู่ = มี batch ชุดหนึ่งนอนรออยู่ใน `pendingSpendJobs` ซึ่งเป็นตัวแปร
  // module-level **ตัวเดียว** ถ้าปล่อยให้ generate() รอบใหม่เดินต่อจนถึง gate มันจะเขียนทับ pendingSpendJobs
  // แล้วคิวชุดแรก (ที่ถูก `ms.queue = []` ไปตั้งแต่รอบแรก) หายถาวร กู้ไม่ได้ ทั้งจากปุ่มยืนยันและปุ่มยกเลิก
  //
  // กันที่ gate ตรงนี้จุดเดียว ไม่ใช่ที่ caller: ทางเข้า generate() มีทั้งปุ่ม Generate ใน Sidebar,
  // Ctrl+Enter ใน shortcuts.ts และ confirmSpend() เอง — กันที่นี่ครอบได้หมดโดยไม่ต้องหวังว่าทุก caller
  // จะจำเช็คเอง (shortcuts.ts เพิ่ม guard ไว้อีกชั้นเพื่อไม่ให้ toast ซ้ำจากการกดรัวเท่านั้น)
  // `bypassed` ต้องผ่านได้เสมอ — นั่นคือ confirmSpend() ที่เพิ่งปิดโมดัลไปเองแล้วกำลังยิงรอบสอง
  if (!bypassed && state.spendConfirm) {
    toast("มีรายการรอยืนยันค่าใช้จ่ายอยู่ค่ะ — ยืนยันหรือยกเลิกก่อนนะคะ");
    return;
  }

  if (!state.apiKey) { mutate(s => { s.keyModalOpen = true; }); return; }
  // T24/#4: รอบยืนยันผูกกับโหมดต้นทางของ batch เสมอ ไม่ใช่โหมดที่เปิดอยู่ตอนกดยืนยัน
  const mode = approved ? approved.mode : state.mode;
  // ขอสิทธิ์ notification แบบ lazy เฉพาะครั้งแรกที่กด generate ในโหมด video/cinematic — ต้องมาจาก user gesture นี้เท่านั้น
  if (isVideoMode(mode)) requestNotifyPermissionOnce();
  const ms = state.modes[mode];

  // "Refine this" ผูก parentId ให้เฉพาะ batch ที่ยิงตรงจาก prompt (ไม่ใช่จากคิว) — ใช้ครั้งเดียวแล้วเคลียร์ทิ้งเสมอ
  // ไม่ว่าจะยิงจริงหรือไม่ เพื่อไม่ให้ค้างไปผูกกับ generate ครั้งถัดไปที่ไม่เกี่ยวข้องกันแล้ว
  // รอบ bypass (มาจากปุ่มยืนยันใน F4 modal) ต้องใช้ parentId ที่ snapshot ไว้ตอน gate เด้ง —
  // `refiningParentId` ถูกเคลียร์ไปแล้วตั้งแต่รอบแรก ถ้าอ่านใหม่จะได้ null แล้วสายพันธุ์ "Refine this" ขาด
  const parentId = bypassed
    ? (pendingSpendParentId ?? null)
    : (!ms.queue.length ? ms.refiningParentId : null);
  if (ms.refiningParentId != null) mutate(() => { ms.refiningParentId = null; });

  let jobs: QueueJob[];
  // จำไว้ว่า batch นี้มาจากคิวหรือจาก prompt ปัจจุบัน — F4 gate ใช้ตัดสินว่าตอนผู้ใช้ยกเลิกต้องคืนคิวไหม
  const fromQueue = ms.queue.length > 0;
  if (approved) {
    // T24/#4: รอบยืนยัน — ใช้ snapshot ที่โมดัลคิดราคาไว้ตรงๆ ไม่ประกอบใหม่จาก state ที่อาจเปลี่ยนไปแล้ว
    // ถ้า confirmSpend คืน jobs เข้าคิวไป (สาขา fromQueue) ต้องหยิบออกจากคิวด้วย ไม่งั้นคิวค้างซ้ำกับที่ยิง
    jobs = approved.jobs;
    if (fromQueue) mutate(() => { ms.queue = []; });
  } else if (fromQueue) {
    jobs = ms.queue;
    mutate(() => { ms.queue = []; });
  } else {
    const prompt = ms.prompt.trim();
    const model = currentModel();
    if (!prompt || !model) return;
    if (refImageMissing()) { toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video)", "error"); return; }
    jobs = [{
      prompt, model: model.id, modelName: model.name || model.id, ratio: ms.ratio,
      count: ms.count, duration: ms.duration, audio: ms.audio,
      refs: refsSupported() ? ms.refs.slice() : [],
      ...(negPromptSupportedFor(state.mode, model) && ms.negPrompt.trim() ? { negPrompt: ms.negPrompt.trim() } : {}),
    }];
  }

  // ---- F4 Spend Guard: จุดแรกที่ jobs[] ประกอบครบทั้งสองสาขา (คิว + prompt ปัจจุบัน) ----
  // อยู่หลัง pre-flight ทั้งหมด (refImageMissing) และ **ก่อน** addToHistory/สร้าง item ทุกชิ้น
  // เพื่อไม่ให้ batch ที่ผู้ใช้กดยกเลิกทิ้ง zombie card ค้างแกลเลอรีหรือไปโผล่ในประวัติ prompt
  // bypass เป็น one-shot: อ่านแล้วเคลียร์ทันที ไม่ค้างไปข้าม gate ของครั้งถัดไป (ดู confirmSpend)
  if (!bypassed) {
    const gate = evaluateSpendGate(mode, jobs);
    if (gate) {
      // snapshot jobs ไว้เอง (ไม่เข้า state — refs เป็น data URL ก้อนใหญ่) พร้อมจำว่ามาจากคิวหรือไม่
      // เพราะสาขาคิวทำ `ms.queue = []` ไปแล้วข้างบน ตอนยกเลิกต้องคืนกลับ ไม่ใช่ปล่อยให้คิวหายเงียบ
      pendingSpendJobs = { mode, jobs, fromQueue, parentId };
      mutate(s => { s.spendConfirm = gate; });
      return; // ยังไม่สร้าง item ใดๆ — ปุ่มยืนยันในโมดัลจะเรียก generate() ซ้ำในโหมด bypass
    }
  }

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
          // snapshot voice ที่เลือกอยู่ตอนกดสร้าง (เฉพาะโหมด tts) — กัน retry ใช้ voice ผิดถ้าผู้ใช้เปลี่ยน dropdown หลังยิงไปแล้ว
          ...(mode === "tts" && ms.voiceId ? { ttsVoiceId: ms.voiceId } : {}),
        };
        addToGallery(s, mode, item);
        batch.push(item);
      }
    }
  });
  // batch > 1 งาน (คิวหลาย job หรือ count > 1) — รวมแจ้งเตือนเป็นก้อนเดียวตอนครบทุกงาน แทนแจ้งทีละงาน
  // เฉพาะโหมด video/cinematic/audio/tts เท่านั้นที่ runRequest เรียก notifyJobSettled — โหมดอื่นไม่ต้องเปิด batch เลย (กัน batch ค้างไม่มีใคร resolve)
  const notifiable = isVideoMode(mode) || mode === "audio" || mode === "tts";
  const batchId = notifiable && batch.length > 1 ? beginNotifyBatch(batch.length) : null;
  // ผ่าน governor เสมอ — cap in-flight ระดับแอปที่ MAX_CONCURRENT_REQUESTS (ไม่ยิง 30 fetch พร้อมกันอีกแล้ว)
  batch.forEach(item => void scheduleRequest(item, batchId));
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
        toast(`เลือกได้สูงสุด ${MAX_BAKE_OFF_MODELS} โมเดลค่ะ`, "error");
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
  if (models.length < 2) { toast("โมเดลที่เลือกไว้ไม่พร้อมใช้งานแล้วค่ะ ลองเลือกใหม่นะคะ", "error"); return; }

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
      addToGallery(s, mode, item);
      batch.push(item);
    }
  });
  // governor ตัวเดียวกับ generate() — เปิด Bake-off พร้อม batch ปกติก็ยังรวมกันไม่เกิน cap
  batch.forEach(item => void scheduleRequest(item));
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

/* ============================================================================
 * F1 — Request Governor: semaphore + AbortController registry
 * ========================================================================== */

/**
 * error ที่โยนจากภายในเมื่อ request ถูกยกเลิก — ใช้แยก "ผู้ใช้ยกเลิก" ออกจาก error จริงตอน catch
 * (fetch เองโยน DOMException name "AbortError" ซึ่งดักได้เหมือนกัน แต่ helper ที่เราเขียนเอง เช่น
 * abortableSleep และ reader loop ของ audio ต้องมีตัวโยนของตัวเอง)
 */
class RequestAbortedError extends Error {
  constructor() { super("request aborted"); this.name = "AbortError"; }
}

/** true ถ้า error ที่จับได้เกิดจากการ abort (ของเราเองหรือของ fetch/DOM) */
function isAbortError(e: unknown): boolean {
  return e instanceof RequestAbortedError
    || (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError")
    || (e instanceof Error && e.name === "AbortError");
}

/**
 * sleep ที่ยกเลิกได้ทันทีเมื่อ signal abort — ใช้แทน sleep() เปล่าๆ ใน poll loop ของวิดีโอ
 * ถ้าใช้ setTimeout เฉยๆ การยกเลิกจะช้าได้ถึง VIDEO_POLL_MS_MAX (~20s) กว่าจะวนถึงจุดเช็ค signal ถัดไป
 * clear ทั้ง timer และ listener เสมอ กัน leak เมื่อ item เดียวถูก poll หลายสิบรอบ
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new RequestAbortedError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(new RequestAbortedError()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** โยนทันทีถ้า signal ถูก abort ไปแล้ว — ใช้คั่นระหว่างขั้นตอนยาวๆ ที่ไม่ได้อยู่ใน fetch (เช่น loop อ่าน stream) */
function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new RequestAbortedError();
}

/**
 * registry ของ AbortController ที่ยัง live อยู่ — key เป็น item.id (unique ทั้งแอปเพราะมาจาก ++state.seq)
 * entry ถูกลบใน finally ของ runRequest เสมอ ไม่ว่าจะจบด้วย done/error/cancelled
 */
const inflightControllers = new Map<number, AbortController>();

/** เหตุผลการยกเลิกที่ "ประกาศไว้ล่วงหน้า" ก่อน abort จริง — runRequest อ่านค่านี้ตอนแปลง abort → state */
const cancelReasons = new Map<number, CancelReason>();

/** งานที่รออยู่ในคิวของ governor (ยังไม่ได้ยิง fetch เลย) — key เป็น item.id เพื่อยกเลิกก่อนเสียเงินได้ */
interface PendingSlot {
  item: GenItem;
  /** ปล่อยงานให้วิ่งจริง */
  start: () => void;
  /** ทิ้งงานทั้งที่ยังไม่เคยยิง — ไม่มี fetch เกิดขึ้นเลย */
  drop: () => void;
}
const waitingQueue: PendingSlot[] = [];
let activeCount = 0;

/**
 * scheduler ตัวเดียวของทั้งแอป — generate() และ runBakeOff() (และ retry/regenerate/resume) ผ่านทางนี้หมด
 * cap เป็นระดับแอป ไม่ใช่ต่อ batch: เปิดสอง batch พร้อมกันก็ยัง in-flight รวมกันไม่เกิน MAX_CONCURRENT_REQUESTS
 *
 * งานที่ยังไม่ได้ slot จะนอนอยู่ใน waitingQueue โดยที่ item.status ยังเป็น "loading" ตามที่ผู้ใช้เห็น
 * (ยังไม่มี fetch เกิดขึ้น = ยังไม่เสียเงิน) — ถ้าถูก cancel ตอนนี้ จะถูก drop ออกโดยไม่ยิงอะไรเลย
 */
function scheduleRequest(item: GenItem, batchId: number | null = null): Promise<void> {
  return new Promise<void>(resolve => {
    const run = () => {
      activeCount++;
      // F4: จุดเดียวของทั้งแอปที่ request "หลุดคิว governor เข้า in-flight" = เริ่มเสียเงินจริง
      // บันทึกยอดตรงนี้ครอบทุก path ที่จ่ายเงิน (generate / runBakeOff / retry / regenerate / resume)
      // โดยที่งานซึ่งถูกยกเลิกตอนยังรอคิวอยู่ไม่เคยมาถึงบรรทัดนี้ จึงไม่ถูกนับตามกติกาพอดี
      recordSpend(item);
      // controller ถูกสร้าง "ตอนได้ slot" ไม่ใช่ตอนเข้าคิว — งานที่ยังรออยู่ถูกยกเลิกผ่าน waitingQueue แทน
      // (drop ทิ้งโดยไม่มี fetch เลย) ส่วนงานที่วิ่งแล้วถูกยกเลิกผ่าน controller ตัวนี้
      const ctrl = new AbortController();
      inflightControllers.set(item.id, ctrl);
      void runRequest(item, batchId, ctrl.signal).finally(() => {
        activeCount--;
        resolve();
        pumpQueue();
      });
    };
    if (activeCount < MAX_CONCURRENT_REQUESTS) { run(); return; }
    waitingQueue.push({
      item,
      start: run,
      // งานที่ถูก drop ตอนยังรอคิวไม่เคยเข้า runRequest เลย จึงต้องหด batch ของ notify.ts เองตรงนี้ (T19)
      // — ไม่งั้น batch ค้างเหมือนกันทุกประการกับเคสที่ถูก abort กลางทาง
      drop: () => {
        finalizeCancelled(item, cancelReasons.get(item.id) ?? "user");
        dropFromNotifyBatch(batchId);
        resolve();
      },
    });
  });
}

/** ปล่อยงานที่รออยู่เข้ามาจนเต็ม slot — เรียกทุกครั้งที่มี slot ว่าง (งานจบ) หรือมีงานหลุดคิว */
function pumpQueue() {
  while (activeCount < MAX_CONCURRENT_REQUESTS && waitingQueue.length) {
    const slot = waitingQueue.shift();
    slot?.start();
  }
}

/**
 * เซ็ต state ของ item ที่ถูกยกเลิก — จุดเดียวที่เขียน status = "cancelled"
 * ตั้งใจไม่เรียก recordModelStat / autoSaveItem / notifyJobSettled: งานที่ผู้ใช้ยกเลิกเองไม่ใช่ทั้ง
 * ความสำเร็จและความล้มเหลวของโมเดล และห้ามเด้ง notification "งานล้มเหลว"
 *
 * INVARIANT: ไม่แตะ item.jobId และไม่เรียก removePendingJob() เด็ดขาด — job ฝั่ง OpenRouter ยัง live
 * และจ่ายเงินไปแล้ว jobId ที่คงไว้คือสิ่งเดียวที่ทำให้กด "ลองใหม่" แล้ว resume ได้โดยไม่จ่ายซ้ำ
 * (`let resumed = !!item.jobId` ที่ต้น requestVideo)
 */
function finalizeCancelled(item: GenItem, reason: CancelReason) {
  item.status = "cancelled";
  item.cancelReason = reason;
  item.cancelledAt = Date.now();
  item.jobStatus = "";
  item.errMsg = "";
  cancelReasons.delete(item.id);
  mutate();
}

/**
 * สถิติของ governor สำหรับโชว์ใน UI (T3) — UI แยก "กำลังยิงอยู่" กับ "รอคิว" จาก state ฝั่ง React ไม่ได้
 * เพราะ item ทั้งสองกลุ่มมี status = "loading" เหมือนกันหมด ความจริงอยู่ที่ตัวแปร module-level สองตัวนี้เท่านั้น
 *
 * `waiting` คือจำนวนงานที่ยัง "ไม่เคยยิง fetch เลย" — ยกเลิกตอนนี้ = ไม่เสียเงิน ซึ่งเป็นจุดขายของปุ่มยกเลิก
 * ตัวเลขไม่ได้อยู่ใน AppState (ไม่ trigger re-render เอง) — Header poll ทุก 1s ขณะมีงานค้างอยู่
 */
export function getSchedulerStats(): { active: number; waiting: number } {
  return { active: activeCount, waiting: waitingQueue.length };
}

/** true ถ้า item ชิ้นนี้ยกเลิกได้ตอนนี้ — กำลังยิงอยู่จริง หรือยังนอนรอ slot อยู่ในคิวของ governor */
export function isCancellable(item: GenItem): boolean {
  return item.status === "loading"
    && (inflightControllers.has(item.id) || waitingQueue.some(s => s.item.id === item.id));
}

/**
 * ยกเลิกงานหนึ่งชิ้น — คืน true ถ้ามีอะไรให้ยกเลิกจริง
 *
 * สองเคส:
 * 1. ยังรออยู่ในคิว governor → drop ออกจากคิวตรงๆ ไม่มี fetch เกิดขึ้นเลย ไม่เสียเงิน
 * 2. กำลังยิงอยู่ → abort() controller ของมัน fetch/reader/abortableSleep ที่ค้างอยู่จะโยนทันที
 *    แล้ว runRequest เป็นคนแปลงเป็น status = "cancelled" (ภายใน ~1s เพราะ sleep ก็ abort ได้)
 */
export function cancelItem(item: GenItem, reason: CancelReason = "user"): boolean {
  if (item.status !== "loading") return false;
  cancelReasons.set(item.id, reason);

  const qi = waitingQueue.findIndex(s => s.item.id === item.id);
  if (qi >= 0) {
    const [slot] = waitingQueue.splice(qi, 1);
    slot.drop();
    pumpQueue();
    return true;
  }

  const ctrl = inflightControllers.get(item.id);
  if (ctrl) { ctrl.abort(); return true; }

  // loading แต่ไม่มีทั้ง controller และคิว = งานที่ resume มาแล้วยังไม่เข้า governor (ไม่ควรเกิด) — ไม่แตะ state
  cancelReasons.delete(item.id);
  return false;
}

/**
 * ยกเลิกทุกงานที่ยัง loading อยู่ — คืนจำนวนที่ยกเลิกได้จริง
 * mode = undefined → ทุกโหมด (ใช้ตอน shutdown), ระบุโหมด → เฉพาะโหมดนั้น (ปุ่ม "ยกเลิกทั้งหมด" ของผู้ใช้)
 * snapshot รายการก่อนวน เพราะ cancelItem แก้ waitingQueue ระหว่างทาง
 */
export function cancelAll(reason: CancelReason = "user-all", mode?: Mode): number {
  const modes: Mode[] = mode ? [mode] : (Object.keys(state.modes) as Mode[]);
  const targets: GenItem[] = [];
  for (const m of modes) {
    for (const item of state.modes[m].images) {
      if (item.status === "loading") targets.push(item);
    }
  }
  let n = 0;
  for (const item of targets) if (cancelItem(item, reason)) n++;
  return n;
}

/**
 * batchId: มาจาก beginNotifyBatch() เมื่อยิงหลายงานพร้อมกัน (generate() คิว/count > 1) — ใช้รวมแจ้งเตือนเป็นก้อนเดียว
 * ตอน queue เต็ม caller ที่ไม่ผ่าน batch (retry, regenerate, auto-extend, ฯลฯ) ปล่อย null ไว้ = แจ้งทันทีทีละงาน
 */
async function runRequest(item: GenItem, batchId: number | null = null, signal?: AbortSignal) {
  // caller ที่ยิงงานเดี่ยว (retry, regenerate, auto-extend, resume จาก ledger) ไม่ส่ง signal มา —
  // สร้าง controller ให้เองเพื่อให้ทุกงานที่ in-flight ยกเลิกได้เหมือนกันหมด ไม่มีงานที่ยกเลิกไม่ได้
  // ถ้า caller ส่ง signal มา (มาจาก scheduleRequest) caller เป็นคนลงทะเบียน controller ใน registry เอง
  // — ตรงนี้ห้ามลงทะเบียน controller ใหม่ทับ ไม่งั้น cancelItem จะไป abort ตัวที่ไม่มีใครฟัง
  const ownController = signal ? null : new AbortController();
  const sig = signal ?? ownController!.signal;
  if (ownController) inflightControllers.set(item.id, ownController);

  try {
    throwIfAborted(sig);
    if (isVideoMode(item.mode)) {
      item.url = await requestVideo(item, sig);
    } else if (item.mode === "audio") {
      item.url = await requestAudio(item, sig);
    } else if (item.mode === "tts") {
      item.url = await requestTts(item, sig);
    } else {
      const m = state.models.find(x => x.id === item.model);
      const outs = m?.architecture?.output_modalities || [];
      // โมเดล image-only (เช่น Grok Imagine) เรียกผ่าน chat/completions ไม่ได้
      // ("No endpoints found that support the requested output modalities") ต้องใช้ Image API แทน
      if (outs.length && !outs.includes("text")) {
        item.url = await requestViaImageAPI(item, sig);
      } else {
        item.url = await requestViaChat(item, sig);
      }
    }
    item.status = "done";
  } catch (e) {
    // ผู้ใช้ยกเลิกเอง — ไม่ใช่ error: ห้ามนับสถิติโมเดล ห้าม autoSave ห้ามแจ้งเตือน "งานล้มเหลว"
    // และ finalizeCancelled ไม่แตะ item.jobId เลย (INVARIANT: video job ที่จ่ายเงินแล้วต้อง resume ได้)
    if (sig.aborted || isAbortError(e)) {
      finalizeCancelled(item, cancelReasons.get(item.id) ?? "user");
      // ตั้งใจไม่เรียก notifyJobSettled() ตามกฎข้อ 4 ของ contract (งานที่ยกเลิกเองไม่ใช่ทั้งสำเร็จและล้มเหลว)
      // แต่ต้องหด total ของ batch ลง 1 แทน (T19) ไม่งั้น batch.settled ไม่มีวันถึง batch.total → entry ค้างใน
      // `batches` ถาวรและงานที่เหลือเสร็จแล้วเงียบสนิท — dropFromNotifyBatch ยิงสรุปให้เองถ้าการหดครั้งนี้
      // ทำให้ batch ครบพอดี เรียกได้ทุกโหมด (batchId เป็น null สำหรับโหมดที่ไม่ notifiable — ฟังก์ชัน no-op ให้)
      dropFromNotifyBatch(batchId);
      return;
    }
    item.status = "error";
    item.errMsg = errMsg(e);
  } finally {
    inflightControllers.delete(item.id);
  }
  recordModelStat(item.model, item.status === "done");
  // ลบออกจาก pending-job ledger เมื่อไม่มีอะไรให้ resume ต่อแล้วเท่านั้น: done เสมอ, หรือ error ที่ item.jobId
  // ถูกเคลียร์ไปแล้ว (fail ถาวร/ต้อง submit ใหม่) — ส่วน error ที่ยังมี jobId ค้างอยู่ (เช่น timeout, โหลดไฟล์พลาด)
  // ต้องคง entry ไว้ เพราะ "ลองใหม่" ยัง resume งานเดิมได้โดยไม่จ่ายซ้ำ (ดู addPendingJob ใน requestVideo/requestAudio)
  if (item.status === "done" || (item.status === "error" && !item.jobId)) removePendingJob(item.id);
  // ติดดาวคืนเมื่อ item เพิ่งกลายเป็น done — คีย์โปรดผูกกับ status จึงตรงเฉพาะตอนนี้ ไม่ใช่ตอน addToGallery
  restoreFavoriteOnSettle(item);
  // item ถูก mutate ตรงๆ ใน array ของโหมดต้นทาง — broadcast ทีเดียวพอ ทุกโหมดได้ state ถูกต้อง
  mutate();
  if (item.status === "done") autoSaveItem(item); // fire-and-forget — ไม่บล็อก UI, error แค่ toast เตือน
  // F2: เก็บลง IndexedDB ต่อจาก Auto Save — ต้องอยู่ "หลัง" autoSaveItem เสมอ เพราะ Auto Save เป็นสิ่งที่ผู้ใช้
  // ตั้งใจเปิดไว้เพื่อเอาไฟล์ลงเครื่องจริง ห้ามให้ storage layer ที่เป็น cache แย่งคิว I/O ไปก่อน
  // fire-and-forget เหมือนกัน: เขียนพลาด/quota เต็ม ต้องไม่ทำให้ item ที่ done แล้วกลายเป็น error
  if (item.status === "done") persistItemToGallery(item);
  // แจ้งเตือน desktop/title flicker เฉพาะงานที่ใช้เวลานาน (video/cinematic/audio/tts) — ภาพนิ่งเร็วพอไม่ต้องรบกวน
  if (isVideoMode(item.mode) || item.mode === "audio" || item.mode === "tts") notifyJobSettled(item, batchId);
}

// ---------- model reliability stats (session-only) ----------
/** นับสำเร็จ/ล้มเหลวต่อโมเดลหลังยิง request จริงเท่านั้น — เรียกจาก runRequest เดียว ครอบคลุมทุก path (image/video/audio) */
function recordModelStat(modelId: string, ok: boolean) {
  const stat = state.modelStats[modelId] ?? (state.modelStats[modelId] = { ok: 0, fail: 0 });
  if (ok) stat.ok++; else stat.fail++;
}

// ---------- F2: gallery persistence wiring (IndexedDB) ----------
/**
 * ชั้นต่อสายระหว่าง generation flow กับ storage layer ใน galleryStore.ts (T6/T7)
 * galleryStore ไม่แตะ AppState/mutate() เลยโดยตั้งใจ — ทุกอย่างที่ต้องคุยกับ state อยู่ตรงนี้ที่เดียว
 *
 * PRIVACY: ทุก path ผ่าน saveItem/loadItems ซึ่งเช็ค isGalleryPersistEnabled() ให้แล้ว (default = ปิด)
 * ที่นี่ **ห้ามเปิด opt-in ให้เอง** — ไม่มีการเรียก setGalleryPersistEnabled() ในไฟล์นี้แม้แต่ที่เดียว
 *
 * key ของ record เก็บไว้ใน map ข้างนอก GenItem (ไม่เพิ่มฟิลด์ใน types.ts) เพราะมันเป็น handle ของ storage
 * ล้วนๆ ไม่ใช่ข้อมูลของ item: ไม่ต้อง export, ไม่ต้องเข้า session snapshot, ไม่ต้องให้ UI เห็น
 * และ item ที่ยังไม่เคยถูกเซฟก็ไม่มี entry — ความหมายเดียวกับ persistKey === undefined
 */
const persistKeys = new Map<number, string>();

/**
 * T24/#3: ผู้ใช้ปิด opt-in → `setGalleryPersistEnabled(false)` ลบ record ทุกชิ้นจาก IndexedDB ไปแล้ว
 * แต่ `persistKeys` ยังถือ key ของ record ที่ไม่มีอยู่จริงค้างไว้ทั้งหมด ไม่ใช่ข้อมูลรั่ว (in-memory ล้วน
 * ไม่มี PII — key เป็นแค่ `mode:timestamp:random`) แต่ทำให้ `syncFavoriteToGallery` เดินเข้า branch
 * "เคยเซฟแล้ว" ไปเรียก setFavorite() กับ key ที่ตายแล้วหนึ่งรอบก่อนจะ self-heal (setFavorite คืน false
 * แล้ว map ถึงจะถูกลบ) — ล้างทิ้งตรงนี้เลยชัดกว่ารอ self-heal
 *
 * ล้าง high-water mark ด้วย: record หายหมดแล้ว ไม่มี id ไหนบนดิสก์ให้ต้องกันชนอีก ถ้าปล่อยค้างไว้
 * เซสชันหน้าจะยกพื้น s.seq ขึ้นไปโดยไม่มีเหตุผล
 *
 * ลงทะเบียนที่ module scope — เกิดครั้งเดียวตอน actions.ts ถูกโหลด ไม่ต้อง unsubscribe
 * (ทำผ่าน registry ใน galleryStore.ts เพราะ KeyModal.tsx เป็นจุดเรียก setGalleryPersistEnabled จุดเดียว
 * และไฟล์นั้นอยู่นอกขอบเขตงานนี้ — galleryStore ก็ import actions.ts ไม่ได้ จะเป็น cycle)
 */
onGalleryPersistDisabled(() => {
  persistKeys.clear();
  clearGalleryMaxId();
});

/**
 * คิว serialize การเขียนลง IndexedDB ทีละชิ้น — เหตุผลเดียวกับ autoSaveChain แต่คนละคิว
 * (write ลงดิสก์ผู้ใช้กับ write ลง IndexedDB ไม่ควรบล็อกกันเอง)
 *
 * ที่สำคัญกว่านั้น: saveItem() รัน evictIfNeeded() ให้ในตัวอยู่แล้ว และ evictIfNeeded ทำ getAll() ทั้ง store
 * ถ้าปล่อยให้ batch 30 ชิ้นยิง saveItem พร้อมกันหมด จะได้ full-scan 30 รอบซ้อนกันบน blob หลายสิบ MB
 * การต่อคิวทำให้ eviction เกิดทีละรอบตามลำดับ = ไม่ต้องมี throttle/debounce แยกอีกชั้น
 * (ห้ามเรียก evictIfNeeded() ซ้ำหลัง saveItem — จะกลายเป็น full-scan สองรอบต่อชิ้น)
 */
let galleryPersistChain: Promise<void> = Promise.resolve();

/**
 * เซฟผลลัพธ์หนึ่งชิ้นลง IndexedDB — fire-and-forget โดยเจตนา ห้าม await ใน path ที่ผู้ใช้รออยู่
 * saveItem() ไม่ throw และคืน null เมื่อไม่ได้เซฟ (opt-in ปิด / MIME ไม่ใช่ media / เกินโควตา) ซึ่งเป็นเคสปกติ
 * ทั้งหมด — ห้าม toast error และห้ามแตะ item.status เด็ดขาด ไม่งั้น storage เต็มจะทำให้ผลงานที่สำเร็จแล้ว
 * กลายเป็น error ในสายตาผู้ใช้ (item ที่จ่ายเงินไปแล้วต้องแสดงผลได้เสมอ)
 */
function persistItemToGallery(item: GenItem) {
  galleryPersistChain = galleryPersistChain.then(async () => {
    const key = await saveItem(item);
    if (key) {
      persistKeys.set(item.id, key);
      // T24/#1: high-water mark ของ id ที่ลงดิสก์แล้ว — เซสชันหน้าอ่านค่านี้แบบ sync ตอนบูตเพื่อยกพื้น
      // s.seq ให้พ้น id ที่กำลังจะกู้ ก่อนที่ผู้ใช้จะกด Generate ทัน (ดู reconcilePendingJobs)
      bumpGalleryMaxId(item.id);
    }
  }, () => {});
}

/**
 * ซิงก์ค่าดาวลงดิสก์หลังผู้ใช้กดใน UI
 *
 * toggleFavorite() ไม่ได้แก้ item เดียว — มันเซ็ตค่าเดียวกันให้ **ทุก item ที่ favoriteKeyOf ตรงกัน**
 * ในโหมดนั้น (ลายนิ้วมือของ prompt/model/ratio/duration/audio ไม่ใช่ id) ดังนั้นต้องวนตาม item ที่ถูกแตะจริง
 * ยิง setFavorite ตัวเดียวจะเหลือ record พี่น้องในดิสก์ที่ favorite ไม่ตรงกับ UI แล้วโดน evict คนละจังหวะ
 * (eviction เรียงลำดับตัดจาก favorite **ในดิสก์** ไม่ใช่ใน state)
 *
 * item ที่ไม่มี key = ยังไม่เคยถูกเซฟ (opt-in เพิ่งเปิดหลัง item เกิด) → เซฟตอนนี้เลย saveItem อ่าน
 * item.favorite ที่ mutate() เพิ่งอัปเดตไปแล้วเอง ค่าที่ลงดิสก์จึงถูกต้องตั้งแต่แรกเขียน
 * ต่อท้ายคิวเดียวกับ save เพื่อไม่ให้ setFavorite แซงหน้า saveItem ของ item เดียวกันที่ยังเขียนไม่เสร็จ
 */
function syncFavoriteToGallery(touched: GenItem[]) {
  if (!isGalleryPersistEnabled()) return;
  const snapshot = touched.map(it => ({ item: it, favorite: !!it.favorite }));
  galleryPersistChain = galleryPersistChain.then(async () => {
    for (const { item, favorite } of snapshot) {
      const key = persistKeys.get(item.id);
      if (key) {
        // false = record ถูก evict ไปแล้ว — ไม่ rollback state ดาวใน UI ยังเป็นความจริงของเซสชันนี้
        const ok = await setFavorite(key, favorite);
        if (!ok) persistKeys.delete(item.id);
      } else if (item.status === "done") {
        const fresh = await saveItem(item);
        if (fresh) {
          persistKeys.set(item.id, fresh);
          bumpGalleryMaxId(item.id); // เพิ่งลงดิสก์ครั้งแรกที่นี่ — ต้องยกพื้นเหมือน persistItemToGallery
        }
      }
    }
  }, () => {});
}

/**
 * ลบ record ของ item ที่หลุดออกจากแกลเลอรีไปแล้วออกจาก IndexedDB ด้วย (T22)
 *
 * ปัญหาที่แก้: F2 เขียน record ลงดิสก์ตอน item เสร็จ แต่ตอนผู้ใช้ล้างแกลเลอรี record ยังค้างอยู่จนกว่าจะโดน
 * eviction ตัดทิ้งเอง = กินพื้นที่เครื่องต่อ และ rehydrateGallery() ตอน reload จะดึงของที่ผู้ใช้ลบไปแล้วกลับมา
 *
 * === ทำไมไม่ใช้ clearMode(mode) ทั้งที่มีให้ ===
 * clearMode() ลบ record **ทั้งโหมด** แต่ resetModeGallery() ข้าม item ที่ favorite ไว้โดยเจตนา
 * (ผู้ใช้กดดาว = ตั้งใจเก็บ) ถ้าเรียก clearMode ตรงๆ ของที่ปักหมุดจะหายจากดิสก์ทั้งที่การ์ดยังอยู่บนจอ
 * แล้ว reload ครั้งถัดไปมันก็หายไปจริงๆ — ขัดทั้ง UI และ EVICTION POLICY ที่ให้ favorite รอดก่อนเสมอ
 * จึงวน deleteItem() เฉพาะ id ที่ถูกลบจริงแทน ซึ่งได้ผลลัพธ์ตรงกับ in-memory เป๊ะโดยนิยาม
 * (clearMode ยังมีที่ใช้อยู่ — เคสที่ต้องล้างยกโหมดจริงๆ ไม่มีข้อยกเว้น ซึ่งตอนนี้ยังไม่มี call site)
 *
 * KEY MAPPING: record ไม่ได้ key ด้วย GenItem.id (id มาจาก ++s.seq ที่รีเซ็ตทุก reload) — ใช้ persistKeys
 * ซึ่ง persistItemToGallery/rehydrateGallery เติมไว้ให้แล้ว item ที่ไม่มี entry = ยังไม่เคยลงดิสก์
 * (opt-in ปิดตอนมันเกิด / ยังเซฟไม่เสร็จ / เกินโควตา) → ไม่มีอะไรให้ลบ ข้ามไป
 *
 * ต่อท้าย galleryPersistChain คิวเดียวกับ save/setFavorite เพื่อไม่ให้ลบแซงหน้า saveItem ของ item เดียวกัน
 * ที่ยังเขียนไม่เสร็จ (ไม่งั้นจะลบก่อนแล้ว record โผล่กลับมาทีหลัง) — และเพราะเป็นการ "อ่าน persistKeys ทีหลัง"
 * จึงเก็บ id ไว้เฉยๆ ไม่ snapshot key ตรงนี้ เผื่อ saveItem ที่ยังค้างคิวอยู่เพิ่ง set key ให้
 *
 * fire-and-forget + ไม่ throw: deleteItem() กลืน error ให้อยู่แล้ว และผู้ใช้ลบการ์ดไปแล้วในสายตาเขา
 * การเด้ง toast error เพราะ storage layer ที่เป็นแค่ cache ลบไม่ผ่านไม่ช่วยอะไร
 */
function forgetPersistedItems(ids: number[]) {
  // opt-in ปิด = ไม่เคยมี record ให้ลบ และ persistKeys ก็ว่าง — ออกเงียบๆ ไม่แตะ IndexedDB เลย
  if (!ids.length || !isGalleryPersistEnabled()) return;
  galleryPersistChain = galleryPersistChain.then(async () => {
    for (const id of ids) {
      const key = persistKeys.get(id);
      if (!key) continue;
      await deleteItem(key);
      persistKeys.delete(id);
    }
  }, () => {});
}

/**
 * โหลดผลลัพธ์ที่เก็บไว้กลับเข้าแกลเลอรีตอนบูต — เรียกครั้งเดียวจาก reconcilePendingJobs()
 * (จุดบูตเดียวใน actions.ts ที่ StudioApp เรียกให้อยู่แล้ว)
 *
 * ORDER: loadItems() คืนของเรียงเก่า→ใหม่ แต่ addToGallery() ใช้ unshift = แกลเลอรีเรียงใหม่→เก่า
 * ของที่กู้มาทั้งหมดเก่ากว่าทุกอย่างในเซสชันนี้ จึงต้อง **push ต่อท้าย** และ push แบบใหม่→เก่า (reverse)
 * ไม่ใช้ addToGallery เพราะมัน unshift และจะไปเขียนทับ favorite จากลายนิ้วมือ ทั้งที่ค่าที่ถูกต้อง
 * ของ record คือค่าที่ผู้ใช้เคยกดไว้จริง (r.favorite) ซึ่งแม่นกว่า
 *
 * DEDUPE: ตอนที่ฟังก์ชันนี้ทำงาน อาจมี item อยู่ใน state แล้วจาก reconcilePendingJobs (job ที่ resume ต่อ)
 * และผู้ใช้อาจกดสร้างงานใหม่ทันได้แล้ว — กันซ้ำสองชั้น
 *  1. ข้าม record ที่ id ตรงกับ item ที่มีอยู่แล้ว (job เดิมที่ resume มา = ตัวเดียวกัน ของสดกว่า)
 *  2. ข้าม record ที่ลายนิ้วมือ (favoriteKeyOf) ซ้ำกับ item ที่มีอยู่แล้วในโหมดนั้น — กันเคสผู้ใช้กด
 *     "สร้างใหม่" ด้วยพารามิเตอร์เดิมทันทีตอนบูต แล้วเห็นการ์ดหน้าตาเหมือนกันเป๊ะสองใบ
 * (session snapshot ไม่กู้ media กลับมา — ดู CLAUDE.md — จึงไม่มีทางชนกันจากทางนั้น)
 *
 * URL: loadItems() สร้าง object URL ให้แล้ว ต้อง registerBlobUrl() ทุกชิ้น ไม่งั้นไม่มีใคร revoke
 * (releaseAllBlobUrls ตอนปิดแท็บ / releaseBlobUrls ตอน resetModeGallery ทำงานจาก registry ล้วน)
 *
 * SEQ: r.id มาจาก s.seq ของเซสชันก่อน แต่ s.seq รีเซ็ตเป็น 0 ทุก reload — ต้อง bump ให้พ้น id สูงสุด
 * ที่กู้มา **ก่อน** item ใหม่ชิ้นแรกของเซสชันจะเกิด ไม่งั้น id ชนกันแล้ว toggleFavorite/releaseBlobUrls/
 * cancelItem ซึ่งค้นด้วย id จะไปโดน item ผิดตัว (pattern เดียวกับ resumable ใน reconcilePendingJobs)
 */
/**
 * promise ที่ resolve เมื่อ rehydrateGallery() รอบบูตทำงานจบ (สำเร็จหรือไม่ก็ตาม) — pruneOrphanFavorites()
 * ต้องรอตัวนี้ก่อน ไม่งั้นจะ prune ตอนแกลเลอรียังว่างแล้วลบดาวทิ้งหมด (ดู pruneOrphanFavorites)
 * ตั้งเป็น resolved ไว้ก่อน: ถ้า opt-in ปิด rehydrateGallery() return ทันทีและไม่มีอะไรให้รอ
 */
let galleryRehydrated: Promise<void> = Promise.resolve();

export async function rehydrateGallery() {
  if (!isGalleryPersistEnabled()) return;
  const modes = Object.keys(state.modes) as Mode[];
  const loaded = await Promise.all(modes.map(m => loadItems(m)));

  let restoredCount = 0;
  mutate(s => {
    for (const rows of loaded) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        const ms = s.modes[r.mode];
        // T24/#2: dedupe ด้วย id อย่างเดียว — id เชื่อถือได้แล้วหลัง #1 (s.seq ถูกยกพื้นก่อนยิง rehydrate)
        // ชั้น favoriteKeyOf ถูกถอดทิ้ง: record ไม่มีฟิลด์ `status` (allowlist ของ PersistedGenItem ตัดออก)
        // favoriteKeyOf(record) จึงคืน "x" เสมอ ส่วน item ที่ done คืน "d" = ไม่มีวันตรงกัน (dead code)
        // และ **ห้ามแก้ให้มันทำงาน**: ลายนิ้วมือไม่มี id อยู่ในนั้น batch ที่ prompt/model/ratio เดียวกัน
        // (count=3) จึงมีลายนิ้วมือเหมือนกันทั้งชุด — ถ้าเทียบจริงจะกู้ขึ้นมาได้ใบเดียวจากสามใบ
        const dupe = ms.images.some(x => x.id === r.id);
        if (dupe) { URL.revokeObjectURL(r.url); continue; }

        registerBlobUrl(r.id, r.url);
        if (r.id > s.seq) s.seq = r.id;
        bumpGalleryMaxId(r.id); // ซิงก์ high-water mark กับสิ่งที่อยู่บนดิสก์จริง เผื่อคีย์หาย/ถูกลบ
        persistKeys.set(r.id, r.key);
        ms.images.push({
          id: r.id,
          status: "done",
          url: r.url,
          prompt: r.prompt,
          model: r.model,
          modelName: r.modelName,
          ratio: r.ratio,
          duration: r.duration,
          audio: r.audio,
          jobStatus: "",
          jobId: null,
          startedAt: r.savedAt,
          errMsg: "",
          mode: r.mode,
          refs: [], // โดยเจตนา: ref ที่ผู้ใช้อัปโหลดเองไม่เคยลงดิสก์ (ดูหัว galleryStore.ts)
          parentId: r.parentId,
          negPrompt: r.negPrompt,
          bakeOffGroupId: r.bakeOffGroupId || undefined,
          favorite: r.favorite,
          ttsVoiceId: r.ttsVoiceId,
        });
        restoredCount++;
      }
    }
  });

  if (restoredCount > 0) toast(`กู้ผลงานที่เก็บไว้กลับมาแล้ว ${restoredCount} ชิ้นค่ะ`);
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
    const ext = isVideoMode(item.mode) ? "mp4" : (item.mode === "audio" || item.mode === "tts") ? "mp3" : state.lbFormat;
    const blob = await urlToBlob(
      isVideoMode(item.mode) || item.mode === "audio" || item.mode === "tts" ? item.url! : await convertDataUrl(item.url!, state.lbFormat)
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
      toast("Auto Save หยุดทำงาน: " + item.autoSaveErrMsg, "error");
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
    toast("การเชื่อมต่อ Auto Save หลุดไปแล้วค่ะ — เชื่อมต่อ directory ใหม่ก่อนถึงจะลองเซฟซ้ำได้", "error");
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
    if (e instanceof Error && e.name !== "AbortError") toast(errMsg(e), "error");
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
    toast(errMsg(e), "error");
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

// ---------- Google Drive (manual "Save to Drive" — คนละเรื่องกับ Auto Save) ----------
/** คิว serialize การ upload ทีละไฟล์ — เหตุผลเดียวกับ autoSaveChain (กัน concurrent write ทับกัน) */
let driveSaveChain: Promise<void> = Promise.resolve();
function enqueueDriveSave(task: () => Promise<void>): Promise<void> {
  driveSaveChain = driveSaveChain.then(task, task);
  return driveSaveChain;
}

async function performDriveSave(item: GenItem) {
  item.driveSaveStatus = "pending";
  item.driveSaveErrMsg = "";
  mutate();
  try {
    const ext = isVideoMode(item.mode) ? "mp4" : (item.mode === "audio" || item.mode === "tts") ? "mp3" : state.lbFormat;
    const blob = await urlToBlob(
      isVideoMode(item.mode) || item.mode === "audio" || item.mode === "tts" ? item.url! : await convertDataUrl(item.url!, state.lbFormat)
    );
    await uploadToDrive(blob, randomFileName(ext));
    item.driveSaveStatus = "saved";
    item.driveSaveErrMsg = "";
  } catch (e) {
    item.driveSaveStatus = "failed";
    item.driveSaveErrMsg = errMsg(e);
    if (e instanceof DrivePermissionError) {
      // token หมดอายุจริง — ตัดการเชื่อมต่อทั้งระบบกันอัพโหลดพลาดซ้ำทุกไฟล์ถัดไป ต้องเชื่อมต่อใหม่เอง
      mutate(s => { s.driveConnected = false; });
      toast("Google Drive หลุดการเชื่อมต่อ: " + item.driveSaveErrMsg, "error");
    }
  }
  mutate();
}

export function isDriveSaveConfigured(): boolean {
  return isDriveConfigured();
}

/** เปิด OAuth consent ใหม่ — ต้องเรียกจาก user gesture (onClick) เท่านั้น */
export async function connectDrive() {
  mutate(s => { s.driveConnecting = true; });
  try {
    await gdriveConnect();
    mutate(s => { s.driveConnected = true; });
    toast("เชื่อมต่อ Google Drive แล้วค่ะ");
  } catch (e) {
    toast(errMsg(e), "error");
  } finally {
    mutate(s => { s.driveConnecting = false; });
  }
}

export function disconnectDrive() {
  gdriveDisconnect();
  mutate(s => { s.driveConnected = false; });
  toast("ยกเลิกการเชื่อมต่อ Google Drive แล้วค่ะ");
}

/** เซฟทีละชิ้น — กดจากปุ่มบน card ค่ะ ขอ user เชื่อมต่อก่อนถ้ายังไม่ได้เชื่อมต่อ */
export function saveItemToDrive(item: GenItem) {
  if (!item.url) return;
  if (!isDriveConnected()) {
    toast("กรุณาเชื่อมต่อ Google Drive ก่อนค่ะ", "error");
    return;
  }
  enqueueDriveSave(() => performDriveSave(item));
}

/** เซฟหลายชิ้นพร้อมกัน (จาก multi-select bar) — เรียงคิวทีละไฟล์เหมือน retryFailedAutoSaves */
export function saveSelectedToDrive() {
  if (!isDriveConnected()) {
    toast("กรุณาเชื่อมต่อ Google Drive ก่อนค่ะ", "error");
    return;
  }
  const ms = cur();
  const items = [...ms.selected].map(id => ms.images.find(x => x.id === id)).filter((x): x is GenItem => !!x && x.status === "done" && !!x.url);
  if (!items.length) return;
  for (const item of items) enqueueDriveSave(() => performDriveSave(item));
  toast(`กำลังอัพโหลดขึ้น Drive ${items.length} ไฟล์ค่ะ~`);
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
async function requestVideo(item: GenItem, signal: AbortSignal): Promise<string> {
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
      signal,
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
    // abortableSleep ไม่ใช่ sleep() เปล่าๆ — ไม่งั้นการยกเลิกจะช้าได้ถึง VIDEO_POLL_MS_MAX (~20s)
    await abortableSleep(resumed ? 1500 : videoPollIntervalMs(Date.now() - pollStartedAt), signal);
    resumed = false;
    if (Date.now() > deadline) {
      const timeoutMin = Math.round(timeoutMs / 60000);
      throw new Error(`หมดเวลารอผลลัพธ์ (${timeoutMin} นาที) — กด "ลองใหม่" เพื่อเช็คงานเดิมต่อได้ค่ะ (ไม่เสียเงินเพิ่ม)`);
    }
    const pr = await fetch("https://openrouter.ai/api/v1/videos/" + item.jobId, {
      headers: { "Authorization": "Bearer " + state.apiKey },
      signal,
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
      const vres = await fetch(vurl, { headers: { "Authorization": "Bearer " + state.apiKey }, signal });
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
async function requestAudio(item: GenItem, signal: AbortSignal): Promise<string> {
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
    signal,
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
  // abort ระหว่างสตรีม: signal ที่ส่งให้ fetch ทำให้ reader.read() reject เองอยู่แล้ว แต่เช็คซ้ำต้นลูปด้วย
  // เผื่อ abort มาถึงจังหวะที่ chunk เพิ่ง resolve พอดี — จะได้ไม่ decode/สะสม chunk ต่อโดยเปล่าประโยชน์
  try {
    for (;;) {
      throwIfAborted(signal);
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
  } finally {
    // ปล่อย lock ของ reader เสมอ ไม่ให้ค้างเมื่อออกจากลูปด้วย abort/error กลางคัน
    reader.cancel().catch(() => {});
  }
  if (!chunks.length) throw new Error("ไม่พบเสียงใน response");
  const blobUrl = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "audio/mpeg" }));
  registerBlobUrl(item.id, blobUrl);
  return blobUrl;
}

/**
 * อ่าน error message จาก response ที่ไม่ ok — เช็ค Content-Type ก่อนเลือกวิธี parse เพียงแบบเดียว
 * (ห้ามเรียกทั้ง .json() และ .text() บน response เดียวกัน — body stream อ่านซ้ำไม่ได้):
 *  - "application/json" → parse แล้วอ่าน error.message
 *  - อื่นๆ (เช่น text/html จาก error page ของ gateway) → อ่านเป็น text, ตัด HTML tag ทิ้ง แล้ว truncate
 *    ไม่เกิน 200 ตัวอักษร กัน error page ดิบยาวๆ โผล่ใน toast
 * คืนข้อความไทยขึ้นต้นด้วย "การสร้างเสียงพูดล้มเหลว" ให้สอดคล้องกับ "การสร้างวิดีโอล้มเหลว"/"การสร้างเพลงล้มเหลว" เดิม
 */
async function parseTtsErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.error?.message || (typeof data?.error === "string" ? data.error : "");
    return "การสร้างเสียงพูดล้มเหลว" + (detail ? ": " + detail : " (HTTP " + res.status + ")");
  }
  const raw = await res.text().catch(() => "");
  const stripped = raw.replace(/<[^>]*>/g, "").trim();
  const truncated = stripped.length > 200 ? stripped.slice(0, 200) + "…" : stripped;
  return "การสร้างเสียงพูดล้มเหลว" + (truncated ? ": " + truncated : " (HTTP " + res.status + ")");
}

// TTS ยิงผ่าน /api/v1/audio/speech ตรงๆ (คนละ endpoint กับ Lyria ที่ใช้ chat/completions แบบ stream) —
// response เป็น audio bytes เดี่ยวๆ ไม่ใช่ SSE stream จึงอ่านเป็น blob ตรงได้เลย ไม่ต้อง decode chunk ทีละก้อน
async function requestTts(item: GenItem, signal: AbortSignal): Promise<string> {
  item.startedAt = Date.now();
  mutate();
  // ไม่มี job id ให้ resume เหมือน requestAudio — ยัง track ไว้ใน ledger เพื่อเห็นเป็นงานที่หายไปถ้าปิดแท็บกลางคัน
  trackPendingJob(item);
  const voiceId = item.ttsVoiceId;
  if (!voiceId) throw new Error("กรุณาเลือกเสียงพากย์ก่อนสร้างเสียงค่ะ");
  const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: item.model, input: item.prompt, voice: voiceId, response_format: "mp3" }),
    signal,
  });
  if (!res.ok) throw new Error(await parseTtsErrorMessage(res));
  const blob = await res.blob();
  if (!blob.size) throw new Error("ไม่พบเสียงใน response");
  const blobUrl = URL.createObjectURL(blob);
  registerBlobUrl(item.id, blobUrl);
  return blobUrl;
}

async function requestViaImageAPI(item: GenItem, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { "Authorization": "Bearer " + state.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: item.model, prompt: item.prompt, n: 1, aspect_ratio: item.ratio }),
    signal,
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

async function requestViaChat(item: GenItem, signal: AbortSignal): Promise<string> {
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
    signal,
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
  // T24/#6: เส้นแบ่ง "ยิงใหม่" vs "resume" อยู่ที่ jobId ตัวเดียว
  //  - มี jobId → requestVideo จะ poll งานเดิมต่อ ไม่ submit ใหม่ ไม่จ่ายเพิ่ม → **ห้าม** นับซ้ำ
  //    (นี่คือ label "ทำต่อ (ไม่เสียเงินเพิ่ม)" ที่การ์ดโชว์อยู่ — ดู cardPropsEqual ใน Gallery.tsx)
  //  - ไม่มี jobId → submit request ใหม่ทั้งใบ จ่ายเต็มราคาอีกรอบ → ต้องนับเพิ่ม
  if (!item.jobId) markNewPaidAttempt(item);
  item.status = "loading";
  item.errMsg = "";
  // เคลียร์ร่องรอยการยกเลิกรอบก่อน — item ที่ cancelled แล้วกดสร้างใหม่ต้องไม่เหลือ cancelReason/cancelledAt ค้าง
  delete item.cancelReason;
  delete item.cancelledAt;
  mutate();
  void scheduleRequest(item);
}

/**
 * Retry พร้อมเปลี่ยน model/ratio เฉพาะ item นี้ชิ้นเดียว — ไม่แตะ selection ของ Sidebar เลย
 * model ต้องมาจาก modelsForMode(item.mode) เสมอ (โหมดของ item เอง ไม่ใช่ tab ที่เปิดอยู่ตอนนี้)
 * runRequest อ่าน routing (chat/completions vs image-only API vs video vs audio) จาก item.model สดใหม่ทุกครั้งอยู่แล้ว
 * จึงแค่เปลี่ยนฟิลด์ก่อนเรียกซ้ำ ก็ได้ path ที่ถูกต้องสำหรับโมเดลใหม่โดยอัตโนมัติ
 */
export function retryWithOverride(item: GenItem, modelId: string, ratio: string) {
  const model = modelsForMode(item.mode).find(m => m.id === modelId);
  if (!model) { toast("ไม่พบโมเดลนี้ในโหมดของภาพนี้แล้วค่ะ", "error"); return; }
  if (isVideoMode(item.mode) && modelRequiresRefImage(model.id) && !item.refs[0]) {
    toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video) — ภาพนี้ไม่มี ref ที่แนบไว้ตอนสร้าง", "error");
    return;
  }
  // โมเดล/ratio เปลี่ยนไป — jobId เดิม (ถ้ามี) ผูกกับ request เก่า resume ต่อไม่ได้แล้ว ลบออกจาก ledger ทิ้งไปเลย
  // (จะได้ entry ใหม่จาก addPendingJob ตอน submit งานใหม่สำเร็จ)
  removePendingJob(item.id);
  // T24/#6: นี่คือ request ใหม่ที่จ่ายเงินเพิ่มจริง (โมเดล/ratio เปลี่ยน จึง submit ใหม่ ไม่ใช่ resume ของเดิม)
  // ต้อง bump ก่อน scheduleRequest ไม่งั้น recordSpend จะเห็นคีย์เดิมแล้วข้าม = ยอดต่ำกว่าความจริง
  markNewPaidAttempt(item);
  mutate(() => {
    item.jobId = null;
    item.model = model.id;
    item.modelName = model.name || model.id;
    item.ratio = ratio;
    item.status = "loading";
    item.errMsg = "";
    item.jobStatus = "";
    item.startedAt = null;
    // item ที่เคยถูกยกเลิกแล้วยิงใหม่ ต้องไม่เหลือ cancelReason/cancelledAt ค้าง (คู่กับ status เสมอ)
    delete item.cancelReason;
    delete item.cancelledAt;
  });
  void scheduleRequest(item);
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
  if (!model) { toast("ไม่พบโมเดลเดิมของภาพนี้แล้วค่ะ (อาจถูกถอดออกจาก OpenRouter)", "error"); return; }
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
    addToGallery(s, item.mode, newItem);
  });
  void scheduleRequest(newItem);
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
  if (!model) { toast("ไม่พบโมเดลเดิมของ scene นี้แล้วค่ะ (อาจถูกถอดออกจาก OpenRouter)", "error"); return; }

  autoExtendInFlight.add(item.id);
  mutate(); // broadcast ทันที ให้ปุ่มเปลี่ยนเป็น disabled/"กำลังจับเฟรม…" ระหว่างรอ capture
  try {
    const { dataUrl: frameDataUrl } = await captureVideoFrame(item.url);
    if (dataUrlByteSize(frameDataUrl) > MAX_REF_BYTES) {
      toast(`เฟรมที่จับได้ใหญ่เกิน ${Math.round(MAX_REF_BYTES / 1024 / 1024)}MB ค่ะ ลองใช้ TimeFrame & Extend เลือกเฟรมเองแทนนะคะ`, "error");
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
      addToGallery(s, "cinematic", newItem);
    });
    void scheduleRequest(newItem);
    toast("จับเฟรมสุดท้ายแล้ว กำลังสร้าง scene ถัดไปให้ค่ะ~");
  } catch (e) {
    toast("จับเฟรมสุดท้ายไม่สำเร็จ: " + errMsg(e) + " — ลองใช้ TimeFrame & Extend เลือกเฟรมเองแทนนะคะ", "error");
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
    } else if (item.mode === "audio" || item.mode === "tts") {
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

// ---------- favorites (F3) ----------
// cache ของคีย์โปรดต่อโหมด อ่านจาก localStorage ครั้งเดียวตอนถูกใช้ครั้งแรก แล้วถือไว้ใน memory
// (localStorage เป็น synchronous — ไม่ควรอ่านซ้ำทุกครั้งที่มี item ใหม่โผล่)
const favoriteKeyCache = new Map<Mode, Set<string>>();

function favoriteKeysFor(mode: Mode): Set<string> {
  let set = favoriteKeyCache.get(mode);
  if (!set) { set = new Set(loadFavorites(mode)); favoriteKeyCache.set(mode, set); }
  return set;
}

/**
 * item ที่เพิ่งเกิด/เพิ่งกู้กลับมา ตรงกับลายนิ้วมือที่ผู้ใช้เคยกดดาวไว้หรือเปล่า
 * เรียกจากจุดที่ item ได้ค่า prompt/model/ratio ครบแล้วเท่านั้น (ดู favoriteKeyOf ใน store.ts ว่าคีย์ประกอบจากอะไร)
 *
 * item ที่ยังไม่ done รับดาวคืนอัตโนมัติไม่ได้เลย: คีย์ของมันมี status = "x" ซึ่งไม่มีทางตรงกับคีย์ที่
 * toggleFavorite เขียนลง localStorage (เขียนเฉพาะคีย์ของ item ที่ done — ดู toggleFavorite) จึงกัน
 * การ์ด cancelled/error ไม่ให้รับดาวข้ามมาจาก twin ที่ done แล้วไปรอด "ล้างแกลเลอรี" (P2)
 */
export function isRememberedFavorite(item: GenItem): boolean {
  return item.status === "done" && favoriteKeysFor(item.mode).has(favoriteKeyOf(item));
}

/**
 * ทางเข้าเดียวของ item ใหม่สู่แกลเลอรี — ติดดาวคืนให้อัตโนมัติถ้าลายนิ้วมือของมันตรงกับที่ผู้ใช้เคยกดไว้
 * (นี่คือกลไกที่ทำให้ดาว "รอด reload" ได้โดยไม่ต้องพึ่ง F2/IndexedDB ซึ่งเป็น opt-in ที่ default ปิด)
 * ต้องเรียกภายใน mutate() เสมอ เพราะแก้ s.modes[...].images ตรงๆ
 *
 * item ส่วนใหญ่เข้ามาที่นี่ตอน status = "loading" จึงยังไม่เข้าเงื่อนไข — การติดดาวคืนจริงเกิดที่
 * restoreFavoriteOnSettle() ตอน runRequest ปิดงานเป็น done แทน (ดูเหตุผลใน isRememberedFavorite)
 * ที่ยังเช็คตรงนี้ด้วยเพราะมี path ที่ยัด item ซึ่ง done มาแล้วเข้าตรงๆ (scene เริ่มต้นของ cinematic)
 */
function addToGallery(s: AppState, mode: Mode, item: GenItem) {
  if (isRememberedFavorite(item)) item.favorite = true;
  s.modes[mode].images.unshift(item);
}

/**
 * ติดดาวคืนตอน item เพิ่งกลายเป็น done — เรียกจาก runRequest จุดเดียว (ภายใน mutate())
 * ต้องอยู่ตรงนี้ไม่ใช่ที่ addToGallery เพราะคีย์โปรดผูกกับ status = done (ดู favoriteKeyOf ใน store.ts)
 * ตอน addToGallery ถูกเรียก item ยังเป็น loading อยู่เสมอ คีย์จึงยังไม่ตรง
 */
function restoreFavoriteOnSettle(item: GenItem) {
  if (item.status === "done" && !item.favorite && isRememberedFavorite(item)) item.favorite = true;
}

/**
 * เคยเตือนผู้ใช้เรื่อง "ดาวเป็นของกลุ่ม" ไปแล้วหรือยังในเซสชันนี้ — เตือนครั้งเดียวพอ ไม่รบกวนซ้ำทุกคลิก
 * ตั้งใจไม่ persist: เป็นเรื่องความเข้าใจของผู้ใช้ ณ ตอนใช้งาน ไม่ใช่ข้อมูลที่ต้องรอด reload
 */
let groupFavoriteHintShown = false;

/**
 * ลบคีย์โปรดที่ไม่มี item ตัวจริงรองรับแล้ว ("คีย์กำพร้า") — เรียกครั้งเดียวตอนบูตจาก reconcilePendingJobs()
 *
 * ปัญหาที่แก้: ผู้ใช้กดดาว "a cat" แล้วใบนั้นหลุดจากแกลเลอรี (reload/สลับโหมด) โดยที่คีย์ยังค้างใน
 * localStorage → generate "a cat" ด้วย model/ratio เดิมอีกครั้ง ใบใหม่ติดดาวเองทั้งที่ผู้ใช้ไม่ได้กด
 *
 * === กับดัก "แกลเลอรีว่างตอนบูต" ===
 * แกลเลอรีเป็น memory-only ตอน prune ทำงานมันจึงว่างเสมอ ถ้า prune ตามสิ่งที่อยู่ในแกลเลอรีตรงๆ
 * ดาวจะถูกลบเกลี้ยงทุกครั้งที่เปิดแอป = พังหนักกว่าบั๊กเดิม จึงต้องรอ "แหล่งความจริง" ที่ถูกต้องก่อน:
 *
 *  - F2 เปิด → IndexedDB คือความจริง: await rehydrateGallery() ให้เสร็จก่อน แล้วคีย์ที่ไม่มี item
 *    ตัวจริงในแกลเลอรีหลังกู้เสร็จ = กำพร้าแน่นอน ลบได้เต็มปาก (แม่นที่สุด)
 *  - F2 ปิด → ไม่มีแหล่งความจริงใดๆ พิสูจน์ไม่ได้ว่าคีย์กำพร้าจริงไหม จึงตัดตามอายุแทน:
 *    คีย์ที่เก่ากว่า FAVORITE_TTL_MS ถือว่าหมดอายุ เพราะผลงานที่มันชี้ไปไม่มีทางยังอยู่ใน memory
 *    ของเซสชันไหนแล้ว (ไม่มี persist = ตายตอนปิดแท็บ) — เป็น upper bound ไม่ใช่การพิสูจน์ แต่ทำให้
 *    คีย์กำพร้าไม่สะสมไม่มีที่สิ้นสุด และผู้ใช้ที่กดดาวแล้ว reload ทันทีก็ยังได้ดาวคืนตามเจตนาเดิม
 */
const FAVORITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 วัน

export async function pruneOrphanFavorites() {
  const modes = Object.keys(state.modes) as Mode[];

  if (isGalleryPersistEnabled()) {
    // ต้องรอ rehydrate ให้จบก่อน ไม่งั้นจะ prune ตอนแกลเลอรียังว่าง = ลบดาวทิ้งหมด (ดูกับดักด้านบน)
    await galleryRehydrated;
    for (const mode of modes) {
      const live = new Set(state.modes[mode].images.filter(x => x.status === "done").map(x => favoriteKeyOf(x)));
      const keys = favoriteKeysFor(mode);
      const kept = [...keys].filter(k => live.has(k));
      if (kept.length === keys.size) continue;
      keys.clear();
      for (const k of kept) keys.add(k);
      saveFavorites(mode, kept);
    }
    return;
  }

  // F2 ปิด — ตัดตามอายุอย่างเดียว (ดูเหตุผลด้านบน) timestamp เก็บแยกคีย์ ไม่ปนกับตัวคีย์เอง
  const now = Date.now();
  const stamps = loadFavoriteStamps();
  let changed = false;
  for (const mode of modes) {
    const keys = favoriteKeysFor(mode);
    const kept = [...keys].filter(k => {
      const t = stamps[k];
      // ไม่มี timestamp = คีย์จากเวอร์ชันก่อนหน้าที่ยังไม่เคยประทับเวลา — ให้โอกาสรอบนี้ ประทับเวลาให้แล้วรอบหน้าค่อยตัด
      if (t === undefined) { stamps[k] = now; changed = true; return true; }
      return now - t < FAVORITE_TTL_MS;
    });
    if (kept.length === keys.size) continue;
    for (const k of [...keys]) if (!kept.includes(k)) { delete stamps[k]; }
    keys.clear();
    for (const k of kept) keys.add(k);
    saveFavorites(mode, kept);
    changed = true;
  }
  if (changed) saveFavoriteStamps(stamps);
}

/**
 * สลับสถานะ favorite ของ item หนึ่งชิ้น แล้ว persist ลง localStorage ทันที (ไม่รอ autosave 30s
 * เพราะผู้ใช้ที่กดดาวแล้วปิดแท็บทันทีต้องได้ดาวนั้นกลับมา)
 *
 * item ถูก tag ด้วยโหมดที่มันถูกสร้าง (item.mode) และผู้ใช้สลับโหมดระหว่างที่ยังมีงานค้างได้ จึงต้องไล่หา
 * ข้ามทุกโหมด ไม่ใช่แค่ cur() — เหมือนที่ retry/autoSave ทำ
 *
 * ทุก item ที่มีลายนิ้วมือเดียวกันในโหมดนั้นจะถูกสลับพร้อมกัน เพราะ persist layer แยกกันไม่ได้อยู่แล้ว
 * (คีย์เดียวกัน = ตอน reload จะติดดาวเหมือนกันหมด) — ให้ UI ตรงกับสิ่งที่จะเกิดหลัง reload ตั้งแต่ตอนกด
 * ผู้ใช้ไม่มีทางเดาพฤติกรรมนี้เองได้ จึง toast บอกจำนวนใบที่โดนจริงในครั้งแรกที่มันเกิด (ดู groupFavoriteHintShown)
 *
 * เขียนคีย์ลง localStorage เฉพาะ item ที่ status = done เท่านั้น (คีย์มี status อยู่ในตัว — ดู favoriteKeyOf)
 * ผู้ใช้ยังกดดาวใบ cancelled/error ได้ตามปกติ ดาวจะติดใน UI ของเซสชันนี้จริง แต่ไม่ถูกจำข้าม reload
 * ซึ่งถูกต้องตามความหมาย: ใบที่ไม่มีผลงานจริงไม่มีอะไรให้ "เก็บไว้" และการจำมันไว้คือต้นเหตุของ P2
 */
export function toggleFavorite(id: number) {
  // item ทุกชิ้นที่ถูกสลับค่าจริงในรอบนี้ — เก็บไว้ซิงก์ลง IndexedDB หลัง mutate() จบ (ดู syncFavoriteToGallery)
  const touched: GenItem[] = [];
  let hintCount = 0;
  mutate(s => {
    for (const mode of Object.keys(s.modes) as Mode[]) {
      const ms = s.modes[mode];
      const target = ms.images.find(x => x.id === id);
      if (!target) continue;

      const key = favoriteKeyOf(target);
      const next = !target.favorite;
      for (const it of ms.images) {
        if (favoriteKeyOf(it) === key) { it.favorite = next; touched.push(it); }
      }
      if (touched.length > 1 && !groupFavoriteHintShown) hintCount = touched.length;

      // ใบที่ยังไม่ done ไม่ต้องแตะ localStorage เลย — ดาวของมันเป็นเรื่องของเซสชันนี้เท่านั้น
      if (target.status !== "done") return;

      // ของที่เพิ่งกดต้องไปอยู่หน้าสุดเสมอ เพราะ saveFavorites ตัด cap จากท้าย = ตัดของเก่าสุดออกก่อน
      const keys = favoriteKeysFor(mode);
      keys.delete(key);
      // ตัด cap ที่นี่ด้วย ไม่ปล่อยให้ saveFavorites ตัดฝ่ายเดียว — ไม่งั้น cache ใน memory จะมีคีย์
      // ที่ไม่ได้อยู่บนดิสก์จริง แล้ว isRememberedFavorite จะตอบ true ให้คีย์ที่ reload แล้วหายไป (cache หลุดจากดิสก์)
      const ordered = (next ? [key, ...keys] : [...keys]).slice(0, MAX_FAVORITES_PER_MODE);
      keys.clear();
      for (const k of ordered) keys.add(k);
      saveFavorites(mode, ordered);

      // ประทับ/ลบเวลาให้ตรงกับลิสต์ที่เพิ่งเขียน — pruneOrphanFavorites() ตอน F2 ปิด ใช้ค่านี้ตัดคีย์หมดอายุ
      const stamps = loadFavoriteStamps();
      if (next) stamps[key] = Date.now(); else delete stamps[key];
      // คีย์ที่หลุด cap 300 ไปแล้วไม่มีใครอ้างถึงอีก — เก็บ stamps ให้ตรงกับคีย์ที่มีจริงทุกโหมด ไม่ให้บวมค้าง
      const alive = new Set((Object.keys(s.modes) as Mode[]).flatMap(m => [...favoriteKeysFor(m)]));
      for (const k of Object.keys(stamps)) if (!alive.has(k)) delete stamps[k];
      saveFavoriteStamps(stamps);
      return;
    }
  });
  if (hintCount > 1) {
    groupFavoriteHintShown = true;
    toast(`ดาวผูกกับ prompt + โมเดล + สัดส่วน ไม่ใช่รูปเดี่ยว — รอบนี้จึงติดพร้อมกัน ${hintCount} ใบค่ะ`);
  }
  // fire-and-forget หลัง mutate() สำเร็จ — ห้ามเปลี่ยน toggleFavorite เป็น async (Gallery เรียกใน onClick)
  syncFavoriteToGallery(touched);
}

// ---------- lightbox ----------
/**
 * ชุด id ที่ "มองเห็นอยู่จริง" บนกริดตอนนี้ (หลังผ่านตัวกรอง F3) — Gallery เป็นคนประกาศเข้ามา
 * null = ไม่มีตัวกรองทำงานอยู่ ให้ทุกอย่างทำงานกับ cur().images เต็มชุดเหมือนเดิม
 *
 * เก็บนอก AppState โดยตั้งใจ: เป็น derived view ของ Gallery ล้วน ไม่ใช่ข้อมูลที่ต้อง persist/export
 * และการเขียนมันไม่ควร trigger re-render (ผู้เขียนคือ Gallery ที่กำลัง render อยู่พอดี)
 */
let lightboxVisibleIds: Set<number> | null = null;

/** เรียกจาก Gallery ทุกครั้งที่ชุดผลลัพธ์ที่กรองแล้วเปลี่ยน — ส่ง null เพื่อกลับไปใช้ทั้งแกลเลอรี */
export function setLightboxScope(ids: Set<number> | null) {
  lightboxVisibleIds = ids;
}

export function openLightbox(index: number) {
  mutate(() => { cur().lbIndex = index; });
}
export function closeLightbox() {
  mutate(() => { cur().lbIndex = -1; });
}
/**
 * index (อ้าง cur().images) ของทุกชิ้นที่ done แล้ว **และยังอยู่ในชุดที่กรองไว้** — เป็นตัวกำหนดว่าปุ่ม
 * ถัดไป/ก่อนหน้าใน Lightbox เดินไปไหนได้บ้าง (ดู lbStep) พอมีตัวกรอง ผู้ใช้คาดหวังว่าจะเดินอยู่ในชุดที่เห็น
 * ไม่ใช่โผล่ไปรูปที่ตัวกรองซ่อนไว้
 */
export function doneIndices(): number[] {
  const scope = lightboxVisibleIds;
  return cur().images
    .map((x, i) => (x.status === "done" && (!scope || scope.has(x.id)) ? i : -1))
    .filter(i => i >= 0);
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
  if ((isVideoMode(item.mode) && !isImageDataUrl(item.url)) || item.mode === "audio" || item.mode === "tts") {
    triggerDownload(item.url, randomFileName((item.mode === "audio" || item.mode === "tts") ? "mp3" : "mp4")); // blob URL — ดาวน์โหลดตรงได้เลย ไม่ต้องแปลง format
    return;
  }
  let url: string;
  try {
    url = await convertDataUrl(item.url, state.lbFormat);
  } catch {
    toast("แปลงไฟล์ไม่สำเร็จ ดาวน์โหลดเป็นไฟล์ต้นฉบับแทนค่ะ", "error");
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
  // ยังไม่มีราคาคงที่ต่อโมเดล TTS ให้ประกาศ (ไม่ได้อยู่ใน scope นี้) — คืน null (ไม่ทราบราคา) แทนที่จะตกไป
  // ค้นหาใน state.models (list ของโหมดภาพ) ซึ่งไม่มีโมเดล TTS อยู่แล้วและจะคืน null อยู่ดีแต่ทำให้เข้าใจผิดว่าตั้งใจ fallback ไปทางนั้น
  if (mode === "tts") return null;
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

/* ============================================================================
 * F4 — Spend Guard: ledger สะสมข้ามโหมด + gate ก่อนยิง batch
 * contract เต็มอยู่ที่ types.ts (SpendLedger / SpendConfirmRequest / จุดแทรก gate)
 * ========================================================================== */

/**
 * คีย์ของ "รอบการยิงที่จ่ายเงิน" ที่ถูกบวกเข้า `totalUsd` ไปแล้ว — กันนับซ้ำ
 *
 * เดิมเป็น `Set<number>` ของ item.id ล้วน (กติกา "หนึ่ง GenItem.id บวกได้ครั้งเดียว") แต่ T24/#6 พบว่า
 * `retryWithOverride` ใช้ id เดิมทั้งที่ submit request ใหม่และจ่ายเงินจริง จึงเปลี่ยนเป็น `id:attempt`
 * (ดู spendAttempts) — กติกาที่ถูกต้องคือ "หนึ่ง **รอบการยิงที่จ่ายเงิน** บวกได้ครั้งเดียว"
 *
 * ทำไมเป็น Set ระดับ module ไม่ใช่ re-scan gallery: item เดินทาง loading → done และอาจถูก evict/ลบทิ้ง
 * ระหว่างทาง การ sum ใหม่จาก gallery ทุกครั้งจะทำให้ยอดหดลงเองตอน eviction ทั้งที่เงินจ่ายไปแล้ว
 * ledger ต้อง monotonic — ตัวนับที่ถูกต้องคือ "เคยบวก id นี้หรือยัง" ไม่ใช่ "ตอนนี้ยังเห็น item อยู่ไหม"
 *
 * Set นี้เป็น session-scoped โดยตั้งใจ (ไม่ persist): `totalUsd` ที่ persist ไว้แล้วรวมยอดของ session ก่อนไว้ครบ
 * การนับของ session ใหม่จึงเริ่มจากศูนย์แล้วบวกทับยอดเดิมต่อ ไม่ใช่นับซ้ำของเก่า
 */
const spendCountedIds = new Set<string>();

/**
 * T24/#6: รอบการยิงที่ "จ่ายเงินใหม่จริง" ของแต่ละ item — key เป็น item.id, ค่าเริ่มต้น 0 (รอบแรก)
 *
 * ปัญหาที่แก้: `retryWithOverride` เปลี่ยนโมเดล/ratio แล้ว submit request ใหม่ทั้งใบ (มันลบ jobId ทิ้งด้วย
 * ตัวเอง เพราะ job เดิม resume ต่อกับโมเดลใหม่ไม่ได้) = จ่ายเงินอีกรอบเต็มราคาของโมเดลใหม่ แต่ item.id
 * ยังเป็นตัวเดิม — guard ที่เช็คแค่ id จึงมองว่า "นับไปแล้ว" แล้วข้ามทิ้ง ledger เลยต่ำกว่าความจริงเรื่อยๆ
 * ($0.01 → retry ไปโมเดล $0.50 ledger ยังคง $0.01 ทั้งที่จ่าย $0.51) แล้ว gate ก็ปล่อยผ่านทั้งที่เลยเพดาน
 * = ตรงข้ามกับเจตนาของฟีเจอร์
 *
 * === เส้นแบ่ง "ยิงใหม่" กับ "resume" ===
 * ตัวนับนี้ถูก bump **เฉพาะจุดที่รู้แน่ว่าเป็น request ใหม่ที่ต้องจ่ายเพิ่ม** — เกณฑ์ตัดสินคือ jobId:
 *  - `retryWithOverride` เปลี่ยนโมเดล/ratio แล้วลบ jobId ทิ้งเอง = submit ใหม่เสมอ → bump เสมอ
 *  - `retry()` ธรรมดา bump **ต่อเมื่อไม่มี jobId** เท่านั้น — item ที่ยังมี jobId ค้างจะถูก requestVideo
 *    resume ต่อของเดิม ไม่ submit ใหม่ ไม่จ่ายเพิ่ม (label "ทำต่อ (ไม่เสียเงินเพิ่ม)" บนการ์ด) การ bump
 *    ตรงนั้นจะกลายเป็นนับซ้ำทันที
 *  - `generate()`/`runBakeOff()`/`regenerateFromItem()` สร้าง item ใหม่พร้อม id ใหม่จาก `++s.seq` อยู่แล้ว
 *    รอบแรกของ id ใหม่จึงเป็น attempt 0 ที่ยังไม่เคยถูกนับ ไม่ต้อง bump
 *
 * เก็บนอก GenItem โดยตั้งใจ (เหตุผลเดียวกับ persistKeys): เป็นบัญชีของ ledger ล้วนๆ ไม่ใช่ข้อมูลของ item
 * ไม่ต้อง export / ไม่ต้องเข้า session snapshot / UI ไม่ต้องเห็น — และ types.ts อยู่นอกขอบเขตงานนี้
 */
const spendAttempts = new Map<number, number>();

/** คีย์ของ ledger สำหรับ item ณ รอบการยิงปัจจุบัน */
function spendKeyOf(item: GenItem): string {
  return item.id + ":" + (spendAttempts.get(item.id) ?? 0);
}

/**
 * ประกาศว่า item นี้กำลังจะถูกยิงเป็น request ใหม่ที่ต้องจ่ายเงินเพิ่ม — เรียก **ก่อน** scheduleRequest() เสมอ
 * (recordSpend อ่านตัวนับตอนได้ slot ของ governor ซึ่งเกิดทีหลัง จึงต้อง bump ให้เสร็จก่อนเข้าคิว)
 */
function markNewPaidAttempt(item: GenItem) {
  spendAttempts.set(item.id, (spendAttempts.get(item.id) ?? 0) + 1);
}

/** ledger ปัจจุบันแบบรับประกันว่ามีค่า — `spendLedger` เป็น optional ใน AppState (build ที่ยังไม่ wire F4) */
function ledger(): SpendLedger {
  if (!state.spendLedger) state.spendLedger = freshSpendLedger();
  return state.spendLedger;
}

/** ledger สำหรับฝั่งอ่าน (UI) — ไม่สร้างใหม่/ไม่ mutate state ตอนอ่านเฉยๆ */
export function getSpendLedger(): SpendLedger | undefined {
  return state.spendLedger;
}

/**
 * บันทึกยอดของ item หนึ่งชิ้นเข้า ledger — เรียก ณ จุดที่ request "ถูกยิงออกไปจริง" เท่านั้น
 * (`scheduleRequest.run()` ตอนได้ slot ของ governor) ไม่ใช่ตอนสร้าง item และไม่ใช่ตอน done
 *
 * เหตุผลของจุดนี้ตามสัญญา: item ที่ยังนอนรอ slot อยู่ยังไม่มี fetch เกิดขึ้น = ยังไม่เสียเงิน แต่ถ้ารอ done
 * ค่อยนับ ผู้ใช้ยิง 30 ชิ้นรวดเดียวจะผ่าน gate ทั้งชุดเพราะยอดยังเป็น 0 — บั๊กที่ฟีเจอร์นี้มีไว้แก้พอดี
 *
 * ครอบทุก path ที่เสียเงินโดยอัตโนมัติ เพราะ generate / runBakeOff / retry / regenerate / resume
 * เดินผ่าน scheduleRequest หมด — รวมถึง Bake-off ที่ไม่ถูก gate ("ไม่ gate ≠ ไม่นับ")
 *
 * เกณฑ์ตามสัญญาถูกครอบด้วยจุดเรียกนี้ทั้งหมด: done/loading-ที่ยิงแล้ว นับตอนได้ slot, cancelled/error ที่มี
 * jobId ก็เคยผ่านจุดนี้มาแล้วจึงนับไปแล้ว ส่วน cancelled ที่ไม่มี jobId (ถูก drop ตอนยังรอคิว) ไม่เคยถึงจุดนี้
 * จึงไม่ถูกนับ — ตรงตามกติกาโดยไม่ต้องแยกเช็ค status ที่ไหนเลย
 *
 * `computeItemCost()` คืน null = คำนวณราคาไม่ได้ → เข้า `unknownCostCount` **ห้ามบวก 0 เข้า totalUsd**
 * ไม่งั้นยอดจะต่ำกว่าความจริงเงียบๆ แล้ว gate จะปล่อยผ่านทั้งที่เลยเพดานไปแล้ว
 */
function recordSpend(item: GenItem) {
  // T24/#6: คีย์เป็น "id + รอบการยิง" ไม่ใช่ id เปล่า — ดู spendAttempts/markNewPaidAttempt
  const key = spendKeyOf(item);
  if (spendCountedIds.has(key)) return; // บวกไปแล้ว (retry ที่ resume job เดิมก็ไม่นับซ้ำ)
  spendCountedIds.add(key);
  const cost = computeItemCost(item);
  const l = ledger();
  if (cost == null) l.unknownCostCount++;
  else l.totalUsd += cost;
  saveSpendLedger(l);
  mutate();
}

/**
 * ยอดประเมินของ batch ที่กำลังจะยิง — คืน `unknown` แยกจาก `usd` เสมอ ห้ามยุบ null เป็น 0
 * ใช้ `computeQueueJobCost()` เดิม (ซึ่งเรียก `computeCost()` ตัวเดียวกับ usage bar) ไม่เขียนสูตรราคาใหม่
 */
function estimateJobsCost(mode: Mode, jobs: QueueJob[]): { usd: number; unknown: number; items: number } {
  let usd = 0, unknown = 0, items = 0;
  for (const job of jobs) {
    items += job.count;
    const c = computeQueueJobCost(mode, job);
    if (c == null) unknown += job.count;
    else usd += c;
  }
  return { usd, unknown, items };
}

/**
 * ตัดสินว่า batch นี้ต้องให้ผู้ใช้ยืนยันก่อนหรือไม่ — คืน `SpendConfirmRequest` เมื่อต้องถาม, `null` เมื่อผ่านเลย
 * แยกออกมาเป็นฟังก์ชันที่ไม่ mutate อะไร เพื่อให้อ่านซ้ำ/ทดสอบได้โดยไม่มี side effect
 *
 * `capUsd === undefined` = ยังไม่ได้ตั้งเพดาน = ปิดฟีเจอร์ → คืน null ทันที
 * เช็คด้วย `=== undefined` ตรงๆ **ห้าม `!capUsd` หรือ `capUsd || DEFAULT`** เพราะ `capUsd === 0` คือ
 * "ถามฉันทุกครั้ง" ซึ่งเป็นเคสเข้มที่สุด ถ้าใช้ truthiness จะถูกกลืนเป็นเคสปิดฟีเจอร์พอดี (ตรงข้ามกันสุดขั้ว)
 */
export function evaluateSpendGate(mode: Mode, jobs: QueueJob[]): SpendConfirmRequest | null {
  const l = ledger();
  const cap = l.capUsd;
  if (cap === undefined) return null; // ปิดฟีเจอร์ — ผู้ใช้ใหม่ต้องไม่เจอโมดัลโผล่มากวน
  const est = estimateJobsCost(mode, jobs);
  const base = {
    itemCount: est.items,
    batchUsd: est.usd,
    batchUnknownCount: est.unknown,
    ledgerUsd: l.totalUsd,
    capUsd: cap,
  };
  // ยอดสะสมเดิมเลยเพดานไปก่อนหน้านี้แล้ว — เหตุผลนี้มาก่อน over-cap เพราะข้อความในโมดัลคนละแบบ
  if (l.totalUsd > cap) return { ...base, reason: "already-over" };
  if (l.totalUsd + est.usd > cap) return { ...base, reason: "over-cap" };
  // ยังไม่เกินเพดาน "เท่าที่คำนวณได้" แต่มี item ที่ไม่ทราบราคาปนอยู่ → ยืนยันยอดไม่ได้ ต้องถาม
  // ห้ามตีความว่า "ไม่ทราบราคา = ฟรีจึงผ่าน" เด็ดขาด
  if (est.unknown > 0) return { ...base, reason: "unknown-cost" };
  return null;
}

/**
 * `jobs[]` ที่ถูก gate กันไว้ รอผู้ใช้ตัดสินใจ — เก็บนอก AppState เพราะ `SpendConfirmRequest` เก็บแค่ตัวเลข
 * สำหรับแสดงผล (snapshot ที่ serialize ได้) ส่วน jobs จริงมี `refs` เป็น data URL ก้อนใหญ่ ไม่ควรไหลเข้า
 * state ที่ถูก autosave ลง localStorage ทุก 30 วินาที
 *
 * `fromQueue` จำไว้ว่า batch นี้มาจากคิวหรือมาจาก prompt ปัจจุบัน — ตัวตัดสินว่าตอนยกเลิกต้องคืนคิวไหม
 */
let pendingSpendJobs: { mode: Mode; jobs: QueueJob[]; fromQueue: boolean; parentId: number | null } | null = null;

/**
 * flag bypass ของรอบยืนยัน — pattern เดียวกับ Bake-off: ปุ่มยืนยันเรียก `generate()` **ซ้ำ** โดยข้าม gate
 * แทนที่จะทำให้ `generate()` เป็น async แล้ว await โมดัล (จะได้ floating promise ที่ caller ทั้งสองไม่ handle)
 *
 * เป็น one-shot: `generate()` เคลียร์ทิ้งทันทีที่อ่าน จึงไม่มีทางค้างไปข้าม gate ของครั้งถัดไป
 */
let bypassSpendGate = false;

/**
 * parentId ของ "Refine this" ที่ค้างมาจากรอบที่ถูก gate — `generate()` เคลียร์ `refiningParentId` ทิ้งตั้งแต่
 * รอบแรกไปแล้ว (โดยตั้งใจ กันค้างไปผูกกับ generate ครั้งถัดไป) รอบ bypass จึงต้องอ่านค่าจากที่นี่แทน
 * one-shot เหมือนกัน: `confirmSpend` เคลียร์ทิ้งทันทีหลัง `generate()` คืนค่า
 */
let pendingSpendParentId: number | null = null;

/**
 * ปุ่ม "ยืนยัน" ในโมดัล — ปิดโมดัลแล้วยิง generate() รอบสองในโหมด bypass (ไม่ถามซ้ำ)
 *
 * คืน `jobs[]` ที่ snapshot ไว้กลับเข้าคิวก่อนเรียก generate() **เฉพาะเคสที่ batch มาจากคิวจริง** เพื่อให้
 * generate() รอบสองเดินสาขาเดิมกับรอบแรกเป๊ะๆ และยิง jobs ชุดเดียวกับที่คำนวณราคาไว้ ไม่ใช่ชุดใหม่ที่ผู้ใช้
 * อาจแก้ prompt/count ไประหว่างโมดัลเปิดอยู่ (snapshot ไม่ live-bind ตามสัญญาของ SpendConfirmRequest)
 *
 * เคสที่มาจาก prompt **ห้าม** ยัดเข้าคิว: generate() รอบสองจะเห็นคิวไม่ว่างแล้วเดินสาขาคิวแทน ซึ่งทำให้
 * `parentId` ของ "Refine this" กลายเป็น null (บรรทัด `!ms.queue.length ? ms.refiningParentId : null`)
 * = สายพันธุ์ที่ผู้ใช้ตั้งใจต่อยอดขาดหายไปเงียบๆ — เคสนี้ปล่อยให้ generate() ประกอบ job จาก prompt เองตามเดิม
 * โดยมี `pendingSpendParentId` พา parentId เดิมข้ามมาให้
 */
export function confirmSpend() {
  if (!state.spendConfirm) return;
  const pending = pendingSpendJobs;
  pendingSpendJobs = null;
  mutate(s => { s.spendConfirm = null; });
  if (!pending) return;
  pendingSpendParentId = pending.parentId;
  bypassSpendGate = true;
  // T24/#4: ส่ง snapshot (โหมดต้นทาง + jobs ที่โมดัลคิดราคาไว้) เข้าไปตรงๆ แทนการคืนคิวแล้วหวังว่า
  // generate() จะอ่านเจอผ่าน cur() — ซึ่งพังทันทีถ้าผู้ใช้สลับโหมดขณะโมดัลเปิดค้าง (ยิง 0 งาน เงียบสนิท)
  runGenerate({ mode: pending.mode, jobs: pending.jobs });
  pendingSpendParentId = null;
}

/**
 * ปุ่ม "ยกเลิก"/ปิดโมดัล — เคลียร์ทิ้งโดยไม่ยิงอะไร
 *
 * **ต้องคืนคิวกลับ**: สาขา "ยิงจากคิว" ใน generate() ทำ `ms.queue = []` ไปก่อนถึง gate แล้ว ถ้าไม่คืน
 * ผู้ใช้ที่กดยกเลิกจะเสียคิวทั้งชุดไปเงียบๆ โดยไม่มีอะไรบอก — คืนจาก jobs[] ที่ snapshot ไว้ตอน gate เด้ง
 * (เฉพาะ fromQueue เท่านั้น — batch ที่ยิงตรงจาก prompt ไม่เคยอยู่ในคิว การใส่เข้าไปจะเป็นการเพิ่มของใหม่)
 */
export function cancelSpend() {
  const pending = pendingSpendJobs;
  pendingSpendJobs = null;
  mutate(s => {
    s.spendConfirm = null;
    if (pending?.fromQueue) s.modes[pending.mode].queue = pending.jobs;
  });
  if (pending?.fromQueue) toast("ยกเลิกแล้วค่ะ คิวถูกคืนกลับให้เรียบร้อย");
}

/** ตั้งเพดานใหม่ — `null` = ล้างเพดานทิ้ง (ปิดฟีเจอร์) ส่วน `0` = โหมดถามทุกครั้ง ค่าเสีย/ติดลบถูกปฏิเสธ */
export function setSpendCap(cap: number | null) {
  const l = ledger();
  if (cap === null) {
    delete l.capUsd;
  } else {
    if (!Number.isFinite(cap) || cap < 0) { toast("เพดานต้องเป็นตัวเลขไม่ติดลบค่ะ"); return; }
    l.capUsd = cap;
  }
  saveSpendLedger(l);
  mutate();
  toast(cap === null ? "ปิดการเตือนค่าใช้จ่ายแล้วค่ะ" : `ตั้งเพดานไว้ที่ $${cap.toFixed(2)} แล้วค่ะ`);
}

/**
 * ล้างยอดสะสม — ต้อง reset `totalUsd`/`unknownCostCount`/`startedAt` **พร้อมกันทั้งสามค่า**
 * (reset ยอดแต่ไม่ reset เวลา = ยอดที่อ่านผิดความหมาย) ส่วนเพดานที่ตั้งไว้คงเดิม ไม่ใช่สิ่งที่ผู้ใช้สั่งล้าง
 *
 * `spendCountedIds` ต้องล้างด้วย ไม่งั้น item ที่ยิงไปแล้วในรอบก่อนจะกันไม่ให้ id เดิมถูกนับซ้ำอีกตลอดไป
 * ซึ่งไม่เป็นปัญหาในทางปฏิบัติ (id ไม่ถูกใช้ซ้ำ) แต่ปล่อยให้ Set โตไปเรื่อยๆ โดยไม่มีเหตุผล
 */
export function resetSpendLedger() {
  const cap = ledger().capUsd;
  spendCountedIds.clear();
  // คู่กับ spendCountedIds เสมอ — ล้างอันเดียวแล้วเหลืออีกอันจะทำให้ item ที่เคย retry ไปแล้วเริ่มนับ
  // จากรอบที่ค้างอยู่ ซึ่งไม่ผิดผลลัพธ์ (Set ว่างแล้ว) แต่ปล่อย Map โตทิ้งไว้โดยไม่มีเหตุผล
  spendAttempts.clear();
  const next = freshSpendLedger();
  if (cap !== undefined) next.capUsd = cap;
  state.spendLedger = next;
  saveSpendLedger(next);
  mutate();
  toast("ล้างยอดสะสมแล้วค่ะ");
}

// ---------- export / import session ----------
/**
 * เวอร์ชันของ export format — v1 (เดิม): history อาจเป็น string[] ล้วน ไม่มี timestamp/pin
 * v2: history เป็น HistoryEntry[] เสมอ (มี at + pinned จาก PHASE 1)
 * v3: เพิ่ม negPrompt ต่อโหมด (PHASE 14) — bump ตอนที่เพิ่ม field ระดับนี้เข้าไปใน export จริง
 * v4 (ปัจจุบัน): เพิ่ม voiceId ต่อโหมด (โหมด tts) — ไฟล์เก่าทุกเวอร์ชันยัง import ได้ปกติ (voiceId undefined = ไม่มีค่าเดิมให้กู้ ไม่ใช่ error)
 */
const SESSION_VERSION = 4;

/** field ต่อโหมดที่ build นี้รู้จักและอ่าน/เขียนเองตรงๆ — ที่เหลือถือเป็น "unknown field" เก็บ round-trip ไว้เฉยๆ */
const KNOWN_MODE_FIELDS = new Set(["prompt", "ratio", "count", "duration", "audio", "queue", "history", "negPrompt", "voiceId"]);

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
      voiceId: s.voiceId,
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
  queue?: unknown; history?: unknown; negPrompt?: unknown; voiceId?: unknown;
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
      (typeof m.negPrompt === "string" && m.negPrompt !== s.negPrompt) ||
      ((typeof m.voiceId === "string" || m.voiceId === null) && m.voiceId !== s.voiceId);

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
      toast("ไฟล์ไม่ใช่ JSON ที่ถูกต้องค่ะ", "error");
      return;
    }
    const parsed = parseSessionFile(raw);
    if (!parsed) {
      toast("ไฟล์นี้ไม่ใช่ session ของ Atelier ค่ะ", "error");
      return;
    }
    const preview = diffImportSession(parsed);
    mutate(s => { s.importPending = { raw: parsed, preview }; });
  };
  reader.onerror = () => toast("อ่านไฟล์ไม่สำเร็จค่ะ", "error");
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
      // voiceId เฉพาะโหมด tts เท่านั้นที่มีผล แต่ยังรับค่าเก็บไว้ได้ทุกโหมดเหมือน negPrompt (ไม่ตีความ ไม่กระทบ mode อื่น)
      if (typeof m.voiceId === "string" || m.voiceId === null) ms.voiceId = m.voiceId;
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

/** สลับภาษา UI ทั้งแอป — persist ทันทีเหมือน setting อื่นๆ */
export function setLocale(locale: Locale): void {
  mutate(s => { s.locale = locale; });
  saveLocale(locale);
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
  if (!m) { toast("ยังไม่ได้เลือกโมเดลค่ะ", "error"); return; }
  if (ms.queue.length >= MAX_QUEUE) { toast(`คิวเต็มแล้วค่ะ (${MAX_QUEUE}/${MAX_QUEUE})`, "error"); return; }
  if (refImageMissing()) { toast("โมเดลนี้ต้องแนบภาพอ้างอิงก่อนค่ะ (Image-to-Video)", "error"); return; }
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
