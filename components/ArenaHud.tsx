"use client";

import { useEffect, useRef, useState } from "react";
import { ClassPortrait } from "@/components/ClassPortrait";
import { getClass, skillKeyLabel } from "@/lib/arena/classes";
import {
  COMBOKILLER_MAX_STACKS,
  COMBOKILLER_PER_STACK,
  MANASTOP_COST,
  SHEDIM_BLAST_MANA_THRESHOLD,
} from "@/lib/arena/constants";
import type { ArenaInput } from "@/lib/arena/input";
import { playSound } from "@/lib/arena/sound";
import type { ClassId, CombatLogEntry, SkillSlot } from "@/lib/arena/types";

/** Which bound key a skill's slot corresponds to, for tap-to-cast on touch
 *  devices — see SkillBar's onClick below. */
function slotBindingCode(input: ArenaInput, slot: SkillSlot): string {
  const b = input.getBindings();
  switch (slot) {
    case "Q":
      return b.q;
    case "E":
      return b.e;
    case "R":
      return b.r;
    case "F":
      return b.f;
    case "SHIFT":
      return b.shift;
  }
}

export interface ArenaHudData {
  playerName: string;
  playerClass: string;
  playerHp: number;
  playerMaxHp: number;
  playerMana: number;
  playerMaxMana: number;
  /** Fraction shaved off skill cooldowns from gear, 0 if none equipped. */
  playerCdr?: number;
  enemyName: string;
  enemyClass: string;
  enemyHp: number;
  enemyMaxHp: number;
  enemyMana: number;
  enemyMaxMana: number;
  /** Campaign mobs have no mana bar to show. */
  hideEnemyMana?: boolean;
  cooldowns: Record<string, number>;
  comboStacks: number;
  /** Hits landed in a row without being hit back — see Fighter.hitStreak. */
  hitStreak: number;
  lmbChain: number;
  rmbChain: number;
  manaflowCharge: number;
  /** Seconds of Stoic remaining, 0 when inactive. */
  stoic?: number;
  /** Seconds of each elemental status remaining on the player, 0 when inactive. */
  burn?: number;
  poison?: number;
  freeze?: number;
  shock?: number;
  sprinting: boolean;
  state: string;
  /** Which town NPC the player is standing next to, if any — drives the
   *  "Talk" touch button (see TouchControls.tsx). Desktop just uses E. */
  nearNpc?: "Blacksmith" | "Vendor" | "Storage" | null;
}

export function ArenaHud({
  hud,
  logs,
  hideSkills,
}: {
  hud: ArenaHudData;
  logs: CombatLogEntry[];
  /** Campaign mode renders <SkillBar> itself, stacked above the camp-bar's
   *  XP row instead of pinned to the HUD's own bottom-right corner — see
   *  AdventureClient.tsx's .campaign-bottom-stack. */
  hideSkills?: boolean;
}) {
  const cls = getClass(hud.playerClass);
  const enemyCls = getClass(hud.enemyClass);
  const hpPct = hud.playerHp / hud.playerMaxHp;
  return (
    <div className="arena-hud">
      {hpPct <= 0.3 && (
        <div
          className="low-hp-vignette"
          style={{ opacity: Math.min(0.85, (0.3 - hpPct) / 0.3) }}
        />
      )}
      <div className="arena-top">
        <FighterPanel
          name={hud.playerName}
          classId={hud.playerClass as ClassId}
          className={cls.name}
          weapon={cls.weapon}
          aura={cls.colors.aura}
          hp={hud.playerHp}
          maxHp={hud.playerMaxHp}
          mana={hud.playerMana}
          maxMana={hud.playerMaxMana}
          manaLabel={cls.manaLabel}
          align="left"
        />
        <div className="arena-center">
          {hud.sprinting && <span className="arena-tag sprint">DASH ×2</span>}
          {!!hud.stoic && hud.stoic > 0 && (
            <span className="arena-tag stoic">STOIC {hud.stoic.toFixed(1)}s</span>
          )}
          {!!hud.burn && hud.burn > 0 && (
            <span className="arena-tag status-burn">BURNING {hud.burn.toFixed(1)}s</span>
          )}
          {!!hud.poison && hud.poison > 0 && (
            <span className="arena-tag status-poison">POISONED {hud.poison.toFixed(1)}s</span>
          )}
          {!!hud.freeze && hud.freeze > 0 && (
            <span className="arena-tag status-freeze">FROZEN {hud.freeze.toFixed(1)}s</span>
          )}
          {!!hud.shock && hud.shock > 0 && (
            <span className="arena-tag status-shock">SHOCKED {hud.shock.toFixed(1)}s</span>
          )}
          {hud.lmbChain > 0 && (
            <span className="arena-tag lmb">LMB ×{hud.lmbChain}</span>
          )}
          {hud.rmbChain > 0 && (
            <span className="arena-tag rmb">RMB ×{hud.rmbChain}</span>
          )}
          {hud.hitStreak >= 2 && (
            <>
              <span className={`arena-tag combo${hud.hitStreak >= 5 ? " combo-hot" : ""}`}>
                COMBO ×{hud.hitStreak}
              </span>
              <div className="strike-counter">
                <span className="strike-counter-num">{hud.hitStreak} STRIKES</span>
              </div>
            </>
          )}
          {hud.playerClass === "paragon" && hud.comboStacks > 0 && (
            <span className="arena-tag combo">
              Combokiller ×{hud.comboStacks} (+
              {Math.round(hud.comboStacks * COMBOKILLER_PER_STACK * 100)}%)
            </span>
          )}
          {hud.playerClass === "shedim" &&
            hud.playerMana > SHEDIM_BLAST_MANA_THRESHOLD && (
              <span className="arena-tag combo">VOID BLAST ARMED</span>
            )}
        </div>
        <FighterPanel
          name={hud.enemyName}
          classId={hud.enemyClass as ClassId}
          className={enemyCls.name}
          weapon={enemyCls.weapon}
          aura={enemyCls.colors.aura}
          hp={hud.enemyHp}
          maxHp={hud.enemyMaxHp}
          mana={hud.enemyMana}
          maxMana={hud.enemyMaxMana}
          manaLabel={enemyCls.manaLabel}
          hideMana={hud.hideEnemyMana}
          align="right"
        />
      </div>

      <div className="arena-bottom">
        {process.env.NODE_ENV !== "production" && logs.length > 0 ? (
          <div className="arena-log">
            {logs.map((l) => (
              <div key={l.id} className={`log-${l.tone}`}>
                {l.text}
              </div>
            ))}
          </div>
        ) : (
          <div />
        )}

        {!hideSkills && <SkillBar hud={hud} />}
      </div>
    </div>
  );
}

/**
 * The manaflow bar + skill row, split out of ArenaHud so campaign mode can
 * render it stacked above the camp-bar's XP row (see AdventureClient.tsx's
 * .campaign-bottom-stack) instead of pinned to the HUD's own bottom-right
 * corner — PVP duel mode has no camp-bar, so ArenaHud still renders this
 * itself there.
 */
export function SkillBar({ hud, input }: { hud: ArenaHudData; input?: ArenaInput }) {
  const cls = getClass(hud.playerClass);

  // Tracks which skills just came off a fresh activation (cooldown rising
  // from 0) so their icon can flash once, the same "you did a thing" tell
  // every juicy skill bar gives on cast.
  const prevCdRef = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, number>>({});

  useEffect(() => {
    const prev = prevCdRef.current;
    let justUsed: string[] | null = null;
    for (const s of cls.skills) {
      const cd = hud.cooldowns[s.id] ?? 0;
      const prevCd = prev[s.id] ?? 0;
      if (cd > prevCd + 0.001 && prevCd <= 0.001) {
        (justUsed ??= []).push(s.id);
      }
    }
    prevCdRef.current = hud.cooldowns;
    if (justUsed) {
      const now = Date.now();
      setFlash((f) => {
        const next = { ...f };
        for (const id of justUsed!) next[id] = now;
        return next;
      });
      playSound("skillCast");
    }
  }, [hud.cooldowns, cls.skills]);

  return (
    <div className="arena-skills">
      {hud.manaflowCharge > 0 && (
        <div className="manaflow">
          <div
            className="manaflow-fill"
            style={{ width: `${Math.min(100, hud.manaflowCharge * 100)}%` }}
          />
          <span>
            MANASTOP {hud.playerMana >= MANASTOP_COST ? "" : "— need 70 mana"}
          </span>
        </div>
      )}
      <div className="skill-row" style={{ "--aura": cls.colors.aura } as React.CSSProperties}>
        {cls.skills.map((s) => {
          const cd = hud.cooldowns[s.id] ?? 0;
          const poor = !!s.manaCost && hud.playerMana < s.manaCost;
          const ready = cd <= 0;
          const effectiveCooldown = s.cooldown * (1 - (hud.playerCdr ?? 0));
          const pct = effectiveCooldown > 0 ? Math.min(1, cd / effectiveCooldown) : 0;
          const justUsed = flash[s.id] && Date.now() - flash[s.id] < 400;
          return (
            <div
              key={s.id}
              className={`skill${poor ? " poor" : ""}${ready && !poor ? " ready" : ""}${
                justUsed ? " skill-flash" : ""
              }${input ? " skill-tappable" : ""}`}
              title={`${s.label} — ${s.description}`}
              // Tap-to-cast for touch controls: fires the same one-shot
              // press the bound key would, so it flows through readIntent()
              // exactly like a real Q/E/R/F/C press. No-op when `input`
              // isn't passed in (PVP duel mode's ArenaHud doesn't touch this).
              onClick={input ? () => input.touchTap(slotBindingCode(input, s.slot)) : undefined}
            >
              <span className="skill-key">{skillKeyLabel(s.slot)}</span>
              <span className="skill-name">{s.label}</span>
              {s.manaCost ? <span className="skill-cost">{s.manaCost}</span> : null}
              {cd > 0 && (
                <>
                  <div
                    className="skill-sweep"
                    style={{
                      background: `conic-gradient(rgba(5,7,12,0.86) ${pct * 360}deg, transparent ${pct * 360}deg)`,
                    }}
                  />
                  <span className="skill-cd">{cd.toFixed(1)}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FighterPanel({
  name,
  classId,
  className,
  weapon,
  aura,
  hp,
  maxHp,
  mana,
  maxMana,
  manaLabel,
  hideMana,
  align,
}: {
  name: string;
  classId: ClassId;
  className: string;
  weapon: string;
  aura: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  manaLabel: string;
  hideMana?: boolean;
  align: "left" | "right";
}) {
  const hpPct = hp / maxHp;
  return (
    <div
      className={`fighter-panel ${align}${hpPct <= 0.25 ? " critical" : ""}`}
      style={{ "--aura": aura } as React.CSSProperties}
    >
      <div className="fighter-head">
        <ClassPortrait classId={classId} aura={aura} size={38} />
        <span className="fighter-id">
          <strong>{name}</strong>
          <span>
            {className} · {weapon}
          </span>
        </span>
      </div>
      <div className="bar hpbar">
        <div className="bar-fill" style={{ width: `${hpPct * 100}%` }} />
        <div className="bar-text">
          {Math.round(hp)} / {maxHp}
        </div>
      </div>
      {!hideMana && (
        <div className="bar manabar">
          <div
            className="bar-fill"
            style={{ width: `${(mana / maxMana) * 100}%` }}
          />
          <div className="bar-text">
            {manaLabel} {Math.round(mana)} / {maxMana}
          </div>
        </div>
      )}
    </div>
  );
}
