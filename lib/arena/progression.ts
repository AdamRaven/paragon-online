import { equippedStats, type EquipSlot, type Item } from "./items";
import { DEFAULT_STAGE } from "./mobs";
import type { ClassDef } from "./types";

export const MAX_LEVEL = 50;
export const SAVE_VERSION = 1;
export const STAT_POINTS_PER_LEVEL = 3;
/**
 * Every class starts with 5 in each stat, and that allocation is treated as
 * the baseline. A level-1 fighter therefore has exactly the class's specified
 * numbers (Paragon 500 HP / 200 mana / 10 AP) and plays identically to the
 * duel; only points spent *above* 5 change anything.
 */
export const BASE_STAT = 5;

export type StatKey = "str" | "agi" | "vit" | "foc";

export interface Stats {
  str: number;
  agi: number;
  vit: number;
  foc: number;
}

export const STAT_META: Record<
  StatKey,
  { label: string; short: string; blurb: string; color: string }
> = {
  str: {
    label: "Strength",
    short: "STR",
    blurb: "Raises attack power, which scales every attack and skill.",
    color: "#ff7a59",
  },
  agi: {
    label: "Agility",
    short: "AGI",
    blurb: "Increases movement speed and shortens every attack animation.",
    color: "#6ee7b7",
  },
  vit: {
    label: "Vitality",
    short: "VIT",
    blurb: "Increases maximum health.",
    color: "#f472b6",
  },
  foc: {
    label: "Focus",
    short: "FOC",
    blurb: "Increases your maximum mana pool.",
    color: "#60a5fa",
  },
};

export interface AdventureSave {
  version: number;
  classId: string;
  level: number;
  exp: number;
  statPoints: number;
  stats: Stats;
  kills: number;
  deaths: number;
  stage: number;
  /** Backpack contents, including trash waiting to be sold. */
  inventory: Item[];
  equipped: Partial<Record<EquipSlot, Item>>;
  gold: number;
  stones: number;
}

/** Experience needed to advance from `level` to `level + 1`. */
export function expToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.floor(70 * Math.pow(level, 1.42) + 45 * level);
}

export interface DerivedArenaStats {
  maxHp: number;
  maxMana: number;
  attackPower: number;
  /** Multiplier on walk/sprint speed. */
  speedMult: number;
  /** Multiplier on how fast attack animations advance. */
  attackSpeed: number;
  power: number;
}

/**
 * Layers level and allocated stats on top of the class's fixed base numbers,
 * so a Paragon still starts at 500 HP / 200 mana / 10 attack power.
 */
export function deriveArenaStats(
  cls: ClassDef,
  level: number,
  stats: Stats,
  equipped: Partial<Record<EquipSlot, Item>> = {}
): DerivedArenaStats {
  const gear = equippedStats(equipped);
  const str = stats.str - BASE_STAT;
  const agi = stats.agi - BASE_STAT;
  const vit = stats.vit - BASE_STAT;
  const foc = stats.foc - BASE_STAT;

  const maxHp = Math.round(cls.maxHp + vit * 18 + (level - 1) * 14 + gear.hp);
  const maxMana = Math.round(cls.maxMana + foc * 7 + gear.mana);
  const attackPower = cls.attackPower + str * 2.2 + (level - 1) * 1.6 + gear.attack;
  const speedMult =
    1 + Math.min(0.4, Math.max(0, agi) * 0.013) + gear.speed;
  const attackSpeed = 1 + Math.min(0.35, Math.max(0, agi) * 0.009);
  const power = Math.round(
    attackPower * 12 + maxHp * 0.8 + maxMana * 0.5 + level * 25
  );
  return { maxHp, maxMana, attackPower, speedMult, attackSpeed, power };
}

export interface LevelUpResult {
  levelsGained: number;
  newLevel: number;
  statPointsGained: number;
}

export function grantExp(save: AdventureSave, amount: number): LevelUpResult {
  const start = save.level;
  save.exp += Math.max(0, Math.round(amount));
  while (save.level < MAX_LEVEL && save.exp >= expToNext(save.level)) {
    save.exp -= expToNext(save.level);
    save.level += 1;
    save.statPoints += STAT_POINTS_PER_LEVEL;
  }
  if (save.level >= MAX_LEVEL) save.exp = 0;
  const levelsGained = save.level - start;
  return {
    levelsGained,
    newLevel: save.level,
    statPointsGained: levelsGained * STAT_POINTS_PER_LEVEL,
  };
}

/** Enemies far below your level stop being worth farming. */
export function expWithLevelPenalty(
  playerLevel: number,
  mobLevel: number,
  base: number
): number {
  const gap = playerLevel - mobLevel;
  if (gap <= 2) return base;
  return Math.max(1, Math.round(base * Math.max(0.05, 1 - (gap - 2) * 0.18)));
}

export function createAdventureSave(classId: string): AdventureSave {
  return {
    version: SAVE_VERSION,
    classId,
    level: 1,
    exp: 0,
    statPoints: 0,
    stats: { str: 5, agi: 5, vit: 5, foc: 5 },
    kills: 0,
    deaths: 0,
    stage: DEFAULT_STAGE,
    inventory: [],
    equipped: {},
    gold: 0,
    stones: 0,
  };
}

const KEY = "paragon-arena:adventure:v1";

export function loadAdventure(): AdventureSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdventureSave>;
    const base = createAdventureSave(parsed.classId ?? "paragon");
    return {
      ...base,
      ...parsed,
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      inventory: parsed.inventory ?? [],
      equipped: parsed.equipped ?? {},
      gold: parsed.gold ?? 0,
      stones: parsed.stones ?? 0,
      version: SAVE_VERSION,
    };
  } catch {
    return null;
  }
}

export function saveAdventure(save: AdventureSave) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode: the run just won't persist */
  }
}

export function clearAdventure() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
