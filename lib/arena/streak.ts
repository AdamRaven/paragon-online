import type { AdventureSave } from "./progression";

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

/** Reward grows with the streak but caps out — day 10 isn't 10x day 1, just
 *  meaningfully better, so a long streak stays worth keeping without making
 *  a missed day catastrophic. */
export function loginRewardForStreak(streak: number): { gold: number; stones: number } {
  const capped = Math.min(streak, 14);
  return { gold: 60 + capped * 25, stones: Math.floor(capped / 2) };
}

export interface LoginClaimResult {
  streak: number;
  gold: number;
  stones: number;
  brokeStreak: boolean;
}

/** Claims today's login bonus if it hasn't been claimed yet — a no-op
 *  (returns null) if today's was already claimed. Call once per engine
 *  boot, not per frame. */
export function claimDailyLogin(save: AdventureSave): LoginClaimResult | null {
  const today = todayKey();
  if (save.lastLoginDate === today) return null;

  const brokeStreak = save.lastLoginDate !== undefined && save.lastLoginDate !== yesterdayKey();
  const streak = brokeStreak || save.loginStreak === undefined ? 1 : save.loginStreak + 1;
  save.lastLoginDate = today;
  save.loginStreak = streak;

  const reward = loginRewardForStreak(streak);
  save.gold += reward.gold;
  save.stones += reward.stones;
  return { streak, ...reward, brokeStreak };
}
