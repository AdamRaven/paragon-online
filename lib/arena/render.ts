import { getClass } from "./classes";
import type { ArenaEngine } from "./engine";
import { MOB_TYPES } from "./mobs";
import {
  WORLD_PER_PIXEL as S,
  px,
  pxCircle,
  pxDither,
  pxGlow,
  pxText,
} from "./pixel";
import type { Fighter } from "./types";

/** Palette shared by the terrain and background so everything reads as one set. */
const PAL = {
  skyTop: "#12132a",
  skyMid: "#1b1d3a",
  skyLow: "#241f3c",
  farA: "#1d2145",
  farB: "#232752",
  midA: "#191c3a",
  rockLit: "#5d6b8a",
  rockTop: "#41506e",
  rockBody: "#2b3550",
  rockDark: "#1c2438",
  rockDeep: "#141a2b",
  grass: "#4a7a52",
  grassLit: "#63a065",
  hazard: "#d94f4f",
  void: "#080a14",
  ink: "#0a0c16",
};

/** In the campaign you are the only non-mob, so your own label is just noise. */
let showPlayerName = true;

export function renderArena(ctx: CanvasRenderingContext2D, engine: ArenaEngine) {
  showPlayerName = engine.mode === "duel";
  // The canvas is already sized in art pixels, so draw straight into it.
  const b = ctx;
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;

  // Camera in art-pixel space, snapped so the world never sub-pixel jitters.
  // S converts world units to art pixels; the buffer is then upscaled.
  const shakeX = (Math.random() - 0.5) * engine.shake;
  const shakeY = (Math.random() - 0.5) * engine.shake;
  const camX = Math.round((engine.camera.x + shakeX) / S);
  const camY = Math.round((engine.camera.y + shakeY) / S);
  /** World units -> art pixels. */
  const wx = (v: number) => Math.round(v / S) - camX;
  const wy = (v: number) => Math.round(v / S) - camY;

  const biome = (engine as ArenaEngine & { stage?: { biome?: string } }).stage?.biome ?? "keep";
  drawSky(b, vw, vh, camX, camY, biome);
  drawTerrain(b, engine, wx, wy, vw, vh, biome);

  for (const bh of engine.blackHoles) {
    drawBlackHole(b, wx(bh.x), wy(bh.y), bh.radius / S, bh.life / bh.maxLife, engine.time);
  }
  drawMerchant(b, engine, wx, wy, engine.time);
  for (const f of engine.fighters) drawFighter(b, f, wx, wy, engine.time);
  drawHitboxes(b, engine, wx, wy);
  for (const p of engine.projectiles) {
    drawProjectile(b, wx(p.x), wy(p.y), p.w / S, p.color);
  }
  drawParticles(b, engine, wx, wy);
  drawTexts(b, engine, wx, wy);
  drawVignette(b, vw, vh);
}

// ------------------------------------------------------------------ backdrop

/** Each biome gets its own sky, silhouettes and ambience. */
const BIOMES: Record<string, {
  sky: [string, string, string];
  far: string;
  near: string;
  accent: string;
  stars: boolean;
  /** Surface cap and its lit edge. */
  cap: string;
  capLit: string;
}> = {
  town: {
    sky: ["#20304e", "#39506d", "#6b7285"], far: "#2b3d55", near: "#22303f",
    accent: "#f6b352", stars: false, cap: "#6b5336", capLit: "#8f7047",
  },
  outskirts: {
    sky: ["#16213c", "#22314f", "#33405a"], far: "#1e3a34", near: "#162a26",
    accent: "#5f9e63", stars: true, cap: "#4a7a52", capLit: "#63a065",
  },
  undercity: {
    sky: ["#0d0f1c", "#141a2c", "#1b2036"], far: "#1a1f38", near: "#12162a",
    accent: "#7c5cc4", stars: false, cap: "#3a4a55", capLit: "#526b74",
  },
  keep: {
    sky: ["#2a1220", "#43182a", "#5c2130"], far: "#331526", near: "#20101c",
    accent: "#e05a3c", stars: false, cap: "#5b2a22", capLit: "#a34a2c",
  },
};

/**
 * Vertical parallax reference. The backdrop is anchored around this camera
 * height so distant layers drift with the world instead of being welded to the
 * screen — otherwise jumping makes the scenery appear to slide upward.
 */
const CAM_REF_Y = 120;

function drawSky(
  b: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  camX: number,
  camY: number,
  biomeId: string
) {
  /** Screen offset for a layer moving at `speed` relative to the world. */
  const vshift = (speed: number) => Math.round((CAM_REF_Y - camY) * speed);
  const B = BIOMES[biomeId] ?? BIOMES.keep;
  // Banded sky: hard colour steps rather than a smooth gradient.
  const skyShift = vshift(0.08);
  px(b, 0, 0, vw, vh, B.sky[0]);
  px(b, 0, vh * 0.42 + skyShift, vw, vh, B.sky[1]);
  px(b, 0, vh * 0.62 + skyShift, vw, vh, B.sky[2]);
  pxDither(b, 0, vh * 0.38 + skyShift, vw, 6, B.sky[1]);
  pxDither(b, 0, vh * 0.58 + skyShift, vw, 6, B.sky[2]);

  if (B.stars) {
    b.fillStyle = "#5b6396";
    for (let i = 0; i < 70; i++) {
      const sx = ((i * 97) % 400) - ((camX * 0.1) % 400);
      const sy = ((i * 53) % Math.round(vh * 0.4)) + vshift(0.1);
      const x = ((sx % vw) + vw) % vw;
      b.fillRect(Math.round(x), Math.round(sy), 1, 1);
    }
    // A moon, fixed in the sky.
    const moonY = Math.round(vh * 0.16) + vshift(0.1);
    pxCircle(b, Math.round(vw * 0.78), moonY, 7, "#c9d6f0");
    pxCircle(b, Math.round(vw * 0.80), moonY - 1, 5, B.sky[0]);
  }
  if (biomeId === "keep") {
    // Embers drifting up from the lava below.
    b.fillStyle = B.accent;
    for (let i = 0; i < 26; i++) {
      const ex = ((i * 137 - camX * 0.4) % vw + vw) % vw;
      const ey = vh - ((i * 71 + Date.now() * 0.012) % vh) + vshift(0.3);
      b.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
  }

  const skyline = (speed: number, colour: string, baseTop: number, kind: string) => {
    const gap = kind === "trees" ? 34 : kind === "houses" ? 52 : 74;
    const off = -Math.round(camX * speed) % gap;
    const top = baseTop + vshift(speed);
    // Layers are drawn to well past the bottom edge so a rising camera never
    // exposes their base.
    const bottom = vh + 200;
    for (let x = off - gap; x < vw + gap; x += gap) {
      if (kind === "trees") {
        // Conifer silhouettes.
        px(b, x + 5, top + 8, 2, bottom - top, colour);
        for (let t = 0; t < 5; t++) {
          const wdt = 4 + t * 2;
          px(b, x + 6 - wdt / 2, top + t * 4, wdt, 4, colour);
        }
      } else if (kind === "houses") {
        // Pitched roofs with lit windows, at staggered heights.
        const wdt = 26;
        const jitter = Math.abs(Math.round(x)) % 14;
        const hy = top + jitter;
        px(b, x, hy, wdt, bottom - hy, colour);
        for (let r = 0; r < 7; r++) {
          px(b, x + r, hy - 7 + r, wdt - r * 2, 1, colour);
        }
        px(b, x + 5, hy + 6, 4, 4, BIOMES.town.accent);
        px(b, x + 16, hy + 6, 4, 4, BIOMES.town.accent);
        px(b, x + 5, hy + 15, 4, 4, BIOMES.town.accent);
      } else if (kind === "arches") {
        // Sewer arches.
        px(b, x, top, 10, bottom - top, colour);
        px(b, x + 14, top, 10, bottom - top, colour);
        px(b, x, top, 24, 3, colour);
      } else {
        // Castle battlements.
        px(b, x, top, 30, bottom - top, colour);
        for (let c = 0; c < 30; c += 8) px(b, x + c, top - 4, 5, 5, colour);
      }
    }
  };

  const kind =
    biomeId === "town" ? "houses" :
    biomeId === "outskirts" ? "trees" :
    biomeId === "undercity" ? "arches" : "towers";
  skyline(0.25, B.far, Math.round(vh * 0.36), kind);
  skyline(0.5, B.near, Math.round(vh * 0.52), kind);
}

function drawTerrain(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  vw: number,
  vh: number,
  biomeId: string
) {
  const map = engine.map;
  const B = BIOMES[biomeId] ?? BIOMES.keep;

  // The pit between ground segments.
  for (let i = 0; i < map.ground.length - 1; i++) {
    const a = map.ground[i];
    const c = map.ground[i + 1];
    const x0 = wx(a.x + a.w);
    const x1 = wx(c.x);
    const y0 = wy(a.y);
    px(b, x0, y0, x1 - x0, vh - y0, PAL.void);
    pxDither(b, x0, y0, x1 - x0, 10, PAL.rockDeep);
  }

  for (const g of map.ground) {
    const x = wx(g.x);
    const y = wy(g.y);
    const w = Math.round(g.w / S);
    if (x > vw || x + w < 0) continue;

    px(b, x, y, w, vh - y, PAL.rockBody);
    px(b, x, y + 5, w, vh - y - 5, PAL.rockDark);
    pxDither(b, x, y + 4, w, 6, PAL.rockBody);
    // Surface cap: grass, moss or scorched rock depending on the biome.
    px(b, x, y, w, 3, B.cap);
    px(b, x, y, w, 1, B.capLit);
    // Brick seams.
    for (let bx = x - (x % 8); bx < x + w; bx += 8) {
      px(b, bx, y + 3, 1, 7, PAL.rockDeep);
    }
    for (let by = y + 10; by < vh; by += 7) {
      px(b, x, by, w, 1, PAL.rockDeep);
    }
  }

  // One-way platforms.
  for (const p of map.platforms) {
    const x = wx(p.x);
    const y = wy(p.y);
    const w = Math.round(p.w / S);
    if (x > vw || x + w < 0) continue;
    px(b, x, y, w, 5, PAL.rockTop);
    px(b, x, y, w, 1, PAL.rockLit);
    px(b, x, y + 5, w, 1, PAL.rockDeep);
    for (let bx = x; bx < x + w; bx += 6) px(b, bx, y + 1, 1, 4, PAL.rockBody);
    // Dashed underside: the drop-through tell.
    for (let bx = x; bx < x + w; bx += 4) px(b, bx, y + 6, 2, 1, PAL.rockDark);
  }

  // Hazard stripes on the ledges either side of a pit.
  for (let i = 0; i < map.ground.length; i++) {
    const g = map.ground[i];
    const edges: number[] = [];
    if (i > 0) edges.push(g.x);
    if (i < map.ground.length - 1) edges.push(g.x + g.w);
    for (const e of edges) {
      const ex = wx(e);
      const ey = wy(g.y);
      const dir = e === g.x ? 1 : -1;
      for (let k = 0; k < 4; k++) {
        px(b, ex + dir * (k * 3) - (dir < 0 ? 2 : 0), ey - 2, 2, 2, PAL.hazard);
      }
    }
  }
}

/** The town merchant, plus a prompt when the player is close enough to trade. */
function drawMerchant(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number
) {
  const stage = (engine as ArenaEngine & {
    stage?: { isTown?: boolean; npcX?: number };
    nearMerchant?: boolean;
  }).stage;
  if (!stage?.isTown || stage.npcX === undefined) return;

  const gy = engine.groundAtX(stage.npcX);
  if (gy === null) return;
  const x = wx(stage.npcX);
  const y = wy(gy);
  const bob = Math.round(Math.sin(time * 2) * 1);

  // Stall awning behind him.
  px(b, x - 20, y - 34, 40, 3, "#7a3b2e");
  for (let i = 0; i < 40; i += 6) px(b, x - 20 + i, y - 31, 3, 3, "#b8543f");
  px(b, x - 20, y - 31, 2, 31, "#4a2b22");
  px(b, x + 18, y - 31, 2, 31, "#4a2b22");
  // Crates of wares.
  px(b, x + 8, y - 10, 10, 10, "#6b4a2a");
  px(b, x + 8, y - 10, 10, 1, "#8f6738");
  px(b, x + 10, y - 14, 6, 4, "#8f6738");

  // The merchant: hooded robe, warm lantern glow.
  px(b, x - 5, y - 22 + bob, 10, 22, "#3f5b7a");
  px(b, x - 5, y - 22 + bob, 10, 2, "#5a7ea6");
  px(b, x - 5, y - 4, 10, 4, "#2b3f56");
  px(b, x - 4, y - 30 + bob, 8, 8, "#e8c9a0");
  px(b, x - 5, y - 31 + bob, 10, 4, "#7a4a2e");
  px(b, x - 2, y - 26 + bob, 1, 1, PAL.ink);
  px(b, x + 1, y - 26 + bob, 1, 1, PAL.ink);
  px(b, x - 5, y - 20 + bob, 10, 1, "#c9a24a");
  pxGlow(b, x + 12, y - 18, 7, "#f6b352", 0.6);

  const near = (engine as ArenaEngine & { nearMerchant?: boolean }).nearMerchant;
  if (near) {
    const pulse = Math.sin(time * 6) > 0 ? "#ffffff" : "#f6b352";
    pxText(b, "PRESS E", x, y - 40 + bob, pulse, 5);
  }
}

// ------------------------------------------------------------------ fighters

interface Pal {
  primary: string;
  shade: string;
  secondary: string;
  trim: string;
  skin: string;
  skinShade: string;
  hair: string;
  aura: string;
  outline: string;
}

function paletteFor(f: Fighter): Pal {
  if (f.isMob) {
    const m = MOB_TYPES[f.mobTypeId!];
    return {
      primary: m.color,
      shade: m.accent,
      secondary: m.accent,
      trim: m.accent,
      skin: m.color,
      skinShade: m.accent,
      hair: m.accent,
      aura: m.color,
      outline: PAL.ink,
    };
  }
  const c = getClass(f.classId).colors;
  return {
    primary: c.primary,
    shade: shade(c.primary),
    secondary: c.secondary,
    trim: c.trim,
    skin: c.skin,
    skinShade: shade(c.skin),
    hair: c.hair,
    aura: c.aura,
    outline: PAL.ink,
  };
}

/** Darkens a hex colour for the shaded side of a sprite. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.62);
  const g = Math.round(((n >> 8) & 255) * 0.62);
  const b = Math.round((n & 255) * 0.62);
  return `rgb(${r},${g},${b})`;
}

/** Palette lifted from shaedim.webp: black plate, gold filigree, cyan orb. */
const SKIT = {
  plate: "#26252f",
  plateLit: "#3b3a47",
  plateDark: "#15151c",
  gold: "#c9a24a",
  goldDark: "#7d6224",
  visor: "#0a0a10",
  glow: "#3fe0e8",
  glowLit: "#ccfbff",
  glowDark: "#1a7f8c",
  haft: "#1b1a22",
};

/** Palette lifted from paragon.webp. */
const KIT = {
  skin: "#d49b7c",
  skinShade: "#a85f50",
  skinDeep: "#7d4438",
  hair: "#2a1f1c",
  hairLit: "#3f2e26",
  mask: "#22202c",
  maskLit: "#34313f",
  pants: "#14131c",
  pantsLit: "#3c3947",
  boot: "#191826",
  gold: "#e0b04a",
  goldDark: "#8d6a2c",
  crimson: "#9c2038",
  crimsonDark: "#5c1526",
  crimsonLit: "#c8405a",
  ice: "#95d9e4",
  iceLit: "#dcf5fb",
  iceDark: "#4a7f95",
};

function drawFighter(
  b: CanvasRenderingContext2D,
  f: Fighter,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number
) {
  if (f.state === "dead" && f.isMob) return;

  const p = paletteFor(f);
  const x = wx(f.x);
  const y = wy(f.y); // feet
  const h = Math.max(12, Math.round(f.h / S));
  const w = Math.max(6, Math.round(f.w / S));
  const dir = f.facing;
  // Paragon wears the kit from the reference art rather than a plain gi.
  const hero = !f.isMob && f.classId === "paragon";
  const knight = !f.isMob && f.classId === "shedim";

  // Ground shadow.
  const sw = Math.round(w * 0.9);
  px(b, x - sw / 2, y - 1, sw, 2, "rgba(0,0,0,0.45)");

  // Immunity halo.
  if (f.knockdownTimer > 0 || f.getupImmunity > 0 || f.dashImmunity > 0 || f.respawnInvuln > 0) {
    pxGlow(b, x, y - h * 0.55, h * 0.75, "#7dd3fc", 0.5);
  }
  // Stoic: a hard red rim and glow, so the state is unmistakable.
  if (f.stoicTimer > 0) {
    pxGlow(b, x, y - h * 0.55, h * 0.7, "#ff3b30", 0.85);
    const r = Math.round(h * 0.5);
    ringOutline(b, x, y - h * 0.55, r, "#ff3b30");
    ringOutline(b, x, y - h * 0.55, r - 2, "#ff8a72");
  }
  if (f.state === "reflect") {
    const r = Math.round(h * 0.6 + Math.sin(time * 12) * 1.5);
    ringOutline(b, x, y - h * 0.55, r, "#fbbf24");
  }

  const flash = f.hitFlash > 0 && Math.floor(time * 30) % 2 === 0;
  const col = (c: string) => (flash ? "#ffffff" : c);

  if (f.state === "knockdown") {
    drawDowned(b, x, y, w, h, p, col);
    drawNameplate(b, f, x, y - h - 6);
    return;
  }

  const moving = f.state === "walk" || f.state === "sprint";
  const cadence = f.state === "sprint" ? 14 : 9;
  const step = moving ? Math.floor(time * cadence) % 4 : 0;
  const bob = moving && (step === 1 || step === 3) ? 1 : 0;
  const airborne = f.state === "air";

  // --- proportions, in art pixels ---------------------------------------
  const headH = Math.max(5, Math.round(h * 0.27));
  const legH = Math.max(4, Math.round(h * 0.3));
  const torsoH = h - headH - legH;
  const torsoW = Math.max(5, w - 2);
  const topY = y - h + bob;
  const torsoY = topY + headH;
  const legY = y - legH;
  const half = Math.floor(torsoW / 2);
  const ink = p.outline;
  const back = -dir; // the trailing side of the sprite

  // --- rear-hand ice crystal (behind everything) --------------------------
  if (hero) {
    const ix = x + back * (half + 2);
    const iyTop = torsoY + Math.round(torsoH * 0.55);
    const iceH = Math.round(h * 0.34);
    px(b, ix - 1, iyTop, 4, iceH, col(KIT.ice));
    px(b, ix - 2, iyTop + 2, 1, iceH - 5, col(KIT.iceDark));
    px(b, ix + 3, iyTop + 1, 1, iceH - 3, col(KIT.iceDark));
    px(b, ix, iyTop + 1, 1, iceH - 4, col(KIT.iceLit));
    // Jagged tip and shards.
    px(b, ix - 1, iyTop - 2, 1, 2, col(KIT.ice));
    px(b, ix + 2, iyTop - 3, 1, 3, col(KIT.ice));
    px(b, ix - 1, iyTop + iceH, 3, 1, col(KIT.iceDark));
  }

  // --- rear shoulder pauldron ---------------------------------------------
  if (hero) {
    const sx2 = x + back * (half + 1);
    const sy2 = torsoY - 2;
    px(b, back === 1 ? sx2 - 1 : sx2 - 4, sy2, 5, 8, col(KIT.mask));
    px(b, back === 1 ? sx2 + 3 : sx2 - 4, sy2 + 1, 1, 6, col(KIT.maskLit));
    // Spikes along the top edge.
    px(b, back === 1 ? sx2 : sx2 - 3, sy2 - 2, 1, 2, col(KIT.mask));
    px(b, back === 1 ? sx2 + 2 : sx2 - 1, sy2 - 3, 1, 3, col(KIT.mask));
    // Gold sunburst emblem.
    const gx = back === 1 ? sx2 + 1 : sx2 - 2;
    px(b, gx, sy2 + 3, 2, 2, col(KIT.gold));
    px(b, gx - 1, sy2 + 4, 1, 1, col(KIT.goldDark));
    px(b, gx + 2, sy2 + 4, 1, 1, col(KIT.goldDark));
    px(b, gx, sy2 + 2, 1, 1, col(KIT.goldDark));
    px(b, gx, sy2 + 6, 1, 1, col(KIT.goldDark));
    px(b, back === 1 ? sx2 - 1 : sx2 - 4, sy2 + 8, 5, 1, col(KIT.gold));
  }

  // --- legs ---------------------------------------------------------------
  const swing = airborne ? 2 : step === 1 ? 2 : step === 3 ? -2 : 0;
  const legW = Math.max(2, Math.round(torsoW * 0.36));
  const frontLegX = x - half + Math.round(swing * 0.5);
  const backLegX = x + half - legW - Math.round(swing * 0.5);
  const legCol = hero ? KIT.pants : knight ? SKIT.plate : p.primary;
  const legShade = hero ? KIT.pants : knight ? SKIT.plateDark : p.shade;
  for (const [lx, tone] of [
    [backLegX, legShade],
    [frontLegX, legCol],
  ] as const) {
    px(b, lx, legY, legW, legH - 2, col(tone));
    if (hero) {
      // Armour plate highlight down the shin.
      px(b, lx + (dir === 1 ? legW - 1 : 0), legY + 2, 1, legH - 5, col(KIT.pantsLit));
    } else if (knight) {
      // Knee cop and a gold filigree line down the greave.
      px(b, lx, legY + 1, legW, 2, col(SKIT.plateLit));
      px(b, lx + (dir === 1 ? legW - 1 : 0), legY + 3, 1, legH - 6, col(SKIT.gold));
    }
    // Boot, with a small gold ankle ornament rather than a full-width band.
    px(b, lx - 1, y - 3, legW + 2, 3, col(hero ? KIT.boot : knight ? SKIT.plateDark : p.secondary));
    if (hero) {
      px(b, lx + (dir === 1 ? legW - 2 : 0), y - 4, 2, 2, col(KIT.gold));
      px(b, lx + (dir === 1 ? legW - 2 : 0), y - 3, 2, 1, col(KIT.goldDark));
    } else if (knight) {
      px(b, lx - 1, y - 4, legW + 2, 1, col(SKIT.gold));
    } else {
      px(b, lx - 1, y - 4, legW + 2, 1, col(p.trim));
    }
    px(b, lx - 1, y - 1, legW + 2, 1, ink);
  }

  // --- torso --------------------------------------------------------------
  if (hero) {
    // Bare, muscled chest.
    px(b, x - half, torsoY, torsoW, torsoH, col(KIT.skin));
    px(b, dir === 1 ? x - half : x + half - 3, torsoY, 3, torsoH, col(KIT.skinShade));
    // Pectoral split and two ab lines.
    px(b, x - half + 1, torsoY + 4, torsoW - 2, 1, col(KIT.skinShade));
    px(b, x, torsoY + 5, 1, 4, col(KIT.skinShade));
    px(b, x - half + 2, torsoY + 8, torsoW - 4, 1, col(KIT.skinShade));
    // Black collar / neck guard over the shoulders.
    px(b, x - half - 1, torsoY - 1, torsoW + 2, 3, col(KIT.mask));
    px(b, x - half - 1, torsoY - 1, torsoW + 2, 1, col(KIT.maskLit));
    // Gold chain hanging from the collar on the leading side.
    px(b, x + dir, torsoY + 2, 3, 1, col(KIT.gold));
    px(b, x + dir * 3, torsoY + 3, 1, 1, col(KIT.goldDark));
    // Belted waist.
    px(b, x - half, torsoY + torsoH - 4, torsoW, 4, col(KIT.pants));
    px(b, x - half, torsoY + torsoH - 4, torsoW, 1, col(KIT.pantsLit));
    px(b, x - 1, torsoY + torsoH - 3, 2, 2, col(KIT.gold));
  } else if (knight) {
    // Segmented cuirass.
    px(b, x - half, torsoY, torsoW, torsoH, col(SKIT.plate));
    px(b, dir === 1 ? x - half : x + half - 3, torsoY, 3, torsoH, col(SKIT.plateDark));
    px(b, x - half, torsoY, torsoW, 2, col(SKIT.plateLit));
    // Gold filigree: a V down the chest and a waist band.
    px(b, x - 1, torsoY + 2, 2, Math.round(torsoH * 0.45), col(SKIT.gold));
    px(b, x - half + 1, torsoY + 3, 2, 1, col(SKIT.gold));
    px(b, x + half - 2, torsoY + 3, 2, 1, col(SKIT.gold));
    px(b, x - half, torsoY + torsoH - 4, torsoW, 1, col(SKIT.gold));
    px(b, x - half, torsoY + torsoH - 3, torsoW, 3, col(SKIT.plateDark));
    // Pauldrons on both shoulders.
    px(b, x - half - 2, torsoY - 1, 4, 4, col(SKIT.plateLit));
    px(b, x + half - 1, torsoY - 1, 4, 4, col(SKIT.plateLit));
    px(b, x - half - 2, torsoY + 3, 4, 1, col(SKIT.gold));
    px(b, x + half - 1, torsoY + 3, 4, 1, col(SKIT.gold));
  } else {
    px(b, x - half, torsoY, torsoW, torsoH, col(p.primary));
    const shadeW = Math.max(1, Math.round(torsoW * 0.34));
    px(b, dir === 1 ? x - half : x + half - shadeW, torsoY, shadeW, torsoH, col(p.shade));
    if (!f.isMob) {
      px(b, x - 1, torsoY, 2, Math.max(2, Math.round(torsoH * 0.45)), col(p.secondary));
      px(b, x - half, torsoY, torsoW, 1, col(p.secondary));
    }
    const beltY = torsoY + torsoH - 3;
    px(b, x - half, beltY, torsoW, 3, col(f.isMob ? p.trim : p.secondary));
    px(b, x + dir * (half - 2), beltY, 2, 4, col(f.isMob ? p.trim : p.secondary));
  }
  // Side outline columns.
  px(b, x - half - 1, torsoY, 1, torsoH, ink);
  px(b, x + half, torsoY, 1, torsoH, ink);

  // --- arms ---------------------------------------------------------------
  const reach = armReach(f);
  const armY = torsoY + Math.round(torsoH * 0.2);
  const armLen = half + 2 + reach;
  // Rear arm sliver.
  px(
    b,
    x - dir * (half - 1),
    armY + 1,
    2,
    Math.max(3, Math.round(torsoH * 0.55)),
    col(hero ? KIT.skinShade : p.shade)
  );
  const armX = dir === 1 ? x : x - armLen;
  const handX = x + dir * armLen;

  if (hero) {
    // Crimson demon gauntlet: the arm he punches with.
    px(b, armX, armY, armLen, 4, col(KIT.crimson));
    px(b, armX, armY, armLen, 1, col(KIT.crimsonLit));
    px(b, armX, armY + 4, armLen, 1, ink);
    px(b, dir === 1 ? handX - 4 : handX + 1, armY - 1, 4, 6, col(KIT.crimsonDark));
    px(b, dir === 1 ? handX - 3 : handX + 1, armY, 2, 2, col(KIT.crimsonLit));
    // Claws.
    px(b, dir === 1 ? handX : handX - 2, armY, 2, 1, col(KIT.crimsonDark));
    px(b, dir === 1 ? handX : handX - 2, armY + 3, 2, 1, col(KIT.crimsonDark));
  } else {
    px(b, armX, armY, armLen, 3, col(knight ? SKIT.plate : p.primary));
    if (knight) px(b, armX, armY, armLen, 1, col(SKIT.plateLit));
    px(b, armX, armY + 3, armLen, 1, ink);
    px(b, dir === 1 ? handX - 3 : handX, armY, 3, 3,
       col(knight ? SKIT.plateDark : p.skin));
    if (knight) drawScythe(b, f, x, handX, armY, h, dir, col);
    else if (!f.isMob && f.classId === "kacper") {
      // Greatsword: a broad blade, held low at rest and swept flat on contact.
      const len = Math.round(h * 0.85);
      const swinging = f.state === "attack" || f.state === "charge" || f.state === "whirlwind";
      if (swinging) {
        const bx = dir === 1 ? handX : handX - len;
        px(b, bx, armY - 1, len, 4, col("#c8d2e6"));
        px(b, bx, armY - 1, len, 1, col("#f2f6ff"));
        px(b, bx, armY + 3, len, 1, PAL.ink);
      } else {
        for (let i = 0; i < len; i++) {
          px(b, handX + dir * Math.round(i * 0.3), armY + 2 - i, 4, 1,
             col(i % 7 === 0 ? "#f2f6ff" : "#c8d2e6"));
        }
      }
      px(b, dir === 1 ? handX - 1 : handX, armY - 2, 3, 7, col("#8a6a34"));
    }
  }

  // --- head ---------------------------------------------------------------
  const headW = Math.max(5, Math.round(w * 0.72));
  const headX = x - Math.floor(headW / 2) + dir;
  const hairH = Math.max(2, Math.round(headH * 0.4));
  if (!knight) {
    px(b, headX, topY, headW, headH, col(hero ? KIT.skin : p.skin));
    px(b, dir === 1 ? headX : headX + headW - 1, topY + 1, 1, headH - 1,
       col(hero ? KIT.skinShade : p.skinShade));
    // Hair.
    px(b, headX, topY, headW, hairH, col(hero ? KIT.hair : p.hair));
    px(b, headX + (dir === 1 ? 1 : 0), topY, headW - 1, 1, col(hero ? KIT.hairLit : p.hair));
    for (let i = 0; i < headW; i += 2) {
      px(b, headX + i, topY - 2, 1, 2, col(hero ? KIT.hair : p.hair));
    }
    px(b, dir === 1 ? headX : headX + headW - 1, topY, 1, hairH + 2, col(hero ? KIT.hair : p.hair));
  }

  if (hero) {
    // Black face mask over the nose and mouth.
    px(b, headX, topY + hairH + 2, headW, headH - hairH - 2, col(KIT.mask));
    px(b, headX, topY + hairH + 2, headW, 1, col(KIT.maskLit));
    // Eye above the mask line.
    px(b, x + dir, topY + hairH, 2, 2, "#f2f6ff");
    px(b, x + dir + (dir === 1 ? 1 : 0), topY + hairH, 1, 2, PAL.ink);
    px(b, x + dir - (dir === 1 ? 0 : 1), topY + hairH - 1, 3, 1, col(KIT.hair));
  } else if (knight) {
    // Closed great helm: no face, just a lit visor slit.
    px(b, headX - 1, topY, headW + 2, headH, col(SKIT.plate));
    px(b, headX - 1, topY, headW + 2, 2, col(SKIT.plateLit));
    px(b, dir === 1 ? headX + headW - 2 : headX - 1, topY + 2, 3, headH - 3, col(SKIT.plateDark));
    // Visor slit, faintly lit from within.
    px(b, headX + (dir === 1 ? 1 : 0), topY + Math.round(headH * 0.45), headW, 2, SKIT.visor);
    px(b, x + dir * 2, topY + Math.round(headH * 0.45), 2, 1, col(SKIT.glow));
    // Gold crest down the crown.
    px(b, x + dir, topY - 2, 1, 3, col(SKIT.gold));
    px(b, headX + (dir === 1 ? 1 : 0), topY + headH - 1, headW, 1, col(SKIT.gold));
  } else {
    const eyeX = x + dir * Math.max(1, Math.round(headW * 0.22));
    px(b, eyeX, topY + hairH + 1, 2, 2, "#f2f6ff");
    px(b, eyeX + (dir === 1 ? 1 : 0), topY + hairH + 1, 1, 2, PAL.ink);
    px(b, eyeX - (dir === 1 ? 0 : 1), topY + hairH, 3, 1, col(p.hair));
  }
  px(b, headX - 1, topY, 1, headH, ink);
  px(b, headX + headW, topY, 1, headH, ink);
  px(b, headX, topY + headH, headW, 1, ink);

  if (f.isMob) drawMobFlourish(b, f, x, y, w, h, topY, torsoY, torsoH, dir, col);

  drawNameplate(b, f, x, topY - 3);
}

/**
 * Per-species detail layered over the shared body, so a Husk, a Wraith and a
 * Colossus read as different creatures at a glance.
 */
function drawMobFlourish(
  b: CanvasRenderingContext2D,
  f: Fighter,
  x: number,
  y: number,
  w: number,
  h: number,
  topY: number,
  torsoY: number,
  torsoH: number,
  dir: number,
  col: (c: string) => string
) {
  const m = MOB_TYPES[f.mobTypeId!];
  if (!m) return;
  const half = Math.floor(Math.max(5, w - 2) / 2);

  switch (m.id) {
    case "husk": {
      // Hunched, ragged, with sunken glowing eyes.
      px(b, x - half - 1, torsoY + 1, torsoW2(w), 1, col(m.accent));
      px(b, x + dir * 2, topY + 3, 1, 1, "#9ae86f");
      px(b, x + dir * 4, topY + 3, 1, 1, "#9ae86f");
      // Torn cloth hanging off the waist.
      for (let i = 0; i < 3; i++) {
        px(b, x - half + i * 3, torsoY + torsoH, 2, 2 + (i % 2), col(m.accent));
      }
      break;
    }
    case "brawler": {
      // Broad shoulders and bandaged fists.
      px(b, x - half - 2, torsoY, 3, 4, col(m.color));
      px(b, x + half - 1, torsoY, 3, 4, col(m.color));
      px(b, x - half - 2, torsoY, 3, 1, "#e8c9a0");
      px(b, x + half - 1, torsoY, 3, 1, "#e8c9a0");
      // Head wrap.
      px(b, x - half + 1, topY + 1, w - 2, 2, "#e8c9a0");
      break;
    }
    case "blade-wraith": {
      // Hovering cloak with a hood and a violet blade.
      pxGlow(b, x, y - h * 0.5, h * 0.5, "#8b5cf6", 0.5);
      for (let i = 0; i < 4; i++) {
        px(b, x - half + i * 3, y - 2 + i % 2, 2, 3, col(m.accent));
      }
      px(b, x + dir * 2, topY + 3, 2, 1, "#e9d5ff");
      const bl = Math.round(h * 0.5);
      for (let i = 0; i < bl; i++) {
        px(b, x + dir * (half + 2 + Math.round(i * 0.25)), torsoY + 2 - i, 1, 1, "#c4b5fd");
      }
      break;
    }
    case "colossus": {
      // Stone slabs, cracks and a glowing core.
      px(b, x - half - 2, torsoY - 1, 4, 6, col(m.accent));
      px(b, x + half - 2, torsoY - 1, 4, 6, col(m.accent));
      px(b, x - 1, torsoY + Math.round(torsoH * 0.4), 3, 3, "#f97316");
      pxGlow(b, x, torsoY + Math.round(torsoH * 0.4) + 1, 4, "#f97316", 0.7);
      for (let i = 0; i < 3; i++) {
        px(b, x - half + 2 + i * 3, torsoY + 2 + i * 3, 1, 2, col(m.accent));
      }
      break;
    }
    case "warden": {
      // Crowned boss with a burning aura and a heavy pauldron.
      pxGlow(b, x, y - h * 0.55, h * 0.8, "#ef4444", 0.55);
      px(b, x - half - 3, torsoY - 2, 5, 7, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 7, col(m.accent));
      for (let i = 0; i < 5; i += 2) {
        px(b, x - half + i * 2, topY - 4, 1, 3, "#fbbf24");
      }
      px(b, x - half, topY + 3, w, 1, "#fbbf24");
      px(b, x + dir * 2, topY + 4, 2, 1, "#fde047");
      break;
    }
  }
}

function torsoW2(w: number) {
  return Math.max(5, w - 2);
}

/** Shedim's scythe: a long haft, a jagged blade and a glowing cyan orb. */
function drawScythe(
  b: CanvasRenderingContext2D,
  f: Fighter,
  x: number,
  handX: number,
  armY: number,
  h: number,
  dir: number,
  col: (c: string) => string
) {
  const swinging = f.state === "attack";
  const haft = Math.round(h * 0.95);

  if (swinging) {
    // Swung flat: haft forward, blade sweeping ahead of the hand.
    const hx = dir === 1 ? handX - 2 : handX + 2;
    px(b, dir === 1 ? hx : hx - haft, armY + 1, haft, 2, col(SKIT.haft));
    const tip = hx + dir * haft;
    for (let i = 0; i < 7; i++) {
      px(b, tip - dir * i, armY - 3 - i, 2, 2, col(SKIT.plateDark));
    }
    pxGlow(b, tip - dir * 3, armY - 4, 5, SKIT.glow, 0.9);
    pxCircle(b, tip - dir * 3, armY - 4, 2, col(SKIT.glowLit));
  } else {
    // Rested: shaft angled up behind the shoulder, blade hanging low.
    for (let i = 0; i < haft; i++) {
      px(b, handX + dir * Math.round(i * 0.42), armY + 2 - i, 2, 1, col(SKIT.haft));
    }
    const bx = handX - dir * 6;
    const by = armY + 6;
    // Crescent blade.
    for (let i = 0; i < 8; i++) {
      const curve = Math.round(Math.sin((i / 7) * Math.PI) * 4);
      px(b, bx - dir * curve, by + i, 3, 1, col(SKIT.plateDark));
    }
    px(b, bx - dir * 2, by + 2, 1, 5, col(SKIT.plate));
    // The orb set into the blade.
    pxGlow(b, bx - dir * 3, by + 4, 5, SKIT.glow, 0.85);
    pxCircle(b, bx - dir * 3, by + 4, 2, col(SKIT.glowLit));
    px(b, bx - dir * 6, by + 1, 1, 1, col(SKIT.glow));
    px(b, bx - dir * 5, by + 8, 1, 1, col(SKIT.glow));
  }
}

/** How far the lead hand extends, driven by the current action's frames. */
function armReach(f: Fighter): number {
  if (f.state === "attack" && f.action) {
    const t = f.action.elapsed / f.action.spec.castTime;
    if (t < 0.35) return -1;
    if (t < 0.65) return 6;
    return 3;
  }
  if (f.state === "reflect") return 0;
  if (f.state === "dash") return -2;
  if (f.state === "hitstun" || f.state === "stunned") return -1;
  return 1;
}

function drawDowned(
  b: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Pal,
  col: (c: string) => string
) {
  // Lying flat: the sprite rotated into a wide, short silhouette.
  const bodyW = Math.round(h * 0.8);
  const bodyH = Math.max(3, Math.round(w * 0.6));
  px(b, x - bodyW / 2, y - bodyH, bodyW, bodyH, col(p.primary));
  px(b, x - bodyW / 2, y - bodyH, bodyW, 1, col(p.shade));
  px(b, x + bodyW / 2 - 4, y - bodyH - 2, 4, 3, col(p.skin));
  px(b, x - bodyW / 2 - 1, y - bodyH, 1, bodyH, p.outline);
  px(b, x + bodyW / 2, y - bodyH, 1, bodyH, p.outline);
}

function ringOutline(
  b: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
) {
  b.fillStyle = color;
  for (let a = 0; a < 360; a += 12) {
    const rad = (a * Math.PI) / 180;
    b.fillRect(Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r), 1, 1);
  }
}

function drawNameplate(
  b: CanvasRenderingContext2D,
  f: Fighter,
  x: number,
  y: number
) {
  if (f.isMob) {
    const w = MOB_TYPES[f.mobTypeId!]?.isBoss ? 26 : 14;
    const pct = Math.max(0, f.hp / f.maxHp);
    px(b, x - w / 2 - 1, y - 3, w + 2, 4, PAL.ink);
    px(b, x - w / 2, y - 2, Math.round(w * pct), 2, pct > 0.4 ? "#7ec850" : "#d94f4f");
    pxText(b, `${f.name} ${f.level}`, x, y - 5, "#c9d4e8", 5);
    return;
  }
  // Players sit higher so their label never collides with a mob's.
  if (showPlayerName) {
    pxText(b, f.name, x, y - 9, f.isPlayer ? "#7ee7b7" : "#f6a5a5", 5);
  }

  let status = "";
  let colour = "#9aa5bb";
  if (f.getupImmunity > 0) { status = "IMMUNE"; colour = "#7dd3fc"; }
  else if (f.dashImmunity > 0) { status = "IMMUNE"; colour = "#c4b5fd"; }
  else if (f.stunTimer > 0) { status = "STUN"; colour = "#facc15"; }
  else if (f.hitstun > 0) { status = "HIT"; colour = "#f87171"; }
  else if (f.state === "reflect") { status = "REFLECT"; colour = "#fbbf24"; }
  else if (f.state === "sprint") { status = "SPRINT"; colour = "#7ee7b7"; }
  if (status) pxText(b, status, x, y - 16, colour, 5);
}

// ------------------------------------------------------------------------ fx

function drawHitboxes(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number
) {
  for (const hb of engine.hitboxes) {
    const x = wx(hb.x);
    const y = wy(hb.y);
    const w = Math.round(hb.w / S);
    const h = Math.round(hb.h / S);
    const colour =
      hb.kind === "skill" ? "#ffe38a" : hb.kind === "rmb" ? "#f79ad3" : "#9fdcff";
    const trail =
      hb.kind === "skill" ? "#b9821f" : hb.kind === "rmb" ? "#a8508a" : "#4b8fc4";

    // A crescent: the leading edge bows outward at the middle of the swing,
    // with a short tail behind it, which reads as an arc in few pixels.
    const rows = Math.max(3, h);
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1) - 0.5; // -0.5 .. 0.5
      const bulge = Math.round((1 - t * t * 4) * w * 0.45);
      if (bulge <= 0) continue;
      const lead = hb.facing === 1 ? x + w - bulge : x + bulge - 2;
      px(b, lead, y + i, 2, 1, "#ffffff");
      const tailX = hb.facing === 1 ? lead - 4 : lead + 2;
      px(b, tailX, y + i, 4, 1, colour);
      const tail2 = hb.facing === 1 ? tailX - 4 : tailX + 4;
      px(b, tail2, y + i, 4, 1, trail);
    }
  }
}

function drawProjectile(
  b: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string
) {
  pxGlow(b, x, y, r * 2, color, 0.7);
  pxCircle(b, x, y, Math.max(1, r * 0.6), color);
  pxCircle(b, x, y, Math.max(1, r * 0.3), "#ffffff");
}

function drawBlackHole(
  b: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  k: number,
  time: number
) {
  const rr = Math.max(3, r * (0.5 + 0.5 * Math.sin(k * Math.PI)));
  pxGlow(b, x, y, rr, "#7c3aed", 0.8);
  pxCircle(b, x, y, rr * 0.45, "#150a2b");
  pxCircle(b, x, y, rr * 0.25, PAL.ink);
  b.fillStyle = "#c4b5fd";
  for (let i = 0; i < 8; i++) {
    const a = time * 3 + (i / 8) * Math.PI * 2;
    b.fillRect(
      Math.round(x + Math.cos(a) * rr * 0.7),
      Math.round(y + Math.sin(a) * rr * 0.35),
      1,
      1
    );
  }
}

function drawParticles(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number
) {
  for (const p of engine.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (a < 0.15) continue;
    const size = Math.max(1, Math.round((p.size / S) * a));
    px(b, wx(p.x), wy(p.y), size, size, p.color);
  }
}

function drawTexts(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number
) {
  for (const t of engine.texts) {
    const a = Math.min(1, t.life / (t.maxLife * 0.5));
    if (a <= 0.1) continue;
    b.globalAlpha = a;
    pxText(b, t.text, wx(t.x), wy(t.y), t.color, Math.max(5, Math.round(t.size / 2)));
    b.globalAlpha = 1;
  }
}

function drawVignette(b: CanvasRenderingContext2D, vw: number, vh: number) {
  // A narrow dithered rim, kept subtle so it frames rather than textures.
  const edge = 5;
  b.globalAlpha = 0.35;
  pxDither(b, 0, 0, vw, edge, PAL.ink);
  pxDither(b, 0, vh - edge, vw, edge, PAL.ink);
  pxDither(b, 0, 0, edge, vh, PAL.ink);
  pxDither(b, vw - edge, 0, edge, vh, PAL.ink);
  b.globalAlpha = 1;
}
