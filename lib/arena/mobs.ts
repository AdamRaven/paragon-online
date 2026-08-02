import type { AttackSpec, ArenaMap, DamageType, Hazard } from "./types";

export interface MobType {
  id: string;
  name: string;
  level: number;
  maxHp: number;
  damage: number;
  /** Walk speed in px per frame. */
  speed: number;
  expValue: number;
  range: number;
  /** Telegraph before the hit lands. */
  windup: number;
  recover: number;
  aggro: number;
  w: number;
  h: number;
  color: string;
  accent: string;
  isBoss?: boolean;
  /** Kites and fires a projectile instead of closing to melee — `range` is
   *  read as its preferred firing distance rather than melee reach. */
  ranged?: boolean;
  /** Blocks any hit landing on its facing side entirely — approach from
   *  behind, or knock it around, or it just won't take frontal damage. */
  shielded?: boolean;
  /** Its own attacks carry this element — see mobAttackSpec/mobRangedAttackSpec. */
  damageType?: DamageType;
  /** Fractional damage taken from each element, applied in dealDamage
   *  (engine.ts) on top of armor mitigation; negative = vulnerability
   *  (takes *more*). Player-side only exists as damageType on attacks —
   *  there is no player elemental resistance yet, so this is one-directional. */
  resist?: Partial<Record<DamageType, number>>;
}

export const MOB_TYPES: Record<string, MobType> = {
  husk: {
    id: "husk",
    name: "Husk",
    level: 1,
    maxHp: 60,
    damage: 7,
    speed: 1.3,
    expValue: 26,
    range: 46,
    windup: 0.42,
    recover: 0.45,
    aggro: 300,
    w: 26,
    h: 54,
    color: "#64748b",
    accent: "#334155",
  },
  brawler: {
    id: "brawler",
    name: "Pit Brawler",
    level: 3,
    maxHp: 135,
    damage: 13,
    speed: 2.0,
    expValue: 58,
    range: 52,
    windup: 0.34,
    recover: 0.38,
    aggro: 360,
    w: 28,
    h: 58,
    color: "#b45309",
    accent: "#78350f",
  },
  "rabid-cur": {
    id: "rabid-cur",
    name: "Rabid Cur",
    level: 4,
    maxHp: 85,
    damage: 17,
    speed: 3.6,
    expValue: 70,
    range: 44,
    windup: 0.16,
    recover: 0.5,
    aggro: 520,
    w: 22,
    h: 46,
    color: "#dc2626",
    accent: "#7f1d1d",
  },
  "blade-wraith": {
    id: "blade-wraith",
    name: "Blade Wraith",
    level: 6,
    maxHp: 260,
    damage: 21,
    speed: 2.9,
    expValue: 120,
    range: 68,
    windup: 0.26,
    recover: 0.32,
    aggro: 440,
    w: 26,
    h: 60,
    color: "#6d28d9",
    accent: "#3b0764",
  },
  cultist: {
    id: "cultist",
    name: "Cultist",
    level: 6,
    maxHp: 110,
    damage: 16,
    speed: 1.6,
    expValue: 95,
    range: 240,
    windup: 0.5,
    recover: 0.4,
    aggro: 420,
    w: 24,
    h: 56,
    color: "#0e7490",
    accent: "#164e63",
    ranged: true,
  },
  shieldbearer: {
    id: "shieldbearer",
    name: "Shieldbearer",
    level: 8,
    maxHp: 320,
    damage: 18,
    speed: 1.1,
    expValue: 140,
    range: 56,
    windup: 0.4,
    recover: 0.42,
    aggro: 320,
    w: 30,
    h: 62,
    color: "#57534e",
    accent: "#292524",
    shielded: true,
  },
  colossus: {
    id: "colossus",
    name: "Stone Colossus",
    level: 10,
    maxHp: 620,
    damage: 38,
    speed: 1.5,
    expValue: 300,
    range: 76,
    windup: 0.6,
    recover: 0.6,
    aggro: 380,
    w: 40,
    h: 78,
    color: "#475569",
    accent: "#1e293b",
  },
  warden: {
    id: "warden",
    name: "The Warden",
    level: 15,
    maxHp: 1800,
    damage: 52,
    speed: 2.4,
    expValue: 1500,
    range: 84,
    windup: 0.3,
    recover: 0.34,
    aggro: 600,
    w: 44,
    h: 88,
    color: "#dc2626",
    accent: "#7f1d1d",
    isBoss: true,
  },
  revenant: {
    id: "revenant",
    name: "Revenant",
    level: 18,
    maxHp: 1100,
    damage: 46,
    speed: 2.6,
    expValue: 900,
    range: 80,
    windup: 0.28,
    recover: 0.3,
    aggro: 520,
    w: 34,
    h: 80,
    color: "#7c3aed",
    accent: "#3b0a6b",
  },
  sentinel: {
    id: "sentinel",
    name: "Sentinel",
    level: 22,
    maxHp: 1500,
    damage: 40,
    speed: 1.0,
    expValue: 700,
    range: 320,
    windup: 0.55,
    recover: 0.45,
    aggro: 550,
    w: 36,
    h: 78,
    color: "#1e3a5f",
    accent: "#0f1f33",
    ranged: true,
  },
  sovereign: {
    id: "sovereign",
    name: "The Sovereign",
    level: 24,
    maxHp: 3400,
    damage: 72,
    speed: 2.2,
    expValue: 4500,
    range: 96,
    windup: 0.32,
    recover: 0.36,
    aggro: 700,
    w: 52,
    h: 98,
    color: "#a21caf",
    accent: "#4a044e",
    isBoss: true,
  },
  frostfang: {
    id: "frostfang",
    name: "Frostfang Stalker",
    level: 27,
    maxHp: 1900,
    damage: 85,
    speed: 2.9,
    expValue: 1700,
    range: 84,
    windup: 0.24,
    recover: 0.28,
    aggro: 560,
    w: 36,
    h: 84,
    color: "#7dd3fc",
    accent: "#1e5a8a",
  },
  frostking: {
    id: "frostking",
    name: "The Frostking",
    level: 32,
    maxHp: 5400,
    damage: 98,
    speed: 2.4,
    expValue: 7200,
    range: 100,
    windup: 0.3,
    recover: 0.34,
    aggro: 750,
    w: 56,
    h: 104,
    color: "#e0f4ff",
    accent: "#2b6ca3",
    isBoss: true,
  },
  cinderwraith: {
    id: "cinderwraith",
    name: "Cinder Wraith",
    level: 36,
    maxHp: 2600,
    damage: 110,
    speed: 2.7,
    expValue: 2400,
    range: 88,
    windup: 0.22,
    recover: 0.26,
    aggro: 580,
    w: 38,
    h: 86,
    color: "#f97316",
    accent: "#7c2d12",
  },
  forgeheart: {
    id: "forgeheart",
    name: "The Forgeheart",
    level: 40,
    maxHp: 7400,
    damage: 128,
    speed: 2.3,
    expValue: 9800,
    range: 106,
    windup: 0.32,
    recover: 0.34,
    aggro: 820,
    w: 60,
    h: 110,
    color: "#fde68a",
    accent: "#9a3412",
    isBoss: true,
  },
  stormcaller: {
    id: "stormcaller",
    name: "Stormcaller",
    level: 42,
    maxHp: 3350,
    damage: 135,
    speed: 3.0,
    expValue: 3000,
    range: 92,
    windup: 0.22,
    recover: 0.24,
    aggro: 600,
    w: 36,
    h: 82,
    color: "#93c5fd",
    accent: "#1e3a5f",
  },
  tempestwarden: {
    id: "tempestwarden",
    name: "The Tempest Warden",
    level: 46,
    maxHp: 9500,
    damage: 158,
    speed: 2.5,
    expValue: 12500,
    range: 108,
    windup: 0.3,
    recover: 0.32,
    aggro: 850,
    w: 58,
    h: 112,
    color: "#dbeafe",
    accent: "#3b4d66",
    isBoss: true,
  },
  plaguebound: {
    id: "plaguebound",
    name: "Plaguebound Husk",
    level: 46,
    maxHp: 4050,
    damage: 152,
    speed: 2.6,
    expValue: 4200,
    range: 88,
    windup: 0.24,
    recover: 0.26,
    aggro: 620,
    w: 38,
    h: 84,
    color: "#84cc16",
    accent: "#3f6212",
  },
  rotmother: {
    id: "rotmother",
    name: "The Rotmother",
    level: 50,
    maxHp: 11600,
    damage: 186,
    speed: 2.3,
    expValue: 16500,
    range: 110,
    windup: 0.32,
    recover: 0.34,
    aggro: 880,
    w: 62,
    h: 112,
    color: "#a3e635",
    accent: "#4d7c0f",
    isBoss: true,
  },
  seraphremnant: {
    id: "seraphremnant",
    name: "Seraph Remnant",
    level: 50,
    maxHp: 4750,
    damage: 175,
    speed: 2.8,
    expValue: 5200,
    range: 96,
    windup: 0.22,
    recover: 0.24,
    aggro: 640,
    w: 40,
    h: 88,
    color: "#fef3c7",
    accent: "#b45309",
  },
  sunderedking: {
    id: "sunderedking",
    name: "The Sundered King",
    level: 54,
    maxHp: 14000,
    damage: 220,
    speed: 2.6,
    expValue: 22000,
    range: 116,
    windup: 0.34,
    recover: 0.36,
    aggro: 900,
    w: 64,
    h: 118,
    color: "#fffbeb",
    accent: "#92400e",
    isBoss: true,
  },
  voidling: {
    id: "voidling",
    name: "Voidling",
    level: 52,
    maxHp: 5200,
    damage: 165,
    speed: 3.4,
    expValue: 5800,
    range: 80,
    windup: 0.2,
    recover: 0.24,
    aggro: 620,
    w: 32,
    h: 78,
    color: "#4c1d95",
    accent: "#1e0a3c",
  },
  hollowsentinel: {
    id: "hollowsentinel",
    name: "Hollow Sentinel",
    level: 53,
    maxHp: 6100,
    damage: 172,
    speed: 1.6,
    expValue: 6400,
    range: 300,
    windup: 0.5,
    recover: 0.4,
    aggro: 680,
    w: 40,
    h: 92,
    color: "#312e81",
    accent: "#0f0a2e",
    ranged: true,
  },
  thehollow: {
    id: "thehollow",
    name: "The Hollow",
    level: 58,
    maxHp: 18500,
    damage: 245,
    speed: 2.5,
    expValue: 28000,
    range: 120,
    windup: 0.34,
    recover: 0.36,
    aggro: 950,
    w: 66,
    h: 122,
    color: "#c4b5fd",
    accent: "#1e0a3c",
    isBoss: true,
  },

  // --- elemental enemies: built around DamageType/MobType.resist (types.ts/
  // mobs.ts) so bringing the right element is a real decision, not flavor.
  "bog-slime": {
    id: "bog-slime",
    name: "Bog Slime",
    level: 6,
    maxHp: 140,
    damage: 14,
    speed: 1.0,
    expValue: 90,
    range: 46,
    windup: 0.4,
    recover: 0.45,
    aggro: 300,
    w: 30,
    h: 34,
    color: "#65a30d",
    accent: "#365314",
    damageType: "poison",
    resist: { poison: 0.75, fire: -0.5 },
  },
  "frost-adept": {
    id: "frost-adept",
    name: "Frost Adept",
    level: 29,
    maxHp: 1650,
    damage: 78,
    speed: 1.3,
    expValue: 1550,
    range: 260,
    windup: 0.5,
    recover: 0.4,
    aggro: 550,
    w: 34,
    h: 80,
    color: "#a5f3fc",
    accent: "#155e75",
    ranged: true,
    damageType: "frost",
    resist: { frost: 0.75, fire: -0.5 },
  },
  "cinder-imp": {
    id: "cinder-imp",
    name: "Cinder Imp",
    level: 37,
    maxHp: 2100,
    damage: 118,
    speed: 3.2,
    expValue: 2450,
    range: 70,
    windup: 0.18,
    recover: 0.22,
    aggro: 600,
    w: 30,
    h: 62,
    color: "#fb923c",
    accent: "#7c2d12",
    damageType: "fire",
    resist: { fire: 0.75, frost: -0.5 },
  },
  "storm-wisp": {
    id: "storm-wisp",
    name: "Storm Wisp",
    level: 43,
    maxHp: 2800,
    damage: 128,
    speed: 1.8,
    expValue: 3050,
    range: 280,
    windup: 0.2,
    recover: 0.22,
    aggro: 580,
    w: 26,
    h: 50,
    color: "#ddd6fe",
    accent: "#5b21b6",
    ranged: true,
    damageType: "shock",
    resist: { shock: 0.75, poison: -0.5 },
  },
};

/** Elemental mobs (MobType.damageType set) apply their status for this long
 *  on every landed hit — plain physical mobs are unaffected (0 = no status). */
const MOB_STATUS_DURATION = 3.5;

/** The single melee swing every mob uses. */
export function mobAttackSpec(type: MobType): AttackSpec {
  return {
    id: `mob-${type.id}`,
    label: type.name,
    kind: "lmb",
    castTime: type.windup + type.recover,
    activeAt: type.windup,
    activeDuration: 0.08,
    damageMult: 1,
    rangeMult: 1,
    height: type.h * 0.6,
    knockback: type.isBoss ? 7 : 3.5,
    effect: "none",
    damageType: type.damageType ?? "physical",
    statusDuration: type.damageType ? MOB_STATUS_DURATION : 0,
  };
}

/**
 * The boss-only telegraphed slam: a long, visible windup (see the render-side
 * red warning ring) that trades speed for range, damage and a knockdown —
 * punishing for standing still, dodgeable for anyone actually paying
 * attention. Bosses otherwise use the exact same swing as trash mobs, which
 * made every boss fight just a bigger-numbers version of a regular pull;
 * this is the one attack meant to demand a different response.
 */
export function mobBossSpecialSpec(type: MobType): AttackSpec {
  return {
    id: "boss-special",
    label: `${type.name} Slam`,
    kind: "lmb",
    castTime: 1.5,
    activeAt: 1.1,
    activeDuration: 0.12,
    damageMult: 2.4,
    rangeMult: 1.8,
    height: type.h * 0.8,
    knockback: 9,
    effect: "knockdown",
    damageType: type.damageType ?? "physical",
    statusDuration: type.damageType ? MOB_STATUS_DURATION : 0,
  };
}

/**
 * A boss's second telegraphed move, alternating with the slam above (see
 * MobBrain.think's specialCd rotation in adventure.ts) — wider reach and a
 * stun instead of a knockdown, so standing at mid-range isn't automatically
 * safe just because you learned to sidestep the slam.
 */
export function mobBossSweepSpec(type: MobType): AttackSpec {
  return {
    id: "boss-sweep",
    label: `${type.name} Sweep`,
    kind: "lmb",
    castTime: 1.1,
    activeAt: 0.75,
    activeDuration: 0.16,
    damageMult: 1.7,
    rangeMult: 2.2,
    height: type.h * 1.1,
    knockback: 5,
    effect: "stun",
    effectDuration: 1.1,
    damageType: type.damageType ?? "physical",
    statusDuration: type.damageType ? MOB_STATUS_DURATION : 0,
  };
}

/**
 * Ranged mobs fire a bolt instead of swinging — the `id` is what tells
 * spawnAttack() to push a projectile onto engine.projectiles rather than the
 * usual melee hitbox, the same mechanism Shedim's Shadow Slash already uses.
 */
export function mobRangedAttackSpec(type: MobType): AttackSpec {
  return {
    id: "mob-ranged",
    label: type.name,
    kind: "lmb",
    castTime: type.windup + type.recover,
    activeAt: type.windup,
    activeDuration: 0.08,
    damageMult: 1,
    rangeMult: 1,
    height: type.h * 0.6,
    knockback: 2,
    effect: "none",
    damageType: type.damageType ?? "physical",
    statusDuration: type.damageType ? MOB_STATUS_DURATION : 0,
  };
}

export interface MobSpawn {
  typeId: string;
  x: number;
  /** Elevated spawns stand on a platform at this world y instead of the floor. */
  y?: number;
}

export interface Stage {
  id: string;
  name: string;
  subtitle: string;
  requiredLevel: number;
  map: ArenaMap;
  spawns: MobSpawn[];
  /** Towns are safe: no mobs, and NPCs are stationed at fixed spots. */
  isTown?: boolean;
  /** The blacksmith: sells trash + gear, buys stones, enhances weapons. */
  npcX?: number;
  /** The gear vendor: sells fresh gear for gold. */
  vendorX?: number;
  /** The bank keeper: stores items outside the backpack. */
  bankX?: number;
  /** Drives the backdrop the renderer paints for this stage. */
  biome: Biome;
  /**
   * No fixed spawn list — AdventureEngine spawns escalating waves here
   * instead (see startNextWave), and a player death resets the wave count
   * back to 1 rather than just respawning into the same static roster.
   */
  survival?: boolean;
  /**
   * Every boss, back to back, full heal between each — see BOSS_RUSH_ORDER
   * and AdventureEngine.updateBossRush in adventure.ts. No fixed spawn list,
   * same reasoning as `survival` above.
   */
  bossRush?: boolean;
  /**
   * Same endless-wave engine as `survival` (Crucible sets both flags), plus
   * two random modifiers rerolled on every entry/death — see
   * CRUCIBLE_AFFIX_POOL and AdventureEngine.rollCrucibleAffixes in
   * adventure.ts.
   */
  crucible?: boolean;
  /**
   * A single fixed roster seeded from today's date (see
   * AdventureEngine.spawnDailyChallengeMobs) — same roster for every player
   * all day, a fresh one tomorrow, no server needed to keep it "daily." No
   * fixed spawn list, same reasoning as `survival` above.
   */
  dailyChallenge?: boolean;
}

export type Biome =
  | "town"
  | "outskirts"
  | "undercity"
  | "keep"
  | "abyss"
  | "frost"
  | "forge"
  | "storm"
  | "blight"
  | "divine"
  | "void";

const GROUND_Y = 560;

/**
 * Builds a side-scrolling level with a single continuous floor — no chasms
 * to fall through and respawn from. `platforms` still supports one-way
 * floating terrain if a stage ever wants it, but every stage below passes
 * an empty array — no elevated ground for the player or mobs to jump up
 * onto, just the flat floor. `hazards` are floor-level damage patches —
 * [x, w, dps, kind] — that tick anyone standing in them; omit for a plain
 * floor.
 */
function makeMap(
  width: number,
  platforms: Array<[number, number, number]>,
  hazards: Array<[number, number, number, Hazard["kind"]]> = []
): ArenaMap {
  return {
    width,
    height: 720,
    ground: [{ x: 0, w: width, y: GROUND_Y }],
    platforms: platforms.map(([x, y, w]) => ({ x, y, w, oneWay: true })),
    spawnA: { x: 120, y: GROUND_Y - 60 },
    spawnB: { x: width - 120, y: GROUND_Y - 60 },
    killY: 760,
    hazards: hazards.map(([x, w, dps, kind]) => ({ x, w, y: GROUND_Y, dps, kind })),
  };
}

/** A small deterministic PRNG (mulberry32) so a stage's terrain is stable
 * across reloads but different from every other stage's. Exported for
 * AdventureEngine's daily-challenge roster, which needs the same
 * stable-per-seed determinism keyed off today's date instead of a stage id. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Spreads a handful of extra mob-spawn x-positions evenly (with a little
 * jitter) across a stage from a stable per-stage seed, so every map gets its
 * own irregular roster spacing instead of the same evenly-spaced row copied
 * into every biome. Every map is flat ground now — no floating terrain for
 * mobs (or the player) to perch or jump up onto — so this only ever feeds
 * ground-level spawn x-coordinates.
 */
function proceduralSpawnX(seed: string, width: number, count: number): number[] {
  const rand = mulberry32(hashSeed(seed));
  const margin = 340;
  const usable = width - margin * 2;
  const step = usable / count;
  const xs: number[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = (rand() - 0.5) * step * 0.6;
    xs.push(Math.round(margin + i * step + step / 2 + jitter));
  }
  return xs;
}

// Each late-game stage gets its own irregular extra-spawn spacing instead of
// the same evenly-spaced row repeated everywhere — seeded per stage so the
// layout is fixed and reviewable, not a fresh reroll on every page load.
const SANCTUM_PERCH_X = proceduralSpawnX("sanctum-abyss", 3500, 5);
const FROSTBOUND_PERCH_X = proceduralSpawnX("frostbound-ice", 3600, 4);
const FORGE_PERCH_X = proceduralSpawnX("forge-catwalks", 3600, 6);
const TEMPEST_PERCH_X = proceduralSpawnX("tempest-fortress", 3600, 4);
const BLIGHT_PERCH_X = proceduralSpawnX("blight-hummocks", 3600, 6);
const THRONE_PERCH_X = proceduralSpawnX("throne-risers", 3600, 5);
const HOLLOW_PERCH_X = proceduralSpawnX("hollow-beyond", 3600, 5);

export const STAGES: Stage[] = [
  {
    id: "town",
    name: "Emberhold",
    subtitle: "Safe ground. Trade, buy gear and store your loot here.",
    requiredLevel: 1,
    isTown: true,
    npcX: 500,
    vendorX: 1000,
    bankX: 1500,
    biome: "town",
    map: makeMap(2000, []),
    spawns: [],
  },
  {
    id: "outskirts",
    biome: "outskirts",
    name: "The Outskirts",
    subtitle: "Where the husks wander",
    requiredLevel: 1,
    map: makeMap(2600, []),
    spawns: [
      { typeId: "husk", x: 500 },
      { typeId: "husk", x: 700 },
      { typeId: "husk", x: 1350 },
      { typeId: "husk", x: 1600 },
      { typeId: "brawler", x: 1500 },
      { typeId: "brawler", x: 2250 },
      { typeId: "husk", x: 2400 },
      { typeId: "rabid-cur", x: 1150 },
      { typeId: "rabid-cur", x: 1850 },
      { typeId: "husk", x: 400 },
      { typeId: "brawler", x: 940 },
      { typeId: "husk", x: 1980 },
      { typeId: "husk", x: 900 },
    ],
  },
  {
    id: "undercity",
    biome: "undercity",
    name: "The Undercity",
    subtitle: "Brawlers, wraiths and cultists in the dark",
    requiredLevel: 5,
    map: makeMap(3000, [], [
      [1000, 140, 18, "spikes"],
      [2250, 140, 18, "spikes"],
    ]),
    spawns: [
      { typeId: "brawler", x: 420 },
      { typeId: "rabid-cur", x: 560 },
      { typeId: "brawler", x: 640 },
      { typeId: "bog-slime", x: 980 },
      { typeId: "blade-wraith", x: 1200 },
      { typeId: "cultist", x: 1450 },
      { typeId: "bog-slime", x: 1680 },
      { typeId: "shieldbearer", x: 1900 },
      { typeId: "brawler", x: 2100 },
      { typeId: "blade-wraith", x: 2300 },
      { typeId: "colossus", x: 2450 },
      { typeId: "bog-slime", x: 2650 },
      { typeId: "cultist", x: 2820 },
      { typeId: "shieldbearer", x: 2980 },
      { typeId: "brawler", x: 300 },
      { typeId: "blade-wraith", x: 800 },
      { typeId: "cultist", x: 1740 },
      { typeId: "blade-wraith", x: 2580 },
    ],
  },
  {
    id: "warden-keep",
    biome: "keep",
    name: "Warden's Keep",
    subtitle: "The Warden is waiting at the far end",
    requiredLevel: 12,
    map: makeMap(3200, []),
    spawns: [
      { typeId: "colossus", x: 480 },
      { typeId: "blade-wraith", x: 660 },
      { typeId: "shieldbearer", x: 1050 },
      { typeId: "colossus", x: 1300 },
      { typeId: "blade-wraith", x: 1500 },
      { typeId: "shieldbearer", x: 1900 },
      { typeId: "colossus", x: 2200 },
      { typeId: "blade-wraith", x: 2400 },
      { typeId: "warden", x: 2950 },
      { typeId: "colossus", x: 880 },
      { typeId: "blade-wraith", x: 1820 },
      { typeId: "colossus", x: 2500 },
    ],
  },
  {
    id: "sanctum",
    biome: "abyss",
    name: "The Abyssal Sanctum",
    subtitle: "Beyond the Keep — the Sovereign holds court at the far end",
    requiredLevel: 20,
    map: makeMap(3500, []),
    spawns: [
      { typeId: "revenant", x: 480 },
      { typeId: "colossus", x: 700 },
      { typeId: "sentinel", x: 1050 },
      { typeId: "revenant", x: 1300 },
      { typeId: "blade-wraith", x: 1520 },
      { typeId: "revenant", x: 2100 },
      { typeId: "sentinel", x: 2300 },
      { typeId: "revenant", x: 2420 },
      { typeId: "colossus", x: 2700 },
      { typeId: "sovereign", x: 3300 },
      ...["revenant", "colossus", "revenant", "blade-wraith", "revenant"].map(
        (typeId, i) => ({ typeId, x: SANCTUM_PERCH_X[i] })
      ),
    ],
  },
  {
    id: "frostbound",
    biome: "frost",
    name: "The Frostbound Reach",
    subtitle: "Beyond the Sanctum — the Frostking rules an endless winter",
    requiredLevel: 28,
    map: makeMap(3600, []),
    spawns: [
      { typeId: "frostfang", x: 500 },
      { typeId: "frostfang", x: 740 },
      { typeId: "frost-adept", x: 1050 },
      { typeId: "revenant", x: 1300 },
      { typeId: "sentinel", x: 1750 },
      { typeId: "frostfang", x: 1540 },
      { typeId: "frost-adept", x: 1900 },
      { typeId: "frostfang", x: 2150 },
      { typeId: "sovereign", x: 2450 },
      { typeId: "frostfang", x: 2960 },
      { typeId: "frost-adept", x: 3180 },
      { typeId: "frostking", x: 3400 },
      ...["frostfang", "frostfang", "revenant", "frostfang"].map((typeId, i) => ({
        typeId,
        x: FROSTBOUND_PERCH_X[i],
      })),
    ],
  },
  {
    id: "forge",
    biome: "forge",
    name: "The Sundered Forge",
    subtitle: "Beyond the Reach — the Forgeheart burns at the far end",
    requiredLevel: 36,
    map: makeMap(3600, [], [
      [900, 180, 26, "lava"],
      [2000, 180, 26, "lava"],
      [3050, 160, 26, "lava"],
    ]),
    spawns: [
      { typeId: "cinderwraith", x: 500 },
      { typeId: "cinderwraith", x: 740 },
      { typeId: "cinder-imp", x: 1050 },
      { typeId: "frostking", x: 1300 },
      { typeId: "cinderwraith", x: 1540 },
      { typeId: "cinder-imp", x: 1900 },
      { typeId: "cinderwraith", x: 2150 },
      { typeId: "frostking", x: 2450 },
      { typeId: "cinderwraith", x: 2960 },
      { typeId: "cinder-imp", x: 3180 },
      { typeId: "forgeheart", x: 3400 },
      ...["cinderwraith", "cinderwraith", "frostking", "cinderwraith", "cinderwraith", "frostking"].map(
        (typeId, i) => ({ typeId, x: FORGE_PERCH_X[i] })
      ),
    ],
  },
  {
    id: "tempest",
    biome: "storm",
    name: "The Tempest Spire",
    subtitle: "Beyond the Forge — a sky fortress adrift in an endless storm",
    requiredLevel: 42,
    map: makeMap(3600, []),
    spawns: [
      { typeId: "stormcaller", x: 500 },
      { typeId: "stormcaller", x: 740 },
      { typeId: "storm-wisp", x: 1050 },
      { typeId: "forgeheart", x: 1300 },
      { typeId: "stormcaller", x: 1540 },
      { typeId: "storm-wisp", x: 1900 },
      { typeId: "stormcaller", x: 2150 },
      { typeId: "forgeheart", x: 2450 },
      { typeId: "stormcaller", x: 2960 },
      { typeId: "storm-wisp", x: 3180 },
      { typeId: "tempestwarden", x: 3400 },
      ...["stormcaller", "stormcaller", "forgeheart", "stormcaller"].map((typeId, i) => ({
        typeId,
        x: TEMPEST_PERCH_X[i],
      })),
    ],
  },
  {
    id: "blight",
    biome: "blight",
    name: "The Blighted Hollow",
    subtitle: "Beyond the Spire — a poisoned grove where nothing living remains",
    requiredLevel: 46,
    map: makeMap(3600, [], [
      [850, 220, 14, "poison"],
      [1900, 220, 14, "poison"],
      [2950, 220, 14, "poison"],
    ]),
    spawns: [
      { typeId: "plaguebound", x: 500 },
      { typeId: "plaguebound", x: 740 },
      { typeId: "tempestwarden", x: 1300 },
      { typeId: "plaguebound", x: 1540 },
      { typeId: "plaguebound", x: 2150 },
      { typeId: "tempestwarden", x: 2450 },
      { typeId: "plaguebound", x: 2960 },
      { typeId: "rotmother", x: 3400 },
      ...["plaguebound", "plaguebound", "tempestwarden", "plaguebound", "plaguebound", "tempestwarden"].map(
        (typeId, i) => ({ typeId, x: BLIGHT_PERCH_X[i] })
      ),
    ],
  },
  {
    id: "throne",
    biome: "divine",
    name: "The Sundered Throne",
    subtitle: "The last road — a shattered heaven where a fallen king still reigns",
    requiredLevel: 50,
    map: makeMap(3600, []),
    spawns: [
      { typeId: "seraphremnant", x: 500 },
      { typeId: "seraphremnant", x: 740 },
      { typeId: "rotmother", x: 1300 },
      { typeId: "seraphremnant", x: 1540 },
      { typeId: "seraphremnant", x: 2150 },
      { typeId: "rotmother", x: 2450 },
      { typeId: "seraphremnant", x: 2960 },
      { typeId: "sunderedking", x: 3400 },
      ...["seraphremnant", "seraphremnant", "rotmother", "seraphremnant", "seraphremnant"].map(
        (typeId, i) => ({ typeId, x: THRONE_PERCH_X[i] })
      ),
    ],
  },
  // Appended at the end rather than slotted in by level, so it never shifts
  // any other stage's array index — existing saves store `stage` as a plain
  // index into this array, and reordering would silently teleport them.
  {
    id: "survival-fields",
    biome: "outskirts",
    name: "The Survival Fields",
    subtitle: "No fixed foes here — just endless waves. How far can you get?",
    requiredLevel: 1,
    survival: true,
    map: makeMap(1800, []),
    spawns: [],
  },
  // Also appended last, for the same array-index-stability reason as
  // survival-fields above.
  {
    id: "boss-rush",
    biome: "divine",
    name: "The Boss Rush",
    subtitle: "Every boss you've faced, back to back. Full heal between each. How fast can you clear it?",
    requiredLevel: 50,
    bossRush: true,
    map: makeMap(2000, []),
    spawns: [],
  },
  // Also appended last, for the same array-index-stability reason.
  {
    id: "crucible",
    biome: "abyss",
    name: "The Sundered Crucible",
    subtitle: "Endless waves, warped by whatever the Crucible rolls this time. Survive as long as you can.",
    requiredLevel: 50,
    survival: true,
    crucible: true,
    map: makeMap(1800, []),
    spawns: [],
  },
  // Also appended last, for the same array-index-stability reason.
  {
    id: "hollow",
    biome: "void",
    name: "The Hollow Beyond",
    subtitle: "Past the Throne, past the last road — whatever's out here was never meant to be found",
    requiredLevel: 50,
    map: makeMap(3600, []),
    spawns: [
      { typeId: "voidling", x: 500 },
      { typeId: "voidling", x: 740 },
      { typeId: "hollowsentinel", x: 1300 },
      { typeId: "voidling", x: 1540 },
      { typeId: "voidling", x: 2150 },
      { typeId: "hollowsentinel", x: 2450 },
      { typeId: "voidling", x: 2960 },
      { typeId: "thehollow", x: 3400 },
      ...["voidling", "voidling", "hollowsentinel", "voidling", "voidling"].map((typeId, i) => ({
        typeId,
        x: HOLLOW_PERCH_X[i],
      })),
    ],
  },
  // Also appended last, for the same array-index-stability reason.
  {
    id: "daily-challenge",
    biome: "abyss",
    name: "The Daily Rift",
    subtitle: "A fixed roster, the same for everyone today. How fast can you clear it?",
    requiredLevel: 20,
    dailyChallenge: true,
    map: makeMap(2000, []),
    spawns: [],
  },
];

/** New characters start in the field, not the town hub. */
export const DEFAULT_STAGE = 1;

export function getStage(index: number): Stage {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
}
