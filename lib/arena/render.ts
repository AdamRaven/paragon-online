import { getClass } from "./classes";
import type { ArenaEngine } from "./engine";
import { MOB_TYPES } from "./mobs";
import {
  WORLD_PER_PIXEL as S,
  px,
  pxCircle,
  pxDither,
  pxGlow,
  pxOutline,
  pxText,
} from "./pixel";
import { playSound } from "./sound";
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

/**
 * Impact juice: a brief camera punch-in plus a white screen flash, fired
 * whenever `engine.shake` jumps (a fresh big hit) rather than every frame it
 * stays elevated while decaying. Kept as render-local state so the combat
 * engine itself never has to know the presentation reacts to it.
 */
let prevTime = 0;
let prevShake = 0;
let punchTimer = 0;
let punchMag = 0;
let flashTimer = 0;
let flashMag = 0;
const PUNCH_DURATION = 0.14;
const FLASH_DURATION = 0.1;

/**
 * World camera converted to art-pixel space, including screen shake. Shake
 * is derived from `engine.time` rather than `Math.random()` so the main
 * low-res canvas and the crisp portrait overlay (drawn in a separate pass,
 * possibly against a different canvas) land on exactly the same offset
 * every frame instead of jittering independently of each other.
 */
function cameraArt(engine: ArenaEngine) {
  const t = engine.time * 43;
  const shakeX = Math.sin(t) * engine.shake * 0.5;
  const shakeY = Math.cos(t * 1.3) * engine.shake * 0.5;
  return {
    camX: Math.round((engine.camera.x + shakeX) / S),
    camY: Math.round((engine.camera.y + shakeY) / S),
  };
}

/** Previous per-fighter state, so dash/reflect play once on entry rather than every frame. */
const prevFighterState = new Map<string, string>();

function trackStateSounds(engine: ArenaEngine) {
  const seen = new Set<string>();
  for (const f of engine.fighters) {
    seen.add(f.id);
    const prev = prevFighterState.get(f.id);
    if (f.state !== prev) {
      if (f.state === "dash" || f.state === "sprint") playSound("dash");
      else if (f.state === "reflect") playSound("block");
      prevFighterState.set(f.id, f.state);
    }
  }
  // Mobs despawn/respawn with new ids over time; drop anything no longer present.
  for (const id of prevFighterState.keys()) {
    if (!seen.has(id)) prevFighterState.delete(id);
  }
}

// -------------------------------------------------------------- portraits

/**
 * Paragon and Shedim have hand-painted reference portraits; Kacper and all
 * mobs don't, so they stay on the procedural pixel-art renderer below.
 */
const PORTRAIT_SRC: Partial<Record<string, string>> = {
  paragon: "/art/paragon.webp",
  shedim: "/art/shaedim.webp",
};
const portraitCache = new Map<string, HTMLImageElement>();

function getPortraitImage(classId: string): HTMLImageElement | null {
  const src = PORTRAIT_SRC[classId];
  if (!src) return null;
  let img = portraitCache.get(classId);
  if (!img) {
    if (typeof Image === "undefined") return null;
    img = new Image();
    img.src = src;
    portraitCache.set(classId, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Paragon's walk cycle: 6 frames cut from a single sheet (background removed
 * offline — the source had a baked-in checkerboard, not real alpha). Rects
 * were measured from that cleaned sheet; each frame keeps its own natural
 * width so the stride still narrows/widens like a real walk cycle instead of
 * being stretched into a uniform box.
 */
const WALK_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 22, y: 380, w: 171, h: 268 },
  { x: 193, y: 380, w: 170, h: 268 },
  { x: 378, y: 380, w: 132, h: 268 },
  { x: 518, y: 380, w: 163, h: 268 },
  { x: 681, y: 380, w: 163, h: 268 },
  { x: 844, y: 380, w: 161, h: 268 },
];
let walkSprite: HTMLImageElement | null = null;

function getWalkSprite(): HTMLImageElement | null {
  if (!walkSprite) {
    if (typeof Image === "undefined") return null;
    walkSprite = new Image();
    walkSprite.src = "/art/paragon-walk-sprite.png";
  }
  return walkSprite.complete && walkSprite.naturalWidth > 0 ? walkSprite : null;
}

let villageBg: HTMLImageElement | null = null;

/** Emberhold's hand-painted town backdrop, loaded once and cached. */
function getVillageBackground(): HTMLImageElement | null {
  if (!villageBg) {
    if (typeof Image === "undefined") return null;
    villageBg = new Image();
    villageBg.src = "/art/village-background.jpeg";
  }
  return villageBg.complete && villageBg.naturalWidth > 0 ? villageBg : null;
}

/**
 * Draws the actual reference art for Paragon/Shedim fighters on a separate,
 * non-pixelated overlay canvas sized to real screen resolution. The main
 * game buffer is deliberately tiny (a fighter is ~31 art pixels tall) so its
 * nearest-neighbour upscale stays chunky; that same tininess would turn a
 * 500px detailed portrait into an unrecognisable smear. Keeping the world at
 * its native chunky resolution while compositing crisp, smoothly-scaled
 * character art on top is the only way to get both at once.
 */
export function renderFighterPortraits(
  fxCtx: CanvasRenderingContext2D,
  engine: ArenaEngine,
  physicalPerArtPixel: number
) {
  const fx = fxCtx;
  fx.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
  const { camX, camY } = cameraArt(engine);
  const px2 = (v: number) => (Math.round(v / S) - camX) * physicalPerArtPixel;
  const py2 = (v: number) => (Math.round(v / S) - camY) * physicalPerArtPixel;

  for (const f of engine.fighters) {
    if (f.isMob || f.state === "dead") continue;

    // Paragon has a real walk cycle; everyone else (and Paragon when not
    // moving) falls back to the static reference portrait.
    const moving = f.state === "walk" || f.state === "sprint";
    const walkSpriteImg = f.classId === "paragon" && moving ? getWalkSprite() : null;
    const img = walkSpriteImg ?? getPortraitImage(f.classId);
    if (!img) continue;

    const x = px2(f.x);
    const yFeet = py2(f.y);
    const hArt = Math.max(12, f.h / S);

    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    // The reference art carries headroom/legroom the crude hitbox doesn't,
    // so it's drawn a little taller than the box it stands in rather than
    // exactly filling it — matching height 1:1 made both portraits read as
    // squashed. The walk-cycle frames are already cropped tight to the
    // figure (no headroom baked in — the character fills essentially 100%
    // of the frame, versus ~74% of the static portrait's canvas), so the
    // same multiplier would render the character visibly taller/longer-
    // limbed the instant he starts moving. Scaled down by that measured
    // 74% fill ratio so both assets put the same actual character height
    // on screen.
    let drawH = hArt * physicalPerArtPixel * 1.28;
    if (walkSpriteImg) {
      const cadence = f.state === "sprint" ? 14 : 9;
      const step = Math.floor(engine.time * cadence) % WALK_FRAMES.length;
      const frame = WALK_FRAMES[step];
      sx = frame.x;
      sy = frame.y;
      sw = frame.w;
      sh = frame.h;
      drawH = hArt * physicalPerArtPixel * 1.28 * 0.736;
    }
    const drawW = drawH * (sw / sh);

    const knockdown = f.state === "knockdown";
    const flash = f.hitFlash > 0 && Math.floor(engine.time * 30) % 2 === 0;

    fx.save();
    fx.translate(x, yFeet);
    if (knockdown) fx.rotate((f.facing === 1 ? 1 : -1) * (Math.PI / 2.1));
    if (f.facing === -1) fx.scale(-1, 1);
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = "high";
    fx.drawImage(img, sx, sy, sw, sh, -drawW / 2, -drawH, drawW, drawH);
    if (flash) {
      fx.globalCompositeOperation = "source-atop";
      fx.fillStyle = "#ffffff";
      fx.fillRect(-drawW / 2, -drawH, drawW, drawH);
      fx.globalCompositeOperation = "source-over";
    }
    fx.restore();
  }
}

export function renderArena(ctx: CanvasRenderingContext2D, engine: ArenaEngine) {
  showPlayerName = engine.mode === "duel";
  // The canvas is already sized in art pixels, so draw straight into it.
  const b = ctx;
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;

  const dt = Math.min(0.1, Math.max(0, engine.time - prevTime));
  prevTime = engine.time;
  if (engine.shake > prevShake + 1.5) {
    const mag = Math.min(1, engine.shake / 18);
    punchMag = mag;
    punchTimer = PUNCH_DURATION;
    flashMag = mag * 0.32;
    flashTimer = FLASH_DURATION;
    // Reuse the same "a fresh hit just landed" signal to pick a sound —
    // the engine doesn't need its own audio hooks, just bigger shakes for
    // bigger moments, which it already had.
    playSound(engine.shake >= 15 ? "knockdown" : engine.shake >= 8 ? "hitHeavy" : "hitLight");
  }
  prevShake = engine.shake;
  punchTimer = Math.max(0, punchTimer - dt);
  flashTimer = Math.max(0, flashTimer - dt);
  const punchScale = 1 + (punchTimer / PUNCH_DURATION) * punchMag * 0.05;

  b.save();
  if (punchTimer > 0) {
    b.translate(vw / 2, vh / 2);
    b.scale(punchScale, punchScale);
    b.translate(-vw / 2, -vh / 2);
  }

  // Camera in art-pixel space, snapped so the world never sub-pixel jitters.
  const { camX, camY } = cameraArt(engine);
  /** World units -> art pixels. */
  const wx = (v: number) => Math.round(v / S) - camX;
  const wy = (v: number) => Math.round(v / S) - camY;

  trackStateSounds(engine);

  const biome = (engine as ArenaEngine & { stage?: { biome?: string } }).stage?.biome ?? "keep";
  const groundWy = wy(engine.map.ground[0]?.y ?? 560);
  drawSky(b, vw, vh, camX, camY, biome, groundWy);
  drawTerrain(b, engine, wx, wy, vw, vh, biome);

  for (const bh of engine.blackHoles) {
    drawBlackHole(b, wx(bh.x), wy(bh.y), bh.radius / S, bh.life / bh.maxLife, engine.time);
  }
  drawMerchant(b, engine, wx, wy, engine.time);
  drawVendor(b, engine, wx, wy, engine.time);
  drawBank(b, engine, wx, wy, engine.time);
  for (const f of engine.fighters) drawFighter(b, f, wx, wy, engine.time);
  drawHitboxes(b, engine, wx, wy);
  for (const p of engine.projectiles) {
    drawProjectile(b, wx(p.x), wy(p.y), p.w / S, p.color);
  }
  drawParticles(b, engine, wx, wy);
  drawTexts(b, engine, wx, wy);
  drawVignette(b, vw, vh);
  b.restore();

  if (flashTimer > 0) {
    b.globalAlpha = (flashTimer / FLASH_DURATION) * flashMag;
    b.fillStyle = "#ffffff";
    b.fillRect(0, 0, vw, vh);
    b.globalAlpha = 1;
  }
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
  abyss: {
    sky: ["#0a0616", "#180a2e", "#241040"], far: "#1c0e38", near: "#120a24",
    accent: "#c4b5fd", stars: true, cap: "#2e1a4a", capLit: "#5b3a8f",
  },
  frost: {
    sky: ["#0c1c2e", "#1c3c56", "#3f6f92"], far: "#193349", near: "#122636",
    accent: "#dff3ff", stars: true, cap: "#cfe9fb", capLit: "#ffffff",
  },
  forge: {
    sky: ["#170a08", "#3a140c", "#5c1f0f"], far: "#2a0f0a", near: "#1a0a07",
    accent: "#fb923c", stars: false, cap: "#241210", capLit: "#5a2416",
  },
  storm: {
    sky: ["#131b2e", "#28405e", "#4f6d8f"], far: "#233b56", near: "#182a3d",
    accent: "#dbeafe", stars: false, cap: "#3a4a5c", capLit: "#6b8299",
  },
  blight: {
    sky: ["#0c1408", "#1c2e10", "#2e4a18"], far: "#1a2e12", near: "#10200a",
    accent: "#a3e635", stars: false, cap: "#2a3d16", capLit: "#5a7a2a",
  },
  divine: {
    sky: ["#3a2f52", "#8a6fb0", "#f4d9a0"], far: "#6a5a94", near: "#ecd9b8",
    accent: "#fffbeb", stars: false, cap: "#c9a24a", capLit: "#fff2c9",
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
  biomeId: string,
  groundWy: number
) {
  /** Screen offset for a layer moving at `speed` relative to the world. */
  const vshift = (speed: number) => Math.round((CAM_REF_Y - camY) * speed);
  const B = BIOMES[biomeId] ?? BIOMES.keep;

  if (biomeId === "town") {
    const bg = getVillageBackground();
    if (bg) {
      drawVillageBackground(b, bg, vw, vh, camX, groundWy);
      return; // the painted scene already carries sky, castle and tree line
    }
  }

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
  if (biomeId === "abyss") {
    // Violet motes sinking slowly through the void — the inverse of the
    // keep's rising embers, to keep the two "hell" biomes reading distinct.
    b.fillStyle = B.accent;
    for (let i = 0; i < 34; i++) {
      const ex = ((i * 113 - camX * 0.3) % vw + vw) % vw;
      const ey = ((i * 59 + Date.now() * 0.02) % (vh + 40)) - 20 + vshift(0.2);
      b.globalAlpha = 0.4 + 0.3 * Math.sin(i + Date.now() * 0.001);
      b.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
    b.globalAlpha = 1;
  }
  if (biomeId === "frost") {
    // Snow drifting straight down, gently swaying side to side.
    b.fillStyle = "#ffffff";
    for (let i = 0; i < 40; i++) {
      const sway = Math.sin(i + Date.now() * 0.0016) * 6;
      const ex = ((i * 97 - camX * 0.35 + sway) % vw + vw) % vw;
      const ey = ((i * 61 + Date.now() * 0.05) % (vh + 20)) - 10 + vshift(0.25);
      b.globalAlpha = 0.35 + 0.35 * Math.sin(i * 1.7);
      b.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
    b.globalAlpha = 1;
  }
  if (biomeId === "forge") {
    // Hot sparks and drifting ash thrown up from the forge floor — brighter
    // and denser than the keep's lava embers, to sell "furnace" over "castle".
    for (let i = 0; i < 30; i++) {
      const ex = ((i * 131 - camX * 0.4) % vw + vw) % vw;
      const ey = vh - ((i * 67 + Date.now() * 0.02) % vh) + vshift(0.3);
      b.fillStyle = i % 3 === 0 ? "#fff7ed" : B.accent;
      b.globalAlpha = 0.5 + 0.4 * Math.sin(i * 2.1 + Date.now() * 0.002);
      b.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
    b.globalAlpha = 1;
  }
  if (biomeId === "storm") {
    // Intermittent lightning: a soft sky-wide flash plus a jagged bolt,
    // on a wall-clock cycle so every player sees the same rhythm.
    const t = Date.now() % 4000;
    if (t < 120) {
      const flashAlpha = t < 60 ? t / 60 : 1 - (t - 60) / 60;
      b.globalAlpha = flashAlpha * 0.5;
      b.fillStyle = "#eaf2ff";
      b.fillRect(0, 0, vw, Math.round(vh * 0.6));
      b.globalAlpha = 1;
      let bx = Math.round(vw * 0.3 + Math.sin(t) * 40);
      let by = 0;
      const boltBottom = vh * 0.55;
      for (let s = 0; s < 10 && by < boltBottom; s++) {
        const nx = bx + (((s * 37) % 13) - 6);
        const ny = by + vh * 0.06;
        px(b, Math.min(bx, nx), ny - 1, Math.abs(nx - bx) + 2, 2, "#ffffff");
        bx = nx;
        by = ny;
      }
    }
    // Faint driving rain.
    b.fillStyle = "#c7d9f0";
    b.globalAlpha = 0.25;
    for (let i = 0; i < 40; i++) {
      const ex = ((i * 83 - camX * 0.4 - Date.now() * 0.15) % vw + vw * 2) % vw;
      const ey = (i * 53 + Date.now() * 0.3) % vh;
      b.fillRect(Math.round(ex), Math.round(ey), 1, 3);
    }
    b.globalAlpha = 1;
  }
  if (biomeId === "blight") {
    // Toxic spores drifting up with a lazy side-to-side wobble.
    b.fillStyle = B.accent;
    for (let i = 0; i < 28; i++) {
      const wobble = Math.sin(i + Date.now() * 0.001) * 8;
      const ex = ((i * 149 - camX * 0.3 + wobble) % vw + vw) % vw;
      const ey = vh - ((i * 61 + Date.now() * 0.015) % vh) + vshift(0.25);
      b.globalAlpha = 0.35 + 0.3 * Math.sin(i * 1.3 + Date.now() * 0.0015);
      b.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
    b.globalAlpha = 1;
  }
  if (biomeId === "divine") {
    // Soft golden light rays fanning down, plus drifting motes of light —
    // the one deliberately bright, warm biome against an otherwise dark game.
    b.globalAlpha = 0.1;
    b.fillStyle = B.accent;
    for (let i = 0; i < 6; i++) {
      const period = vw + 300;
      const rx = (((i * 220 - camX * 0.15) % period) + period) % period - 150;
      for (let yy = 0; yy < vh; yy += 6) {
        const wdt = 30 + yy * 0.15;
        px(b, rx - wdt / 2 + Math.sin(yy * 0.02 + i) * 10, yy, wdt, 6, B.accent);
      }
    }
    b.globalAlpha = 1;
    b.fillStyle = "#fff8e1";
    for (let i = 0; i < 30; i++) {
      const ex = ((i * 97 - camX * 0.25) % vw + vw) % vw;
      const ey = (i * 71 + Date.now() * 0.01) % vh;
      b.globalAlpha = 0.4 + 0.3 * Math.sin(i * 1.7 + Date.now() * 0.001);
      b.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
    b.globalAlpha = 1;
  }

  const skyline = (speed: number, colour: string, baseTop: number, kind: string) => {
    const gap =
      kind === "trees" ? 34 :
      kind === "houses" ? 52 :
      kind === "spires" ? 46 :
      kind === "peaks" ? 64 :
      kind === "ruins" ? 50 :
      kind === "deadwood" ? 38 :
      kind === "columns" ? 60 : 74;
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
      } else if (kind === "spires") {
        // Jagged obsidian shards, jutting at a slight lean, each capped with
        // a faint glowing tip so the abyss reads as lit from within.
        const lean = ((x / gap) % 2 === 0 ? 1 : -1) * 3;
        const peak = top - 10 - (Math.abs(Math.round(x)) % 26);
        for (let t = 0; t <= 6; t++) {
          const yy = peak + t * ((bottom - peak) / 6);
          const wdt = 3 + t * 2;
          px(b, x - wdt / 2 + lean * (t / 6), yy, wdt, (bottom - peak) / 6 + 1, colour);
        }
        pxGlow(b, x + lean, peak + 2, 5, BIOMES.abyss.accent, 0.5);
      } else if (kind === "peaks") {
        // Snow-capped mountain silhouettes: a stepped triangle, white at the
        // tip and shading down into the biome colour toward the base.
        const peak = top - 6 - (Math.abs(Math.round(x * 0.7)) % 30);
        const steps = 8;
        const rowH = (bottom - peak) / steps;
        const halfGap = gap / 2;
        for (let t = 0; t <= steps; t++) {
          const wdt = halfGap * (0.15 + (t / steps) * 1.1);
          px(b, x + halfGap - wdt / 2, peak + t * rowH, wdt, rowH + 1, t <= 1 ? "#ffffff" : colour);
        }
      } else if (kind === "chimneys") {
        // Furnace stacks: a dark tower with a molten slit glowing near the
        // top and a thin trail of rising smoke.
        const wdt = 18;
        const jitter = Math.abs(Math.round(x * 1.3)) % 22;
        const hy = top + jitter;
        px(b, x, hy, wdt, bottom - hy, colour);
        px(b, x + 3, hy + 6, wdt - 6, 3, B.accent);
        pxGlow(b, x + wdt / 2, hy + 7, 6, B.accent, 0.55);
        for (let s = 0; s < 3; s++) {
          const sy = hy - 6 - s * 8 - Math.round(((Date.now() * 0.02 + x) / 6) % 8);
          px(b, x + wdt / 2 - 1 + (s % 2), sy, 2, 2, "#2a1410");
        }
      } else if (kind === "ruins") {
        // Floating fortress rubble, drifting at different heights with a
        // jagged broken underside — reads as debris, not solid ground.
        const floatY = top + Math.round(Math.sin(x * 0.05) * 14);
        const chunkH = 26;
        px(b, x, floatY, 34, chunkH, colour);
        px(b, x + 4, floatY - 3, 26, 3, colour);
        for (let c = 0; c < 34; c += 6) {
          const jag = 3 + (c % 12);
          px(b, x + c, floatY + chunkH, 4, jag, colour);
        }
      } else if (kind === "deadwood") {
        // Bare, twisted dead trees — a trunk and gnarled branches, no canopy.
        px(b, x + 5, top + 10, 2, bottom - top - 10, colour);
        for (let branch = 0; branch < 4; branch++) {
          const by = top + 10 + branch * 8;
          const dir = branch % 2 === 0 ? 1 : -1;
          const len = 5 + (branch % 3) * 2;
          const bx = dir === 1 ? x + 6 : x + 6 - len;
          px(b, bx, by, len, 1, colour);
          px(b, dir === 1 ? bx + len : bx, by - 3, 1, 4, colour);
        }
      } else if (kind === "columns") {
        // Broken marble columns — some snapped mid-height, some still
        // standing with their capital intact.
        const snapped = Math.abs(Math.round(x * 0.7)) % 3 === 0;
        const colH = Math.round(snapped ? (bottom - top) * 0.55 : bottom - top);
        const colTop = bottom - colH;
        px(b, x + 6, colTop, 14, colH, colour);
        px(b, x + 4, colTop, 18, 4, colour);
        if (!snapped) px(b, x + 4, colTop - 4, 18, 4, colour);
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
    biomeId === "undercity" ? "arches" :
    biomeId === "abyss" ? "spires" :
    biomeId === "frost" ? "peaks" :
    biomeId === "forge" ? "chimneys" :
    biomeId === "storm" ? "ruins" :
    biomeId === "blight" ? "deadwood" :
    biomeId === "divine" ? "columns" : "towers";
  skyline(0.25, B.far, Math.round(vh * 0.36), kind);
  skyline(0.5, B.near, Math.round(vh * 0.52), kind);
}

/**
 * Tiles Emberhold's painted backdrop across the viewport with a light
 * horizontal parallax. The image is scaled to the buffer's full height like
 * the flat sky fill it replaces; the game's own ground/props are drawn over
 * its lower edge afterward exactly as they would over the flat colour.
 */
/** Where the painted street sits within the source image, as a fraction of its height. */
const VILLAGE_STREET_FRAC = 0.89;

function drawVillageBackground(
  b: CanvasRenderingContext2D,
  img: HTMLImageElement,
  vw: number,
  vh: number,
  camX: number,
  groundWy: number
) {
  // Oversized a little and anchored on the actual ground line (rather than
  // just filling 0..vh) so the painted street lines up with the game's own
  // ground instead of drifting up the building fronts as the camera's
  // vertical position shifts.
  const imgH = Math.round(vh * 1.15);
  const imgW = Math.round(imgH * (img.naturalWidth / img.naturalHeight));
  const y = Math.round(groundWy - imgH * VILLAGE_STREET_FRAC);
  const speed = 0.35;
  const off = (-Math.round(camX * speed) % imgW + imgW) % imgW;
  const smoothed = b.imageSmoothingEnabled;
  b.imageSmoothingEnabled = true;
  for (let x = off - imgW; x < vw; x += imgW) {
    b.drawImage(img, x, y, imgW, imgH);
  }
  b.imageSmoothingEnabled = smoothed;
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

/** The gear vendor: a rack of weapons/armour behind a mail-clad trader. */
function drawVendor(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number
) {
  const stage = (engine as ArenaEngine & {
    stage?: { isTown?: boolean; vendorX?: number };
  }).stage;
  if (!stage?.isTown || stage.vendorX === undefined) return;

  const gy = engine.groundAtX(stage.vendorX);
  if (gy === null) return;
  const x = wx(stage.vendorX);
  const y = wy(gy);
  const bob = Math.round(Math.sin(time * 2 + 1) * 1);

  // Weapon rack behind him: two uprights and a crossbar hung with gear.
  px(b, x - 18, y - 36, 2, 36, "#4a3626");
  px(b, x + 16, y - 36, 2, 36, "#4a3626");
  px(b, x - 18, y - 36, 36, 2, "#5c4530");
  // A sword, an axe-head and a shield hung along the bar.
  px(b, x - 14, y - 34, 2, 12, "#c3cad4");
  px(b, x - 15, y - 34, 4, 2, "#8b93a0");
  px(b, x - 2, y - 33, 6, 5, "#8a3a22");
  px(b, x, y - 33, 2, 5, "#5c5040");
  px(b, x + 8, y - 34, 6, 8, "#3a4050");
  px(b, x + 8, y - 34, 6, 1, "#565f73");
  px(b, x + 10, y - 31, 2, 2, "#c9b896");

  // The vendor: banded mail vest over a tunic, thicker-set than the enhancer.
  px(b, x - 6, y - 21 + bob, 12, 19, "#5a5f6b");
  px(b, x - 6, y - 21 + bob, 12, 2, "#7a8090");
  px(b, x - 6, y - 8, 12, 6, "#3f4450");
  for (let i = 0; i < 12; i += 3) px(b, x - 6 + i, y - 15 + bob, 2, 8, "#454a55");
  px(b, x - 4, y - 29 + bob, 8, 8, "#d9a878");
  px(b, x - 5, y - 30 + bob, 10, 3, "#3a2a1c");
  px(b, x - 2, y - 25 + bob, 1, 1, PAL.ink);
  px(b, x + 1, y - 25 + bob, 1, 1, PAL.ink);
  px(b, x - 6, y - 5, 12, 1, "#c9a24a");

  const near = (engine as ArenaEngine & { nearVendor?: boolean }).nearVendor;
  if (near) {
    const pulse = Math.sin(time * 6) > 0 ? "#ffffff" : "#f6b352";
    pxText(b, "PRESS E", x, y - 40 + bob, pulse, 5);
  }
}

/** The bank keeper: a robed figure minding a reinforced vault chest. */
function drawBank(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number
) {
  const stage = (engine as ArenaEngine & {
    stage?: { isTown?: boolean; bankX?: number };
  }).stage;
  if (!stage?.isTown || stage.bankX === undefined) return;

  const gy = engine.groundAtX(stage.bankX);
  if (gy === null) return;
  const x = wx(stage.bankX);
  const y = wy(gy);
  const bob = Math.round(Math.sin(time * 2 + 2) * 1);

  // A squat, iron-banded vault chest beside her.
  px(b, x + 8, y - 14, 16, 14, "#3a4050");
  px(b, x + 8, y - 14, 16, 2, "#565f73");
  px(b, x + 8, y - 8, 16, 2, "#2a2f3a");
  px(b, x + 14, y - 12, 4, 4, "#c9a24a");
  px(b, x + 15, y - 11, 2, 2, "#1c1f28");
  pxGlow(b, x + 16, y - 10, 5, "#7dd3fc", 0.5);

  // The keeper: deep violet robe (distinct from the enhancer's blue), calm hood.
  px(b, x - 5, y - 23 + bob, 10, 23, "#463a6b");
  px(b, x - 5, y - 23 + bob, 10, 2, "#6a5a96");
  px(b, x - 5, y - 4, 10, 4, "#2e2648");
  px(b, x - 4, y - 31 + bob, 8, 8, "#e8c9a0");
  px(b, x - 5, y - 32 + bob, 10, 4, "#332a4a");
  px(b, x - 2, y - 27 + bob, 1, 1, PAL.ink);
  px(b, x + 1, y - 27 + bob, 1, 1, PAL.ink);
  px(b, x - 5, y - 21 + bob, 10, 1, "#c9a24a");
  pxGlow(b, x - 12, y - 18, 6, "#7dd3fc", 0.5);

  const near = (engine as ArenaEngine & { nearBank?: boolean }).nearBank;
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

  // Paragon/Shedim's body is drawn by the crisp portrait overlay canvas
  // instead (see renderFighterPortraits) — this pass only contributes the
  // shadow/rings already drawn above and the nameplate below.
  const usesPortrait = (hero || knight) && !!getPortraitImage(f.classId);

  if (f.state === "knockdown") {
    if (!usesPortrait) drawDowned(b, x, y, w, h, p, col);
    drawNameplate(b, f, x, y - h - 6);
    return;
  }

  if (usesPortrait) {
    drawNameplate(b, f, x, y - h - 3);
    return;
  }

  const moving = f.state === "walk" || f.state === "sprint";
  const cadence = f.state === "sprint" ? 14 : 9;
  const step = moving ? Math.floor(time * cadence) % 4 : 0;
  const bob = moving && (step === 1 || step === 3) ? 1 : 0;
  const airborne = f.state === "air";

  // --- proportions, in art pixels ---------------------------------------
  const headH = Math.max(5, Math.round(h * 0.25));
  const legH = Math.max(4, Math.round(h * 0.3));
  // A thin neck row keeps the head from visually fusing into the torso when
  // both share a similar tone (bare-chested Paragon, for instance).
  const neckH = 2;
  const torsoH = h - headH - legH - neckH;
  const torsoW = Math.max(5, w - 2);
  const topY = y - h + bob;
  const neckY = topY + headH;
  const torsoY = neckY + neckH;
  const legY = y - legH;
  const half = Math.floor(torsoW / 2);
  // Hips read slightly narrower than the shoulder line, so the silhouette
  // tapers instead of reading as a straight-sided rectangle.
  const hipHalf = Math.max(2, half - 1);
  const ink = p.outline;
  const back = -dir; // the trailing side of the sprite

  // --- rear-hand ice crystal (behind everything) --------------------------
  if (hero) {
    // Pushed a little further from the body than the pauldron above it, so
    // the two shapes stay visually separate instead of fusing together.
    const ix = x + back * (half + 3);
    const iyTop = torsoY + Math.round(torsoH * 0.55);
    const iceH = Math.round(h * 0.34);
    pxOutline(b, ix - 2, iyTop - 1, 6, iceH + 2, ink);
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
    // A dark seam beneath separates the pauldron from the arm below it.
    px(b, back === 1 ? sx2 - 1 : sx2 - 4, sy2 + 9, 5, 1, ink);
  }

  // --- neck seam ------------------------------------------------------------
  // A dark line right under the head plus a narrow shaded bridge down to the
  // torso, so the head-to-body boundary reads even when their fill colours
  // match (Paragon's bare chest is the same tone as his face).
  {
    const neckW = Math.max(2, half);
    const neckColor = hero ? KIT.skinShade : knight ? SKIT.plateDark : p.shade;
    px(b, x - Math.floor(neckW / 2) - 1, neckY - 1, neckW + 2, 1, ink);
    px(b, x - Math.floor(neckW / 2), neckY, neckW, neckH, col(neckColor));
  }

  // --- legs ---------------------------------------------------------------
  const swing = airborne ? 2 : step === 1 ? 2 : step === 3 ? -2 : 0;
  const legW = Math.max(2, Math.round(torsoW * 0.36));
  const frontLegX = x - hipHalf + Math.round(swing * 0.5);
  const backLegX = x + hipHalf - legW - Math.round(swing * 0.5);
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
    // Bare, muscled chest. Collar and belt are proportional to torsoH (and
    // kept to 2 rows each) so a good, unambiguous band of skin always shows
    // between them — the whole point of a shirtless build.
    const collarH = Math.min(2, Math.max(1, Math.round(torsoH * 0.18)));
    const beltH = Math.min(2, Math.max(1, Math.round(torsoH * 0.18)));
    px(b, x - half, torsoY, torsoW, torsoH, col(KIT.skin));
    px(b, dir === 1 ? x - half : x + half - 3, torsoY, 3, torsoH, col(KIT.skinShade));
    // Pectoral split and two ab lines, spaced across the visible skin band.
    const skinTop = torsoY + collarH;
    const skinH = Math.max(1, torsoH - collarH - beltH);
    px(b, x - half + 1, skinTop + Math.round(skinH * 0.15), torsoW - 2, 1, col(KIT.skinShade));
    px(b, x, skinTop + Math.round(skinH * 0.3), 1, Math.max(2, Math.round(skinH * 0.4)), col(KIT.skinShade));
    px(b, x - half + 2, skinTop + Math.round(skinH * 0.75), torsoW - 4, 1, col(KIT.skinShade));
    // Black collar / neck guard over the shoulders.
    px(b, x - half - 1, torsoY - 1, torsoW + 2, collarH + 1, col(KIT.mask));
    px(b, x - half - 1, torsoY - 1, torsoW + 2, 1, col(KIT.maskLit));
    // Gold chain hanging from the collar on the leading side.
    px(b, x + dir, torsoY + collarH, 3, 1, col(KIT.gold));
    px(b, x + dir * 3, torsoY + collarH + 1, 1, 1, col(KIT.goldDark));
    // Belted waist.
    px(b, x - half, torsoY + torsoH - beltH, torsoW, beltH, col(KIT.pants));
    px(b, x - half, torsoY + torsoH - beltH, torsoW, 1, col(KIT.pantsLit));
    px(b, x - 1, torsoY + torsoH - beltH, 2, Math.max(1, beltH), col(KIT.gold));
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
  // Full torso outline (top, bottom, both sides) — the single biggest thing
  // that keeps the silhouette crisp against similarly-toned backgrounds and
  // against the character's own limbs.
  px(b, x - half - 1, torsoY - 1, torsoW + 2, 1, ink);
  px(b, x - half - 1, torsoY + torsoH, torsoW + 2, 1, ink);
  px(b, x - half - 1, torsoY, 1, torsoH, ink);
  px(b, x + half, torsoY, 1, torsoH, ink);

  // --- arms ---------------------------------------------------------------
  const reach = armReach(f);
  // Attached at shoulder height (overlapping the collar band, which is where
  // a real shoulder joint sits) rather than mid-torso — anything lower and
  // the arm's skin tone paints straight over the bare chest it should be
  // hanging in front of, hiding it entirely.
  const armY = torsoY - 1;
  const armLen = half + 2 + reach;
  const armX = dir === 1 ? x : x - armLen;
  const handX = x + dir * armLen;

  // Rear arm: a short shaded stub ending in its own rounded fist, so it
  // reads as a limb tucked behind the torso rather than a stray bar.
  {
    const rearLen = Math.max(3, Math.round(torsoH * 0.4));
    const rearTone = hero ? KIT.skinShade : knight ? SKIT.plateDark : p.shade;
    const rx = x - dir * (half - 1);
    px(b, rx - 1, armY + 1, 2, rearLen, col(rearTone));
    drawFist(b, rx, armY + 1 + rearLen, 2, col(rearTone), ink);
  }

  if (hero) {
    // Bare-skin forearm capped by a crimson gauntlet at just the hand, with a
    // seam between them — a colour change plus a gap, not one long red smear
    // fused into the chest.
    const gauntletLen = Math.min(armLen - 2, 6);
    const foreLen = Math.max(2, armLen - gauntletLen);
    const foreLeft = dir === 1 ? x : x - foreLen;
    const gauntLeft = dir === 1 ? x + foreLen : handX;
    const seamX = dir === 1 ? x + foreLen : x - foreLen;

    px(b, foreLeft, armY, foreLen, 4, col(KIT.skin));
    px(b, foreLeft, armY, foreLen, 1, col(KIT.skinShade));
    px(b, foreLeft, armY + 4, foreLen, 1, ink);
    px(b, seamX, armY - 1, 1, 6, ink);
    px(b, gauntLeft, armY - 1, gauntletLen, 6, col(KIT.crimson));
    px(b, gauntLeft, armY - 1, gauntletLen, 1, col(KIT.crimsonLit));
    px(b, gauntLeft, armY + 4, gauntletLen, 1, ink);
    // Claws jutting past the knuckles.
    px(b, dir === 1 ? handX : handX - 2, armY - 1, 2, 1, col(KIT.crimsonDark));
    px(b, dir === 1 ? handX : handX - 2, armY + 4, 2, 1, col(KIT.crimsonDark));
  } else {
    px(b, armX, armY, armLen, 3, col(knight ? SKIT.plate : p.primary));
    if (knight) px(b, armX, armY, armLen, 1, col(SKIT.plateLit));
    px(b, armX, armY + 3, armLen, 1, ink);
    drawFist(
      b,
      dir === 1 ? handX - 1 : handX + 1,
      armY + 1,
      2,
      col(knight ? SKIT.plateDark : p.skin),
      ink
    );
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
    case "revenant": {
      // A tattered void-wraith: trailing cloak shreds and a hollow violet gaze.
      pxGlow(b, x, y - h * 0.5, h * 0.45, "#a78bfa", 0.5);
      for (let i = 0; i < 5; i++) {
        px(b, x - half + i * 3, y - 3 + (i % 2) * 2, 2, 4 + (i % 3), col(m.accent));
      }
      px(b, x + dir * 2, topY + 3, 1, 1, "#e9d5ff");
      px(b, x + dir * 4, topY + 3, 1, 1, "#e9d5ff");
      break;
    }
    case "sovereign": {
      // The abyss's crowned ruler: a floating jagged halo and a deep violet
      // aura heavier than any other mob's, so it reads as the true final boss.
      pxGlow(b, x, y - h * 0.55, h * 0.9, "#c026d3", 0.65);
      px(b, x - half - 3, torsoY - 2, 5, 8, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 8, col(m.accent));
      const haloY = topY - 6;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + Date.now() * 0.0015;
        px(b, x + Math.round(Math.cos(a) * (half + 6)), haloY + Math.round(Math.sin(a) * 3), 2, 2, "#f0abfc");
      }
      px(b, x - half, topY + 3, w, 1, "#e9d5ff");
      break;
    }
    case "frostfang": {
      // A lean ice-wraith: jagged frost shards along the spine and a pale
      // frozen-breath wisp, so it reads as fast and cold rather than heavy.
      pxGlow(b, x, y - h * 0.45, h * 0.35, "#bfe8ff", 0.45);
      for (let i = 0; i < 4; i++) {
        px(b, x - half - 1 + i * 3, torsoY - 2 - (i % 2) * 2, 2, 4, col(m.accent));
      }
      px(b, x + dir * 3, topY + 2, 3, 1, "#eaf9ff");
      px(b, x + dir * 5, topY + 1, 2, 1, "#eaf9ff");
      break;
    }
    case "frostking": {
      // The reach's frozen monarch: a jagged ice crown and a wide, slow
      // aura in near-white — the coldest, biggest presence on the map.
      pxGlow(b, x, y - h * 0.55, h * 0.95, "#eaf9ff", 0.6);
      px(b, x - half - 3, torsoY - 2, 5, 8, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 8, col(m.accent));
      for (let i = 0; i < 5; i += 2) {
        px(b, x - half + i * 2, topY - 5, 1, 4, "#ffffff");
      }
      px(b, x - half, topY + 3, w, 1, "#eaf9ff");
      px(b, x + dir * 2, topY + 4, 2, 1, "#bfe8ff");
      break;
    }
    case "cinderwraith": {
      // A molten wraith: cracked, glowing seams across the body and a
      // heat-shimmer trail instead of a solid cloak.
      pxGlow(b, x, y - h * 0.45, h * 0.4, "#fb923c", 0.5);
      for (let i = 0; i < 4; i++) {
        px(b, x - half + i * 3, torsoY + 1 + (i % 2) * 3, 2, 2, "#fed7aa");
      }
      px(b, x + dir * 2, topY + 3, 2, 1, "#fff7ed");
      px(b, x - dir * (half + 2), y - 4, 2, 3, col(m.accent));
      break;
    }
    case "forgeheart": {
      // The forge's molten heart: cracked white-hot plating and the widest,
      // brightest aura of any mob — unmistakably the endgame boss.
      pxGlow(b, x, y - h * 0.55, h, "#fde68a", 0.65);
      px(b, x - half - 3, torsoY - 2, 5, 8, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 8, col(m.accent));
      for (let i = 0; i < 3; i++) {
        px(b, x - half + 2 + i * 4, torsoY + 2 + i * 3, 2, 2, "#fff7ed");
      }
      px(b, x - half, topY + 3, w, 1, "#fde68a");
      px(b, x + dir * 2, topY + 4, 2, 1, "#fb923c");
      break;
    }
    case "stormcaller": {
      // A crackling storm-wraith: arcs of lightning branching off its limbs
      // and a flickering white-blue afterimage instead of a solid cloak.
      pxGlow(b, x, y - h * 0.45, h * 0.4, "#bfdbfe", 0.5);
      for (let i = 0; i < 4; i++) {
        const flick = Math.floor(Date.now() * 0.02 + i) % 3 === 0;
        px(b, x - half + i * 3, torsoY + 1 + (i % 2) * 3, 2, 2, flick ? "#ffffff" : col(m.accent));
      }
      px(b, x + dir * (half + 3), topY + 2, 1, 6, "#eff6ff");
      px(b, x + dir * (half + 4), topY, 1, 3, "#eff6ff");
      break;
    }
    case "tempestwarden": {
      // The spire's guardian: a wide lightning-white aura and a crackling
      // halo of arcs, the storm given a crown.
      pxGlow(b, x, y - h * 0.55, h * 0.95, "#eff6ff", 0.6);
      px(b, x - half - 3, torsoY - 2, 5, 8, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 8, col(m.accent));
      const haloY = topY - 6;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Date.now() * 0.002;
        if (Math.floor(Date.now() * 0.015 + i) % 2 === 0) {
          px(b, x + Math.round(Math.cos(a) * (half + 6)), haloY + Math.round(Math.sin(a) * 3), 2, 2, "#ffffff");
        }
      }
      px(b, x - half, topY + 3, w, 1, "#dbeafe");
      break;
    }
    case "plaguebound": {
      // A rotting husk leaking sickly spores from cracked, weeping flesh.
      pxGlow(b, x, y - h * 0.45, h * 0.35, "#a3e635", 0.4);
      for (let i = 0; i < 4; i++) {
        px(b, x - half + i * 3, torsoY + 2 + (i % 2) * 3, 2, 2, col(m.accent));
      }
      px(b, x + dir * 2, topY + 3, 1, 1, "#bef264");
      px(b, x + dir * 4, topY + 4, 1, 1, "#bef264");
      px(b, x - half, torsoY + torsoH, w, 1, col(m.accent));
      break;
    }
    case "rotmother": {
      // The hollow's matriarch: a bloated silhouette wreathed in a heavy
      // toxic bloom, the thickest aura of any mob so far bar the finale.
      pxGlow(b, x, y - h * 0.55, h * 0.9, "#bef264", 0.6);
      px(b, x - half - 3, torsoY - 2, 5, 8, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 8, col(m.accent));
      for (let i = 0; i < 3; i++) {
        px(b, x - half + 2 + i * 4, torsoY + 3 + i * 3, 2, 2, "#ecfccb");
      }
      px(b, x - half, topY + 3, w, 1, "#a3e635");
      break;
    }
    case "seraphremnant": {
      // A shattered angel: a faint golden halo and a trailing wisp of light
      // in place of wings, the divine biome's regular guardian.
      pxGlow(b, x, y - h * 0.45, h * 0.4, "#fef3c7", 0.45);
      px(b, x + dir * 2, topY - 3, 4, 1, "#fffbeb");
      for (let i = 0; i < 3; i++) {
        px(b, x - half - dir * i, torsoY + i * 3, 1, 2, "#fde68a");
      }
      break;
    }
    case "sunderedking": {
      // The last boss: a broken golden crown and the biggest, brightest
      // aura in the game — every earlier boss's presence, doubled.
      pxGlow(b, x, y - h * 0.6, h * 1.05, "#fffbeb", 0.7);
      px(b, x - half - 3, torsoY - 2, 5, 9, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 9, col(m.accent));
      for (let i = 0; i < 7; i += 2) {
        px(b, x - half + i * 2, topY - 6, 1, 5, "#fde68a");
      }
      px(b, x - half, topY + 2, w, 1, "#fffbeb");
      px(b, x + dir * 2, topY + 4, 2, 1, "#fbbf24");
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
    // Held out to the rear, well clear of the torso, the way the ice crystal
    // sits on Paragon's off hand — otherwise it overlaps the chest plate.
    const bx = x - dir * Math.round(h * 0.34);
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

/**
 * A small rounded fist: an ink ring behind a filled circle. Used at the end
 * of every limb so hands read as distinct rounded shapes rather than the
 * flat rectangles a straight `px` block produces.
 */
function drawFist(
  b: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  ink: string
) {
  pxCircle(b, cx, cy, r + 1, ink);
  pxCircle(b, cx, cy, r, color);
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
  // A soft radial falloff toward the corners — the cheap trick that makes a
  // flat screenshot read as a framed shot instead of a security-camera feed.
  const cx = vw / 2;
  const cy = vh / 2;
  const inner = Math.min(vw, vh) * 0.32;
  const outer = Math.max(vw, vh) * 0.75;
  const grad = b.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, "rgba(5,7,12,0)");
  grad.addColorStop(1, "rgba(5,7,12,0.6)");
  b.fillStyle = grad;
  b.fillRect(0, 0, vw, vh);

  // A narrow dithered rim on top, kept subtle so it frames rather than
  // textures — the pixel-art equivalent of a hard vignette edge.
  const edge = 4;
  b.globalAlpha = 0.3;
  pxDither(b, 0, 0, vw, edge, PAL.ink);
  pxDither(b, 0, vh - edge, vw, edge, PAL.ink);
  pxDither(b, 0, 0, edge, vh, PAL.ink);
  pxDither(b, vw - edge, 0, edge, vh, PAL.ink);
  b.globalAlpha = 1;
}
