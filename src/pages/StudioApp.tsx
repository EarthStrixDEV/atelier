import { useEffect } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import Gallery from "../components/Gallery";
import Lightbox from "../components/Lightbox";
import ExtendTool from "../components/ExtendTool";
import KeyModal from "../components/KeyModal";
import ChatPanel from "../components/ChatPanel";
import GrillPanel from "../components/GrillPanel";
import ImportPreviewModal from "../components/ImportPreviewModal";
import RestoreBanner from "../components/RestoreBanner";
import ShortcutsModal from "../components/ShortcutsModal";
import CompareModal from "../components/CompareModal";
import BakeOffConfirmModal from "../components/BakeOffConfirmModal";
import SpendGuardModal from "../components/SpendGuardModal";
import Toast from "../components/Toast";
import { autosaveSessionSnapshot, checkSavedAutoSaveDir, loadModels, loadVideoModels, reconcilePendingJobs } from "../lib/actions";
import { releaseAllBlobUrls } from "../lib/blobUrls";
import { SESSION_SNAPSHOT_INTERVAL_MS } from "../lib/constants";
import { useKeyboardShortcuts } from "../lib/shortcuts";
import { mutate, saveQueueNonEmptyFlag, state, useApp } from "../lib/store";

export default function StudioApp() {
  const s = useApp();
  useKeyboardShortcuts();

  useEffect(() => {
    loadModels();
    // reconcilePendingJobs() ต้องรอ videoModels โหลดเสร็จก่อน ถึงจะเช็คได้ว่าโมเดลของ job ค้างยังอยู่ไหม (ดู actions.ts)
    loadVideoModels().then(reconcilePendingJobs);
    checkSavedAutoSaveDir(); // เช็คเฉยๆ ว่ามี directory เก่าไหม — ยังไม่ขอ permission (ต้องรอ user gesture)
    // เปิดมาให้ใส่ key ก่อนเลย ถ้ายังไม่มี
    const t = setTimeout(() => {
      if (!state.apiKey) mutate(st => { st.keyModalOpen = true; });
    }, 400);
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
      clearTimeout(t);
      clearInterval(snapshotTimer);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <RestoreBanner />
      <div className="flex min-h-0 flex-1 max-[860px]:flex-col">
        {!s.sidebarCollapsed && <Sidebar />}
        <Gallery />
      </div>
      <Lightbox />
      <ExtendTool />
      <KeyModal />
      <ChatPanel />
      <GrillPanel />
      <ImportPreviewModal />
      <ShortcutsModal />
      <CompareModal />
      <BakeOffConfirmModal />
      <SpendGuardModal />
      <Toast />
    </div>
  );
}
