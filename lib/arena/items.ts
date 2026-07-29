/** Loot, gear, the town economy and weapon enhancement. */

export type ItemKind = "weapon" | "armor" | "trinket" | "trash";
export type EquipSlot = "weapon" | "armor" | "trinket";
export type Rarity = "common" | "uncommon" | "rare" | "epic";

/**
 * Four visible tiers: white (common), green (uncommon), blue (rare) and gold
 * (epic, the best gear). Colors are chosen to read clearly both on the dark
 * panel background and as a small icon border.
 */
export const RARITY_META: Record<
  Rarity,
  { label: string; color: string; glow: string; statMult: number; valueMult: number }
> = {
  common: { label: "Common", color: "#eef1f7", glow: "#8892a6", statMult: 1, valueMult: 1 },
  uncommon: { label: "Uncommon", color: "#3ddc70", glow: "#1f9e4d", statMult: 1.35, valueMult: 2 },
  rare: { label: "Rare", color: "#3fa1ff", glow: "#1f6fd6", statMult: 1.8, valueMult: 4 },
  epic: { label: "Epic", color: "#ffc93f", glow: "#e0961a", statMult: 2.5, valueMult: 8 },
};

export interface ItemStats {
  attack?: number;
  hp?: number;
  mana?: number;
  speed?: number;
}

export interface ItemBase {
  id: string;
  name: string;
  kind: ItemKind;
  slot?: EquipSlot;
  /** Minimum mob level that can drop this. */
  tier: number;
  stats: ItemStats;
  /** Base gold value. */
  value: number;
  /**
   * Only weapons. Heavier weapons are harder to enhance, so a big two-hander
   * is a riskier investment than a pair of knuckles.
   */
  weight?: number;
  /** Which pixel icon to draw. */
  icon: string;
}

/** A specific owned copy of a base item. */
export interface Item {
  uid: string;
  baseId: string;
  rarity: Rarity;
  /** Enhancement level, 0..MAX_PLUS. Weapons only. */
  plus: number;
}

export const MAX_PLUS = 10;

// ---------------------------------------------------------------- item bases

/**
 * Every base has its own `icon` key so it draws as a visually distinct pixel
 * icon (see `itemIcons.ts`) rather than sharing one shape with its whole
 * category — two weapons of the same kind should still be tellable apart at a
 * glance.
 */
export const ITEM_BASES: Record<string, ItemBase> = {
  // --- weapons (light -> heavy) -------------------------------------------
  "worn-knuckles": {
    id: "worn-knuckles", name: "Worn Knuckles", kind: "weapon", slot: "weapon",
    tier: 1, stats: { attack: 3 }, value: 40, weight: 1, icon: "worn-knuckles",
  },
  "iron-claws": {
    id: "iron-claws", name: "Iron Claws", kind: "weapon", slot: "weapon",
    tier: 3, stats: { attack: 6, speed: 0.02 }, value: 90, weight: 1.15, icon: "iron-claws",
  },
  "ember-gauntlet": {
    id: "ember-gauntlet", name: "Ember Gauntlet", kind: "weapon", slot: "weapon",
    tier: 6, stats: { attack: 10 }, value: 180, weight: 1.4, icon: "ember-gauntlet",
  },
  "hooked-scythe": {
    id: "hooked-scythe", name: "Hooked Scythe", kind: "weapon", slot: "weapon",
    tier: 4, stats: { attack: 9 }, value: 150, weight: 1.7, icon: "hooked-scythe",
  },
  "void-reaper": {
    id: "void-reaper", name: "Void Reaper", kind: "weapon", slot: "weapon",
    tier: 8, stats: { attack: 16, mana: 12 }, value: 340, weight: 2.1, icon: "void-reaper",
  },
  "warden-maul": {
    id: "warden-maul", name: "Warden's Maul", kind: "weapon", slot: "weapon",
    tier: 12, stats: { attack: 24 }, value: 620, weight: 2.6, icon: "warden-maul",
  },

  // --- armour ---------------------------------------------------------------
  "tattered-wrap": {
    id: "tattered-wrap", name: "Tattered Wrap", kind: "armor", slot: "armor",
    tier: 1, stats: { hp: 25 }, value: 35, icon: "tattered-wrap",
  },
  "scaled-vest": {
    id: "scaled-vest", name: "Scaled Vest", kind: "armor", slot: "armor",
    tier: 4, stats: { hp: 60, speed: 0.01 }, value: 110, icon: "scaled-vest",
  },
  "onyx-plate": {
    id: "onyx-plate", name: "Onyx Plate", kind: "armor", slot: "armor",
    tier: 9, stats: { hp: 130 }, value: 300, icon: "onyx-plate",
  },

  // --- trinkets -------------------------------------------------------------
  "cracked-charm": {
    id: "cracked-charm", name: "Cracked Charm", kind: "trinket", slot: "trinket",
    tier: 2, stats: { mana: 15 }, value: 45, icon: "cracked-charm",
  },
  "swift-band": {
    id: "swift-band", name: "Swift Band", kind: "trinket", slot: "trinket",
    tier: 5, stats: { speed: 0.06, mana: 20 }, value: 140, icon: "swift-band",
  },
  "heart-of-ash": {
    id: "heart-of-ash", name: "Heart of Ash", kind: "trinket", slot: "trinket",
    tier: 10, stats: { hp: 70, attack: 6 }, value: 380, icon: "heart-of-ash",
  },

  // --- trash: no stats, sold for gold --------------------------------------
  "rusted-scrap": {
    id: "rusted-scrap", name: "Rusted Scrap", kind: "trash",
    tier: 1, stats: {}, value: 9, icon: "rusted-scrap",
  },
  "cracked-fang": {
    id: "cracked-fang", name: "Cracked Fang", kind: "trash",
    tier: 1, stats: {}, value: 14, icon: "cracked-fang",
  },
  "tarnished-coin": {
    id: "tarnished-coin", name: "Tarnished Coin", kind: "trash",
    tier: 3, stats: {}, value: 26, icon: "tarnished-coin",
  },
  "ashen-dust": {
    id: "ashen-dust", name: "Ashen Dust", kind: "trash",
    tier: 5, stats: {}, value: 40, icon: "ashen-dust",
  },
  "warden-sigil": {
    id: "warden-sigil", name: "Warden Sigil", kind: "trash",
    tier: 10, stats: {}, value: 120, icon: "warden-sigil",
  },
};

export function base(id: string): ItemBase {
  return ITEM_BASES[id] ?? ITEM_BASES["rusted-scrap"];
}

// -------------------------------------------------------------------- drops

let uidSeq = 1;
function uid() {
  return `it${Date.now().toString(36)}${uidSeq++}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollRarity(mobLevel: number, boss: boolean): Rarity {
  const r = Math.random() + (boss ? 0.35 : 0) + mobLevel * 0.006;
  if (r > 1.25) return "epic";
  if (r > 1.0) return "rare";
  if (r > 0.68) return "uncommon";
  return "common";
}

export function makeItem(baseId: string, rarity: Rarity): Item {
  return { uid: uid(), baseId, rarity, plus: 0 };
}

/**
 * Rolls a mob's drops. Trash is common and exists to be sold; gear is rarer
 * and drops at or below the mob's level.
 */
export function rollDrops(mobLevel: number, boss: boolean): Item[] {
  const out: Item[] = [];
  const rolls = boss ? 4 : 1;

  for (let i = 0; i < rolls; i++) {
    const r = Math.random();
    const gearChance = boss ? 0.75 : 0.18;
    if (r < gearChance) {
      const eligible = Object.values(ITEM_BASES).filter(
        (b) => b.kind !== "trash" && b.tier <= mobLevel + 2
      );
      if (eligible.length) {
        out.push(makeItem(pick(eligible).id, rollRarity(mobLevel, boss)));
      }
    } else if (r < gearChance + 0.62) {
      const trash = Object.values(ITEM_BASES).filter(
        (b) => b.kind === "trash" && b.tier <= mobLevel + 2
      );
      if (trash.length) out.push(makeItem(pick(trash).id, "common"));
    }
  }
  return out;
}

// ------------------------------------------------------------- stats & value

/** Each enhancement level adds this fraction of the item's base stats. */
export const PLUS_STEP = 0.14;

export function itemStats(item: Item): ItemStats {
  const b = base(item.baseId);
  const mult = RARITY_META[item.rarity].statMult * (1 + item.plus * PLUS_STEP);
  const out: ItemStats = {};
  if (b.stats.attack) out.attack = round1(b.stats.attack * mult);
  if (b.stats.hp) out.hp = Math.round(b.stats.hp * mult);
  if (b.stats.mana) out.mana = Math.round(b.stats.mana * mult);
  if (b.stats.speed) out.speed = round3(b.stats.speed * mult);
  return out;
}

export function itemValue(item: Item): number {
  const b = base(item.baseId);
  return Math.round(
    b.value * RARITY_META[item.rarity].valueMult * (1 + item.plus * 0.3)
  );
}

export function itemName(item: Item): string {
  const b = base(item.baseId);
  return item.plus > 0 ? `+${item.plus} ${b.name}` : b.name;
}

/** Sum of every equipped item's stats. */
export function equippedStats(
  equipped: Partial<Record<EquipSlot, Item>>
): Required<ItemStats> {
  const total = { attack: 0, hp: 0, mana: 0, speed: 0 };
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    const s = itemStats(item);
    total.attack += s.attack ?? 0;
    total.hp += s.hp ?? 0;
    total.mana += s.mana ?? 0;
    total.speed += s.speed ?? 0;
  }
  return total;
}

// ------------------------------------------------------------- enhancement

export const STONE_PRICE = 45;

/**
 * Success chance for the next enhancement.
 *
 * It falls steeply with the level, and heavier weapons are harder still — so
 * pushing a Warden's Maul to +10 is a far bigger gamble than a pair of
 * knuckles. Chance is clamped so there is always at least a sliver of hope.
 */
export function enhanceChance(item: Item): number {
  const b = base(item.baseId);
  const weight = b.weight ?? 1;
  const ladder = [0.95, 0.9, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.27, 0.2];
  const raw = ladder[Math.min(ladder.length - 1, item.plus)];
  // Heavier weapons take a penalty that grows with the level.
  const penalty = 1 - (weight - 1) * (0.1 + item.plus * 0.03);
  return Math.max(0.05, Math.min(0.98, raw * penalty));
}

/** Levels at or above this drop by one on failure instead of holding. */
export const DOWNGRADE_FLOOR = 4;

export interface EnhanceResult {
  ok: boolean;
  from: number;
  to: number;
  downgraded: boolean;
}

/** Attempts one enhancement. The caller is responsible for spending a stone. */
export function attemptEnhance(item: Item): EnhanceResult {
  const from = item.plus;
  if (from >= MAX_PLUS) return { ok: false, from, to: from, downgraded: false };

  if (Math.random() < enhanceChance(item)) {
    item.plus = from + 1;
    return { ok: true, from, to: item.plus, downgraded: false };
  }
  // Failure: high levels lose a point, low levels are safe.
  if (from >= DOWNGRADE_FLOOR) {
    item.plus = from - 1;
    return { ok: false, from, to: item.plus, downgraded: true };
  }
  return { ok: false, from, to: from, downgraded: false };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
