import { getClass } from "./classes";
import { DT, MANASTOP_COST, MANASTOP_HOLD } from "./constants";
import { emptyIntent, type Intent } from "./engine";
import { ARENA, groundAt } from "./map";
import type { Fighter } from "./types";

export type Difficulty = "calm" | "normal" | "brutal";

const TUNING: Record<Difficulty, { react: number; aggression: number; skill: number }> = {
  calm: { react: 0.55, aggression: 0.45, skill: 0.25 },
  normal: { react: 0.3, aggression: 0.7, skill: 0.55 },
  brutal: { react: 0.14, aggression: 0.92, skill: 0.85 },
};

/**
 * A simple but active opponent. It closes distance, runs LMB/RMB chains,
 * spends skills when they are up, jumps to reach the platform, and will burn
 * Manastop to escape a combo just like a human can.
 */
export class ArenaAI {
  private decisionTimer = 0;
  private attackTimer = 0;
  private manaflowTimer = 0;
  private jumpTimer = 0;
  private jumpHoldTimer = 0;
  private wantSprint = false;
  private difficulty: Difficulty;

  constructor(difficulty: Difficulty = "normal") {
    this.difficulty = difficulty;
  }

  think(self: Fighter, foe: Fighter): Intent {
    const intent = emptyIntent();
    const t = TUNING[this.difficulty];

    if (self.state === "dead" || foe.state === "dead") return intent;

    this.decisionTimer -= DT;
    this.attackTimer -= DT;
    this.jumpTimer -= DT;
    this.jumpHoldTimer -= DT;
    // Once a jump is thrown, keep "holding" it through the rise — engine.ts
    // short-hops any jump not marked jumpHeld, which real key-holding
    // players don't hit but a single-tick intent otherwise always would.
    if (this.jumpHoldTimer > 0) intent.jumpHeld = true;

    // No input while it has lost control.
    if (
      self.knockdownTimer > 0 ||
      self.stunTimer > 0 ||
      self.hitstun > 0 ||
      self.state === "dash"
    ) {
      // Being comboed: hold both buttons to build toward Manastop.
      if (self.hitstun > 0 && self.mana >= MANASTOP_COST) {
        this.manaflowTimer += DT;
        intent.lmbHeld = true;
        intent.rmbHeld = true;
        intent.bothHeldTime = this.manaflowTimer;
      }
      return intent;
    }
    if (self.hitstun <= 0 && this.manaflowTimer > 0 && this.manaflowTimer < MANASTOP_HOLD) {
      this.manaflowTimer = 0;
    }

    const cls = getClass(self.classId);
    const dx = foe.x - self.x;
    const dist = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;
    const range = cls.attackRange;

    // Face and close on the target.
    if (dist > range * 0.85) {
      intent.moveX = dir;
      // Sprint when far away, which also enables Shedim's running RMB stun.
      this.wantSprint = dist > range * 3;
      intent.sprint = this.wantSprint;
    } else if (dist < range * 0.35) {
      intent.moveX = -dir * 0.4;
    }

    // Don't walk off the ledge into the gap. If the target is on the far side,
    // take a running jump for the platform; otherwise hold position.
    if (intent.moveX !== 0 && self.onGround) {
      const ahead = groundAt(ARENA, self.x + Math.sign(intent.moveX) * 70);
      if (ahead === null) {
        const targetAcross =
          groundAt(ARENA, foe.x) !== null &&
          Math.sign(foe.x - self.x) === Math.sign(intent.moveX);
        if (targetAcross || foe.y < self.y - 40) {
          intent.sprint = true;
          intent.up = true;
          intent.jump = true;
          intent.jumpHeld = true;
          this.jumpHoldTimer = 0.5;
        } else {
          intent.moveX = 0;
          intent.sprint = false;
        }
      }
    }

    // Climb to the target if they are meaningfully above.
    const above = self.y - foe.y;
    if (above > 60 && this.jumpTimer <= 0 && self.onGround) {
      intent.up = true;
      intent.jump = true;
      intent.jumpHeld = true;
      this.jumpTimer = 1.2;
      this.jumpHoldTimer = 0.5;
    }
    // Drop back down if the target is well below.
    if (above < -90 && self.onGround && Math.random() < 0.02) {
      intent.down = true;
      intent.dropThrough = true;
    }

    const inRange = dist <= range * 1.05 && Math.abs(self.y - foe.y) < 70;
    if (!inRange) return intent;

    // Skills, when off cooldown and affordable.
    if (Math.random() < t.skill * 0.06) {
      const affordable = cls.skills.filter(
        (s) =>
          (self.cooldowns[s.id] ?? 0) <= 0 &&
          (!s.manaCost || self.mana >= s.manaCost)
      );
      if (affordable.length > 0) {
        const pick = affordable[Math.floor(Math.random() * affordable.length)];
        switch (pick.slot) {
          case "Q": intent.q = true; return intent;
          case "E": intent.e = true; return intent;
          case "R": intent.r = true; return intent;
          case "F": intent.f = true; return intent;
          case "SHIFT": intent.shift = true; return intent;
        }
      }
    }

    // Basic attack cadence.
    if (this.attackTimer <= 0 && Math.random() < t.aggression) {
      const heavy = Math.random() < 0.45;
      if (heavy) {
        intent.rmb = true;
        // Shedim holds the sprint into RMB RMB for the stun.
        intent.sprint = self.classId === "shedim" && self.rmbChain === 1;
        this.attackTimer = (self.classId === "shedim" ? 0.39 : 0.35) + t.react * 0.4;
      } else {
        intent.lmb = true;
        // Shedim holds W on the third slash to convert it into a launcher.
        intent.up = self.classId === "shedim" && self.lmbChain === 2;
        this.attackTimer = 0.22 + t.react * 0.3;
      }
    }

    return intent;
  }
}
