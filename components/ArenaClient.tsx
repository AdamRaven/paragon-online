"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArenaHud, type ArenaHudData } from "@/components/ArenaHud";
import { ClassPortrait } from "@/components/ClassPortrait";
import { ComboMenu } from "@/components/ComboMenu";
import { EscapeMenu } from "@/components/EscapeMenu";
import { ArenaAI, type Difficulty } from "@/lib/arena/ai";
import { CLASSES, getClass } from "@/lib/arena/classes";
import { DT, MANASTOP_HOLD } from "@/lib/arena/constants";
import { ArenaEngine, emptyIntent, type Intent } from "@/lib/arena/engine";
import { ArenaInput } from "@/lib/arena/input";
import { PIXEL_SCALE, artSize, worldViewSize } from "@/lib/arena/pixel";
import { renderArena, renderFighterPortraits } from "@/lib/arena/render";
import { playSound } from "@/lib/arena/sound";
import type { ClassId, CombatLogEntry } from "@/lib/arena/types";

const MAX_LOGS = 6;

export function ArenaClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const inputRef = useRef<ArenaInput | null>(null);
  const aiRef = useRef<ArenaAI | null>(null);
  const rafRef = useRef(0);
  const logIdRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [playerClass, setPlayerClass] = useState<ClassId>("paragon");
  const [enemyClass, setEnemyClass] = useState<ClassId>("shedim");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [hud, setHud] = useState<ArenaHudData | null>(null);
  const [logs, setLogs] = useState<CombatLogEntry[]>([]);
  const [winner, setWinner] = useState<{ name: string; you: boolean } | null>(null);
  // A single overlay slot rather than separate booleans, so the pause menu
  // and the combo menu can never both be open and fighting over clicks —
  // Escape always closes whatever's open (or opens the pause menu from
  // nothing); Tab only ever toggles the combo menu.
  const [panel, setPanel] = useState<"none" | "pause" | "combo">("none");
  const panelRef = useRef<"none" | "pause" | "combo">("none");

  const pushLog = useCallback((text: string, tone: CombatLogEntry["tone"]) => {
    setLogs((prev) => [...prev, { id: logIdRef.current++, text, tone }].slice(-MAX_LOGS));
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    inputRef.current?.dispose();
    inputRef.current = null;
    engineRef.current = null;
    aiRef.current = null;
  }, []);

  const begin = useCallback(() => {
    setLogs([]);
    setWinner(null);
    panelRef.current = "none";
    setPanel("none");
    setStarted(true);
  }, []);

  useEffect(() => {
    if (winner) playSound(winner.you ? "victory" : "defeat");
  }, [winner]);

  // Escape always closes whatever's open, or opens the pause menu from
  // nothing; Tab only ever toggles the combo menu, and leaves the pause menu
  // alone if that's what's currently up. Neither fires once the fight ends,
  // since the victory/defeat card already owns the screen at that point.
  useEffect(() => {
    if (!started || winner) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Escape") {
        setPanel((p) => {
          const next = p === "none" ? "pause" : "none";
          panelRef.current = next;
          return next;
        });
      } else if (e.code === "Tab") {
        e.preventDefault();
        setPanel((p) => {
          const next = p === "combo" ? "none" : p === "none" ? "combo" : p;
          panelRef.current = next;
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, winner]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fxCanvas = fxCanvasRef.current;
    const fxCtx = fxCanvas?.getContext("2d") ?? null;

    const input = new ArenaInput();
    input.attach(canvas);
    inputRef.current = input;

    const ai = new ArenaAI(difficulty);
    aiRef.current = ai;

    const engine = new ArenaEngine(playerClass, enemyClass, {
      onLog: pushLog,
      onEnd: (name, you) => setWinner({ name, you }),
    });
    engineRef.current = engine;

    let fxScale = PIXEL_SCALE;

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

      // The portrait overlay shares the exact same CSS box as the game
      // canvas but backs it with real display resolution, so Paragon and
      // Shedim render crisp while the world underneath stays chunky.
      if (fxCanvas) {
        const dpr = window.devicePixelRatio || 1;
        fxScale = PIXEL_SCALE * dpr;
        fxCanvas.width = Math.round(art.w * fxScale);
        fxCanvas.height = Math.round(art.h * fxScale);
        fxCanvas.style.width = `${art.w * PIXEL_SCALE}px`;
        fxCanvas.style.height = `${art.h * PIXEL_SCALE}px`;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    canvas.focus();

    let last = performance.now();
    let acc = 0;
    let hudTick = 0;

    const frame = (now: number) => {
      acc += Math.min(200, now - last);
      last = now;

      if (panelRef.current !== "none") {
        acc = 0;
      } else {
        let guard = 0;
        while (acc >= DT * 1000 && guard++ < 8) {
          const intent = readIntent(input);
          const aiIntent = ai.think(engine.enemy, engine.player);
          engine.step(intent, aiIntent);
          input.step(DT);
          acc -= DT * 1000;
        }
      }

      renderArena(ctx, engine);
      if (fxCtx) renderFighterPortraits(fxCtx, engine, fxScale);

      if (++hudTick >= 4) {
        hudTick = 0;
        setHud(buildHud(engine, input));
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
      input.dispose();
      inputRef.current = null;
      engineRef.current = null;
    };
  }, [started, playerClass, enemyClass, difficulty, pushLog]);

  useEffect(() => () => stop(), [stop]);

  if (!started) {
    return (
      <ClassSelect
        playerClass={playerClass}
        enemyClass={enemyClass}
        difficulty={difficulty}
        setPlayerClass={setPlayerClass}
        setEnemyClass={setEnemyClass}
        setDifficulty={setDifficulty}
        onStart={begin}
      />
    );
  }

  return (
    <div className="arena-stage">
      <canvas ref={canvasRef} tabIndex={0} />
      <canvas ref={fxCanvasRef} className="arena-fx-canvas" />
      {hud && <ArenaHud hud={hud} logs={logs} />}

      {panel === "pause" && !winner && (
        <EscapeMenu
          onResume={() => {
            panelRef.current = "none";
            setPanel("none");
          }}
        />
      )}

      {panel === "combo" && !winner && hud && (
        <ComboMenu
          classId={hud.playerClass as ClassId}
          onClose={() => {
            panelRef.current = "none";
            setPanel("none");
          }}
        />
      )}

      {winner && (() => {
        const winnerClassId = winner.you ? playerClass : enemyClass;
        const winnerAura = getClass(winnerClassId).colors.aura;
        const glow = winner.you ? "rgba(110, 231, 183, 0.22)" : "rgba(248, 113, 113, 0.2)";
        return (
          <div className="overlay">
            <div className="sheet death-card" style={{ "--result-glow": glow } as React.CSSProperties}>
              <div className="result-portrait">
                <ClassPortrait classId={winnerClassId} aura={winnerAura} size={92} />
              </div>
              <h2 style={{ color: winner.you ? "var(--accent)" : "var(--danger)" }}>
                {winner.you ? "VICTORY" : "DEFEAT"}
              </h2>
              <p className="hint">{winner.name} wins the duel.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "center" }}>
                <button className="btn" onClick={() => { setStarted(false); setWinner(null); }}>
                  Fight again
                </button>
                <Link className="btn btn-ghost" href="/">
                  Home
                </Link>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/** Translates raw device state into the engine's normalised commands. */
function readIntent(input: ArenaInput): Intent {
  const i = emptyIntent();
  i.moveX = input.moveX();
  i.sprint = input.isSprinting();
  i.up = input.isDown("KeyW");
  i.down = input.isDown("KeyS");

  // Jump needs Space AND W; dropping through needs Space AND S.
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

function buildHud(engine: ArenaEngine, input: ArenaInput): ArenaHudData {
  const p = engine.player;
  const e = engine.enemy;
  return {
    playerName: p.name,
    playerClass: p.classId,
    playerHp: Math.round(p.hp),
    playerMaxHp: p.maxHp,
    playerMana: Math.round(p.mana),
    playerMaxMana: p.maxMana,
    enemyName: e.name,
    enemyClass: e.classId,
    enemyHp: Math.round(e.hp),
    enemyMaxHp: e.maxHp,
    enemyMana: Math.round(e.mana),
    enemyMaxMana: e.maxMana,
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

function ClassSelect({
  playerClass,
  enemyClass,
  difficulty,
  setPlayerClass,
  setEnemyClass,
  setDifficulty,
  onStart,
}: {
  playerClass: ClassId;
  enemyClass: ClassId;
  difficulty: Difficulty;
  setPlayerClass: (c: ClassId) => void;
  setEnemyClass: (c: ClassId) => void;
  setDifficulty: (d: Difficulty) => void;
  onStart: () => void;
}) {
  const ids = Object.keys(CLASSES) as ClassId[];
  const cls = getClass(playerClass);

  return (
    <main className="landing">
      <div className="landing-inner">
        <header>
          <h1 className="title">ARENA</h1>
          <p className="tagline">
            A 2D platformer duel. Chain basic attacks into knockdowns, break
            combos with Manastop, and use the gap and the platform above it to
            control the fight.
          </p>
        </header>

        <div className="grid-2">
          <section className="card">
            <h2 className="section-title">Your class</h2>
            <div className="zone-list">
              {ids.map((id) => {
                const c = getClass(id);
                return (
                  <button
                    key={id}
                    className={`zone-option class-option${playerClass === id ? " current" : ""}`}
                    style={{ "--aura": c.colors.aura } as React.CSSProperties}
                    onClick={() => {
                      playSound("uiClick");
                      setPlayerClass(id);
                      const others = ids.filter((o) => o !== id);
                      setEnemyClass(others[Math.floor(Math.random() * others.length)]);
                    }}
                  >
                    <ClassPortrait classId={id} aura={c.colors.aura} size={52} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {c.maxHp} HP · {c.maxMana} {c.manaLabel} · {c.attackPower} AP ·{" "}
                        {c.weapon}
                      </small>
                    </span>
                    <span className="badge">{playerClass === id ? "PICKED" : "PICK"}</span>
                  </button>
                );
              })}
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              {cls.blurb}
            </p>
          </section>

          <section className="card">
            <h2 className="section-title">Controls</h2>
            <ul className="key-list">
              <li><span>Move</span><span><kbd>A</kbd> <kbd>D</kbd></span></li>
              <li><span>Up / down</span><span><kbd>W</kbd> <kbd>S</kbd></span></li>
              <li><span>Jump</span><span><kbd>Space</kbd> + <kbd>W</kbd></span></li>
              <li><span>Drop through platform</span><span><kbd>Space</kbd> + <kbd>S</kbd></span></li>
              <li><span>Dash (×2 speed)</span><span>tap <kbd>D</kbd><kbd>D</kbd> and hold</span></li>
              <li><span>Normal attack</span><kbd>LMB</kbd></li>
              <li><span>Heavy attack</span><kbd>RMB</kbd></li>
              <li><span>Skills</span><span><kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> <kbd>F</kbd></span></li>
              <li><span>Special</span><kbd>Shift</kbd></li>
              <li><span>Manastop (70 mana)</span><span>hold <kbd>LMB</kbd>+<kbd>RMB</kbd> 0.5s</span></li>
              <li><span>Combo menu</span><kbd>Tab</kbd></li>
            </ul>
          </section>
        </div>

        <div className="grid-2">
          <section className="card">
            <h2 className="section-title">{cls.name} skills</h2>
            <ul className="key-list">
              {cls.skills.map((s) => (
                <li key={s.id}>
                  <span style={{ color: "var(--text)" }}>
                    <kbd>{s.slot}</kbd> {s.label}
                    {s.invented && <em style={{ opacity: 0.6 }}> *</em>}
                  </span>
                  <span>{s.manaCost ? `${s.manaCost} mana` : "—"}</span>
                </li>
              ))}
            </ul>
            <p className="hint" style={{ marginTop: 10, fontSize: 11 }}>
              * Q and E were not defined in the design doc; these are my own
              additions to fill the 5-skill requirement.
            </p>
          </section>

          <section className="card">
            <h2 className="section-title">Opponent</h2>
            <p className="hint" style={{ marginBottom: 12 }}>
              You face a <strong>{getClass(enemyClass).name}</strong>.
            </p>
            <div className="zone-list">
              {(["calm", "normal", "brutal"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`zone-option${difficulty === d ? " current" : ""}`}
                  onClick={() => { playSound("uiClick"); setDifficulty(d); }}
                >
                  <span><strong style={{ textTransform: "capitalize" }}>{d}</strong></span>
                  <span className="badge">{difficulty === d ? "ON" : "SET"}</span>
                </button>
              ))}
            </div>
            <button
              className="btn"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => { playSound("uiClick"); onStart(); }}
            >
              Enter the arena
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
