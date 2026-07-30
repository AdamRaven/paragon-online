import Image from "next/image";
import type { ClassId } from "@/lib/arena/types";

const ART: Record<ClassId, string> = {
  paragon: "/art/paragon/portrait.webp",
  shedim: "/art/shedim/portrait.webp",
  kacper: "/art/kacper/portrait.webp",
};

export function ClassPortrait({
  classId,
  aura,
  size = 96,
}: {
  classId: ClassId;
  aura: string;
  size?: number;
}) {
  return (
    <div
      className="class-portrait"
      style={{ "--aura": aura, width: size, height: size } as React.CSSProperties}
    >
      <Image
        src={ART[classId]}
        alt=""
        width={size * 2}
        height={size * 2}
        className="class-portrait-img"
      />
    </div>
  );
}
