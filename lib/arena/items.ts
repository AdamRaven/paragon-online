/** Loot, gear, the town economy and weapon enhancement. */

export type ItemKind = "weapon" | "armor" | "trinket" | "trash";
export type EquipSlot =
  | "weapon"
  | "helmet"
  | "chest"
  | "legs"
  | "hands"
  | "necklace"
  | "belt"
  | "earring1"
  | "earring2"
  | "ring1"
  | "ring2";

export const EQUIP_SLOTS: EquipSlot[] = [
  "weapon",
  "helmet",
  "chest",
  "legs",
  "hands",
  "necklace",
  "belt",
  "earring1",
  "earring2",
  "ring1",
  "ring2",
];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Weapon",
  helmet: "Helmet",
  chest: "Chest",
  legs: "Legs",
  hands: "Hands",
  necklace: "Necklace",
  belt: "Belt",
  earring1: "Earring",
  earring2: "Earring",
  ring1: "Ring",
  ring2: "Ring",
};

/**
 * Earrings and rings come in a pair — one item base can end up in either
 * physical slot, so item data tags itself with the family ("earring" /
 * "ring") rather than a specific numbered slot. Everything else is its own
 * family of one.
 */
export type SlotFamily = EquipSlot | "earring" | "ring";

export function familySlots(family: SlotFamily): EquipSlot[] {
  if (family === "earring") return ["earring1", "earring2"];
  if (family === "ring") return ["ring1", "ring2"];
  return [family];
}
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/**
 * Five visible tiers: white (common), green (uncommon), blue (rare), gold
 * (epic) and orange (legendary, the rarest gear in the game — only the
 * endgame's toughest bosses can drop one). Colors are chosen to read clearly
 * both on the dark panel background and as a small icon border.
 */
export const RARITY_META: Record<
  Rarity,
  { label: string; color: string; glow: string; statMult: number; valueMult: number }
> = {
  common: { label: "Common", color: "#eef1f7", glow: "#8892a6", statMult: 1, valueMult: 1 },
  uncommon: { label: "Uncommon", color: "#3ddc70", glow: "#1f9e4d", statMult: 1.35, valueMult: 2 },
  rare: { label: "Rare", color: "#3fa1ff", glow: "#1f6fd6", statMult: 1.8, valueMult: 4 },
  epic: { label: "Epic", color: "#ffc93f", glow: "#e0961a", statMult: 2.5, valueMult: 8 },
  legendary: { label: "Legendary", color: "#ff8a3d", glow: "#ff6a00", statMult: 3.4, valueMult: 18 },
};

/** The magical affixes only a legendary item can roll. */
export type ItemEffect = "lifesteal" | "negation" | "regen" | "cdr";

export const EFFECT_META: Record<
  ItemEffect,
  { label: string; describe: (value: number) => string }
> = {
  lifesteal: {
    label: "Lifesteal",
    describe: (v) => `Heal for ${Math.round(v * 100)}% of damage dealt`,
  },
  negation: {
    label: "Damage Negation",
    describe: (v) => `${Math.round(v * 100)}% chance to negate incoming damage`,
  },
  regen: {
    label: "Vitality",
    describe: (v) => `Regenerate ${v} HP and ${Math.round(v * 0.6)} mana per second`,
  },
  cdr: {
    label: "Cooldown Reduction",
    describe: (v) => `${Math.round(v * 100)}% shorter skill cooldowns`,
  },
};

export interface ItemStats {
  attack?: number;
  hp?: number;
  mana?: number;
}

/**
 * The 11-rung tier ladder every gear line climbs (Tattered -> ... ->
 * Sundered) doubles as a gear set: every item on the same rung, across every
 * slot, shares a `setId`. Equipping several pieces from the same rung grants
 * a stacking bonus — see setBonuses() below.
 */
export type SetId =
  | "tattered"
  | "scaled"
  | "onyx"
  | "revenant"
  | "sovereign"
  | "frostguard"
  | "cinderplate"
  | "stormward"
  | "plaguebound"
  | "rotmother"
  | "sundered";

export interface ItemBase {
  id: string;
  name: string;
  kind: ItemKind;
  slot?: SlotFamily;
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
  setId?: SetId;
  /**
   * A named one-of-a-kind — always drops at legendary rarity with the exact
   * `fixedEffect` below rather than a random roll, and only from the boss
   * named in `dropFrom` (see rollDrops).
   */
  unique?: boolean;
  dropFrom?: string;
  fixedEffect?: { kind: ItemEffect; value: number };
}

/** A specific owned copy of a base item. */
export interface Item {
  uid: string;
  baseId: string;
  rarity: Rarity;
  /** Enhancement level, 0..MAX_PLUS. Weapons only. */
  plus: number;
  /** Legendaries always roll one; epics have a chance at a weaker version. */
  effect?: { kind: ItemEffect; value: number };
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
    id: "worn-knuckles", name: "Worn Gauntlets", kind: "weapon", slot: "weapon",
    tier: 1, stats: { attack: 3 }, value: 40, weight: 1, icon: "worn-knuckles",
    setId: "tattered",
  },
  "iron-claws": {
    id: "iron-claws", name: "Iron Gauntlets", kind: "weapon", slot: "weapon",
    tier: 3, stats: { attack: 6 }, value: 90, weight: 1.15, icon: "iron-claws",
    setId: "scaled",
  },
  "ember-gauntlet": {
    id: "ember-gauntlet", name: "Ember Gauntlets", kind: "weapon", slot: "weapon",
    tier: 6, stats: { attack: 10 }, value: 180, weight: 1.4, icon: "ember-gauntlet",
    setId: "onyx",
  },
  "hooked-scythe": {
    id: "hooked-scythe", name: "Hooked Gauntlets", kind: "weapon", slot: "weapon",
    tier: 4, stats: { attack: 9 }, value: 150, weight: 1.7, icon: "hooked-scythe",
    setId: "scaled",
  },
  "void-reaper": {
    id: "void-reaper", name: "Void Gauntlets", kind: "weapon", slot: "weapon",
    tier: 8, stats: { attack: 16, mana: 12 }, value: 340, weight: 2.1, icon: "void-reaper",
    setId: "onyx",
  },
  "warden-maul": {
    id: "warden-maul", name: "Warden's Gauntlets", kind: "weapon", slot: "weapon",
    tier: 12, stats: { attack: 24 }, value: 620, weight: 2.6, icon: "warden-maul",
    setId: "revenant",
  },
  // The original six weapons top out at tier 12, but mobs go all the way to
  // level 54 — without gear to match, a level-50 boss had just as much
  // chance of dropping a tier-1 knuckle-duster as anything else, so a gold
  // item could easily come out weaker than a blue one. These carry the same
  // curve up to the endgame (icons reused across tiers, same as any weapon
  // family reskinned at higher level).
  "revenants-edge": {
    id: "revenants-edge", name: "Revenant's Gauntlets", kind: "weapon", slot: "weapon",
    tier: 15, stats: { attack: 30 }, value: 850, weight: 2.7, icon: "iron-claws",
    setId: "revenant",
  },
  "sovereigns-blade": {
    id: "sovereigns-blade", name: "Sovereign's Gauntlets", kind: "weapon", slot: "weapon",
    tier: 20, stats: { attack: 40, mana: 16 }, value: 1200, weight: 2.85, icon: "hooked-scythe",
    setId: "sovereign",
  },
  "frostbite-fang": {
    id: "frostbite-fang", name: "Frostbite Gauntlets", kind: "weapon", slot: "weapon",
    tier: 27, stats: { attack: 52 }, value: 1700, weight: 3.0, icon: "ember-gauntlet",
    setId: "frostguard",
  },
  "cinderforged-gauntlet": {
    id: "cinderforged-gauntlet", name: "Cinderforged Gauntlets", kind: "weapon", slot: "weapon",
    tier: 32, stats: { attack: 62 }, value: 2200, weight: 3.15, icon: "void-reaper",
    setId: "cinderplate",
  },
  "stormcallers-grasp": {
    id: "stormcallers-grasp", name: "Stormcaller's Gauntlets", kind: "weapon", slot: "weapon",
    tier: 38, stats: { attack: 74, mana: 24 }, value: 2900, weight: 3.3, icon: "warden-maul",
    setId: "stormward",
  },
  "plagueroot-cleaver": {
    id: "plagueroot-cleaver", name: "Plagueroot Gauntlets", kind: "weapon", slot: "weapon",
    tier: 44, stats: { attack: 86 }, value: 3700, weight: 3.45, icon: "iron-claws",
    setId: "plaguebound",
  },
  "rotmothers-kiss": {
    id: "rotmothers-kiss", name: "Rotmother's Gauntlets", kind: "weapon", slot: "weapon",
    tier: 50, stats: { attack: 98, mana: 30 }, value: 4700, weight: 3.6, icon: "void-reaper",
    setId: "rotmother",
  },
  "sundered-greatblade": {
    id: "sundered-greatblade", name: "Sundered Gauntlets", kind: "weapon", slot: "weapon",
    tier: 54, stats: { attack: 110 }, value: 5600, weight: 3.8, icon: "warden-maul",
    setId: "sundered",
  },

  // --- armour ---------------------------------------------------------------
  "tattered-wrap": {
    id: "tattered-wrap", name: "Tattered Wrap", kind: "armor", slot: "chest",
    tier: 1, stats: { hp: 25 }, value: 35, icon: "tattered-wrap",
    setId: "tattered",
  },
  "scaled-vest": {
    id: "scaled-vest", name: "Scaled Vest", kind: "armor", slot: "chest",
    tier: 4, stats: { hp: 60 }, value: 110, icon: "scaled-vest",
    setId: "scaled",
  },
  "onyx-plate": {
    id: "onyx-plate", name: "Onyx Plate", kind: "armor", slot: "chest",
    tier: 9, stats: { hp: 130 }, value: 300, icon: "onyx-plate",
    setId: "onyx",
  },
  "revenant-mail": {
    id: "revenant-mail", name: "Revenant Mail", kind: "armor", slot: "chest",
    tier: 15, stats: { hp: 230 }, value: 900, icon: "scaled-vest",
    setId: "revenant",
  },
  "sovereign-plate": {
    id: "sovereign-plate", name: "Sovereign Plate", kind: "armor", slot: "chest",
    tier: 20, stats: { hp: 300 }, value: 1250, icon: "onyx-plate",
    setId: "sovereign",
  },
  "frostguard-harness": {
    id: "frostguard-harness", name: "Frostguard Harness", kind: "armor", slot: "chest",
    tier: 27, stats: { hp: 400 }, value: 1750, icon: "tattered-wrap",
    setId: "frostguard",
  },
  "cinderplate-armor": {
    id: "cinderplate-armor", name: "Cinderplate Armor", kind: "armor", slot: "chest",
    tier: 32, stats: { hp: 470 }, value: 2250, icon: "scaled-vest",
    setId: "cinderplate",
  },
  "stormward-vest": {
    id: "stormward-vest", name: "Stormward Vest", kind: "armor", slot: "chest",
    tier: 38, stats: { hp: 560 }, value: 2950, icon: "onyx-plate",
    setId: "stormward",
  },
  "plaguebound-hide": {
    id: "plaguebound-hide", name: "Plaguebound Husk-Hide", kind: "armor", slot: "chest",
    tier: 44, stats: { hp: 650 }, value: 3750, icon: "tattered-wrap",
    setId: "plaguebound",
  },
  "rotmothers-carapace": {
    id: "rotmothers-carapace", name: "Rotmother's Carapace", kind: "armor", slot: "chest",
    tier: 50, stats: { hp: 740 }, value: 4700, icon: "scaled-vest",
    setId: "rotmother",
  },
  "sundered-aegis": {
    id: "sundered-aegis", name: "Sundered Aegis", kind: "armor", slot: "chest",
    tier: 54, stats: { hp: 820 }, value: 5500, icon: "onyx-plate",
    setId: "sundered",
  },

  // --- necklaces --------------------------------------------------------------
  "cracked-charm": {
    id: "cracked-charm", name: "Cracked Necklace", kind: "trinket", slot: "necklace",
    tier: 2, stats: { mana: 15 }, value: 45, icon: "cracked-charm",
    setId: "tattered",
  },
  "swift-band": {
    id: "swift-band", name: "Swift Necklace", kind: "trinket", slot: "necklace",
    tier: 5, stats: { mana: 20 }, value: 140, icon: "swift-band",
    setId: "scaled",
  },
  "heart-of-ash": {
    id: "heart-of-ash", name: "Ember Necklace", kind: "trinket", slot: "necklace",
    tier: 10, stats: { hp: 70, attack: 6 }, value: 380, icon: "heart-of-ash",
    setId: "onyx",
  },
  "revenant-locket": {
    id: "revenant-locket", name: "Revenant Necklace", kind: "trinket", slot: "necklace",
    tier: 15, stats: { mana: 45, hp: 30 }, value: 920, icon: "cracked-charm",
    setId: "revenant",
  },
  "sovereign-signet": {
    id: "sovereign-signet", name: "Sovereign Necklace", kind: "trinket", slot: "necklace",
    tier: 20, stats: { mana: 65 }, value: 1300, icon: "swift-band",
    setId: "sovereign",
  },
  "frostheart-gem": {
    id: "frostheart-gem", name: "Frostheart Necklace", kind: "trinket", slot: "necklace",
    tier: 27, stats: { hp: 90, attack: 8 }, value: 1800, icon: "heart-of-ash",
    setId: "frostguard",
  },
  "cinder-talisman": {
    id: "cinder-talisman", name: "Cinder Necklace", kind: "trinket", slot: "necklace",
    tier: 32, stats: { mana: 95 }, value: 2300, icon: "cracked-charm",
    setId: "cinderplate",
  },
  "stormcallers-sigil": {
    id: "stormcallers-sigil", name: "Storm Necklace", kind: "trinket", slot: "necklace",
    tier: 38, stats: { hp: 140, mana: 60 }, value: 3000, icon: "swift-band",
    setId: "stormward",
  },
  "plaguebound-vial": {
    id: "plaguebound-vial", name: "Plague Necklace", kind: "trinket", slot: "necklace",
    tier: 44, stats: { attack: 14 }, value: 3800, icon: "heart-of-ash",
    setId: "plaguebound",
  },
  "rotmothers-heart": {
    id: "rotmothers-heart", name: "Rotmother's Necklace", kind: "trinket", slot: "necklace",
    tier: 50, stats: { hp: 200, mana: 110 }, value: 4750, icon: "cracked-charm",
    setId: "rotmother",
  },
  "sundered-crown-shard": {
    id: "sundered-crown-shard", name: "Sundered Necklace", kind: "trinket", slot: "necklace",
    tier: 54, stats: { attack: 20, hp: 150, mana: 80 }, value: 5600, icon: "heart-of-ash",
    setId: "sundered",
  },

  // --- helmets ---------------------------------------------------------
  "tattered-hood": {
    id: "tattered-hood", name: "Tattered Hood", kind: "armor", slot: "helmet",
    tier: 1, stats: { hp: 8, mana: 4 }, value: 14, icon: "leather-helm",
    setId: "tattered",
  },
  "scaled-cap": {
    id: "scaled-cap", name: "Scaled Cap", kind: "armor", slot: "helmet",
    tier: 4, stats: { hp: 20, mana: 8 }, value: 44, icon: "leather-helm",
    setId: "scaled",
  },
  "onyx-helm": {
    id: "onyx-helm", name: "Onyx Helm", kind: "armor", slot: "helmet",
    tier: 9, stats: { hp: 44, mana: 18 }, value: 120, icon: "leather-helm",
    setId: "onyx",
  },
  "revenant-hood": {
    id: "revenant-hood", name: "Revenant Hood", kind: "armor", slot: "helmet",
    tier: 15, stats: { hp: 78, mana: 32 }, value: 360, icon: "leather-helm",
    setId: "revenant",
  },
  "sovereign-crown": {
    id: "sovereign-crown", name: "Sovereign Crown", kind: "armor", slot: "helmet",
    tier: 20, stats: { hp: 102, mana: 42 }, value: 500, icon: "leather-helm",
    setId: "sovereign",
  },
  "frostguard-helm": {
    id: "frostguard-helm", name: "Frostguard Helm", kind: "armor", slot: "helmet",
    tier: 27, stats: { hp: 136, mana: 56 }, value: 700, icon: "leather-helm",
    setId: "frostguard",
  },
  "cinderplate-helm": {
    id: "cinderplate-helm", name: "Cinderplate Helm", kind: "armor", slot: "helmet",
    tier: 32, stats: { hp: 160, mana: 66 }, value: 900, icon: "plate-helm",
    setId: "cinderplate",
  },
  "stormward-hood": {
    id: "stormward-hood", name: "Stormward Hood", kind: "armor", slot: "helmet",
    tier: 38, stats: { hp: 190, mana: 78 }, value: 1180, icon: "plate-helm",
    setId: "stormward",
  },
  "plaguebound-mask": {
    id: "plaguebound-mask", name: "Plaguebound Mask", kind: "armor", slot: "helmet",
    tier: 44, stats: { hp: 221, mana: 91 }, value: 1500, icon: "plate-helm",
    setId: "plaguebound",
  },
  "rotmothers-crown": {
    id: "rotmothers-crown", name: "Rotmother's Crown", kind: "armor", slot: "helmet",
    tier: 50, stats: { hp: 252, mana: 104 }, value: 1880, icon: "plate-helm",
    setId: "rotmother",
  },
  "sundered-helm": {
    id: "sundered-helm", name: "Sundered Helm", kind: "armor", slot: "helmet",
    tier: 54, stats: { hp: 279, mana: 115 }, value: 2200, icon: "plate-helm",
    setId: "sundered",
  },

  // --- leg armour -------------------------------------------------------
  "tattered-leggings": {
    id: "tattered-leggings", name: "Tattered Boots", kind: "armor", slot: "legs",
    tier: 1, stats: { hp: 10 }, value: 16, icon: "cloth-boots",
    setId: "tattered",
  },
  "scaled-greaves": {
    id: "scaled-greaves", name: "Scaled Boots", kind: "armor", slot: "legs",
    tier: 4, stats: { hp: 25 }, value: 50, icon: "cloth-boots",
    setId: "scaled",
  },
  "onyx-legguards": {
    id: "onyx-legguards", name: "Onyx Boots", kind: "armor", slot: "legs",
    tier: 9, stats: { hp: 55 }, value: 135, icon: "cloth-boots",
    setId: "onyx",
  },
  "revenant-leggings": {
    id: "revenant-leggings", name: "Revenant Boots", kind: "armor", slot: "legs",
    tier: 15, stats: { hp: 97 }, value: 405, icon: "cloth-boots",
    setId: "revenant",
  },
  "sovereign-greaves": {
    id: "sovereign-greaves", name: "Sovereign Boots", kind: "armor", slot: "legs",
    tier: 20, stats: { hp: 126 }, value: 562, icon: "cloth-boots",
    setId: "sovereign",
  },
  "frostguard-legguards": {
    id: "frostguard-legguards", name: "Frostguard Boots", kind: "armor", slot: "legs",
    tier: 27, stats: { hp: 168 }, value: 788, icon: "cloth-boots",
    setId: "frostguard",
  },
  "cinderplate-greaves": {
    id: "cinderplate-greaves", name: "Cinderplate Boots", kind: "armor", slot: "legs",
    tier: 32, stats: { hp: 197 }, value: 1012, icon: "plate-boots",
    setId: "cinderplate",
  },
  "stormward-leggings": {
    id: "stormward-leggings", name: "Stormward Boots", kind: "armor", slot: "legs",
    tier: 38, stats: { hp: 235 }, value: 1328, icon: "plate-boots",
    setId: "stormward",
  },
  "plaguebound-leggings": {
    id: "plaguebound-leggings", name: "Plaguebound Boots", kind: "armor", slot: "legs",
    tier: 44, stats: { hp: 273 }, value: 1688, icon: "plate-boots",
    setId: "plaguebound",
  },
  "rotmothers-greaves": {
    id: "rotmothers-greaves", name: "Rotmother's Boots", kind: "armor", slot: "legs",
    tier: 50, stats: { hp: 311 }, value: 2115, icon: "plate-boots",
    setId: "rotmother",
  },
  "sundered-legguards": {
    id: "sundered-legguards", name: "Sundered Boots", kind: "armor", slot: "legs",
    tier: 54, stats: { hp: 344 }, value: 2475, icon: "plate-boots",
    setId: "sundered",
  },

  // --- hand armour --------------------------------------------------------
  "tattered-gloves": {
    id: "tattered-gloves", name: "Tattered Gloves", kind: "armor", slot: "hands",
    tier: 1, stats: { hp: 6 }, value: 12, icon: "leather-gloves",
    setId: "tattered",
  },
  "scaled-gauntlets": {
    id: "scaled-gauntlets", name: "Scaled Gloves", kind: "armor", slot: "hands",
    tier: 4, stats: { hp: 13 }, value: 38, icon: "leather-gloves",
    setId: "scaled",
  },
  "onyx-grips": {
    id: "onyx-grips", name: "Onyx Gloves", kind: "armor", slot: "hands",
    tier: 9, stats: { hp: 29 }, value: 105, icon: "leather-gloves",
    setId: "onyx",
  },
  "revenant-gloves": {
    id: "revenant-gloves", name: "Revenant Gloves", kind: "armor", slot: "hands",
    tier: 15, stats: { hp: 51 }, value: 315, icon: "leather-gloves",
    setId: "revenant",
  },
  "sovereign-gauntlets": {
    id: "sovereign-gauntlets", name: "Sovereign Gloves", kind: "armor", slot: "hands",
    tier: 20, stats: { hp: 66 }, value: 438, icon: "leather-gloves",
    setId: "sovereign",
  },
  "frostguard-grips": {
    id: "frostguard-grips", name: "Frostguard Gloves", kind: "armor", slot: "hands",
    tier: 27, stats: { hp: 88 }, value: 612, icon: "leather-gloves",
    setId: "frostguard",
  },
  "cinderplate-gauntlets": {
    id: "cinderplate-gauntlets", name: "Cinderplate Gloves", kind: "armor", slot: "hands",
    tier: 32, stats: { hp: 103 }, value: 788, icon: "plate-gloves",
    setId: "cinderplate",
  },
  "stormward-gloves": {
    id: "stormward-gloves", name: "Stormward Gloves", kind: "armor", slot: "hands",
    tier: 38, stats: { hp: 123 }, value: 1032, icon: "plate-gloves",
    setId: "stormward",
  },
  "plaguebound-grips": {
    id: "plaguebound-grips", name: "Plaguebound Gloves", kind: "armor", slot: "hands",
    tier: 44, stats: { hp: 143 }, value: 1312, icon: "plate-gloves",
    setId: "plaguebound",
  },
  "rotmothers-gauntlets": {
    id: "rotmothers-gauntlets", name: "Rotmother's Gloves", kind: "armor", slot: "hands",
    tier: 50, stats: { hp: 163 }, value: 1645, icon: "plate-gloves",
    setId: "rotmother",
  },
  "sundered-gauntlets": {
    id: "sundered-gauntlets", name: "Sundered Gloves", kind: "armor", slot: "hands",
    tier: 54, stats: { hp: 180 }, value: 1925, icon: "plate-gloves",
    setId: "sundered",
  },

  // --- rings (2 ring slots share this family) ------------------------------
  "iron-band": {
    id: "iron-band", name: "Cracked Ring", kind: "trinket", slot: "ring",
    tier: 2, stats: { mana: 15 }, value: 45, icon: "iron-ring",
    setId: "tattered",
  },
  "swift-ring": {
    id: "swift-ring", name: "Swift Ring", kind: "trinket", slot: "ring",
    tier: 5, stats: { mana: 20 }, value: 140, icon: "iron-ring",
    setId: "scaled",
  },
  "ember-loop": {
    id: "ember-loop", name: "Ember Ring", kind: "trinket", slot: "ring",
    tier: 10, stats: { hp: 70, attack: 6 }, value: 380, icon: "iron-ring",
    setId: "onyx",
  },
  "revenant-ring": {
    id: "revenant-ring", name: "Revenant Ring", kind: "trinket", slot: "ring",
    tier: 15, stats: { mana: 45, hp: 30 }, value: 920, icon: "iron-ring",
    setId: "revenant",
  },
  "sovereign-band": {
    id: "sovereign-band", name: "Sovereign Ring", kind: "trinket", slot: "ring",
    tier: 20, stats: { mana: 65 }, value: 1300, icon: "iron-ring",
    setId: "sovereign",
  },
  "frostheart-ring": {
    id: "frostheart-ring", name: "Frostheart Ring", kind: "trinket", slot: "ring",
    tier: 27, stats: { hp: 90, attack: 8 }, value: 1800, icon: "iron-ring",
    setId: "frostguard",
  },
  "cinder-loop": {
    id: "cinder-loop", name: "Cinder Ring", kind: "trinket", slot: "ring",
    tier: 32, stats: { mana: 95 }, value: 2300, icon: "gem-ring",
    setId: "cinderplate",
  },
  "storm-ring": {
    id: "storm-ring", name: "Storm Ring", kind: "trinket", slot: "ring",
    tier: 38, stats: { hp: 140, mana: 60 }, value: 3000, icon: "gem-ring",
    setId: "stormward",
  },
  "plague-band": {
    id: "plague-band", name: "Plague Ring", kind: "trinket", slot: "ring",
    tier: 44, stats: { attack: 14 }, value: 3800, icon: "gem-ring",
    setId: "plaguebound",
  },
  "rotmothers-ring": {
    id: "rotmothers-ring", name: "Rotmother's Ring", kind: "trinket", slot: "ring",
    tier: 50, stats: { hp: 200, mana: 110 }, value: 4750, icon: "gem-ring",
    setId: "rotmother",
  },
  "sundered-band": {
    id: "sundered-band", name: "Sundered Ring", kind: "trinket", slot: "ring",
    tier: 54, stats: { attack: 20, hp: 150, mana: 80 }, value: 5600, icon: "gem-ring",
    setId: "sundered",
  },

  // --- belts: raw hp + attack, the "core power" accessory ------------------
  "frayed-sash": {
    id: "frayed-sash", name: "Cracked Belt", kind: "trinket", slot: "belt",
    tier: 2, stats: { hp: 22, attack: 3 }, value: 42, icon: "leather-belt",
    setId: "tattered",
  },
  "scaled-girdle": {
    id: "scaled-girdle", name: "Swift Belt", kind: "trinket", slot: "belt",
    tier: 5, stats: { hp: 45, attack: 5 }, value: 130, icon: "leather-belt",
    setId: "scaled",
  },
  "onyx-cinch": {
    id: "onyx-cinch", name: "Ember Belt", kind: "trinket", slot: "belt",
    tier: 10, stats: { hp: 85, attack: 9 }, value: 350, icon: "leather-belt",
    setId: "onyx",
  },
  "revenant-waistguard": {
    id: "revenant-waistguard", name: "Revenant Belt", kind: "trinket", slot: "belt",
    tier: 15, stats: { hp: 130, attack: 13 }, value: 880, icon: "leather-belt",
    setId: "revenant",
  },
  "sovereign-girdle": {
    id: "sovereign-girdle", name: "Sovereign Belt", kind: "trinket", slot: "belt",
    tier: 20, stats: { hp: 175, attack: 17 }, value: 1250, icon: "leather-belt",
    setId: "sovereign",
  },
  "frostguard-belt": {
    id: "frostguard-belt", name: "Frostheart Belt", kind: "trinket", slot: "belt",
    tier: 27, stats: { hp: 230, attack: 22 }, value: 1750, icon: "leather-belt",
    setId: "frostguard",
  },
  "cinderplate-girdle": {
    id: "cinderplate-girdle", name: "Cinder Belt", kind: "trinket", slot: "belt",
    tier: 32, stats: { hp: 270, attack: 26 }, value: 2250, icon: "plate-belt",
    setId: "cinderplate",
  },
  "stormward-sash": {
    id: "stormward-sash", name: "Storm Belt", kind: "trinket", slot: "belt",
    tier: 38, stats: { hp: 320, attack: 31 }, value: 2950, icon: "plate-belt",
    setId: "stormward",
  },
  "plaguebound-cinch": {
    id: "plaguebound-cinch", name: "Plague Belt", kind: "trinket", slot: "belt",
    tier: 44, stats: { hp: 370, attack: 36 }, value: 3750, icon: "plate-belt",
    setId: "plaguebound",
  },
  "rotmothers-girdle": {
    id: "rotmothers-girdle", name: "Rotmother's Belt", kind: "trinket", slot: "belt",
    tier: 50, stats: { hp: 420, attack: 41 }, value: 4700, icon: "plate-belt",
    setId: "rotmother",
  },
  "sundered-waistguard": {
    id: "sundered-waistguard", name: "Sundered Belt", kind: "trinket", slot: "belt",
    tier: 54, stats: { hp: 460, attack: 46 }, value: 5500, icon: "plate-belt",
    setId: "sundered",
  },

  // --- earrings: mana + attack speed, the "finesse" accessory (2 slots share
  // this family) ------------------------------------------------------------
  "cracked-stud": {
    id: "cracked-stud", name: "Cracked Earring", kind: "trinket", slot: "earring",
    tier: 2, stats: { mana: 12 }, value: 40, icon: "hoop-earring",
    setId: "tattered",
  },
  "swift-hoop": {
    id: "swift-hoop", name: "Swift Earring", kind: "trinket", slot: "earring",
    tier: 5, stats: { mana: 22 }, value: 130, icon: "hoop-earring",
    setId: "scaled",
  },
  "ember-drop": {
    id: "ember-drop", name: "Ember Earring", kind: "trinket", slot: "earring",
    tier: 10, stats: { mana: 40 }, value: 350, icon: "hoop-earring",
    setId: "onyx",
  },
  "revenant-hoop": {
    id: "revenant-hoop", name: "Revenant Earring", kind: "trinket", slot: "earring",
    tier: 15, stats: { mana: 60 }, value: 880, icon: "hoop-earring",
    setId: "revenant",
  },
  "sovereign-stud": {
    id: "sovereign-stud", name: "Sovereign Earring", kind: "trinket", slot: "earring",
    tier: 20, stats: { mana: 80 }, value: 1250, icon: "hoop-earring",
    setId: "sovereign",
  },
  "frostheart-drop": {
    id: "frostheart-drop", name: "Frostheart Earring", kind: "trinket", slot: "earring",
    tier: 27, stats: { mana: 105 }, value: 1750, icon: "hoop-earring",
    setId: "frostguard",
  },
  "cinder-hoop": {
    id: "cinder-hoop", name: "Cinder Earring", kind: "trinket", slot: "earring",
    tier: 32, stats: { mana: 125 }, value: 2250, icon: "gem-earring",
    setId: "cinderplate",
  },
  "storm-stud": {
    id: "storm-stud", name: "Storm Earring", kind: "trinket", slot: "earring",
    tier: 38, stats: { mana: 150 }, value: 2950, icon: "gem-earring",
    setId: "stormward",
  },
  "plague-drop": {
    id: "plague-drop", name: "Plague Earring", kind: "trinket", slot: "earring",
    tier: 44, stats: { mana: 175 }, value: 3750, icon: "gem-earring",
    setId: "plaguebound",
  },
  "rotmothers-hoop": {
    id: "rotmothers-hoop", name: "Rotmother's Earring", kind: "trinket", slot: "earring",
    tier: 50, stats: { mana: 205 }, value: 4700, icon: "gem-earring",
    setId: "rotmother",
  },
  "sundered-stud": {
    id: "sundered-stud", name: "Sundered Earring", kind: "trinket", slot: "earring",
    tier: 54, stats: { mana: 230 }, value: 5500, icon: "gem-earring",
    setId: "sundered",
  },

  // --- uniques: one-of-a-kind, boss-gated, fixed (never randomly rolled) --
  "wardens-judgment": {
    id: "wardens-judgment", name: "The Warden's Judgment", kind: "armor", slot: "chest",
    tier: 15, stats: { hp: 260 }, value: 8000, icon: "onyx-plate",
    unique: true, dropFrom: "warden",
    fixedEffect: { kind: "negation", value: 0.25 },
  },
  "sovereigns-jewel": {
    id: "sovereigns-jewel", name: "The Sovereign's Crown Jewel", kind: "trinket", slot: "ring",
    tier: 20, stats: { attack: 20, mana: 70 }, value: 9500, icon: "gem-ring",
    unique: true, dropFrom: "sovereign",
    fixedEffect: { kind: "lifesteal", value: 0.2 },
  },
  "frostkings-diadem": {
    id: "frostkings-diadem", name: "The Frostking's Diadem", kind: "armor", slot: "helmet",
    tier: 27, stats: { hp: 150, mana: 70 }, value: 11000, icon: "plate-helm",
    unique: true, dropFrom: "frostking",
    fixedEffect: { kind: "regen", value: 30 },
  },
  "forgehearts-grasp": {
    id: "forgehearts-grasp", name: "Forgeheart's Grasp", kind: "armor", slot: "hands",
    tier: 38, stats: { hp: 110 }, value: 13000, icon: "plate-gloves",
    unique: true, dropFrom: "forgeheart",
    fixedEffect: { kind: "lifesteal", value: 0.25 },
  },
  "tempest-wardens-stride": {
    id: "tempest-wardens-stride", name: "Tempest Warden's Stride", kind: "armor", slot: "legs",
    tier: 44, stats: { hp: 200 }, value: 14000, icon: "plate-boots",
    unique: true, dropFrom: "tempestwarden",
    fixedEffect: { kind: "negation", value: 0.3 },
  },
  "rotmothers-embrace": {
    id: "rotmothers-embrace", name: "Rotmother's Embrace", kind: "trinket", slot: "necklace",
    tier: 50, stats: { hp: 260, mana: 110 }, value: 15000, icon: "rotmothers-embrace",
    unique: true, dropFrom: "rotmother",
    fixedEffect: { kind: "regen", value: 40 },
  },
  "sundered-kings-vow": {
    id: "sundered-kings-vow", name: "The Sundered King's Vow", kind: "weapon", slot: "weapon",
    tier: 54, stats: { attack: 140 }, value: 20000, weight: 3.4,
    icon: "sundered-kings-vow", unique: true, dropFrom: "sunderedking",
    fixedEffect: { kind: "lifesteal", value: 0.35 },
  },
  "the-hollow-crown": {
    id: "the-hollow-crown", name: "The Hollow Crown", kind: "armor", slot: "helmet",
    tier: 58, stats: { hp: 300, mana: 120 }, value: 24000, icon: "plate-helm",
    unique: true, dropFrom: "thehollow",
    fixedEffect: { kind: "negation", value: 0.32 },
  },

  // --- trash: no stats, sold for gold --------------------------------------
  "rusted-scrap": {
    id: "rusted-scrap", name: "Rusted Scrap", kind: "trash",
    tier: 1, stats: {  }, value: 9, icon: "rusted-scrap",
  },
  "cracked-fang": {
    id: "cracked-fang", name: "Cracked Fang", kind: "trash",
    tier: 1, stats: {  }, value: 14, icon: "cracked-fang",
  },
  "tarnished-coin": {
    id: "tarnished-coin", name: "Tarnished Coin", kind: "trash",
    tier: 3, stats: {  }, value: 26, icon: "tarnished-coin",
  },
  "ashen-dust": {
    id: "ashen-dust", name: "Ashen Dust", kind: "trash",
    tier: 5, stats: {  }, value: 40, icon: "ashen-dust",
  },
  "warden-sigil": {
    id: "warden-sigil", name: "Warden Sigil", kind: "trash",
    tier: 10, stats: {  }, value: 120, icon: "warden-sigil",
  },
  // Trash topped out at tier 10 the same way gear used to — a level-50 boss
  // was rolling the exact same handful of coins and scraps as a level-10
  // mob, so the gold you actually got for "junk" barely moved past the
  // early game no matter how high you climbed. These carry it the rest of
  // the way up, each stage roughly doubling the last.
  "revenant-coin": {
    id: "revenant-coin", name: "Revenant Coin", kind: "trash",
    tier: 15, stats: {  }, value: 260, icon: "tarnished-coin",
  },
  "sovereign-relic": {
    id: "sovereign-relic", name: "Sovereign Relic", kind: "trash",
    tier: 20, stats: {  }, value: 480, icon: "warden-sigil",
  },
  "frostbound-shard": {
    id: "frostbound-shard", name: "Frostbound Shard", kind: "trash",
    tier: 27, stats: {  }, value: 850, icon: "ashen-dust",
  },
  "cinder-ingot": {
    id: "cinder-ingot", name: "Cinder Ingot", kind: "trash",
    tier: 32, stats: {  }, value: 1450, icon: "rusted-scrap",
  },
  "storm-crystal": {
    id: "storm-crystal", name: "Storm Crystal", kind: "trash",
    tier: 38, stats: {  }, value: 2500, icon: "cracked-fang",
  },
  "plague-ichor": {
    id: "plague-ichor", name: "Plague Ichor", kind: "trash",
    tier: 44, stats: {  }, value: 4200, icon: "ashen-dust",
  },
  "seraph-feather": {
    id: "seraph-feather", name: "Seraph Feather", kind: "trash",
    tier: 50, stats: {  }, value: 7000, icon: "tarnished-coin",
  },
  "sundered-regalia": {
    id: "sundered-regalia", name: "Sundered Regalia", kind: "trash",
    tier: 54, stats: {  }, value: 11000, icon: "warden-sigil",
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

/**
 * Rarity scales with the mob's own level, so the higher-level maps naturally
 * skew toward better drops — and legendary is gated behind level 45+, which
 * in practice means only the Tempest Spire's boss onward (Tempest Warden,
 * Rotmother, the Sundered King) can drop one at all.
 */
function rollRarity(mobLevel: number, boss: boolean, lootBonus = 0): Rarity {
  return rollRarityDetailed(mobLevel, boss, lootBonus).rarity;
}

/** How close a roll has to fall under a threshold to count as "so close" —
 *  tuned so it's an occasional tease, not something that fires on every
 *  other kill. */
const NEAR_MISS_MARGIN = 0.05;

/** Same roll as rollRarity, but also reports whether it landed just under
 *  the next rarity up — purely a UI hook (see rollDrops' nearMiss return),
 *  changes nothing about the actual odds since it's the exact same `r`. */
function rollRarityDetailed(
  mobLevel: number,
  boss: boolean,
  lootBonus: number
): { rarity: Rarity; nearMiss: Rarity | null } {
  const r = Math.random() + (boss ? 0.35 : 0) + mobLevel * 0.008 + lootBonus;
  const thresholds: Array<[number, Rarity]> = [
    [0.62, "uncommon"],
    [0.95, "rare"],
    [1.2, "epic"],
  ];
  if (mobLevel >= 45) thresholds.push([1.55, "legendary"]);

  let rarity: Rarity = "common";
  for (const [thresh, tier] of thresholds) {
    if (r > thresh) rarity = tier;
  }

  let nearMiss: Rarity | null = null;
  for (const [thresh, tier] of thresholds) {
    if (r < thresh && thresh - r <= NEAR_MISS_MARGIN) {
      nearMiss = tier;
      break;
    }
  }
  return { rarity, nearMiss };
}

/**
 * One randomly rolled affix, magnitude included. `scale` softens it for
 * epics rolling a "junior" version of a legendary's effect — roughly half
 * strength, so it's a nice surprise on a gold item without making legendary
 * feel pointless.
 */
function rollEffect(scale: number): { kind: ItemEffect; value: number } {
  const roll = Math.random();
  if (roll < 0.25) {
    return {
      kind: "lifesteal",
      value: Math.round((0.08 + Math.random() * 0.1) * scale * 1000) / 1000,
    };
  }
  if (roll < 0.5) {
    return {
      kind: "negation",
      value: Math.round((0.12 + Math.random() * 0.13) * scale * 1000) / 1000,
    };
  }
  if (roll < 0.75) {
    return { kind: "regen", value: Math.max(1, Math.round((6 + Math.random() * 8) * scale)) };
  }
  return {
    kind: "cdr",
    value: Math.round((0.1 + Math.random() * 0.1) * scale * 1000) / 1000,
  };
}

/** Epics roll a weaker affix this often — a taste of what legendary gets guaranteed. */
const EPIC_EFFECT_CHANCE = 0.35;
const EPIC_EFFECT_SCALE = 0.5;

export function makeItem(baseId: string, rarity: Rarity): Item {
  const b = base(baseId);
  // Uniques never roll: always legendary, always the exact same affix —
  // that fixed identity is the entire point of a named item.
  if (b.unique) {
    const item: Item = { uid: uid(), baseId, rarity: "legendary", plus: 0 };
    if (b.fixedEffect) item.effect = { ...b.fixedEffect };
    return item;
  }
  const item: Item = { uid: uid(), baseId, rarity, plus: 0 };
  if (rarity === "legendary") item.effect = rollEffect(1);
  else if (rarity === "epic" && Math.random() < EPIC_EFFECT_CHANCE) {
    item.effect = rollEffect(EPIC_EFFECT_SCALE);
  }
  return item;
}

/**
 * Gear within roughly one stage's reach of the mob's own level — a window,
 * not just "anything at or below". Item tiers only went up to 12 while mobs
 * climb to 54, so an unbounded "at or below" filter meant a level-50 boss
 * was just as likely to hand over a tier-1 knuckle-duster as anything
 * actually suited to it, and a lucky gold roll on that knuckle-duster could
 * easily lose to a plain blue endgame weapon. Keeping tier tracking level
 * means rarity finally layers cleanly on top of a sensible base.
 */
function eligibleGear(mobLevel: number): ItemBase[] {
  // Uniques are excluded from the general pool entirely — they only ever
  // come from the dedicated boss-gated roll in rollDrops, never as a random
  // hit off the normal gear table.
  const inWindow = Object.values(ITEM_BASES).filter(
    (b) => b.kind !== "trash" && !b.unique && b.tier <= mobLevel + 2 && b.tier >= mobLevel - 12
  );
  if (inWindow.length) return inWindow;
  // Very low levels (or gaps in the tier ladder) fall back to whatever's
  // closest at or below the mob, rather than dropping nothing.
  return Object.values(ITEM_BASES)
    .filter((b) => b.kind !== "trash" && !b.unique && b.tier <= mobLevel + 2)
    .sort((a, b) => b.tier - a.tier)
    .slice(0, 3);
}

/**
 * Same windowing as gear, applied to trash. Trash used to top out at tier
 * 10 with no lower bound on the filter, so a level-50 boss dropped the same
 * handful of low-value scraps as a level-10 mob — "junk" gold barely grew
 * at all past the early game no matter how far you climbed.
 */
function eligibleTrash(mobLevel: number): ItemBase[] {
  const inWindow = Object.values(ITEM_BASES).filter(
    (b) => b.kind === "trash" && b.tier <= mobLevel + 2 && b.tier >= mobLevel - 12
  );
  if (inWindow.length) return inWindow;
  return Object.values(ITEM_BASES)
    .filter((b) => b.kind === "trash" && b.tier <= mobLevel + 2)
    .sort((a, b) => b.tier - a.tier)
    .slice(0, 3);
}

/** Flat chance a matching boss's own unique drops on top of its usual loot. */
const UNIQUE_DROP_CHANCE = 0.1;

/** How many named uniques exist in total — computed, not hand-counted, so it
 *  never drifts out of sync with ITEM_BASES as more get added. */
export function totalUniqueCount(): number {
  return Object.values(ITEM_BASES).filter((b) => b.unique).length;
}

/**
 * Rolls a mob's drops. Trash is common and exists to be sold; gear is rarer
 * and drops at or near the mob's own level. `mobTypeId` gates the rare
 * chance at a named unique — only the boss listed in that unique's
 * `dropFrom` can ever produce it. `lootBonus` shifts the rarity roll (and
 * the unique chance) up for harder difficulty modes — see
 * DIFFICULTY_LOOT_BONUS in adventure.ts.
 */
const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export interface RollDropsResult {
  items: Item[];
  /** The best near-miss across every roll this kill made, if any — see
   *  rollRarityDetailed. Purely a "so close!" UI hook, changes nothing. */
  nearMiss: Rarity | null;
}

export function rollDrops(
  mobLevel: number,
  boss: boolean,
  mobTypeId?: string,
  lootBonus = 0
): RollDropsResult {
  const out: Item[] = [];
  const rolls = boss ? 4 : 1;
  let nearMiss: Rarity | null = null;

  for (let i = 0; i < rolls; i++) {
    const r = Math.random();
    const gearChance = boss ? 0.75 : 0.18;
    if (r < gearChance) {
      const eligible = eligibleGear(mobLevel);
      if (eligible.length) {
        const rolled = rollRarityDetailed(mobLevel, boss, lootBonus);
        out.push(makeItem(pick(eligible).id, rolled.rarity));
        if (rolled.nearMiss && RARITY_RANK[rolled.nearMiss] > RARITY_RANK[nearMiss ?? "common"]) {
          nearMiss = rolled.nearMiss;
        }
      }
    } else if (r < gearChance + 0.62) {
      const trash = eligibleTrash(mobLevel);
      if (trash.length) out.push(makeItem(pick(trash).id, "common"));
    }
  }

  if (boss && mobTypeId) {
    for (const b of Object.values(ITEM_BASES)) {
      if (
        b.unique &&
        b.dropFrom === mobTypeId &&
        Math.random() < UNIQUE_DROP_CHANCE * (1 + lootBonus)
      ) {
        out.push(makeItem(b.id, "legendary"));
      }
    }
  }
  return { items: out, nearMiss };
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

/**
 * A one-line joke about who owned this thing before you. Purely flavor —
 * keyed by base id rather than folded into ITEM_BASES so the item table
 * above stays scannable and this can be skimmed/edited on its own.
 */
const ITEM_LORE: Record<string, string> = {
  // weapons
  "worn-knuckles": "Belonged to a tavern brawler who insisted he 'never actually loses, just leaves early.'",
  "iron-claws": "Forged by a blacksmith who lost three fingers perfecting the grip. Worth it, he says.",
  "ember-gauntlet": "Once warmed the hands of a chef who burned down two restaurants before switching careers.",
  "hooked-scythe": "A farmer's retirement gift to himself after one unusually eventful harvest.",
  "void-reaper": "Pulled from a portal that closed immediately after. Nobody asked what it was reaching for.",
  "warden-maul": "Confiscated evidence from a bar fight so severe the bar no longer legally exists.",
  "revenants-edge": "Its last owner swore he'd 'only die once.' He was wrong twice.",
  "sovereigns-blade": "Ceremonial, technically. The ceremony just kept ending in bloodshed.",
  "frostbite-fang": "Bit clean through a glacier once. The glacier has not forgiven it.",
  "cinderforged-gauntlet": "Quenched in lava by someone who skipped every single safety briefing.",
  "stormcallers-grasp": "Struck by lightning seven times. The eighth time, it struck back.",
  "plagueroot-cleaver": "Harvested a garden that was, in retrospect, not a garden.",
  "rotmothers-kiss": "Do not lick it. This has been written down specifically because someone did.",
  "sundered-greatblade": "Shattered a throne in one swing. The throne had it coming.",
  // chest
  "tattered-wrap": "A scarecrow's old coat. The scarecrow retired undefeated.",
  "scaled-vest": "Skinned off something that, alive, would very much like it back.",
  "onyx-plate": "Mined, melted, and worn by a knight who never once said what he was guarding.",
  "revenant-mail": "Its previous owner technically still owns it. He just also died in it.",
  "sovereign-plate": "Worn to three coronations and one very awkward abdication.",
  "frostguard-harness": "Kept a sentry warm for forty winters. He still complained constantly.",
  "cinderplate-armor": "Forged inside an active volcano by someone with questionable life insurance.",
  "stormward-vest": "Struck by lightning so often the wearer started charging admission.",
  "plaguebound-hide": "Peeled from something that used to be a person, and before that, something worse.",
  "rotmothers-carapace": "Grown, not made. Please don't ask what it was grown on.",
  "sundered-aegis": "The last thing between a king and his own army. It lost that argument.",
  // helmet
  "tattered-hood": "Worn by a lookout who fell asleep on every single shift.",
  "scaled-cap": "Made from a creature that shed it willingly, mostly out of spite.",
  "onyx-helm": "Its visor is stuck permanently at a smug angle. No one knows why.",
  "revenant-hood": "The last thing its owner saw was the inside of it. He's still wearing it.",
  "sovereign-crown": "Technically a crown. The sovereign insists it's 'more of a strong suggestion.'",
  "frostguard-helm": "Frozen solid to a watchtower for a decade before someone finally thawed it out.",
  "cinderplate-helm": "Melted twice, reforged twice, learned nothing both times.",
  "stormward-hood": "Hums faintly during storms. Nobody's brave enough to ask why.",
  "plaguebound-mask": "Filters out the smell. Does absolutely nothing about the screaming.",
  "rotmothers-crown": "Crowned something that was, charitably, no longer a queen.",
  "sundered-helm": "Cracked clean in half and still somehow considered an upgrade.",
  // boots (legs)
  "tattered-leggings": "Its last owner ran very fast, very often, from very avoidable situations.",
  "scaled-greaves": "Still twitches occasionally. Probably nothing.",
  "onyx-legguards": "Worn by a duelist famous for never actually needing to move his feet.",
  "revenant-leggings": "Kept walking three days after the rest of him stopped.",
  "sovereign-greaves": "Made for pacing thrones, not battlefields. Saw plenty of both.",
  "frostguard-legguards": "Kept a sentry's feet warm through forty winters. His knees never forgave him.",
  "cinderplate-greaves": "Walk on lava, technically. 'Technically' is doing a lot of work there.",
  "stormward-leggings": "Grounded lightning eleven times. The wearer still flinches at thunder.",
  "plaguebound-leggings": "Left footprints that kept moving after he stopped walking.",
  "rotmothers-greaves": "Grown from roots that were, at some point, somebody's legs.",
  "sundered-legguards": "Outran a collapsing throne room. Barely.",
  // gloves (hands)
  "tattered-gloves": "Worn by a pickpocket who insists he's 'retired.' He is not.",
  "scaled-gauntlets": "Grip strength unmatched. Letting go, less so.",
  "onyx-grips": "Its owner never once dropped anything. Or apologized for anything.",
  "revenant-gloves": "The fingers still twitch. Everyone agrees not to mention it.",
  "sovereign-gauntlets": "Signed three treaties and broke all of them personally.",
  "frostguard-grips": "Never once got frostbite. Never once let go of anything, either.",
  "cinderplate-gauntlets": "Handled molten metal bare-fisted. The gauntlets, not the hands.",
  "stormward-gloves": "Caught lightning mid-strike, once, on a dare that went surprisingly well.",
  "plaguebound-grips": "Whatever it touched didn't stay healthy for long.",
  "rotmothers-gauntlets": "Feels warm. It should not feel warm.",
  "sundered-gauntlets": "Punched through a castle gate. The gate lost.",
  // necklace
  "cracked-charm": "Supposedly lucky. Its last three owners would strongly disagree.",
  "swift-band": "Worn by a messenger who was, somehow, always exactly one minute late.",
  "heart-of-ash": "Still faintly warm. The fire it survived was not.",
  "revenant-locket": "Contains a portrait of someone who insists they're not actually gone.",
  "sovereign-signet": "Opened doors, treasuries, and one extremely ill-advised war.",
  "frostheart-gem": "Never melts. Never has. The people who study it don't ask why anymore.",
  "cinder-talisman": "Smells faintly of smoke. Everything near it eventually does too.",
  "stormcallers-sigil": "Crackles softly before a storm. Loudly during one.",
  "plaguebound-vial": "The label wore off. Nobody's volunteering to sniff it and check.",
  "rotmothers-heart": "Still beats. Once a minute. Please don't listen too closely.",
  "sundered-crown-shard": "One piece of a crown that shattered mid-coronation. Bad omen, great pendant.",
  // belt
  "frayed-sash": "Held up a beggar's dignity long after it stopped holding up his pants.",
  "scaled-girdle": "Shed by something enormous that, notably, was not asked for permission.",
  "onyx-cinch": "Cinched tight enough to leave a permanent, faintly embarrassing groove.",
  "revenant-waistguard": "Its owner insists it's 'just resting.' It has been three years.",
  "sovereign-girdle": "Worn at every royal banquet. Loosened after every royal banquet.",
  "frostguard-belt": "Never once let a sword through. Never once let a snack through either.",
  "cinderplate-girdle": "Forged red-hot, worn ice-cold, somehow always uncomfortable.",
  "stormward-sash": "Flutters dramatically even indoors. Nobody knows how.",
  "plaguebound-cinch": "Tightened around something that, in hindsight, should've stayed loose.",
  "rotmothers-girdle": "Grown, not sewn. Occasionally still growing.",
  "sundered-waistguard": "The last thing holding a general's armor together. Barely.",
  // earring
  "cracked-stud": "Pierced through an ear that, in fairness, was warned.",
  "swift-hoop": "Jingles constantly. Its owner was famously impossible to sneak up on.",
  "ember-drop": "Warm to the touch, always. The smith who made it was not, eventually.",
  "revenant-hoop": "Still hanging from an ear that technically isn't attached to anything anymore.",
  "sovereign-stud": "Worn only on the left. The right ear, historically, had bad luck.",
  "frostheart-drop": "Colder than the room it's in. Every room it's in.",
  "cinder-hoop": "Glows faintly in the dark. Not recommended for sneaking.",
  "storm-stud": "Crackles before thunder. Its last owner became very good at predicting weather.",
  "plague-drop": "Weeps a single drop of something. Nobody's identified what yet.",
  "rotmothers-hoop": "Smells faintly of rot. This is apparently intentional.",
  "sundered-stud": "Survived the collapse of an empire. Somehow still just an earring.",
  // ring
  "iron-band": "A pawnbroker's most returned item. Nobody says why.",
  "swift-ring": "Spins on the finger if you move too fast. Its owner moved very fast, very often.",
  "ember-loop": "Warm enough to cook an egg on, which someone definitely tried.",
  "revenant-ring": "Slides right back on every time you take it off. Every time.",
  "sovereign-band": "Sealed a marriage, then an annexation, then a very messy divorce.",
  "frostheart-ring": "The finger wearing it never gets frostbite. The rest of the hand, less lucky.",
  "cinder-loop": "Forged from a ring that melted in a house fire. The house started it.",
  "storm-ring": "Hums right before lightning strikes nearby. Extremely useful. Extremely alarming.",
  "plague-band": "Turned three fingers an unusual shade of green. Purely cosmetic, allegedly.",
  "rotmothers-ring": "Grown around the finger, not slipped onto it. Removal not recommended.",
  "sundered-band": "The last piece of a treaty that was broken before the ink dried.",
  // uniques
  "wardens-judgment": "He wore it to every execution he ever ordered. It never once let a blade through — his conscience had worse luck.",
  "sovereigns-jewel": "Cut from a stone the Sovereign called 'priceless' right up until she traded it for one more year on the throne.",
  "frostkings-diadem": "Carved from ice that has never once melted, worn by a king who never once forgave anybody either.",
  "forgehearts-grasp": "Tempered in a furnace that was, at the time, still a person standing inside it.",
  "tempest-wardens-stride": "Never touched the ground twice in the same place. Neither did anyone he was chasing.",
  "rotmothers-embrace": "She called it love. Everyone else called it an infection with excellent bedside manner.",
  "sundered-kings-vow": "He swore on this blade that the throne would never fall while he lived. He kept his word — technically.",
  "the-hollow-crown": "Worn by whatever came after the last king — it doesn't remember a coronation, only that the crown was already on when it woke up.",
};

export function itemLore(item: Item): string {
  return (
    ITEM_LORE[item.baseId] ??
    "No one remembers where this came from. Probably for the best."
  );
}

/** Sum of every equipped item's stats. */
export function equippedStats(
  equipped: Partial<Record<EquipSlot, Item>>
): Required<ItemStats> {
  const total = { attack: 0, hp: 0, mana: 0 };
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    const s = itemStats(item);
    total.attack += s.attack ?? 0;
    total.hp += s.hp ?? 0;
    total.mana += s.mana ?? 0;
  }
  return total;
}

export interface GearEffects {
  lifesteal: number;
  negation: number;
  regenHp: number;
  regenMana: number;
  cdr: number;
}

/** Sum of every equipped legendary's combat affix, softly capped so stacking
 * three of the same one can't trivialise a fight. */
export function equippedEffects(
  equipped: Partial<Record<EquipSlot, Item>>
): GearEffects {
  let lifesteal = 0;
  let negation = 0;
  let regenHp = 0;
  let cdr = 0;
  for (const item of Object.values(equipped)) {
    if (!item?.effect) continue;
    if (item.effect.kind === "lifesteal") lifesteal += item.effect.value;
    else if (item.effect.kind === "negation") negation += item.effect.value;
    else if (item.effect.kind === "regen") regenHp += item.effect.value;
    else if (item.effect.kind === "cdr") cdr += item.effect.value;
  }
  return {
    lifesteal: Math.min(0.5, lifesteal),
    negation: Math.min(0.6, negation),
    regenHp,
    regenMana: Math.round(regenHp * 0.6),
    // Capped well short of 100% so even a full CDR-stacked build can't spam
    // an 18s ultimate every couple seconds.
    cdr: Math.min(0.4, cdr),
  };
}

// --------------------------------------------------------- ranking / slotting

/**
 * A single weighted number so items can be ranked, not just labelled — drives
 * both the backpack's "upgrade" sort and which slot auto-equip targets within
 * a paired family (earrings, rings).
 */
export function itemScore(item: Item): number {
  const s = itemStats(item);
  // A legendary affix is worth chasing even over a plain stat upgrade; an
  // epic's weaker "junior" version of one is still worth a solid nudge.
  const effectBonus = item.effect ? (item.rarity === "legendary" ? 250 : 130) : 0;
  return (
    (s.attack ?? 0) * 4 +
    (s.hp ?? 0) * 0.4 +
    (s.mana ?? 0) * 0.2 +
    effectBonus
  );
}

/**
 * The item a candidate for this family should be compared against: `undefined`
 * whenever the family still has an open slot (nothing to replace, so it's
 * always worth equipping), otherwise the weaker of the two current occupants
 * — the one an equip would actually bump.
 */
export function weakestInFamily(
  equipped: Partial<Record<EquipSlot, Item>>,
  family: SlotFamily
): Item | undefined {
  const slots = familySlots(family);
  const held = slots.map((s) => equipped[s]).filter((i): i is Item => !!i);
  if (held.length < slots.length) return undefined;
  return held.reduce((worst, i) => (itemScore(i) < itemScore(worst) ? i : worst));
}

// ------------------------------------------------------------------- sets

export const SET_NAME: Record<SetId, string> = {
  tattered: "Tattered",
  scaled: "Scaled",
  onyx: "Onyx",
  revenant: "Revenant's",
  sovereign: "Sovereign's",
  frostguard: "Frostguard",
  cinderplate: "Cinderplate",
  stormward: "Stormward",
  plaguebound: "Plaguebound",
  rotmother: "Rotmother's",
  sundered: "Sundered",
};

/** 0 (starter gear) .. 10 (endgame) — the same rung each set's items already
 *  climb, reused so bonus magnitude follows the one curve instead of 11 sets
 *  of hand-tuned numbers drifting out of sync with it over time. */
const SET_TIER: Record<SetId, number> = {
  tattered: 0,
  scaled: 1,
  onyx: 2,
  revenant: 3,
  sovereign: 4,
  frostguard: 5,
  cinderplate: 6,
  stormward: 7,
  plaguebound: 8,
  rotmother: 9,
  sundered: 10,
};

export interface SetBonus {
  count: number;
  stats: ItemStats;
  effect?: { kind: ItemEffect; value: number };
}

/**
 * A set's 2/4/6/8-piece bonuses, generated from its tier rung rather than
 * hand-authored — 11 sets x 4 thresholds would otherwise be 44 numbers to
 * keep in sync by hand every time the base item curve above moves. Bonuses
 * stack: equipping 6 pieces grants the 2pc, 4pc *and* 6pc rewards.
 */
export function setBonuses(id: SetId): SetBonus[] {
  const t = SET_TIER[id];
  return [
    { count: 2, stats: { hp: 15 + t * 14 } },
    { count: 4, stats: { attack: 2 + Math.round(t * 2.2) } },
    { count: 6, stats: { mana: 20 + t * 12, hp: 10 + t * 8 } },
    // Sundered is the top rung of the ladder — its 8pc bonus grants
    // Cooldown Reduction instead of Vitality, so the game's rarest full
    // set has its own signature identity rather than just bigger numbers.
    id === "sundered"
      ? { count: 8, stats: {}, effect: { kind: "cdr", value: round3(0.05 + t * 0.015) } }
      : { count: 8, stats: {}, effect: { kind: "regen", value: 4 + t * 3 } },
    // The full 11-slot match — every equip slot from the same rung. Pure
    // stats rather than another effect roll, so it can't push the
    // lifesteal/negation/cdr caps (already shared with the 8pc bonus) any
    // higher.
    { count: 11, stats: { attack: 10 + t * 4, hp: 60 + t * 30 } },
  ];
}

/** How many equipped slots belong to each set — counts slots, not distinct
 *  items, so two copies of the same ring (one in each ring slot) count as 2. */
export function equippedSetCounts(
  equipped: Partial<Record<EquipSlot, Item>>
): Partial<Record<SetId, number>> {
  const counts: Partial<Record<SetId, number>> = {};
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    const setId = base(item.baseId).setId;
    if (!setId) continue;
    counts[setId] = (counts[setId] ?? 0) + 1;
  }
  return counts;
}

/** Sum of every threshold currently met, across every set worn. */
export function equippedSetStats(
  equipped: Partial<Record<EquipSlot, Item>>
): Required<ItemStats> {
  const total = { attack: 0, hp: 0, mana: 0 };
  for (const [id, n] of Object.entries(equippedSetCounts(equipped)) as [SetId, number][]) {
    for (const b of setBonuses(id)) {
      if (n < b.count) continue;
      total.attack += b.stats.attack ?? 0;
      total.hp += b.stats.hp ?? 0;
      total.mana += b.stats.mana ?? 0;
    }
  }
  return total;
}

/** Sum of every threshold-met set's magical affix (only the 8pc bonus rolls one). */
export function equippedSetEffects(
  equipped: Partial<Record<EquipSlot, Item>>
): { lifesteal: number; negation: number; regenHp: number; cdr: number } {
  let lifesteal = 0;
  let negation = 0;
  let regenHp = 0;
  let cdr = 0;
  for (const [id, n] of Object.entries(equippedSetCounts(equipped)) as [SetId, number][]) {
    for (const b of setBonuses(id)) {
      if (n < b.count || !b.effect) continue;
      if (b.effect.kind === "lifesteal") lifesteal += b.effect.value;
      else if (b.effect.kind === "negation") negation += b.effect.value;
      else if (b.effect.kind === "regen") regenHp += b.effect.value;
      else if (b.effect.kind === "cdr") cdr += b.effect.value;
    }
  }
  return { lifesteal, negation, regenHp, cdr };
}

/** One row per set with at least one piece equipped, for the character sheet. */
export interface SetProgress {
  id: SetId;
  name: string;
  count: number;
  bonuses: Array<SetBonus & { active: boolean }>;
}
export function activeSetProgress(equipped: Partial<Record<EquipSlot, Item>>): SetProgress[] {
  const counts = equippedSetCounts(equipped);
  return (Object.entries(counts) as [SetId, number][])
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({
      id,
      name: SET_NAME[id],
      count: n,
      bonuses: setBonuses(id).map((b) => ({ ...b, active: n >= b.count })),
    }))
    .sort((a, b) => SET_TIER[b.id] - SET_TIER[a.id]);
}

// ----------------------------------------------------------------- storage

/** Storage starts here; the bank keeper sells room past it. Generous enough
 *  that this is a late-game sink, not an early-game wall. Lives here (not
 *  progression.ts) since items.ts has no imports of its own — progression.ts
 *  already imports from here, so the reverse would be circular. */
export const STORAGE_BASE_CAP = 40;
/** Each purchase adds this many slots to AdventureSave.storageCap. */
export const STORAGE_EXPANSION_SIZE = 20;
/** Gold cost scales with how many expansions already bought, so the sink
 *  stays meaningful instead of paying itself off once and being forgotten. */
export function storageExpansionCost(currentCap: number): number {
  const bought = Math.max(0, Math.round((currentCap - STORAGE_BASE_CAP) / STORAGE_EXPANSION_SIZE));
  return 2000 + bought * 1500;
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
