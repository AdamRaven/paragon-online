import { MOB_TYPES } from "./mobs";
import type { AdventureSave } from "./progression";

/** Common, widely-spawning mob types only — a bounty has to be achievable
 *  no matter which stage the player happens to be farming today. */
const BOUNTY_POOL = [
  "husk",
  "brawler",
  "rabid-cur",
  "blade-wraith",
  "cultist",
  "shieldbearer",
  "colossus",
  "revenant",
  "sentinel",
  "frostfang",
];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Deterministic per-day, per-character pick — same bounty all day, a fresh
 *  one tomorrow, no server needed to keep it "daily." */
function seededIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

/** Rolls a fresh bounty if the date has rolled over since the last one (or
 *  there's never been one) — a no-op otherwise. Call before reading
 *  `save.dailyBounty` anywhere it needs to exist. */
export function ensureDailyBounty(save: AdventureSave): void {
  const date = todayKey();
  if (save.dailyBounty && save.dailyBounty.date === date) return;
  const typeId = BOUNTY_POOL[seededIndex(date + save.classId, BOUNTY_POOL.length)];
  const goal = 8 + seededIndex(date + save.classId + "goal", 8);
  save.dailyBounty = {
    date,
    typeId,
    goal,
    baseline: save.mobKills?.[typeId] ?? 0,
    claimed: false,
  };
}

/** Kills of the bounty's target type since it was rolled. */
export function bountyProgress(save: AdventureSave): number {
  if (!save.dailyBounty) return 0;
  const total = save.mobKills?.[save.dailyBounty.typeId] ?? 0;
  return Math.max(0, total - save.dailyBounty.baseline);
}

export function bountyComplete(save: AdventureSave): boolean {
  return !!save.dailyBounty && bountyProgress(save) >= save.dailyBounty.goal;
}

export function bountyMobName(typeId: string): string {
  return MOB_TYPES[typeId]?.name ?? typeId;
}

/** Reward scales lightly with the character's own level, so it stays worth
 *  claiming even once the early bounty pool is trivial to clear. */
export function bountyReward(save: AdventureSave): { gold: number; stones: number } {
  return { gold: 200 + save.level * 20, stones: 3 };
}
