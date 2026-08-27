import { Languages } from "lucide-react";
import { setLocale } from "../lib/actions";
import { useApp } from "../lib/store";

export default function LocaleToggle() {
  const s = useApp();
  return (
    <button
      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
      title={s.locale === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
      aria-label={s.locale === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
      onClick={() => setLocale(s.locale === "th" ? "en" : "th")}
    >
      <Languages size={12} /> {s.locale === "th" ? "EN" : "TH"}
    </button>
  );
}
