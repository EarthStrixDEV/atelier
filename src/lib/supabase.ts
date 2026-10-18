// ---------- Supabase: auth + เก็บ OpenRouter key แบบ cloud (optional) ----------
// client-only เหมือน googleDrive.ts — ใช้ publishable (anon) key ซึ่งออกแบบมาให้อยู่ใน bundle ได้
// ความปลอดภัยของข้อมูลมาจาก RLS (`user_id = auth.uid()`) ที่ตาราง user_secrets ไม่ใช่การซ่อน key
// module นี้เป็น plain async module ไม่แตะ AppState/mutate — ผู้เรียก (actions.ts) เป็นคน bridge เอง
// ทุกฟังก์ชัน "ไม่ throw": ถ้าไม่ได้ตั้งค่า หรือเครือข่ายล้ม จะคืนค่าว่าง (null/false) แทน
// เพื่อให้ฟีเจอร์ cloud ล้มได้เงียบๆ โดยไม่ทำให้แอปหลักพัง

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
    if (error.status === 400 || /invalid login credentials/i.test(error.message)) {
      return { ok: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    }
    if (/email not confirmed/i.test(error.message)) {
      return { ok: false, message: "ยังไม่ได้ยืนยันอีเมล — เช็กกล่องจดหมายก่อน" };
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
    await sb.auth.signOut();
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

export async function cloudLoadKey(): Promise<string | null> {
  const sb = getClient();
  if (!sb) return null;
  try {
    // RLS กรองให้เหลือแถวของ user ปัจจุบันอยู่แล้ว — maybeSingle เพราะผู้ใช้ใหม่ยังไม่มีแถว
    const { data, error } = await sb.from("user_secrets").select("openrouter_key").maybeSingle();
    if (error || !data?.openrouter_key) return null;
    return data.openrouter_key as string;
  } catch {
    return null;
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
