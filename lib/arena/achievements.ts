import { activeSetProgress, base } from "./items";
import { MAX_LEVEL, type AdventureSave } from "./progression";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Doubles as the title text shown next to your name once equipped. */
  title: string;
  check: (save: AdventureSave) => boolean;
  /** Numeric progress toward the goal, for achievements where a partial
   *  fraction is meaningful (kill counts, levels, wave records) — omitted
   *  for binary ones ("Ascend once," "loot a unique") where there's no
   *  useful in-between to show. Powers the "almost there" widget. */
  progress?: (save: AdventureSave) => { current: number; goal: number };
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-blood",
    name: "First Blood",
    description: "Defeat your first enemy.",
    title: "the Blooded",
    check: (s) => s.kills >= 1,
  },
  {
    id: "monster-hunter",
    name: "Monster Hunter",
    description: "Defeat 100 enemies.",
    title: "the Hunter",
    check: (s) => s.kills >= 100,
    progress: (s) => ({ current: s.kills, goal: 100 }),
  },
  {
    id: "exterminator",
    name: "Exterminator",
    description: "Defeat 1,000 enemies.",
    title: "the Exterminator",
    check: (s) => s.kills >= 1000,
    progress: (s) => ({ current: s.kills, goal: 1000 }),
  },
  {
    id: "novice",
    name: "Novice Adventurer",
    description: "Reach level 10.",
    title: "the Novice",
    check: (s) => s.level >= 10,
    progress: (s) => ({ current: s.level, goal: 10 }),
  },
  {
    id: "seasoned",
    name: "Seasoned",
    description: "Reach level 25.",
    title: "the Seasoned",
    check: (s) => s.level >= 25,
    progress: (s) => ({ current: s.level, goal: 25 }),
  },
  {
    id: "level-cap",
    name: "Level Cap",
    description: `Reach level ${MAX_LEVEL}.`,
    title: "the Accomplished",
    check: (s) => s.level >= MAX_LEVEL,
    progress: (s) => ({ current: s.level, goal: MAX_LEVEL }),
  },
  {
    id: "ascended",
    name: "Ascended",
    description: "Ascend for the first time.",
    title: "the Ascended",
    check: (s) => (s.ascension ?? 0) >= 1,
  },
  {
    id: "transcendent",
    name: "Transcendent",
    description: "Reach Ascension rank 5.",
    title: "the Transcendent",
    check: (s) => (s.ascension ?? 0) >= 5,
    progress: (s) => ({ current: s.ascension ?? 0, goal: 5 }),
  },
  {
    id: "named-and-claimed",
    name: "Named and Claimed",
    description: "Loot a unique item.",
    title: "Keeper of Relics",
    check: (s) =>
      [...s.inventory, ...s.storage, ...Object.values(s.equipped)].some(
        (i) => i && base(i.baseId).unique
      ),
  },
  {
    id: "set-complete",
    name: "Set Complete",
    description: "Equip 8 pieces from the same gear set.",
    title: "the Attuned",
    check: (s) => activeSetProgress(s.equipped).some((p) => p.count >= 8),
    progress: (s) => ({
      current: Math.max(0, ...activeSetProgress(s.equipped).map((p) => p.count), 0),
      goal: 8,
    }),
  },
  {
    id: "fully-attuned",
    name: "Fully Attuned",
    description: "Equip all 11 pieces from the same gear set.",
    title: "the Mythic",
    check: (s) => activeSetProgress(s.equipped).some((p) => p.count >= 11),
    progress: (s) => ({
      current: Math.max(0, ...activeSetProgress(s.equipped).map((p) => p.count), 0),
      goal: 11,
    }),
  },
  {
    id: "wealthy",
    name: "Wealthy",
    description: "Hold 10,000 gold at once.",
    title: "the Wealthy",
    check: (s) => s.gold >= 10000,
    progress: (s) => ({ current: s.gold, goal: 10000 }),
  },
  {
    id: "overclocked",
    name: "Overclocked",
    description: "Enhance an equipped item to +10.",
    title: "the Overclocked",
    check: (s) => Object.values(s.equipped).some((i) => i && i.plus >= 10),
    progress: (s) => ({
      current: Math.max(0, ...Object.values(s.equipped).map((i) => i?.plus ?? 0), 0),
      goal: 10,
    }),
  },
  {
    id: "survivor",
    name: "Survivor",
    description: "Reach wave 10 in the Survival Fields.",
    title: "the Unyielding",
    check: (s) => (s.bestSurvivalWave ?? 0) >= 10,
    progress: (s) => ({ current: s.bestSurvivalWave ?? 0, goal: 10 }),
  },
  {
    id: "crucible-forged",
    name: "Crucible-Forged",
    description: "Reach wave 10 in the Sundered Crucible.",
    title: "Crucible-Forged",
    check: (s) => (s.bestCrucibleWave ?? 0) >= 10,
    progress: (s) => ({ current: s.bestCrucibleWave ?? 0, goal: 10 }),
  },
  {
    id: "gauntlet-runner",
    name: "Gauntlet Runner",
    description: "Clear the Boss Rush.",
    title: "the Gauntlet Runner",
    check: (s) => s.bestBossRushTime !== undefined,
  },
];

/** Runs every check against the save and returns any newly-unlocked ids.
 *  Pure — does not mutate the save or `achievements` list; the caller
 *  (AdventureClient's hud tick) decides what to do with the result. */
export function checkNewAchievements(save: AdventureSave): string[] {
  const already = new Set(save.achievements ?? []);
  return ACHIEVEMENTS.filter((a) => !already.has(a.id) && a.check(save)).map((a) => a.id);
}

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Cosmetic-only rim-glow colors, each unlocked by a specific achievement —
 *  purely a "flex" layer with zero stat effect (see Fighter.auraOverride
 *  and paletteFor in render.ts). */
export const AURA_UNLOCKS: Array<{ achievementId: string; color: string; label: string }> = [
  { achievementId: "level-cap", color: "#fffbeb", label: "Radiant White" },
  { achievementId: "transcendent", color: "#c4b5fd", label: "Ascendant Violet" },
  { achievementId: "fully-attuned", color: "#fbbf24", label: "Molten Gold" },
  { achievementId: "gauntlet-runner", color: "#38bdf8", label: "Gauntlet Cyan" },
  { achievementId: "exterminator", color: "#dc2626", label: "Exterminator Red" },
];

export function unlockedAuras(save: AdventureSave): typeof AURA_UNLOCKS {
  const unlocked = new Set(save.achievements ?? []);
  return AURA_UNLOCKS.filter((a) => unlocked.has(a.achievementId));
}

/** The not-yet-unlocked achievement closest to completion, for the
 *  "almost there" widget — only considers achievements with a meaningful
 *  numeric progress, so a binary one (Ascend once) never crowds it out. */
export function nearestAchievement(
  save: AdventureSave
): { achievement: Achievement; current: number; goal: number; pct: number } | null {
  const already = new Set(save.achievements ?? []);
  let best: { achievement: Achievement; current: number; goal: number; pct: number } | null = null;
  for (const a of ACHIEVEMENTS) {
    if (already.has(a.id) || !a.progress) continue;
    const { current, goal } = a.progress(save);
    if (current >= goal) continue; // completes next tick's checkNewAchievements pass
    const pct = goal > 0 ? current / goal : 0;
    if (!best || pct > best.pct) best = { achievement: a, current, goal, pct };
  }
  return best;
}
