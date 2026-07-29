"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArenaHud, type ArenaHudData } from "@/components/ArenaHud";
import { InventoryPanel } from "@/components/InventoryPanel";
import { MerchantPanel } from "@/components/MerchantPanel";
import {
  STONE_PRICE,
  attemptEnhance,
  base,
  itemName,
  itemValue,
  type EquipSlot,
  type Item,
} from "@/lib/arena/items";
import { AdventureEngine } from "@/lib/arena/adventure";
import { CLASSES, getClass } from "@/lib/arena/classes";
import { DT, MANASTOP_HOLD } from "@/lib/arena/constants";
import { emptyIntent, type Intent } from "@/lib/arena/engine";
import { ArenaInput } from "@/lib/arena/input";
import { STAGES } from "@/lib/arena/mobs";
import {
  STAT_META,
  clearAdventure,
  createAdventureSave,
  deriveArenaStats,
  expToNext,
  loadAdventure,
  saveAdventure,
  type AdventureSave,
  type StatKey,
} from "@/lib/arena/progression";
import { PIXEL_SCALE, artSize, worldViewSize } from "@/lib/arena/pixel";
import { renderArena } from "@/lib/arena/render";
import type { ClassId, CombatLogEntry } from "@/lib/arena/types";

const MAX_LOGS = 6;

export function AdventureClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AdventureEngine | null>(null);
  const inputRef = useRef<ArenaInput | null>(null);
  const rafRef = useRef(0);
  const logIdRef = useRef(0);

  const [save, setSave] = useState<AdventureSave | null>(null);
  const [booted, setBooted] = useState(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState<ArenaHudData | null>(null);
  const [exp, setExp] = useState({ exp: 0, next: 1, level: 1, points: 0 });
  const [logs, setLogs] = useState<CombatLogEntry[]>([]);
  const [panel, setPanel] = useState<
    "none" | "sheet" | "map" | "inventory" | "merchant"
  >("none");
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  /** Bumped whenever the save mutates, to re-render the panels. */
  const [rev, setRev] = useState(0);

  const pushLog = useCallback((text: string, tone: CombatLogEntry["tone"]) => {
    setLogs((prev) => [...prev, { id: logIdRef.current++, text, tone }].slice(-MAX_LOGS));
  }, []);

  useEffect(() => {
    setSave(loadAdventure());
    setBooted(true);
  }, []);

  // ------------------------------------------------------------- engine boot
  useEffect(() => {
    if (!started || !save) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const input = new ArenaInput();
    input.attach(canvas);
    inputRef.current = input;

    const engine = new AdventureEngine(save, {
      onLog: pushLog,
      onEnd: () => {},
      onPlayerDeath: () => {},
      onExp: () => {},
      onLoot: (items) => {
        for (const it of items) pushLog(`Looted ${itemName(it)}.`, "good");
        setRev((r) => r + 1);
      },
    });
    engineRef.current = engine;

    const resize = () => {
      const w = canvas.parentElement?.clientWidth ?? window.innerWidth;
      const h = canvas.parentElement?.clientHeight ?? window.innerHeight;
      const art = artSize(w, h);
      // Backing store in art pixels; CSS size is an exact integer multiple so
      // every art pixel lands on the same number of screen pixels.
      canvas.width = art.w;
      canvas.height = art.h;
      canvas.style.width = `${art.w * PIXEL_SCALE}px`;
      canvas.style.height = `${art.h * PIXEL_SCALE}px`;
      ctx.imageSmoothingEnabled = false;
      // The camera works in world units, which the pixel zoom scales down.
      const view = worldViewSize(w, h);
      engine.setViewport(view.w, view.h);
    };
    resize();
    window.addEventListener("resize", resize);
    canvas.focus();

    let last = performance.now();
    let acc = 0;
    let hudTick = 0;
    let saveTick = 0;

    const frame = (now: number) => {
      acc += Math.min(200, now - last);
      last = now;
      let guard = 0;
      while (acc >= DT * 1000 && guard++ < 8) {
        engine.stepAdventure(readIntent(input));
        input.step(DT);
        acc -= DT * 1000;
      }
      renderArena(ctx, engine);

      if (++hudTick >= 4) {
        hudTick = 0;
        setHud(buildHud(engine, input));
        setExp({
          exp: engine.save.exp,
          next: expToNext(engine.save.level),
          level: engine.save.level,
          points: engine.save.statPoints,
        });
      }
      if (++saveTick >= 240) {
        saveTick = 0;
        saveAdventure(engine.save);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
      saveAdventure(engine.save);
      input.dispose();
      inputRef.current = null;
      engineRef.current = null;
    };
    // The engine owns the save object once created; re-running would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, pushLog]);

  // Panel hotkeys: C for the character sheet, M for stage travel.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyC") setPanel((p) => (p === "sheet" ? "none" : "sheet"));
      else if (e.code === "KeyM") setPanel((p) => (p === "map" ? "none" : "map"));
      else if (e.code === "KeyI") {
        setRev((r) => r + 1);
        setPanel((p) => (p === "inventory" ? "none" : "inventory"));
      } else if (e.code === "KeyE") {
        // E doubles as "talk" when standing at the merchant's stall.
        const eng = engineRef.current;
        if (eng?.nearMerchant) {
          setShopMsg(null);
          setRev((r) => r + 1);
          setPanel((p) => (p === "merchant" ? "none" : "merchant"));
        }
      } else if (e.code === "Escape") setPanel("none");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started]);

  const spend = (stat: StatKey) => {
    const e = engineRef.current;
    if (!e || e.save.statPoints <= 0) return;
    e.save.statPoints -= 1;
    e.save.stats[stat] += 1;
    e.applyProgression();
    saveAdventure(e.save);
    setSave({ ...e.save });
    setExp((p) => ({ ...p, points: e.save.statPoints }));
  };

  const mutate = (fn: (e: AdventureEngine) => void) => {
    const e = engineRef.current;
    if (!e) return;
    fn(e);
    e.applyProgression();
    saveAdventure(e.save);
    setSave({ ...e.save });
    setRev((r) => r + 1);
  };

  const equip = (item: Item) =>
    mutate((e) => {
      const slot = base(item.baseId).slot;
      if (!slot) return;
      const current = e.save.equipped[slot];
      e.save.inventory = e.save.inventory.filter((i) => i.uid !== item.uid);
      if (current) e.save.inventory.push(current);
      e.save.equipped[slot] = item;
      pushLog(`Equipped ${itemName(item)}.`, "good");
    });

  const unequip = (slot: EquipSlot) =>
    mutate((e) => {
      const item = e.save.equipped[slot];
      if (!item) return;
      e.save.inventory.push(item);
      delete e.save.equipped[slot];
    });

  const sellOne = (item: Item) =>
    mutate((e) => {
      const worth = itemValue(item);
      e.save.inventory = e.save.inventory.filter((i) => i.uid !== item.uid);
      e.save.gold += worth;
      setShopMsg(`Sold ${itemName(item)} for ${worth}g.`);
    });

  const sellAllTrash = () =>
    mutate((e) => {
      const trash = e.save.inventory.filter((i) => base(i.baseId).kind === "trash");
      const worth = trash.reduce((n, i) => n + itemValue(i), 0);
      e.save.inventory = e.save.inventory.filter((i) => base(i.baseId).kind !== "trash");
      e.save.gold += worth;
      setShopMsg(`Sold ${trash.length} trash items for ${worth}g.`);
    });

  const buyStones = (n: number) =>
    mutate((e) => {
      const cost = STONE_PRICE * n;
      if (e.save.gold < cost) return;
      e.save.gold -= cost;
      e.save.stones += n;
      setShopMsg(`Bought ${n} stone${n > 1 ? "s" : ""} for ${cost}g.`);
    });

  const enhance = (item: Item) =>
    mutate((e) => {
      if (e.save.stones <= 0) {
        setShopMsg("You have no enhancement stones.");
        return;
      }
      e.save.stones -= 1;
      const r = attemptEnhance(item);
      if (r.ok) {
        setShopMsg(`Success! ${base(item.baseId).name} is now +${r.to}.`);
        pushLog(`${base(item.baseId).name} enhanced to +${r.to}!`, "big");
      } else if (r.downgraded) {
        setShopMsg(`Failed — it dropped to +${r.to}.`);
        pushLog(`Enhancement failed: down to +${r.to}.`, "bad");
      } else {
        setShopMsg(`Failed, but it held at +${r.to}.`);
      }
    });

  const travel = (index: number) => {
    const e = engineRef.current;
    if (!e) return;
    if (e.changeStage(index)) {
      saveAdventure(e.save);
      setSave({ ...e.save });
      setPanel("none");
    }
  };

  if (!booted) return <main className="landing" />;

  if (!started) {
    return (
      <CharacterGate
        save={save}
        onStart={(s) => {
          saveAdventure(s);
          setSave(s);
          setStarted(true);
        }}
        onWipe={() => {
          clearAdventure();
          setSave(null);
        }}
      />
    );
  }

  const live = engineRef.current?.save ?? save!;
  const expPct = Number.isFinite(exp.next) ? (exp.exp / exp.next) * 100 : 100;

  return (
    <div className="arena-stage campaign">
      <canvas ref={canvasRef} tabIndex={0} />
      {hud && <ArenaHud hud={hud} logs={logs} />}

      {/* Campaign-only overlay: level, EXP bar and the panel buttons. */}
      <div className="camp-bar">
        <div className="camp-level">
          LV {exp.level}
          {exp.points > 0 && <span className="pip">+{exp.points}</span>}
        </div>
        <div className="bar expbar">
          <div className="bar-fill" style={{ width: `${expPct}%` }} />
          <div className="bar-text">
            {Number.isFinite(exp.next) ? `${exp.exp} / ${exp.next} EXP` : "MAX LEVEL"}
          </div>
        </div>
        <span className="camp-purse">{live.gold}g · {live.stones}◆</span>
        <button className="btn btn-ghost camp-btn" onClick={() => { setRev((r) => r + 1); setPanel("inventory"); }}>
          Bag (I)
        </button>
        <button className="btn btn-ghost camp-btn" onClick={() => setPanel("sheet")}>
          Character (C)
        </button>
        <button className="btn btn-ghost camp-btn" onClick={() => setPanel("map")}>
          Stages (M)
        </button>
      </div>

      {panel === "sheet" && (
        <div className="overlay" onClick={() => setPanel("none")}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <h2>{getClass(live.classId).name}</h2>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                  Level {live.level} · {live.kills} kills · {live.deaths} deaths
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setPanel("none")}>
                Close
              </button>
            </div>
            <div style={{ marginBottom: 8, fontSize: 12, color: "var(--muted)" }}>
              Unspent points:{" "}
              <strong style={{ color: live.statPoints > 0 ? "var(--exp)" : "var(--muted)" }}>
                {live.statPoints}
              </strong>
            </div>
            {(Object.keys(STAT_META) as StatKey[]).map((k) => (
              <div className="stat-row" key={k}>
                <div className="stat-key" style={{ color: STAT_META[k].color }}>
                  {STAT_META[k].short}
                </div>
                <div className="stat-info">
                  {STAT_META[k].label}
                  <small>{STAT_META[k].blurb}</small>
                </div>
                <div className="stat-val">{live.stats[k]}</div>
                <button
                  className="plus"
                  disabled={live.statPoints <= 0}
                  onClick={() => spend(k)}
                  aria-label={`Increase ${STAT_META[k].label}`}
                >
                  +
                </button>
              </div>
            ))}
            <DerivedPanel save={live} />
          </div>
        </div>
      )}

      {panel === "inventory" && (
        <InventoryPanel
          key={rev}
          save={live}
          onEquip={equip}
          onUnequip={unequip}
          onClose={() => setPanel("none")}
        />
      )}

      {panel === "merchant" && (
        <MerchantPanel
          key={rev}
          save={live}
          onSellAll={sellAllTrash}
          onSellOne={sellOne}
          onBuyStones={buyStones}
          onEnhance={enhance}
          lastResult={shopMsg}
          onClose={() => setPanel("none")}
        />
      )}

      {panel === "map" && (
        <div className="overlay" onClick={() => setPanel("none")}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Stages</h2>
              <button className="btn btn-ghost" onClick={() => setPanel("none")}>
                Close
              </button>
            </div>
            <div className="zone-list">
              {STAGES.map((st, i) => {
                const locked = live.level < st.requiredLevel;
                const here = live.stage === i;
                return (
                  <button
                    key={st.id}
                    className={`zone-option${here ? " current" : ""}`}
                    disabled={locked || here}
                    onClick={() => travel(i)}
                  >
                    <span>
                      <strong>{st.name}</strong>
                      <small>{st.subtitle}</small>
                    </span>
                    <span className={`badge${locked ? " warn" : ""}`}>
                      {here ? "HERE" : locked ? `LV ${st.requiredLevel}` : "TRAVEL"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="hint" style={{ marginTop: 14 }}>
              Enemies more than two levels below you give reduced experience, so
              move on once a stage stops paying out.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DerivedPanel({ save }: { save: AdventureSave }) {
  const d = deriveArenaStats(getClass(save.classId), save.level, save.stats);
  const cls = getClass(save.classId);
  return (
    <div className="derived">
      <div>
        <span>Health</span>
        <strong>{d.maxHp}</strong>
      </div>
      <div>
        <span>{cls.manaLabel}</span>
        <strong>{d.maxMana}</strong>
      </div>
      <div>
        <span>Attack power</span>
        <strong>{d.attackPower.toFixed(1)}</strong>
      </div>
      <div>
        <span>Move speed</span>
        <strong>{d.speedMult.toFixed(2)}x</strong>
      </div>
      <div>
        <span>Attack speed</span>
        <strong>{d.attackSpeed.toFixed(2)}x</strong>
      </div>
      <div>
        <span>Power</span>
        <strong>{d.power.toLocaleString()}</strong>
      </div>
    </div>
  );
}

function readIntent(input: ArenaInput): Intent {
  const i = emptyIntent();
  i.moveX = input.moveX();
  i.sprint = input.isSprinting();
  i.up = input.isDown("KeyW");
  i.down = input.isDown("KeyS");
  const spaceEdge = input.wasPressed("Space");
  const wEdge = input.wasPressed("KeyW");
  const sEdge = input.wasPressed("KeyS");
  const space = input.isDown("Space");
  i.jump = (spaceEdge && i.up) || (wEdge && space);
  // Holding EITHER key sustains the jump; only releasing both shortens it.
  i.jumpHeld = space || i.up;
  i.dropThrough = (spaceEdge && i.down) || (sEdge && space);
  i.lmb = input.consumeLmb();
  i.rmb = input.consumeRmb();
  i.lmbHeld = input.lmbDown();
  i.rmbHeld = input.rmbDown();
  i.bothHeldTime = input.bothButtonsHeld;
  i.q = input.consume("KeyQ");
  i.e = input.consume("KeyE");
  i.r = input.consume("KeyR");
  i.f = input.consume("KeyF");
  i.shift = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
  return i;
}

function buildHud(engine: AdventureEngine, input: ArenaInput): ArenaHudData {
  const p = engine.player;
  const foe = engine.nearestFoe(p);
  const hasFoe = foe !== p && foe.state !== "dead";
  return {
    playerName: p.name,
    playerClass: p.classId,
    playerHp: Math.round(p.hp),
    playerMaxHp: p.maxHp,
    playerMana: Math.round(p.mana),
    playerMaxMana: p.maxMana,
    enemyName: hasFoe ? `${foe.name} Lv${foe.level}` : engine.stage.name,
    enemyClass: p.classId,
    enemyHp: hasFoe ? Math.round(foe.hp) : 0,
    enemyMaxHp: hasFoe ? foe.maxHp : 1,
    enemyMana: 0,
    enemyMaxMana: 1,
    hideEnemyMana: true,
    cooldowns: { ...p.cooldowns },
    comboStacks: p.comboKillerStacks,
    lmbChain: p.lmbChain,
    rmbChain: p.rmbChain,
    manaflowCharge: input.bothButtonsHeld / MANASTOP_HOLD,
    sprinting: p.sprinting,
    stoic: p.stoicTimer,
    state: p.state,
  };
}

function CharacterGate({
  save,
  onStart,
  onWipe,
}: {
  save: AdventureSave | null;
  onStart: (s: AdventureSave) => void;
  onWipe: () => void;
}) {
  const [picked, setPicked] = useState<ClassId>("paragon");
  const ids = Object.keys(CLASSES) as ClassId[];

  if (save) {
    const cls = getClass(save.classId);
    const d = deriveArenaStats(cls, save.level, save.stats);
    return (
      <main className="landing">
        <div className="landing-inner">
          <header>
            <h1 className="title">CAMPAIGN</h1>
            <p className="tagline">
              The same 2D arena, the same skills and movement — now with mobs,
              experience and levels.
            </p>
          </header>
          <section className="card">
            <h2 className="section-title">Your fighter</h2>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong style={{ fontSize: 20 }}>{cls.name}</strong>
              <span style={{ color: "var(--accent)" }}>Level {save.level}</span>
            </div>
            <div className="derived" style={{ marginTop: 14 }}>
              <div>
                <span>Power</span>
                <strong>{d.power.toLocaleString()}</strong>
              </div>
              <div>
                <span>Kills</span>
                <strong>{save.kills}</strong>
              </div>
              <div>
                <span>Deaths</span>
                <strong>{save.deaths}</strong>
              </div>
            </div>
            {save.statPoints > 0 && (
              <p className="hint" style={{ marginTop: 12, color: "var(--exp)" }}>
                {save.statPoints} unspent stat points.
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => onStart(save)}>
                Continue
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm("Delete this campaign character?")) onWipe();
                }}
              >
                Delete
              </button>
            </div>
          </section>
          <Link className="btn btn-ghost" href="/arena" style={{ textAlign: "center" }}>
            Duel mode instead
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="landing">
      <div className="landing-inner">
        <header>
          <h1 className="title">CAMPAIGN</h1>
          <p className="tagline">
            Pick a class and fight through three stages of mobs. Identical
            movement, combos and skills to the duel — plus experience and levels.
          </p>
        </header>
        <section className="card">
          <h2 className="section-title">Choose your class</h2>
          <div className="zone-list">
            {ids.map((id) => {
              const c = getClass(id);
              return (
                <button
                  key={id}
                  className={`zone-option${picked === id ? " current" : ""}`}
                  onClick={() => setPicked(id)}
                >
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.maxHp} HP · {c.maxMana} {c.manaLabel} · {c.weapon}
                    </small>
                  </span>
                  <span className="badge">{picked === id ? "PICKED" : "PICK"}</span>
                </button>
              );
            })}
          </div>
          <button
            className="btn"
            style={{ width: "100%", marginTop: 16 }}
            onClick={() => onStart(createAdventureSave(picked))}
          >
            Begin the campaign
          </button>
        </section>
      </div>
    </main>
  );
}
