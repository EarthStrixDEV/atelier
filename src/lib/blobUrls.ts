/**
 * Registry อายุของ blob URL (video/audio) ที่ผูกกับ GenItem แต่ละชิ้น
 * requestVideo/requestAudio ใน actions.ts สร้าง blob URL ด้วย URL.createObjectURL() แล้วเก็บไว้ยาวๆ
 * ใน item.url ตลอดอายุ session (gallery เป็น memory-only) — ต้อง revoke ตอน item หลุดจาก state จริงๆ
 * (mode reset) หรือก่อนปิดแท็บ ไม่งั้น browser จะถือ memory ของไฟล์นั้นไว้ต่อจนกว่าจะปิด tab เอง
 */
const registry = new Map<number, string[]>();

/** เรียกทันทีหลัง URL.createObjectURL() สำเร็จ เพื่อให้ registry รู้จัก URL นี้ */
export function registerBlobUrl(id: number, url: string) {
  const list = registry.get(id);
  if (list) list.push(url);
  else registry.set(id, [url]);
}

/** revoke blob URL ทั้งหมดของ item id นี้ แล้วลบออกจาก registry — เรียกตอน item หลุดจาก state จริงๆ เท่านั้น */
export function releaseBlobUrls(id: number) {
  const list = registry.get(id);
  if (!list) return;
  for (const url of list) URL.revokeObjectURL(url);
  registry.delete(id);
}

/** revoke blob URL ของทุก item ที่ยังค้างอยู่ใน registry — ใช้ตอน reset โหมด/session ทั้งชุด */
export function releaseAllBlobUrls() {
  for (const list of registry.values()) {
    for (const url of list) URL.revokeObjectURL(url);
  }
  registry.clear();
}
