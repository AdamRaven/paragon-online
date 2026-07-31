import type { AdventureSave } from "./progression";

/** ISO-ish week key: year + week number (Monday-start), stable enough for
 *  "same week" comparisons without pulling in a date library. */
function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

/** Milestones measured in kills accumulated since the week's baseline —
 *  reuses save.kills (a lifetime counter) the same way bounties.ts reuses
 *  mobKills, just against the whole-run total instead of one mob type. */
export const WEEKLY_MILESTONES: Array<{ goal: number; gold: number; stones: number }> = [
  { goal: 40, gold: 300, stones: 5 },
  { goal: 120, gold: 700, stones: 10 },
  { goal: 300, gold: 1500, stones: 20 },
  { goal: 600, gold: 3000, stones: 35 },
  { goal: 1000, gold: 5000, stones: 50 },
];

/** Rolls a fresh weekly track if the week has rolled over — a no-op otherwise. */
export function ensureWeeklyTrack(save: AdventureSave): void {
  const key = weekKey();
  if (save.weeklyKey === key) return;
  save.weeklyKey = key;
  save.weeklyBaseline = save.kills;
  save.weeklyClaimed = [];
}

export function weeklyProgress(save: AdventureSave): number {
  ensureWeeklyTrack(save);
  return Math.max(0, save.kills - (save.weeklyBaseline ?? 0));
}

export function claimWeeklyMilestone(save: AdventureSave, index: number): boolean {
  ensureWeeklyTrack(save);
  const m = WEEKLY_MILESTONES[index];
  if (!m) return false;
  const claimed = save.weeklyClaimed ?? (save.weeklyClaimed = []);
  if (claimed.includes(index)) return false;
  if (weeklyProgress(save) < m.goal) return false;
  claimed.push(index);
  save.gold += m.gold;
  save.stones += m.stones;
  return true;
}
