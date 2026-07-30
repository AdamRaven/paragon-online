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
  | "divine";

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
    map: makeMap(2000, [[0, 2000]], []),
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
  {
    id: "sanctum",
    biome: "abyss",
    name: "The Abyssal Sanctum",
    subtitle: "Beyond the Keep — the Sovereign holds court at the far end",
    requiredLevel: 20,
    map: makeMap(
      3500,
      [
        [0, 760],
        [1080, 640],
        [1980, 680],
        [2940, 560],
      ],
      [
        [820, 380, 220],
        [1680, 370, 220],
        [2380, 390, 220],
        [3080, 380, 220],
      ]
    ),
    spawns: [
      { typeId: "revenant", x: 480 },
      { typeId: "colossus", x: 700 },
      { typeId: "revenant", x: 1300 },
      { typeId: "blade-wraith", x: 1520 },
      { typeId: "revenant", x: 2100 },
      { typeId: "revenant", x: 2420 },
      { typeId: "colossus", x: 2700 },
      { typeId: "sovereign", x: 3300 },
    ],
  },
  {
    id: "frostbound",
    biome: "frost",
    name: "The Frostbound Reach",
    subtitle: "Beyond the Sanctum — the Frostking rules an endless winter",
    requiredLevel: 28,
    map: makeMap(
      3600,
      [
        [0, 780],
        [1040, 660],
        [1960, 700],
        [2920, 680],
      ],
      [
        [800, 380, 220],
        [1720, 370, 220],
        [2340, 390, 220],
        [3060, 380, 220],
      ]
    ),
    spawns: [
      { typeId: "frostfang", x: 500 },
      { typeId: "frostfang", x: 740 },
      { typeId: "revenant", x: 1300 },
      { typeId: "frostfang", x: 1540 },
      { typeId: "frostfang", x: 2150 },
      { typeId: "sovereign", x: 2450 },
      { typeId: "frostfang", x: 2960 },
      { typeId: "frostking", x: 3400 },
    ],
  },
  {
    id: "forge",
    biome: "forge",
    name: "The Sundered Forge",
    subtitle: "Beyond the Reach — the Forgeheart burns at the far end",
    requiredLevel: 36,
    map: makeMap(
      3600,
      [
        [0, 780],
        [1040, 660],
        [1960, 700],
        [2920, 680],
      ],
      [
        [800, 380, 220],
        [1720, 370, 220],
        [2340, 390, 220],
        [3060, 380, 220],
      ]
    ),
    spawns: [
      { typeId: "cinderwraith", x: 500 },
      { typeId: "cinderwraith", x: 740 },
      { typeId: "frostking", x: 1300 },
      { typeId: "cinderwraith", x: 1540 },
      { typeId: "cinderwraith", x: 2150 },
      { typeId: "frostking", x: 2450 },
      { typeId: "cinderwraith", x: 2960 },
      { typeId: "forgeheart", x: 3400 },
    ],
  },
  {
    id: "tempest",
    biome: "storm",
    name: "The Tempest Spire",
    subtitle: "Beyond the Forge — a sky fortress adrift in an endless storm",
    requiredLevel: 42,
    map: makeMap(
      3600,
      [
        [0, 780],
        [1040, 660],
        [1960, 700],
        [2920, 680],
      ],
      [
        [800, 380, 220],
        [1720, 370, 220],
        [2340, 390, 220],
        [3060, 380, 220],
      ]
    ),
    spawns: [
      { typeId: "stormcaller", x: 500 },
      { typeId: "stormcaller", x: 740 },
      { typeId: "forgeheart", x: 1300 },
      { typeId: "stormcaller", x: 1540 },
      { typeId: "stormcaller", x: 2150 },
      { typeId: "forgeheart", x: 2450 },
      { typeId: "stormcaller", x: 2960 },
      { typeId: "tempestwarden", x: 3400 },
    ],
  },
  {
    id: "blight",
    biome: "blight",
    name: "The Blighted Hollow",
    subtitle: "Beyond the Spire — a poisoned grove where nothing living remains",
    requiredLevel: 46,
    map: makeMap(
      3600,
      [
        [0, 780],
        [1040, 660],
        [1960, 700],
        [2920, 680],
      ],
      [
        [800, 380, 220],
        [1720, 370, 220],
        [2340, 390, 220],
        [3060, 380, 220],
      ]
    ),
    spawns: [
      { typeId: "plaguebound", x: 500 },
      { typeId: "plaguebound", x: 740 },
      { typeId: "tempestwarden", x: 1300 },
      { typeId: "plaguebound", x: 1540 },
      { typeId: "plaguebound", x: 2150 },
      { typeId: "tempestwarden", x: 2450 },
      { typeId: "plaguebound", x: 2960 },
      { typeId: "rotmother", x: 3400 },
    ],
  },
  {
    id: "throne",
    biome: "divine",
    name: "The Sundered Throne",
    subtitle: "The last road — a shattered heaven where a fallen king still reigns",
    requiredLevel: 50,
    map: makeMap(
      3600,
      [
        [0, 780],
        [1040, 660],
        [1960, 700],
        [2920, 680],
      ],
      [
        [800, 380, 220],
        [1720, 370, 220],
        [2340, 390, 220],
        [3060, 380, 220],
      ]
    ),
    spawns: [
      { typeId: "seraphremnant", x: 500 },
      { typeId: "seraphremnant", x: 740 },
      { typeId: "rotmother", x: 1300 },
      { typeId: "seraphremnant", x: 1540 },
      { typeId: "seraphremnant", x: 2150 },
      { typeId: "rotmother", x: 2450 },
      { typeId: "seraphremnant", x: 2960 },
      { typeId: "sunderedking", x: 3400 },
    ],
  },
];

/** New characters start in the field, not the town hub. */
export const DEFAULT_STAGE = 1;

export function getStage(index: number): Stage {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
}
