/**
 * ---------- Gallery Persistence: storage layer (IndexedDB) ----------
 *
 * ปัญหาที่แก้: `state.modes.*.images` เก็บ blob/data URL ใน memory ล้วน — ผลลัพธ์ที่ผู้ใช้จ่ายเงินไปแล้ว
 * หายเกลี้ยงทุก reload (คีย์ localStorage ทั้งหมดเป็น metadata ไม่มี image data ส่วน reconcilePendingJobs()
 * กู้ได้แค่ job ที่ยังค้าง) ไฟล์นี้เป็น "แค่ storage layer" — ไม่แตะ AppState/mutate() และไม่ผูกกับ generation flow
 * (T8 จะ wire เข้า actions.ts ต่อ)
 *
 * === PRIVACY: opt-in, default ปิด ===
 * CLAUDE.md ระบุว่า media เป็น memory-only by design การเขียนลงดิสก์ถาวรขัดเจตนาเดิม
 * ทุก write path ในไฟล์นี้จึงเช็ค isGalleryPersistEnabled() ก่อนเสมอ — ค่า default = ปิด
 * ผู้ใช้ต้องกดเปิดเองผ่าน setGalleryPersistEnabled(true) และปิดแล้วข้อมูลที่เก็บไว้ถูกลบทิ้งทันที
 * (ดู setGalleryPersistEnabled + clearAllPersistedItems)
 *
 * === สิ่งที่ "ไม่" เก็บลงดิสก์ (blocking requirement — ห้ามเพิ่มทีหลังโดยไม่คุยกับ Security) ===
 *  - `refs` (RefImage[]) — รูป reference ที่ผู้ใช้อัปโหลดเอง เป็นข้อมูลส่วนตัวของผู้ใช้ ไม่ใช่ผลลัพธ์ที่จ่ายเงินซื้อ
 *  - `apiKey` — อยู่ใน sessionStorage by design ห้ามหลุดลง IndexedDB ที่อยู่ยาวข้าม session
 *  - `jobId` — เป็น handle ที่ชี้ไปงานฝั่ง OpenRouter (job ledger ที่ยังค้างมี PENDING_JOBS_KEY ดูแลอยู่แล้ว)
 *    item ที่ done แล้วไม่ต้องใช้ resume อีก
 *  - `errMsg` / `autoSaveErrMsg` — ข้อความ error อาจมี path/รายละเอียดระบบ และไม่มีประโยชน์หลัง reload
 * `PersistedGenItem` ด้านล่างเป็น allowlist ล้วน (ไม่ใช่ Omit<GenItem, …>) — ฟิลด์ใหม่ที่เพิ่มใน GenItem
 * จะไม่ไหลลงดิสก์เองโดยบังเอิญ ต้องมาเพิ่มที่นี่ด้วยมือเท่านั้น
 */

import type { GenItem, Mode } from "./types";
import {
  GALLERY_MAX_ITEMS_PER_MODE,
  GALLERY_MAX_TOTAL_BYTES,
  GALLERY_MAX_ITEM_BYTES,
} from "./constants";

/**
 * === DECISION: แยก DB คนละตัวจาก fsAccess.ts ===
 * fsAccess.ts ใช้ DB "atelier_fs" v1 / store "handles" เก็บ FileSystemDirectoryHandle เดียว (คีย์ "autoSaveDir")
 * ทางเลือกคือ (ก) ใช้ DB เดิมแล้ว bump เป็น v2 หรือ (ข) เปิด DB ใหม่แยกไปเลย — เลือก (ข) เพราะ:
 *  1. ไม่ต้องแตะ fsAccess.ts เลยแม้แต่บรรทัดเดียว → handle ของผู้ใช้ที่เชื่อมต่อ Auto Save ไว้แล้ว
 *     ไม่มีทางหายจากการ upgrade ที่เขียนพลาด (นี่คือความเสี่ยงหลักของทางเลือก ก.)
 *  2. IndexedDB `open(name, version)` ด้วย version ที่ต่ำกว่า DB ที่มีอยู่จะ throw VersionError ทันที —
 *     ถ้าใช้ DB เดียวกันแล้ว bump เป็น v2 แต่ fsAccess.ts ยัง hardcode `indexedDB.open(DB_NAME, 1)` อยู่
 *     ทุกการเรียก peekSavedDirName()/idbSet() จะพังทั้งหมด = ปุ่ม "เชื่อมต่อ Directory เดิม" หายจริง
 *  3. cost model ต่างกันคนละโลก: handles เป็น metadata จิ๋วอายุยาว ส่วน gallery เป็น Blob หลายสิบ MB
 *     ที่ต้องล้างยกชุดได้ตอนผู้ใช้ปิด opt-in — clear() store ตัวเองได้โดยไม่แตะ Auto Save เลย
 * ผลข้างเคียงที่ยอมรับ: มี 2 DB ใน origin เดียว — ตรวจใน DevTools ก็ยังเห็นแยกชัดว่าอะไรเป็นอะไร
 *
 * เริ่มที่ v1 เพราะเป็น DB ใหม่ที่ยังไม่เคยมีในเครื่องผู้ใช้คนไหน แต่ `onupgradeneeded` เขียนแบบ
 * idempotent (เช็ค objectStoreNames ก่อนสร้าง) ไว้แล้ว เพื่อให้ bump version ในอนาคตปลอดภัย
 */
const DB_NAME = "atelier_gallery";
const DB_VERSION = 1;
const STORE_ITEMS = "items";
/** index สำหรับ query ต่อโหมด และเรียงลำดับตอน evict */
const IDX_MODE = "by_mode";
const IDX_SAVED_AT = "by_savedAt";

/** localStorage flag ของ opt-in — ใช้ prefix atelier_ เดียวกับคีย์อื่นเพื่อให้ storage breakdown เดิมนับเจอ */
export const GALLERY_PERSIST_KEY = "atelier_gallery_persist";

/** MIME ที่อนุญาตให้เก็บ — กันไฟล์แปลกปลอมหลุดลง IndexedDB ถ้า url ชี้ไปที่อื่น */
const ALLOWED_MIME_PREFIX = ["image/", "video/", "audio/"];

/**
 * record ที่เขียนลงดิสก์จริง — allowlist ล้วน ไม่ derive จาก GenItem
 * key ของ object store คือ `key` (string) ไม่ใช่ GenItem.id เพราะ id มาจาก `++s.seq` ที่รีเซ็ตเป็น 0
 * ทุก reload (ดู store.ts:445) — ใช้เป็น primary key ข้าม session ไม่ได้ จะทับกันเอง
 */
export interface PersistedGenItem {
  /** primary key ถาวร: `${mode}:${savedAt}:${rand}` — unique ข้าม session แน่นอน */
  key: string;
  /** GenItem.id ตอนที่เซฟ — ใช้ rehydrate กลับเข้า state + bump s.seq กัน id ชนกับของใหม่ */
  id: number;
  mode: Mode;
  /** media จริง เก็บเป็น Blob ไม่ใช่ blob: URL — blob: URL ตายทันทีที่ reload (ดู blobUrls.ts) */
  blob: Blob;
  /** ขนาด blob ตอนเซฟ — cache ไว้เพื่อคำนวณ total bytes โดยไม่ต้องอ่าน blob ทั้งก้อนกลับมา */
  bytes: number;
  mime: string;
  prompt: string;
  model: string;
  modelName: string;
  ratio: string;
  duration: number;
  audio: boolean;
  /** เวลาที่เขียนลงดิสก์ (Date.now()) — ตัวเรียงหลักของ eviction */
  savedAt: number;
  /** parentId เดิมของ chain (cinematic storyboard) — null = root */
  parentId: number | null;
  negPrompt: string;
  /** bakeOffGroupId เดิม — 0 = ไม่ใช่ bake-off (ใช้ 0 แทน undefined เพื่อให้ record มีรูปร่างคงที่) */
  bakeOffGroupId: number;
  /**
   * ผู้ใช้ปักหมุดไว้ = ห้าม evict ก่อนของที่ไม่ปักหมุด (ดู EVICTION POLICY)
   *
   * **แก้จากบันทึกเดิม (T7):** ตอนเขียนไฟล์นี้ครั้งแรกจดไว้ว่า "GenItem ยังไม่มีฟิลด์นี้" — ไม่จริงแล้ว
   * `GenItem.favorite?: boolean` มีอยู่จริงใน types.ts (F3 Gallery Filter & Favorites) และ Gallery.tsx
   * toggle มันผ่าน `mutate()` อยู่ ดังนั้น saveItem() ต้อง **อ่านค่าจาก item.favorite** ไม่ใช่ hardcode false
   * ไม่งั้นของที่ผู้ใช้ปักหมุดจะลงดิสก์เป็น false แล้วโดน eviction ตัดทิ้งก่อน — ล้มเจตนาของ EVICTION POLICY
   * ทั้งข้อ ส่วน setFavorite() ยังอยู่เพื่อ sync ค่าหลังเซฟแล้ว (ผู้ใช้กดดาวทีหลัง ไม่ต้องเขียน blob ใหม่)
   *
   * GenItem.favorite เป็น optional จึงต้องอ่านแบบ truthy (`!!item.favorite`) ตามที่ types.ts กำกับไว้
   * แต่ในดิสก์เก็บเป็น boolean เสมอ เพื่อให้ evictionOrder() เทียบค่าได้โดยไม่ต้องเผื่อ undefined
   */
  favorite: boolean;
  /**
   * เวอร์ชันของ *รูปร่าง record* ตัวนี้ (ไม่ใช่ DB_VERSION ของ IndexedDB) — ปัจจุบัน = PERSISTED_ITEM_VERSION
   *
   * ทำไมต้องมีทั้งที่ IndexedDB มี version ของตัวเองอยู่แล้ว: DB_VERSION คุมเฉพาะ "โครงสร้าง store/index"
   * และ onupgradeneeded ยิงครั้งเดียวตอนเปิด DB — มันแปลง record ที่มีอยู่ให้ไม่ได้ถ้าไม่อ่านมาทั้งก้อน
   * (gallery เป็น Blob หลายสิบ MB การ migrate ยกชุดตอน open จะบล็อกหน้าเว็บ) การติด version ไว้ที่ตัว record
   * ทำให้ migrate แบบ lazy per-record ตอนอ่านได้ — record เก่าที่ไม่เคยถูกอ่านก็ไม่ต้องเสียเวลาแปลง
   *
   * MIGRATION PATH ที่ตกลงไว้ — เพิ่มฟิลด์ใหม่ในอนาคตให้ทำตามนี้:
   *  1. bump PERSISTED_ITEM_VERSION
   *  2. เติม branch ใน migrateRecord() ที่เติมค่า default ให้ record เวอร์ชันเก่า แล้วอัป `version`
   *  3. `loadItems()` เรียก migrateRecord() ให้อยู่แล้ว — read path หลักที่ส่ง record ออกนอกไฟล์นี้
   *     ส่วน getGalleryUsage()/evictIfNeeded() **ตั้งใจไม่ migrate** เพราะอ่านแค่ bytes/mode/savedAt/favorite
   *     ซึ่งมีครบทุกเวอร์ชัน และ evictionOrder() เทียบ favorite แบบ truthy อยู่แล้ว (undefined = ไม่ปักหมุด
   *     ซึ่งเป็นค่าที่ถูกต้อง) — การ migrate ตรงนั้นคือ copy object ทั้ง store ทิ้งเปล่าๆ บน hot path
   *     ถ้าวันหนึ่ง migration เปลี่ยนความหมายของ bytes/mode/savedAt/favorite ต้องกลับมาเติม migrate ที่สองจุดนี้ด้วย
   * record ที่ migrate ไม่ไหว (version สูงกว่าที่โค้ดนี้รู้จัก = ผู้ใช้เพิ่ง downgrade แอป) ต้องถูก **ข้าม**
   * ไม่ใช่ลบทิ้ง — ผู้ใช้อาจอัปกลับขึ้นไปแล้วอยากได้ของคืน
   */
  version: number;
}

/**
 * เวอร์ชันปัจจุบันของรูปร่าง PersistedGenItem — bump เมื่อ "ความหมายหรือชุดฟิลด์" ของ record เปลี่ยน
 * (เพิ่มฟิลด์ที่มี default ได้ก็ยัง bump เพื่อให้ migrateRecord() แยก record เก่า/ใหม่ออกจากกันได้ชัด)
 */
export const PERSISTED_ITEM_VERSION = 1;

/**
 * ปรับ record ที่อ่านขึ้นมาให้เข้ารูปร่างเวอร์ชันปัจจุบัน — คืน null ถ้าใช้ไม่ได้ (ให้ caller ข้ามชิ้นนั้นไป)
 *
 * record ที่เขียนก่อนมีฟิลด์ `version` จะได้ `undefined` กลับมา ถือเป็น v0 และปรับขึ้น v1 ด้วยการเติม
 * default ให้ฟิลด์ที่ขาด (ตอนนี้มีแค่ favorite ที่อาจหายไปในทางทฤษฎี) — ไม่เขียนกลับลงดิสก์ตรงนี้
 * เพราะ read path เป็น readonly transaction record จะถูกเขียนทับด้วยรูปร่างใหม่ตอน saveItem/setFavorite ครั้งถัดไปเอง
 */
function migrateRecord(rec: PersistedGenItem): PersistedGenItem | null {
  const v = rec.version ?? 0;
  if (v > PERSISTED_ITEM_VERSION) return null; // ผู้ใช้ downgrade แอป — ข้ามไว้ ห้ามลบของเขาทิ้ง
  if (v === PERSISTED_ITEM_VERSION) return rec;
  return { ...rec, favorite: !!rec.favorite, version: PERSISTED_ITEM_VERSION };
}

/** เมทาดาต้าของ item ที่โหลดกลับมา — เหมือน record แต่แปลง blob เป็น object URL ให้พร้อมใช้ */
export interface RestoredGenItem extends Omit<PersistedGenItem, "blob"> {
  /** object URL ที่เพิ่งสร้างจาก blob — caller (T8) ต้อง registerBlobUrl() เพื่อให้ revoke ได้ตอน item หลุด */
  url: string;
}

// ---------- opt-in flag ----------

/** true = ผู้ใช้เปิดให้เก็บผลลัพธ์ลงเครื่อง — default ปิด (ไม่มีคีย์ = ปิด) */
export function isGalleryPersistEnabled(): boolean {
  try {
    return localStorage.getItem(GALLERY_PERSIST_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * เปิด/ปิด opt-in — ปิดแล้วล้างของที่เก็บไว้ทั้งหมดทันที (ผู้ใช้ที่กดปิดคาดหวังว่าข้อมูลหายจริง
 * ไม่ใช่แค่หยุดเขียนเพิ่ม) ถ้า localStorage ถูกปิดจนเก็บ flag ไม่ได้ ก็ไม่ควรเริ่มเก็บ media ต่อ → โยน error
 */
export async function setGalleryPersistEnabled(on: boolean): Promise<void> {
  try {
    if (on) localStorage.setItem(GALLERY_PERSIST_KEY, "1");
    else localStorage.removeItem(GALLERY_PERSIST_KEY);
  } catch {
    if (on) throw new Error("เปิดการเก็บผลงานไม่สำเร็จ เพราะเบราว์เซอร์ปิด localStorage อยู่ค่ะ");
  }
  if (!on) await clearAllPersistedItems();
}

// ---------- IndexedDB plumbing (pattern เดียวกับ fsAccess.ts) ----------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // idempotent: ปลอดภัยทั้งตอนสร้างครั้งแรกและตอน bump version ในอนาคต
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const store = db.createObjectStore(STORE_ITEMS, { keyPath: "key" });
        store.createIndex(IDX_MODE, "mode", { unique: false });
        store.createIndex(IDX_SAVED_AT, "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // อีกแท็บสั่ง upgrade/deleteDatabase — ปล่อย connection นี้ทิ้ง ไม่งั้นจะบล็อกอีกแท็บค้าง
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    // อีกแท็บถือ connection เก่าค้างอยู่จน upgrade ไม่ผ่าน — คืน error ที่อ่านรู้เรื่องแทนค้างเงียบๆ
    req.onblocked = () => { dbPromise = null; reject(new Error("มีแท็บ Atelier อื่นเปิดค้างอยู่ ปิดแท็บนั้นก่อนแล้วลองใหม่นะคะ")); };
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction ถูกยกเลิกค่ะ"));
  });
}

function reqDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- read ----------

/** อ่าน record ทั้งหมดของโหมดหนึ่ง (ยังไม่เรียง — ดู loadItems สำหรับผลที่เรียงแล้ว) */
async function readMode(db: IDBDatabase, mode: Mode): Promise<PersistedGenItem[]> {
  const tx = db.transaction(STORE_ITEMS, "readonly");
  const idx = tx.objectStore(STORE_ITEMS).index(IDX_MODE);
  return reqDone<PersistedGenItem[]>(idx.getAll(IDBKeyRange.only(mode)));
}

/**
 * โหลดผลลัพธ์ที่เก็บไว้ของโหมดหนึ่ง เรียงเก่า→ใหม่ (ลำดับเดียวกับ state.modes.*.images ที่ push ต่อท้าย)
 * แปลง Blob → object URL ให้เลย — caller ต้อง registerBlobUrl(item.id, item.url) เองเพื่อให้ revoke ได้
 * คืน [] เงียบๆ ถ้า opt-in ปิดอยู่หรือ IndexedDB ใช้ไม่ได้ (private mode บางเบราว์เซอร์)
 */
export async function loadItems(mode: Mode): Promise<RestoredGenItem[]> {
  if (!isGalleryPersistEnabled()) return [];
  try {
    const db = await openDb();
    const rows = (await readMode(db, mode))
      .map(migrateRecord)
      .filter((r): r is PersistedGenItem => r !== null);
    rows.sort((a, b) => a.savedAt - b.savedAt);
    return rows.map(({ blob, ...rest }) => ({ ...rest, url: URL.createObjectURL(blob) }));
  } catch {
    return [];
  }
}

/** จำนวนชิ้นและขนาดรวมที่เก็บอยู่จริง — ใช้โชว์ในหน้า storage breakdown และตรวจว่าใกล้ cap แค่ไหน */
export async function getGalleryUsage(): Promise<{ count: number; bytes: number; perMode: Record<string, number> }> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ITEMS, "readonly");
    const rows = await reqDone<PersistedGenItem[]>(tx.objectStore(STORE_ITEMS).getAll());
    const perMode: Record<string, number> = {};
    let bytes = 0;
    for (const r of rows) {
      bytes += r.bytes;
      perMode[r.mode] = (perMode[r.mode] ?? 0) + 1;
    }
    return { count: rows.length, bytes, perMode };
  } catch {
    return { count: 0, bytes: 0, perMode: {} };
  }
}

// ---------- write ----------

/** แปลง item.url (data URL หรือ blob URL ที่ยังไม่ตาย) เป็น Blob จริงสำหรับเก็บลงดิสก์ */
async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("อ่านไฟล์ผลลัพธ์ไม่สำเร็จ (HTTP " + res.status + ")");
  return res.blob();
}

/**
 * เซฟผลลัพธ์หนึ่งชิ้นลงดิสก์ แล้วรัน eviction ให้เข้า cap อัตโนมัติ
 * no-op เงียบๆ (คืน null) ถ้า: opt-in ปิด / item ยังไม่ done / ไม่มี url / MIME ไม่ใช่ media /
 * ไฟล์ใหญ่เกิน GALLERY_MAX_ITEM_BYTES — ตั้งใจให้ "ไม่ throw" เพราะ T8 จะเรียกจาก generation flow
 * ที่ไม่ควรพังเพราะ storage คืน key ของ record ที่เขียน ให้ caller ผูกกับ item ใน state ได้ (เช่น ปุ่มลบทีละชิ้น)
 */
export async function saveItem(item: GenItem): Promise<string | null> {
  if (!isGalleryPersistEnabled()) return null;
  if (item.status !== "done" || !item.url) return null;

  let blob: Blob;
  try {
    blob = await urlToBlob(item.url);
  } catch {
    return null;
  }
  const mime = blob.type || "application/octet-stream";
  if (!ALLOWED_MIME_PREFIX.some((p) => mime.startsWith(p))) return null;
  // ชิ้นเดียวใหญ่เกินโควตาต่อชิ้น — เก็บแล้วจะไปเบียด item อื่นออกทั้งชุด ไม่คุ้ม ข้ามไปเลย
  if (blob.size > GALLERY_MAX_ITEM_BYTES) return null;

  const savedAt = Date.now();
  const record: PersistedGenItem = {
    key: item.mode + ":" + savedAt + ":" + Math.random().toString(36).slice(2, 10),
    id: item.id,
    mode: item.mode,
    blob,
    bytes: blob.size,
    mime,
    prompt: item.prompt,
    model: item.model,
    modelName: item.modelName,
    ratio: item.ratio,
    duration: item.duration,
    audio: item.audio,
    savedAt,
    parentId: item.parentId ?? null,
    negPrompt: item.negPrompt ?? "",
    bakeOffGroupId: item.bakeOffGroupId ?? 0,
    // อ่านจาก item จริง ไม่ hardcode false — ผู้ใช้อาจกดดาวไว้ก่อน item ถูกเซฟ (เช่น เซฟตอน done
    // ของงานที่กดดาวไว้ตั้งแต่ยัง loading) ถ้าเขียน false ทับ eviction จะตัดของที่ปักหมุดทิ้ง
    favorite: !!item.favorite,
    version: PERSISTED_ITEM_VERSION,
    // หมายเหตุ: refs / jobId / errMsg / autoSaveStatus / autoSaveErrMsg ไม่ถูกคัดลอกมาโดยเจตนา (ดูหัวไฟล์)
  };

  try {
    await putRecord(record);
  } catch {
    // ส่วนใหญ่คือ QuotaExceededError — evict แล้วลองอีกครั้งเดียว ไม่วนซ้ำ
    try {
      await evictIfNeeded(item.mode);
      await putRecord(record);
    } catch {
      return null;
    }
  }

  await evictIfNeeded(item.mode);
  return record.key;
}

async function putRecord(record: PersistedGenItem): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, "readwrite");
  tx.objectStore(STORE_ITEMS).put(record);
  await txDone(tx);
}

/**
 * ปัก/เลิกปักหมุดผลลัพธ์ที่เก็บไว้ — item ที่ favorite รอดจาก eviction จนกว่าของที่ไม่ favorite จะหมดก่อน
 * คืน false ถ้าไม่พบ record (ถูก evict ไปแล้ว) หรือเขียนไม่สำเร็จ
 */
export async function setFavorite(key: string, favorite: boolean): Promise<boolean> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    const rec = await reqDone<PersistedGenItem | undefined>(store.get(key));
    if (!rec) return false;
    rec.favorite = favorite;
    store.put(rec);
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}

// ---------- delete ----------

/** ลบผลลัพธ์ที่เก็บไว้หนึ่งชิ้น (ผู้ใช้กดลบการ์ดใน gallery) — ไม่ throw ถ้าไม่มี record นั้นอยู่แล้ว */
export async function deleteItem(key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    tx.objectStore(STORE_ITEMS).delete(key);
    await txDone(tx);
  } catch { /* ลบไม่สำเร็จก็ปล่อย — ไม่มีอะไรให้ผู้ใช้ทำต่อ */ }
}

/** ลบผลลัพธ์ที่เก็บไว้ทั้งหมดของโหมดเดียว (เช่น ปุ่ม "ล้างแกลเลอรีโหมดนี้") */
export async function clearMode(mode: Mode): Promise<void> {
  try {
    const db = await openDb();
    const rows = await readMode(db, mode);
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    for (const r of rows) store.delete(r.key);
    await txDone(tx);
  } catch { /* เช่นเดียวกับ deleteItem */ }
}

/**
 * ล้างข้อมูลที่เก็บไว้ทั้งหมด — เรียกอัตโนมัติเมื่อผู้ใช้ปิด opt-in และเป็น "ทางล้างข้อมูล" ที่ privacy ต้องมี
 * ใช้ clear() ไม่ใช่ deleteDatabase() เพราะ deleteDatabase จะถูกบล็อกถ้ามีแท็บอื่นเปิด connection ค้างอยู่
 */
export async function clearAllPersistedItems(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    tx.objectStore(STORE_ITEMS).clear();
    await txDone(tx);
  } catch { /* ไม่มี DB อยู่เลยก็ถือว่าล้างแล้ว */ }
}

// ---------- eviction ----------

/**
 * === EVICTION POLICY (ลายลักษณ์อักษร) ===
 * ทริกเกอร์: หลัง saveItem สำเร็จทุกครั้ง และเมื่อ write โดน QuotaExceededError
 *
 * เงื่อนไขที่ต้องเข้าให้ได้พร้อมกันสองข้อ:
 *   A. จำนวนชิ้นต่อโหมด ≤ GALLERY_MAX_ITEMS_PER_MODE
 *   B. ขนาดรวมทุกโหมด ≤ GALLERY_MAX_TOTAL_BYTES
 *
 * ลำดับการตัด (เรียงจาก "ตัดก่อน" ไป "ตัดหลัง") — เหมือนกันทั้งข้อ A และ B:
 *   1. item ที่ favorite = false ตัดก่อนเสมอ  ← favorite ไม่ถูกตัดก่อน non-favorite เด็ดขาด
 *   2. ภายในกลุ่มเดียวกัน (favorite เท่ากัน) ตัด savedAt เก่าสุดก่อน (FIFO)
 *   3. item ที่ favorite = true จะโดนตัดก็ต่อเมื่อ non-favorite ในขอบเขตนั้นหมดแล้วแต่ยังเกิน cap อยู่
 *      (ผู้ใช้ปักหมุดไว้เกิน cap เอง — ยอมตัดของเก่าสุดในกลุ่ม favorite แทนที่จะหยุดเซฟของใหม่เงียบๆ)
 *
 * ข้อ A ตัดเฉพาะภายในโหมดนั้น ส่วนข้อ B ตัดข้ามทุกโหมดรวมกัน (โควตาดิสก์เป็นของกลาง)
 */
function evictionOrder(rows: PersistedGenItem[]): PersistedGenItem[] {
  // เรียง "คิวโดนตัด": non-favorite ก่อน favorite, แล้วเก่าสุดก่อนในแต่ละกลุ่ม
  return [...rows].sort(
    (a, b) => (a.favorite ? 1 : 0) - (b.favorite ? 1 : 0) || a.savedAt - b.savedAt
  );
}

/**
 * บังคับ cap ทั้งสองข้อ แล้วลบ record ที่เกินออกตามลำดับด้านบน
 * `justSavedMode` แค่จำกัดขอบเขตการตรวจ cap ต่อโหมดให้เหลือโหมดที่เพิ่งเขียน (ไม่ส่ง = ตรวจทุกโหมด)
 * ส่วน cap ขนาดรวมตรวจข้ามทุกโหมดเสมอ
 * คืนจำนวนชิ้นที่ถูกตัดทิ้ง (T8 เอาไปทำ toast แจ้งผู้ใช้ได้ว่าของเก่าถูกล้างไปกี่ชิ้น)
 */
export async function evictIfNeeded(justSavedMode?: Mode): Promise<number> {
  try {
    const db = await openDb();
    const readTx = db.transaction(STORE_ITEMS, "readonly");
    const all = await reqDone<PersistedGenItem[]>(readTx.objectStore(STORE_ITEMS).getAll());
    if (!all.length) return 0;

    const doomed = new Set<string>();

    // --- ข้อ A: cap จำนวนชิ้นต่อโหมด ---
    const modes: Mode[] = justSavedMode
      ? [justSavedMode]
      : Array.from(new Set(all.map((r) => r.mode)));
    for (const mode of modes) {
      const rows = all.filter((r) => r.mode === mode);
      const over = rows.length - GALLERY_MAX_ITEMS_PER_MODE;
      if (over <= 0) continue;
      for (const r of evictionOrder(rows).slice(0, over)) doomed.add(r.key);
    }

    // --- ข้อ B: cap ขนาดรวมข้ามทุกโหมด ---
    let total = all.reduce((sum, r) => sum + (doomed.has(r.key) ? 0 : r.bytes), 0);
    if (total > GALLERY_MAX_TOTAL_BYTES) {
      for (const r of evictionOrder(all.filter((x) => !doomed.has(x.key)))) {
        if (total <= GALLERY_MAX_TOTAL_BYTES) break;
        doomed.add(r.key);
        total -= r.bytes;
      }
    }

    if (!doomed.size) return 0;
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    for (const key of doomed) store.delete(key);
    await txDone(tx);
    return doomed.size;
  } catch {
    return 0;
  }
}
