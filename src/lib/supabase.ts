// ---------- Supabase: auth + เก็บ OpenRouter key แบบ cloud (optional) ----------
// client-only เหมือน googleDrive.ts — ใช้ publishable (anon) key ซึ่งออกแบบมาให้อยู่ใน bundle ได้
// ความปลอดภัยของข้อมูลมาจาก RLS (`user_id = auth.uid()`) ที่ตาราง user_secrets ไม่ใช่การซ่อน key
// module นี้เป็น plain async module ไม่แตะ AppState/mutate — ผู้เรียก (actions.ts) เป็นคน bridge เอง
// ทุกฟังก์ชัน "ไม่ throw": ถ้าไม่ได้ตั้งค่า หรือเครือข่ายล้ม จะคืนค่าว่าง (null/false) แทน
// เพื่อให้ฟีเจอร์ cloud ล้มได้เงียบๆ โดยไม่ทำให้แอปหลักพัง

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Mode } from "./types";

export interface CloudUser {
  userId: string;
  email: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isCloudConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

// สร้างแบบ lazy — ไม่ตั้งค่า env ก็ไม่สร้าง client เลย (createClient จะ throw ถ้า url ว่าง)
let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (!client) {
    try {
      client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
        // storageKey ขึ้นต้นด้วย atelier_ เพื่อให้ storage breakdown ใน Settings นับรวมด้วย
        auth: { persistSession: true, storageKey: "atelier_supabase_auth" },
      });
    } catch {
      return null;
    }
  }
  return client;
}

export async function cloudGetSession(): Promise<CloudUser | null> {
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    return user ? { userId: user.id, email: user.email ?? "" } : null;
  } catch {
    return null;
  }
}

export async function cloudSignIn(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getClient();
  if (!sb) return { ok: false, message: "ยังไม่ได้ตั้งค่า Cloud Sync" };
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (!error) return { ok: true };
    // แยกเคส "ข้อมูลผิด" ออกจาก "เครือข่าย/ระบบ" ให้ผู้ใช้รู้ว่าต้องแก้อะไร — ไม่ echo password กลับ
    // email_not_confirmed ก็มาเป็น HTTP 400 เหมือนกัน — ต้องเช็ก code นี้ก่อน ไม่งั้นถูกกลืนเป็น "รหัสผิด"
    if (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
      return { ok: false, message: "ยังไม่ได้ยืนยันอีเมล — เช็กกล่องจดหมายก่อน" };
    }
    // fallback ด้วย message สำหรับ error รุ่นเก่าที่ไม่มี code
    if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
      return { ok: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    }
    if (error.status === 429) {
      return { ok: false, message: "ลองบ่อยเกินไป — รอสักครู่แล้วลองใหม่" };
    }
    return { ok: false, message: "เข้าสู่ระบบไม่สำเร็จ — ลองใหม่อีกครั้ง" };
  } catch {
    return { ok: false, message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

export async function cloudSignOut(): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    // scope local — ค่าเริ่มต้นของ supabase-js คือ global ซึ่งจะ revoke session ของทุกเครื่อง
    await sb.auth.signOut({ scope: "local" });
  } catch { /* ออกจากระบบฝั่ง server ไม่สำเร็จ — ไม่มีอะไรให้ทำต่อ */ }
}

export function onCloudAuthChange(fn: (user: CloudUser | null) => void): void {
  const sb = getClient();
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    fn(user ? { userId: user.id, email: user.email ?? "" } : null);
  });
}

/**
 * แยก "ไม่มีแถว" (ok + key null) ออกจาก "อ่านไม่สำเร็จ" (ok: false) — ผู้เรียกจะ seed key ในเครื่องขึ้น cloud
 * เฉพาะเคสแรกเท่านั้น ถ้ารวมสองเคสเป็น null เดียว network สะดุดครั้งเดียวจะเขียน key เก่าทับ key บน cloud ได้
 */
export async function cloudLoadKey(): Promise<{ ok: true; key: string | null } | { ok: false }> {
  const sb = getClient();
  if (!sb) return { ok: false };
  try {
    // RLS กรองให้เหลือแถวของ user ปัจจุบันอยู่แล้ว — maybeSingle เพราะผู้ใช้ใหม่ยังไม่มีแถว
    const { data, error } = await sb.from("user_secrets").select("openrouter_key").maybeSingle();
    if (error) return { ok: false };
    return { ok: true, key: (data?.openrouter_key as string | undefined) || null };
  } catch {
    return { ok: false };
  }
}

export async function cloudSaveKey(key: string): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;
  try {
    const { data } = await sb.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    const { error } = await sb
      .from("user_secrets")
      .upsert(
        { user_id: userId, openrouter_key: key, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return !error;
  } catch {
    return false;
  }
}

export async function cloudDeleteKey(): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;
  try {
    const { data } = await sb.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    const { error } = await sb.from("user_secrets").delete().eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

// ---------- Cloud gallery: ตาราง cloud_items + bucket "media" ----------

const MEDIA_BUCKET = "media";
/** ตรงกับ allowed MIME ของ bucket และ ALLOWED_MIME_PREFIX ใน galleryStore.ts */
const ALLOWED_MIME_PREFIX = ["image/", "video/", "audio/"];

/**
 * metadata หนึ่งแถวของ cloud_items — allowlist เหมือน PersistedGenItem (ไม่มี refs/apiKey/jobId/error text)
 * ชื่อ field เป็น camelCase เฉพาะฝั่งแอป แปลงเป็น snake_case ของคอลัมน์จริงในไฟล์นี้ที่เดียว (toRow)
 */
export interface CloudItemMeta {
  id: string;
  mode: Mode;
  storagePath: string;
  mime: string;
  bytes: number;
  prompt: string;
  model: string;
  modelName: string;
  ratio: string;
  duration: number;
  audio: boolean;
  negPrompt: string;
  bakeOffGroupId: number;
  favorite: boolean;
  ttsVoiceId: string | null;
  /** cloudId ของ item ต้นทางใน chain (cinematic/refine) — null = root หรือ parent ยังไม่ได้อัพโหลด */
  parentCloudId: string | null;
  createdAt: string;
}

function toRow(m: Omit<CloudItemMeta, "createdAt">) {
  return {
    id: m.id,
    mode: m.mode,
    storage_path: m.storagePath,
    mime: m.mime,
    bytes: m.bytes,
    prompt: m.prompt,
    model: m.model,
    model_name: m.modelName,
    ratio: m.ratio,
    duration: m.duration,
    audio: m.audio,
    neg_prompt: m.negPrompt,
    bake_off_group_id: m.bakeOffGroupId,
    favorite: m.favorite,
    tts_voice_id: m.ttsVoiceId,
    parent_cloud_id: m.parentCloudId,
  };
}

/** แถวดิบจาก PostgREST → CloudItemMeta — bigint (bytes/bake_off_group_id) อาจมาเป็น string จึงแปลงด้วย Number */
function fromRow(r: Record<string, unknown>): CloudItemMeta {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: str(r.id),
    mode: r.mode as Mode,
    storagePath: str(r.storage_path),
    mime: str(r.mime),
    bytes: Number(r.bytes) || 0,
    prompt: str(r.prompt),
    model: str(r.model),
    modelName: str(r.model_name),
    ratio: str(r.ratio),
    duration: Number(r.duration) || 0,
    audio: !!r.audio,
    negPrompt: str(r.neg_prompt),
    bakeOffGroupId: Number(r.bake_off_group_id) || 0,
    favorite: !!r.favorite,
    ttsVoiceId: typeof r.tts_voice_id === "string" ? r.tts_voice_id : null,
    parentCloudId: typeof r.parent_cloud_id === "string" ? r.parent_cloud_id : null,
    createdAt: str(r.created_at),
  };
}

/** แถวล่าสุดของโหมดหนึ่ง เรียงใหม่→เก่า (RLS กรองเป็นของผู้ใช้ปัจจุบันแล้ว) — อ่านไม่สำเร็จ/ไม่ได้ตั้งค่า = [] */
export async function cloudListRecent(mode: Mode, limit: number): Promise<CloudItemMeta[]> {
  const sb = getClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("cloud_items")
      .select("*")
      .eq("mode", mode)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(fromRow).filter(m => m.id && m.storagePath);
  } catch {
    return [];
  }
}

/** ดาวน์โหลดไฟล์หนึ่งชิ้นจาก bucket "media" — ไม่มีไฟล์/ไม่มีสิทธิ์/เครือข่ายล้ม = null (ไม่ throw) */
export async function cloudDownload(storagePath: string): Promise<Blob | null> {
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage.from(MEDIA_BUCKET).download(storagePath);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** นามสกุลไฟล์จาก MIME — ใช้แค่ตั้งชื่อ object ใน storage (contentType จริงส่งแยกอยู่แล้ว) */
function extForMime(mime: string): string {
  const sub = mime.split(";")[0].split("/")[1]?.trim().toLowerCase() ?? "";
  const known: Record<string, string> = {
    jpeg: "jpg", "svg+xml": "svg", mpeg: mime.startsWith("audio/") ? "mp3" : "mpeg",
    quicktime: "mov", "x-wav": "wav", wave: "wav", "x-m4a": "m4a", mp4: "mp4",
  };
  if (known[sub]) return known[sub];
  return /^[a-z0-9]+$/.test(sub) ? sub : "bin";
}

/**
 * เหตุที่อัพโหลดไม่สำเร็จ — ไฟล์นี้ไม่มีข้อความ UI (ผู้เรียกแปลผ่าน t("actions.cloud.err.<code>") ใน actions.ts)
 * read_failed ไม่ได้มาจากไฟล์นี้ — actions.ts ใช้ตอนอ่าน blob จาก item.url ไม่สำเร็จ
 */
export type CloudUploadErrorCode =
  | "not_configured" | "bad_mime" | "not_signed_in" | "insert_failed" | "upload_failed" | "network" | "read_failed";

/**
 * อัพโหลดหนึ่งชิ้น: insert แถวก่อน (id สร้างฝั่ง client เพราะ path ต้องมี id) → upload object
 * upload พลาด → ลบแถวทิ้ง ไม่ให้มีแถวกำพร้าที่ไม่มีไฟล์ — ไม่ throw ทุกกรณี
 */
export async function cloudUploadItem(
  meta: Omit<CloudItemMeta, "id" | "createdAt" | "storagePath" | "bytes" | "mime">,
  blob: Blob,
): Promise<{ ok: true; id: string; storagePath: string } | { ok: false; code: CloudUploadErrorCode; detail?: string }> {
  const sb = getClient();
  if (!sb) return { ok: false, code: "not_configured" };
  const mime = (blob.type || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME_PREFIX.some(p => mime.startsWith(p))) {
    return { ok: false, code: "bad_mime", detail: mime || undefined };
  }
  try {
    const { data } = await sb.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return { ok: false, code: "not_signed_in" };

    const id = crypto.randomUUID();
    const storagePath = `${userId}/${meta.mode}/${id}.${extForMime(mime)}`;
    const { error: insertErr } = await sb
      .from("cloud_items")
      .insert(toRow({ ...meta, id, storagePath, mime, bytes: blob.size }));
    if (insertErr) return { ok: false, code: "insert_failed", detail: insertErr.message };

    let uploadMsg: string | null = null;
    try {
      const { error: upErr } = await sb.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, blob, { contentType: mime, upsert: false });
      if (upErr) uploadMsg = upErr.message;
    } catch (e) {
      uploadMsg = e instanceof Error ? e.message : String(e);
    }
    if (uploadMsg !== null) {
      try {
        await sb.from("cloud_items").delete().eq("id", id);
      } catch { /* ลบแถวไม่สำเร็จ — ไม่มีอะไรให้ทำต่อ (แถวไม่มีไฟล์ Task 5 ต้องข้ามเองตอน restore) */ }
      return { ok: false, code: "upload_failed", detail: uploadMsg };
    }
    return { ok: true, id, storagePath };
  } catch {
    return { ok: false, code: "network" };
  }
}

/**
 * ลบหลายชิ้นจาก cloud: ลบ object ใน bucket ก่อน แล้วค่อยลบแถว — ลบไฟล์ไม่ผ่านจะไม่แตะแถว
 * (แถวที่เหลืออยู่ยังชี้ไปหาไฟล์ได้ ดีกว่าไฟล์กำพร้าที่ไม่มีแถวไหนอ้างถึงแล้วไม่มีใครลบให้อีก)
 * storagePath ว่าง (record เก่าที่มีแค่ cloudId) → อ่าน storage_path จากแถวก่อน ไม่งั้นไฟล์จะค้างใน bucket
 * ไม่ throw — คืน false เมื่อขั้นไหนก็ตามไม่สำเร็จ
 */
export async function cloudDeleteItems(items: { id: string; storagePath: string }[]): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;
  const ids = items.map(x => x.id).filter(Boolean);
  if (!ids.length) return true;
  try {
    const paths = items.map(x => x.storagePath).filter(Boolean);
    const missing = items.filter(x => x.id && !x.storagePath).map(x => x.id);
    if (missing.length) {
      const { data, error } = await sb.from("cloud_items").select("storage_path").in("id", missing);
      if (error) return false;
      for (const r of (data ?? []) as { storage_path: unknown }[]) {
        if (typeof r.storage_path === "string" && r.storage_path) paths.push(r.storage_path);
      }
    }
    if (paths.length) {
      const { error: rmErr } = await sb.storage.from(MEDIA_BUCKET).remove(paths);
      if (rmErr) return false;
    }
    const { error } = await sb.from("cloud_items").delete().in("id", ids);
    return !error;
  } catch {
    return false;
  }
}

/** ตั้งค่า favorite ให้หลายแถวพร้อมกัน (RLS กรองเป็นของผู้ใช้ปัจจุบันแล้ว) — ไม่ throw */
export async function cloudSetFavorite(ids: string[], favorite: boolean): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;
  if (!ids.length) return true;
  try {
    const { error } = await sb.from("cloud_items").update({ favorite }).in("id", ids);
    return !error;
  } catch {
    return false;
  }
}

/**
 * จำนวนชิ้น + ขนาดรวมบน cloud ของผู้ใช้ปัจจุบัน (RLS กรองให้แล้ว)
 * ok: false = อ่านไม่สำเร็จ แยกจาก "ยังไม่มีอะไร" (count 0) เพื่อไม่โชว์ 0 ชิ้นหลอกตอน network ล้ม
 * ไล่อ่านทีละหน้า เพราะ PostgREST คืนสูงสุด 1000 แถวต่อ request และ aggregate (sum) ปิดไว้เป็นค่าเริ่มต้น
 */
export async function cloudUsage(): Promise<{ ok: true; count: number; bytes: number } | { ok: false }> {
  const sb = getClient();
  if (!sb) return { ok: false };
  const PAGE = 1000;
  try {
    let count = 0;
    let bytes = 0;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from("cloud_items").select("bytes").order("id").range(from, from + PAGE - 1);
      if (error) return { ok: false };
      const rows = (data ?? []) as { bytes: number | string }[];
      count += rows.length;
      for (const r of rows) bytes += Number(r.bytes) || 0;
      if (rows.length < PAGE) break;
    }
    return { ok: true, count, bytes };
  } catch {
    return { ok: false };
  }
}
