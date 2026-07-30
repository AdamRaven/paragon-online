/** Loot, gear, the town economy and weapon enhancement. */

export type ItemKind = "weapon" | "armor" | "trinket" | "trash";
export type EquipSlot = "weapon" | "armor" | "trinket";
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
export type ItemEffect = "lifesteal" | "negation" | "regen";

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
};

export interface ItemStats {
  attack?: number;
  hp?: number;
  mana?: number;
  /** Movement speed, a fraction added to speedMult (0.05 = +5%). */
  speed?: number;
  /** Attack speed, a fraction added to attackSpeed (0.05 = +5%). */
  atkSpeed?: number;
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
    id: "worn-knuckles", name: "Worn Knuckles", kind: "weapon", slot: "weapon",
    tier: 1, stats: { attack: 3, atkSpeed: 0.03 }, value: 40, weight: 1, icon: "worn-knuckles",
  },
  "iron-claws": {
    id: "iron-claws", name: "Iron Claws", kind: "weapon", slot: "weapon",
    tier: 3, stats: { attack: 6, speed: 0.02, atkSpeed: 0.03 }, value: 90, weight: 1.15, icon: "iron-claws",
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
  // The original six weapons top out at tier 12, but mobs go all the way to
  // level 54 — without gear to match, a level-50 boss had just as much
  // chance of dropping a tier-1 knuckle-duster as anything else, so a gold
  // item could easily come out weaker than a blue one. These carry the same
  // curve up to the endgame (icons reused across tiers, same as any weapon
  // family reskinned at higher level).
  "revenants-edge": {
    id: "revenants-edge", name: "Revenant's Edge", kind: "weapon", slot: "weapon",
    tier: 15, stats: { attack: 30, atkSpeed: 0.04 }, value: 850, weight: 2.7, icon: "iron-claws",
  },
  "sovereigns-blade": {
    id: "sovereigns-blade", name: "Sovereign's Blade", kind: "weapon", slot: "weapon",
    tier: 20, stats: { attack: 40, mana: 16 }, value: 1200, weight: 2.85, icon: "hooked-scythe",
  },
  "frostbite-fang": {
    id: "frostbite-fang", name: "Frostbite Fang", kind: "weapon", slot: "weapon",
    tier: 27, stats: { attack: 52, speed: 0.03 }, value: 1700, weight: 3.0, icon: "ember-gauntlet",
  },
  "cinderforged-gauntlet": {
    id: "cinderforged-gauntlet", name: "Cinderforged Gauntlet", kind: "weapon", slot: "weapon",
    tier: 32, stats: { attack: 62 }, value: 2200, weight: 3.15, icon: "void-reaper",
  },
  "stormcallers-grasp": {
    id: "stormcallers-grasp", name: "Stormcaller's Grasp", kind: "weapon", slot: "weapon",
    tier: 38, stats: { attack: 74, mana: 24 }, value: 2900, weight: 3.3, icon: "warden-maul",
  },
  "plagueroot-cleaver": {
    id: "plagueroot-cleaver", name: "Plagueroot Cleaver", kind: "weapon", slot: "weapon",
    tier: 44, stats: { attack: 86, atkSpeed: 0.05 }, value: 3700, weight: 3.45, icon: "iron-claws",
  },
  "rotmothers-kiss": {
    id: "rotmothers-kiss", name: "Rotmother's Kiss", kind: "weapon", slot: "weapon",
    tier: 50, stats: { attack: 98, mana: 30 }, value: 4700, weight: 3.6, icon: "void-reaper",
  },
  "sundered-greatblade": {
    id: "sundered-greatblade", name: "Sundered Greatblade", kind: "weapon", slot: "weapon",
    tier: 54, stats: { attack: 110 }, value: 5600, weight: 3.8, icon: "warden-maul",
  },

  // --- armour ---------------------------------------------------------------
  "tattered-wrap": {
    id: "tattered-wrap", name: "Tattered Wrap", kind: "armor", slot: "armor",
    tier: 1, stats: { hp: 25, speed: 0.01 }, value: 35, icon: "tattered-wrap",
  },
  "scaled-vest": {
    id: "scaled-vest", name: "Scaled Vest", kind: "armor", slot: "armor",
    tier: 4, stats: { hp: 60, speed: 0.01 }, value: 110, icon: "scaled-vest",
  },
  "onyx-plate": {
    id: "onyx-plate", name: "Onyx Plate", kind: "armor", slot: "armor",
    tier: 9, stats: { hp: 130 }, value: 300, icon: "onyx-plate",
  },
  "revenant-mail": {
    id: "revenant-mail", name: "Revenant Mail", kind: "armor", slot: "armor",
    tier: 15, stats: { hp: 230, speed: 0.01 }, value: 900, icon: "scaled-vest",
  },
  "sovereign-plate": {
    id: "sovereign-plate", name: "Sovereign Plate", kind: "armor", slot: "armor",
    tier: 20, stats: { hp: 300, speed: 0.02 }, value: 1250, icon: "onyx-plate",
  },
  "frostguard-harness": {
    id: "frostguard-harness", name: "Frostguard Harness", kind: "armor", slot: "armor",
    tier: 27, stats: { hp: 400, speed: 0.02 }, value: 1750, icon: "tattered-wrap",
  },
  "cinderplate-armor": {
    id: "cinderplate-armor", name: "Cinderplate Armor", kind: "armor", slot: "armor",
    tier: 32, stats: { hp: 470 }, value: 2250, icon: "scaled-vest",
  },
  "stormward-vest": {
    id: "stormward-vest", name: "Stormward Vest", kind: "armor", slot: "armor",
    tier: 38, stats: { hp: 560, speed: 0.02 }, value: 2950, icon: "onyx-plate",
  },
  "plaguebound-hide": {
    id: "plaguebound-hide", name: "Plaguebound Husk-Hide", kind: "armor", slot: "armor",
    tier: 44, stats: { hp: 650, speed: 0.02 }, value: 3750, icon: "tattered-wrap",
  },
  "rotmothers-carapace": {
    id: "rotmothers-carapace", name: "Rotmother's Carapace", kind: "armor", slot: "armor",
    tier: 50, stats: { hp: 740 }, value: 4700, icon: "scaled-vest",
  },
  "sundered-aegis": {
    id: "sundered-aegis", name: "Sundered Aegis", kind: "armor", slot: "armor",
    tier: 54, stats: { hp: 820 }, value: 5500, icon: "onyx-plate",
  },

  // --- trinkets -------------------------------------------------------------
  "cracked-charm": {
    id: "cracked-charm", name: "Cracked Charm", kind: "trinket", slot: "trinket",
    tier: 2, stats: { mana: 15 }, value: 45, icon: "cracked-charm",
  },
  "swift-band": {
    id: "swift-band", name: "Swift Band", kind: "trinket", slot: "trinket",
    tier: 5, stats: { speed: 0.06, mana: 20, atkSpeed: 0.05 }, value: 140, icon: "swift-band",
  },
  "heart-of-ash": {
    id: "heart-of-ash", name: "Heart of Ash", kind: "trinket", slot: "trinket",
    tier: 10, stats: { hp: 70, attack: 6, atkSpeed: 0.02 }, value: 380, icon: "heart-of-ash",
  },
  "revenant-locket": {
    id: "revenant-locket", name: "Revenant Locket", kind: "trinket", slot: "trinket",
    tier: 15, stats: { mana: 45, hp: 30, speed: 0.02 }, value: 920, icon: "cracked-charm",
  },
  "sovereign-signet": {
    id: "sovereign-signet", name: "Sovereign Signet", kind: "trinket", slot: "trinket",
    tier: 20, stats: { mana: 65, speed: 0.03, atkSpeed: 0.04 }, value: 1300, icon: "swift-band",
  },
  "frostheart-gem": {
    id: "frostheart-gem", name: "Frostheart Gem", kind: "trinket", slot: "trinket",
    tier: 27, stats: { hp: 90, attack: 8, atkSpeed: 0.03 }, value: 1800, icon: "heart-of-ash",
  },
  "cinder-talisman": {
    id: "cinder-talisman", name: "Cinder Talisman", kind: "trinket", slot: "trinket",
    tier: 32, stats: { mana: 95, speed: 0.04, atkSpeed: 0.05 }, value: 2300, icon: "cracked-charm",
  },
  "stormcallers-sigil": {
    id: "stormcallers-sigil", name: "Stormcaller's Sigil", kind: "trinket", slot: "trinket",
    tier: 38, stats: { hp: 140, mana: 60, atkSpeed: 0.04 }, value: 3000, icon: "swift-band",
  },
  "plaguebound-vial": {
    id: "plaguebound-vial", name: "Plaguebound Vial", kind: "trinket", slot: "trinket",
    tier: 44, stats: { attack: 14, speed: 0.05, atkSpeed: 0.06 }, value: 3800, icon: "heart-of-ash",
  },
  "rotmothers-heart": {
    id: "rotmothers-heart", name: "Rotmother's Heart", kind: "trinket", slot: "trinket",
    tier: 50, stats: { hp: 200, mana: 110, speed: 0.03 }, value: 4750, icon: "cracked-charm",
  },
  "sundered-crown-shard": {
    id: "sundered-crown-shard", name: "Sundered Crown Shard", kind: "trinket", slot: "trinket",
    tier: 54, stats: { attack: 20, hp: 150, mana: 80, speed: 0.04, atkSpeed: 0.06 }, value: 5600, icon: "heart-of-ash",
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
  // Trash topped out at tier 10 the same way gear used to — a level-50 boss
  // was rolling the exact same handful of coins and scraps as a level-10
  // mob, so the gold you actually got for "junk" barely moved past the
  // early game no matter how high you climbed. These carry it the rest of
  // the way up, each stage roughly doubling the last.
  "revenant-coin": {
    id: "revenant-coin", name: "Revenant Coin", kind: "trash",
    tier: 15, stats: {}, value: 260, icon: "tarnished-coin",
  },
  "sovereign-relic": {
    id: "sovereign-relic", name: "Sovereign Relic", kind: "trash",
    tier: 20, stats: {}, value: 480, icon: "warden-sigil",
  },
  "frostbound-shard": {
    id: "frostbound-shard", name: "Frostbound Shard", kind: "trash",
    tier: 27, stats: {}, value: 850, icon: "ashen-dust",
  },
  "cinder-ingot": {
    id: "cinder-ingot", name: "Cinder Ingot", kind: "trash",
    tier: 32, stats: {}, value: 1450, icon: "rusted-scrap",
  },
  "storm-crystal": {
    id: "storm-crystal", name: "Storm Crystal", kind: "trash",
    tier: 38, stats: {}, value: 2500, icon: "cracked-fang",
  },
  "plague-ichor": {
    id: "plague-ichor", name: "Plague Ichor", kind: "trash",
    tier: 44, stats: {}, value: 4200, icon: "ashen-dust",
  },
  "seraph-feather": {
    id: "seraph-feather", name: "Seraph Feather", kind: "trash",
    tier: 50, stats: {}, value: 7000, icon: "tarnished-coin",
  },
  "sundered-regalia": {
    id: "sundered-regalia", name: "Sundered Regalia", kind: "trash",
    tier: 54, stats: {}, value: 11000, icon: "warden-sigil",
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
function rollRarity(mobLevel: number, boss: boolean): Rarity {
  const r = Math.random() + (boss ? 0.35 : 0) + mobLevel * 0.008;
  if (mobLevel >= 45 && r > 1.55) return "legendary";
  if (r > 1.2) return "epic";
  if (r > 0.95) return "rare";
  if (r > 0.62) return "uncommon";
  return "common";
}

/**
 * One randomly rolled affix, magnitude included. `scale` softens it for
 * epics rolling a "junior" version of a legendary's effect — roughly half
 * strength, so it's a nice surprise on a gold item without making legendary
 * feel pointless.
 */
function rollEffect(scale: number): { kind: ItemEffect; value: number } {
  const roll = Math.random();
  if (roll < 0.34) {
    return {
      kind: "lifesteal",
      value: Math.round((0.08 + Math.random() * 0.1) * scale * 1000) / 1000,
    };
  }
  if (roll < 0.67) {
    return {
      kind: "negation",
      value: Math.round((0.12 + Math.random() * 0.13) * scale * 1000) / 1000,
    };
  }
  return { kind: "regen", value: Math.max(1, Math.round((6 + Math.random() * 8) * scale)) };
}

/** Epics roll a weaker affix this often — a taste of what legendary gets guaranteed. */
const EPIC_EFFECT_CHANCE = 0.35;
const EPIC_EFFECT_SCALE = 0.5;

export function makeItem(baseId: string, rarity: Rarity): Item {
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
  const inWindow = Object.values(ITEM_BASES).filter(
    (b) => b.kind !== "trash" && b.tier <= mobLevel + 2 && b.tier >= mobLevel - 12
  );
  if (inWindow.length) return inWindow;
  // Very low levels (or gaps in the tier ladder) fall back to whatever's
  // closest at or below the mob, rather than dropping nothing.
  return Object.values(ITEM_BASES)
    .filter((b) => b.kind !== "trash" && b.tier <= mobLevel + 2)
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

/**
 * Rolls a mob's drops. Trash is common and exists to be sold; gear is rarer
 * and drops at or near the mob's own level.
 */
export function rollDrops(mobLevel: number, boss: boolean): Item[] {
  const out: Item[] = [];
  const rolls = boss ? 4 : 1;

  for (let i = 0; i < rolls; i++) {
    const r = Math.random();
    const gearChance = boss ? 0.75 : 0.18;
    if (r < gearChance) {
      const eligible = eligibleGear(mobLevel);
      if (eligible.length) {
        out.push(makeItem(pick(eligible).id, rollRarity(mobLevel, boss)));
      }
    } else if (r < gearChance + 0.62) {
      const trash = eligibleTrash(mobLevel);
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
  if (b.stats.atkSpeed) out.atkSpeed = round3(b.stats.atkSpeed * mult);
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
  const total = { attack: 0, hp: 0, mana: 0, speed: 0, atkSpeed: 0 };
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    const s = itemStats(item);
    total.attack += s.attack ?? 0;
    total.hp += s.hp ?? 0;
    total.mana += s.mana ?? 0;
    total.speed += s.speed ?? 0;
    total.atkSpeed += s.atkSpeed ?? 0;
  }
  return total;
}

export interface GearEffects {
  lifesteal: number;
  negation: number;
  regenHp: number;
  regenMana: number;
}

/** Sum of every equipped legendary's combat affix, softly capped so stacking
 * three of the same one can't trivialise a fight. */
export function equippedEffects(
  equipped: Partial<Record<EquipSlot, Item>>
): GearEffects {
  let lifesteal = 0;
  let negation = 0;
  let regenHp = 0;
  for (const item of Object.values(equipped)) {
    if (!item?.effect) continue;
    if (item.effect.kind === "lifesteal") lifesteal += item.effect.value;
    else if (item.effect.kind === "negation") negation += item.effect.value;
    else if (item.effect.kind === "regen") regenHp += item.effect.value;
  }
  return {
    lifesteal: Math.min(0.5, lifesteal),
    negation: Math.min(0.6, negation),
    regenHp,
    regenMana: Math.round(regenHp * 0.6),
  };
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
