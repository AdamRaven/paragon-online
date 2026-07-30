/**
 * Persistent Duel-mode record. Adventure mode has its own save
 * (progression.ts / "paragon-arena:adventure:v1") tracking level/gear/kills;
 * duels are otherwise stateless between matches, so this is a small,
 * separate localStorage-backed record just for win/loss and streaks.
 */
export interface DuelStats {
  wins: number;
  losses: number;
  winStreak: number;
  bestStreak: number;
}

function defaultStats(): DuelStats {
  return { wins: 0, losses: 0, winStreak: 0, bestStreak: 0 };
}

const KEY = "paragon-arena:duel:v1";

export function loadDuelStats(): DuelStats {
  if (typeof window === "undefined") return defaultStats();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultStats();
    return { ...defaultStats(), ...(JSON.parse(raw) as Partial<DuelStats>) };
  } catch {
    return defaultStats();
  }
}

function saveDuelStats(stats: DuelStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* private mode: the record just won't persist */
  }
}

/** Call once per finished duel. Returns the updated record. */
export function recordDuelResult(won: boolean): DuelStats {
  const stats = loadDuelStats();
  if (won) {
    stats.wins += 1;
    stats.winStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.winStreak);
  } else {
    stats.losses += 1;
    stats.winStreak = 0;
  }
  saveDuelStats(stats);
  return stats;
}

/** Streak-milestone title, purely cosmetic — no gameplay effect. */
export function rankForStreak(bestStreak: number): string {
  if (bestStreak >= 20) return "Paragon of the Arena";
  if (bestStreak >= 10) return "Champion";
  if (bestStreak >= 5) return "Gladiator";
  if (bestStreak >= 3) return "Duelist";
  return "Challenger";
}
