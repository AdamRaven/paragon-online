import { ITEM_BASES } from "./items";

/** Own tiny week-seed calc rather than importing weekly.ts's — keeps this
 *  module (and the vendor that uses it) independent of the bounty/weekly
 *  system entirely. */
function weekSeed(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-w${week}`;
}

function seededIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

/** This week's featured gear base id — the same pick for anyone who opens
 *  the vendor this week, changing again next week. Deliberately presented
 *  with no countdown and no "ending soon" framing: it's just this week's
 *  pick, not a reason to panic-buy. */
export function featuredBaseId(): string {
  const eligible = Object.values(ITEM_BASES).filter((b) => b.kind !== "trash" && !b.unique);
  return eligible[seededIndex(weekSeed(), eligible.length)].id;
}
