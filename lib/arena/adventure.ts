import { getClass, skillOf } from "./classes";
import { DT, GRAVITY, MAX_FALL_SPEED, WALK_SPEED } from "./constants";
import { ArenaEngine, emptyIntent, type ArenaCallbacks, type Intent } from "./engine";
import { MOB_TYPES, getStage, hashSeed, mobAttackSpec, mulberry32, type MobType, type Stage } from "./mobs";
import { base, ITEM_BASES, itemName, itemValue, makeItem, RARITY_META, rollDrops, type Item } from "./items";
import { bountyComplete, bountyReward, ensureDailyBounty, todayKey } from "./bounties";
import { claimDailyLogin } from "./streak";
import { ensureWeeklyTrack } from "./weekly";
import {
  deriveArenaStats,
  expToNext,
  expWithLevelPenalty,
  grantExp,
  type AdventureSave,
  type Difficulty,
  type LevelUpResult,
} from "./progression";
import type { ClassId, CombatLogEntry, Facing, Fighter } from "./types";

const MOB_RESPAWN = 7;
const PLAYER_RESPAWN = 2.5;
/** Any non-boss spawn has this flat shot at rolling Elite. */
const ELITE_CHANCE = 0.1;
const ELITE_HP_MULT = 1.8;
const ELITE_DAMAGE_MULT = 1.35;
const ELITE_EXP_MULT = 2.5;
const ELITE_SIZE_MULT = 1.15;

type EliteAffix =
  | "shielded"
  | "vampiric"
  | "swift"
  | "volatile"
  | "regenerating"
  | "berserk"
  | "colossal";
const ELITE_AFFIXES: EliteAffix[] = [
  "shielded",
  "vampiric",
  "swift",
  "volatile",
  "regenerating",
  "berserk",
  "colossal",
];
/** Shown in the nameplate so a fight actually tells you why this one's
 *  behaving differently, not just that it's bigger. */
const ELITE_AFFIX_LABEL: Record<EliteAffix, string> = {
  shielded: "Shielded",
  vampiric: "Vampiric",
  swift: "Swift",
  volatile: "Volatile",
  regenerating: "Regenerating",
  berserk: "Berserk",
  colossal: "Colossal",
};
const ELITE_VAMPIRIC_LIFESTEAL = 0.3;
const ELITE_SWIFT_SPEED_MULT = 1.4;
/** Volatile detonates on death within this radius of the player, for flat
 *  (unmitigated) damage — the same "hazard-style" damage path environmental
 *  hazards already use, not a normal mitigated hit. */
const ELITE_VOLATILE_RADIUS = 140;
/** Regenerating: reuses the same regenHp field legendary gear/set bonuses
 *  already tick every frame for any fighter — heals per second, scaled by
 *  the mob's own level so it stays relevant late. */
const ELITE_REGEN_PER_LEVEL = 1.4;
/** Berserk: once below this HP fraction, permanently (for the rest of that
 *  fight) hits harder and moves faster — a one-time trigger tracked per
 *  MobBrain instance, the same shape as a boss's phase2. */
const ELITE_BERSERK_HP_FRAC = 0.5;
const ELITE_BERSERK_ATK_MULT = 1.4;
const ELITE_BERSERK_SPEED_MULT = 1.25;
/** Colossal: bigger, tankier and harder-hitting than a normal Elite, at the
 *  cost of being noticeably slower — a tradeoff rather than a strict
 *  upgrade, so it reads as a different fight instead of just "more Elite." */
const ELITE_COLOSSAL_SIZE_MULT = 1.35;
const ELITE_COLOSSAL_HP_MULT = 2.4;
const ELITE_COLOSSAL_DAMAGE_MULT = 1.5;
const ELITE_COLOSSAL_SPEED_MULT = 0.75;
/** Survival mode: dead mobs are removed rather than revived in place, but
 *  still get a beat to play their death animation/loot pop first. */
const SURVIVAL_MOB_CLEANUP = 0.4;
/** Weakest to strongest — how many of these are in play scales with wave
 *  number (see startNextWave), so early waves stay approachable. */
const SURVIVAL_POOL = [
  "husk",
  "brawler",
  "rabid-cur",
  "blade-wraith",
  "cultist",
  "shieldbearer",
  "colossus",
  "sentinel",
  "revenant",
  "frostfang",
];
/** How many trash mobs (plus one boss) the Daily Rift's seeded roster spawns —
 *  sized similarly to a single Boss Rush leg, not a full stage clear. */
const DAILY_CHALLENGE_MOB_COUNT = 6;
/** Stat multipliers applied to every mob spawned, on top of any Elite
 *  multiplier — chosen once at character creation and fixed for the save's
 *  life (see AdventureSave.difficulty). Loot bonus feeds rollDrops' rarity
 *  roll and unique-drop chance, so harder difficulties are worth playing. */
const DIFFICULTY_MULT: Record<Difficulty, { hp: number; damage: number; loot: number }> = {
  normal: { hp: 1, damage: 1, loot: 0 },
  hard: { hp: 1.6, damage: 1.3, loot: 0.15 },
  nightmare: { hp: 2.4, damage: 1.7, loot: 0.35 },
};

/** "Welcome back" idle trickle: capped low and short so it's a nice
 *  return-bonus, never a reason to leave the game running unattended
 *  instead of actually playing it. Only counts time between page loads
 *  (see AdventureEngine's constructor), not a background timer. */
const IDLE_CAP_MS = 8 * 60 * 60 * 1000;
const IDLE_GOLD_PER_MINUTE = 2;


/** The Sundered Crucible's rotating modifiers — two rolled at random on
 *  every entry (and every death), layered on top of Survival's wave engine
 *  (see AdventureEngine.rollCrucibleAffixes and spawnMob/MobBrain.think). */
export type CrucibleAffix = "reinforced" | "frenzied" | "bountiful" | "swarming" | "volatile";
export const CRUCIBLE_AFFIX_POOL: CrucibleAffix[] = [
  "reinforced",
  "frenzied",
  "bountiful",
  "swarming",
  "volatile",
];
export const CRUCIBLE_AFFIX_META: Record<CrucibleAffix, { label: string; blurb: string }> = {
  reinforced: { label: "Reinforced", blurb: "+60% mob health" },
  frenzied: { label: "Frenzied", blurb: "Mobs attack 25% faster" },
  bountiful: { label: "Bountiful", blurb: "Much better loot odds" },
  swarming: { label: "Swarming", blurb: "+2 mobs every wave" },
  volatile: { label: "Volatile", blurb: "Elite chance tripled" },
};

/** World Rifts: a rare bonus encounter that can open in any regular combat
 *  stage — a forced-Elite "Rift Warden" of whatever the stage would spawn
 *  anyway, worth going out of your way for. Unclaimed, it closes on its own. */
const RIFT_COOLDOWN_MIN = 75;
const RIFT_COOLDOWN_RANGE = 90;
const RIFT_CLAIM_WINDOW = 45;
/** Added on top of every other loot bonus (difficulty, Bountiful) for a
 *  Rift kill specifically. */
const RIFT_LOOT_BONUS = 0.5;

/** Level order for Boss Rush — see AdventureEngine.updateBossRush. */
const BOSS_RUSH_ORDER = [
  "warden",
  "sovereign",
  "frostking",
  "forgeheart",
  "tempestwarden",
  "rotmother",
  "sunderedking",
];

/** How close (world units) the player has to walk to auto-pick up a drop. */
const PICKUP_RADIUS_X = 34;
const PICKUP_RADIUS_Y = 50;
/** Unclaimed loot despawns after this long, so an ignored drop doesn't sit
 * in the simulation forever over a long farming session. */
const LOOT_DESPAWN_TIME = 90;
/** Hard safety cap regardless of age, in case something drops far faster
 * than it's ever collected. */
const MAX_LOOT_DROPS = 150;

/** A dead mob's loot, physically sitting in the world until walked over. */
export interface LootDrop {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** The exact surface (ground or platform) the drop settles on. */
  floorY: number;
  item: Item;
  /** Seconds alive, used to phase the idle bob/glint animation. */
  age: number;
}

export interface AdventureCallbacks extends ArenaCallbacks {
  onExp(amount: number, mobName: string, result: LevelUpResult): void;
  onPlayerDeath(): void;
  /** Fired once per kill with whatever the mob dropped. */
  onLoot(items: Item[]): void;
}

/**
 * The EXP campaign. It reuses the duel engine wholesale — the same physics,
 * combat, combo chains, knockdowns and skills — and adds mobs, experience and
 * levelling on top, so both modes always feel identical to play.
 */
export class AdventureEngine extends ArenaEngine {
  save: AdventureSave;
  stage: Stage;
  lootDrops: LootDrop[] = [];
  private mobBrains = new Map<string, MobBrain>();
  private acb: AdventureCallbacks;
  private mobSeq = 0;
  private lootSeq = 0;
  /** Survival stage only. */
  waveNumber = 0;
  private waveCooldown = 0;
  /** Boss Rush stage only. -1 = no boss spawned yet. */
  bossRushIndex = -1;
  /** Seconds elapsed on the current Boss Rush attempt. */
  bossRushTime = 0;
  bossRushCleared = false;
  private bossRushCooldown = 0;
  /** Crucible stage only — not private, so MobBrain can read it directly. */
  crucibleAffixes: CrucibleAffix[] = [];
  /** Daily Rift stage only — elapsed time on the current attempt and
   *  whether it's already been recorded, mirroring bossRushTime/Cleared. */
  dailyChallengeTime = 0;
  dailyChallengeCleared = false;
  private autoGrindBrain: CombatBrain | null = null;
  /** World Rifts — id of the currently-open Rift Warden, if any. */
  private riftMobId: string | null = null;
  private riftCooldown = RIFT_COOLDOWN_MIN + Math.random() * RIFT_COOLDOWN_RANGE;
  private riftTimer = 0;

  constructor(save: AdventureSave, cb: AdventureCallbacks) {
    super(save.classId as ClassId, "shedim", cb);
    this.mode = "adventure";
    this.acb = cb;
    this.save = save;
    this.stage = getStage(save.stage);
    this.map = this.stage.map;

    const p = this.fighters[0];
    p.spawnX = this.map.spawnA.x;
    p.spawnY = this.map.spawnA.y;
    p.x = p.spawnX;
    p.y = p.spawnY;

    // Drop the duel-rival fighter the base ArenaEngine constructor built —
    // this mode is player vs mobs, solo.
    this.fighters = [this.fighters[0]];

    this.applyProgression();
    this.player.hp = this.player.maxHp;
    this.spawnStageMobs();
    if (this.stage.crucible) this.rollCrucibleAffixes();
    if (this.stage.survival) this.startNextWave();
    if (this.stage.dailyChallenge) {
      this.spawnDailyChallengeMobs();
      this.rollDailyChallengeAffix();
    }
    if (this.save.autoGrind) this.autoGrindBrain = new CombatBrain();
    ensureDailyBounty(this.save);
    ensureWeeklyTrack(this.save);
    this.grantIdleBonus();
    const login = claimDailyLogin(this.save);
    if (login) {
      const streakNote = login.brokeStreak ? "" : ` (${login.streak}-day streak)`;
      this.acb.onLog(
        `Daily login bonus: +${login.gold}g, +${login.stones} stones${streakNote}.`,
        "good"
      );
    }
  }

  /** Capped, transparent "welcome back" bonus for time away between
   *  sessions — see IDLE_CAP_MS/IDLE_GOLD_PER_MINUTE above for why it's
   *  deliberately modest. */
  private grantIdleBonus() {
    const last = this.save.lastSeenAt;
    this.save.lastSeenAt = Date.now();
    if (!last) return;
    const elapsed = Math.min(Date.now() - last, IDLE_CAP_MS);
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return;
    const gold = Math.round(minutes * IDLE_GOLD_PER_MINUTE);
    if (gold <= 0) return;
    this.save.gold += gold;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    this.acb.onLog(`Welcome back! Away for ${timeStr} — +${gold}g waiting for you.`, "good");
  }

  /** Picks 2 distinct modifiers for a fresh Crucible attempt — called on
   *  entry and again every time a Crucible run wipes, so no two attempts
   *  play quite the same. */
  private rollCrucibleAffixes() {
    const pool = [...CRUCIBLE_AFFIX_POOL];
    const picked: CrucibleAffix[] = [];
    while (picked.length < 2 && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    this.crucibleAffixes = picked;
    const labels = picked.map((a) => CRUCIBLE_AFFIX_META[a].label).join(" + ");
    this.acb.onLog(`The Crucible warps: ${labels}.`, "big");
  }

  /** Called on every mob kill — a no-op unless it's the bounty's target
   *  type and today's goal was *just* crossed by this specific kill, in
   *  which case it's worth a log line so the player notices without having
   *  to keep the board open. Actually claiming still needs claimBounty(). */
  private progressBounty(mobTypeId: string | undefined) {
    ensureDailyBounty(this.save);
    const b = this.save.dailyBounty;
    if (!mobTypeId || !b || b.claimed || b.typeId !== mobTypeId) return;
    const total = this.save.mobKills?.[mobTypeId] ?? 0;
    if (total - b.baseline === b.goal) {
      this.acb.onLog("Bounty complete! Claim your reward from the board.", "big");
    }
  }

  /** Grants the reward and marks today's bounty claimed — a no-op if it
   *  isn't actually complete yet or was already claimed. */
  claimBounty() {
    ensureDailyBounty(this.save);
    const b = this.save.dailyBounty;
    if (!b || b.claimed || !bountyComplete(this.save)) return;
    const reward = bountyReward(this.save);
    this.save.gold += reward.gold;
    this.save.stones += reward.stones;
    b.claimed = true;
    this.acb.onLog(`Bounty claimed: +${reward.gold}g, +${reward.stones} stones.`, "good");
  }

  /** Re-applies level and stat bonuses to the player's live fighter. */
  applyProgression() {
    const cls = getClass(this.save.classId);
    const d = deriveArenaStats(
      cls,
      this.save.level,
      this.save.stats,
      this.save.equipped,
      this.save.ascension ?? 0,
      this.save.talents ?? []
    );
    const p = this.fighters[0];
    const prevMax = p.maxHp;
    p.maxHp = d.maxHp;
    p.maxMana = d.maxMana;
    p.attackPower = d.attackPower;
    p.speedMult = d.speedMult;
    p.attackSpeed = d.attackSpeed;
    p.lifesteal = d.lifesteal;
    p.negation = d.negation;
    p.regenHp = d.regenHp;
    p.regenMana = d.regenMana;
    p.cdr = d.cdr;
    p.level = this.save.level;
    p.name = cls.name;
    p.hp = Math.min(p.maxHp, p.hp + Math.max(0, d.maxHp - prevMax));
    p.mana = Math.min(p.mana, p.maxMana);
    p.auraOverride = this.save.auraColor;
    p.weaponSkinOverride = this.save.weaponSkin;
  }

  /** True when the player is close enough to the blacksmith to trade. */
  get nearBlacksmith(): boolean {
    if (!this.stage.isTown || this.stage.npcX === undefined) return false;
    return Math.abs(this.player.x - this.stage.npcX) < 90;
  }

  /** True when the player is close enough to the gear vendor to buy. */
  get nearVendor(): boolean {
    if (!this.stage.isTown || this.stage.vendorX === undefined) return false;
    return Math.abs(this.player.x - this.stage.vendorX) < 90;
  }

  /** True when the player is close enough to the bank keeper to store items. */
  get nearBank(): boolean {
    if (!this.stage.isTown || this.stage.bankX === undefined) return false;
    return Math.abs(this.player.x - this.stage.bankX) < 90;
  }

  get inTown(): boolean {
    return !!this.stage.isTown;
  }

  /**
   * Flips Auto-Grind on/off. While on, the player's own manual input is
   * ignored entirely and CombatBrain drives them instead — walk to the
   * nearest reachable mob, fight it with lmb and E/R/F, collect loot, sweep
   * the map when there's nothing to do. No jumping, no Q/Shift. See
   * CombatBrain.
   */
  toggleAutoGrind() {
    this.save.autoGrind = !this.save.autoGrind;
    this.autoGrindBrain = this.save.autoGrind ? new CombatBrain() : null;
    this.acb.onLog(this.save.autoGrind ? "Auto-Grind engaged." : "Auto-Grind stopped.", "info");
  }

  private spawnStageMobs() {
    if (this.stage.isTown) return;
    for (const spawn of this.stage.spawns) {
      const type = MOB_TYPES[spawn.typeId];
      if (type) this.spawnMob(type, spawn.x, spawn.y);
    }
  }

  /**
   * The Daily Rift has no fixed spawn list — its roster is generated here,
   * deterministically seeded by today's date (mulberry32/hashSeed, the same
   * PRNG mobs.ts already uses for stable-per-seed terrain) so every player
   * sees the exact same lineup all day and a fresh one tomorrow, no server
   * required. Resets the attempt timer/cleared flag too, so re-entering
   * (after a wipe, or just revisiting) always starts a clean run.
   */
  private spawnDailyChallengeMobs() {
    this.dailyChallengeTime = 0;
    this.dailyChallengeCleared = false;
    const rand = mulberry32(hashSeed(todayKey()));
    const margin = 200;
    const usable = this.map.width - margin * 2;
    const step = usable / (DAILY_CHALLENGE_MOB_COUNT + 1);
    for (let i = 0; i < DAILY_CHALLENGE_MOB_COUNT; i++) {
      const typeId = SURVIVAL_POOL[Math.floor(rand() * SURVIVAL_POOL.length)];
      const type = MOB_TYPES[typeId];
      if (type) this.spawnMob(type, Math.round(margin + step * (i + 1)));
    }
    const bossId = BOSS_RUSH_ORDER[Math.floor(rand() * BOSS_RUSH_ORDER.length)];
    const boss = MOB_TYPES[bossId];
    if (boss) this.spawnMob(boss, this.map.width - margin);
  }

  /** Picks a single Crucible-style modifier, seeded by today's date so it's
   *  the same all day — one instead of Crucible's two, for a gentler daily
   *  difficulty bump. Reuses `crucibleAffixes` itself (rather than a
   *  parallel field) so every existing affix-read site just works. */
  private rollDailyChallengeAffix() {
    const rand = mulberry32(hashSeed(todayKey() + "affix"));
    this.crucibleAffixes = [CRUCIBLE_AFFIX_POOL[Math.floor(rand() * CRUCIBLE_AFFIX_POOL.length)]];
    const label = CRUCIBLE_AFFIX_META[this.crucibleAffixes[0]].label;
    this.acb.onLog(`Today's Rift: ${label}.`, "big");
  }

  /**
   * Tracks elapsed time on the seeded roster from stage entry to a full
   * clear, recording it as today's best if it beats the existing one —
   * patterned on updateBossRush's clear-detection, but a single fixed wave
   * rather than a sequential gauntlet, so time just runs continuously
   * until clear rather than needing Boss Rush's "only while a mob is
   * alive" gating between spawns.
   */
  private updateDailyChallenge() {
    if (this.dailyChallengeCleared) return;
    this.dailyChallengeTime += DT;
    const anyAlive = this.fighters.some((f) => f.isMob && f.state !== "dead");
    if (anyAlive) return;
    this.dailyChallengeCleared = true;
    const cleared = this.dailyChallengeTime;
    const today = todayKey();
    const record = this.save.dailyChallengeRecord;
    const best = record && record.date === today ? record.bestTime : undefined;
    if (best === undefined || cleared < best) {
      this.save.dailyChallengeRecord = { date: today, bestTime: cleared };
      this.acb.onLog(`Daily Rift cleared in ${cleared.toFixed(1)}s — new best today!`, "big");
    } else {
      this.acb.onLog(`Daily Rift cleared in ${cleared.toFixed(1)}s.`, "big");
    }
  }

  /** Combat-log access for MobBrain — a boss phase transition is worth a
   *  line in the log, but `cb`/`acb` themselves stay private to the engine. */
  logMessage(text: string, tone: CombatLogEntry["tone"]) {
    this.acb.onLog(text, tone);
  }

  /** Not private: boss phase transitions (MobBrain, below) spawn adds mid-fight. */
  spawnMob(type: MobType, x: number, y?: number, opts?: { forceElite?: boolean; rift?: boolean }): Fighter {
    const base = this.fighters[0];
    const feetY = y ?? this.map.spawnA.y;
    // Bosses are already the special case; anything else has a flat shot at
    // rolling Elite — bigger, tougher, hits harder, and worth actually
    // hunting for the guaranteed better drop (see handleDeaths' rollDrops
    // call). No new spawn list to maintain: every mob type can roll one.
    // A Rift Warden always forces the roll (see spawnRift) rather than
    // gambling on it, since the whole point is a guaranteed bonus encounter.
    const crucible =
      this.stage.crucible || this.stage.dailyChallenge ? this.crucibleAffixes : [];
    const eliteChance = crucible.includes("volatile") ? ELITE_CHANCE * 3 : ELITE_CHANCE;
    const elite = !type.isBoss && (opts?.forceElite || Math.random() < eliteChance);
    const eliteAffix = elite
      ? ELITE_AFFIXES[Math.floor(Math.random() * ELITE_AFFIXES.length)]
      : undefined;
    const diff = DIFFICULTY_MULT[this.save.difficulty ?? "normal"];
    const reinforcedMult = crucible.includes("reinforced") ? 1.6 : 1;
    const colossal = eliteAffix === "colossal";
    const hpMult =
      (elite ? ELITE_HP_MULT : 1) *
      (colossal ? ELITE_COLOSSAL_HP_MULT / ELITE_HP_MULT : 1) *
      diff.hp *
      reinforcedMult;
    const dmgMult =
      (elite ? ELITE_DAMAGE_MULT : 1) *
      (colossal ? ELITE_COLOSSAL_DAMAGE_MULT / ELITE_DAMAGE_MULT : 1) *
      diff.damage;
    const sizeMult = colossal ? ELITE_COLOSSAL_SIZE_MULT : elite ? ELITE_SIZE_MULT : 1;
    const speedAffixMult =
      eliteAffix === "swift" ? ELITE_SWIFT_SPEED_MULT : colossal ? ELITE_COLOSSAL_SPEED_MULT : 1;
    const mob: Fighter = {
      ...base,
      id: `m${this.mobSeq++}`,
      name: opts?.rift
        ? `Rift Warden: ${type.name}`
        : elite
          ? `Elite ${type.name} (${ELITE_AFFIX_LABEL[eliteAffix!]})`
          : type.name,
      isPlayer: false,
      isMob: true,
      elite,
      eliteAffix,
      rift: !!opts?.rift,
      team: 1,
      mobTypeId: type.id,
      level: type.level,
      expValue: Math.round(type.expValue * (elite ? ELITE_EXP_MULT : 1)),
      x,
      y: feetY,
      spawnX: x,
      spawnY: feetY,
      vx: 0,
      vy: 0,
      w: Math.round(type.w * sizeMult),
      h: Math.round(type.h * sizeMult),
      hp: Math.round(type.maxHp * hpMult),
      maxHp: Math.round(type.maxHp * hpMult),
      mana: 0,
      maxMana: 1,
      attackPower: Math.round(type.damage * dmgMult),
      attackRange: type.range,
      speedMult: (type.speed / WALK_SPEED) * speedAffixMult,
      attackSpeed: 1,
      // Mobs never equip gear — without this they'd inherit whatever
      // legendary affixes the player currently has on. Vampiric is the one
      // exception: it reuses this exact field, the same lifesteal-on-hit
      // math dealDamage already runs for players and legendary gear.
      lifesteal: eliteAffix === "vampiric" ? ELITE_VAMPIRIC_LIFESTEAL : 0,
      negation: 0,
      regenHp: eliteAffix === "regenerating" ? Math.round(type.level * ELITE_REGEN_PER_LEVEL) : 0,
      regenMana: 0,
      cdr: 0,
      state: "idle",
      stateTime: 0,
      action: null,
      deadTimer: 0,
      cooldowns: {},
      facing: -1,
    };
    this.fighters.push(mob);
    this.mobBrains.set(mob.id, new MobBrain(type));
    return mob;
  }

  /** Drives P1 from input (or, with Auto-Grind on, from its own brain
   *  instead) and every mob from its own brain. Mob brains only ever
   *  target this.player. */
  stepAdventure(playerIntent: Intent) {
    if (this.over) return;

    const effectivePlayerIntent =
      this.save.autoGrind && this.autoGrindBrain
        ? this.autoGrindBrain.think(this)
        : playerIntent;

    for (const mob of this.fighters) {
      if (!mob.isMob) continue;
      const brain = this.mobBrains.get(mob.id);
      // think() mutates brain.cache in place and returns the same reference.
      if (brain) brain.think(mob, this.player, this);
    }

    this.stepAll(effectivePlayerIntent, (f) => this.mobBrains.get(f.id)?.cache ?? emptyIntent());

    this.handleDeaths();
    this.updateLootDrops();
    if (this.stage.survival) this.updateSurvival();
    if (this.stage.bossRush) this.updateBossRush();
    if (this.stage.dailyChallenge) this.updateDailyChallenge();
    this.updateRifts();
  }

  /** Spawns the next boss in BOSS_RUSH_ORDER once the arena is clear, healing
   *  the party first (except before the very first boss, which the player
   *  already entered the stage at full health for). Records the fastest
   *  full clear once the last boss falls. */
  private updateBossRush() {
    if (this.bossRushCleared) return;
    const anyAlive = this.fighters.some((f) => f.isMob && f.state !== "dead");
    if (anyAlive) {
      this.bossRushTime += DT;
      return;
    }
    this.bossRushCooldown -= DT;
    if (this.bossRushCooldown > 0) return;

    const nextIndex = this.bossRushIndex + 1;
    if (nextIndex >= BOSS_RUSH_ORDER.length) {
      this.bossRushCleared = true;
      const cleared = this.bossRushTime;
      const best = this.save.bestBossRushTime;
      if (best === undefined || cleared < best) {
        this.save.bestBossRushTime = cleared;
        this.acb.onLog(`Boss Rush cleared in ${cleared.toFixed(1)}s — new best!`, "big");
      } else {
        this.acb.onLog(`Boss Rush cleared in ${cleared.toFixed(1)}s.`, "big");
      }
      this.grantBossRushUnique();
      return;
    }

    this.bossRushIndex = nextIndex;
    if (nextIndex > 0) {
      this.player.hp = this.player.maxHp;
      this.player.mana = this.player.maxMana;
    }
    const type = MOB_TYPES[BOSS_RUSH_ORDER[nextIndex]];
    if (type) {
      this.acb.onLog(`${type.name} enters the arena!`, "big");
      this.pushFloating(this.player.x, this.player.y - this.player.h - 40, type.name, "#f87171", 20);
      this.spawnMob(type, this.map.width / 2);
    }
    this.bossRushCooldown = 2.5;
  }

  /**
   * A full Boss Rush clear guarantees one still-missing unique from the
   * gauntlet's own bosses — an alternative to rollDrops' 10%-per-kill RNG
   * path (see UNIQUE_DROP_CHANCE in items.ts) for players who've been
   * unlucky. Picks the first still-missing one in gauntlet order, so
   * repeat clears systematically fill the collection rather than risking a
   * duplicate. The Hollow isn't part of BOSS_RUSH_ORDER, so its own unique
   * stays RNG-only — an accepted 7-of-8 gap rather than lengthening the
   * gauntlet to fix it.
   */
  private grantBossRushUnique() {
    const found = new Set(this.save.uniquesFound ?? []);
    for (const bossId of BOSS_RUSH_ORDER) {
      const uniqueBase = Object.values(ITEM_BASES).find((b) => b.unique && b.dropFrom === bossId);
      if (uniqueBase && !found.has(uniqueBase.id)) {
        const item = makeItem(uniqueBase.id, "legendary");
        this.spawnLootDrop(item, this.player.x, this.player.y);
        this.acb.onLog(`The Boss Rush yields ${itemName(item)}!`, "big");
        return;
      }
    }
  }

  /** Once every mob from the current wave is gone, a short beat later the
   *  next one spawns — bigger, and drawing from a wider mob pool. */
  private updateSurvival() {
    const anyAlive = this.fighters.some((f) => f.isMob && f.state !== "dead");
    if (anyAlive) return;
    this.waveCooldown -= DT;
    if (this.waveCooldown > 0) return;
    this.startNextWave();
  }

  private startNextWave() {
    this.waveNumber += 1;
    this.waveCooldown = 3;
    this.acb.onLog(`Wave ${this.waveNumber} incoming!`, "big");
    this.pushFloating(this.player.x, this.player.y - this.player.h - 40, `WAVE ${this.waveNumber}`, "#fbbf24", 20);

    const poolSize = Math.min(SURVIVAL_POOL.length, 2 + Math.floor(this.waveNumber / 2));
    const swarming = this.stage.crucible && this.crucibleAffixes.includes("swarming");
    const count = Math.min(10, 3 + Math.floor(this.waveNumber / 2)) + (swarming ? 2 : 0);
    for (let i = 0; i < count; i++) {
      const typeId = SURVIVAL_POOL[Math.floor(Math.random() * poolSize)];
      const type = MOB_TYPES[typeId];
      if (!type) continue;
      const x = 200 + Math.random() * (this.map.width - 400);
      this.spawnMob(type, x);
    }
  }

  /** Ticks the current Rift (claim window, or the cooldown to the next one)
   *  — only in regular combat stages, since Survival/Boss Rush/Crucible/town
   *  already have their own spawn rhythm a surprise extra mob would clash with. */
  private updateRifts() {
    if (this.stage.isTown || this.stage.survival || this.stage.bossRush) return;
    if (this.riftMobId) {
      const mob = this.fighters.find((f) => f.id === this.riftMobId);
      if (!mob) {
        // Killed and already cleaned up (or otherwise gone) — free to roll
        // the next one.
        this.riftMobId = null;
        this.riftCooldown = RIFT_COOLDOWN_MIN + Math.random() * RIFT_COOLDOWN_RANGE;
        return;
      }
      if (mob.state === "dead") return; // still playing its death beat
      this.riftTimer -= DT;
      if (this.riftTimer <= 0) {
        this.acb.onLog("The Rift closes, unclaimed.", "info");
        this.mobBrains.delete(mob.id);
        this.fighters = this.fighters.filter((f) => f.id !== mob.id);
        this.riftMobId = null;
        this.riftCooldown = RIFT_COOLDOWN_MIN + Math.random() * RIFT_COOLDOWN_RANGE;
      }
      return;
    }
    this.riftCooldown -= DT;
    if (this.riftCooldown > 0) return;
    this.spawnRift();
  }

  private spawnRift() {
    const typeIds = Array.from(new Set(this.stage.spawns.map((s) => s.typeId))).filter(
      (id) => !MOB_TYPES[id]?.isBoss
    );
    if (!typeIds.length) {
      this.riftCooldown = RIFT_COOLDOWN_MIN + Math.random() * RIFT_COOLDOWN_RANGE;
      return;
    }
    const typeId = typeIds[Math.floor(Math.random() * typeIds.length)];
    const type = MOB_TYPES[typeId];
    if (!type) return;
    const x = 200 + Math.random() * (this.map.width - 400);
    const mob = this.spawnMob(type, x, undefined, { forceElite: true, rift: true });
    this.riftMobId = mob.id;
    this.riftTimer = RIFT_CLAIM_WINDOW;
    this.acb.onLog("A Rift has torn open nearby!", "big");
    this.pushFloating(mob.x, mob.y - mob.h - 40, "RIFT!", "#fde047", 20);
    this.burstAt(mob.x, mob.y - mob.h * 0.5, "#fde047", 28);
  }

  /** Spawns one item, popped up and out from a kill spot to fall to the floor. */
  private spawnLootDrop(item: Item, x: number, y: number) {
    this.lootDrops.push({
      id: `l${this.lootSeq++}`,
      x: x + (Math.random() - 0.5) * 30,
      y: y - 10,
      vx: (Math.random() - 0.5) * 3,
      vy: -6 - Math.random() * 3,
      onGround: false,
      // The mob's own feet position IS the exact surface it died standing
      // on — ground or a platform, whichever it was — so the drop always
      // settles back onto that same terrain instead of whatever else
      // happens to overlap its x (e.g. a platform floating above it).
      floorY: y,
      item,
      age: 0,
    });
    if (this.lootDrops.length > MAX_LOOT_DROPS) {
      this.lootDrops.splice(0, this.lootDrops.length - MAX_LOOT_DROPS);
    }
  }

  /** Physics for dropped loot (gravity + settle), plus the walk-over pickup. */
  private updateLootDrops() {
    if (!this.lootDrops.length) return;
    const player = this.player;
    // Reverse-iterate and splice in place — same pattern as
    // hitboxes/projectiles/particles below, rather than rebuilding the whole
    // array every tick for the drop's entire 90s lifetime.
    for (let i = this.lootDrops.length - 1; i >= 0; i--) {
      const drop = this.lootDrops[i];
      drop.age += DT;
      // Plenty of time to walk back for anything you want, but a long
      // session of farming without ever backtracking for junk shouldn't
      // leave an ever-growing pile of drops to simulate and draw forever.
      if (drop.age > LOOT_DESPAWN_TIME) {
        this.lootDrops.splice(i, 1);
        continue;
      }
      if (!drop.onGround) {
        drop.vy = Math.min(MAX_FALL_SPEED, drop.vy + GRAVITY);
        drop.x += drop.vx;
        drop.y += drop.vy;
        if (drop.vy >= 0 && drop.y >= drop.floorY) {
          drop.y = drop.floorY;
          drop.vx = 0;
          drop.vy = 0;
          drop.onGround = true;
        }
      }

      const near =
        Math.abs(player.x - drop.x) < PICKUP_RADIUS_X &&
        Math.abs(player.y - drop.y) < PICKUP_RADIUS_Y;
      if (near && player.state !== "dead") {
        this.save.inventory.push(drop.item);
        this.pushFloating(drop.x, drop.y - 30, itemName(drop.item), "#fcd34d", 14);
        this.acb.onLoot([drop.item]);
        if (base(drop.item.baseId).unique) {
          this.save.uniquesFound = this.save.uniquesFound ?? [];
          if (!this.save.uniquesFound.includes(drop.item.baseId)) {
            this.save.uniquesFound.push(drop.item.baseId);
          }
        }
        this.lootDrops.splice(i, 1); // picked up — don't keep it
      }
    }
  }

  private handleDeaths() {
    const toRemove: Fighter[] = [];
    for (const f of this.fighters) {
      if (f.isMob) {
        if (f.hp <= 0 && f.state !== "dead") {
          f.state = "dead";
          f.deadTimer =
            this.stage.survival || this.stage.bossRush || f.rift ? SURVIVAL_MOB_CLEANUP : MOB_RESPAWN;
          this.save.kills += 1;
          if (f.mobTypeId) {
            this.save.mobKills = this.save.mobKills ?? {};
            this.save.mobKills[f.mobTypeId] = (this.save.mobKills[f.mobTypeId] ?? 0) + 1;
          }
          this.progressBounty(f.mobTypeId);

          const gained = expWithLevelPenalty(
            this.save.level,
            f.level,
            f.expValue
          );
          const before = this.save.level;
          const result = grantExp(this.save, gained);
          this.spawnKillFx(f, gained);
          this.acb.onExp(gained, f.name, result);

          // Volatile Elites go out with a bang: flat, unmitigated damage to
          // anyone standing close (same "ignores armor" precedent as
          // environmental hazards use), rather than a normal mitigated hit.
          if (f.eliteAffix === "volatile") {
            for (const ally of this.fighters) {
              if (ally.isMob || ally.state === "dead") continue;
              if (Math.abs(ally.x - f.x) > ELITE_VOLATILE_RADIUS) continue;
              const dmg = Math.round(f.level * 3 + 15);
              ally.hp = Math.max(0, ally.hp - dmg);
              this.pushFloating(ally.x, ally.y - ally.h - 10, `${dmg}`, "#f97316", 16);
            }
            this.burstAt(f.x, f.y - f.h * 0.5, "#f97316", 26);
            this.shake = Math.max(this.shake, 10);
          }

          // Drops pop out onto the floor — walk over them to pick them up.
          // Elites roll the same generous boss drop table (worse odds don't
          // matter if the reward for spotting one is the same as a trash mob).
          const type = MOB_TYPES[f.mobTypeId!];
          const bountiful = this.stage.crucible && this.crucibleAffixes.includes("bountiful");
          const lootBonus =
            DIFFICULTY_MULT[this.save.difficulty ?? "normal"].loot +
            (bountiful ? 0.5 : 0) +
            (f.rift ? RIFT_LOOT_BONUS : 0);
          // A Rift Warden always rolls the boss-tier gear odds (the guaranteed
          // 4 rolls at 75% gear chance instead of 1 roll at 18%), on top of
          // the extra rarity bonus above — the whole point is a windfall.
          const drops = rollDrops(f.level, !!type?.isBoss || !!f.elite || !!f.rift, f.mobTypeId, lootBonus);
          for (const item of drops.items) this.spawnLootDrop(item, f.x, f.y);
          if (drops.nearMiss) {
            this.pushFloating(
              f.x,
              f.y - f.h - 20,
              `SO CLOSE! (almost ${drops.nearMiss})`,
              RARITY_META[drops.nearMiss].color,
              14
            );
          }

          if (result.levelsGained > 0) {
            this.applyProgression();
            this.player.hp = this.player.maxHp;
            this.acb.onLog(
              `Level ${before} → ${result.newLevel}! +${result.statPointsGained} stat points.`,
              "big"
            );
          }
        } else if (f.state === "dead") {
          f.deadTimer -= DT;
          if (f.deadTimer <= 0) {
            // Survival mobs are gone for good once their wave clears — a
            // fresh, bigger batch spawns instead of the same handful cycling
            // back in, which is what every other stage's mob roster does.
            // A Rift Warden never revives either — it's a one-shot bonus
            // encounter, not a permanent addition to the stage's roster.
            if (this.stage.survival || this.stage.bossRush || f.rift) toRemove.push(f);
            else this.reviveMob(f);
          }
        }
        continue;
      }

      // The player never truly dies here; they respawn at the stage entrance.
      if (f.hp <= 0 && f.state !== "dead") {
        f.state = "dead";
        f.deadTimer = PLAYER_RESPAWN;
        this.save.deaths += 1;
        this.acb.onLog("You were defeated. Recovering…", "bad");
        this.acb.onPlayerDeath();
        if (this.stage.survival) {
          const reached = this.waveNumber;
          if (this.stage.crucible) {
            if (reached > (this.save.bestCrucibleWave ?? 0)) {
              this.save.bestCrucibleWave = reached;
              this.acb.onLog(`New Crucible best: wave ${reached}!`, "big");
            }
          } else if (reached > (this.save.bestSurvivalWave ?? 0)) {
            this.save.bestSurvivalWave = reached;
            this.acb.onLog(`New best: wave ${reached}!`, "big");
          }
          this.waveNumber = 0;
          this.waveCooldown = 1.5;
          // A fresh attempt gets fresh modifiers, so no two Crucible runs
          // play quite the same.
          if (this.stage.crucible) this.rollCrucibleAffixes();
          for (const mob of this.fighters) {
            if (mob.isMob) toRemove.push(mob);
          }
        }
        // A Boss Rush death resets the run back to the first boss, same as a
        // Survival wipe resets the wave count — no partial credit for a run
        // that didn't finish.
        if (this.stage.bossRush) {
          this.bossRushIndex = -1;
          this.bossRushTime = 0;
          this.bossRushCleared = false;
          this.bossRushCooldown = 1.5;
          for (const mob of this.fighters) {
            if (mob.isMob) toRemove.push(mob);
          }
        }
      } else if (f.state === "dead") {
        f.deadTimer -= DT;
        if (f.deadTimer <= 0) this.revivePlayer(f);
      }
    }
    if (toRemove.length) {
      const removeIds = new Set(toRemove.map((f) => f.id));
      for (const f of toRemove) this.mobBrains.delete(f.id);
      this.fighters = this.fighters.filter((f) => !removeIds.has(f.id));
    }
  }

  private reviveMob(f: Fighter) {
    const type = MOB_TYPES[f.mobTypeId!];
    f.state = "idle";
    f.hp = type.maxHp;
    f.x = f.spawnX;
    f.y = f.spawnY;
    f.vx = 0;
    f.vy = 0;
    f.action = null;
    f.knockdownTimer = 0;
    f.hitstun = 0;
    f.stunTimer = 0;
  }

  private revivePlayer(f: Fighter) {
    f.state = "idle";
    f.hp = f.maxHp;
    f.mana = 0;
    f.x = this.map.spawnA.x;
    f.y = this.map.spawnA.y;
    f.vx = 0;
    f.vy = 0;
    f.action = null;
    f.knockdownTimer = 0;
    f.hitstun = 0;
    f.stunTimer = 0;
    f.respawnInvuln = 1.5;
    this.acb.onLog("You rise again at the entrance.", "info");
  }

  private spawnKillFx(f: Fighter, exp: number) {
    this.pushFloating(f.x, f.y - f.h - 8, `+${exp} EXP`, "#a5f3fc", 16);
    this.burstAt(f.x, f.y - f.h * 0.5, MOB_TYPES[f.mobTypeId!].accent, 22);
    this.shake = Math.max(this.shake, 6);
  }

  changeStage(index: number) {
    const stage = getStage(index);
    if (this.save.level < stage.requiredLevel) {
      this.acb.onLog(
        `${stage.name} requires level ${stage.requiredLevel}.`,
        "bad"
      );
      return false;
    }
    // Auto-Grind has nothing to fight in town — turn it off on arrival.
    if (stage.isTown && this.save.autoGrind) {
      this.save.autoGrind = false;
      this.autoGrindBrain = null;
      this.acb.onLog("Auto-Grind stopped — back in town.", "info");
    }

    this.save.stage = index;
    this.stage = stage;
    this.map = stage.map;

    // Only mobs are stage-local — the player travels between stages.
    this.fighters = this.fighters.filter((f) => !f.isMob);
    this.mobBrains.clear();
    this.hitboxes = [];
    this.projectiles = [];
    this.blackHoles = [];
    this.lootDrops = [];

    const p = this.fighters[0];
    p.x = this.map.spawnA.x;
    p.y = this.map.spawnA.y;
    p.vx = 0;
    p.vy = 0;
    p.state = "idle";
    this.spawnStageMobs();
    // Wave/boss-rush/rift state is per-visit: travelling here fresh should
    // always restart clean, same as dying mid-run does, not resume wherever
    // a previous visit left off (spawns are otherwise empty for the two wave
    // stage types, so without this nothing would ever spawn at all).
    this.waveNumber = 0;
    this.waveCooldown = 0;
    this.bossRushIndex = -1;
    this.bossRushTime = 0;
    this.bossRushCleared = false;
    this.bossRushCooldown = 0;
    this.riftMobId = null;
    this.riftCooldown = RIFT_COOLDOWN_MIN + Math.random() * RIFT_COOLDOWN_RANGE;
    if (this.stage.crucible) this.rollCrucibleAffixes();
    if (this.stage.survival) this.startNextWave();
    if (this.stage.dailyChallenge) {
      this.spawnDailyChallengeMobs();
      this.rollDailyChallengeAffix();
    }
    this.acb.onLog(`Entered ${stage.name}.`, "good");
    return true;
  }

  get expNext() {
    return expToNext(this.save.level);
  }
}

/** Ground-bound mob behaviour: patrol, chase, swing, never walk off a ledge. */
/**
 * One-time HP-threshold phase transitions for three bosses, each leaning on
 * a different existing system rather than a new one: Warden gets a stat/pace
 * boost (mutating the fighter fields spawnMob already sets per-instance),
 * Frostking calls in reinforcements (the same spawnMob the stage's initial
 * mob list uses), and the Sundered King leans on the frontGuard/stoic fields
 * every fighter already carries for a "won't go down easy" final stand.
 */
const BOSS_PHASE2: Partial<
  Record<string, { hpFrac: number; announce: string }>
> = {
  warden: { hpFrac: 0.5, announce: "The Warden flies into a rage!" },
  sovereign: { hpFrac: 0.5, announce: "The Sovereign cloaks itself in abyssal power!" },
  frostking: { hpFrac: 0.5, announce: "The Frostking calls the cold to arms!" },
  forgeheart: { hpFrac: 0.4, announce: "The Forgeheart cracks the earth into flame!" },
  tempestwarden: { hpFrac: 0.5, announce: "The Tempest Warden calls down the storm!" },
  rotmother: { hpFrac: 0.4, announce: "The Rotmother's decay spreads across the field!" },
  sunderedking: { hpFrac: 0.25, announce: "The Sundered King refuses to fall!" },
  treant: { hpFrac: 0.5, announce: "The Elder Treant's roots surge with fury!" },
  dreadknight: { hpFrac: 0.5, announce: "The Dread Knight's blade ignites with abyssal fire!" },
};

class MobBrain {
  cache: Intent = emptyIntent();
  private type: MobType;
  private patrolDir: 1 | -1 = 1;
  private attackCd = 0;
  private repathCd = 0;
  // Bosses only: delay the first slam so a fight always opens with a few
  // normal swings before the telegraphed one shows up.
  private specialCd = 4 + Math.random() * 3;
  /** Alternates which of the boss's two telegraphed moves fires next. */
  private specialToggle = false;
  private enraged = false;
  private phase2Done = false;
  private berserkDone = false;

  constructor(type: MobType) {
    this.type = type;
  }

  /** Berserk Elites: a one-time, permanent-for-the-fight power spike once
   *  they drop below half health — the same "one-time HP-threshold buff"
   *  shape as a boss's phase2, just available to any mob that rolled the
   *  affix rather than the seven hand-picked bosses. */
  private checkBerserk(self: Fighter) {
    if (this.berserkDone || self.eliteAffix !== "berserk") return;
    if (self.hp / self.maxHp > ELITE_BERSERK_HP_FRAC) return;
    this.berserkDone = true;
    self.attackPower = Math.round(self.attackPower * ELITE_BERSERK_ATK_MULT);
    self.speedMult *= ELITE_BERSERK_SPEED_MULT;
  }

  private checkPhase2(self: Fighter, engine: AdventureEngine) {
    if (this.phase2Done || !this.type.isBoss) return;
    const phase = BOSS_PHASE2[this.type.id];
    if (!phase || self.hp / self.maxHp > phase.hpFrac) return;
    this.phase2Done = true;

    engine.pushFloating(self.x, self.y - self.h - 30, "ENRAGED", "#ff3b30", 20);
    engine.burstAt(self.x, self.y - self.h * 0.5, "#ff3b30", 30);
    engine.logMessage(phase.announce, "big");

    if (this.type.id === "warden") {
      this.enraged = true;
      self.attackPower = Math.round(self.attackPower * 1.25);
      self.speedMult *= 1.2;
    } else if (this.type.id === "frostking") {
      const frostfang = MOB_TYPES.frostfang;
      if (frostfang) {
        engine.spawnMob(frostfang, self.x - 90, self.y);
        engine.spawnMob(frostfang, self.x + 90, self.y);
      }
    } else if (this.type.id === "sunderedking") {
      // Hyper-armour for the rest of the fight (stunlock/knockdown just
      // don't interrupt it anymore) plus a real damage bump — the last
      // stretch of the last fight in the game is meant to hurt.
      self.stoicTimer = 9999;
      self.attackPower = Math.round(self.attackPower * 1.3);
    } else if (this.type.id === "sovereign") {
      // Shields itself in the same negation/lifesteal fields legendary gear
      // and Vampiric Elites already use — no new damage-mitigation system,
      // just a boss actually using the one that exists.
      self.negation = Math.max(self.negation, 0.35);
      self.lifesteal = Math.max(self.lifesteal, 0.25);
    } else if (this.type.id === "forgeheart" || this.type.id === "rotmother") {
      // Cracks the ground open around itself — reuses the same standing
      // damage-patch hazards the Forge/Blight stages already scatter
      // statically, just placed live at the boss's position instead of
      // fixed in the map data.
      const groundY = engine.map.ground[0]?.y ?? self.y;
      const kind = this.type.id === "forgeheart" ? "lava" : "poison";
      const dps = this.type.id === "forgeheart" ? 22 : 16;
      engine.map.hazards.push(
        { x: self.x - 150, w: 90, y: groundY, dps, kind },
        { x: self.x + 60, w: 90, y: groundY, dps, kind }
      );
    } else if (this.type.id === "tempestwarden") {
      // Calls down the storm: noticeably faster and hits harder for the
      // rest of the fight, the same "enrage" shape as the Warden's phase2
      // but without the pace changes (its kit is already fast).
      self.speedMult *= 1.25;
      self.attackSpeed *= 1.2;
      self.attackPower = Math.round(self.attackPower * 1.15);
    } else if (this.type.id === "treant") {
      self.attackPower = Math.round(self.attackPower * 1.2);
      self.speedMult *= 1.15;
    } else if (this.type.id === "dreadknight") {
      self.attackPower = Math.round(self.attackPower * 1.25);
      self.speedMult *= 1.15;
    }
  }

  think(self: Fighter, player: Fighter, engine: AdventureEngine): Intent {
    // Reuse this brain's own scratch Intent instead of allocating a new
    // object every tick for every mob.
    const i = emptyIntent(this.cache);
    if (self.state === "dead" || player.state === "dead") return i;
    if (
      self.knockdownTimer > 0 ||
      self.stunTimer > 0 ||
      self.hitstun > 0 ||
      self.action
    ) {
      return i;
    }

    this.checkPhase2(self, engine);
    this.checkBerserk(self);

    // Shielded mobs block anything landing on their facing side outright —
    // refreshed every tick they have control, so it drops the instant a
    // knockdown or stun actually interrupts them (see the early return just
    // above), giving a real opening rather than an unbreakable wall. The
    // Shielded Elite affix grants any mob type the exact same behaviour.
    if (this.type.shielded || self.eliteAffix === "shielded") {
      self.frontGuard = Math.max(self.frontGuard, 0.2);
    }

    this.attackCd -= DT;
    this.repathCd -= DT;
    if (this.type.isBoss) this.specialCd -= DT;

    const dx = player.x - self.x;
    const dist = Math.abs(dx);
    const sameHeight = Math.abs(self.y - player.y) < 90;
    const dir: 1 | -1 = dx > 0 ? 1 : -1;

    if (dist < this.type.aggro && sameHeight && player.hp > 0) {
      const specialRange = this.type.range * 1.6;
      if (this.type.isBoss && this.specialCd <= 0 && dist <= specialRange) {
        if (this.specialToggle) i.special2 = true;
        else i.special = true;
        this.specialToggle = !this.specialToggle;
        // Long telegraph, so the cooldown is long too — this is meant to be
        // a rare "watch out" moment, not a constant threat.
        this.specialCd = 9 + Math.random() * 5;
      } else if (this.type.ranged) {
        // Kite instead of closing to melee: back off if the player gets too
        // close, close the gap if they're out of range, and only fire from
        // the sweet spot in between. `range` here means "preferred firing
        // distance," not "melee reach."
        if (dist < this.type.range * 0.6) {
          i.moveX = -dir;
        } else if (dist > this.type.range * 1.15) {
          i.moveX = dir;
        } else if (this.attackCd <= 0) {
          i.lmb = true;
          let pace = self.eliteAffix === "swift" ? 0.65 : 1;
          if (engine.stage.crucible && engine.crucibleAffixes.includes("frenzied")) pace *= 0.75;
          this.attackCd = (this.type.windup + this.type.recover) * pace + 0.6;
        }
      } else if (dist > this.type.range * 0.8) {
        i.moveX = dir;
      } else if (this.attackCd <= 0) {
        i.lmb = true;
        // Enraged Warden (and any Swift Elite, or a Crucible run rolling
        // Frenzied) swings noticeably faster, not just harder — the rest of
        // the recovery-padding formula is untouched.
        let pace = this.enraged || self.eliteAffix === "swift" ? 0.6 : 1;
        if (engine.stage.crucible && engine.crucibleAffixes.includes("frenzied")) pace *= 0.75;
        this.attackCd = (this.type.windup + this.type.recover) * pace + 0.25;
      }
      self.facing = dir;
    } else {
      // Patrol back and forth around the spawn point.
      if (this.repathCd <= 0) {
        if (Math.abs(self.x - self.spawnX) > 170) {
          this.patrolDir = self.x > self.spawnX ? -1 : 1;
          this.repathCd = 1.2;
        }
      }
      i.moveX = this.patrolDir * 0.55;
    }

    // Never walk off the edge of whatever they're standing on. The floor
    // itself now spans the whole map, but a mob parked on an elevated
    // platform still has a real ledge to fall off — and mobs never jump, so
    // once they're down they're not coming back up.
    if (i.moveX !== 0 && self.onGround) {
      const ahead = self.x + Math.sign(i.moveX) * 55;
      const platform = engine.map.platforms.find(
        (p) => self.y <= p.y + 2 && self.y >= p.y - 2 && self.x >= p.x - 4 && self.x <= p.x + p.w + 4
      );
      const supported = platform
        ? ahead >= platform.x && ahead <= platform.x + platform.w
        : engine.groundAtX(ahead) !== null;
      if (!supported) {
        i.moveX = 0;
        this.patrolDir = (-this.patrolDir) as 1 | -1;
      }
    }
    return i;
  }
}

/**
 * Auto-Grind's brain: walks to the nearest *reachable* mob (same height,
 * within ~90 units — the same "sameHeight" threshold MobBrain itself uses,
 * since this brain doesn't jump either and has no business swinging at
 * something one platform up) and fights it; with nothing reachable, walks
 * to the nearest reachable loot drop instead; with neither, sweeps left
 * and right across the whole map rather than standing still, turning
 * around at the edges, so it actually covers the stage instead of waiting
 * for something to wander into a fixed radius.
 *
 * In range, it presses E/R/F (whichever class you're on) alongside lmb
 * every tick rather than tracking its own cooldown timer — trySkill()
 * already rejects anything still on cooldown or short on mana, and a
 * fighter mid-cast just ignores new input until it resolves (see the
 * f.action check at the top of updateFighter), so "always ask for
 * everything" naturally reduces to "use whatever's actually ready" without
 * this brain needing to duplicate any of that bookkeeping itself. No Q or
 * Shift, deliberately: those are a timed counter-stance and a movement
 * dash, not "more damage on cooldown," and blindly mashing them wouldn't
 * actually help.
 */
class CombatBrain {
  private patrolDir: 1 | -1 = 1;
  private cache: Intent = emptyIntent();

  think(engine: AdventureEngine): Intent {
    // Reuse the same scratch Intent every tick instead of allocating a new
    // object — there's only ever one CombatBrain active at a time.
    const i = emptyIntent(this.cache);
    const self = engine.player;
    if (
      self.state === "dead" ||
      self.knockdownTimer > 0 ||
      self.stunTimer > 0 ||
      self.hitstun > 0 ||
      self.action
    ) {
      return i;
    }
    const cls = getClass(self.classId);
    let target: Fighter | null = null;
    let bestD = Infinity;
    for (const f of engine.fighters) {
      if (!f.isMob || f.state === "dead") continue;
      if (Math.abs(f.y - self.y) > 90) continue; // different platform — not reachable, don't swing at it
      const d = Math.abs(f.x - self.x);
      if (d < bestD) {
        bestD = d;
        target = f;
      }
    }

    if (target) {
      const dx = target.x - self.x;
      const dist = Math.abs(dx);
      const dir: 1 | -1 = dx >= 0 ? 1 : -1;
      if (dist <= cls.attackRange * 0.85) {
        self.facing = dir;
        i.lmb = true;
        // Only request skills that are actually ready — requesting one on
        // cooldown or without enough mana just makes trySkill log a
        // "not enough mana" spam every tick for no benefit.
        for (const slot of ["e", "r", "f"] as const) {
          const skill = skillOf(cls, slot.toUpperCase());
          if (!skill) continue;
          const ready =
            (self.cooldowns[skill.id] ?? 0) <= 0 &&
            (!skill.manaCost || self.mana >= skill.manaCost);
          if (ready) i[slot] = true;
        }
      } else {
        self.facing = dir;
        i.moveX = dir;
      }
      return i;
    }

    // Nothing reachable to fight — go collect the nearest reachable loot
    // instead of idling on top of it and hoping.
    let lootX: number | null = null;
    let bestLootD = Infinity;
    for (const drop of engine.lootDrops) {
      if (Math.abs(drop.y - self.y) > 90) continue;
      const d = Math.abs(drop.x - self.x);
      if (d < bestLootD) {
        bestLootD = d;
        lootX = drop.x;
      }
    }
    if (lootX !== null && Math.abs(lootX - self.x) > 20) {
      const dir: 1 | -1 = lootX >= self.x ? 1 : -1;
      self.facing = dir;
      i.moveX = dir;
      return i;
    }

    // Truly nothing to do nearby — sweep the map instead of standing
    // still, turning around at the edges, so it actually covers the whole
    // stage over time rather than camping one spot.
    if (self.onGround) {
      const margin = 80;
      if (self.x <= margin) this.patrolDir = 1;
      else if (self.x >= engine.map.width - margin) this.patrolDir = -1;
    }
    self.facing = this.patrolDir;
    i.moveX = this.patrolDir;
    return i;
  }
}
