import { useEffect, useState } from "react";
import { useApp } from "../lib/store";

export default function Toast() {
  const s = useApp();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!s.toast.msg) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [s.toast.n, s.toast.msg]);

  return (
    <div
      className={
        "fixed bottom-6 left-1/2 z-300 max-w-[80vw] -translate-x-1/2 rounded-[10px] border border-border-strong bg-surface-2 px-5 py-[11px] text-[13px] text-text transition-transform duration-250 " +
        (visible ? "translate-y-0" : "translate-y-[80px]")
      }
    >
      {s.toast.msg}
    </div>
  );
}
