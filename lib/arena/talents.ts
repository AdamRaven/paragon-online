import type { ClassId } from "./types";

/** Every field is an additive percentage/fraction, summed the same way
 *  deriveArenaStats (progression.ts) already sums gear stats — a talent
 *  bundles 2-3 of these into one pick rather than costing a point each. */
export interface TalentBonus {
  /** Attack power, applied before the Ascension multiplier. */
  atkPct?: number;
  /** Max HP, applied before the Ascension multiplier. */
  hpPct?: number;
  /** Max mana, applied before the Ascension multiplier. */
  manaPct?: number;
  /** Flat fraction shaved off every skill's cooldown, same mechanism as
   *  legendary gear CDR affixes — stacks with them, capped the same way. */
  cdr?: number;
  /** Flat fraction of damage dealt healed back, same mechanism as legendary
   *  gear lifesteal affixes. */
  lifesteal?: number;
  /** Walk/sprint speed multiplier. */
  speedPct?: number;
}

export interface TalentDef {
  id: string;
  classId: ClassId;
  name: string;
  description: string;
  bonus: TalentBonus;
}

/** Pick up to this many — a flat list, no prerequisites/branches. */
export const MAX_TALENTS = 3;

/** Levels at which a fresh talent point is granted — see grantExp in
 *  progression.ts. Three fixed milestones rather than "every N levels" so
 *  each one reads as an early/mid/late build-defining choice. */
export const TALENT_MILESTONE_LEVELS = [10, 25, 40];

export const TALENTS: TalentDef[] = [
  // --- Paragon: aggressive brawler, Combokiller stacks reward staying on the offensive
  {
    id: "paragon-brawlers-instinct",
    classId: "paragon",
    name: "Brawler's Instinct",
    description: "+6% attack power, +4% lifesteal.",
    bonus: { atkPct: 0.06, lifesteal: 0.04 },
  },
  {
    id: "paragon-bulwark",
    classId: "paragon",
    name: "Bulwark",
    description: "+10% max HP, +5% move speed.",
    bonus: { hpPct: 0.1, speedPct: 0.05 },
  },
  {
    id: "paragon-focused-fury",
    classId: "paragon",
    name: "Focused Fury",
    description: "+8% cooldown reduction, +10% max mana.",
    bonus: { cdr: 0.08, manaPct: 0.1 },
  },
  {
    id: "paragon-relentless",
    classId: "paragon",
    name: "Relentless",
    description: "+4% attack power, +5% cooldown reduction.",
    bonus: { atkPct: 0.04, cdr: 0.05 },
  },
  {
    id: "paragon-juggernaut",
    classId: "paragon",
    name: "Juggernaut",
    description: "+6% max HP, +3% attack power.",
    bonus: { hpPct: 0.06, atkPct: 0.03 },
  },

  // --- Shedim: mana-hungry burst caster, Manaflow/Void Blast reward pool management
  {
    id: "shedim-manaflow",
    classId: "shedim",
    name: "Manaflow",
    description: "+15% max mana, +5% cooldown reduction.",
    bonus: { manaPct: 0.15, cdr: 0.05 },
  },
  {
    id: "shedim-umbral-edge",
    classId: "shedim",
    name: "Umbral Edge",
    description: "+7% attack power, +3% lifesteal.",
    bonus: { atkPct: 0.07, lifesteal: 0.03 },
  },
  {
    id: "shedim-wraithstep",
    classId: "shedim",
    name: "Wraithstep",
    description: "+8% move speed, +3% max HP.",
    bonus: { speedPct: 0.08, hpPct: 0.03 },
  },
  {
    id: "shedim-voidtouched",
    classId: "shedim",
    name: "Voidtouched",
    description: "+10% cooldown reduction.",
    bonus: { cdr: 0.1 },
  },
  {
    id: "shedim-dark-vitality",
    classId: "shedim",
    name: "Dark Vitality",
    description: "+8% max HP, +5% max mana.",
    bonus: { hpPct: 0.08, manaPct: 0.05 },
  },

  // --- Kacper: tanky greatsword, Brace/Charge reward committing to a hit
  {
    id: "kacper-iron-skin",
    classId: "kacper",
    name: "Iron Skin",
    description: "+12% max HP.",
    bonus: { hpPct: 0.12 },
  },
  {
    id: "kacper-momentum",
    classId: "kacper",
    name: "Momentum",
    description: "+6% move speed, +3% attack power.",
    bonus: { speedPct: 0.06, atkPct: 0.03 },
  },
  {
    id: "kacper-warlords-grip",
    classId: "kacper",
    name: "Warlord's Grip",
    description: "+5% attack power, +5% lifesteal.",
    bonus: { atkPct: 0.05, lifesteal: 0.05 },
  },
  {
    id: "kacper-steadfast",
    classId: "kacper",
    name: "Steadfast",
    description: "+6% cooldown reduction, +5% max HP.",
    bonus: { cdr: 0.06, hpPct: 0.05 },
  },
  {
    id: "kacper-skybreaker",
    classId: "kacper",
    name: "Skybreaker",
    description: "+8% attack power, +4% max mana.",
    bonus: { atkPct: 0.08, manaPct: 0.04 },
  },
];

export function talentsFor(classId: ClassId): TalentDef[] {
  return TALENTS.filter((t) => t.classId === classId);
}

export function talentById(id: string): TalentDef | undefined {
  return TALENTS.find((t) => t.id === id);
}

/** Sums every chosen talent's bonus fields into one flat total — same shape
 *  deriveArenaStats already consumes gear/gearSet totals in. */
export function totalTalentBonus(talentIds: string[]): Required<TalentBonus> {
  const total: Required<TalentBonus> = {
    atkPct: 0,
    hpPct: 0,
    manaPct: 0,
    cdr: 0,
    lifesteal: 0,
    speedPct: 0,
  };
  for (const id of talentIds) {
    const t = talentById(id);
    if (!t) continue;
    total.atkPct += t.bonus.atkPct ?? 0;
    total.hpPct += t.bonus.hpPct ?? 0;
    total.manaPct += t.bonus.manaPct ?? 0;
    total.cdr += t.bonus.cdr ?? 0;
    total.lifesteal += t.bonus.lifesteal ?? 0;
    total.speedPct += t.bonus.speedPct ?? 0;
  }
  return total;
}
