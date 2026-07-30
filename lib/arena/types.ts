export type ClassId = "paragon" | "shedim" | "kacper";
export type Facing = 1 | -1;
export type AttackKind = "lmb" | "rmb" | "skill";
export type SkillSlot = "Q" | "E" | "R" | "F" | "SHIFT";

export type FighterState =
  | "idle"
  | "walk"
  | "sprint"
  | "air"
  | "attack"
  | "hitstun"
  | "stunned"
  | "knockdown"
  | "getup"
  | "dash"
  | "reflect"
  | "charge"
  | "whirlwind"
  | "dead";

/** What landing this attack does to the target beyond raw damage. */
export type HitEffect = "none" | "knockdown" | "launch" | "stun";

export interface AttackSpec {
  id: string;
  label: string;
  kind: AttackKind;
  /** Total animation length; the fighter is locked for this long. */
  castTime: number;
  /** Point inside the cast at which the hitbox appears. */
  activeAt: number;
  activeDuration: number;
  /** Multiplier applied to the class's base attack power. */
  damageMult: number;
  /** Reach as a multiple of the class's attack range. */
  rangeMult: number;
  /** Vertical half-height of the hitbox. */
  height: number;
  knockback: number;
  effect: HitEffect;
  effectDuration?: number;
  manaCost?: number;
  /** Centres the hitbox on the caster instead of projecting it forward. */
  selfCentered?: boolean;
}

export interface SkillDef extends AttackSpec {
  slot: SkillSlot;
  description: string;
  cooldown: number;
  /** Skills flagged here were not specified in the design doc. */
  invented?: boolean;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  weapon: string;
  blurb: string;
  maxHp: number;
  /** Shedim's pool is called the Manapool in the spec. */
  maxMana: number;
  manaLabel: string;
  /** Mana generated per LMB/RMB hit. Skills never generate mana. */
  manaPerHit: number;
  attackPower: number;
  /** Base attack reach in pixels, derived from `rangeLevel`. */
  attackRange: number;
  /** Melee reach tier, 1 (shortest) to 4 (longest). */
  rangeLevel: 1 | 2 | 3 | 4;
  baseArmor: number;
  lmb: AttackSpec;
  rmb: AttackSpec;
  skills: SkillDef[];
  colors: {
    primary: string;
    secondary: string;
    trim: string;
    skin: string;
    hair: string;
    aura: string;
  };
}

export interface Hitbox {
  ownerId: string;
  /** Id of the attack that produced this box, used for on-hit side effects. */
  sourceId: string;
  kind: AttackKind;
  x: number;
  y: number;
  w: number;
  h: number;
  damage: number;
  knockback: number;
  effect: HitEffect;
  effectDuration: number;
  life: number;
  hit: Set<string>;
  /** Source label, used for the on-screen combat feed. */
  label: string;
  facing: Facing;
}

export interface Projectile {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  damage: number;
  knockback: number;
  effect: HitEffect;
  effectDuration: number;
  life: number;
  label: string;
  color: string;
}

export interface BlackHole {
  ownerId: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
}

/** A single running attack animation. */
export interface ActiveAction {
  spec: AttackSpec;
  elapsed: number;
  spawned: boolean;
  /** Chain index at the moment the attack started, for finisher logic. */
  chainIndex: number;
  /** Whether W was held when the swing began (Shedim's launcher condition). */
  upHeld: boolean;
}

export interface Fighter {
  id: string;
  classId: ClassId;
  name: string;
  isPlayer: boolean;
  /** 0 = the player's side, 1 = hostiles. Same-team hits are ignored. */
  team: 0 | 1;
  /** Mobs reuse the whole fighter pipeline but carry their own numbers. */
  isMob: boolean;
  mobTypeId?: string;
  level: number;
  expValue: number;
  spawnX: number;
  spawnY: number;
  deadTimer: number;

  /** Resolved from the class plus level and allocated stats. */
  attackPower: number;
  attackRange: number;
  speedMult: number;
  attackSpeed: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  facing: Facing;
  onGround: boolean;

  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  armor: number;
  /** Legendary gear affixes; 0 unless something equipped rolled one. */
  lifesteal: number;
  negation: number;
  regenHp: number;
  regenMana: number;

  state: FighterState;
  stateTime: number;
  action: ActiveAction | null;

  // --- timers (seconds remaining) ----------------------------------------
  hitstun: number;
  knockdownTimer: number;
  getupImmunity: number;
  dashImmunity: number;
  stunTimer: number;
  respawnInvuln: number;
  dropThrough: number;
  armorBreak: number;
  /** Grace period after leaving a ledge during which a jump still works. */
  coyoteTimer: number;
  /** A jump pressed slightly too early, replayed on landing. */
  jumpBuffer: number;
  /** Set once a rising jump has been cut short by releasing the key. */
  jumpCut: boolean;
  /** Seconds of dash movement remaining. */
  dashTime: number;
  /** Shedim's dash ignores terrain; Paragon's does not. */
  dashPhasing: boolean;
  /**
   * Stoic: incoming hits deal damage but cannot stun, stunlock, knock down or
   * launch. The fighter glows red while it lasts.
   */
  stoicTimer: number;
  /** Time left in which another hit escalates into a stunlock. */
  stunlockWindow: number;
  /** Blocks damage arriving from the facing direction (Kacper's charge). */
  frontGuard: number;
  /** Seconds the whirlwind ultimate has left. */
  whirlwindTimer: number;
  whirlwindTick: number;
  /** How long RMB has been held while standing still (Kacper's brace). */
  braceHold: number;
  /**
   * Recent attack inputs as a string of L/R, used to recognise combos.
   * Cleared when the window lapses.
   */
  comboSeq: string;
  comboSeqTimer: number;
  /** Whether the current sequence began from a dash, and whether it went airborne. */
  seqFromDash: boolean;
  seqAirborne: boolean;
  /** Set when a jump was launched out of a dash. */
  dashJumped: boolean;
  reflectTimer: number;
  reflectCooldown: number;
  hitFlash: number;

  // --- combo bookkeeping --------------------------------------------------
  lmbChain: number;
  rmbChain: number;
  chainTimer: number;
  /** Whether the current RMB chain was started while sprinting. */
  rmbChainSprinting: boolean;
  /** Hits taken recently, for the 0.200s / 0.235s hitstun rule. */
  recentHitsTaken: number;
  recentHitsTimer: number;

  // --- Paragon ------------------------------------------------------------
  comboKillerStacks: number;
  comboKillerTimer: number;

  // --- shared -------------------------------------------------------------
  manaflowHold: number;
  cooldowns: Record<string, number>;

  // --- input-derived ------------------------------------------------------
  sprinting: boolean;
  wantsUp: boolean;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
}

export interface Platform {
  x: number;
  y: number;
  w: number;
  /** One-way platforms are only solid from above and can be dropped through. */
  oneWay: boolean;
}

export interface ArenaMap {
  width: number;
  height: number;
  /** Solid ground segments; the space between them is the gap. */
  ground: Array<{ x: number; w: number; y: number }>;
  platforms: Platform[];
  spawnA: { x: number; y: number };
  spawnB: { x: number; y: number };
  /** Falling past this Y counts as falling into the gap. */
  killY: number;
}

export interface CombatLogEntry {
  id: number;
  text: string;
  tone: "info" | "good" | "bad" | "big";
}
