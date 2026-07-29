/**
 * Every duration here is in SECONDS and is taken verbatim from the game
 * design spec. The simulation runs on a fixed 1/60s timestep and compares
 * against these values directly, so the numbers stay exact rather than being
 * rounded into whole frames.
 */

export const DT = 1 / 60;

// --- knockdown ------------------------------------------------------------
/** A knocked-down fighter is immune to damage and CC for this long. */
export const KNOCKDOWN_DURATION = 2.5;
/**
 * Mobs get a much shorter knockdown. Player characters keep the specified 2.5s,
 * but giving every trash mob 2.5s of immunity every third jab made the campaign
 * crawl — a basic chain would spend most of its time hitting an immune target.
 */
export const MOB_KNOCKDOWN_DURATION = 0.7;
/** Grace window of full immunity immediately after standing up. */
export const GETUP_IMMUNITY = 0.1;

// --- crowd control --------------------------------------------------------
/**
 * Taking a hit stuns you for this long. You cannot move or act at all — no
 * attacks, no skills — the sole exception being Manastop.
 */
export const HITSTUN_SINGLE = 0.2;
/**
 * Getting hit again *before* the first stun expires escalates into a stunlock.
 * This is the whole point of a combo: keep connecting inside the window and the
 * target never gets a turn.
 */
export const STUNLOCK_DURATION = 0.25;
/**
 * A hit landing within this long of the previous one escalates into a
 * stunlock. It is slightly longer than the 0.200s stun on purpose: basic
 * attacks are cast on a 0.220–0.260s cadence, so a strict "still stunned"
 * test would miss by ~20ms and no basic string could ever lock. This window
 * is what makes chaining attacks actually hold the target.
 */
export const STUNLOCK_WINDOW = 0.25;
/** Hits landing inside this window still count as part of the same string. */
export const MULTI_HIT_WINDOW = 0.4;

// --- basic attack timings -------------------------------------------------
export const PARAGON_LMB_CAST = 0.22;
export const PARAGON_RMB_CAST = 0.35;
export const SHEDIM_LMB_CAST = 0.22;
export const SHEDIM_RMB_CAST = 0.39;

// --- combo chains ---------------------------------------------------------
/** Consecutive attacks must land inside this window to extend a chain. */
export const COMBO_CHAIN_WINDOW = 0.35;
/** LMB x3 ends in a knockdown. */
export const LMB_CHAIN_FINISHER = 3;
/** RMB x4 ends in a finisher (knockdown for Paragon, blast for Shedim). */
export const RMB_CHAIN_FINISHER = 4;

// --- Manastop (shared escape) ---------------------------------------------
/** LMB + RMB must be held together this long to trigger Manastop. */
export const MANASTOP_HOLD = 0.5;
/** Mana required, and consumed, to trigger it. */
export const MANASTOP_COST = 70;

// --- Paragon --------------------------------------------------------------
/** Reflect stance lasts this long while Shift is held. */
export const REFLECT_DURATION = 1.0;
export const REFLECT_COOLDOWN = 6.0;
/** Combokiller: +5% skill damage per landed attack, up to 20 stacks. */
export const COMBOKILLER_WINDOW = 3.0;
export const COMBOKILLER_PER_STACK = 0.05;
export const COMBOKILLER_MAX_STACKS = 20;
/** ArmorBreak removes this much armour for this long. */
export const ARMOR_BREAK_AMOUNT = 20;
export const ARMOR_BREAK_DURATION = 8.0;

// --- Shedim ---------------------------------------------------------------
/** Shadow Dash grants total damage immunity for this long. */
export const SHADOW_DASH_IMMUNITY = 1.0;
export const SHADOW_DASH_SPEED = 13;
export const SHADOW_DASH_COOLDOWN = 5.0;
/** Sprinting RMB x2 stuns the target. */
export const SHEDIM_STUN_DURATION = 1.5;
export const SHEDIM_STUN_CHAIN = 2;
/** Mana threshold above which the 4th RMB detonates. */
export const SHEDIM_BLAST_MANA_THRESHOLD = 180;
export const SHEDIM_BLAST_DAMAGE = 40;
export const SHEDIM_BLAST_COST = 20;
export const BLACK_HOLE_DURATION = 3.0;
export const BLACK_HOLE_PULL = 320;

// --- movement -------------------------------------------------------------
export const WALK_SPEED = 3.6;
/** Sprint is exactly 100% faster than the walk speed. */
export const SPRINT_MULTIPLIER = 2.0;
/** Two taps of the same direction inside this window begin a sprint. */
export const DOUBLE_TAP_WINDOW = 0.25;
export const GRAVITY = 0.62;
export const JUMP_VELOCITY = 15;
export const MAX_FALL_SPEED = 18;
/**
 * Gravity multiplier while attacking in mid-air. Aerial strings need to finish
 * before landing — Kacper's 0.42s heavy three times over is 1.26s against a
 * ~0.8s jump — so attacking suspends most of the fall, the way juggle combos
 * work in fighting games.
 */
export const AIR_ATTACK_GRAVITY = 0.28;
/** How long platform collision is ignored after pressing S + Space. */
export const DROP_THROUGH_TIME = 0.25;

// --- misc -----------------------------------------------------------------
/** Fighters below this Y have fallen into the gap. */
export const RESPAWN_DAMAGE = 50;
export const RESPAWN_INVULN = 1.0;
/** Paragon's fists reach 10% less far than Shedim's katana. */
export const PARAGON_RANGE_PENALTY = 0.9;

// --- movement feel ---------------------------------------------------------
/** Horizontal acceleration per frame while grounded / airborne. */
export const GROUND_ACCEL = 1.15;
export const AIR_ACCEL = 0.62;
/** Velocity retained per frame when no direction is held. */
export const GROUND_FRICTION = 0.72;
export const AIR_FRICTION = 0.94;
/** You may still jump this long after walking off a ledge. */
export const COYOTE_TIME = 0.1;
/** A jump pressed this long before landing still fires on touchdown. */
export const JUMP_BUFFER = 0.12;
/** Releasing the jump early cuts the rise to this fraction. */
export const JUMP_CUT = 0.6;
/** Movement retained while an attack animation plays. */
export const ATTACK_DRIFT = 0.86;

// --- Paragon dash ----------------------------------------------------------
export const PARAGON_DASH_SPEED = 11.5;
export const PARAGON_DASH_TIME = 0.2;
export const PARAGON_DASH_IMMUNITY = 0.35;
export const PARAGON_DASH_COOLDOWN = 2.2;


// --- attack range ladder ---------------------------------------------------
/**
 * Melee reach comes in four discrete levels. Level 2 is the reference (the
 * original katana reach) and each step is 10% of it, so a level-1 fighter like
 * Paragon reaches 10% less than a level-2 fighter.
 */
export const RANGE_BASE = 84;
export const RANGE_STEP = 0.1;
export type RangeLevel = 1 | 2 | 3 | 4;

export function rangeFor(level: RangeLevel): number {
  return RANGE_BASE * (1 + (level - 2) * RANGE_STEP);
}

// --- Stoic ------------------------------------------------------------------
/**
 * Stoic ignores incoming *hit reactions*: no stun, no stunlock, no knockdown,
 * no launch. Damage still lands — it buys you the ability to keep acting, not
 * invulnerability. Stoic fighters glow red.
 */
export const STOIC_GLOW = "#ff3b30";

/** Paragon: dash + hold RMB gives a short braced dash. */
export const PARAGON_BRACE_DASH_TIME = 0.28;
export const PARAGON_BRACE_DASH_SPEED = 10;
export const PARAGON_BRACE_STOIC = 0.75;
export const PARAGON_BRACE_COOLDOWN = 3.0;

// --- Shedim -----------------------------------------------------------------
/** Dash-jump RMB then LMB in the air throws a slash wave. Costs no mana. */
export const SLASH_WAVE_DAMAGE = 34;
export const SLASH_WAVE_SPEED = 11;
export const SLASH_WAVE_LIFE = 1.1;

// --- Kacper -----------------------------------------------------------------
export const KACPER_LMB_CAST = 0.26;
export const KACPER_RMB_CAST = 0.42;
/** Dash + LMB RMB RMB: a shield-forward charge granting Stoic. */
export const KACPER_CHARGE_TIME = 1.0;
export const KACPER_CHARGE_SPEED = 8.5;
/** Dash-jump LMB x3: the final slam multiplies damage by this. */
export const KACPER_SLAM_SCALING = 4.0;
/** Whirlwind ultimate. */
export const KACPER_ULT_COST = 180;
export const KACPER_ULT_DURATION = 4.0;
export const KACPER_ULT_TICK = 0.25;
export const KACPER_ULT_COOLDOWN = 18.0;
/** Holding RMB while standing still: burns HP but grants Stoic. */
export const KACPER_BRACE_THRESHOLD = 4.0;
export const KACPER_BRACE_BURN_PER_SEC = 0.02;
