import { getClass, skillOf } from "./classes";
import {
  ARMOR_BREAK_AMOUNT,
  ARMOR_BREAK_DURATION,
  BLACK_HOLE_DURATION,
  BLACK_HOLE_PULL,
  COMBOKILLER_MAX_STACKS,
  COMBOKILLER_PER_STACK,
  COMBOKILLER_WINDOW,
  COMBO_CHAIN_WINDOW,
  AIR_ACCEL,
  AIR_ATTACK_GRAVITY,
  AIR_FRICTION,
  ATTACK_DRIFT,
  COYOTE_TIME,
  DROP_THROUGH_TIME,
  DT,
  GROUND_ACCEL,
  GROUND_FRICTION,
  JUMP_BUFFER,
  JUMP_CUT,
  GETUP_IMMUNITY,
  GRAVITY,
  HAZARD_TICK_INTERVAL,
  HITSTUN_SINGLE,
  KACPER_BRACE_BURN_PER_SEC,
  KACPER_BRACE_THRESHOLD,
  KACPER_CHARGE_SPEED,
  KACPER_CHARGE_TIME,
  KACPER_SLAM_SCALING,
  KACPER_ULT_DURATION,
  KACPER_ULT_TICK,
  JUMP_VELOCITY,
  KNOCKDOWN_DURATION,
  MOB_KNOCKDOWN_DURATION,
  LMB_CHAIN_FINISHER,
  MANASTOP_COST,
  MANASTOP_HOLD,
  PARAGON_BRACE_COOLDOWN,
  PARAGON_BRACE_DASH_SPEED,
  PARAGON_BRACE_DASH_TIME,
  PARAGON_BRACE_STOIC,
  SLASH_WAVE_DAMAGE,
  SLASH_WAVE_LIFE,
  SLASH_WAVE_SPEED,
  STOIC_GLOW,
  STUNLOCK_DURATION,
  STUNLOCK_WINDOW,
  MAX_FALL_SPEED,
  MULTI_HIT_WINDOW,
  RESPAWN_INVULN,
  RMB_CHAIN_FINISHER,
  PARAGON_DASH_IMMUNITY,
  PARAGON_DASH_SPEED,
  PARAGON_DASH_TIME,
  SHADOW_DASH_IMMUNITY,
  SHADOW_DASH_SPEED,
  SHEDIM_BLAST_COST,
  SHEDIM_BLAST_DAMAGE,
  SHEDIM_BLAST_MANA_THRESHOLD,
  SHEDIM_STUN_CHAIN,
  SHEDIM_STUN_DURATION,
  SPRINT_MULTIPLIER,
  WALK_SPEED,
} from "./constants";
import { ARENA, groundAt } from "./map";
import {
  MOB_TYPES,
  mobAttackSpec,
  mobBossSpecialSpec,
  mobBossSweepSpec,
  mobRangedAttackSpec,
} from "./mobs";
import type {
  ActiveAction,
  AttackSpec,
  BlackHole,
  ClassId,
  CombatLogEntry,
  Facing,
  Fighter,
  FloatingText,
  Hazard,
  HitEffect,
  Hitbox,
  Particle,
  Projectile,
} from "./types";

/** Normalised commands; the player and the AI both drive the engine with this. */
export interface Intent {
  moveX: number;
  sprint: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  jumpHeld: boolean;
  dropThrough: boolean;
  lmb: boolean;
  rmb: boolean;
  lmbHeld: boolean;
  rmbHeld: boolean;
  bothHeldTime: number;
  q: boolean;
  e: boolean;
  r: boolean;
  f: boolean;
  shift: boolean;
  /** Mob-only: use the boss telegraphed slam instead of the regular swing. */
  special: boolean;
  /** Mob-only: the boss's second telegraphed move — a wider, stunning sweep
   *  instead of the knockdown slam, so a boss fight has two distinct
   *  "watch out" reads instead of just one repeated. */
  special2: boolean;
}

export function emptyIntent(): Intent {
  return {
    moveX: 0,
    sprint: false,
    up: false,
    down: false,
    jump: false,
    jumpHeld: false,
    dropThrough: false,
    lmb: false,
    rmb: false,
    lmbHeld: false,
    rmbHeld: false,
    bothHeldTime: 0,
    q: false,
    e: false,
    r: false,
    f: false,
    shift: false,
    special: false,
    special2: false,
  };
}

export interface ArenaCallbacks {
  onLog(text: string, tone: CombatLogEntry["tone"]): void;
  onEnd(winner: string, playerWon: boolean): void;
}

export class ArenaEngine {
  map = ARENA;
  fighters: Fighter[] = [];
  hitboxes: Hitbox[] = [];
  projectiles: Projectile[] = [];
  blackHoles: BlackHole[] = [];
  texts: FloatingText[] = [];
  particles: Particle[] = [];

  mode: "duel" | "adventure" = "duel";
  camera = { x: 0, y: 0 };
  shake = 0;
  /**
   * Seconds of "hitstop" remaining: a brief freeze-frame on a heavy hit,
   * classic fighting-game juice that sells impact by holding the moment
   * before the knockback plays out. Consumed once per real-time frame in
   * ArenaClient's loop rather than here, so it freezes presentation (the
   * physics/AI tick) without the engine needing its own clock concept.
   */
  hitstop = 0;
  time = 0;
  over = false;
  /** Bumped every hazard damage tick — render.ts diffs it to fire a distinct sizzle cue. */
  hazardHits = 0;

  private nextId = 1;
  private cb: ArenaCallbacks;
  private viewport = { w: 1200, h: 700 };

  constructor(playerClass: ClassId, enemyClass: ClassId, cb: ArenaCallbacks) {
    this.cb = cb;
    this.fighters = [
      // Named after their class so the combat log reads as prose.
      this.makeFighter("p1", playerClass, getClass(playerClass).name, true, this.map.spawnA, 1),
      this.makeFighter("p2", enemyClass, `Rival ${getClass(enemyClass).name}`, false, this.map.spawnB, -1),
    ];
    this.snapCamera();
  }

  get player() {
    return this.fighters[0];
  }
  get enemy() {
    return this.fighters[1];
  }

  setViewport(w: number, h: number) {
    this.viewport.w = w;
    this.viewport.h = h;
  }

  /** Not private: AdventureEngine's pet companion reuses this to build its
   *  own class-based fighter instead of duplicating the field list. */
  protected makeFighter(
    id: string,
    classId: ClassId,
    name: string,
    isPlayer: boolean,
    spawn: { x: number; y: number },
    facing: Facing
  ): Fighter {
    const cls = getClass(classId);
    return {
      id,
      classId,
      name,
      isPlayer,
      team: isPlayer ? 0 : 1,
      isMob: false,
      level: 1,
      expValue: 0,
      spawnX: spawn.x,
      spawnY: spawn.y,
      deadTimer: 0,
      attackPower: cls.attackPower,
      attackRange: cls.attackRange,
      speedMult: 1,
      attackSpeed: 1,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      w: 30,
      h: 62,
      facing,
      onGround: false,
      hp: cls.maxHp,
      maxHp: cls.maxHp,
      mana: 0,
      maxMana: cls.maxMana,
      armor: cls.baseArmor,
      lifesteal: 0,
      negation: 0,
      regenHp: 0,
      regenMana: 0,
      cdr: 0,
      state: "idle",
      stateTime: 0,
      action: null,
      hitstun: 0,
      knockdownTimer: 0,
      getupImmunity: 0,
      dashImmunity: 0,
      stunTimer: 0,
      respawnInvuln: 0,
      dropThrough: 0,
      armorBreak: 0,
      coyoteTimer: 0,
      jumpBuffer: 0,
      jumpCut: false,
      dashTime: 0,
      dashPhasing: false,
      stoicTimer: 0,
      stunlockWindow: 0,
      frontGuard: 0,
      whirlwindTimer: 0,
      whirlwindTick: 0,
      braceHold: 0,
      comboSeq: "",
      comboSeqTimer: 0,
      seqFromDash: false,
      seqAirborne: false,
      dashJumped: false,
      reflectTimer: 0,
      reflectCooldown: 0,
      hitFlash: 0,
      lmbChain: 0,
      rmbChain: 0,
      chainTimer: 0,
      rmbChainSprinting: false,
      recentHitsTaken: 0,
      recentHitsTimer: 0,
      comboKillerStacks: 0,
      comboKillerTimer: 0,
      hitStreak: 0,
      bestHitStreak: 0,
      manaflowHold: 0,
      cooldowns: {},
      sprinting: false,
      wantsUp: false,
      hazardTick: 0,
      elite: false,
    };
  }

  // ====================================================================== step

  step(playerIntent: Intent, enemyIntent: Intent) {
    this.stepAll(playerIntent, (f) => (f.id === "p2" ? enemyIntent : emptyIntent()));

    // Duel mode ends the moment either fighter drops.
    for (const f of this.fighters) {
      if (f.hp <= 0 && f.state !== "dead") {
        f.hp = 0;
        f.state = "dead";
        this.over = true;
        const winner = this.fighters.find((o) => o.id !== f.id)!;
        this.cb.onLog(`${f.name} is defeated. ${winner.name} wins!`, "big");
        this.cb.onEnd(winner.name, winner.isPlayer);
      }
    }
  }

  /**
   * Advances every fighter one tick. The player is driven by `playerIntent`;
   * everyone else asks `intentFor`. Both game modes run through this, so the
   * physics and combat rules can never drift apart between them.
   */
  stepAll(playerIntent: Intent, intentFor: (f: Fighter) => Intent) {
    if (this.over) return;
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - DT);
      return;
    }
    this.time += DT;

    for (const f of this.fighters) {
      const intent = f.isPlayer ? playerIntent : intentFor(f);
      this.updateFighter(f, intent, this.nearestFoe(f));
    }

    this.applyHazards();
    this.updateProjectiles();
    this.updateBlackHoles();
    this.resolveHits();
    this.updateFx();
    this.updateCamera();
  }

  /** Closest living fighter on the opposing team. */
  nearestFoe(f: Fighter): Fighter {
    let best = f;
    let bestD = Infinity;
    for (const o of this.fighters) {
      if (o.team === f.team || o.state === "dead") continue;
      const d = Math.abs(o.x - f.x);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // --- helpers used by the adventure layer ---------------------------------
  groundAtX(x: number): number | null {
    return groundAt(this.map, x);
  }
  pushFloating(x: number, y: number, text: string, color: string, size: number) {
    this.spawnText(x, y, text, color, size);
  }
  burstAt(x: number, y: number, color: string, count: number) {
    this.burst(x, y, color, count);
  }

  // =================================================================== fighter

  private updateFighter(f: Fighter, input: Intent, opponent: Fighter) {
    if (f.state === "dead") return;

    this.tickTimers(f);
    f.stateTime += DT;
    f.wantsUp = input.up;
    // Sprints can only be started on the ground, but momentum carries into a
    // jump — otherwise a running leap could never clear the gap.
    f.sprinting = input.sprint && (f.onGround || f.sprinting);

    // --- knocked down: fully immune until standing up ---------------------
    if (f.knockdownTimer > 0) {
      f.state = "knockdown";
      f.vx *= 0.85;
      this.physics(f);
      return;
    }
    if (f.state === "knockdown") {
      // Just finished the 2.5s; grant the brief get-up immunity window.
      f.state = "getup";
      f.stateTime = 0;
      f.getupImmunity = GETUP_IMMUNITY;
      this.spawnText(f.x, f.y - f.h, "UP!", "#93c5fd", 15);
    }

    // --- Manastop ----------------------------------------------------------
    // Checked before the crowd-control returns below, because it is the only
    // action a stunned or stunlocked fighter is allowed to take.
    if (
      input.bothHeldTime >= MANASTOP_HOLD &&
      f.mana >= MANASTOP_COST &&
      f.knockdownTimer <= 0
    ) {
      f.mana -= MANASTOP_COST;
      this.knockDown(f, true);
      this.cb.onLog(`${f.name} triggers Manastop and breaks the combo!`, "good");
      this.spawnText(f.x, f.y - f.h - 12, "MANASTOP", "#22d3ee", 20);
      this.shake = Math.max(this.shake, 10);
      return;
    }

    // --- crowd control ------------------------------------------------------
    // Stunned or stunlocked: no movement, no attacks, no skills.
    if (f.stunTimer > 0) {
      f.state = "stunned";
      f.vx *= 0.8;
      this.physics(f);
      return;
    }
    if (f.hitstun > 0) {
      f.state = "hitstun";
      f.vx *= 0.7;
      this.physics(f);
      return;
    }

    // --- Kacper: holding RMB while standing still burns HP for Stoic --------
    if (f.classId === "kacper" && input.rmbHeld && Math.abs(f.vx) < 0.4 && f.onGround) {
      f.braceHold += DT;
      if (f.braceHold >= KACPER_BRACE_THRESHOLD) {
        f.hp -= f.maxHp * KACPER_BRACE_BURN_PER_SEC * DT;
        f.stoicTimer = Math.max(f.stoicTimer, 0.25);
        if (Math.floor(f.braceHold * 2) % 2 === 0) {
          this.spawnText(f.x, f.y - f.h - 6, "STOIC", "#ff6b5a", 12);
        }
      }
    } else if (f.braceHold > 0) {
      f.braceHold = 0;
    }

    // --- Whirlwind ultimate --------------------------------------------------
    if (f.state === "whirlwind") {
      f.whirlwindTimer -= DT;
      f.whirlwindTick -= DT;
      if (f.whirlwindTick <= 0) {
        f.whirlwindTick = KACPER_ULT_TICK;
        this.whirlwindHit(f);
      }
      // He keeps full movement, but cannot attack.
      const wSpeed = WALK_SPEED * f.speedMult * (f.sprinting ? SPRINT_MULTIPLIER : 1);
      if (input.moveX !== 0) {
        f.vx += clamp(input.moveX * wSpeed - f.vx, -GROUND_ACCEL, GROUND_ACCEL);
        f.facing = input.moveX > 0 ? 1 : -1;
      } else {
        f.vx *= GROUND_FRICTION;
      }
      if (f.whirlwindTimer <= 0) {
        f.state = "idle";
        this.cb.onLog(`${f.name}'s whirlwind ends.`, "info");
      }
      this.physics(f);
      return;
    }

    // --- Kacper's guarded charge --------------------------------------------
    if (f.state === "charge") {
      f.dashTime -= DT;
      f.vx = f.facing * KACPER_CHARGE_SPEED;
      if (f.dashTime <= 0) {
        f.state = "idle";
        f.vx *= 0.3;
      }
      this.physics(f);
      this.dashTrail(f);
      return;
    }

    // --- dashes -------------------------------------------------------------
    if (f.state === "dash") {
      f.dashTime -= DT;
      if (f.dashTime <= 0) {
        f.state = "idle";
        // Keep a little exit speed so the dash flows into a run.
        f.vx *= 0.35;
      } else if (f.dashPhasing) {
        // Shedim slips through terrain, so skip collision entirely.
        f.x += f.vx;
        f.x = clamp(f.x, 20, this.map.width - 20);
        this.dashTrail(f);
        return;
      }
      // Paragon's dash still collides, but ignores gravity while it lasts.
      const keepVy = f.vy;
      f.vy = 0;
      this.physics(f);
      if (f.dashTime > 0) f.vy = 0;
      else f.vy = keepVy;
      this.dashTrail(f);
      return;
    }

    // --- Reflect stance ----------------------------------------------------
    if (f.state === "reflect") {
      f.vx *= 0.6;
      // Now that Reflect sits on a tap key rather than Shift, the stance simply
      // runs its full one-second window.
      if (f.reflectTimer <= 0) {
        f.state = "idle";
        f.reflectTimer = 0;
      }
      this.physics(f);
      return;
    }

    // --- an attack is already running -------------------------------------
    if (f.action) {
      this.advanceAction(f, opponent);
      f.vx *= ATTACK_DRIFT;
      this.physics(f);
      return;
    }

    // --- skills ------------------------------------------------------------
    if (input.shift && this.trySkill(f, "SHIFT", opponent)) return;
    if (input.q && this.trySkill(f, "Q", opponent)) return;
    if (input.e && this.trySkill(f, "E", opponent)) return;
    if (input.r && this.trySkill(f, "R", opponent)) return;
    if (input.f && this.trySkill(f, "F", opponent)) return;

    // --- basic attacks -----------------------------------------------------
    const cls = getClass(f.classId);
    if ((input.lmb || input.special || input.special2) && f.isMob) {
      const type = MOB_TYPES[f.mobTypeId!];
      if (type) {
        const useSpecial = input.special && type.isBoss;
        const useSpecial2 = input.special2 && type.isBoss;
        const spec = useSpecial2
          ? mobBossSweepSpec(type)
          : useSpecial
            ? mobBossSpecialSpec(type)
            : type.ranged
              ? mobRangedAttackSpec(type)
              : mobAttackSpec(type);
        this.startAttack(f, spec);
        this.advanceAction(f, opponent);
        this.physics(f);
        return;
      }
    }
    // Paragon: dashing and holding RMB converts into a braced dash with Stoic.
    if (
      f.classId === "paragon" &&
      f.sprinting &&
      f.onGround &&
      input.rmbHeld &&
      (f.cooldowns!["paragon-brace"] ?? 0) <= 0
    ) {
      this.paragonBraceDash(f);
      return;
    }

    if (input.lmb) {
      if (!this.pushComboInput(f, "lmb")) this.startAttack(f, cls.lmb);
      this.advanceAction(f, opponent);
      this.physics(f);
      return;
    }
    if (input.rmb) {
      if (!this.pushComboInput(f, "rmb")) this.startAttack(f, cls.rmb);
      this.advanceAction(f, opponent);
      this.physics(f);
      return;
    }

    // --- movement ----------------------------------------------------------
    // Accelerate toward the target speed rather than snapping to it, so
    // direction changes and landings read as momentum instead of teleporting.
    const speed = WALK_SPEED * f.speedMult * (f.sprinting ? SPRINT_MULTIPLIER : 1);
    const accel = f.onGround ? GROUND_ACCEL : AIR_ACCEL;

    if (input.moveX !== 0) {
      const target = input.moveX * speed;
      f.vx += clamp(target - f.vx, -accel, accel);
      f.facing = input.moveX > 0 ? 1 : -1;
      f.state = f.onGround ? (f.sprinting ? "sprint" : "walk") : "air";
    } else {
      f.vx *= f.onGround ? GROUND_FRICTION : AIR_FRICTION;
      if (Math.abs(f.vx) < 0.05) f.vx = 0;
      f.state = f.onGround ? "idle" : "air";
    }

    // Jump requires Space AND W together. Buffered inputs and coyote time make
    // the timing forgiving without changing that rule.
    if (input.jump) f.jumpBuffer = JUMP_BUFFER;
    const canJump = f.onGround || f.coyoteTimer > 0;
    if (f.jumpBuffer > 0 && canJump) {
      f.vy = -JUMP_VELOCITY;
      f.onGround = false;
      f.coyoteTimer = 0;
      f.jumpBuffer = 0;
      f.jumpCut = false;
      f.state = "air";
      // Remembered for the dash-jump aerial combos.
      f.dashJumped = f.sprinting;
    }
    // Releasing the jump early gives a shorter hop.
    if (!input.jumpHeld && f.vy < 0 && !f.jumpCut && !f.onGround) {
      f.vy *= JUMP_CUT;
      f.jumpCut = true;
    }

    // Drop through a one-way platform with S + Space.
    if (input.dropThrough && f.onGround) {
      f.dropThrough = DROP_THROUGH_TIME;
      f.y += 2;
      f.onGround = false;
    }

    this.physics(f);
  }

  /** Streaks left behind a dashing fighter. */
  private dashTrail(f: Fighter) {
    const cls = getClass(f.classId);
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: f.x - f.facing * (6 + Math.random() * 14),
        y: f.y - f.h * (0.3 + Math.random() * 0.6),
        vx: -f.facing * (0.6 + Math.random()),
        vy: (Math.random() - 0.5) * 0.6,
        life: 0.24,
        maxLife: 0.24,
        color: cls.colors.aura,
        size: 2 + Math.random() * 3,
        gravity: 0,
      });
    }
  }

  private tickTimers(f: Fighter) {
    const dec = (v: number) => Math.max(0, v - DT);
    f.knockdownTimer = dec(f.knockdownTimer);
    f.getupImmunity = dec(f.getupImmunity);
    f.dashImmunity = dec(f.dashImmunity);
    f.stunTimer = dec(f.stunTimer);
    f.hitstun = dec(f.hitstun);
    f.respawnInvuln = dec(f.respawnInvuln);
    f.dropThrough = dec(f.dropThrough);
    f.stoicTimer = dec(f.stoicTimer);
    f.stunlockWindow = dec(f.stunlockWindow);
    f.frontGuard = dec(f.frontGuard);
    f.comboSeqTimer = dec(f.comboSeqTimer);
    if (f.comboSeqTimer <= 0 && f.comboSeq) {
      f.comboSeq = "";
      f.seqFromDash = false;
      f.seqAirborne = false;
    }
    f.coyoteTimer = dec(f.coyoteTimer);
    f.jumpBuffer = dec(f.jumpBuffer);
    f.armorBreak = dec(f.armorBreak);
    f.reflectTimer = dec(f.reflectTimer);
    f.reflectCooldown = dec(f.reflectCooldown);
    f.hitFlash = dec(f.hitFlash);
    f.manaflowHold = dec(f.manaflowHold);

    const cls = getClass(f.classId);
    f.armor = cls.baseArmor - (f.armorBreak > 0 ? ARMOR_BREAK_AMOUNT : 0);

    // Legendary Vitality: passive regen while alive, gear-derived so mobs
    // (which never carry equipment) are always at 0 and unaffected.
    if (f.regenHp > 0 && f.hp > 0) f.hp = Math.min(f.maxHp, f.hp + f.regenHp * DT);
    if (f.regenMana > 0) f.mana = Math.min(f.maxMana, f.mana + f.regenMana * DT);

    // Combo chains lapse if nothing lands inside the window.
    f.chainTimer = dec(f.chainTimer);
    if (f.chainTimer <= 0) {
      f.lmbChain = 0;
      f.rmbChain = 0;
    }
    f.recentHitsTimer = dec(f.recentHitsTimer);
    if (f.recentHitsTimer <= 0) f.recentHitsTaken = 0;

    // Combokiller decays as a whole once 3s pass without a landed hit.
    f.comboKillerTimer = dec(f.comboKillerTimer);
    if (f.comboKillerTimer <= 0) f.comboKillerStacks = 0;

    for (const k of Object.keys(f.cooldowns)) {
      f.cooldowns[k] = dec(f.cooldowns[k]);
    }
  }

  // ==================================================================== attacks

  private startAttack(f: Fighter, spec: AttackSpec) {
    // Extend or restart the relevant chain.
    if (spec.kind === "lmb") {
      f.lmbChain = f.chainTimer > 0 && f.lmbChain > 0 ? f.lmbChain + 1 : 1;
      f.rmbChain = 0;
    } else if (spec.kind === "rmb") {
      if (f.chainTimer > 0 && f.rmbChain > 0) {
        f.rmbChain += 1;
      } else {
        f.rmbChain = 1;
        f.rmbChainSprinting = f.sprinting;
      }
      f.lmbChain = 0;
    }
    // The follow-up window runs from the END of this swing, so the chain
    // survives its own animation. Paragon's 0.35s heavy would otherwise expire
    // the 0.35s window before the next input could ever arrive.
    f.chainTimer = spec.castTime + COMBO_CHAIN_WINDOW;

    f.action = {
      spec,
      elapsed: 0,
      spawned: false,
      chainIndex: spec.kind === "lmb" ? f.lmbChain : f.rmbChain,
      upHeld: f.wantsUp,
    };
    f.state = "attack";
    f.stateTime = 0;
  }

  private advanceAction(f: Fighter, opponent: Fighter) {
    // A combo can consume the input and clear the action outright.
    if (!f.action) return;
    const a = f.action;
    a.elapsed += DT * f.attackSpeed;

    if (!a.spawned && a.elapsed >= a.spec.activeAt) {
      a.spawned = true;
      this.spawnAttack(f, a, opponent);
    }
    if (a.elapsed >= a.spec.castTime) {
      f.action = null;
      f.state = "idle";
    }
  }

  /** Turns an action into a hitbox (or projectile) with its combo effect. */
  private spawnAttack(f: Fighter, a: ActiveAction, opponent: Fighter) {
    const cls = getClass(f.classId);
    const spec = a.spec;

    if (spec.id === "shadow-slash") {
      this.projectiles.push({
        id: `pr${this.nextId++}`,
        ownerId: f.id,
        x: f.x + f.facing * 24,
        y: f.y - f.h * 0.55,
        vx: f.facing * 9,
        vy: 0,
        w: 44,
        h: spec.height,
        damage: this.computeDamage(f, spec),
        knockback: spec.knockback,
        effect: "none",
        effectDuration: 0,
        life: 1.2,
        label: spec.label,
        color: cls.colors.trim,
      });
      return;
    }

    if (spec.id === "mob-ranged" && f.isMob) {
      const type = MOB_TYPES[f.mobTypeId!];
      this.projectiles.push({
        id: `pr${this.nextId++}`,
        ownerId: f.id,
        x: f.x + f.facing * 20,
        y: f.y - f.h * 0.55,
        vx: f.facing * 7,
        vy: 0,
        w: 14,
        h: 14,
        damage: this.computeDamage(f, spec),
        knockback: spec.knockback,
        effect: "none",
        effectDuration: 0,
        life: 1.6,
        label: spec.label,
        color: type?.accent ?? "#0e7490",
      });
      return;
    }

    if (spec.id === "black-hole") {
      this.blackHoles.push({
        ownerId: f.id,
        x: f.x,
        y: f.y - f.h - 40,
        life: BLACK_HOLE_DURATION,
        maxLife: BLACK_HOLE_DURATION,
        radius: 190,
      });
      this.cb.onLog(`${f.name} tears open a Black Hole!`, "big");
      this.shake = Math.max(this.shake, 12);
      return;
    }

    // Work out what the combo finisher does, if this is one.
    let effect: HitEffect = spec.effect;
    let effectDuration = spec.effectDuration ?? 0;
    let pierce = false;

    if (spec.kind === "lmb" && a.chainIndex >= LMB_CHAIN_FINISHER) {
      // Shedim's third slash launches instead if W was held on the input.
      if (f.classId === "shedim" && (a.upHeld || f.wantsUp)) {
        effect = "launch";
        effectDuration = 0.6;
      } else {
        effect = "knockdown";
      }
    } else if (spec.kind === "rmb") {
      if (f.classId === "kacper" && a.chainIndex >= RMB_CHAIN_FINISHER) {
        // The fourth heavy cleaves straight through the target.
        effect = "knockdown";
        pierce = true;
      } else if (f.classId === "paragon" && a.chainIndex >= RMB_CHAIN_FINISHER) {
        effect = "knockdown";
      } else if (
        f.classId === "shedim" &&
        a.chainIndex >= SHEDIM_STUN_CHAIN &&
        f.rmbChainSprinting
      ) {
        effect = "stun";
        effectDuration = SHEDIM_STUN_DURATION;
      }
    }

    const reach = f.attackRange * spec.rangeMult * (pierce ? 1.5 : 1);
    // Self-centred skills blast outward in both directions from the body.
    const hb: Hitbox = {
      ownerId: f.id,
      sourceId: spec.id,
      kind: spec.kind,
      x: spec.selfCentered ? f.x - reach : f.facing === 1 ? f.x : f.x - reach,
      y: f.y - f.h * 0.5 - spec.height / 2,
      w: spec.selfCentered ? reach * 2 : reach,
      h: spec.height,
      damage: this.computeDamage(f, spec),
      knockback: spec.knockback,
      effect,
      effectDuration,
      life: spec.activeDuration,
      hit: new Set(),
      label: spec.label,
      facing: f.facing,
    };
    this.hitboxes.push(hb);
    if (spec.kind === "lmb" || spec.kind === "rmb" || spec.kind === "skill") {
      this.spawnSlashArc(f, reach, spec.height, spec.kind, a.chainIndex);
    }

    if (pierce) {
      this.spawnText(f.x, f.y - f.h - 10, "SLASH THROUGH", "#ffd36b", 15);
      this.shake = Math.max(this.shake, 10);
    }
    if (spec.id === "detonate") this.detonationBurst(f);

    // Shedim's 4th consecutive RMB detonates when his pool is above 180.
    if (
      f.classId === "shedim" &&
      spec.kind === "rmb" &&
      a.chainIndex >= RMB_CHAIN_FINISHER &&
      f.mana > SHEDIM_BLAST_MANA_THRESHOLD
    ) {
      f.mana -= SHEDIM_BLAST_COST;
      this.hitboxes.push({
        ownerId: f.id,
        sourceId: "void-blast",
        kind: "skill",
        x: f.facing === 1 ? f.x : f.x - reach * 1.6,
        y: f.y - f.h - 10,
        w: reach * 1.6,
        h: 90,
        damage: SHEDIM_BLAST_DAMAGE,
        knockback: 7,
        effect: "none",
        effectDuration: 0,
        life: 0.1,
        hit: new Set(),
        label: "Void Blast",
        facing: f.facing,
      });
      this.burst(f.x + f.facing * 50, f.y - f.h * 0.6, cls.colors.aura, 26);
      this.cb.onLog(`${f.name}'s Void Blast detonates!`, "big");
      this.shake = Math.max(this.shake, 10);
    }

    void opponent;
  }

  private computeDamage(f: Fighter, spec: AttackSpec): number {
    let dmg = f.attackPower * spec.damageMult;
    // Combokiller boosts ability damage only.
    if (spec.kind === "skill" && f.classId === "paragon") {
      dmg *= 1 + f.comboKillerStacks * COMBOKILLER_PER_STACK;
    }
    return dmg;
  }

  private trySkill(f: Fighter, slot: string, opponent: Fighter): boolean {
    const cls = getClass(f.classId);
    const skill = skillOf(cls, slot);
    if (!skill) return false;
    if ((f.cooldowns[skill.id] ?? 0) > 0) return false;
    if (skill.manaCost && f.mana < skill.manaCost) {
      if (f.isPlayer) {
        this.cb.onLog(`Not enough ${cls.manaLabel.toLowerCase()} for ${skill.label}.`, "bad");
      }
      return false;
    }

    if (skill.manaCost) f.mana -= skill.manaCost;
    f.cooldowns[skill.id] = skill.cooldown * (1 - f.cdr);

    if (skill.id === "reflect") {
      f.state = "reflect";
      f.stateTime = 0;
      f.reflectTimer = skill.castTime;
      this.cb.onLog(`${f.name} braces to Reflect.`, "info");
      return true;
    }

    if (skill.id === "whirlwind") {
      f.state = "whirlwind";
      f.stateTime = 0;
      f.whirlwindTimer = KACPER_ULT_DURATION;
      f.whirlwindTick = 0;
      f.action = null;
      this.cb.onLog(`${f.name} begins a Whirlwind!`, "big");
      this.spawnText(f.x, f.y - f.h - 12, "WHIRLWIND", "#dbe4f5", 20);
      return true;
    }

    if (skill.id === "kacper-guard") {
      f.stoicTimer = Math.max(f.stoicTimer, 3);
      this.cb.onLog(`${f.name} braces behind Bulwark — Stoic!`, "good");
      this.spawnText(f.x, f.y - f.h - 10, "STOIC", STOIC_GLOW, 16);
      return true;
    }

    if (skill.id === "shadow-dash" || skill.id === "iron-dash" || skill.id === "kacper-dash") {
      const phasing = skill.id === "shadow-dash";
      if (skill.id === "kacper-dash") f.stoicTimer = Math.max(f.stoicTimer, 0.4);
      f.state = "dash";
      f.stateTime = 0;
      f.dashTime = phasing ? 0.3 : PARAGON_DASH_TIME;
      f.dashPhasing = phasing;
      f.vx = f.facing * (phasing ? SHADOW_DASH_SPEED : PARAGON_DASH_SPEED);
      f.vy = 0;
      f.dashImmunity = phasing ? SHADOW_DASH_IMMUNITY : PARAGON_DASH_IMMUNITY;
      f.action = null;
      this.cb.onLog(
        phasing
          ? `${f.name} phases forward with Shadow Dash.`
          : `${f.name} bursts forward with Iron Dash.`,
        "info"
      );
      return true;
    }

    f.action = {
      spec: skill,
      elapsed: 0,
      spawned: false,
      chainIndex: 0,
      upHeld: f.wantsUp,
    };
    f.state = "attack";
    f.stateTime = 0;
    this.advanceAction(f, opponent);
    if (f.isPlayer) this.cb.onLog(`${skill.label}!`, "good");
    return true;
  }

  // ================================================================ collisions

  private resolveHits() {
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const hb = this.hitboxes[i];
      hb.life -= DT;

      const owner = this.fighters.find((o) => o.id === hb.ownerId);
      for (const target of this.fighters) {
        if (target.id === hb.ownerId || hb.hit.has(target.id)) continue;
        if (target.state === "dead") continue;
        if (owner && owner.team === target.team) continue;
        if (!overlapsFighter(hb, target)) continue;
        hb.hit.add(target.id);
        this.applyHit(hb, target);
      }

      if (hb.life <= 0) this.hitboxes.splice(i, 1);
    }
  }

  private applyHit(hb: Hitbox, target: Fighter) {
    const attacker = this.fighters.find((f) => f.id === hb.ownerId);
    if (!attacker) return;

    // Knockdown, get-up grace, dash and respawn all grant full immunity.
    if (this.isImmune(target)) {
      this.spawnText(target.x, target.y - target.h - 6, "IMMUNE", "#94a3b8", 13);
      return;
    }

    // Reflect turns the hit back on the attacker and launches them.
    if (target.state === "reflect" && target.reflectTimer > 0) {
      this.spawnText(target.x, target.y - target.h - 10, "REFLECT!", "#fbbf24", 20);
      this.cb.onLog(`${target.name} reflects ${hb.label}!`, "good");
      this.dealDamage(attacker, hb.damage, target, "Reflect");
      this.launch(attacker, 0.6);
      target.state = "idle";
      target.reflectTimer = 0;
      attacker.hitStreak = 0;
      this.shake = Math.max(this.shake, 12);
      this.burst(target.x, target.y - target.h * 0.6, "#fbbf24", 24);
      return;
    }

    // Kacper's charge guards the front: damage arriving from the direction he
    // faces is ignored entirely.
    if (target.frontGuard > 0) {
      const fromFront = Math.sign(attacker.x - target.x) === target.facing;
      if (fromFront) {
        this.spawnText(target.x, target.y - target.h - 6, "GUARD", "#93c5fd", 13);
        this.spawnImpactAt(target.x + target.facing * 12, target.y - target.h * 0.6, "#93c5fd");
        attacker.hitStreak = 0;
        // Guarding hits used to be silent — a real hit lands but nothing
        // audible marks it, which reads as the game dropping the input
        // rather than the block actually working. Piggybacking on the same
        // shake→sound path every other impact uses keeps it consistent.
        this.shake = Math.max(this.shake, 5);
        return;
      }
    }

    this.dealDamage(target, hb.damage, attacker, hb.label);

    // ArmorBreak strips the target's armour for its duration.
    if (hb.sourceId === "armorbreak") {
      target.armorBreak = ARMOR_BREAK_DURATION;
      this.spawnText(target.x, target.y - target.h - 20, "ARMOR BROKEN", "#fb923c", 15);
      this.cb.onLog(`${target.name}'s armour is broken!`, "big");
    }

    // Mana: only basic attacks generate it, for both the giver and receiver.
    if (hb.kind === "lmb" || hb.kind === "rmb") {
      const aCls = getClass(attacker.classId);
      const tCls = getClass(target.classId);
      attacker.mana = Math.min(attacker.maxMana, attacker.mana + aCls.manaPerHit);
      target.mana = Math.min(target.maxMana, target.mana + tCls.manaPerHit);
    }

    // Combokiller counts every landed attack.
    attacker.comboKillerStacks = Math.min(
      COMBOKILLER_MAX_STACKS,
      attacker.comboKillerStacks + 1
    );
    attacker.comboKillerTimer = COMBOKILLER_WINDOW;

    // Hit streak: landing a hit extends it, getting hit resets it — unlike
    // comboKillerStacks this breaks the instant the exchange turns around,
    // so it reads as "how good is this exchange" rather than "how recently
    // was I attacking." Announce it once it's actually a combo (2+), not
    // every single opening hit.
    attacker.hitStreak += 1;
    attacker.bestHitStreak = Math.max(attacker.bestHitStreak, attacker.hitStreak);
    target.hitStreak = 0;
    if (attacker.hitStreak >= 2) {
      this.spawnText(
        target.x,
        target.y - target.h - 30,
        `COMBO x${attacker.hitStreak}`,
        "#ffd36b",
        attacker.hitStreak >= 5 ? 20 : 16
      );
    }

    // Knockback.
    target.vx += hb.facing * hb.knockback;

    // 0.200s stun on a clean hit; if the previous stun has not yet expired the
    // string escalates into a 0.250s stunlock.
    const wasStunned =
      target.hitstun > 0 || target.stunTimer > 0 || target.stunlockWindow > 0;
    target.recentHitsTaken += 1;
    target.recentHitsTimer = MULTI_HIT_WINDOW;

    // Stoic: the damage lands, but nothing about the hit interrupts him.
    if (target.stoicTimer > 0) {
      this.spawnText(target.x, target.y - target.h - 16, "STOIC", STOIC_GLOW, 12);
      target.hitFlash = 0.1;
      return;
    }

    // Tracks how heavy this specific hit was, independent of this.shake
    // (which ratchets across overlapping hits and decays over several
    // frames) — hitstop needs "how big was *this* impact", not the
    // currently-elevated shake level from a moment ago.
    let impactWeight = hb.kind === "rmb" ? 6 : 3;

    switch (hb.effect) {
      case "knockdown":
        this.knockDown(target, false);
        this.cb.onLog(`${attacker.name} knocks ${target.name} down!`, "big");
        impactWeight = 12;
        this.shake = Math.max(this.shake, impactWeight);
        break;
      case "launch":
        this.launch(target, hb.effectDuration || 0.6);
        this.cb.onLog(`${target.name} is launched into the air!`, "big");
        impactWeight = 9;
        this.shake = Math.max(this.shake, impactWeight);
        break;
      case "stun":
        target.stunTimer = hb.effectDuration || SHEDIM_STUN_DURATION;
        target.action = null;
        this.spawnText(target.x, target.y - target.h - 10, "STUNNED", "#facc15", 18);
        this.cb.onLog(
          `${attacker.name} stuns ${target.name} for ${hb.effectDuration.toFixed(1)}s!`,
          "big"
        );
        impactWeight = 10;
        break;
      default:
        target.hitstun = wasStunned ? STUNLOCK_DURATION : HITSTUN_SINGLE;
        target.stunlockWindow = STUNLOCK_WINDOW;
        target.action = null;
        if (wasStunned) {
          this.spawnText(target.x, target.y - target.h - 16, "STUNLOCK", "#facc15", 12);
        }
        break;
    }

    target.hitFlash = 0.1;
    this.shake = Math.max(this.shake, impactWeight);
    // A light tap barely registers, but a knockdown-tier impact holds for a
    // handful of frames — enough to read as "that landed" without the game
    // ever feeling like it stutters.
    this.hitstop = Math.max(this.hitstop, impactWeight * 0.006);
    const impactColor = hb.kind === "skill" ? "#fbbf24" : "#f87171";
    this.burst(
      target.x + hb.facing * 10,
      target.y - target.h * 0.6,
      impactColor,
      hb.kind === "rmb" ? 14 : 8
    );
    this.spawnImpactStar(
      target.x + hb.facing * 10,
      target.y - target.h * 0.6,
      impactColor,
      hb.kind === "rmb" ? 4 : 3
    );
  }

  private dealDamage(
    target: Fighter,
    raw: number,
    source: Fighter,
    label: string
  ) {
    // Legendary Damage Negation: a flat chance to shrug the whole hit off,
    // rolled before armour so it's a full negation rather than a discount.
    if (target.negation > 0 && Math.random() < target.negation) {
      this.spawnText(target.x, target.y - target.h - 4, "NEGATED", "#7dd3fc", 16);
      return;
    }

    // Armour is a straight percentage; ArmorBreak can drive it negative so the
    // victim takes extra damage.
    const mitigated = raw * (1 - target.armor / 100);
    const dmg = Math.max(1, Math.round(mitigated));
    target.hp = Math.max(0, target.hp - dmg);
    // A hit chunking a real fraction of the target's own health reads as
    // "big" regardless of the raw number — a boss losing 15% of its bar in
    // one swing deserves a bigger callout than the running damage numbers,
    // the same way a trash mob losing 15% (a couple hits from dead) doesn't
    // need one at all thanks to the absolute floor.
    const crushing = dmg >= 30 && dmg >= target.maxHp * 0.15;
    this.spawnText(
      target.x + (Math.random() - 0.5) * 16,
      target.y - target.h - 4,
      `${dmg}`,
      crushing ? "#fde047" : target.isPlayer ? "#f87171" : "#ffffff",
      crushing ? 24 : 17
    );
    if (crushing) {
      this.spawnText(target.x, target.y - target.h - 24, "CRUSHING HIT", "#fde047", 15);
    }

    // Legendary Lifesteal: the attacker heals off whatever actually landed.
    if (source.lifesteal > 0 && source.hp > 0) {
      const healed = Math.min(source.maxHp - source.hp, Math.round(dmg * source.lifesteal));
      if (healed > 0) {
        source.hp += healed;
        this.spawnText(source.x, source.y - source.h - 20, `+${healed}`, "#4ade80", 14);
      }
    }
    void label;
  }

  private isImmune(f: Fighter): boolean {
    return (
      f.knockdownTimer > 0 ||
      f.getupImmunity > 0 ||
      f.dashImmunity > 0 ||
      f.respawnInvuln > 0
    );
  }

  private knockDown(f: Fighter, selfInflicted: boolean) {
    f.knockdownTimer = f.isMob ? MOB_KNOCKDOWN_DURATION : KNOCKDOWN_DURATION;
    f.state = "knockdown";
    f.stateTime = 0;
    f.action = null;
    f.hitstun = 0;
    f.stunTimer = 0;
    f.lmbChain = 0;
    f.rmbChain = 0;
    f.vy = -6;
    f.vx += f.facing * (selfInflicted ? 0 : -4);
    this.spawnText(
      f.x,
      f.y - f.h - 10,
      selfInflicted ? "KNOCKDOWN" : "DOWN!",
      "#f472b6",
      19
    );
  }

  private launch(f: Fighter, duration: number) {
    f.vy = -13;
    f.onGround = false;
    f.action = null;
    f.hitstun = Math.max(f.hitstun, duration);
    f.state = "hitstun";
  }

  // =================================================================== physics

  private physics(f: Fighter) {
    const prevY = f.y;

    // Attacking in mid-air hangs, so aerial strings have time to land.
    const hang = !f.onGround && f.state === "attack" && f.action ? AIR_ATTACK_GRAVITY : 1;
    f.vy = Math.min(MAX_FALL_SPEED, f.vy + GRAVITY * hang);
    f.x += f.vx;
    f.y += f.vy;
    f.x = clamp(f.x, 20, this.map.width - 20);

    const wasGrounded = f.onGround;
    f.onGround = false;

    // Solid ground, with the gap left open.
    const g = groundAt(this.map, f.x);
    if (g !== null && f.vy >= 0 && prevY <= g + 1 && f.y >= g) {
      f.y = g;
      f.vy = 0;
      f.onGround = true;
    }

    // One-way platforms: solid only when falling onto them from above.
    if (f.dropThrough <= 0) {
      for (const p of this.map.platforms) {
        if (f.x < p.x - 4 || f.x > p.x + p.w + 4) continue;
        if (f.vy >= 0 && prevY <= p.y + 1 && f.y >= p.y) {
          f.y = p.y;
          f.vy = 0;
          f.onGround = true;
        }
      }
    }

    if (f.onGround) {
      f.coyoteTimer = COYOTE_TIME;
      f.jumpCut = false;
      f.dashJumped = false;
    } else if (wasGrounded && f.vy >= 0) {
      // Walked off an edge rather than jumping: start the coyote window.
      f.coyoteTimer = f.coyoteTimer > 0 ? f.coyoteTimer : COYOTE_TIME;
    }

    // Fell into the gap: respawn at the start, as specified.
    if (f.y > this.map.killY) {
      const spawn = f.isPlayer ? this.map.spawnA : this.map.spawnB;
      f.x = spawn.x;
      f.y = spawn.y;
      f.vx = 0;
      f.vy = 0;
      f.respawnInvuln = RESPAWN_INVULN;
      f.action = null;
      f.hitstun = 0;
      this.cb.onLog(`${f.name} fell into the gap and respawned.`, "bad");
      this.spawnText(spawn.x, spawn.y - 70, "RESPAWN", "#93c5fd", 17);
    }
  }

  // =================================================================== hazards

  private static readonly HAZARD_FX: Record<Hazard["kind"], string> = {
    lava: "#f97316",
    spikes: "#cbd5e1",
    poison: "#84cc16",
  };

  /**
   * Ground-level damage patches (lava, spike pits, poison bogs) tick anyone
   * standing in them every HAZARD_TICK_INTERVAL — a fixed pace regardless of
   * how long they linger, rather than one lump sum on entry, so stepping out
   * mid-tick always saves the next hit. Reuses the existing shake→sound path
   * (see render.ts's trackStateSounds) instead of a bespoke audio hook.
   */
  private applyHazards() {
    if (!this.map.hazards.length) return;
    for (const f of this.fighters) {
      if (f.state === "dead" || !f.onGround || this.isImmune(f)) {
        f.hazardTick = 0;
        continue;
      }
      const hz = this.map.hazards.find(
        (h) => f.x >= h.x && f.x <= h.x + h.w && Math.abs(f.y - h.y) <= 8
      );
      if (!hz) {
        f.hazardTick = 0;
        continue;
      }
      f.hazardTick -= DT;
      if (f.hazardTick > 0) continue;
      f.hazardTick = HAZARD_TICK_INTERVAL;
      const dmg = Math.max(1, Math.round(hz.dps * HAZARD_TICK_INTERVAL));
      f.hp = Math.max(0, f.hp - dmg);
      this.spawnText(
        f.x + (Math.random() - 0.5) * 12,
        f.y - f.h - 4,
        `${dmg}`,
        ArenaEngine.HAZARD_FX[hz.kind],
        14
      );
      this.burst(f.x, f.y - 3, ArenaEngine.HAZARD_FX[hz.kind], 5);
      this.shake = Math.max(this.shake, 6);
      this.hazardHits += 1;
    }
  }

  // ======================================================== projectiles / fx

  private updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= DT;

      let consumed = false;
      for (const target of this.fighters) {
        if (target.id === p.ownerId || target.state === "dead") continue;
        const box: Hitbox = {
          ownerId: p.ownerId,
          sourceId: p.label,
          kind: "skill",
          x: p.x - p.w / 2,
          y: p.y - p.h / 2,
          w: p.w,
          h: p.h,
          damage: p.damage,
          knockback: p.knockback,
          effect: p.effect,
          effectDuration: p.effectDuration,
          life: 0,
          hit: new Set(),
          label: p.label,
          facing: p.vx >= 0 ? 1 : -1,
        };
        if (overlapsFighter(box, target)) {
          this.applyHit(box, target);
          consumed = true;
          break;
        }
      }

      if (consumed || p.life <= 0 || p.x < 0 || p.x > this.map.width) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateBlackHoles() {
    for (let i = this.blackHoles.length - 1; i >= 0; i--) {
      const bh = this.blackHoles[i];
      bh.life -= DT;

      const owner = this.fighters.find((f) => f.id === bh.ownerId);
      if (owner) {
        bh.x = owner.x;
        bh.y = owner.y - owner.h - 40;
      }

      for (const f of this.fighters) {
        if (f.id === bh.ownerId || f.state === "dead") continue;
        if (this.isImmune(f)) continue;
        const dx = bh.x - f.x;
        const dy = bh.y - (f.y - f.h / 2);
        const dist = Math.hypot(dx, dy);
        if (dist > bh.radius || dist < 1) continue;
        // Pull scales up as the target gets closer to the singularity.
        const pull = (BLACK_HOLE_PULL / 60) * (1 - dist / bh.radius);
        f.vx += (dx / dist) * pull * DT * 60;
        f.vy += (dy / dist) * pull * DT * 30;
      }

      if (bh.life <= 0) this.blackHoles.splice(i, 1);
    }
  }

  private updateFx() {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y += t.vy;
      t.vy += 0.06;
      t.life -= DT;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= DT;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.shake > 0) this.shake *= 0.86;
  }

  private spawnText(x: number, y: number, text: string, color: string, size: number) {
    this.texts.push({ x, y, vy: -1.2, life: 0.8, maxLife: 0.8, text, color, size });
    if (this.texts.length > 40) this.texts.shift();
  }

  /** Expanding shockwave rings for Paragon's Detonate. */
  private detonationBurst(f: Fighter) {
    for (let ring = 0; ring < 3; ring++) {
      const count = 20 + ring * 10;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const speed = 3 + ring * 2.4;
        this.particles.push({
          x: f.x,
          y: f.y - f.h * 0.5,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed * 0.6,
          life: 0.34 + ring * 0.1,
          maxLife: 0.55,
          color: ring === 0 ? "#fff4d6" : ring === 1 ? "#f9a03c" : "#c9432a",
          size: 4 - ring,
          gravity: 0.05,
        });
      }
    }
    this.shake = Math.max(this.shake, 18);
    this.spawnText(f.x, f.y - f.h - 12, "DETONATE", "#f9a03c", 20);
  }

  private spawnImpactAt(x: number, y: number, color: string) {
    this.burst(x, y, color, 10);
  }

  /** One damage tick of Kacper's whirlwind, hitting all around him. */
  private whirlwindHit(f: Fighter) {
    const cls = getClass(f.classId);
    const skill = cls.skills.find((k) => k.id === "whirlwind");
    if (!skill) return;
    const reach = f.attackRange * skill.rangeMult;
    this.hitboxes.push({
      ownerId: f.id,
      sourceId: "whirlwind",
      kind: "skill",
      x: f.x - reach,
      y: f.y - f.h * 0.5 - skill.height / 2,
      w: reach * 2,
      h: skill.height,
      damage: this.computeDamage(f, skill),
      knockback: skill.knockback,
      effect: "none",
      effectDuration: 0,
      life: 0.06,
      hit: new Set(),
      label: "Whirlwind",
      facing: f.facing,
    });
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: f.x + Math.cos(a) * reach * 0.7,
        y: f.y - f.h * 0.5 + Math.sin(a) * 12,
        vx: Math.cos(a) * 2,
        vy: Math.sin(a) * 1,
        life: 0.2,
        maxLife: 0.2,
        color: "#dbe4f5",
        size: 2,
        gravity: 0,
      });
    }
  }

  /**
   * Records an attack input and fires any combo it completes.
   * Returns true when a combo consumed the input, so the normal attack is
   * skipped.
   */
  private pushComboInput(f: Fighter, kind: "lmb" | "rmb"): boolean {
    if (f.comboSeqTimer <= 0) {
      f.comboSeq = "";
      f.seqFromDash = f.sprinting;
      f.seqAirborne = false;
    }
    f.comboSeq = (f.comboSeq + (kind === "lmb" ? "L" : "R")).slice(-6);
    f.comboSeqTimer = COMBO_CHAIN_WINDOW + 0.35;
    if (f.sprinting) f.seqFromDash = true;
    if (!f.onGround) f.seqAirborne = true;

    const seq = f.comboSeq;
    const air = !f.onGround;

    // --- Shedim: dash-jump, RMB then LMB in the air throws a slash wave ----
    if (
      f.classId === "shedim" &&
      air &&
      f.dashJumped &&
      seq.endsWith("RL") &&
      kind === "lmb"
    ) {
      this.throwSlashWave(f);
      f.comboSeq = "";
      return true;
    }

    // --- Kacper -------------------------------------------------------------
    if (f.classId === "kacper") {
      // Dash + LMB RMB RMB: guarded charge with Stoic.
      if (!air && f.seqFromDash && seq.endsWith("LRR")) {
        this.kacperCharge(f);
        f.comboSeq = "";
        return true;
      }
      // Dash-jump + LMB LMB LMB: aerial spin into a ground slam.
      if (air && f.dashJumped && seq.endsWith("LLL")) {
        this.kacperSlam(f);
        f.comboSeq = "";
        return true;
      }
      // Dash-jump + RMB RMB RMB: launcher.
      if (air && f.dashJumped && seq.endsWith("RRR")) {
        this.kacperLaunch(f);
        f.comboSeq = "";
        return true;
      }
    }
    return false;
  }

  /** Paragon's dash + hold RMB: a short braced dash granting Stoic. */
  private paragonBraceDash(f: Fighter) {
    f.state = "dash";
    f.stateTime = 0;
    f.dashTime = PARAGON_BRACE_DASH_TIME;
    f.dashPhasing = false;
    f.vx = f.facing * PARAGON_BRACE_DASH_SPEED;
    f.vy = 0;
    f.stoicTimer = Math.max(f.stoicTimer, PARAGON_BRACE_STOIC);
    f.cooldowns!["paragon-brace"] = PARAGON_BRACE_COOLDOWN;
    f.action = null;
    this.cb.onLog(`${f.name} braces through the dash — Stoic!`, "good");
    this.spawnText(f.x, f.y - f.h - 10, "STOIC", STOIC_GLOW, 16);
  }

  /** Shedim's free airborne slash wave. */
  private throwSlashWave(f: Fighter) {
    const cls = getClass(f.classId);
    f.state = "attack";
    f.stateTime = 0;
    f.action = {
      spec: { ...cls.lmb, id: "slash-wave", label: "Slash Wave" },
      elapsed: 0,
      spawned: true,
      chainIndex: 0,
      upHeld: false,
    };
    this.projectiles.push({
      id: `p${this.nextId++}`,
      ownerId: f.id,
      x: f.x + f.facing * 24,
      y: f.y - f.h * 0.55,
      vx: f.facing * SLASH_WAVE_SPEED,
      vy: 0,
      w: 46,
      h: 40,
      // Fixed damage, and free: it is a combo, not a skill.
      damage: SLASH_WAVE_DAMAGE,
      knockback: 7,
      effect: "none",
      effectDuration: 0,
      life: SLASH_WAVE_LIFE,
      label: "Slash Wave",
      color: cls.colors.aura,
    });
    this.cb.onLog(`${f.name} throws a Slash Wave!`, "big");
    this.spawnText(f.x, f.y - f.h - 10, "SLASH WAVE", cls.colors.aura, 16);
    this.shake = Math.max(this.shake, 8);
  }

  /** Kacper's shield-forward charge: Stoic plus a front guard. */
  private kacperCharge(f: Fighter) {
    f.state = "charge";
    f.stateTime = 0;
    f.dashTime = KACPER_CHARGE_TIME;
    f.vx = f.facing * KACPER_CHARGE_SPEED;
    f.stoicTimer = Math.max(f.stoicTimer, KACPER_CHARGE_TIME);
    f.frontGuard = KACPER_CHARGE_TIME;
    f.action = null;
    const cls = getClass(f.classId);
    const reach = f.attackRange * 1.1;
    this.hitboxes.push({
      ownerId: f.id,
      sourceId: "kacper-charge",
      kind: "skill",
      x: f.facing === 1 ? f.x : f.x - reach,
      y: f.y - f.h * 0.7,
      w: reach,
      h: f.h * 0.7,
      damage: this.computeDamage(f, { ...cls.rmb, damageMult: 1.6 }),
      knockback: 10,
      effect: "none",
      effectDuration: 0,
      life: KACPER_CHARGE_TIME,
      hit: new Set(),
      label: "Charge",
      facing: f.facing,
    });
    this.cb.onLog(`${f.name} charges behind his greatsword — Stoic!`, "big");
    this.spawnText(f.x, f.y - f.h - 10, "STOIC", STOIC_GLOW, 16);
  }

  /** Kacper's aerial spin into a 400% ground slam. */
  private kacperSlam(f: Fighter) {
    const cls = getClass(f.classId);
    f.state = "attack";
    f.stateTime = 0;
    f.vy = 6;
    f.action = {
      spec: {
        ...cls.lmb,
        id: "kacper-slam",
        label: "Skyfall Slam",
        castTime: 0.5,
        activeAt: 0.22,
        activeDuration: 0.14,
        damageMult: KACPER_SLAM_SCALING,
        rangeMult: 2.0,
        height: 70,
        knockback: 14,
        effect: "knockdown",
        selfCentered: true,
      },
      elapsed: 0,
      spawned: false,
      chainIndex: 0,
      upHeld: false,
    };
    this.cb.onLog(`${f.name} crashes down with a Skyfall Slam!`, "big");
    this.spawnText(f.x, f.y - f.h - 10, "SKYFALL", "#ffd36b", 18);
    this.shake = Math.max(this.shake, 16);
  }

  /** Kacper's aerial launcher. */
  private kacperLaunch(f: Fighter) {
    const cls = getClass(f.classId);
    f.state = "attack";
    f.stateTime = 0;
    f.action = {
      spec: {
        ...cls.rmb,
        id: "kacper-launch",
        label: "Rising Ruin",
        damageMult: 2.0,
        height: 64,
        knockback: 6,
        effect: "launch",
        effectDuration: 0.7,
      },
      elapsed: 0,
      spawned: false,
      chainIndex: 0,
      upHeld: false,
    };
    this.cb.onLog(`${f.name} hurls them skyward!`, "big");
  }

  /**
   * A bright crescent swipe swept in front of an attack, MapleStory-style:
   * a curved run of particles rather than a single blob, with every 4th one
   * white so the arc reads as a glinting edge instead of a flat streak.
   * Bigger chain hits (finishers, heavies, skills) get a wider, denser arc.
   */
  private spawnSlashArc(
    f: Fighter,
    reach: number,
    height: number,
    kind: "lmb" | "rmb" | "skill",
    chainIndex: number
  ) {
    const cls = getClass(f.classId);
    const color =
      kind === "skill" ? cls.colors.aura : kind === "rmb" ? cls.colors.trim : cls.colors.secondary;
    const dir = f.facing;
    const big = kind === "skill" || kind === "rmb" || chainIndex >= LMB_CHAIN_FINISHER;
    const steps = big ? 16 : 10;
    const arcR = Math.max(16, reach * (big ? 0.6 : 0.5));
    const vScale = Math.max(0.6, height / 70);
    const originX = f.x + dir * reach * 0.3;
    const originY = f.y - f.h * 0.55;
    // Swept overhand: high behind the attacker down to low in front.
    const startA = -Math.PI * 0.6;
    const endA = Math.PI * 0.2;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const a = startA + (endA - startA) * t;
      this.particles.push({
        x: originX + Math.cos(a) * arcR * dir,
        y: originY + Math.sin(a) * arcR * vScale,
        vx: Math.cos(a) * dir * (big ? 2.2 : 1.4),
        vy: Math.sin(a) * (big ? 2.2 : 1.4) - 0.3,
        life: 0.1 + t * 0.06,
        maxLife: 0.16,
        color: i % 4 === 0 ? "#ffffff" : color,
        size: big ? 4 : 3,
        gravity: 0,
      });
    }
  }

  /** The classic 8-point flash star that snaps a hit into focus. */
  private spawnImpactStar(x: number, y: number, color: string, size: number) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * 5,
        vy: Math.sin(a) * 5,
        life: 0.12,
        maxLife: 0.12,
        color: i % 2 === 0 ? "#ffffff" : color,
        size,
        gravity: 0,
      });
    }
  }

  private burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color,
        size: 2 + Math.random() * 3,
        gravity: 0.18,
      });
    }
    if (this.particles.length > 400) {
      this.particles.splice(0, this.particles.length - 400);
    }
  }

  private updateCamera() {
    // Frame both fighters in a duel; in campaign just lead the player.
    const other =
      this.mode === "duel" && this.enemy
        ? this.enemy.x
        : this.player.x + this.player.facing * 90;
    const mid = (this.player.x + other) / 2;
    const targetX = clamp(
      mid - this.viewport.w / 2,
      0,
      Math.max(0, this.map.width - this.viewport.w)
    );
    const targetY = clamp(
      this.player.y - this.viewport.h * 0.68,
      0,
      Math.max(0, this.map.height - this.viewport.h)
    );
    this.camera.x += (targetX - this.camera.x) * 0.16;
    this.camera.y += (targetY - this.camera.y) * 0.16;
  }

  private snapCamera() {
    this.camera.x = clamp(
      this.player.x - this.viewport.w / 2,
      0,
      Math.max(0, this.map.width - this.viewport.w)
    );
    this.camera.y = 0;
  }
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

/** Hitboxes are axis-aligned; fighters are a box around (x, y=feet). */
function overlapsFighter(hb: Hitbox, f: Fighter): boolean {
  const fx = f.x - f.w / 2;
  const fy = f.y - f.h;
  return (
    hb.x < fx + f.w && hb.x + hb.w > fx && hb.y < fy + f.h && hb.y + hb.h > fy
  );
}
