import type { AttackSpec, ArenaMap } from "./types";

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
};

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
  };
}

export interface MobSpawn {
  typeId: string;
  x: number;
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
  /** The enhancer: sells trash + gear, buys stones, enhances weapons. */
  npcX?: number;
  /** The gear vendor: sells fresh gear for gold. */
  vendorX?: number;
  /** The bank keeper: stores items outside the backpack. */
  bankX?: number;
  /** Drives the backdrop the renderer paints for this stage. */
  biome: Biome;
}

export type Biome = "town" | "outskirts" | "undercity" | "keep";

const GROUND_Y = 560;

/** Builds a side-scrolling level with gaps and one-way platforms. */
function makeMap(
  width: number,
  segments: Array<[number, number]>,
  platforms: Array<[number, number, number]>
): ArenaMap {
  return {
    width,
    height: 720,
    ground: segments.map(([x, w]) => ({ x, w, y: GROUND_Y })),
    platforms: platforms.map(([x, y, w]) => ({ x, y, w, oneWay: true })),
    spawnA: { x: 120, y: GROUND_Y - 60 },
    spawnB: { x: width - 120, y: GROUND_Y - 60 },
    killY: 760,
  };
}

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
    map: makeMap(2000, [[0, 2000]], [[420, 410, 200], [900, 400, 200], [1380, 410, 200]]),
    spawns: [],
  },
  {
    id: "outskirts",
    biome: "outskirts",
    name: "The Outskirts",
    subtitle: "Where the husks wander",
    requiredLevel: 1,
    map: makeMap(
      2600,
      [
        [0, 900],
        [1200, 700],
        [2100, 500],
      ],
      [
        [940, 400, 220],
        [1980, 400, 200],
        [400, 410, 180],
      ]
    ),
    spawns: [
      { typeId: "husk", x: 500 },
      { typeId: "husk", x: 700 },
      { typeId: "husk", x: 1350 },
      { typeId: "husk", x: 1600 },
      { typeId: "brawler", x: 1500 },
      { typeId: "brawler", x: 2250 },
      { typeId: "husk", x: 2400 },
    ],
  },
  {
    id: "undercity",
    biome: "undercity",
    name: "The Undercity",
    subtitle: "Brawlers and wraiths in the dark",
    requiredLevel: 5,
    map: makeMap(
      3000,
      [
        [0, 760],
        [1060, 620],
        [1980, 560],
        [2740, 260],
      ],
      [
        [800, 400, 220],
        [1740, 390, 200],
        [2580, 400, 200],
        [300, 400, 180],
      ]
    ),
    spawns: [
      { typeId: "brawler", x: 420 },
      { typeId: "brawler", x: 640 },
      { typeId: "blade-wraith", x: 1200 },
      { typeId: "blade-wraith", x: 1450 },
      { typeId: "brawler", x: 2100 },
      { typeId: "blade-wraith", x: 2300 },
      { typeId: "colossus", x: 2450 },
      { typeId: "blade-wraith", x: 2820 },
    ],
  },
  {
    id: "warden-keep",
    biome: "keep",
    name: "Warden's Keep",
    subtitle: "The Warden is waiting at the far end",
    requiredLevel: 12,
    map: makeMap(
      3200,
      [
        [0, 820],
        [1120, 640],
        [2060, 1140],
      ],
      [
        [880, 390, 220],
        [1820, 390, 220],
        [2500, 400, 220],
      ]
    ),
    spawns: [
      { typeId: "colossus", x: 480 },
      { typeId: "blade-wraith", x: 660 },
      { typeId: "colossus", x: 1300 },
      { typeId: "blade-wraith", x: 1500 },
      { typeId: "colossus", x: 2200 },
      { typeId: "blade-wraith", x: 2400 },
      { typeId: "warden", x: 2950 },
    ],
  },
];

/** New characters start in the field, not the town hub. */
export const DEFAULT_STAGE = 1;

export function getStage(index: number): Stage {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
}
