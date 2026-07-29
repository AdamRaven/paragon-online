"use client";

import { useEffect, useRef } from "react";
import { drawItemIcon, ICON_GRID } from "@/lib/arena/itemIcons";

/** A tiny pixel-art icon for one item base, framed in its rarity colour. */
export function ItemIcon({
  icon,
  color,
  size = 26,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    drawItemIcon(ctx, icon, color);
  }, [icon, color]);

  return (
    <canvas
      ref={ref}
      width={ICON_GRID}
      height={ICON_GRID}
      className="item-icon-canvas"
      style={{ width: size, height: size }}
    />
  );
}
