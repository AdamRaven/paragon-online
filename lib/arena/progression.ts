import {
  equippedEffects,
  equippedSetEffects,
  equippedSetStats,
  equippedStats,
  STORAGE_BASE_CAP,
  type EquipSlot,
  type Item,
} from "./items";
import { DEFAULT_STAGE } from "./mobs";
import type { ClassDef, ClassId } from "./types";

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

export type Difficulty = "normal" | "hard" | "nightmare";

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; blurb: string }
> = {
  normal: { label: "Normal", blurb: "The standard campaign." },
  hard: { label: "Hard", blurb: "Tougher, harder-hitting foes for better loot." },
  nightmare: {
    label: "Nightmare",
    blurb: "Brutal enemies and the best drop odds in the game.",
  },
};

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
  /** Items parked at the bank — doesn't count against anything, just storage. */
  storage: Item[];
  gold: number;
  stones: number;
  /** Best wave ever reached in the Survival Fields. */
  bestSurvivalWave?: number;
  /** Best wave ever reached in the Sundered Crucible (tracked separately —
   *  its rotating affixes make it a different challenge, not just Survival
   *  under a new name). */
  bestCrucibleWave?: number;
  /** Times this character has Ascended — see ascend() below. Each one is a
   *  permanent, stacking stat multiplier, since level itself caps at 50. */
  ascension?: number;
  /** Chosen at creation and fixed for the character's life — see
   *  DIFFICULTY_STAT_MULT/DIFFICULTY_LOOT_BONUS in adventure.ts. */
  difficulty?: Difficulty;
  /** Fastest Boss Rush clear, in seconds — see AdventureEngine.bossRushTime. */
  bestBossRushTime?: number;
  /** Achievement ids already unlocked — see lib/arena/achievements.ts. */
  achievements?: string[];
  /** The unlocked achievement currently shown next to your name, if any. */
  title?: string;
  /** How many items `storage` can hold before the bank keeper needs paying
   *  for more room — see STORAGE_BASE_CAP below. Never enforced
   *  retroactively: a save already over cap just can't deposit more. */
  storageCap?: number;
  /** Lifetime kills per MobType id, for the Bestiary and bounty progress —
   *  separate from the aggregate `kills` above, which never broke it down. */
  mobKills?: Record<string, number>;
  /** Today's bounty board objective — see lib/arena/bounties.ts. `baseline`
   *  is the lifetime mobKills count for `typeId` at roll time, since kills
   *  themselves are only ever tracked cumulatively. */
  dailyBounty?: { date: string; typeId: string; goal: number; baseline: number; claimed: boolean };
  /** Wall-clock timestamp (Date.now()-based) the hired mercenary expires at
   *  — real time, not play time, so it keeps ticking even between sessions,
   *  the same way an actual "rental" would. */
  mercenaryExpiresAt?: number;
  /** Which class was hired, so a page reload mid-rental respawns the same one. */
  mercenaryClassId?: ClassId;
  /** Base ids of every unique ever looted, kept even if later sold — powers
   *  the "own every unique" completion check. */
  uniquesFound?: string[];
  /** Whether the run-complete summary has already been shown once. */
  seenRunComplete?: boolean;
  /** Calendar date (YYYY-M-D) of the last claimed daily login bonus. */
  lastLoginDate?: string;
  /** Consecutive days claimed — resets to 1 if a day is missed. */
  loginStreak?: number;
  /** Wall-clock timestamp of the last time this save was actively playing —
   *  powers the capped "welcome back" idle bonus. */
  lastSeenAt?: number;
  /** Hex color unlocked via achievements and equipped for the aura/rim-glow
   *  effect — purely cosmetic, no stat difference from the class default. */
  auraColor?: string;
  /** ISO week key (e.g. "2026-W05") of the last-rolled weekly track, and
   *  which milestone indices have been claimed within it. */
  weeklyKey?: string;
  weeklyBaseline?: number;
  weeklyClaimed?: number[];
  /** Whether the player is currently parked at the town lake fishing — real
   *  time, not play time, so it keeps paying out while the tab just sits
   *  open (or even closed, up to FISH_CAP_MS) rather than requiring active
   *  input. See AdventureEngine.toggleFishing/collectFishing. */
  fishing?: boolean;
  /** Wall-clock timestamp fish catches were last collected up to. */
  lastFishTick?: number;
  /** Lifetime fish caught, just for the character sheet — the fish
   *  themselves land in `inventory` as regular sellable trash items. */
  fishCaught?: number;
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
  /** Legendary gear affixes, 0 unless something equipped rolled one. */
  lifesteal: number;
  negation: number;
  regenHp: number;
  regenMana: number;
}

/** Permanent bonus per Ascension (see ascend()) — flat +5% to the three core
 *  combat numbers, stacking additively so 10 ascensions is +50%, not runaway
 *  compounding growth. */
const ASCENSION_BONUS_PER_RANK = 0.05;

/**
 * Layers level and allocated stats on top of the class's fixed base numbers,
 * so a Paragon still starts at 500 HP / 200 mana / 10 attack power.
 */
export function deriveArenaStats(
  cls: ClassDef,
  level: number,
  stats: Stats,
  equipped: Partial<Record<EquipSlot, Item>> = {},
  ascension = 0
): DerivedArenaStats {
  const gear = equippedStats(equipped);
  const gearSet = equippedSetStats(equipped);
  const fx = equippedEffects(equipped);
  const fxSet = equippedSetEffects(equipped);
  const str = stats.str - BASE_STAT;
  const agi = stats.agi - BASE_STAT;
  const vit = stats.vit - BASE_STAT;
  const foc = stats.foc - BASE_STAT;
  const ascendMult = 1 + Math.max(0, ascension) * ASCENSION_BONUS_PER_RANK;

  const maxHp = Math.round(
    (cls.maxHp + vit * 18 + (level - 1) * 14 + gear.hp + gearSet.hp) * ascendMult
  );
  const maxMana = Math.round((cls.maxMana + foc * 7 + gear.mana + gearSet.mana) * ascendMult);
  const attackPower =
    (cls.attackPower + str * 2.2 + (level - 1) * 1.6 + gear.attack + gearSet.attack) *
    ascendMult;
  const speedMult =
    1 + Math.min(0.4, Math.max(0, agi) * 0.013) + gear.speed + gearSet.speed;
  const attackSpeed =
    1 + Math.min(0.35, Math.max(0, agi) * 0.009) + gear.atkSpeed + gearSet.atkSpeed;
  const power = Math.round(
    attackPower * 12 + maxHp * 0.8 + maxMana * 0.5 + level * 25
  );
  const regenHp = fx.regenHp + fxSet.regenHp;
  return {
    maxHp,
    maxMana,
    attackPower,
    speedMult,
    attackSpeed,
    power,
    lifesteal: Math.min(0.5, fx.lifesteal + fxSet.lifesteal),
    negation: Math.min(0.6, fx.negation + fxSet.negation),
    regenHp,
    regenMana: Math.round(regenHp * 0.6),
  };
}

/**
 * Level caps at MAX_LEVEL, so without this there's nothing left to chase —
 * Ascending resets level/exp back to 1 (keeping gear, gold, kills, stat
 * points already spent) in exchange for a permanent stat-multiplier rank
 * that compounds with every future run to 50. Returns false (no-op) if the
 * character isn't actually at the cap yet.
 */
export function ascend(save: AdventureSave): boolean {
  if (save.level < MAX_LEVEL) return false;
  save.ascension = (save.ascension ?? 0) + 1;
  save.level = 1;
  save.exp = 0;
  return true;
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

export function createAdventureSave(
  classId: string,
  difficulty: Difficulty = "normal"
): AdventureSave {
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
    storage: [],
    gold: 0,
    stones: 0,
    bestSurvivalWave: 0,
    bestCrucibleWave: 0,
    ascension: 0,
    difficulty,
    bestBossRushTime: undefined,
    achievements: [],
    title: undefined,
    storageCap: STORAGE_BASE_CAP,
    mobKills: {},
    dailyBounty: undefined,
    mercenaryExpiresAt: undefined,
    mercenaryClassId: undefined,
    uniquesFound: [],
    seenRunComplete: false,
    fishing: false,
    lastFishTick: undefined,
    fishCaught: 0,
  };
}

const KEY = "paragon-arena:adventure:v1";

/**
 * Old saves equipped gear under slot keys from two earlier layouts: "armor"/
 * "trinket" (the single body-armour and single-accessory slots from before
 * helmet/legs/hands existed at all), then "accessory1"/"accessory2" (before
 * those two split further into necklace/belt/2 earrings/2 rings). Without
 * this, an existing player's already-equipped pieces would silently vanish
 * on load: equipping removes an item from the backpack, so an old slot key
 * nothing reads anymore just loses the gear entirely.
 */
function migrateEquipped(
  equipped: Partial<Record<string, Item>> | undefined
): Partial<Record<EquipSlot, Item>> {
  if (!equipped) return {};
  const migrated: Partial<Record<EquipSlot, Item>> = { ...equipped };
  const legacy = equipped as Record<string, Item | undefined>;
  if (legacy.armor && !migrated.chest) migrated.chest = legacy.armor;
  // "trinket" only ever existed alongside "armor", one layout further back
  // than "accessory1" — route it straight to its final home.
  if (legacy.trinket && !migrated.necklace) migrated.necklace = legacy.trinket;
  if (legacy.accessory1 && !migrated.necklace) migrated.necklace = legacy.accessory1;
  if (legacy.accessory2 && !migrated.ring1) migrated.ring1 = legacy.accessory2;
  for (const stale of ["armor", "trinket", "accessory1", "accessory2"]) {
    delete (migrated as Record<string, Item | undefined>)[stale];
  }
  return migrated;
}

/** Fills in every field a partial/old/imported save might be missing,
 *  the same defaulting loadAdventure has always done — pulled out so
 *  importAdventureSave (a save restored from an exported JSON file) gets
 *  identical treatment instead of trusting the file's shape outright. */
function normalizeAdventure(parsed: Partial<AdventureSave>): AdventureSave {
  const base = createAdventureSave(parsed.classId ?? "paragon");
  return {
    ...base,
    ...parsed,
    stats: { ...base.stats, ...(parsed.stats ?? {}) },
    inventory: parsed.inventory ?? [],
    equipped: migrateEquipped(parsed.equipped),
    storage: parsed.storage ?? [],
    gold: parsed.gold ?? 0,
    stones: parsed.stones ?? 0,
    version: SAVE_VERSION,
  };
}

export function loadAdventure(): AdventureSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeAdventure(JSON.parse(raw) as Partial<AdventureSave>);
  } catch {
    return null;
  }
}

/** Restores a save from a previously-exported JSON file (see
 *  exportAdventureSave in AdventureClient) — same field-by-field defaulting
 *  as loading from localStorage, so an older export still loads cleanly.
 *  Returns null (rather than throwing) on anything that isn't recognisably
 *  a Paragon save. */
export function importAdventureSave(json: string): AdventureSave | null {
  try {
    const parsed = JSON.parse(json) as Partial<AdventureSave>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.classId !== "string") {
      return null;
    }
    return normalizeAdventure(parsed);
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
