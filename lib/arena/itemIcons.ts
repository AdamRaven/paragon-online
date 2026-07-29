/**
 * Small pixel-art icons for inventory/shop rows, one distinct drawing per
 * item base id (not just per category) so gear reads apart at a glance the
 * same way it does in the world. Every icon is drawn on a tiny 16x16 grid.
 */

const GRID = 16;

/** `px`-style helper bound to a specific 2D context, grid-snapped like the game world. */
function ctxPx(ctx: CanvasRenderingContext2D) {
  return (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
}

// ---------------------------------------------------------------- shapes

/** Each function draws its icon centred in a 16x16 box using `px`. */
const ICONS: Record<string, (px: ReturnType<typeof ctxPx>) => void> = {
  // --- weapons --------------------------------------------------------
  "worn-knuckles": (px) => {
    px(3, 6, 9, 6, "#8a7a68");
    px(3, 6, 9, 1, "#b3a389");
    px(4, 7, 2, 2, "#5c5040");
    px(7, 7, 2, 2, "#5c5040");
    px(11, 5, 3, 3, "#c9b896");
    px(1, 11, 13, 1, "#2a2620");
  },
  "iron-claws": (px) => {
    px(2, 8, 8, 5, "#8b93a0");
    px(2, 8, 8, 1, "#c3cad4");
    px(9, 3, 2, 7, "#dfe4ea");
    px(11, 2, 2, 7, "#dfe4ea");
    px(13, 4, 2, 6, "#dfe4ea");
    px(1, 12, 11, 1, "#2a2e34");
  },
  "ember-gauntlet": (px) => {
    px(3, 7, 9, 6, "#8a3a22");
    px(3, 7, 9, 1, "#e0693a");
    px(5, 3, 2, 5, "#f4a13f");
    px(8, 2, 2, 6, "#fbbf24");
    px(11, 4, 2, 5, "#f4a13f");
    px(2, 12, 11, 1, "#2a1610");
  },
  "hooked-scythe": (px) => {
    px(7, 2, 2, 12, "#4b3826");
    px(9, 1, 5, 2, "#c9d2dc");
    px(10, 3, 5, 2, "#e8edf2");
    px(4, 13, 4, 1, "#2a1f16");
  },
  "void-reaper": (px) => {
    px(7, 2, 2, 11, "#241a30");
    px(8, 1, 6, 2, "#5b3f8f");
    px(9, 3, 6, 2, "#8a63d6");
    px(9, 4, 2, 2, "#c9b6ff");
    px(4, 13, 4, 1, "#160f22");
  },
  "warden-maul": (px) => {
    px(6, 2, 3, 8, "#5a5148");
    px(3, 2, 9, 5, "#787069");
    px(3, 2, 9, 2, "#9a9188");
    px(4, 4, 2, 2, "#4a443e");
    px(9, 4, 2, 2, "#4a443e");
    px(4, 13, 6, 1, "#241f1a");
  },

  // --- armour -----------------------------------------------------------
  "tattered-wrap": (px) => {
    px(4, 3, 8, 9, "#6b5a45");
    px(4, 3, 8, 2, "#8a7458");
    px(3, 5, 1, 5, "#4a3e30");
    px(12, 5, 1, 5, "#4a3e30");
    px(6, 8, 1, 1, "#2e261c");
    px(9, 10, 1, 1, "#2e261c");
  },
  "scaled-vest": (px) => {
    px(4, 3, 8, 9, "#4d6b5a");
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        px(4 + col * 3, 4 + row * 3, 2, 2, "#6f9c82");
      }
    }
    px(4, 3, 8, 1, "#8fc4a3");
  },
  "onyx-plate": (px) => {
    px(3, 2, 10, 10, "#1c1f28");
    px(3, 2, 10, 2, "#3a4050");
    px(4, 5, 8, 1, "#565f73");
    px(4, 8, 8, 1, "#565f73");
    px(6, 3, 1, 8, "#565f73");
    px(9, 3, 1, 8, "#565f73");
  },

  // --- trinkets -----------------------------------------------------------
  "cracked-charm": (px) => {
    px(6, 2, 4, 4, "#6a7280");
    px(5, 6, 6, 6, "#4a5262");
    px(7, 8, 2, 2, "#93c5fd");
    px(7, 3, 1, 2, "#2a303c");
  },
  "swift-band": (px) => {
    px(4, 5, 8, 6, "#0891b2");
    px(4, 5, 8, 1, "#67e8f9");
    px(6, 7, 4, 2, "#e0fbff");
    px(3, 6, 1, 4, "#0e7490");
    px(12, 6, 1, 4, "#0e7490");
  },
  "heart-of-ash": (px) => {
    px(5, 3, 3, 3, "#dc2626");
    px(8, 3, 3, 3, "#dc2626");
    px(4, 5, 8, 4, "#ef4444");
    px(6, 9, 4, 3, "#ef4444");
    px(7, 6, 2, 2, "#fecaca");
  },

  // --- trash ----------------------------------------------------------------
  "rusted-scrap": (px) => {
    px(4, 4, 8, 8, "#6b6259");
    px(4, 4, 8, 1, "#8a8074");
    px(6, 6, 4, 4, "#4a433c");
    px(3, 3, 2, 2, "#8a8074");
    px(11, 11, 2, 2, "#8a8074");
  },
  "cracked-fang": (px) => {
    px(6, 2, 4, 6, "#e8e2d4");
    px(7, 8, 2, 5, "#e8e2d4");
    px(6, 2, 4, 1, "#fffdf6");
    px(7, 6, 2, 1, "#9c9280");
  },
  "tarnished-coin": (px) => {
    px(4, 4, 8, 8, "#a8935a");
    px(4, 4, 8, 1, "#d4bd7c");
    px(6, 6, 4, 4, "#7a6840");
    px(3, 6, 1, 4, "#7a6840");
    px(12, 6, 1, 4, "#7a6840");
  },
  "ashen-dust": (px) => {
    px(5, 9, 2, 2, "#9ca3af");
    px(8, 6, 2, 2, "#c2c8d1");
    px(10, 10, 2, 2, "#9ca3af");
    px(6, 5, 2, 2, "#e2e5ea");
    px(9, 3, 1, 1, "#e2e5ea");
    px(4, 6, 1, 1, "#e2e5ea");
  },
  "warden-sigil": (px) => {
    px(6, 2, 4, 12, "#7f1d1d");
    px(3, 5, 10, 4, "#7f1d1d");
    px(6, 2, 4, 1, "#dc2626");
    px(7, 6, 2, 2, "#fca5a5");
  },

  // --- currency / misc ---------------------------------------------------
  "enh-stone": (px) => {
    px(6, 2, 4, 2, "#38bdf8");
    px(4, 4, 8, 2, "#38bdf8");
    px(3, 6, 10, 4, "#0ea5e9");
    px(4, 10, 8, 2, "#38bdf8");
    px(6, 12, 4, 2, "#0284c7");
    px(6, 5, 2, 2, "#e0f6ff");
  },
};

export const ICON_GRID = GRID;

/**
 * Draws `iconKey` framed by a `borderColor` ring directly onto a 2D context.
 * Pure canvas work — no DOM lookups — so it's safe to call from a React
 * effect right after a `<canvas>` mounts.
 */
export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  iconKey: string,
  borderColor: string
) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, GRID, GRID);

  const px = ctxPx(ctx);
  // Panel backing so every icon sits on the same dark tile.
  px(0, 0, GRID, GRID, "#0b0e14");
  px(0, 0, GRID, 1, borderColor);
  px(0, GRID - 1, GRID, 1, borderColor);
  px(0, 0, 1, GRID, borderColor);
  px(GRID - 1, 0, 1, GRID, borderColor);

  const draw = ICONS[iconKey];
  if (draw) draw(px);
  else {
    // Fallback: a plain question mark blob so a missing key never breaks layout.
    px(6, 4, 4, 2, "#8892a6");
    px(9, 6, 1, 3, "#8892a6");
    px(7, 10, 2, 2, "#8892a6");
  }
}
