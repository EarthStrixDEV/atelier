import { Image, Music, Video } from "lucide-react";
import { AUDIO_MODEL_PRICES } from "../../lib/constants";
import { MODEL_QUALITY_TAGS, type CatalogDomain } from "../../lib/catalogData";
import type { ORModel } from "../../lib/types";
import { fmtDurations, fmtUsd, videoPricePerSec } from "../../lib/utils";

const DOMAIN_ICON: Record<CatalogDomain, typeof Image> = { image: Image, video: Video, audio: Music };

function imagePriceOf(m: ORModel): number | null {
  const raw = m.pricing?.image;
  if (raw == null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function priceLabelFor(m: ORModel, domain: CatalogDomain): string | null {
  if (domain === "video") {
    const perSec = videoPricePerSec(m, false);
    return perSec != null ? `~${fmtUsd(perSec)}/วิ` : null;
  }
  if (domain === "audio") {
    const price = AUDIO_MODEL_PRICES[m.id];
    return price != null ? `${fmtUsd(price)}/เพลง` : null;
  }
  const price = imagePriceOf(m);
  return price != null ? `${fmtUsd(price * 1000, { trimTrailingZeros: true })}/1k img` : null;
}

/**
 * Grid showroom แบบ CSS grid ธรรมดา — ไม่ใช้ react-window เพราะแต่ละ domain มีแค่ ~10-15 โมเดล
 * ไม่มี thumbnail จริงให้แสดง (ORModel ไม่มี field รูปภาพ) จึงใช้ placeholder visual block แทน
 */
export default function ModelGridShowroom({ models, domain }: { models: ORModel[]; domain: CatalogDomain }) {
  if (!models.length) return null;
  const Icon = DOMAIN_ICON[domain];

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      {models.map(m => {
        const priceLabel = priceLabelFor(m, domain);
        const tags = MODEL_QUALITY_TAGS[m.id];
        const specLine =
          domain === "video" && (m.supported_durations?.length || m.supported_aspect_ratios?.length)
            ? [
                m.supported_durations?.length ? fmtDurations(m.supported_durations) : null,
                m.supported_aspect_ratios?.length ? m.supported_aspect_ratios.join(", ") : null,
              ].filter(Boolean).join(" · ")
            : null;

        return (
          <div key={m.id} className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
            <div className="grid aspect-[4/3] place-items-center border-b border-border bg-surface-2 text-text-faint">
              <Icon size={28} strokeWidth={1.5} />
            </div>
            <div className="flex flex-1 flex-col gap-1 px-3.5 py-3">
              <span className="text-[13px] font-semibold text-text" title={m.name || m.id}>{m.name || m.id}</span>
              <span className="truncate font-mono text-[10.5px] text-text-faint" title={m.id}>{m.id}</span>
              {specLine && <span className="mt-1 text-[11px] text-text-dim">{specLine}</span>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5 text-[11px] text-text-dim">
              <span className="font-mono">
                {priceLabel ?? <span className="text-text-faint">ไม่ทราบราคา</span>}
              </span>
              {tags?.length ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {tags.slice(0, 2).map(t => (
                    <span key={t} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-dim">{t}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
