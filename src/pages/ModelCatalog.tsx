import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LayoutGrid, Table2, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { loadModels, loadVideoModels } from "../lib/actions";
import { useApp } from "../lib/store";
import type { CatalogDomain } from "../lib/catalogData";
import ModelComparisonTable from "../components/catalog/ModelComparisonTable";
import ModelGridShowroom from "../components/catalog/ModelGridShowroom";
import WorkflowRecommendations from "../components/catalog/WorkflowRecommendations";

const DOMAIN_TABS: { id: CatalogDomain; label: string }[] = [
  { id: "image", label: "รูปภาพ" },
  { id: "video", label: "วิดีโอ" },
  { id: "audio", label: "เสียง" },
];

type ViewMode = "grid" | "table";

function ShimmerBlock() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-card border border-border bg-surface">
          <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(10,10,10,.06)_50%,transparent_70%)] bg-[length:200%_100%]" />
        </div>
      ))}
    </div>
  );
}

/**
 * หน้า Model Catalog (`/models`) — standalone route, public, ไม่ต้องมี API key
 * fetch โมเดลของตัวเอง (ไม่พึ่ง StudioApp mount effect) ผ่าน loadModels()/loadVideoModels() — ทั้งคู่เป็น
 * unauthenticated GET (ดู actions.ts) loadModels() เติมทั้ง s.models (ภาพ) และ s.audioModels (เสียง) พร้อมกัน
 */
export default function ModelCatalog() {
  const s = useApp();
  const [domain, setDomain] = useState<CatalogDomain>("image");
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    if (s.models.length === 0 && !s.modelsFailed) loadModels();
    if (s.videoModels.length === 0 && !s.videoModelsFailed) loadVideoModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceLoaded = domain === "video" ? s.videoModels.length > 0
    : domain === "audio" ? s.audioModels.length > 0
    : s.models.length > 0;
  const sourceFailed = domain === "video" ? s.videoModelsFailed : s.modelsFailed;

  const models = domain === "video" ? s.videoModels : domain === "audio" ? s.audioModels : s.models;
  const retry = () => (domain === "video" ? loadVideoModels() : loadModels());

  return (
    <div className="min-h-full bg-bg text-text">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-[13px] font-medium text-text-dim transition-colors hover:text-text">
            <ArrowLeft size={14} /> กลับหน้าแรก
          </Link>
          <div className="flex items-center gap-2.5">
            <img src="/atelier/assets/atelier-logo.png" alt="Atelier" className="h-9 w-9 object-contain invert" />
            <span className="text-[14px] font-semibold tracking-[0.2px]">
              Atelier <span className="ml-0.5 text-[11px] font-normal uppercase tracking-[1.5px] text-text-faint">Model Catalog</span>
            </span>
          </div>
        </div>
        <Link
          to="/studio"
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          เปิดแอป <ArrowRight size={14} />
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        {/* intro */}
        <div className="max-w-2xl border-t border-border pt-10">
          <span className="text-xs font-semibold uppercase tracking-[1.5px] text-text-faint">Models</span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">เทียบราคาและสเปกโมเดลทั้งหมด</h1>
          <p className="mt-4 text-[14px] leading-relaxed text-text-dim">
            รายชื่อโมเดลดึงสดจาก OpenRouter — เทียบราคา สเปก และดูคำแนะนำว่างานแบบไหนควรเลือกโมเดลไหน
            ก่อนเปิด Studio ไปสร้างผลงานจริง
          </p>
        </div>

        {/* domain tabs */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="ประเภทโมเดล">
            {DOMAIN_TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={domain === t.id}
                className={
                  "cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold transition-colors " +
                  (domain === t.id ? "bg-accent text-accent-ink" : "text-text-dim hover:text-text")
                }
                onClick={() => setDomain(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-full border border-border p-1" role="tablist" aria-label="รูปแบบการแสดงผล">
            <button
              role="tab"
              aria-selected={view === "grid"}
              aria-label="มุมมองการ์ด"
              title="การ์ด"
              className={"grid cursor-pointer place-items-center rounded-full p-1.5 transition-colors " + (view === "grid" ? "bg-surface-2 text-text" : "text-text-faint hover:text-text-dim")}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              role="tab"
              aria-selected={view === "table"}
              aria-label="มุมมองตาราง"
              title="ตาราง"
              className={"grid cursor-pointer place-items-center rounded-full p-1.5 transition-colors " + (view === "table" ? "bg-surface-2 text-text" : "text-text-faint hover:text-text-dim")}
              onClick={() => setView("table")}
            >
              <Table2 size={14} />
            </button>
          </div>
        </div>

        {/* content */}
        <div className="mt-8">
          {!sourceLoaded && !sourceFailed && <ShimmerBlock />}

          {sourceFailed && (
            <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-14 text-center">
              <TriangleAlert size={22} className="text-text-faint" />
              <p className="text-[13.5px] text-text-dim">โหลดรายชื่อโมเดลไม่สำเร็จ ลองใหม่อีกครั้งนะคะ</p>
              <button
                className="cursor-pointer rounded-full border border-border-strong px-4 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-text"
                onClick={retry}
              >
                ลองใหม่
              </button>
            </div>
          )}

          {sourceLoaded && !models.length && (
            <p className="rounded-card border border-border bg-surface px-6 py-14 text-center text-[13.5px] text-text-dim">
              ไม่พบโมเดลในหมวดนี้
            </p>
          )}

          {sourceLoaded && models.length > 0 && (
            view === "table" ? (
              <ModelComparisonTable models={models} domain={domain} />
            ) : (
              <ModelGridShowroom models={models} domain={domain} />
            )
          )}
        </div>

        {/* workflow recommendations */}
        <div className="mt-14">
          <WorkflowRecommendations domain={domain} models={models} />
        </div>
      </main>
    </div>
  );
}
