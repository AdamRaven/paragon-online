import type { LootDrop } from "./adventure";
import { getClass } from "./classes";
import {
  HITSTUN_SINGLE,
  JUMP_VELOCITY,
  KNOCKDOWN_DURATION,
  REFLECT_DURATION,
} from "./constants";
import type { ArenaEngine } from "./engine";
import { itemColor, itemGlow } from "./items";
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
import { getColorblindMode, getScreenShakeEnabled } from "./settings";
import type { Fighter } from "./types";

/** Cheap screen-space visibility check — skips drawing (and whatever
 *  gradients/glows/text/particle work that entails) for anything fully
 *  outside the viewport, the same way drawTerrain already culls ground
 *  segments. `margin` covers glow radii/sprite size so things don't pop
 *  in/out right at the edge. */
function onScreen(x: number, y: number, vw: number, vh: number, margin = 60): boolean {
  return x > -margin && x < vw + margin && y > -margin && y < vh + margin;
}

/** Mirrors BOSS_PHASE2 in adventure.ts — this file can't import the campaign
 *  layer, so the HP fractions that flip a boss's rim-glow hot red are kept
 *  here too. Update both if a phase threshold ever changes. */
const BOSS_PHASE2_HP_FRAC: Partial<Record<string, number>> = {
  warden: 0.5,
  sovereign: 0.5,
  frostking: 0.5,
  forgeheart: 0.4,
  tempestwarden: 0.5,
  rotmother: 0.4,
  sunderedking: 0.25,
};

/** Elite affix -> rim-glow colour, so the fight tells you what you're
 *  looking at before you even read the nameplate. Falls back to violet for
 *  an elite with no affix loaded yet (shouldn't happen, but never crash). */
const ELITE_AFFIX_COLOR: Partial<Record<string, string>> = {
  shielded: "#38bdf8",
  vampiric: "#dc2626",
  swift: "#fbbf24",
  volatile: "#f97316",
};
/** Colorblind-safer variant: vampiric's red (too close to the phase2 rage
 *  glow) and swift's amber (too close to volatile's orange) both move to
 *  hues that stay distinct across the common deficiencies. */
const ELITE_AFFIX_COLOR_CB: Partial<Record<string, string>> = {
  shielded: "#38bdf8",
  vampiric: "#facc15",
  swift: "#22d3ee",
  volatile: "#f97316",
};
function eliteAffixColor(affix: string | undefined): string {
  const cb = getColorblindMode();
  const table = cb ? ELITE_AFFIX_COLOR_CB : ELITE_AFFIX_COLOR;
  return table[affix ?? ""] ?? (cb ? "#a78bfa" : "#c026d3");
}
/** Boss telegraph ring colour — sweep's purple sits too close to the elite
 *  fallback/vampiric hues for the same colorblind types, so it moves to blue. */
function bossTelegraphColor(isSweep: boolean): string {
  if (!isSweep) return "#ff3b30";
  return getColorblindMode() ? "#60a5fa" : "#c026d3";
}

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
// renderArena and renderFighterPortraits both call this for the same frame,
// back to back with no simulation step in between — camera/shake can't have
// changed, so the second call reuses the first's result instead of redoing
// the sin/cos work.
let cameraArtCacheTime = -1;
let cameraArtCacheX = 0;
let cameraArtCacheY = 0;

function cameraArt(engine: ArenaEngine) {
  if (engine.time === cameraArtCacheTime) {
    return { camX: cameraArtCacheX, camY: cameraArtCacheY };
  }
  const shakeAmt = getScreenShakeEnabled() ? engine.shake : 0;
  let shakeX = 0;
  let shakeY = 0;
  if (shakeAmt !== 0) {
    const t = engine.time * 43;
    shakeX = Math.sin(t) * shakeAmt * 0.5;
    shakeY = Math.cos(t * 1.3) * shakeAmt * 0.5;
  }
  cameraArtCacheTime = engine.time;
  cameraArtCacheX = Math.round((engine.camera.x + shakeX) / S);
  cameraArtCacheY = Math.round((engine.camera.y + shakeY) / S);
  return { camX: cameraArtCacheX, camY: cameraArtCacheY };
}

/** The punch-in scale from a fresh big hit, shared by both canvases so the
 *  crisp portrait overlay punches in exactly in step with the chunky world
 *  instead of visibly lagging or missing the effect entirely. */
function currentPunchScale(): number {
  return 1 + (punchTimer / PUNCH_DURATION) * punchMag * 0.05;
}

/**
 * Duels only: the camera otherwise just pans to the midpoint between the two
 * fighters, which is fine while they're close but leaves both of them
 * out of frame — staring at empty stage — the moment they're spread out
 * (e.g. right after a knockback, or crossing the arena's gap). Pulling the
 * camera back once their separation exceeds a comfortable fraction of the
 * viewport keeps both fighters visible without the eye ever losing the
 * fight, at the cost of everything reading a little smaller while it's
 * zoomed out.
 */
function duelZoom(engine: ArenaEngine, viewportArtWidth: number): number {
  if (engine.mode !== "duel" || !engine.enemy) return 1;
  const sepArt = Math.abs(engine.player.x - engine.enemy.x) / S;
  const comfortable = viewportArtWidth * 0.62;
  if (sepArt <= comfortable) return 1;
  return Math.max(0.55, comfortable / sepArt);
}

/** Previous per-fighter state, so dash/reflect play once on entry rather than every frame. */
const prevFighterState = new Map<string, string>();
/** Previous per-fighter action id, so a boss windup plays its warning once, not every frame. */
const prevFighterAction = new Map<string, string>();
let prevProjectileCount = 0;
let prevHazardHits = 0;

const seenFighterIds = new Set<string>();

function trackStateSounds(engine: ArenaEngine) {
  const seen = seenFighterIds;
  seen.clear();
  for (const f of engine.fighters) {
    seen.add(f.id);
    const prev = prevFighterState.get(f.id);
    if (f.state !== prev) {
      if (f.state === "dash" || f.state === "sprint") playSound("dash");
      else if (f.state === "reflect") playSound("block");
      prevFighterState.set(f.id, f.state);
    }
    const actionId = f.action?.spec.id ?? "";
    if (actionId !== prevFighterAction.get(f.id)) {
      if (actionId === "boss-special" || actionId === "boss-sweep") playSound("bossTelegraph");
      prevFighterAction.set(f.id, actionId);
    }
  }
  // Mobs despawn/respawn with new ids over time; drop anything no longer present.
  for (const id of prevFighterState.keys()) {
    if (!seen.has(id)) {
      prevFighterState.delete(id);
      prevFighterAction.delete(id);
    }
  }

  // A fresh projectile appeared this frame — cultists, sentinels and Shedim's
  // Shadow Slash all funnel through the same engine.projectiles array, so one
  // count comparison covers every ranged source instead of a sound hook per
  // spec. A lower count than last frame means a brand new engine mounted
  // (its own counter restarts at 0) rather than a projectile despawning
  // silently, so that case just resyncs instead of firing a false cue.
  if (engine.projectiles.length > prevProjectileCount) playSound("rangedShot");
  prevProjectileCount = engine.projectiles.length;

  if (engine.hazardHits > prevHazardHits) playSound("hazardBurn");
  prevHazardHits = engine.hazardHits;
}

// -------------------------------------------------------------- portraits

/**
 * Paragon, Shedim and Kacper all have hand-painted reference portraits now;
 * mobs don't, so they stay on the procedural pixel-art renderer below.
 */
const PORTRAIT_SRC: Partial<Record<string, string>> = {
  paragon: "/art/paragon/portrait.webp",
  shedim: "/art/shedim/portrait.webp",
  kacper: "/art/kacper/portrait.webp",
};
/**
 * Every portrait carries blank space below the feet (measured from each
 * image's alpha channel) left over from their source canvas. Drawing the
 * full image anchors that blank margin — not the actual feet — to the
 * ground, so the character reads as floating above where the walk-cycle
 * frames (cropped tight, no such margin) plant him. Cropping the source
 * rect to end at the real content bottom fixes the mismatch without
 * touching the top headroom, which is intentional.
 */
const PORTRAIT_CONTENT_BOTTOM: Partial<Record<string, number>> = {
  paragon: 441,
  shedim: 414,
  kacper: 912,
};
/** Kacper reads as the heavy-armour tank of the roster, so he's drawn a
 *  notch taller than everyone else. Feet stay planted at yFeet regardless
 *  (see destTop below) — this only grows him upward. */
const PORTRAIT_SCALE: Partial<Record<string, number>> = {
  kacper: 1.16,
};
const portraitCache = new Map<string, HTMLImageElement>();

/**
 * Warden's Keep and the Outskirts both have hand-painted art for their
 * regular mobs and boss, not just the playable classes — same crisp-overlay
 * treatment, layered over the procedural pixel body every other stage still
 * uses. Each source PNG is already trimmed tight to its content (no portrait-
 * style padding), so it draws with the same "tight crop" height formula the
 * animation frame sheets use below rather than the padded-portrait one.
 *
 * Keyed per-stage rather than just per-mobTypeId: several mobTypeIds (e.g.
 * blade-wraith, colossus, shieldbearer) are reused procedurally across
 * multiple stages, and only the one stage each set of art was painted for
 * should ever show it — everywhere else, that same mobTypeId keeps the
 * ordinary pixel-art look.
 */
const STAGE_MOB_SPRITE_SRC: Partial<Record<string, Partial<Record<string, string>>>> = {
  "warden-keep": {
    shieldbearer: "/art/wardens-keep/shieldbearer.png",
    "blade-wraith": "/art/wardens-keep/blade-wraith.png",
    colossus: "/art/wardens-keep/colossus.png",
    warden: "/art/wardens-keep/warden.png",
  },
  outskirts: {
    husk: "/art/the-outskirt/thorn-blob.png",
    brawler: "/art/the-outskirt/moss-golem.png",
    "rabid-cur": "/art/the-outskirt/spirit-wisp.png",
    treant: "/art/the-outskirt/treant.png",
  },
  undercity: {
    brawler: "/art/undercity/brute.png",
    "blade-wraith": "/art/undercity/wraith-ghost.png",
    cultist: "/art/undercity/shadow-rogue.png",
    dreadknight: "/art/undercity/dreadknight.png",
    // rabid-cur, bog-slime, shieldbearer and colossus have no Undercity-
    // themed art — deliberately NOT reusing Outskirts' forest wisp or
    // Warden's Keep's lava sprites here, since a mob's look should match
    // the stage it's standing in, not just its mobTypeId. They keep the
    // plain pixel-art look until Undercity-specific art exists for them.
  },
  sanctum: {
    revenant: "/art/abyssal-sanctum/void-kraken.png",
    sentinel: "/art/abyssal-sanctum/abyss-sentinel.png",
    "blade-wraith": "/art/abyssal-sanctum/void-swarmer.png",
    sovereign: "/art/abyssal-sanctum/sovereign.png",
    // colossus has no Sanctum-specific art and was dropped from this
    // stage's spawn list entirely rather than showing Warden's Keep's lava
    // look here — see the spawns comment in mobs.ts.
  },
};
/** Bosses need to read as one at a glance — their hitboxes are only a notch
 *  taller than the toughest regular mob in their stage, nowhere near enough
 *  of a size gap on their own, so they get an extra draw-size bump on top of
 *  the shared tight-crop formula. Feet stay planted at yFeet regardless (see
 *  destTop below) — this only grows them upward. */
const MOB_SPRITE_SCALE: Partial<Record<string, number>> = {
  warden: 1.8,
  treant: 1.6,
  dreadknight: 1.6,
  sovereign: 1.5,
};
// Keyed by "stageId:mobTypeId", not just mobTypeId — brawler and blade-wraith
// each wear different art in different stages, so a mobTypeId-only cache key
// would serve whichever stage's image got requested (and cached) first.
const mobSpriteCache = new Map<string, HTMLImageElement>();
function getMobSpriteImage(stageId: string | undefined, mobTypeId: string): HTMLImageElement | null {
  const src = stageId ? STAGE_MOB_SPRITE_SRC[stageId]?.[mobTypeId] : undefined;
  if (!src) return null;
  const cacheKey = `${stageId}:${mobTypeId}`;
  let img = mobSpriteCache.get(cacheKey);
  if (!img) {
    if (typeof Image === "undefined") return null;
    img = new Image();
    img.src = src;
    mobSpriteCache.set(cacheKey, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Emberhold's shopkeepers all have hand-painted reference art now, same
 * "crisp fx overlay" treatment as the three playable classes rather than the
 * chunky procedural pixel art every other town prop still gets. `crop` is
 * measured from each source PNG's actual alpha content (via a one-off script
 * against the raw file, not eyeballed) with a small margin, since the source
 * canvases aren't consistently centred or padded the same amount — cropping
 * to content means the anchor point always lands on the character's actual
 * feet instead of wherever the padding happened to leave them.
 */
interface NpcSprite {
  src: string;
  crop: { x: number; y: number; w: number; h: number };
  /** Art-pixel height on screen, before physicalPerArtPixel scaling. */
  heightArt: number;
  img: HTMLImageElement | null;
}
const NPC_SPRITES: Record<"blacksmith" | "vendor" | "storage", NpcSprite> = {
  blacksmith: {
    src: "/art/blacksmith.png",
    crop: { x: 9, y: 0, w: 426, h: 477 },
    heightArt: 32,
    img: null,
  },
  vendor: {
    src: "/art/vendor.png",
    crop: { x: 199, y: 71, w: 269, h: 384 },
    heightArt: 31,
    img: null,
  },
  storage: {
    src: "/art/storage.png",
    crop: { x: 114, y: 54, w: 264, h: 423 },
    heightArt: 25,
    img: null,
  },
};

function getNpcSprite(id: keyof typeof NPC_SPRITES): NpcSprite | null {
  const entry = NPC_SPRITES[id];
  if (!entry.img) {
    if (typeof Image === "undefined") return null;
    entry.img = new Image();
    entry.img.src = entry.src;
  }
  return entry.img.complete && entry.img.naturalWidth > 0 ? entry : null;
}


/** Draws one cropped NPC sprite feet-anchored at (x, yFeet) in physical
 *  (crisp overlay) pixel space. */
function drawNpcSprite(
  fx: CanvasRenderingContext2D,
  sprite: NpcSprite,
  x: number,
  yFeet: number,
  physicalPerArtPixel: number
) {
  const { img, crop } = sprite;
  if (!img) return;
  const drawH = sprite.heightArt * physicalPerArtPixel;
  const drawW = drawH * (crop.w / crop.h);
  fx.save();
  fx.translate(x, yFeet);
  fx.imageSmoothingEnabled = true;
  fx.imageSmoothingQuality = "high";
  fx.drawImage(img, crop.x, crop.y, crop.w, crop.h, -drawW / 2, -drawH, drawW, drawH);
  fx.restore();
}

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
 * Paragon's walk cycle: 8 frames on a 4x2 sheet, real alpha (no checkerboard
 * cleanup needed). Frame rects use each frame's own natural tight alpha
 * bounds (for correct cropping), but every frame is drawn at the same fixed
 * on-screen height regardless — scaling height off the natural crop instead
 * makes the character visibly shrink in any frame whose bounds happen to be
 * tighter, which reads as him shrinking mid-stride rather than the intended
 * constant-height walk.
 */
const WALK_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 38, y: 58, w: 63, h: 104 },
  { x: 170, y: 57, w: 50, h: 107 },
  { x: 288, y: 57, w: 51, h: 106 },
  { x: 401, y: 59, w: 64, h: 103 },
  { x: 44, y: 212, w: 50, h: 108 },
  { x: 166, y: 214, w: 50, h: 106 },
  { x: 291, y: 213, w: 49, h: 108 },
  { x: 403, y: 214, w: 71, h: 105 },
];
let walkSprite: HTMLImageElement | null = null;

function getWalkSprite(): HTMLImageElement | null {
  if (!walkSprite) {
    if (typeof Image === "undefined") return null;
    walkSprite = new Image();
    walkSprite.src = "/art/paragon/walking.webp";
  }
  return walkSprite.complete && walkSprite.naturalWidth > 0 ? walkSprite : null;
}

/**
 * Paragon's sprint cycle (double-tap A/D and hold): 8 frames on a 4x2 sheet,
 * a low, energy-trailed sprint. Same fixed-height treatment as the walk
 * cycle — natural bounds for cropping only, not for scaling.
 */
const RUN_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 10, y: 81, w: 121, h: 96 },
  { x: 131, y: 92, w: 114, h: 92 },
  { x: 245, y: 89, w: 107, h: 92 },
  { x: 360, y: 98, w: 118, h: 87 },
  { x: 0, y: 328, w: 123, h: 107 },
  { x: 132, y: 331, w: 109, h: 103 },
  { x: 241, y: 331, w: 109, h: 104 },
  { x: 358, y: 334, w: 113, h: 100 },
];
let runSprite: HTMLImageElement | null = null;

function getRunSprite(): HTMLImageElement | null {
  if (!runSprite) {
    if (typeof Image === "undefined") return null;
    runSprite = new Image();
    runSprite.src = "/art/paragon/running.webp";
  }
  return runSprite.complete && runSprite.naturalWidth > 0 ? runSprite : null;
}

/**
 * Paragon's idle cycle: 8 frames on a 4x2 sheet (each cell 125x250), a subtle
 * breathing/charging loop with a glowing hand — rects measured from the
 * sheet's own alpha content the same way as the walk cycle, since the actual
 * figure only fills a small band within each cell rather than the cell's
 * full nominal height.
 */
const IDLE_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 34, y: 57, w: 73, h: 107 },
  { x: 149, y: 63, w: 76, h: 101 },
  { x: 265, y: 62, w: 78, h: 102 },
  { x: 395, y: 59, w: 76, h: 105 },
  { x: 29, y: 213, w: 76, h: 107 },
  { x: 151, y: 213, w: 76, h: 108 },
  { x: 277, y: 213, w: 82, h: 107 },
  { x: 402, y: 213, w: 80, h: 107 },
];
let idleSprite: HTMLImageElement | null = null;

function getIdleSprite(): HTMLImageElement | null {
  if (!idleSprite) {
    if (typeof Image === "undefined") return null;
    idleSprite = new Image();
    idleSprite.src = "/art/paragon/idle-animation-removebg-preview.png";
  }
  return idleSprite.complete && idleSprite.naturalWidth > 0 ? idleSprite : null;
}

/**
 * Paragon's jump arc: 8 poses on a 4x2 sheet, following the actual
 * trajectory shape (crouch/launch with a ground splash, rising, apex,
 * floating, falling, landing splash, recovering crouch, ready stance).
 * Drawn at the same fixed height as every other cycle — natural bounds are
 * for cropping only.
 */
const JUMP_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 41, y: 83, w: 69, h: 95 },
  { x: 149, y: 59, w: 81, h: 127 },
  { x: 285, y: 37, w: 62, h: 140 },
  { x: 401, y: 37, w: 70, h: 98 },
  { x: 32, y: 251, w: 73, h: 122 },
  { x: 146, y: 341, w: 89, h: 110 },
  { x: 275, y: 352, w: 69, h: 96 },
  { x: 393, y: 352, w: 70, h: 96 },
];
let jumpSprite: HTMLImageElement | null = null;

function getJumpSprite(): HTMLImageElement | null {
  if (!jumpSprite) {
    if (typeof Image === "undefined") return null;
    jumpSprite = new Image();
    jumpSprite.src = "/art/paragon/jump.webp";
  }
  return jumpSprite.complete && jumpSprite.naturalWidth > 0 ? jumpSprite : null;
}

/**
 * Paragon's basic-attack jab: guard, wind-up, impact burst, follow-through,
 * then a second full swing — 8 frames on a 4x2 sheet. Natural bounds for
 * cropping, fixed height for drawing.
 */
const PUNCH_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 34, y: 57, w: 73, h: 107 },
  { x: 149, y: 63, w: 96, h: 101 },
  { x: 265, y: 54, w: 129, h: 110 },
  { x: 394, y: 59, w: 104, h: 105 },
  { x: 29, y: 214, w: 93, h: 106 },
  { x: 151, y: 214, w: 76, h: 107 },
  { x: 277, y: 214, w: 82, h: 106 },
  { x: 402, y: 213, w: 80, h: 107 },
];
let punchSprite: HTMLImageElement | null = null;

function getPunchSprite(): HTMLImageElement | null {
  if (!punchSprite) {
    if (typeof Image === "undefined") return null;
    punchSprite = new Image();
    punchSprite.src = "/art/paragon/punch.webp";
  }
  return punchSprite.complete && punchSprite.naturalWidth > 0 ? punchSprite : null;
}

/**
 * Paragon's Titan Slam: now a Kamehameha-style beam — charge, charge, fire,
 * full beam, then the recovery stance. 6 frames on a 3x2 sheet. Natural
 * bounds for cropping, fixed height for drawing — this sheet's crop-height
 * range is wide (84–125px) since some frames include the beam effect, so
 * scaling by that range made him visibly shrink between poses. Boosted by
 * TITAN_SLAM_SCALE_BOOST since, like Detonate, this is a signature ultimate
 * that should read as bigger than his normal body height.
 */
const TITAN_SLAM_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 33, y: 89, w: 71, h: 94 },
  { x: 146, y: 98, w: 83, h: 84 },
  { x: 252, y: 80, w: 248, h: 102 },
  { x: 7, y: 310, w: 241, h: 125 },
  { x: 279, y: 337, w: 84, h: 97 },
  { x: 406, y: 327, w: 55, h: 109 },
];
const TITAN_SLAM_SCALE_BOOST = 1.18;
let titanSlamSprite: HTMLImageElement | null = null;

function getTitanSlamSprite(): HTMLImageElement | null {
  if (!titanSlamSprite) {
    if (typeof Image === "undefined") return null;
    titanSlamSprite = new Image();
    titanSlamSprite.src = "/art/paragon/heavy-strike.webp";
  }
  return titanSlamSprite.complete && titanSlamSprite.naturalWidth > 0 ? titanSlamSprite : null;
}

/**
 * Paragon's ArmorBreak: chamber, knee-raise, spark-tipped kick, extended
 * kick, a huge crescent-slash impact, then 4 recovery frames — 9 frames on
 * a 3-row sheet (3+2+4). Natural bounds for cropping, fixed height for
 * drawing.
 */
const ARMORBREAK_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 42, y: 80, w: 70, h: 90 },
  { x: 174, y: 65, w: 74, h: 105 },
  { x: 299, y: 58, w: 125, h: 112 },
  { x: 55, y: 208, w: 127, h: 105 },
  { x: 276, y: 178, w: 153, h: 139 },
  { x: 30, y: 351, w: 66, h: 97 },
  { x: 155, y: 349, w: 68, h: 99 },
  { x: 276, y: 344, w: 68, h: 104 },
  { x: 394, y: 352, w: 73, h: 96 },
];
let armorbreakSprite: HTMLImageElement | null = null;

function getArmorbreakSprite(): HTMLImageElement | null {
  if (!armorbreakSprite) {
    if (typeof Image === "undefined") return null;
    armorbreakSprite = new Image();
    armorbreakSprite.src = "/art/paragon/kick.webp";
  }
  return armorbreakSprite.complete && armorbreakSprite.naturalWidth > 0 ? armorbreakSprite : null;
}

/**
 * Paragon's heavy attack (RMB): chamber, rising knee, kick with a spark at
 * the boot, impact burst, follow-through — 8 frames on a 4x2 sheet. Natural
 * bounds for cropping, fixed height for drawing.
 */
const HIGH_KICK_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 42, y: 82, w: 66, h: 96 },
  { x: 157, y: 65, w: 61, h: 114 },
  { x: 258, y: 67, w: 100, h: 110 },
  { x: 377, y: 56, w: 112, h: 122 },
  { x: 22, y: 338, w: 105, h: 110 },
  { x: 155, y: 338, w: 69, h: 110 },
  { x: 275, y: 350, w: 73, h: 98 },
  { x: 394, y: 352, w: 73, h: 96 },
];
let highKickSprite: HTMLImageElement | null = null;

function getHighKickSprite(): HTMLImageElement | null {
  if (!highKickSprite) {
    if (typeof Image === "undefined") return null;
    highKickSprite = new Image();
    highKickSprite.src = "/art/paragon/high-kick.webp";
  }
  return highKickSprite.complete && highKickSprite.naturalWidth > 0 ? highKickSprite : null;
}

/**
 * Paragon's Reflect: raising the kinetic-shield stance — 8 frames on a 4x2
 * sheet. Natural bounds for cropping, fixed height for drawing.
 */
const BLOCK_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 42, y: 82, w: 66, h: 95 },
  { x: 171, y: 78, w: 57, h: 100 },
  { x: 279, y: 76, w: 72, h: 102 },
  { x: 387, y: 76, w: 80, h: 102 },
  { x: 30, y: 335, w: 83, h: 112 },
  { x: 155, y: 336, w: 83, h: 111 },
  { x: 276, y: 344, w: 69, h: 105 },
  { x: 394, y: 352, w: 73, h: 97 },
];
let blockSprite: HTMLImageElement | null = null;

function getBlockSprite(): HTMLImageElement | null {
  if (!blockSprite) {
    if (typeof Image === "undefined") return null;
    blockSprite = new Image();
    blockSprite.src = "/art/paragon/block.webp";
  }
  return blockSprite.complete && blockSprite.naturalWidth > 0 ? blockSprite : null;
}

/**
 * Paragon's light-hit reaction: ready, flinch, stumble, recover, settle —
 * 8 frames on a 4x2 sheet. Natural bounds for cropping, fixed height for
 * drawing. Plays over HITSTUN_SINGLE, the same brief window the engine
 * itself uses for a single hit's hitstun.
 */
const GOT_HIT_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 41, y: 79, w: 71, h: 91 },
  { x: 150, y: 45, w: 87, h: 125 },
  { x: 280, y: 71, w: 83, h: 99 },
  { x: 391, y: 67, w: 70, h: 103 },
  { x: 30, y: 356, w: 81, h: 92 },
  { x: 155, y: 348, w: 69, h: 100 },
  { x: 275, y: 343, w: 70, h: 107 },
  { x: 394, y: 352, w: 73, h: 97 },
];
let gotHitSprite: HTMLImageElement | null = null;

function getGotHitSprite(): HTMLImageElement | null {
  if (!gotHitSprite) {
    if (typeof Image === "undefined") return null;
    gotHitSprite = new Image();
    gotHitSprite.src = "/art/paragon/source/paragon-got-hit-removebg-preview.png";
  }
  return gotHitSprite.complete && gotHitSprite.naturalWidth > 0 ? gotHitSprite : null;
}

/**
 * Paragon's heavy-hit knockdown: standing, launched backward, crashing down
 * in a burst of dust, sliding, then lying stunned on the ground — 6 frames.
 * Natural per-frame bounds, scaled off GROUND_HIT_REFERENCE_H (the standing
 * first frame, conveniently also the tallest) — this is what makes the
 * lying frames read as genuinely flat instead of stretched tall.
 */
const GROUND_HIT_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 41, y: 79, w: 68, h: 91 },
  { x: 354, y: 77, w: 107, h: 58 },
  { x: 46, y: 229, w: 121, h: 87 },
  { x: 264, y: 263, w: 200, h: 55 },
  { x: 113, y: 412, w: 138, h: 39 },
  { x: 333, y: 410, w: 138, h: 41 },
];
const GROUND_HIT_REFERENCE_H = Math.max(...GROUND_HIT_FRAMES.map((f) => f.h));
let groundHitSprite: HTMLImageElement | null = null;

function getGroundHitSprite(): HTMLImageElement | null {
  if (!groundHitSprite) {
    if (typeof Image === "undefined") return null;
    groundHitSprite = new Image();
    groundHitSprite.src = "/art/paragon/source/paragon-hits-the-ground-removebg-preview.png";
  }
  return groundHitSprite.complete && groundHitSprite.naturalWidth > 0 ? groundHitSprite : null;
}

/**
 * Paragon's Detonate: crouching charge-up building through a full aura,
 * into a released burst, the actual explosion, and a smoking recovery — 8
 * frames on a 4x2 sheet. Like the RMB high kick, this sheet wasn't a clean
 * hand-aligned strip: the source came with an opaque grey/white
 * transparency-preview checkerboard baked into every pixel instead of a
 * real alpha channel, so every frame rect here was recovered by masking
 * out that exact checkerboard's two grey bands and despeckling the
 * leftover noise (connected-component filtering).
 *
 * Each frame keeps its own natural tight alpha bounds (including the
 * flame/aura effects, which is why the heights genuinely differ frame to
 * frame — 178 for a bare charge-up vs 290 for the full explosion) purely
 * for cropping; drawn at a fixed height like every other cycle, boosted by
 * DETONATE_SCALE_BOOST since this is the game's biggest, most dramatic
 * skill and should read as noticeably larger than his normal body height.
 */
const DETONATE_FRAMES: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 71, y: 119, w: 147, h: 215 },
  { x: 306, y: 156, w: 151, h: 178 },
  { x: 544, y: 130, w: 170, h: 204 },
  { x: 791, y: 82, w: 192, h: 252 },
  { x: 15, y: 425, w: 216, h: 229 },
  { x: 258, y: 364, w: 300, h: 290 },
  { x: 561, y: 402, w: 181, h: 252 },
  { x: 814, y: 438, w: 171, h: 216 },
];
const DETONATE_SCALE_BOOST = 1.08;
let detonateSprite: HTMLImageElement | null = null;

function getDetonateSprite(): HTMLImageElement | null {
  if (!detonateSprite) {
    if (typeof Image === "undefined") return null;
    detonateSprite = new Image();
    detonateSprite.src = "/art/paragon/detonation.webp";
  }
  return detonateSprite.complete && detonateSprite.naturalWidth > 0 ? detonateSprite : null;
}

interface ActionSprite {
  img: HTMLImageElement;
  frame: { x: number; y: number; w: number; h: number };
  /** Scale this frame off its own natural size (calibrated against
   *  GROUND_HIT_REFERENCE_H) instead of the usual fixed on-screen height —
   *  only ground-hit/knockdown wants this, since it's the one cycle where
   *  the body is genuinely meant to compress from standing to lying flat. */
  naturalScale?: boolean;
  /** Extra multiplier on top of the usual fixed on-screen height, for
   *  skills that should read as visually larger than his normal body size. */
  scaleBoost?: number;
}

/** Was this fighter airborne last time we drew it — lets the landing-hold
 *  logic below detect the exact tick it touches down. */
const wasAirborne = new Map<string, boolean>();
/** Fighter id -> engine time the landing-hold pose expires. */
const landingHoldUntil = new Map<string, number>();
/** How long to keep showing the last jump frame after touchdown before the
 *  walk/idle sprite takes over — a beat to "stand up" instead of snapping
 *  straight from mid-fall into standing the instant onGround flips true. */
const LANDING_HOLD_DURATION = 0.16;

/**
 * Picks whichever special pose sheet applies to Paragon right now, in
 * priority order — hitstun and knockdown (both reactive, and mutually
 * exclusive with everything else since the engine clears `action` on
 * either) come first, then Detonate, Titan Slam, ArmorBreak, Reflect, the
 * jab and the RMB high kick all fully take over the body, so they win over
 * just being airborne. Everyone else (and Paragon doing nothing special)
 * falls through to the walk cycle or static portrait.
 */
function paragonActionSprite(f: Fighter, time: number): ActionSprite | null {
  if (f.classId !== "paragon") return null;
  const action = f.action;

  if (f.state === "knockdown") {
    const img = getGroundHitSprite();
    if (img) {
      const t = Math.min(0.999, Math.max(0, f.stateTime / KNOCKDOWN_DURATION));
      return {
        img,
        frame: GROUND_HIT_FRAMES[Math.floor(t * GROUND_HIT_FRAMES.length)],
        naturalScale: true,
      };
    }
  } else if (f.state === "hitstun") {
    const img = getGotHitSprite();
    if (img) {
      // f.stateTime isn't reset when hitstun starts (only knockdown resets
      // it) — f.hitstun itself is the reliable signal, counting down from
      // HITSTUN_SINGLE (or STUNLOCK_DURATION on a repeat hit) to 0, so its
      // inverse stands in for "how far through the reaction" instead.
      const t = Math.min(0.999, Math.max(0, 1 - f.hitstun / HITSTUN_SINGLE));
      return { img, frame: GOT_HIT_FRAMES[Math.floor(t * GOT_HIT_FRAMES.length)] };
    }
  } else if (action?.spec.id === "detonate") {
    const img = getDetonateSprite();
    if (img) {
      const t = Math.min(0.999, Math.max(0, action.elapsed / action.spec.castTime));
      return {
        img,
        frame: DETONATE_FRAMES[Math.floor(t * DETONATE_FRAMES.length)],
        scaleBoost: DETONATE_SCALE_BOOST,
      };
    }
  } else if (action?.spec.id === "titan-slam") {
    const img = getTitanSlamSprite();
    if (img) {
      const t = Math.min(0.999, Math.max(0, action.elapsed / action.spec.castTime));
      return {
        img,
        frame: TITAN_SLAM_FRAMES[Math.floor(t * TITAN_SLAM_FRAMES.length)],
        scaleBoost: TITAN_SLAM_SCALE_BOOST,
      };
    }
  } else if (action?.spec.id === "armorbreak") {
    const img = getArmorbreakSprite();
    if (img) {
      const t = Math.min(0.999, Math.max(0, action.elapsed / action.spec.castTime));
      return { img, frame: ARMORBREAK_FRAMES[Math.floor(t * ARMORBREAK_FRAMES.length)] };
    }
  } else if (f.state === "reflect") {
    // Reflect doesn't run through the action/cast-time system the other
    // skills use — it just flips state and counts reflectTimer down from
    // REFLECT_DURATION — so stateTime (reset to 0 on trigger) stands in for
    // "elapsed" here.
    const img = getBlockSprite();
    if (img) {
      const t = Math.min(0.999, Math.max(0, f.stateTime / REFLECT_DURATION));
      return { img, frame: BLOCK_FRAMES[Math.floor(t * BLOCK_FRAMES.length)] };
    }
  } else if (f.state === "attack" && action?.spec.kind === "lmb") {
    const img = getPunchSprite();
    if (img) {
      const t = Math.min(0.999, Math.max(0, action.elapsed / action.spec.castTime));
      return { img, frame: PUNCH_FRAMES[Math.floor(t * PUNCH_FRAMES.length)] };
    }
  } else if (f.state === "attack" && action?.spec.kind === "rmb") {
    const img = getHighKickSprite();
    if (img) {
      const t = Math.min(0.999, Math.max(0, action.elapsed / action.spec.castTime));
      return { img, frame: HIGH_KICK_FRAMES[Math.floor(t * HIGH_KICK_FRAMES.length)] };
    }
  } else if (f.state === "air") {
    wasAirborne.set(f.id, true);
    const img = getJumpSprite();
    if (img) {
      // Falling half is normalized against JUMP_VELOCITY rather than the much
      // larger MAX_FALL_SPEED — a same-height jump lands around vy===
      // JUMP_VELOCITY, which almost never reaches MAX_FALL_SPEED, so the old
      // span meant the fall animation was still stuck mid-descent at the
      // exact moment he actually hit the ground. This reaches the last frame
      // right around touchdown instead, so the fall itself reads as quicker.
      const span = JUMP_VELOCITY + JUMP_VELOCITY;
      const step = Math.round(((f.vy + JUMP_VELOCITY) / span) * (JUMP_FRAMES.length - 1));
      return { img, frame: JUMP_FRAMES[Math.max(0, Math.min(JUMP_FRAMES.length - 1, step))] };
    }
  } else {
    // Just touched down (or never jumped at all — the map lookups below are
    // no-ops either way). Hold the landing frame a beat longer instead of
    // cutting straight to the walk/idle sprite the instant onGround flips.
    if (wasAirborne.get(f.id)) landingHoldUntil.set(f.id, time + LANDING_HOLD_DURATION);
    wasAirborne.set(f.id, false);
    const holdUntil = landingHoldUntil.get(f.id);
    if (holdUntil !== undefined && time < holdUntil) {
      const img = getJumpSprite();
      if (img) return { img, frame: JUMP_FRAMES[JUMP_FRAMES.length - 1] };
    }
  }
  return null;
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

  const scale = currentPunchScale() * duelZoom(engine, fx.canvas.width / physicalPerArtPixel);
  fx.save();
  if (scale !== 1) {
    fx.translate(fx.canvas.width / 2, fx.canvas.height / 2);
    fx.scale(scale, scale);
    fx.translate(-fx.canvas.width / 2, -fx.canvas.height / 2);
  }

  const { camX, camY } = cameraArt(engine);
  const px2 = (v: number) => (Math.round(v / S) - camX) * physicalPerArtPixel;
  const py2 = (v: number) => (Math.round(v / S) - camY) * physicalPerArtPixel;

  const stage = (
    engine as ArenaEngine & {
      stage?: { id?: string; isTown?: boolean; npcX?: number; vendorX?: number; bankX?: number };
    }
  ).stage;
  // Emberhold's three shopkeepers all stand in for hand-painted reference
  // art now — same crisp overlay treatment as the playable classes, rather
  // than the chunky low-res pixel art every other town prop still gets.
  // Drawn before the fighter loop below so the player always draws on top
  // of them (walking "in front of" an NPC) instead of the NPC's own layer
  // pasting over the player when they overlap.
  if (stage?.isTown) {
    for (const [id, npcX] of [
      ["blacksmith", stage.npcX],
      ["vendor", stage.vendorX],
      ["storage", stage.bankX],
    ] as const) {
      if (npcX === undefined) continue;
      const sprite = getNpcSprite(id);
      if (!sprite) continue;
      const gy = engine.groundAtX(npcX);
      if (gy === null) continue;
      drawNpcSprite(fx, sprite, px2(npcX), py2(gy), physicalPerArtPixel);
    }
  }

  for (const f of engine.fighters) {
    if (f.state === "dead") continue;
    const mobSpriteImg =
      f.isMob && f.mobTypeId ? getMobSpriteImage(stage?.id, f.mobTypeId) : null;
    if (f.isMob && !mobSpriteImg) continue;

    // Paragon has real animations for jumping, jabbing and Detonate, plus
    // separate walk and sprint cycles. Everything else Paragon might be
    // doing (hitstun, knockdown, dash, dead, ...) falls back to the idle
    // sheet too — frozen on its first frame rather than looping — since the
    // old static portrait.webp no longer matches the new animation art.
    // Only non-Paragon classes (no idle sheet of their own yet) still use
    // the static reference portrait.
    // Mobs inherit `classId` from the player fighter they were spawned from
    // (see spawnMob's `base = this.fighters[0]` spread), so without this
    // guard a boss mid-attack (any state matching one of Paragon's own
    // action specs, or just "hitstun") would pick up Paragon's action-sprite
    // crop rect and apply it against the mob's own image — cropping it down
    // to whatever tiny region Paragon's sheet happens to have there.
    const actionSprite = f.isMob ? null : paragonActionSprite(f, engine.time);
    const sprinting = f.state === "sprint";
    const walking = f.state === "walk";
    const idling = f.state === "idle";
    const walkSpriteImg =
      !f.isMob && !actionSprite && f.classId === "paragon" && walking ? getWalkSprite() : null;
    const runSpriteImg =
      !f.isMob && !actionSprite && f.classId === "paragon" && sprinting ? getRunSprite() : null;
    const idleSpriteImg =
      !f.isMob && !actionSprite && !walkSpriteImg && !runSpriteImg && f.classId === "paragon"
        ? getIdleSprite()
        : null;
    // Sprite mobs are resolved first and short-circuit the portrait branch
    // entirely (also guarded above, but kept explicit here too).
    const img =
      mobSpriteImg ??
      actionSprite?.img ?? walkSpriteImg ?? runSpriteImg ?? idleSpriteImg ??
      (f.isMob ? null : getPortraitImage(f.classId));
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
    if (actionSprite) {
      sx = actionSprite.frame.x;
      sy = actionSprite.frame.y;
      sw = actionSprite.frame.w;
      sh = actionSprite.frame.h;
      const baseDrawH = hArt * physicalPerArtPixel * 1.28 * 0.736;
      // Ground-hit frames keep their own natural proportions (see
      // GROUND_HIT_FRAMES) instead of all sharing one fixed height, so the
      // lying-flat frames actually read as flat instead of stretched tall.
      // Every other sheet draws at one fixed height regardless of its own
      // crop tightness — scaling by natural crop height there just made him
      // shrink in whichever frame happened to be tightly cropped, which read
      // as him shrinking mid-animation rather than any real size change.
      drawH = actionSprite.naturalScale
        ? baseDrawH * (sh / GROUND_HIT_REFERENCE_H)
        : baseDrawH * (actionSprite.scaleBoost ?? 1);
    } else if (walkSpriteImg) {
      const step = Math.floor(engine.time * 9) % WALK_FRAMES.length;
      const frame = WALK_FRAMES[step];
      sx = frame.x;
      sy = frame.y;
      sw = frame.w;
      sh = frame.h;
      drawH = hArt * physicalPerArtPixel * 1.28 * 0.736;
    } else if (runSpriteImg) {
      const step = Math.floor(engine.time * 14) % RUN_FRAMES.length;
      const frame = RUN_FRAMES[step];
      sx = frame.x;
      sy = frame.y;
      sw = frame.w;
      sh = frame.h;
      drawH = hArt * physicalPerArtPixel * 1.28 * 0.736;
    } else if (idleSpriteImg) {
      // Slower cadence than walk/run — a calm breathing loop, not a stride.
      // Every other fallback state (hitstun, knockdown, dash, dead, ...)
      // freezes on the idle sheet's first frame instead of looping, since
      // those are reactive states rather than something to animate through.
      const step = idling ? Math.floor(engine.time * 6) % IDLE_FRAMES.length : 0;
      const frame = IDLE_FRAMES[step];
      sx = frame.x;
      sy = frame.y;
      sw = frame.w;
      sh = frame.h;
      drawH = hArt * physicalPerArtPixel * 1.28 * 0.736;
    } else if (mobSpriteImg) {
      // Trimmed tight to the creature like the walk/run/idle frames above,
      // so it gets the same tight-crop height formula rather than the
      // padded-portrait default.
      drawH = hArt * physicalPerArtPixel * 1.28 * 0.736;
    }
    drawH *= PORTRAIT_SCALE[f.classId] ?? 1;
    if (mobSpriteImg && f.mobTypeId) drawH *= MOB_SPRITE_SCALE[f.mobTypeId] ?? 1;
    const drawW = drawH * (sw / sh);

    // The static portraits carry blank space below the feet (see
    // PORTRAIT_CONTENT_BOTTOM), which the walk-cycle frames don't have —
    // drawn at the same offset as the walk frames, that blank margin (not
    // the actual feet) would land on the ground, making Paragon appear to
    // stand higher when idle than when walking. Shifting the draw down by
    // that margin's share of the frame puts the real feet at yFeet either way.
    const marginBottomFrac =
      actionSprite || walkSpriteImg || runSpriteImg || idleSpriteImg || mobSpriteImg
        ? 0
        : (img.naturalHeight - (PORTRAIT_CONTENT_BOTTOM[f.classId] ?? img.naturalHeight)) /
          img.naturalHeight;
    const destTop = -drawH + marginBottomFrac * drawH;

    const knockdown = f.state === "knockdown";
    const flash = f.hitFlash > 0 && Math.floor(engine.time * 30) % 2 === 0;

    fx.save();
    fx.translate(x, yFeet);
    // Paragon's own ground-hit sprite (see GROUND_HIT_FRAMES) already draws
    // him crashing down and lying flat frame by frame — rotating that art on
    // top would double up on the fall. Only the generic static-portrait
    // fallback (classes without dedicated knockdown art) still needs the
    // rotate hack to fake "lying down" out of a standing portrait.
    if (knockdown && !actionSprite) fx.rotate((f.facing === 1 ? 1 : -1) * (Math.PI / 2.1));
    if (f.facing === -1) fx.scale(-1, 1);
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = "high";
    fx.drawImage(img, sx, sy, sw, sh, -drawW / 2, destTop, drawW, drawH);
    if (flash) {
      fx.globalCompositeOperation = "source-atop";
      fx.fillStyle = "#ffffff";
      fx.fillRect(-drawW / 2, destTop, drawW, drawH);
      fx.globalCompositeOperation = "source-over";
    }
    fx.restore();
  }

  fx.restore();
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
  const scale = currentPunchScale() * duelZoom(engine, vw);

  b.save();
  if (scale !== 1) {
    b.translate(vw / 2, vh / 2);
    b.scale(scale, scale);
    b.translate(-vw / 2, -vh / 2);
  }

  // Camera in art-pixel space, snapped so the world never sub-pixel jitters.
  const { camX, camY } = cameraArt(engine);
  /** World units -> art pixels. */
  const wx = (v: number) => Math.round(v / S) - camX;
  const wy = (v: number) => Math.round(v / S) - camY;

  trackStateSounds(engine);

  const biome = (engine as ArenaEngine & { stage?: { biome?: string } }).stage?.biome ?? "keep";
  const stageId = (engine as ArenaEngine & { stage?: { id?: string } }).stage?.id;
  const groundWy = wy(engine.map.ground[0]?.y ?? 560);
  drawSky(b, vw, vh, camX, camY, biome, groundWy);
  drawTerrain(b, engine, wx, wy, vw, vh, biome);

  for (const bh of engine.blackHoles) {
    drawBlackHole(b, wx(bh.x), wy(bh.y), bh.radius / S, bh.life / bh.maxLife, engine.time);
  }
  drawVillageProps(b, engine, wx, wy, engine.time);
  drawTownDecor(b, engine, wx, wy, engine.time);
  drawBlacksmith(b, engine, wx, wy, engine.time);
  drawVendor(b, engine, wx, wy, engine.time);
  drawBank(b, engine, wx, wy, engine.time);
  drawLootDrops(b, engine, wx, wy, vw, vh);
  for (const f of engine.fighters) {
    // Every fighter still ticks off-screen (Survival waves, big maps), but
    // there's no reason to pay for its gradients/glyphs/nameplate/flourish
    // when it's nowhere near the viewport this frame.
    if (onScreen(wx(f.x), wy(f.y), vw, vh, 100)) {
      drawFighter(b, f, wx, wy, engine.time, stageId);
    }
  }
  drawHitboxes(b, engine, wx, wy, vw, vh);
  for (const p of engine.projectiles) {
    const pjx = wx(p.x);
    const pjy = wy(p.y);
    if (onScreen(pjx, pjy, vw, vh)) drawProjectile(b, pjx, pjy, p.w / S, p.color);
  }
  drawParticles(b, engine, wx, wy, vw, vh);
  drawTexts(b, engine, wx, wy, vw, vh);
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
  /**
   * Ground body colors below the cap — default to the universal cool
   * blue-slate PAL.rock* set (dungeon/keep stonework). Town overrides these
   * with warm browns continuing the cap's own hue instead of jumping to
   * blue-grey a few pixels down, so the square doesn't look like it's built
   * from Undercity masonry.
   */
  groundTop?: string;
  groundLit?: string;
  groundBody?: string;
  groundDark?: string;
  groundDeep?: string;
}> = {
  town: {
    sky: ["#2c2340", "#6b4560", "#d98a52"], far: "#4a3a56", near: "#2a2034",
    accent: "#f6b352", stars: false, cap: "#6b5336", capLit: "#8f7047",
    groundTop: "#7a6248", groundLit: "#9c8060",
    groundBody: "#4a3b2e", groundDark: "#332822", groundDeep: "#231a15",
  },
  outskirts: {
    sky: ["#16213c", "#22314f", "#33405a"], far: "#1e3a34", near: "#162a26",
    accent: "#5f9e63", stars: true, cap: "#4a7a52", capLit: "#63a065",
    // Sampled off the forest backdrop's mossy log path, so the procedural
    // ground reads as the same undergrowth instead of the default blue-slate
    // dungeon rock every other biome falls back to.
    groundTop: "#3f5a34", groundLit: "#5a7a45",
    groundBody: "#3a2c1e", groundDark: "#241a12", groundDeep: "#120c08",
  },
  undercity: {
    sky: ["#0d0f1c", "#141a2c", "#1b2036"], far: "#1a1f38", near: "#12162a",
    accent: "#7c5cc4", stars: false, cap: "#3a4a55", capLit: "#526b74",
    // Sampled off the back-alley backdrop's cobblestone street, so the
    // procedural ground reads as the same stone instead of the default
    // blue-slate dungeon rock every other biome falls back to.
    groundTop: "#3a3540", groundLit: "#524a5c",
    groundBody: "#242030", groundDark: "#16131c", groundDeep: "#0c0a10",
  },
  keep: {
    sky: ["#2a1220", "#43182a", "#5c2130"], far: "#331526", near: "#20101c",
    accent: "#e05a3c", stars: false, cap: "#8c2413", capLit: "#ee6b1b",
    // Sampled straight off the Hölle backdrop's cracked-lava floor, so the
    // procedural ground reads as the same crust instead of the default
    // blue-slate dungeon rock every other biome falls back to.
    groundTop: "#8c2413", groundLit: "#ee6b1b",
    groundBody: "#5c1612", groundDark: "#371013", groundDeep: "#15070e",
  },
  abyss: {
    sky: ["#0a0616", "#180a2e", "#241040"], far: "#1c0e38", near: "#120a24",
    accent: "#c4b5fd", stars: true, cap: "#2e1a4a", capLit: "#5b3a8f",
    // Sampled off the floating-cathedral backdrop's crystalline floor, so
    // the procedural ground reads as the same crystal instead of the
    // default blue-slate dungeon rock every other biome falls back to.
    groundTop: "#123f5e", groundLit: "#2e7692",
    groundBody: "#0c2e42", groundDark: "#081a2b", groundDeep: "#040c1a",
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
  void: {
    sky: ["#050310", "#0e0620", "#1a0e34"], far: "#150a2a", near: "#0c0518",
    accent: "#c4b5fd", stars: true, cap: "#1c1030", capLit: "#3a2360",
  },
};

/**
 * Vertical parallax reference. The backdrop is anchored around this camera
 * height so distant layers drift with the world instead of being welded to the
 * screen — otherwise jumping makes the scenery appear to slide upward.
 */
const CAM_REF_Y = 120;

/** Emberhold's painted street backdrop — real art, seamless left-to-right,
 *  replacing the procedural sun/hills/skyline/lanterns for the town biome
 *  only (see the early return in drawSky). */
let townBgImage: HTMLImageElement | null = null;
function getTownBgImage(): HTMLImageElement | null {
  if (!townBgImage) {
    if (typeof Image === "undefined") return null;
    townBgImage = new Image();
    townBgImage.src = "/art/town.png";
  }
  return townBgImage.complete && townBgImage.naturalWidth > 0 ? townBgImage : null;
}
/** Fraction down the source image where the street/sidewalk curb sits —
 *  measured directly off the art — so the painted ground lines up with the
 *  game's actual ground plane instead of characters floating over it. */
const TOWN_BG_GROUND_FRAC = 0.846;

/** Warden's Keep's painted lava-cave backdrop — same real-art replacement
 *  as the town street, for the "keep" biome only (see the early return in
 *  drawSky). Pre-cropped from the source hand-off art to strip its baked-in
 *  "HÖLLE — 1500 AD" title/caption bars top and bottom. */
let keepBgImage: HTMLImageElement | null = null;
function getKeepBgImage(): HTMLImageElement | null {
  if (!keepBgImage) {
    if (typeof Image === "undefined") return null;
    keepBgImage = new Image();
    keepBgImage.src = "/art/keep-bg.png";
  }
  return keepBgImage.complete && keepBgImage.naturalWidth > 0 ? keepBgImage : null;
}
/** Fraction down the source image where the flat cracked-lava floor sits —
 *  measured directly off the art, same idea as TOWN_BG_GROUND_FRAC. */
const KEEP_BG_GROUND_FRAC = 0.87;

/** The Outskirts' painted forest backdrop — same real-art replacement as
 *  the town street and Warden's Keep cave, for the "outskirts" biome only
 *  (see the early return in drawSky). No cropping needed: unlike the Keep's
 *  hand-off art, this one came without baked-in title/caption bars. */
let outskirtsBgImage: HTMLImageElement | null = null;
function getOutskirtsBgImage(): HTMLImageElement | null {
  if (!outskirtsBgImage) {
    if (typeof Image === "undefined") return null;
    outskirtsBgImage = new Image();
    outskirtsBgImage.src = "/art/the-outskirt/forest-background.png";
  }
  return outskirtsBgImage.complete && outskirtsBgImage.naturalWidth > 0 ? outskirtsBgImage : null;
}
/** Fraction down the source image where the top of the mossy log path sits —
 *  measured directly off the art, same idea as TOWN_BG_GROUND_FRAC. */
const OUTSKIRTS_BG_GROUND_FRAC = 0.78;

/** The Undercity's painted back-alley backdrop — same real-art replacement
 *  as the other hand-painted stages, for the "undercity" biome only (see the
 *  early return in drawSky). No cropping needed. */
let undercityBgImage: HTMLImageElement | null = null;
function getUndercityBgImage(): HTMLImageElement | null {
  if (!undercityBgImage) {
    if (typeof Image === "undefined") return null;
    undercityBgImage = new Image();
    undercityBgImage.src = "/art/undercity/undercity-background.png";
  }
  return undercityBgImage.complete && undercityBgImage.naturalWidth > 0 ? undercityBgImage : null;
}
/** Fraction down the source image where the cobblestone street sits —
 *  measured directly off the art, same idea as TOWN_BG_GROUND_FRAC. */
const UNDERCITY_BG_GROUND_FRAC = 0.82;

/** The Abyssal Sanctum's painted floating-cathedral backdrop — same real-art
 *  replacement as the other hand-painted stages, for the "abyss" biome only
 *  (see the early return in drawSky). No cropping needed. */
let sanctumBgImage: HTMLImageElement | null = null;
function getSanctumBgImage(): HTMLImageElement | null {
  if (!sanctumBgImage) {
    if (typeof Image === "undefined") return null;
    sanctumBgImage = new Image();
    sanctumBgImage.src = "/art/abyssal-sanctum/abyssal-sanctum-background.png";
  }
  return sanctumBgImage.complete && sanctumBgImage.naturalWidth > 0 ? sanctumBgImage : null;
}
/** Fraction down the source image where the crystalline floor sits —
 *  measured directly off the art, same idea as TOWN_BG_GROUND_FRAC. */
const SANCTUM_BG_GROUND_FRAC = 0.78;

function drawSky(
  b: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  camX: number,
  camY: number,
  biomeId: string,
  groundWy: number
) {
  if (biomeId === "town") {
    const img = getTownBgImage();
    if (img) {
      // Flat sky fill first — the buildings are drawn at half their naive
      // fit size (see scale below), so there's real sky above the rooftops
      // to fill rather than leaving the top of the screen blank.
      px(b, 0, 0, vw, vh, BIOMES.town.sky[0]);
      const scale = (vh * 0.6) / img.naturalHeight;
      const scaledW = img.naturalWidth * scale;
      const scaledH = img.naturalHeight * scale;
      const drawY = Math.round(groundWy - TOWN_BG_GROUND_FRAC * scaledH);
      const shift = Math.round(camX * 0.35);
      const off = -shift % scaledW;
      for (let x = off - scaledW; x < vw + scaledW; x += scaledW) {
        b.drawImage(img, Math.round(x), drawY, Math.ceil(scaledW) + 1, Math.ceil(scaledH));
      }
      return;
    }
  }

  if (biomeId === "keep") {
    const img = getKeepBgImage();
    if (img) {
      // Unlike the town street (a low skyline with open sky above), this
      // cave scene fills the whole vertical frame floor-to-ceiling, so it's
      // scaled to slightly overshoot viewport height rather than a fraction
      // of it — no separate sky fill needed underneath.
      const scale = (vh * 1.05) / img.naturalHeight;
      const scaledW = img.naturalWidth * scale;
      const scaledH = img.naturalHeight * scale;
      const drawY = Math.round(groundWy - KEEP_BG_GROUND_FRAC * scaledH);
      const shift = Math.round(camX * 0.35);
      const off = -shift % scaledW;
      for (let x = off - scaledW; x < vw + scaledW; x += scaledW) {
        b.drawImage(img, Math.round(x), drawY, Math.ceil(scaledW) + 1, Math.ceil(scaledH));
      }
      return;
    }
  }

  if (biomeId === "outskirts") {
    const img = getOutskirtsBgImage();
    if (img) {
      // Same floor-to-ceiling treatment as the Keep's cave — the forest
      // canopy fills the whole frame top to bottom, no open sky underneath.
      const scale = (vh * 1.05) / img.naturalHeight;
      const scaledW = img.naturalWidth * scale;
      const scaledH = img.naturalHeight * scale;
      const drawY = Math.round(groundWy - OUTSKIRTS_BG_GROUND_FRAC * scaledH);
      const shift = Math.round(camX * 0.35);
      const off = -shift % scaledW;
      for (let x = off - scaledW; x < vw + scaledW; x += scaledW) {
        b.drawImage(img, Math.round(x), drawY, Math.ceil(scaledW) + 1, Math.ceil(scaledH));
      }
      return;
    }
  }

  if (biomeId === "undercity") {
    const img = getUndercityBgImage();
    if (img) {
      // Same floor-to-ceiling treatment as the Keep's cave and the
      // Outskirts' canopy — the back-alley buildings fill the whole frame
      // top to bottom, no open sky underneath.
      const scale = (vh * 1.05) / img.naturalHeight;
      const scaledW = img.naturalWidth * scale;
      const scaledH = img.naturalHeight * scale;
      const drawY = Math.round(groundWy - UNDERCITY_BG_GROUND_FRAC * scaledH);
      const shift = Math.round(camX * 0.35);
      const off = -shift % scaledW;
      for (let x = off - scaledW; x < vw + scaledW; x += scaledW) {
        b.drawImage(img, Math.round(x), drawY, Math.ceil(scaledW) + 1, Math.ceil(scaledH));
      }
      return;
    }
  }

  if (biomeId === "abyss") {
    const img = getSanctumBgImage();
    if (img) {
      // Same floor-to-ceiling treatment as the other hand-painted stages —
      // the floating cathedral and starfield fill the whole frame top to
      // bottom, no open sky underneath.
      const scale = (vh * 1.05) / img.naturalHeight;
      const scaledW = img.naturalWidth * scale;
      const scaledH = img.naturalHeight * scale;
      const drawY = Math.round(groundWy - SANCTUM_BG_GROUND_FRAC * scaledH);
      const shift = Math.round(camX * 0.35);
      const off = -shift % scaledW;
      for (let x = off - scaledW; x < vw + scaledW; x += scaledW) {
        b.drawImage(img, Math.round(x), drawY, Math.ceil(scaledW) + 1, Math.ceil(scaledH));
      }
      return;
    }
  }

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

  if (biomeId === "town") {
    // Emberhold at dusk: a low warm sun sinking behind the rooftops, a
    // handful of early stars up top, and a couple of birds drifting home.
    const sunY = groundWy - Math.round(vh * 0.42);
    const sunX = Math.round(vw * 0.72 - camX * 0.06);
    pxGlow(b, sunX, sunY, 22, "#ffcf7a", 0.55);
    pxCircle(b, sunX, sunY, 11, "#ffdd9c");
    pxCircle(b, sunX, sunY, 8, "#fff2cf");
    b.fillStyle = "#e9d9f0";
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 131) % 400) - ((camX * 0.1) % 400);
      const sy = ((i * 47) % Math.round(vh * 0.22)) + vshift(0.1);
      const x = ((sx % vw) + vw) % vw;
      b.globalAlpha = 0.5 + 0.4 * Math.sin(i * 2.3 + Date.now() * 0.0012);
      b.fillRect(Math.round(x), Math.round(sy), 1, 1);
    }
    b.globalAlpha = 1;
    // Distant hills, warmer and softer than the house skyline in front of them.
    const hillGap = 180;
    const hillShift = Math.round(camX * 0.12);
    const hoff = -hillShift % hillGap;
    for (let x = hoff - hillGap; x < vw + hillGap; x += hillGap) {
      // Seeded from the hill's stable world index (see the `n` comment in
      // skyline() below) so its height doesn't reroll every frame as the
      // camera scrolls — that was reading as the hills bobbing up and down.
      const hn = Math.round((x + hillShift) / hillGap);
      const peak = Math.round(vh * 0.2) + vshift(0.12) - (Math.abs(hn * 37) % 30);
      const base = vh + 60;
      for (let t = 0; t <= 10; t++) {
        const yy = peak + (t * (base - peak)) / 10;
        const wdt = hillGap * 1.1 * (0.1 + t / 10);
        px(b, x + hillGap / 2 - wdt / 2, yy, wdt, (base - peak) / 10 + 1, "#5a4560");
      }
    }
    // Birds: simple drifting "v" shapes, high and slow.
    b.strokeStyle = "#2a2034";
    b.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const bx = ((i * 260 + Date.now() * 0.02 - camX * 0.15) % (vw + 200)) - 100;
      const by = Math.round(vh * (0.14 + i * 0.05)) + vshift(0.15);
      const flap = Math.sin(Date.now() * 0.006 + i) * 2;
      b.beginPath();
      b.moveTo(bx - 4, by + flap);
      b.lineTo(bx, by - 2);
      b.lineTo(bx + 4, by + flap);
      b.stroke();
    }
  }
  if (B.stars) {
    b.fillStyle = "#5b6396";
    for (let i = 0; i < 70; i++) {
      const sx = ((i * 97) % 400) - ((camX * 0.1) % 400);
      const sy = ((i * 53) % Math.round(vh * 0.4)) + vshift(0.1);
      const x = ((sx % vw) + vw) % vw;
      b.fillRect(Math.round(x), Math.round(sy), 1, 1);
    }
  }
  if (biomeId !== "town" && biomeId !== "undercity") {
    drawCelestialBody(b, vw, vh, vshift, biomeId, B.sky[0]);
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
    const shift = Math.round(camX * speed);
    const off = -shift % gap;
    const top = baseTop + vshift(speed);
    // Layers are drawn to well past the bottom edge so a rising camera never
    // exposes their base.
    const bottom = vh + 200;
    for (let x = off - gap; x < vw + gap; x += gap) {
      // A per-building index derived from world position rather than screen
      // position: `x` drifts by a pixel every frame while walking, so any
      // shape variation seeded from `x` directly would reroll continuously
      // and make roofs/spires visibly jitter up and down as the camera
      // scrolls. `n` only advances when a building actually leaves the
      // screen, so the same building keeps the same silhouette forever.
      const n = Math.round((x + shift) / gap);
      if (kind === "trees") {
        // Conifer silhouettes.
        px(b, x + 5, top + 8, 2, bottom - top, colour);
        for (let t = 0; t < 5; t++) {
          const wdt = 4 + t * 2;
          px(b, x + 6 - wdt / 2, top + t * 4, wdt, 4, colour);
        }
      } else if (kind === "houses") {
        // Timber-framed cottages with pitched, tiled roofs and warm lit
        // windows, staggered in height so the row reads as a real street.
        const wdt = 26;
        const jitter = Math.abs(n * 37) % 14;
        const hy = top + jitter;
        const roofTone = Math.abs(n) % 2 === 0 ? "#7a3b2e" : "#5c4530";
        px(b, x, hy, wdt, bottom - hy, colour);
        // A short timber gable cross just under the roofline — a Tudor-
        // cottage accent, kept small so it doesn't read as a lamp post.
        px(b, x + wdt / 2 - 1, hy + 6, 2, 9, "#181420");
        px(b, x + 4, hy + 10, wdt - 8, 2, "#181420");
        // Pitched, tiled roof — a stepped triangle in a warm tone distinct
        // from the wall so the skyline doesn't read as flat blocks.
        for (let r = 0; r < 7; r++) {
          px(b, x + r, hy - 7 + r, wdt - r * 2, 1, roofTone);
        }
        px(b, x + 1, hy - 1, wdt - 2, 1, "#2a2034");
        // Chimney with a thin curl of smoke, on alternating houses.
        if (Math.abs(n) % 2 === 0) {
          px(b, x + wdt - 6, hy - 13, 3, 7, "#3a2e26");
          for (let s = 0; s < 3; s++) {
            const sy = hy - 14 - s * 7 - Math.round(((Date.now() * 0.015 + n * 8) / 8) % 7);
            b.globalAlpha = 0.35 - s * 0.08;
            px(b, x + wdt - 5 + Math.round(Math.sin(s + n) * 2), sy, 2, 2, "#c9c2d4");
            b.globalAlpha = 1;
          }
        }
        // Warm lit windows, count varying slightly by house height.
        px(b, x + 5, hy + 6, 4, 4, BIOMES.town.accent);
        px(b, x + 16, hy + 6, 4, 4, BIOMES.town.accent);
        px(b, x + 5, hy + 15, 4, 4, BIOMES.town.accent);
        if (jitter > 6) px(b, x + 16, hy + 15, 4, 4, BIOMES.town.accent);
      } else if (kind === "arches") {
        // Sewer arches.
        px(b, x, top, 10, bottom - top, colour);
        px(b, x + 14, top, 10, bottom - top, colour);
        px(b, x, top, 24, 3, colour);
      } else if (kind === "spires") {
        // Jagged obsidian shards, jutting at a slight lean, each capped with
        // a faint glowing tip so the abyss reads as lit from within.
        const lean = (n % 2 === 0 ? 1 : -1) * 3;
        const peak = top - 10 - (Math.abs(n * 37) % 26);
        for (let t = 0; t <= 6; t++) {
          const yy = peak + t * ((bottom - peak) / 6);
          const wdt = 3 + t * 2;
          px(b, x - wdt / 2 + lean * (t / 6), yy, wdt, (bottom - peak) / 6 + 1, colour);
        }
        pxGlow(b, x + lean, peak + 2, 5, BIOMES.abyss.accent, 0.5);
      } else if (kind === "peaks") {
        // Snow-capped mountain silhouettes: a stepped triangle, white at the
        // tip and shading down into the biome colour toward the base.
        const peak = top - 6 - (Math.abs(n * 37) % 30);
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
        const jitter = Math.abs(n * 37) % 22;
        const hy = top + jitter;
        px(b, x, hy, wdt, bottom - hy, colour);
        px(b, x + 3, hy + 6, wdt - 6, 3, B.accent);
        pxGlow(b, x + wdt / 2, hy + 7, 6, B.accent, 0.55);
        for (let s = 0; s < 3; s++) {
          const sy = hy - 6 - s * 8 - Math.round(((Date.now() * 0.02 + n * 6) / 6) % 8);
          px(b, x + wdt / 2 - 1 + (s % 2), sy, 2, 2, "#2a1410");
        }
      } else if (kind === "ruins") {
        // Floating fortress rubble, drifting at different heights with a
        // jagged broken underside — reads as debris, not solid ground.
        const floatY = top + Math.round(Math.sin(n) * 14);
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
        const snapped = Math.abs(n) % 3 === 0;
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

  if (biomeId === "town") {
    // Strings of lanterns swagged between the near houses, glowing warm
    // against the dusk — the market-night touch a flat backdrop can't give.
    const nearGap = 52;
    const nearTop = Math.round(vh * 0.52) + vshift(0.5);
    const off = -Math.round(camX * 0.5) % nearGap;
    for (let x = off - nearGap; x < vw + nearGap; x += nearGap) {
      const sagTop = nearTop - 2;
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const lx = x + t * nearGap;
        const ly = sagTop + Math.sin(t * Math.PI) * 6;
        if (s > 0) b.strokeStyle = "#2a2034";
        if (s > 0) {
          const pt = (s - 1) / 6;
          const px0 = x + pt * nearGap;
          const py0 = sagTop + Math.sin(pt * Math.PI) * 6;
          b.beginPath();
          b.moveTo(px0, py0);
          b.lineTo(lx, ly);
          b.stroke();
        }
        if (s % 2 === 1) {
          const flicker = 0.5 + 0.5 * Math.sin(Date.now() * 0.004 + s + x);
          pxGlow(b, lx, ly + 2, 4, "#ffcf7a", 0.35 + flicker * 0.25);
          px(b, lx - 1, ly + 1, 2, 2, "#ffdd9c");
        }
      }
    }
  }
}

/**
 * A biome-appropriate sun/moon, fixed high in the sky (only drifting with
 * the camera's vertical parallax, like the plain moon this replaced). Town
 * gets its own dusk sun inline above; the undercity has no open sky to put
 * one in.
 */
function drawCelestialBody(
  b: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  vshift: (speed: number) => number,
  biomeId: string,
  skyTop: string
) {
  const y = Math.round(vh * 0.16) + vshift(0.1);
  const x = Math.round(vw * 0.78);
  switch (biomeId) {
    case "outskirts":
      // A calm, classic night-sky moon.
      pxGlow(b, x, y, 9, "#c9d6f0", 0.3);
      pxCircle(b, x, y, 7, "#c9d6f0");
      pxCircle(b, x + 2, y - 1, 5, skyTop);
      break;
    case "keep":
      // A dying ember of a moon, smoldering red against the firelit sky.
      pxGlow(b, x, y, 10, "#c2402a", 0.45);
      pxCircle(b, x, y, 7, "#7a2418");
      pxCircle(b, x, y, 5, "#c2402a");
      pxCircle(b, x + 2, y - 1, 3, skyTop);
      break;
    case "abyss":
      // A dark sun: an eclipse-black disc ringed in violet corona.
      pxGlow(b, x, y, 13, "#8b5cf6", 0.4);
      pxCircle(b, x, y, 8, "#c4b5fd");
      pxCircle(b, x, y, 6, "#0a0616");
      break;
    case "frost":
      // A pale, hard-edged winter moon with a faint icy halo ring.
      b.globalAlpha = 0.25;
      pxCircle(b, x, y, 12, "#ffffff");
      pxCircle(b, x, y, 11, skyTop);
      b.globalAlpha = 1;
      pxGlow(b, x, y, 13, "#dff3ff", 0.3);
      pxCircle(b, x, y, 7, "#eaf7ff");
      pxCircle(b, x + 2, y - 1, 5, skyTop);
      break;
    case "forge":
      // A furnace sun, hazed red-orange as if seen through rising smoke.
      pxGlow(b, x, y, 16, "#fb923c", 0.35);
      pxCircle(b, x, y, 9, "#fca85c");
      pxCircle(b, x, y, 6, "#fff0d9");
      break;
    case "storm":
      // A moon mostly swallowed by drifting storm cloud.
      pxGlow(b, x, y, 10, "#dbeafe", 0.25);
      pxCircle(b, x, y, 7, "#c7d9f0");
      pxCircle(b, x + 3, y + 4, 8, "#28405e");
      pxCircle(b, x - 4, y + 2, 6, "#28405e");
      break;
    case "blight":
      // A sickly yellow-green moon, poisoned along with everything else here.
      pxGlow(b, x, y, 11, "#a3e635", 0.3);
      pxCircle(b, x, y, 7, "#c8e06a");
      pxCircle(b, x + 2, y - 1, 5, skyTop);
      break;
    case "divine":
      // A radiant golden sun — the single brightest thing in the game.
      pxGlow(b, x, y, 20, "#fff2cf", 0.55);
      pxCircle(b, x, y, 11, "#ffe9a8");
      pxCircle(b, x, y, 7, "#fffbeb");
      break;
    case "void":
      // No sun, no moon — just a tear in the sky the same violet as
      // everything else out here, faintly pulsing.
      pxGlow(b, x, y, 15, "#c4b5fd", 0.35);
      pxCircle(b, x, y, 6, "#0e0620");
      pxCircle(b, x, y, 4, "#c4b5fd");
      break;
    default:
      break;
  }
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
  const groundTop = B.groundTop ?? PAL.rockTop;
  const groundLit = B.groundLit ?? PAL.rockLit;
  const groundBody = B.groundBody ?? PAL.rockBody;
  const groundDark = B.groundDark ?? PAL.rockDark;
  const groundDeep = B.groundDeep ?? PAL.rockDeep;

  // The pit between ground segments.
  for (let i = 0; i < map.ground.length - 1; i++) {
    const a = map.ground[i];
    const c = map.ground[i + 1];
    const x0 = wx(a.x + a.w);
    const x1 = wx(c.x);
    const y0 = wy(a.y);
    px(b, x0, y0, x1 - x0, vh - y0, PAL.void);
    pxDither(b, x0, y0, x1 - x0, 10, groundDeep);
  }

  for (const g of map.ground) {
    const x = wx(g.x);
    const y = wy(g.y);
    const w = Math.round(g.w / S);
    if (x > vw || x + w < 0) continue;

    px(b, x, y, w, vh - y, groundBody);
    px(b, x, y + 5, w, vh - y - 5, groundDark);
    // Ground segments now often span an entire (multi-thousand-pixel) map
    // rather than a short chunk, but the per-pixel texture work below only
    // ever shows up in the sliver actually on screen — clamping it to the
    // visible span (with a small margin) turns what used to be thousands of
    // wasted off-screen fillRect calls a frame into a few hundred at most.
    const visX0 = Math.max(x, -8);
    const visX1 = Math.min(x + w, vw + 8);
    pxDither(b, visX0, y + 4, visX1 - visX0, 6, groundBody);
    // Surface cap: grass, moss or scorched rock depending on the biome.
    px(b, x, y, w, 3, B.cap);
    px(b, x, y, w, 1, B.capLit);
    // Brick seams.
    for (let bx = visX0 - (visX0 % 8); bx < visX1; bx += 8) {
      px(b, bx, y + 3, 1, 7, groundDeep);
    }
    for (let by = y + 10; by < vh; by += 7) {
      px(b, x, by, w, 1, groundDeep);
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
    // A faint biome-coloured glow under each end — small enough not to read
    // as a light source, just enough to stop every platform in every biome
    // being the exact same grey slab. Ties the terrain's palette to the
    // same aura language the fighters and hazards already use.
    pxGlow(b, x + 2, y + 3, 5, B.accent, 0.18);
    pxGlow(b, x + w - 2, y + 3, 5, B.accent, 0.18);
  }

  // Environmental hazard patches — lava, spike pits, poison bogs.
  for (const hz of map.hazards) {
    const x = wx(hz.x);
    const y = wy(hz.y);
    const w = Math.round(hz.w / S);
    if (x > vw || x + w < 0) continue;
    const t = engine.time;
    if (hz.kind === "lava") {
      pxGlow(b, x + w / 2, y - 2, w * 0.35, "#f97316", 0.4);
      px(b, x, y - 3, w, 4, "#7c2d12");
      px(b, x, y - 2, w, 2, "#f97316");
      for (let i = 0; i < w; i += 5) {
        const flick = Math.sin(t * 4 + i) > 0.3;
        px(b, x + i, y - 3 - (flick ? 1 : 0), 2, 1, flick ? "#fde68a" : "#fb923c");
      }
    } else if (hz.kind === "spikes") {
      px(b, x, y - 2, w, 3, "#3f3f46");
      for (let i = 0; i < w; i += 6) {
        const h2 = 5 + (i % 12 === 0 ? 2 : 0);
        for (let s = 0; s < h2; s++) {
          px(b, x + i + Math.floor((h2 - s) / 2), y - 2 - s, Math.max(1, s < h2 - 1 ? 2 - Math.floor(s / 3) : 1), 1, "#cbd5e1");
        }
      }
    } else {
      px(b, x, y - 3, w, 4, "#3f6212");
      px(b, x, y - 2, w, 2, "#84cc16");
      for (let i = 0; i < w; i += 7) {
        const bub = (t * 1.3 + i * 0.3) % 3;
        if (bub < 1) px(b, x + i, y - 3 - bub * 2, 2, 2, "#bef264");
      }
    }
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

/**
 * Shared setup for the three town NPCs: resolves a screen position and a
 * gentle idle bob from a fixed stage-x anchor. Returns null wherever the
 * NPC doesn't apply (wrong stage, or standing over a gap).
 */
function npcAnchor(
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  npcX: number | undefined,
  time: number,
  bobPhase: number
): { x: number; y: number; bob: number } | null {
  if (npcX === undefined) return null;
  const gy = engine.groundAtX(npcX);
  if (gy === null) return null;
  return { x: wx(npcX), y: wy(gy), bob: Math.round(Math.sin(time * 2 + bobPhase) * 1) };
}

/** The "PRESS E" prompt shown above any town NPC once the player is close enough. */
function drawInteractPrompt(
  b: CanvasRenderingContext2D,
  near: boolean | undefined,
  x: number,
  y: number,
  bob: number,
  time: number
) {
  if (!near) return;
  const pulse = Math.sin(time * 6) > 0 ? "#ffffff" : "#f6b352";
  pxText(b, "PRESS E", x, y - 40 + bob, pulse, 5);
}

/**
 * The blacksmith's own body is real reference art drawn in the crisp fx
 * overlay (see the blacksmith block in renderFighterPortraits) — this pass
 * only contributes his forge, the ground shadow under him, and the "PRESS E"
 * prompt, the same division of labour the playable classes use.
 */
function drawBlacksmith(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number
) {
  const stage = (engine as ArenaEngine & {
    stage?: { isTown?: boolean; npcX?: number };
    nearBlacksmith?: boolean;
  }).stage;
  if (!stage?.isTown) return;
  const anchor = npcAnchor(engine, wx, wy, stage.npcX, time, 0);
  if (!anchor) return;
  const { x, y } = anchor;

  // Anvil in front of him.
  px(b, x - 7, y - 9, 14, 2, "#1c1f28");
  px(b, x - 5, y - 13, 10, 4, "#3a4050");
  px(b, x - 5, y - 13, 10, 1, "#6b7690");
  px(b, x - 9, y - 12, 4, 2, "#3a4050"); // tapered horn
  px(b, x + 5, y - 13, 2, 3, "#565f73");

  // Forge hearth behind him: stone housing, glowing coals, drifting embers.
  px(b, x + 12, y - 22, 15, 18, "#241a14");
  px(b, x + 12, y - 22, 15, 2, "#3a2a1e");
  px(b, x + 12, y - 6, 15, 2, "#160f0a");
  pxGlow(b, x + 19, y - 8, 9, "#f6742c", 0.55);
  px(b, x + 15, y - 8, 8, 3, "#f97316");
  px(b, x + 16, y - 7, 6, 1, "#fde68a");
  for (let i = 0; i < 4; i++) {
    const ex = x + 15 + ((i * 5 + Math.floor(time * 20)) % 10);
    const ey = y - 10 - ((i * 7 + Math.floor(time * 30)) % 16);
    px(b, ex, ey, 1, 1, i % 2 === 0 ? "#fde68a" : "#f97316");
  }

  // Ground shadow — his own reference-art body has none of its own.
  px(b, x - 8, y - 1, 16, 2, "rgba(0,0,0,0.4)");

  drawInteractPrompt(
    b,
    (engine as ArenaEngine & { nearBlacksmith?: boolean }).nearBlacksmith,
    x,
    y,
    0,
    time
  );
}

/**
 * The gear vendor's own reference art already includes his stall (table,
 * potions, coin, the "Vendor" sign) — see the blacksmith block in
 * renderFighterPortraits — so this pass only contributes the ground shadow
 * beneath him and the "PRESS E" prompt.
 */
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
  if (!stage?.isTown) return;
  const anchor = npcAnchor(engine, wx, wy, stage.vendorX, time, 1);
  if (!anchor) return;
  const { x, y } = anchor;

  px(b, x - 10, y - 1, 20, 2, "rgba(0,0,0,0.4)");
  drawInteractPrompt(b, (engine as ArenaEngine & { nearVendor?: boolean }).nearVendor, x, y, 0, time);
}

/**
 * The bank keeper's reference art is just the figure, so this pass keeps the
 * reinforced vault chest beside him plus the ground shadow and prompt.
 */
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
  if (!stage?.isTown) return;
  const anchor = npcAnchor(engine, wx, wy, stage.bankX, time, 2);
  if (!anchor) return;
  const { x, y } = anchor;

  // A squat, iron-banded vault chest beside him.
  px(b, x + 8, y - 14, 16, 14, "#3a4050");
  px(b, x + 8, y - 14, 16, 2, "#565f73");
  px(b, x + 8, y - 8, 16, 2, "#2a2f3a");
  px(b, x + 14, y - 12, 4, 4, "#c9a24a");
  px(b, x + 15, y - 11, 2, 2, "#1c1f28");
  pxGlow(b, x + 16, y - 10, 5, "#7dd3fc", 0.5);

  px(b, x - 8, y - 1, 16, 2, "rgba(0,0,0,0.4)");
  drawInteractPrompt(b, (engine as ArenaEngine & { nearBank?: boolean }).nearBank, x, y, 0, time);
}

/**
 * Emberhold's street furniture: a signpost by the western gate, a wishing
 * well at the square's heart, and lamp posts lighting the gaps between
 * stalls — filler that makes the town read as a lived-in place rather than
 * three vendors standing in a field.
 */
function drawVillageProps(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number
) {
  const stage = (engine as ArenaEngine & { stage?: { isTown?: boolean } }).stage;
  if (!stage?.isTown) return;

  const lampAt = (wxv: number) => {
    const gy = engine.groundAtX(wxv);
    if (gy === null) return;
    const x = wx(wxv);
    const y = wy(gy);
    const flicker = 0.5 + 0.5 * Math.sin(time * 3 + wxv);
    px(b, x - 1, y - 26, 2, 26, "#241c1a");
    px(b, x - 4, y - 30, 8, 3, "#241c1a");
    px(b, x - 3, y - 29, 6, 4, "#3a2e26");
    pxGlow(b, x, y - 27, 8, "#ffcf7a", 0.4 + flicker * 0.25);
    px(b, x - 1, y - 28, 2, 2, "#fff2cf");
  };
  lampAt(300);
  lampAt(1250);
  lampAt(1700);

  // The village well, centred in the square between the blacksmith and vendor.
  const wellX = 750;
  const wgy = engine.groundAtX(wellX);
  if (wgy !== null) {
    const x = wx(wellX);
    const y = wy(wgy);
    const sway = Math.sin(time * 1.5) * 0.5;
    // Stone ring.
    px(b, x - 12, y - 10, 24, 10, "#5c6270");
    px(b, x - 12, y - 10, 24, 2, "#7a8090");
    px(b, x - 10, y - 8, 20, 6, "#3f4450");
    pxGlow(b, x, y - 6, 6, "#7dd3fc", 0.35);
    // Roof posts and a little shingled awning.
    px(b, x - 11, y - 30, 2, 20, "#4a3626");
    px(b, x + 9, y - 30, 2, 20, "#4a3626");
    px(b, x - 13, y - 32, 28, 4, "#7a3b2e");
    px(b, x - 13, y - 29, 28, 1, "#2a2034");
    // A bucket on a rope, gently swinging.
    px(b, x + Math.round(sway), y - 18, 1, 8, "#241c1a");
    px(b, x - 2 + Math.round(sway), y - 10, 5, 4, "#5c4530");
  }

  // A welcome sign by the western gate.
  const signX = 180;
  const sgy = engine.groundAtX(signX);
  if (sgy !== null) {
    const x = wx(signX);
    const y = wy(sgy);
    px(b, x - 1, y - 20, 2, 20, "#4a3626");
    px(b, x - 11, y - 24, 22, 10, "#6b4a2e");
    px(b, x - 11, y - 24, 22, 1, "#8f6738");
    pxText(b, "EMBERHOLD", x, y - 27, "#f6b352", 5);
  }
}

/**
 * Emberhold grows fancier as the player spends gold on it (see
 * AdventureSave.townTier, bought from the Blacksmith's buy tab) — five
 * cumulative tiers of purely cosmetic street dressing, each just a few more
 * px/pxGlow calls at a fixed, empty stretch of the town map. No new NPC or
 * anchor point: the purchase itself lives in an existing shop panel.
 */
function drawTownDecor(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number
) {
  const stage = (engine as ArenaEngine & { stage?: { isTown?: boolean } }).stage;
  if (!stage?.isTown) return;
  const tier = (engine as ArenaEngine & { save?: { townTier?: number } }).save?.townTier ?? 0;
  if (tier <= 0) return;

  // Tier 1: bunting strung between the gate and the well.
  if (tier >= 1) {
    const colors = ["#f6b352", "#7dd3fc", "#f87171", "#a3e635"];
    for (let i = 0; i < 10; i++) {
      const gx = 260 + i * 55;
      const gy = engine.groundAtX(gx);
      if (gy === null) continue;
      const x = wx(gx);
      const y = wy(gy) - 46 + Math.round(Math.sin(i * 1.3) * 3);
      px(b, x - 2, y, 4, 3, colors[i % colors.length]);
    }
  }

  // Tier 2: a small flowerbed by the square.
  if (tier >= 2) {
    const gx = 600;
    const gy = engine.groundAtX(gx);
    if (gy !== null) {
      const x = wx(gx);
      const y = wy(gy);
      px(b, x - 14, y - 3, 28, 3, "#2f4d1f");
      const petals = ["#f472b6", "#fde68a", "#f87171", "#e9d5ff"];
      for (let i = 0; i < 8; i++) {
        const fx = x - 12 + i * 4 + Math.round(Math.sin(time * 1.5 + i) * 1);
        px(b, fx, y - 5, 1, 2, "#3f6212");
        px(b, fx - 1, y - 6, 3, 2, petals[i % petals.length]);
      }
    }
  }

  // Tier 3: a modest statue of the player's own class, where the old town
  // lake used to be.
  if (tier >= 3) {
    const gx = 1850;
    const gy = engine.groundAtX(gx);
    if (gy !== null) {
      const x = wx(gx);
      const y = wy(gy);
      px(b, x - 14, y - 1, 28, 3, "#4a4f5c");
      px(b, x - 10, y - 4, 20, 3, "#5c6270");
      px(b, x - 4, y - 34, 8, 30, "#6b7690");
      px(b, x - 6, y - 34, 12, 3, "#7a8090");
      pxGlow(b, x, y - 24, 10, "#f6b352", 0.3 + Math.sin(time * 2) * 0.08);
    }
  }

  // Tier 4: festival lanterns strung along the main street.
  if (tier >= 4) {
    for (let i = 0; i < 6; i++) {
      const gx = 850 + i * 60;
      const gy = engine.groundAtX(gx);
      if (gy === null) continue;
      const x = wx(gx);
      const y = wy(gy) - 52 + Math.round(Math.sin(time * 2 + i) * 2);
      const flicker = 0.5 + 0.5 * Math.sin(time * 4 + i * 2);
      pxGlow(b, x, y, 6, "#fb923c", 0.3 + flicker * 0.25);
      px(b, x - 2, y - 2, 4, 4, "#fde68a");
    }
  }

  // Tier 5: a grand gate arch at the western entrance.
  if (tier >= 5) {
    const gx = 60;
    const gy = engine.groundAtX(gx);
    if (gy !== null) {
      const x = wx(gx);
      const y = wy(gy);
      px(b, x - 24, y - 46, 6, 46, "#7a8090");
      px(b, x + 18, y - 46, 6, 46, "#7a8090");
      px(b, x - 26, y - 50, 52, 6, "#8f97a8");
      pxGlow(b, x, y - 50, 16, "#fde68a", 0.35 + Math.sin(time * 1.5) * 0.1);
      pxText(b, "EMBERHOLD RISES", x, y - 56, "#fde68a", 5);
    }
  }
}

/** A dead mob's loot: a little drawstring pouch with a rarity-tinted gem,
 * glinting on the ground until the player walks over it. */
function drawLootDrops(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  vw: number,
  vh: number
) {
  const drops = (engine as ArenaEngine & { lootDrops?: LootDrop[] }).lootDrops;
  if (!drops || !drops.length) return;
  for (const d of drops) {
    const x = wx(d.x);
    const y = wy(d.y);
    if (!onScreen(x, y, vw, vh, 20)) continue;
    const glow = itemGlow(d.item);
    const color = itemColor(d.item);
    const bob = d.onGround ? Math.round(Math.sin(d.age * 3) * 1) : 0;
    const flicker = 0.5 + 0.5 * Math.sin(d.age * 4);
    pxGlow(b, x, y - 6 + bob, 7, glow, 0.35 + flicker * 0.2);
    px(b, x - 4, y - 8 + bob, 8, 7, "#4a3626");
    px(b, x - 4, y - 8 + bob, 8, 1, "#6b4a2e");
    px(b, x - 3, y - 9 + bob, 6, 2, "#7a5636");
    px(b, x - 1, y - 6 + bob, 3, 3, color);
    px(b, x, y - 7 + bob, 1, 1, "#ffffff");
  }
}

// ------------------------------------------------------------------ fighters

interface Pal {
  primary: string;
  shade: string;
  lit: string;
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
      lit: lighten(m.color),
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
    lit: lighten(c.primary),
    secondary: c.secondary,
    // A cosmetic-only override unlocked via Prestige tiers — never set for
    // mobs, so this can never affect anything but the player's own gear trim.
    trim: f.weaponSkinOverride ?? c.trim,
    skin: c.skin,
    skinShade: shade(c.skin),
    hair: c.hair,
    // A cosmetic-only override unlocked via achievements — never set for
    // mobs, so this can never affect anything but the player's own rim-glow.
    aura: f.auraOverride ?? c.aura,
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

/** Lightens a hex colour for a rim-lit edge — the mob equivalent of the
 *  bespoke highlight lines every player kit already gets (KIT.pantsLit,
 *  SKIT.plateLit, ...), so a monster's body reads as lit from above instead
 *  of a single flat fill. */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.4 + 255 * 0.6);
  const g = Math.round(((n >> 8) & 255) * 0.4 + 255 * 0.6);
  const b = Math.round((n & 255) * 0.4 + 255 * 0.6);
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

/**
 * A Dragon-Ball-"God"-style rising energy aura: a pulsing bright core plus
 * several jagged flame tendrils that sway and lick upward past the head,
 * shedding embers off their tips — built entirely from the existing
 * px/pxCircle/pxGlow primitives, no new art assets. `seed` (the fighter's
 * own x) keeps multiple auras from animating in lockstep with each other.
 */
function drawGodAura(
  b: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  color: string,
  time: number,
  seed: number
) {
  const baseY = y - h * 0.5;
  const pulse = 0.85 + Math.sin(time * 6 + seed) * 0.15;
  pxGlow(b, x, baseY, h * 0.62, color, 0.42 * pulse);
  pxGlow(b, x, baseY, h * 0.3, "#ffffff", 0.18 * pulse);

  const tendrils = 7;
  for (let i = 0; i < tendrils; i++) {
    const phase = seed * 0.7 + i * 1.7;
    const speed = 2.6 + (i % 3) * 0.4;
    const sway = Math.sin(time * speed + phase) * (h * 0.16);
    const riseFrac = 0.55 + 0.45 * ((Math.sin(time * (speed * 0.6) + phase * 1.3) + 1) / 2);
    const tipY = baseY - h * (0.55 + riseFrac * 0.85);
    const baseX = x + Math.cos((i / tendrils) * Math.PI * 2) * h * 0.22;
    const midX = baseX + sway * 0.6;
    const tipX = baseX + sway;
    // Three-segment flame lick: wide at the base, tapering to a point,
    // brightening toward white at the very tip.
    pxCircle(b, baseX, baseY - h * 0.1, h * 0.09, color);
    pxCircle(b, midX, (baseY + tipY) / 2, h * 0.065, color);
    pxCircle(b, tipX, tipY, h * 0.035, "#fff7e6");
    // An ember breaking free above the tip every so often.
    const emberPhase = (time * (0.8 + (i % 2) * 0.3) + phase) % 3;
    if (emberPhase < 1.2) {
      const emberY = tipY - emberPhase * h * 0.35;
      const emberX = tipX + Math.sin(time * 4 + phase) * 3;
      const emberAlpha = Math.max(0, 1 - emberPhase / 1.2);
      const prevAlpha = b.globalAlpha;
      b.globalAlpha = emberAlpha;
      pxCircle(b, emberX, emberY, 1.4, "#ffe9b0");
      b.globalAlpha = prevAlpha;
    }
  }
}

function drawFighter(
  b: CanvasRenderingContext2D,
  f: Fighter,
  wx: (v: number) => number,
  wy: (v: number) => number,
  time: number,
  stageId: string | undefined
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
  const paladin = !f.isMob && f.classId === "kacper";

  // Ground shadow: a soft-edged ellipse (a bright core fading through two
  // dimmer rings) instead of one flat bar, so every fighter reads as
  // actually planted on the ground rather than pasted over it.
  const sw = Math.round(w * 0.95);
  px(b, x - sw / 2, y - 1, sw, 1, "rgba(0,0,0,0.4)");
  px(b, x - Math.round(sw * 0.35), y - 2, Math.round(sw * 0.7), 1, "rgba(0,0,0,0.28)");
  px(b, x - Math.round(sw * 0.18), y - 3, Math.round(sw * 0.36), 1, "rgba(0,0,0,0.16)");

  // Every mob gets a soft rim-glow in its own aura colour, scaled up with
  // level — regular trash reads as barely-there, but by the time you're
  // fighting something with real health it visibly radiates, the same
  // language already used for boss auras and the class aura ring. Without
  // this, mobs were flat silhouettes next to a hero who gets full lighting.
  if (f.isMob) {
    const m = MOB_TYPES[f.mobTypeId!];
    if (m) {
      const glowMag = Math.min(0.5, 0.16 + m.level * 0.006 + (m.isBoss ? 0.15 : 0));
      // Three bosses turn this glow hot red once their phase-2 HP threshold
      // trips (see BOSS_PHASE2 in adventure.ts — kept in sync by hand since
      // this file can't import the campaign layer, only reads hp/maxHp).
      const phase2At = BOSS_PHASE2_HP_FRAC[m.id];
      const inPhase2 = phase2At !== undefined && f.hp / f.maxHp <= phase2At;
      // Elites (never bosses, so this never fights the phase2 check above)
      // glow in their affix's colour — violet as a fallback for the
      // vanishingly unlikely case the affix didn't come through.
      // Rifts glow gold over whatever their elite affix would normally show
      // — a Rift Warden is meant to read as "drop everything and go here"
      // from across the screen, not blend in with an ordinary Elite.
      const eliteColor = f.rift ? "#fde047" : f.elite ? eliteAffixColor(f.eliteAffix) : null;
      const glowColor = inPhase2 ? "#ff3b30" : eliteColor ?? p.aura;
      const glowStrength = inPhase2 || eliteColor ? glowMag + 0.2 : glowMag;
      pxGlow(b, x, y - h * 0.5, h * 0.62, glowColor, glowStrength);
    }
  }

  // Cosmetic-only aura, unlocked via achievements and equipped from the
  // character sheet — off by default, so nobody sees anything around the
  // player until they've actually earned and picked one.
  if (!f.isMob && f.auraOverride) {
    drawGodAura(b, x, y, h, f.auraOverride, time, f.x);
  }

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
  // Boss telegraph: a growing warning ring through the whole windup, so the
  // move reads as "get out" well before the hitbox actually appears —
  // regular mob swings are fast enough not to need this, but a boss special
  // is deliberately slow and punishing, and should look it. Red = the
  // knockdown slam, purple = the wider stunning sweep, so a player can tell
  // which read to make before it lands.
  if (
    f.isMob &&
    (f.action?.spec.id === "boss-special" || f.action?.spec.id === "boss-sweep") &&
    MOB_TYPES[f.mobTypeId!]?.isBoss
  ) {
    const color = bossTelegraphColor(f.action.spec.id === "boss-sweep");
    const t = Math.min(1, f.action.elapsed / f.action.spec.activeAt);
    const r = Math.round(h * (0.5 + t * 0.9));
    pxGlow(b, x, y - h * 0.55, h * (0.6 + t * 0.6), color, 0.35 + t * 0.4);
    ringOutline(b, x, y - h * 0.55, r, color);
  }

  const flash = f.hitFlash > 0 && Math.floor(time * 30) % 2 === 0;
  const col = (c: string) => (flash ? "#ffffff" : c);

  // Paragon/Shedim/Kacper's body is drawn by the crisp portrait overlay
  // canvas instead (see renderFighterPortraits) — this pass only
  // contributes the shadow/rings already drawn above and the nameplate
  // below. Falls back to the procedural body while the image is still
  // loading (or if it ever fails to load).
  const usesPortrait = (hero || knight || paladin) && !!getPortraitImage(f.classId);
  const usesMobSprite =
    f.isMob && !!f.mobTypeId && !!getMobSpriteImage(stageId, f.mobTypeId);
  const usesImageArt = usesPortrait || usesMobSprite;

  if (f.state === "knockdown") {
    if (!usesImageArt) drawDowned(b, x, y, w, h, p, col);
    drawNameplate(b, f, x, y - h - 6);
    return;
  }

  if (usesImageArt) {
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
    } else if (f.isMob && lx === frontLegX) {
      // Only the front (lit) leg gets the highlight edge — the back one is
      // already the deliberately-shaded tone from the loop above.
      px(b, lx + (dir === 1 ? legW - 1 : 0), legY, 1, legH - 3, col(p.lit));
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
    } else {
      // A lit-from-above rim: a bright top edge plus a highlight running
      // down the leading (facing) side, opposite the shaded trailing side
      // above — mobs used to be one flat fill plus a shadow block, which
      // read as a paper cutout next to the hero's fully-shaded kit.
      px(b, x - half, torsoY, torsoW, 1, col(p.lit));
      px(b, dir === 1 ? x + half - 1 : x - half, torsoY + 1, 1, torsoH - 1, col(p.lit));
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
    else if (f.isMob) px(b, armX, armY, armLen, 1, col(p.lit));
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
    if (f.isMob) {
      px(b, dir === 1 ? headX + headW - 1 : headX, topY + 1, 1, headH - 1, col(p.lit));
    }
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

  if (f.isMob) drawMobFlourish(b, f, x, y, w, h, topY, torsoY, torsoH, dir, col, time);

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
  col: (c: string) => string,
  time: number
) {
  // Wall-clock ms, kept only so the existing `Date.now()`-tuned magnitudes
  // below don't need re-tuning — driven by the frame's own clock (engine.time)
  // instead of the system clock, so halo animation stays in lockstep with
  // everything else (pause, slow-mo, hitstop) rather than drifting on its own.
  const now = time * 1000;
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
    case "rabid-cur": {
      // Hunched and wiry, all coiled speed — bared teeth and a low, lean
      // stance instead of the brawler's broad bulk, so it reads as fast and
      // fragile rather than another slow bruiser.
      px(b, x - half, torsoY + torsoH - 1, torsoW2(w), 2, col(m.accent));
      px(b, x + dir * 3, topY + 2, 2, 1, "#fef2f2");
      px(b, x + dir * 2, topY + 4, 1, 1, "#fecaca");
      for (let i = 0; i < 2; i++) {
        px(b, x - half + i * (w - 3), torsoY + torsoH, 2, 3, col(m.accent));
      }
      break;
    }
    case "treant": {
      // Gnarled bark plating and a leafy crown — the Outskirts' own boss,
      // same "crowned heavy silhouette" language as Warden's aura/pauldrons
      // below. Only ever seen if its sprite art hasn't finished loading yet.
      pxGlow(b, x, y - h * 0.55, h * 0.7, "#84cc16", 0.5);
      px(b, x - half - 2, torsoY - 2, 4, 6, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 4, 6, col(m.accent));
      for (let i = 0; i < 5; i += 2) {
        px(b, x - half + i * 2, topY - 3, 1, 3, "#65a30d");
      }
      px(b, x - half, topY + 3, w, 1, "#4d7c0f");
      break;
    }
    case "dreadknight": {
      // The Undercity's own boss: black plate and a huge violet flaming
      // greatsword, same "crowned heavy silhouette" language as the other
      // bosses. Only ever seen if its sprite art hasn't finished loading yet.
      pxGlow(b, x, y - h * 0.55, h * 0.8, "#a78bfa", 0.55);
      px(b, x - half - 3, torsoY - 2, 5, 7, col(m.accent));
      px(b, x + half - 2, torsoY - 2, 5, 7, col(m.accent));
      const bl = Math.round(h * 0.7);
      for (let i = 0; i < bl; i++) {
        px(b, x + dir * (half + 2 + Math.round(i * 0.2)), topY - i, 1, 1, "#c4b5fd");
      }
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
    case "cultist": {
      // Hooded robe with a charged bolt glowing in its raised hand — reads
      // as "ranged" at a glance rather than just another melee silhouette.
      px(b, x - half, topY + 1, w, 3, col(m.color));
      px(b, x - half + 1, torsoY, torsoW2(w) - 2, torsoH, col(m.accent));
      pxGlow(b, x + dir * (half + 3), torsoY + 2, 4, "#22d3ee", 0.75);
      px(b, x + dir * (half + 3), torsoY + 2, 1, 1, "#e0f7fa");
      break;
    }
    case "shieldbearer": {
      // A heavy tower shield planted on its facing side — reads as "block
      // this side" at a glance, backing up the frontGuard mechanic that
      // makes frontal hits do nothing until it's staggered or flanked.
      px(b, x + dir * (half + 1), torsoY - 2, 4, torsoH + 4, col(m.accent));
      px(b, x + dir * (half + 1), torsoY - 1, 4, torsoH + 2, "#78716c");
      px(b, x + dir * (half + 2), torsoY + Math.round(torsoH * 0.4), 2, 2, "#d6d3d1");
      px(b, x - half + 1, topY + 1, w - 2, 2, col(m.color));
      break;
    }
    case "bog-slime": {
      // Amorphous and dripping — no real face, just a wide glowing eye sunk
      // into the ooze, ragged bumps along the head instead of a hairline,
      // and drips hanging off the torso rather than a normal hem.
      px(b, x - half - 1, topY - 1, w + 2, 3, col(m.accent));
      px(b, x - half + 1, topY - 2, 2, 2, col(m.color));
      px(b, x + half - 3, topY - 2, 2, 2, col(m.color));
      pxGlow(b, x, topY + 3, 4, "#bef264", 0.6);
      px(b, x - 1, topY + 3, 3, 2, "#ecfccb");
      for (let i = 0; i < 3; i++) {
        px(b, x - half + i * Math.round(w / 3), torsoY + torsoH, 2, 2 + (i % 2) * 2, col(m.accent));
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
    case "sentinel": {
      // A planted turret of a mob: squared steel plating and a raised
      // barrel-arm with a charged blue core — built to read as "stands its
      // ground and shoots" rather than another melee silhouette, like the
      // cultist's bolt but heavier and less mobile to match its bulk.
      px(b, x - half - 1, torsoY - 1, torsoW2(w) + 2, torsoH + 2, col(m.accent));
      px(b, x - half, torsoY, torsoW2(w), torsoH, col(m.color));
      px(b, x + dir * (half + 2), torsoY + 1, 5, 2, col(m.accent));
      pxGlow(b, x + dir * (half + 5), torsoY + 2, 3, "#38bdf8", 0.7);
      px(b, x + dir * (half + 5), torsoY + 2, 1, 1, "#e0f2fe");
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
        const a = (i / 7) * Math.PI * 2 + now * 0.0015;
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
    case "frost-adept": {
      // A hooded ice-caster — same "reads as ranged" language as the
      // cultist's charged bolt, but a slow-pulsing frost orb and rime
      // dusted across the hood instead of cyan lightning.
      px(b, x - half, topY + 1, w, 3, col(m.color));
      px(b, x - half + 1, torsoY, torsoW2(w) - 2, torsoH, col(m.accent));
      px(b, x - half, topY, w, 1, "#e0f7ff");
      pxGlow(b, x + dir * (half + 3), torsoY + 2, 5, "#a5f3fc", 0.75);
      px(b, x + dir * (half + 3), torsoY + 2, 2, 2, "#f0fbff");
      px(b, x + dir * (half + 2), torsoY + 5, 1, 3, "#7dd3fc");
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
    case "cinder-imp": {
      // Small and quick — curled horns and ember eyes instead of a normal
      // brow, plus a flame-tipped tail lashing behind it, so it reads as a
      // lesser demon rather than a shrunk-down brawler.
      px(b, x - dir * 2, topY - 2, 1, 3, col(m.accent));
      px(b, x - dir * 4, topY - 1, 1, 2, col(m.accent));
      px(b, x + dir * 2, topY + 3, 1, 1, "#fed7aa");
      px(b, x + dir * 4, topY + 3, 1, 1, "#fed7aa");
      const tailLen = Math.round(h * 0.3);
      for (let i = 0; i < tailLen; i++) {
        px(b, x - dir * (half + i), y - 2 - Math.round(Math.sin(i * 0.6) * 2), 2, 2, col(m.accent));
      }
      pxGlow(b, x - dir * (half + tailLen), y - 3, 3, "#fb923c", 0.7);
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
        const flick = Math.floor(now * 0.02 + i) % 3 === 0;
        px(b, x - half + i * 3, torsoY + 1 + (i % 2) * 3, 2, 2, flick ? "#ffffff" : col(m.accent));
      }
      px(b, x + dir * (half + 3), topY + 2, 1, 6, "#eff6ff");
      px(b, x + dir * (half + 4), topY, 1, 3, "#eff6ff");
      break;
    }
    case "storm-wisp": {
      // Ethereal and crackling — a translucent violet glow standing in for
      // solid shading, with small arcs jutting off both hands, the same
      // "reads as ranged" language as the cultist/frost-adept but electric.
      pxGlow(b, x, y - h * 0.5, h * 0.55, "#c4b5fd", 0.55);
      px(b, x + dir * (half + 1), torsoY + 2, 2, 1, "#f5f3ff");
      px(b, x + dir * (half + 3), torsoY + 1, 1, 1, "#ede9fe");
      px(b, x - dir * (half + 2), torsoY + torsoH - 2, 1, 1, "#ddd6fe");
      pxGlow(b, x + dir * (half + 4), torsoY + 3, 4, "#a78bfa", 0.7);
      px(b, x + dir * (half + 4), torsoY + 3, 1, 1, "#f5f3ff");
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
        const a = (i / 6) * Math.PI * 2 + now * 0.002;
        if (Math.floor(now * 0.015 + i) % 2 === 0) {
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
    const w = MOB_TYPES[f.mobTypeId!]?.isBoss ? 26 : f.elite ? 20 : 14;
    const pct = Math.max(0, f.hp / f.maxHp);
    px(b, x - w / 2 - 1, y - 3, w + 2, 4, PAL.ink);
    px(b, x - w / 2, y - 2, Math.round(w * pct), 2, pct > 0.4 ? "#7ec850" : "#d94f4f");
    const nameColor = f.rift ? "#fde047" : f.elite ? eliteAffixColor(f.eliteAffix) : "#c9d4e8";
    pxText(b, `${f.name} ${f.level}`, x, y - 5, nameColor, 5);
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
  wy: (v: number) => number,
  vw: number,
  vh: number
) {
  for (const hb of engine.hitboxes) {
    const x = wx(hb.x);
    const y = wy(hb.y);
    if (!onScreen(x, y, vw, vh)) continue;
    const w = Math.round(hb.w / S);
    const h = Math.round(hb.h / S);
    const colour =
      hb.kind === "skill" ? "#ffe38a" : hb.kind === "rmb" ? "#f79ad3" : "#9fdcff";
    const trail =
      hb.kind === "skill" ? "#b9821f" : hb.kind === "rmb" ? "#a8508a" : "#4b8fc4";

    // Detonate and Whirlwind hit all around the caster, not in the facing
    // direction — drawing them with the directional crescent below made a
    // one-sided arc that read as a stray half-moon rather than a burst.
    // A centered ring reads as "everything around me" instead.
    if (hb.sourceId === "detonate" || hb.sourceId === "whirlwind") {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const radius = Math.max(w, h) / 2;
      pxGlow(b, cx, cy, radius * 0.7, colour, 0.35);
      const rings = 10;
      for (let i = 0; i < rings; i++) {
        const a = (i / rings) * Math.PI * 2;
        px(b, Math.round(cx + Math.cos(a) * radius), Math.round(cy + Math.sin(a) * radius * 0.5), 2, 2, colour);
      }
      continue;
    }

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

/** Blends `hex` toward white by `t` (0 = unchanged, 1 = pure white). */
function mixWhite(hex: string, t: number): string {
  if (hex[0] !== "#" || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - t) + 255 * t);
  const g = Math.round(((n >> 8) & 255) * (1 - t) + 255 * t);
  const bl = Math.round((n & 255) * (1 - t) + 255 * t);
  return `rgb(${r},${g},${bl})`;
}

function drawParticles(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  vw: number,
  vh: number
) {
  for (const p of engine.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (a < 0.15) continue;
    const x = wx(p.x);
    const y = wy(p.y);
    if (!onScreen(x, y, vw, vh, 10)) continue;
    const size = Math.max(1, Math.round((p.size / S) * a));
    // A particle flashes hot-white right as it spawns and cools into its
    // real colour over its first moment alive — sells "spark thrown off
    // impact" instead of "solid dot fading out", for the cost of one lerp
    // (no extra draw calls, so it's free at any particle count).
    const hot = Math.max(0, (a - 0.65) / 0.35);
    const color = hot > 0.05 ? mixWhite(p.color, hot) : p.color;
    px(b, x, y, size, size, color);
  }
}

function drawTexts(
  b: CanvasRenderingContext2D,
  engine: ArenaEngine,
  wx: (v: number) => number,
  wy: (v: number) => number,
  vw: number,
  vh: number
) {
  for (const t of engine.texts) {
    const a = Math.min(1, t.life / (t.maxLife * 0.5));
    if (a <= 0.1) continue;
    const x = wx(t.x);
    const y = wy(t.y);
    if (!onScreen(x, y, vw, vh, 40)) continue;
    b.globalAlpha = a;
    pxText(b, t.text, x, y, t.color, Math.max(5, Math.round(t.size / 2)));
    b.globalAlpha = 1;
  }
}

// The vignette (gradient + dithered rim) is static for a given viewport
// size — everything about it depends only on vw/vh, never on game state —
// so it's painted once to an offscreen canvas and just blitted every frame
// instead of re-running a radial-gradient allocation and 4 per-pixel dither
// passes at 60fps. Repainted only when the viewport size actually changes.
let vignetteCanvas: HTMLCanvasElement | null = null;
let vignetteCtx: CanvasRenderingContext2D | null = null;
let vignetteW = -1;
let vignetteH = -1;

function paintVignette(b: CanvasRenderingContext2D, vw: number, vh: number) {
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

function drawVignette(b: CanvasRenderingContext2D, vw: number, vh: number) {
  if (!vignetteCanvas || vignetteW !== vw || vignetteH !== vh) {
    vignetteCanvas = document.createElement("canvas");
    vignetteCanvas.width = vw;
    vignetteCanvas.height = vh;
    vignetteCtx = vignetteCanvas.getContext("2d");
    vignetteW = vw;
    vignetteH = vh;
    if (vignetteCtx) paintVignette(vignetteCtx, vw, vh);
  }
  if (vignetteCanvas) b.drawImage(vignetteCanvas, 0, 0);
}
