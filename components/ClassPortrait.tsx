import Image from "next/image";
import type { ClassId } from "@/lib/arena/types";

const ART: Partial<Record<ClassId, string>> = {
  paragon: "/art/paragon.webp",
  shedim: "/art/shaedim.webp",
};

/**
 * Kacper has no reference art yet. Rather than leave a blank slot, render a
 * greatsword emblem in his palette so the row still reads as three deliberate
 * character picks instead of two finished ones and a placeholder.
 */
function KacperGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="class-glyph">
      <line x1="50" y1="10" x2="50" y2="66" stroke="#d8dee9" strokeWidth="6" strokeLinecap="square" />
      <line x1="50" y1="10" x2="50" y2="66" stroke="#8891a3" strokeWidth="2" strokeLinecap="square" />
      <line x1="34" y1="30" x2="66" y2="30" stroke="#5b6b8c" strokeWidth="7" strokeLinecap="square" />
      <rect x="46" y="64" width="8" height="16" fill="#3a4256" />
      <rect x="43" y="78" width="14" height="7" fill="#2b3245" />
    </svg>
  );
}

export function ClassPortrait({
  classId,
  aura,
  size = 96,
}: {
  classId: ClassId;
  aura: string;
  size?: number;
}) {
  const art = ART[classId];
  return (
    <div
      className="class-portrait"
      style={{ "--aura": aura, width: size, height: size } as React.CSSProperties}
    >
      {art ? (
        <Image src={art} alt="" width={size * 2} height={size * 2} className="class-portrait-img" />
      ) : (
        <div className="class-portrait-fallback">
          <KacperGlyph size={Math.round(size * 0.6)} />
        </div>
      )}
    </div>
  );
}
