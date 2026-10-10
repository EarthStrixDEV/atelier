import { useEffect } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import Gallery from "../components/Gallery";
import Lightbox from "../components/Lightbox";
import ExtendTool from "../components/ExtendTool";
import KeyModal from "../components/KeyModal";
import SettingsModal from "../components/SettingsModal";
import AssistFab from "../components/AssistFab";
import ChatPanel from "../components/ChatPanel";
import GrillPanel from "../components/GrillPanel";
import ImportPreviewModal from "../components/ImportPreviewModal";
import RestoreBanner from "../components/RestoreBanner";
import ShortcutsModal from "../components/ShortcutsModal";
import CompareModal from "../components/CompareModal";
import BakeOffConfirmModal from "../components/BakeOffConfirmModal";
import SpendGuardModal from "../components/SpendGuardModal";
import Toast from "../components/Toast";
import { applyTheme, autosaveSessionSnapshot, checkSavedAutoSaveDir, loadModels, loadVideoModels, reconcilePendingJobs, subscribeSystemTheme } from "../lib/actions";
import { releaseAllBlobUrls } from "../lib/blobUrls";
import { SESSION_SNAPSHOT_INTERVAL_MS } from "../lib/constants";
import { useKeyboardShortcuts } from "../lib/shortcuts";
import { mutate, saveQueueNonEmptyFlag, state } from "../lib/store";

export default function StudioApp() {
  useKeyboardShortcuts();

  useEffect(() => {
    loadModels();
    // reconcilePendingJobs() ต้องรอ videoModels โหลดเสร็จก่อน ถึงจะเช็คได้ว่าโมเดลของ job ค้างยังอยู่ไหม (ดู actions.ts)
    loadVideoModels().then(reconcilePendingJobs);
    checkSavedAutoSaveDir(); // เช็คเฉยๆ ว่ามี directory เก่าไหม — ยังไม่ขอ permission (ต้องรอ user gesture)
    // ไม่เด้งขอ API Key ตอนเปิดหน้าแล้ว (R1) — ผู้ใช้ใหม่ต้องเห็นว่าแอปทำอะไรได้ก่อน
    // key ถูกขอตอนกด Generate ครั้งแรกแทน แล้วทำงานต่อเองหลังบันทึก (ดู requireApiKey ใน actions.ts)
    // session snapshot autosave (PHASE 15) — เขียน metadata เดียวกับ exportSession ทับ localStorage ช่องเดียว
    // ทุก ~30s (เขียนจริงเฉพาะตอนมีอะไรเปลี่ยนจากครั้งก่อน ดู autosaveSessionSnapshot) กันข้อมูลหายเงียบๆ ถ้าแท็บ
    // ถูกปิด/crash กะทันหันโดยไม่ได้ export มือ — คนละเรื่องกับ "Auto Save" (เซฟไฟล์ผลลัพธ์ลงเครื่อง)
    const snapshotTimer = setInterval(autosaveSessionSnapshot, SESSION_SNAPSHOT_INTERVAL_MS);
    // backstop: revoke blob URL ของวิดีโอ/เพลงทุกชิ้นที่ยังค้างก่อนแท็บปิด กัน memory leak
    // (ปกติ browser จะ GC เองอยู่แล้วตอนปิด tab แต่ revoke ตรงๆ ชัดเจนกว่าและไม่ต้องรอ GC)
    // เขียน flag ว่าโหมดไหนมีคิวค้างอยู่ตอนปิด/reload ด้วย — ใช้ตรวจตอน boot รอบถัดไปว่าคิวหายไปจริงไหม (ดู reconcilePendingJobs)
    // และเขียน session snapshot อีกครั้งนอกจังหวะ interval ปกติ กันพลาดช่วงสุดท้ายก่อนปิดแท็บ
    const handleUnload = () => {
      releaseAllBlobUrls();
      saveQueueNonEmptyFlag();
      autosaveSessionSnapshot();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      clearInterval(snapshotTimer);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  /**
   * ธีม (F2 · T6 ฝากมา) — effect แยกจากก้อน bootstrap ข้างบนเพราะอันนั้นไม่มี cleanup ของตัวเอง
   * ส่วนอันนี้ต้อง return cleanup ของ subscribeSystemTheme ตรงๆ
   *
   * `applyTheme(state.theme)` หนึ่งครั้งตอน mount เป็น backstop ให้ DOM ตรงกับ state เสมอ —
   * inline script ใน index.html อาจไม่ได้เซ็ต data-theme เลย (localStorage ถูกปิด/ค่าในคีย์มั่ว)
   * แล้วแอปจะตกไปใช้ค่า @theme (= paper) ทั้งที่ state บอกว่าเป็นธีมอื่น
   *
   * deps ว่างโดยตั้งใจ **ห้ามใส่ state.theme** — listener ข้างใน subscribeSystemTheme เช็ค
   * `state.theme` เองตอน event ยิงอยู่แล้ว ถ้าใส่ deps จะกลายเป็น unsubscribe/resubscribe ทุกครั้ง
   * ที่ผู้ใช้เปลี่ยนธีม ซึ่งไม่ได้ประโยชน์อะไรเพิ่มเลยนอกจากโอกาส leak
   */
  // ขยายจอข้าม 900px ขณะลิ้นชักเปิดค้าง — ปิดทิ้ง ไม่งั้นกลับมาจอแคบรอบหน้าลิ้นชักเด้งเปิดเองแบบงงๆ
  // Escape ปิดลิ้นชักด้วย (เป็น overlay ทับหน้า ต้องปิดด้วยคีย์บอร์ดได้)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => { if (mq.matches && state.sidebarDrawerOpen) mutate(st => { st.sidebarDrawerOpen = false; }); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.sidebarDrawerOpen && !state.keyModalOpen) mutate(st => { st.sidebarDrawerOpen = false; });
    };
    mq.addEventListener("change", onChange);
    document.addEventListener("keydown", onKey);
    return () => { mq.removeEventListener("change", onChange); document.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    applyTheme(state.theme);
    return subscribeSystemTheme();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <RestoreBanner />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar ซ่อนตัวเองตาม sidebarCollapsed (≥900px) / sidebarDrawerOpen (<900px) ด้วย CSS — ดู Sidebar.tsx */}
        <Sidebar />
        <Gallery />
      </div>
      <Lightbox />
      <ExtendTool />
      <KeyModal />
      <SettingsModal />
      <ChatPanel />
      <GrillPanel />
      <AssistFab />
      <ImportPreviewModal />
      <ShortcutsModal />
      <CompareModal />
      <BakeOffConfirmModal />
      <SpendGuardModal />
      <Toast />
    </div>
  );
}
