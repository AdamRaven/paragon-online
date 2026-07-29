"use client";

import { getClass } from "@/lib/arena/classes";
import {
  COMBOKILLER_MAX_STACKS,
  COMBOKILLER_PER_STACK,
  MANASTOP_COST,
  SHEDIM_BLAST_MANA_THRESHOLD,
} from "@/lib/arena/constants";
import type { CombatLogEntry } from "@/lib/arena/types";

export interface ArenaHudData {
  playerName: string;
  playerClass: string;
  playerHp: number;
  playerMaxHp: number;
  playerMana: number;
  playerMaxMana: number;
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
  lmbChain: number;
  rmbChain: number;
  manaflowCharge: number;
  /** Seconds of Stoic remaining, 0 when inactive. */
  stoic?: number;
  sprinting: boolean;
  state: string;
}

export function ArenaHud({
  hud,
  logs,
}: {
  hud: ArenaHudData;
  logs: CombatLogEntry[];
}) {
  const cls = getClass(hud.playerClass);
  const enemyCls = getClass(hud.enemyClass);

  return (
    <div className="arena-hud">
      <div className="arena-top">
        <FighterPanel
          name={hud.playerName}
          className={cls.name}
          weapon={cls.weapon}
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
          {hud.lmbChain > 0 && (
            <span className="arena-tag lmb">LMB ×{hud.lmbChain}</span>
          )}
          {hud.rmbChain > 0 && (
            <span className="arena-tag rmb">RMB ×{hud.rmbChain}</span>
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
          className={enemyCls.name}
          weapon={enemyCls.weapon}
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
        {logs.length > 0 ? (
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
          <div className="skill-row">
            {cls.skills.map((s) => {
              const cd = hud.cooldowns[s.id] ?? 0;
              const poor = !!s.manaCost && hud.playerMana < s.manaCost;
              return (
                <div
                  key={s.id}
                  className={`skill${poor ? " poor" : ""}`}
                  title={`${s.label} — ${s.description}`}
                >
                  <span className="skill-key">{s.slot}</span>
                  <span className="skill-name">{s.label}</span>
                  {s.manaCost ? (
                    <span className="skill-cost">{s.manaCost}</span>
                  ) : null}
                  {cd > 0 && <span className="skill-cd">{cd.toFixed(1)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FighterPanel({
  name,
  className,
  weapon,
  hp,
  maxHp,
  mana,
  maxMana,
  manaLabel,
  hideMana,
  align,
}: {
  name: string;
  className: string;
  weapon: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  manaLabel: string;
  hideMana?: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`fighter-panel ${align}`}>
      <div className="fighter-head">
        <strong>{name}</strong>
        <span>
          {className} · {weapon}
        </span>
      </div>
      <div className="bar hpbar">
        <div className="bar-fill" style={{ width: `${(hp / maxHp) * 100}%` }} />
        <div className="bar-text">
          {hp} / {maxHp}
        </div>
      </div>
      {!hideMana && (
        <div className="bar manabar">
          <div
            className="bar-fill"
            style={{ width: `${(mana / maxMana) * 100}%` }}
          />
          <div className="bar-text">
            {manaLabel} {mana} / {maxMana}
          </div>
        </div>
      )}
    </div>
  );
}
