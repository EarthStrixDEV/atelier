import { useEffect } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import Gallery from "../components/Gallery";
import Lightbox from "../components/Lightbox";
import KeyModal from "../components/KeyModal";
import ChatPanel from "../components/ChatPanel";
import Toast from "../components/Toast";
import { loadModels, loadVideoModels } from "../lib/actions";
import { mutate, state, useApp } from "../lib/store";

export default function StudioApp() {
  const s = useApp();

  useEffect(() => {
    loadModels();
    loadVideoModels();
    // เปิดมาให้ใส่ key ก่อนเลย ถ้ายังไม่มี
    const t = setTimeout(() => {
      if (!state.apiKey) mutate(st => { st.keyModalOpen = true; });
    }, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1 max-[860px]:flex-col">
        {!s.sidebarCollapsed && <Sidebar />}
        <Gallery />
      </div>
      <Lightbox />
      <KeyModal />
      <ChatPanel />
      <Toast />
    </div>
  );
}
