// ---------- Auto Save: File System Access API + IndexedDB persistence ----------
// รองรับเฉพาะ Chrome/Edge/Opera (showDirectoryPicker) — ไม่มี fallback ให้ Firefox/Safari
// directory handle เก็บใน module-level variable เท่านั้น (ไม่ serializable ผ่าน AppState/mutate)
// แต่ persist ลง IndexedDB เพื่อจำข้าม session ได้ — ต้องขอ permission ซ้ำทุกครั้งที่เปิดแอปใหม่
// (browser sandbox บังคับ ไม่มีทางเลี่ยง) ผ่าน user gesture เท่านั้น

// lib.dom.d.ts มี FileSystemDirectoryHandle/FileSystemFileHandle พื้นฐานอยู่แล้ว (spec เก่า)
// แต่ยังไม่มี permission API ส่วนขยาย (queryPermission/requestPermission) หรือ showDirectoryPicker
// เติมเฉพาะส่วนที่ขาดผ่าน declaration merging — ต้องอยู่ใน `declare global` เพราะไฟล์นี้เป็น module
// (interface ระดับบนสุดของไฟล์ module จะเป็น local scope ไม่ merge เข้า global อัตโนมัติ)
declare global {
  interface FileSystemDirectoryHandle {
    queryPermission(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  }
  interface FileSystemWritableFileStream {
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }
  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }
  interface Window {
    showDirectoryPicker?(opts?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
  }
}

export const fsAccessSupported = (): boolean => typeof window !== "undefined" && !!window.showDirectoryPicker;

const DB_NAME = "atelier_fs";
const STORE_NAME = "handles";
const HANDLE_KEY = "autoSaveDir";

let dirHandle: FileSystemDirectoryHandle | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** เปิด directory picker ใหม่ (ต้องมาจาก user gesture ตรงๆ) แล้ว persist handle ลง IndexedDB */
export async function pickAutoSaveDir(): Promise<string> {
  if (!window.showDirectoryPicker) throw new Error("เบราว์เซอร์นี้ไม่รองรับการเลือก directory ค่ะ (ใช้ได้เฉพาะ Chrome/Edge/Opera)");
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  dirHandle = handle;
  await idbSet(HANDLE_KEY, handle);
  return handle.name;
}

/**
 * ตอนเปิดแอปใหม่ — เช็คว่ามี handle เก่าจาก session ก่อนไหม (ไม่ขอ permission ที่นี่ เพราะไม่มี user gesture)
 * คืนแค่ชื่อ dir ให้โชว์ปุ่ม "เชื่อมต่อ Directory เดิม" — กดแล้วค่อยเรียก reconnectAutoSaveDir()
 */
export async function peekSavedDirName(): Promise<string | null> {
  try {
    const handle = await idbGet(HANDLE_KEY);
    return handle?.name ?? null;
  } catch {
    return null;
  }
}

/** ขอ permission ซ้ำกับ handle เดิมที่จำไว้ — ต้องเรียกจาก user gesture (เช่น onClick ปุ่ม) */
export async function reconnectAutoSaveDir(): Promise<string> {
  const handle = await idbGet(HANDLE_KEY);
  if (!handle) throw new Error("ไม่พบ directory ที่เคยเชื่อมต่อไว้ค่ะ");
  const perm = await handle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") throw new Error("ไม่ได้รับสิทธิ์เข้าถึง directory ค่ะ");
  dirHandle = handle;
  return handle.name;
}

export async function forgetAutoSaveDir(): Promise<void> {
  dirHandle = null;
  await idbDelete(HANDLE_KEY);
}

export function isAutoSaveDirConnected(): boolean {
  return !!dirHandle;
}

/** เขียนไฟล์ผลลัพธ์ลง directory ที่เชื่อมต่อไว้ — no-op เงียบๆ ถ้ายังไม่ได้เชื่อมต่อ (เรียกจาก generation flow ที่ไม่มี user gesture) */
export async function autoSaveBlob(blob: Blob, filename: string): Promise<void> {
  if (!dirHandle) return;
  // permission อาจถูกถอนระหว่างทาง (เช่น user ปิด tab อื่นที่ trust ไว้) — เช็คเงียบๆ ไม่ prompt ซ้ำ
  const perm = await dirHandle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") { dirHandle = null; throw new Error("สิทธิ์เข้าถึง auto-save directory หมดอายุแล้วค่ะ กรุณาเชื่อมต่อใหม่"); }
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** แปลง item.url (data URL หรือ blob URL) เป็น Blob สำหรับเขียนไฟล์ */
export async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}
