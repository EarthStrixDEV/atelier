import { useEffect, useState } from "react";
import { Crop } from "lucide-react";
import type { RefImage } from "../lib/types";

interface RefCropPreviewProps {
  /** ref ที่ใช้เป็นตัวขับ preview — เลือกจาก REF_KINDS โดย caller (kind "ref" มาก่อนเสมอเพราะกำหนด composition/layout หลัก) */
  ref_: RefImage;
  /** aspect ratio ที่เลือกอยู่ตอนนี้ เช่น "16:9" */
  targetRatio: string;
}

interface NaturalSize {
  w: number;
  h: number;
}

/**
 * โหลดขนาดจริง (naturalWidth/Height) ของ ref image — cache ต่อ dataUrl กันโหลดซ้ำทุกครั้งที่ ratio เปลี่ยน
 * (คอมโพเนนต์นี้ mount ใหม่ทุกครั้งที่ ref เปลี่ยนอยู่แล้วเพราะ key เป็น dataUrl แต่กันไว้เผื่อ re-render อื่นๆ)
 */
function useNaturalSize(dataUrl: string): NaturalSize | null {
  const [size, setSize] = useState<NaturalSize | null>(null);
  useEffect(() => {
    setSize(null);
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
    return () => { img.onload = null; };
  }, [dataUrl]);
  return size;
}

/**
 * Crop preview overlay (PHASE 14) — เมื่อ ratio ที่เลือกไว้ไม่ตรงกับสัดส่วนจริงของภาพอ้างอิง ให้วาด overlay ทับส่วนที่
 * "จะถูกครอปทิ้ง" ถ้าโมเดล crop-to-fit ตาม aspect ratio ที่เลือก (center-crop สมมติฐานเดียวที่ทำได้โดยไม่มี network call)
 * เป็นแค่การประมาณ — ไม่ใช่การันตีว่าโมเดลจะ crop แบบนี้จริง (โมเดลบางตัวอาจ letterbox/extend ภาพแทน)
 */
export default function RefCropPreview({ ref_, targetRatio }: RefCropPreviewProps) {
  const natural = useNaturalSize(ref_.dataUrl);

  if (!natural || !natural.w || !natural.h) return null;

  const [tw, th] = targetRatio.split(":").map(Number);
  if (!tw || !th) return null;

  const nativeRatio = natural.w / natural.h;
  const targetRatioNum = tw / th;
  // ต่างกันน้อยกว่า 1% ถือว่าตรงกันอยู่แล้ว ไม่ต้องโชว์ overlay (กัน floating-point noise เช่น 1:1 เทียบ 1000x1001)
  if (Math.abs(nativeRatio - targetRatioNum) / nativeRatio < 0.01) return null;

  // คำนวณกรอบ crop (% จากภาพเต็ม) แบบ center-crop: ถ้า target แคบกว่าภาพต้นฉบับ (ratio น้อยกว่า) ครอปด้านข้าง ไม่งั้นครอปบน-ล่าง
  let cropXPct = 0;
  let cropYPct = 0;
  if (targetRatioNum < nativeRatio) {
    // target แคบกว่า (สูงกว่าเทียบกับกว้าง) — ครอปซ้าย-ขวา เหลือความสูงเท่าเดิม
    const cropW = natural.h * targetRatioNum;
    cropXPct = ((natural.w - cropW) / natural.w / 2) * 100;
  } else {
    // target กว้างกว่า (เตี้ยกว่าเทียบกับกว้าง) — ครอปบน-ล่าง เหลือความกว้างเท่าเดิม
    const cropH = natural.w / targetRatioNum;
    cropYPct = ((natural.h - cropH) / natural.h / 2) * 100;
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* แถบมืดครอบส่วนที่จะถูกครอปทิ้ง (ซ้าย/ขวา หรือ บน/ล่าง ขึ้นกับทิศที่ต่าง) */}
      {cropXPct > 0 ? (
        <>
          <div className="absolute inset-y-0 left-0 bg-media-scrim/70" style={{ width: cropXPct + "%" }} />
          <div className="absolute inset-y-0 right-0 bg-media-scrim/70" style={{ width: cropXPct + "%" }} />
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 bg-media-scrim/70" style={{ height: cropYPct + "%" }} />
          <div className="absolute inset-x-0 bottom-0 bg-media-scrim/70" style={{ height: cropYPct + "%" }} />
        </>
      )}
      {/* กรอบเส้นประรอบพื้นที่ที่จะเหลืออยู่จริงตาม ratio ที่เลือก */}
      <div
        className="absolute border-[1.5px] border-dashed border-on-media/85"
        style={{
          left: cropXPct + "%",
          right: cropXPct + "%",
          top: cropYPct + "%",
          bottom: cropYPct + "%",
        }}
      />
      <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full border border-on-media-dim bg-media-scrim/70 px-1.5 py-[2px] text-[9px] font-semibold text-on-media backdrop-blur-sm">
        <Crop size={9} /> ประมาณกรอบที่ {targetRatio}
      </span>
    </div>
  );
}
