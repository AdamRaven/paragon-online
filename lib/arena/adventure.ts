import { getClass } from "./classes";
import { DT, WALK_SPEED } from "./constants";
import { ArenaEngine, emptyIntent, type ArenaCallbacks, type Intent } from "./engine";
import { MOB_TYPES, getStage, mobAttackSpec, type MobType, type Stage } from "./mobs";
import { itemName, rollDrops, type Item } from "./items";
import {
  deriveArenaStats,
  expToNext,
  expWithLevelPenalty,
  grantExp,
  type AdventureSave,
  type LevelUpResult,
} from "./progression";
import type { Fighter } from "./types";

const MOB_RESPAWN = 7;
const PLAYER_RESPAWN = 2.5;

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
  private mobBrains = new Map<string, MobBrain>();
  private acb: AdventureCallbacks;
  private mobSeq = 0;

  constructor(save: AdventureSave, cb: AdventureCallbacks) {
    super(save.classId as "paragon" | "shedim", "shedim", cb);
    this.mode = "adventure";
    this.acb = cb;
    this.save = save;
    this.stage = getStage(save.stage);
    this.map = this.stage.map;

    // Drop the duel rival; this mode is player versus mobs.
    this.fighters = [this.fighters[0]];
    const p = this.fighters[0];
    p.spawnX = this.map.spawnA.x;
    p.spawnY = this.map.spawnA.y;
    p.x = p.spawnX;
    p.y = p.spawnY;

    this.applyProgression();
    this.player.hp = this.player.maxHp;
    this.spawnStageMobs();
  }

  /** Re-applies level and stat bonuses to the player's live fighter. */
  applyProgression() {
    const cls = getClass(this.save.classId);
    const d = deriveArenaStats(cls, this.save.level, this.save.stats, this.save.equipped);
    const p = this.fighters[0];
    const prevMax = p.maxHp;
    p.maxHp = d.maxHp;
    p.maxMana = d.maxMana;
    p.attackPower = d.attackPower;
    p.speedMult = d.speedMult;
    p.attackSpeed = d.attackSpeed;
    p.level = this.save.level;
    p.name = cls.name;
    p.hp = Math.min(p.maxHp, p.hp + Math.max(0, d.maxHp - prevMax));
    p.mana = Math.min(p.mana, p.maxMana);
  }

  /** True when the player is close enough to the merchant to trade. */
  get nearMerchant(): boolean {
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

  private spawnStageMobs() {
    if (this.stage.isTown) return;
    for (const spawn of this.stage.spawns) {
      const type = MOB_TYPES[spawn.typeId];
      if (type) this.spawnMob(type, spawn.x);
    }
  }

  private spawnMob(type: MobType, x: number): Fighter {
    const base = this.fighters[0];
    const mob: Fighter = {
      ...base,
      id: `m${this.mobSeq++}`,
      name: type.name,
      isPlayer: false,
      isMob: true,
      team: 1,
      mobTypeId: type.id,
      level: type.level,
      expValue: type.expValue,
      x,
      y: this.map.spawnA.y,
      spawnX: x,
      spawnY: this.map.spawnA.y,
      vx: 0,
      vy: 0,
      w: type.w,
      h: type.h,
      hp: type.maxHp,
      maxHp: type.maxHp,
      mana: 0,
      maxMana: 1,
      attackPower: type.damage,
      attackRange: type.range,
      speedMult: type.speed / WALK_SPEED,
      attackSpeed: 1,
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

  /** Drives the player from input and every mob from its own brain. */
  stepAdventure(playerIntent: Intent) {
    if (this.over) return;

    for (const mob of this.fighters) {
      if (!mob.isMob) continue;
      const brain = this.mobBrains.get(mob.id);
      if (brain) brain.cache = brain.think(mob, this.player, this);
    }

    this.stepAll(playerIntent, (f) => this.mobBrains.get(f.id)?.cache ?? emptyIntent());

    this.handleDeaths();
  }

  private handleDeaths() {
    for (const f of this.fighters) {
      if (f.isMob) {
        if (f.hp <= 0 && f.state !== "dead") {
          f.state = "dead";
          f.deadTimer = MOB_RESPAWN;
          this.save.kills += 1;

          const gained = expWithLevelPenalty(
            this.save.level,
            f.level,
            f.expValue
          );
          const before = this.save.level;
          const result = grantExp(this.save, gained);
          this.spawnKillFx(f, gained);
          this.acb.onExp(gained, f.name, result);

          // Drops go straight into the backpack.
          const type = MOB_TYPES[f.mobTypeId!];
          const drops = rollDrops(f.level, !!type?.isBoss);
          if (drops.length) {
            this.save.inventory.push(...drops);
            for (let d = 0; d < drops.length; d++) {
              this.pushFloating(
                f.x + (d - (drops.length - 1) / 2) * 26,
                f.y - f.h - 24 - d * 10,
                itemName(drops[d]),
                "#fcd34d",
                14
              );
            }
            this.acb.onLoot(drops);
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
          if (f.deadTimer <= 0) this.reviveMob(f);
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
      } else if (f.state === "dead") {
        f.deadTimer -= DT;
        if (f.deadTimer <= 0) this.revivePlayer(f);
      }
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
    this.save.stage = index;
    this.stage = stage;
    this.map = stage.map;

    this.fighters = [this.fighters[0]];
    this.mobBrains.clear();
    this.hitboxes = [];
    this.projectiles = [];
    this.blackHoles = [];

    const p = this.fighters[0];
    p.x = this.map.spawnA.x;
    p.y = this.map.spawnA.y;
    p.vx = 0;
    p.vy = 0;
    p.state = "idle";
    this.spawnStageMobs();
    this.acb.onLog(`Entered ${stage.name}.`, "good");
    return true;
  }

  get expNext() {
    return expToNext(this.save.level);
  }
}

/** Ground-bound mob behaviour: patrol, chase, swing, never walk off a ledge. */
class MobBrain {
  cache: Intent = emptyIntent();
  private type: MobType;
  private patrolDir: 1 | -1 = 1;
  private attackCd = 0;
  private repathCd = 0;

  constructor(type: MobType) {
    this.type = type;
  }

  think(self: Fighter, player: Fighter, engine: AdventureEngine): Intent {
    const i = emptyIntent();
    if (self.state === "dead" || player.state === "dead") return i;
    if (
      self.knockdownTimer > 0 ||
      self.stunTimer > 0 ||
      self.hitstun > 0 ||
      self.action
    ) {
      return i;
    }

    this.attackCd -= DT;
    this.repathCd -= DT;

    const dx = player.x - self.x;
    const dist = Math.abs(dx);
    const sameHeight = Math.abs(self.y - player.y) < 90;
    const dir: 1 | -1 = dx > 0 ? 1 : -1;

    if (dist < this.type.aggro && sameHeight && player.hp > 0) {
      if (dist > this.type.range * 0.8) {
        i.moveX = dir;
      } else if (this.attackCd <= 0) {
        i.lmb = true;
        this.attackCd = this.type.windup + this.type.recover + 0.25;
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

    // Never walk into a gap.
    if (i.moveX !== 0 && self.onGround) {
      const ahead = engine.groundAtX(self.x + Math.sign(i.moveX) * 55);
      if (ahead === null) {
        i.moveX = 0;
        this.patrolDir = (-this.patrolDir) as 1 | -1;
      }
    }
    return i;
  }
}
