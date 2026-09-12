import { refSupportLevel } from "../../lib/actions";
import { AUDIO_MODEL_PRICES } from "../../lib/constants";
import { MODEL_QUALITY_TAGS, type CatalogDomain } from "../../lib/catalogData";
import type { ORModel } from "../../lib/types";
import { fmtDurations, fmtUsd, videoPricePerSec } from "../../lib/utils";

const REF_BADGE_LABEL: Record<"none" | "optional" | "required", string> = {
  none: "✕ ไม่รองรับ",
  optional: "◐ รองรับ",
  required: "● จำเป็น",
};

function QualityTags({ modelId }: { modelId: string }) {
  const tags = MODEL_QUALITY_TAGS[modelId];
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {tags.map(t => (
        <span key={t} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-dim">{t}</span>
      ))}
    </div>
  );
}

function imagePriceOf(m: ORModel): number | null {
  const raw = m.pricing?.image;
  if (raw == null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ตาราง comparison ต่อ domain — คอลัมน์ spec ต่างกันโดยสิ้นเชิงตาม domain จึงแยก render เป็นสามชุด
 * แทนที่จะพยายามยัดคอลัมน์ union เดียวที่มี cell ว่างเยอะ (ตามที่ตกลงไว้ใน plan)
 */
export default function ModelComparisonTable({ models, domain }: { models: ORModel[]; domain: CatalogDomain }) {
  if (!models.length) return null;

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.8px] text-text-faint">
            <th className="px-3.5 py-2.5 font-semibold">โมเดล</th>
            <th className="px-3.5 py-2.5 text-right font-semibold">ราคา</th>
            {domain === "image" && <th className="px-3.5 py-2.5 text-right font-semibold">ภาพอ้างอิง</th>}
            {domain === "video" && <th className="px-3.5 py-2.5 text-right font-semibold">ความยาว</th>}
            {domain === "video" && <th className="px-3.5 py-2.5 text-right font-semibold">Aspect ratio</th>}
            {domain === "video" && <th className="px-3.5 py-2.5 text-right font-semibold">เสียง</th>}
            <th className="px-3.5 py-2.5 text-right font-semibold">คุณสมบัติ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {models.map(m => {
            const priceLabel =
              domain === "video"
                ? (() => {
                    const perSec = videoPricePerSec(m, false);
                    return perSec != null ? `~${fmtUsd(perSec)} / วิ` : null;
                  })()
                : domain === "audio"
                ? (() => {
                    const price = AUDIO_MODEL_PRICES[m.id];
                    return price != null ? `${fmtUsd(price)} / เพลง` : null;
                  })()
                : (() => {
                    const price = imagePriceOf(m);
                    return price != null ? `${fmtUsd(price * 1000, { trimTrailingZeros: true })} / 1k img` : null;
                  })();

            return (
              <tr key={m.id}>
                <td className="max-w-[240px] px-3.5 py-2.5">
                  <div className="truncate font-medium text-text" title={m.name || m.id}>{m.name || m.id}</div>
                  <div className="truncate font-mono text-[10.5px] text-text-faint" title={m.id}>{m.id}</div>
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono">
                  {priceLabel ?? <span className="text-text-faint">ไม่ทราบราคา</span>}
                </td>
                {domain === "image" && (
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-text-dim">
                    {REF_BADGE_LABEL[refSupportLevel("home", m)]}
                  </td>
                )}
                {domain === "video" && (
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-text-dim">
                    {m.supported_durations?.length ? fmtDurations(m.supported_durations) : "—"}
                  </td>
                )}
                {domain === "video" && (
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-text-dim">
                    {m.supported_aspect_ratios?.length ? m.supported_aspect_ratios.join(", ") : "—"}
                  </td>
                )}
                {domain === "video" && (
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-text-dim">
                    {m.generate_audio ? "รองรับ" : "ไม่รองรับ"}
                  </td>
                )}
                <td className="px-3.5 py-2.5">
                  <QualityTags modelId={m.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
