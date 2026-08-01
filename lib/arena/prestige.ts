import type { AdventureSave } from "./progression";

/**
 * Cosmetic-only rewards layered onto the *existing* Ascension rank
 * (AdventureSave.ascension) rather than a second "reset to level 1" track —
 * Ascension already is New Game+ mechanically (full reset, permanent
 * account-level progress), it's just that its existing reward is combat
 * power (see ASCENSION_BONUS_PER_RANK in progression.ts). These tiers pile
 * a title/aura/weapon-trim recolor on top of that same rank, purely
 * additive, zero stat effect — same "flex, not power" spirit as
 * AURA_UNLOCKS in achievements.ts.
 */
export interface PrestigeTier {
  rank: number;
  title: string;
  auraColor: string;
  /** Recolors Fighter.weaponSkinOverride — in practice the same accent/trim
   *  palette slot gear-trim already uses (weapons themselves are drawn from
   *  fixed per-class constants, not the palette, so this is the closest
   *  real "recolor your look" hook without new sprite art). */
  weaponSkin: string;
  label: string;
}

export const PRESTIGE_TIERS: PrestigeTier[] = [
  { rank: 1, title: "the Ascended", auraColor: "#fef08a", weaponSkin: "#fef08a", label: "Sunfire" },
  { rank: 3, title: "the Undying", auraColor: "#f87171", weaponSkin: "#f87171", label: "Bloodforge" },
  { rank: 5, title: "the Eternal", auraColor: "#67e8f9", weaponSkin: "#67e8f9", label: "Frostwrought" },
  { rank: 10, title: "the Godslayer", auraColor: "#e9d5ff", weaponSkin: "#e9d5ff", label: "Voidgilt" },
];

export function unlockedPrestigeTiers(save: AdventureSave): PrestigeTier[] {
  const rank = save.ascension ?? 0;
  return PRESTIGE_TIERS.filter((t) => rank >= t.rank);
}
