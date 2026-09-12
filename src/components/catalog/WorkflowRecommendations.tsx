import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { WORKFLOW_RECOMMENDATIONS, type CatalogDomain } from "../../lib/catalogData";
import type { ORModel } from "../../lib/types";

/**
 * "แนะนำตามงาน" — filter รายการ curated ตาม domain ที่เลือกอยู่ แล้ว resolve modelId กับ live model list
 * ที่ fetch มาจริง (ไม่ใช่ hardcode ชื่อค้าง) — ถ้าโมเดลถูกถอดออกจาก OpenRouter ไปแล้ว โชว์ id ดิบ + หมายเหตุแทน
 */
export default function WorkflowRecommendations({ domain, models }: { domain: CatalogDomain; models: ORModel[] }) {
  const items = WORKFLOW_RECOMMENDATIONS.filter(r => r.domain === domain);
  if (!items.length) return null;

  return (
    <section>
      <span className="text-xs font-semibold uppercase tracking-[1.5px] text-text-faint">แนะนำตามงาน</span>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map(r => {
          const model = models.find(m => m.id === r.modelId);
          return (
            <div key={r.id} className="rounded-card border border-border bg-surface p-6">
              <h3 className="text-[14px] font-semibold text-text">{r.useCase}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-text-dim">{r.rationale}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                <div className="min-w-0">
                  {model ? (
                    <span className="truncate text-[12.5px] font-semibold text-text" title={model.name || model.id}>
                      {model.name || model.id}
                    </span>
                  ) : (
                    <>
                      <span className="block truncate font-mono text-[12px] text-text-dim" title={r.modelId}>{r.modelId}</span>
                      <span className="text-[10.5px] text-text-faint">โมเดลนี้ไม่พบใน OpenRouter ตอนนี้</span>
                    </>
                  )}
                </div>
                <Link
                  to="/studio"
                  className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-accent transition-opacity hover:opacity-80"
                >
                  ลองใน Studio <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
