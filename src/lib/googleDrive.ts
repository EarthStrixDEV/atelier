// ---------- Google Drive: Google Identity Services (token client) + Drive REST API ----------
// client-only (ไม่มี backend) — ขอ scope "drive.file" เท่านั้น แอปเห็น/แก้ได้เฉพาะไฟล์ที่ตัวเอง upload
// access token เก็บใน module-level variable เท่านั้น (ไม่ persist — GIS ไม่ให้ persist token ข้าม reload
// โดยไม่มี backend แลก refresh token) ต้องกด "เชื่อมต่อ Google Drive" ใหม่ทุกครั้งที่เปิดแอป เหมือน Auto Save
// ที่ต้อง requestPermission ใหม่ทุก session — ดู fsAccess.ts สำหรับ pattern เดียวกัน

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken(opts?: { prompt?: string }): void };
          revoke(token: string, callback?: () => void): void;
        };
      };
    };
  }
}

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER_NAME = "Atelier Output";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export function isDriveConfigured(): boolean {
  return !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

export class DrivePermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrivePermissionError";
  }
}

let gisLoadPromise: Promise<void> | null = null;

/** โหลด GIS script แบบ lazy — เรียกครั้งแรกตอน connectDrive() เท่านั้น ไม่ผูกกับ index.html เพราะไม่ใช้ Drive ก็ไม่ต้องโหลด */
function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("โหลด Google Identity Services ไม่สำเร็จค่ะ")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("โหลด Google Identity Services ไม่สำเร็จค่ะ"));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

let accessToken: string | null = null;
let folderId: string | null = null;

export function isDriveConnected(): boolean {
  return !!accessToken;
}

/** ขอ access token ใหม่ผ่าน GIS token client — ต้องมาจาก user gesture ตรงๆ (เรียกจาก onClick) */
export async function connectDrive(): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("ยังไม่ได้ตั้งค่า VITE_GOOGLE_CLIENT_ID ค่ะ");

  await loadGisScript();
  if (!window.google?.accounts?.oauth2) throw new Error("Google Identity Services โหลดไม่สำเร็จค่ะ");

  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error === "access_denied" ? "ยกเลิกการเชื่อมต่อ Google Drive ค่ะ" : "ขอสิทธิ์ Google Drive ไม่สำเร็จค่ะ"));
          return;
        }
        accessToken = resp.access_token;
        folderId = null; // token ใหม่ — เช็ค/สร้างโฟลเดอร์ใหม่รอบถัดไปที่ upload
        resolve();
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export function disconnectDrive(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  folderId = null;
}

async function driveFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!accessToken) throw new DrivePermissionError("ยังไม่ได้เชื่อมต่อ Google Drive ค่ะ");
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    accessToken = null;
    throw new DrivePermissionError("สิทธิ์เข้าถึง Google Drive หมดอายุแล้วค่ะ กรุณาเชื่อมต่อใหม่");
  }
  return res;
}

/** หาโฟลเดอร์ "Atelier Output" ที่เคยสร้างไว้ (ผ่าน drive.file แอปเห็นเฉพาะไฟล์ตัวเองสร้าง) หรือสร้างใหม่ถ้ายังไม่มี */
async function ensureFolderId(): Promise<string> {
  if (folderId) return folderId;

  const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await driveFetch(`${DRIVE_FILES_URL}?q=${q}&fields=files(id)&spaces=drive`);
  if (!searchRes.ok) throw new Error("ค้นหาโฟลเดอร์ Drive ไม่สำเร็จค่ะ");
  const searchData = await searchRes.json();
  if (searchData.files?.[0]?.id) {
    folderId = searchData.files[0].id;
    return folderId!;
  }

  const createRes = await driveFetch(DRIVE_FILES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!createRes.ok) throw new Error("สร้างโฟลเดอร์ Drive ไม่สำเร็จค่ะ");
  const createData = await createRes.json();
  folderId = createData.id;
  return folderId!;
}

/** upload ไฟล์เดียวขึ้นโฟลเดอร์ "Atelier Output" — multipart request (metadata + ตัวไฟล์) ในก้อนเดียว */
export async function uploadToDrive(blob: Blob, filename: string): Promise<void> {
  const parent = await ensureFolderId();

  const metadata = { name: filename, parents: [parent] };
  const boundary = "atelier_drive_" + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);

  const res = await driveFetch(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error("อัพโหลดขึ้น Google Drive ไม่สำเร็จค่ะ (" + res.status + ")");
}
