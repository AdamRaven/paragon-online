"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArenaHud, type ArenaHudData } from "@/components/ArenaHud";
import { BackToHome } from "@/components/BackToHome";
import { ClassPortrait } from "@/components/ClassPortrait";
import { ComboMenu } from "@/components/ComboMenu";
import { EscapeMenu } from "@/components/EscapeMenu";
import { Keycap, KeyList } from "@/components/KeyList";
import { hasSeenTutorial, markTutorialSeen, TutorialOverlay } from "@/components/TutorialOverlay";
import { ArenaAI, type Difficulty } from "@/lib/arena/ai";
import { CLASSES, getClass, skillKeyLabel } from "@/lib/arena/classes";
import { DT, MANASTOP_HOLD } from "@/lib/arena/constants";
import { loadDuelStats, rankForStreak, recordDuelResult, type DuelStats } from "@/lib/arena/duelStats";
import { ArenaEngine, emptyIntent, type Intent } from "@/lib/arena/engine";
import { ArenaInput, P1_BINDINGS, P2_BINDINGS } from "@/lib/arena/input";
import { PIXEL_SCALE, artSize, worldViewSize } from "@/lib/arena/pixel";
import { renderArena, renderFighterPortraits } from "@/lib/arena/render";
import { playSound, startMusic, stopMusic } from "@/lib/arena/sound";
import type { ClassId, CombatLogEntry } from "@/lib/arena/types";

const MAX_LOGS = 6;

export function ArenaClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const inputRef = useRef<ArenaInput | null>(null);
  const input2Ref = useRef<ArenaInput | null>(null);
  const aiRef = useRef<ArenaAI | null>(null);
  const rafRef = useRef(0);
  const logIdRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [playerClass, setPlayerClass] = useState<ClassId>("paragon");
  const [enemyClass, setEnemyClass] = useState<ClassId>("shedim");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  // Local 2-player: the "enemy" fighter is driven by a second keyboard-only
  // ArenaInput instead of ArenaAI. Everything downstream (physics, hitboxes,
  // win condition) already treats "enemy" as just the second fighter, so
  // this only has to swap who supplies its Intent each tick.
  const [vsPlayer, setVsPlayer] = useState(false);
  const [hud, setHud] = useState<ArenaHudData | null>(null);
  const [logs, setLogs] = useState<CombatLogEntry[]>([]);
  const [winner, setWinner] = useState<{ name: string; you: boolean; bestCombo: number } | null>(
    null
  );
  const [duelStats, setDuelStats] = useState<DuelStats | null>(null);
  // A single overlay slot rather than separate booleans, so the pause menu
  // and the combo menu can never both be open and fighting over clicks —
  // Escape always closes whatever's open (or opens the pause menu from
  // nothing); Tab only ever toggles the combo menu.
  const [panel, setPanel] = useState<"none" | "pause" | "combo" | "tutorial">("none");
  const panelRef = useRef<"none" | "pause" | "combo" | "tutorial">("none");

  const pushLog = useCallback((text: string, tone: CombatLogEntry["tone"]) => {
    setLogs((prev) => [...prev, { id: logIdRef.current++, text, tone }].slice(-MAX_LOGS));
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    inputRef.current?.dispose();
    inputRef.current = null;
    input2Ref.current?.dispose();
    input2Ref.current = null;
    engineRef.current = null;
    aiRef.current = null;
  }, []);

  const begin = useCallback(() => {
    setLogs([]);
    setWinner(null);
    const first = !hasSeenTutorial();
    panelRef.current = first ? "tutorial" : "none";
    setPanel(first ? "tutorial" : "none");
    setStarted(true);
  }, []);

  useEffect(() => {
    if (winner) playSound(winner.you ? "victory" : "defeat");
  }, [winner]);

  useEffect(() => {
    setDuelStats(loadDuelStats());
  }, []);

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
          if (p === "tutorial") markTutorialSeen();
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

    const input = new ArenaInput(P1_BINDINGS, true);
    input.attach(canvas);
    inputRef.current = input;

    let input2: ArenaInput | null = null;
    let ai: ArenaAI | null = null;
    if (vsPlayer) {
      input2 = new ArenaInput(P2_BINDINGS, false);
      input2.attach(canvas);
      input2Ref.current = input2;
    } else {
      ai = new ArenaAI(difficulty);
      aiRef.current = ai;
    }

    const engine = new ArenaEngine(playerClass, enemyClass, {
      onLog: pushLog,
      onEnd: (name, you) => {
        const bestCombo = Math.max(engine.player.bestHitStreak, engine.enemy.bestHitStreak);
        setWinner({ name, you, bestCombo });
        setDuelStats(recordDuelResult(you));
      },
    });
    engineRef.current = engine;
    // A duel has no biome of its own; "keep" reads as a neutral arena drone
    // rather than any specific campaign stage's mood.
    startMusic("keep");

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
          const enemyIntent = input2 ? readIntent(input2) : ai!.think(engine.enemy, engine.player);
          engine.step(intent, enemyIntent);
          input.step(DT);
          input2?.step(DT);
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
      stopMusic();
    };
  }, [started, playerClass, enemyClass, difficulty, vsPlayer, pushLog]);

  // Pointer lock only during live combat — every other screen (pause,
  // combo list, tutorial, the victory/defeat card) is ordinary DOM buttons
  // that need a real visible cursor to click.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (started && !winner && panel === "none") input.lockPointer();
    else input.unlockPointer();
  }, [started, winner, panel]);

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
        duelStats={duelStats}
        vsPlayer={vsPlayer}
        setVsPlayer={setVsPlayer}
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
          onShowTutorial={() => {
            panelRef.current = "tutorial";
            setPanel("tutorial");
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

      {panel === "tutorial" && !winner && (
        <TutorialOverlay
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
              {winner.bestCombo >= 2 && (
                <p className="hint" style={{ color: "var(--exp)" }}>
                  Best combo this match: ×{winner.bestCombo}
                </p>
              )}
              {duelStats && (
                <p className="hint">
                  {winner.you
                    ? `Win streak ×${duelStats.winStreak} (best ×${duelStats.bestStreak}) — ${rankForStreak(duelStats.bestStreak)}`
                    : `Streak broken. Record: ${duelStats.wins}W–${duelStats.losses}L`}
                </p>
              )}
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
  const b = input.getBindings();
  const i = emptyIntent();
  i.moveX = input.moveX();
  i.sprint = input.isSprinting();
  i.up = input.isDown(b.up);
  i.down = input.isDown(b.down);

  // Jump needs the modifier AND up; dropping through needs it AND down.
  const modEdge = input.wasPressed(b.jumpMod);
  const upEdge = input.wasPressed(b.up);
  const downEdge = input.wasPressed(b.down);
  const mod = input.isDown(b.jumpMod);
  i.jump = (modEdge && i.up) || (upEdge && mod);
  // Holding EITHER key sustains the jump; only releasing both shortens it.
  i.jumpHeld = mod || i.up;
  i.dropThrough = (modEdge && i.down) || (downEdge && mod);

  i.lmb = input.consumeLmb();
  i.rmb = input.consumeRmb();
  i.lmbHeld = input.lmbDown();
  i.rmbHeld = input.rmbDown();
  i.bothHeldTime = input.bothButtonsHeld;

  i.q = input.consume(b.q);
  i.e = input.consume(b.e);
  i.r = input.consume(b.r);
  i.f = input.consume(b.f);
  i.shift = input.isDown(b.shift);
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
    hitStreak: p.hitStreak,
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
  duelStats,
  vsPlayer,
  setVsPlayer,
}: {
  playerClass: ClassId;
  enemyClass: ClassId;
  difficulty: Difficulty;
  setPlayerClass: (c: ClassId) => void;
  setEnemyClass: (c: ClassId) => void;
  setDifficulty: (d: Difficulty) => void;
  onStart: () => void;
  duelStats: DuelStats | null;
  vsPlayer: boolean;
  setVsPlayer: (v: boolean) => void;
}) {
  const ids = Object.keys(CLASSES) as ClassId[];
  const cls = getClass(playerClass);

  return (
    <main className="landing-page font-body-md text-body-md min-h-screen bg-void-black text-on-surface px-margin-mobile py-12 md:py-16">
      <div className="max-w-container-max mx-auto space-y-stack-lg">
        <div className="flex items-center justify-between">
          <BackToHome />
          <div className="flex items-center gap-gutter">
            {duelStats && (duelStats.wins > 0 || duelStats.losses > 0) && (
              <div className="text-right text-xs text-on-surface-variant">
                <div className="text-paragon-gold font-section-label tracking-widest">
                  {rankForStreak(duelStats.bestStreak).toUpperCase()}
                </div>
                <div>
                  {duelStats.wins}W–{duelStats.losses}L · best streak ×{duelStats.bestStreak}
                </div>
              </div>
            )}
            <div className="font-display-hero text-headline-lg text-paragon-gold tracking-tighter">
              PARAGON
            </div>
          </div>
        </div>

        <header className="text-center space-y-stack-sm max-w-2xl mx-auto">
          <h1 className="font-display-hero text-headline-lg-mobile md:text-display-hero text-paragon-gold gold-glow-text uppercase tracking-tighter leading-none">
            ARENA
          </h1>
          <p className="text-on-surface-variant leading-relaxed">
            A 2D platformer duel. Chain basic attacks into knockdowns, break combos with
            Manastop, and use the gap and the platform above it to control the fight.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
          <section className="glass-panel border border-primary/20 p-8">
            <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-4">
              Your Class
            </h2>
            <div className="space-y-3">
              {ids.map((id) => {
                const c = getClass(id);
                const picked = playerClass === id;
                return (
                  <button
                    key={id}
                    className={`w-full flex items-center gap-4 p-3 border transition-colors text-left ${
                      picked
                        ? "border-paragon-gold bg-paragon-gold/10"
                        : "border-outline-variant/30 hover:border-primary/40"
                    }`}
                    style={{ "--aura": c.colors.aura } as React.CSSProperties}
                    onClick={() => {
                      playSound("uiClick");
                      setPlayerClass(id);
                      // Player 2 picks their own class in vsPlayer mode — don't
                      // stomp on it just because Player 1 changed theirs.
                      if (!vsPlayer) {
                        const others = ids.filter((o) => o !== id);
                        setEnemyClass(others[Math.floor(Math.random() * others.length)]);
                      }
                    }}
                  >
                    <ClassPortrait classId={id} aura={c.colors.aura} size={52} />
                    <span className="flex-1 min-w-0">
                      <strong className="block text-on-surface">{c.name}</strong>
                      <small className="text-on-surface-variant text-xs">
                        {c.maxHp} HP · {c.maxMana} {c.manaLabel} · {c.attackPower} AP ·{" "}
                        {c.weapon}
                      </small>
                    </span>
                    <span
                      className={`font-section-label text-[10px] uppercase tracking-widest px-2 py-1 ${
                        picked ? "bg-paragon-gold text-void-black" : "text-outline"
                      }`}
                    >
                      {picked ? "PICKED" : "PICK"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-on-surface-variant text-sm mt-4">{cls.blurb}</p>
          </section>

          <section className="glass-panel border border-primary/20 p-8">
            <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-4">
              Controls
            </h2>
            <KeyList
              rows={[
                { label: "Move", content: <><Keycap>A</Keycap> <Keycap>D</Keycap></> },
                { label: "Up / down", content: <><Keycap>W</Keycap> <Keycap>S</Keycap></> },
                { label: "Jump", content: <><Keycap>Space</Keycap> + <Keycap>W</Keycap></> },
                {
                  label: "Drop through platform",
                  content: <><Keycap>Space</Keycap> + <Keycap>S</Keycap></>,
                },
                {
                  label: "Dash (×2 speed)",
                  content: <>tap <Keycap>D</Keycap><Keycap>D</Keycap> and hold</>,
                },
                { label: "Normal attack", content: <Keycap wide>LMB</Keycap> },
                { label: "Heavy attack", content: <Keycap wide>RMB</Keycap> },
                {
                  label: "Skills",
                  content: (
                    <>
                      <Keycap>Q</Keycap> <Keycap>E</Keycap> <Keycap>R</Keycap> <Keycap>F</Keycap>
                    </>
                  ),
                },
                { label: "Special", content: <Keycap>C</Keycap> },
                {
                  label: "Manastop (70 mana)",
                  content: <>hold <Keycap wide>LMB</Keycap>+<Keycap wide>RMB</Keycap> 0.5s</>,
                },
                { label: "Combo menu", content: <Keycap>Tab</Keycap> },
              ]}
            />
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
          <section className="glass-panel border border-primary/20 p-8">
            <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-4">
              {cls.name} Skills
            </h2>
            <ul className="space-y-2">
              {cls.skills.map((s) => (
                <li
                  key={s.id}
                  className="flex justify-between items-center border-b border-outline-variant/20 pb-2 text-sm"
                >
                  <span className="text-on-surface">
                    <Keycap>{skillKeyLabel(s.slot)}</Keycap> <span className="ml-2">{s.label}</span>
                    {s.invented && <em className="opacity-60 not-italic"> *</em>}
                  </span>
                  <span className="text-on-surface-variant">
                    {s.manaCost ? `${s.manaCost} mana` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-on-surface-variant text-xs mt-3">
              * Q and E were not defined in the design doc; these are my own additions to
              fill the 5-skill requirement.
            </p>
          </section>

          <section className="glass-panel border border-primary/20 p-8">
            <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-4">
              Opponent
            </h2>
            <div className="flex border border-outline-variant/30 mb-4">
              <button
                className={`flex-1 py-2 font-section-label text-[11px] uppercase tracking-widest transition-colors ${
                  !vsPlayer ? "bg-mana-glow/20 text-mana-glow" : "text-on-surface-variant"
                }`}
                onClick={() => {
                  playSound("uiClick");
                  setVsPlayer(false);
                }}
              >
                vs AI
              </button>
              <button
                className={`flex-1 py-2 font-section-label text-[11px] uppercase tracking-widest transition-colors ${
                  vsPlayer ? "bg-mana-glow/20 text-mana-glow" : "text-on-surface-variant"
                }`}
                onClick={() => {
                  playSound("uiClick");
                  setVsPlayer(true);
                }}
              >
                vs Player 2
              </button>
            </div>

            {!vsPlayer ? (
              <>
                <p className="text-on-surface-variant text-sm mb-4">
                  You face a <strong className="text-on-surface">{getClass(enemyClass).name}</strong>.
                </p>
                <div className="space-y-3">
                  {(["calm", "normal", "brutal"] as Difficulty[]).map((d) => {
                    const on = difficulty === d;
                    return (
                      <button
                        key={d}
                        className={`w-full flex items-center justify-between p-3 border transition-colors ${
                          on
                            ? "border-mana-glow bg-mana-glow/10"
                            : "border-outline-variant/30 hover:border-primary/40"
                        }`}
                        onClick={() => {
                          playSound("uiClick");
                          setDifficulty(d);
                        }}
                      >
                        <strong className="capitalize text-on-surface">{d}</strong>
                        <span
                          className={`font-section-label text-[10px] uppercase tracking-widest px-2 py-1 ${
                            on ? "bg-mana-glow text-on-primary" : "text-outline"
                          }`}
                        >
                          {on ? "ON" : "SET"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="text-on-surface-variant text-sm mb-4">
                  Same keyboard, second controller. Player 2 picks a class below;
                  their full control layout is listed here too.
                </p>
                <div className="space-y-3 mb-5">
                  {ids.map((id) => {
                    const picked = enemyClass === id;
                    const c = getClass(id);
                    return (
                      <button
                        key={id}
                        className={`w-full flex items-center gap-3 p-3 border transition-colors text-left ${
                          picked
                            ? "border-mana-glow bg-mana-glow/10"
                            : "border-outline-variant/30 hover:border-primary/40"
                        }`}
                        onClick={() => {
                          playSound("uiClick");
                          setEnemyClass(id);
                        }}
                      >
                        <ClassPortrait classId={id} aura={c.colors.aura} size={36} />
                        <span className="flex-1 min-w-0">
                          <strong className="block text-on-surface text-sm">{c.name}</strong>
                        </span>
                        <span
                          className={`font-section-label text-[10px] uppercase tracking-widest px-2 py-1 ${
                            picked ? "bg-mana-glow text-on-primary" : "text-outline"
                          }`}
                        >
                          {picked ? "PICKED" : "PICK"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <KeyList
                  rows={[
                    { label: "Move", content: <><Keycap>←</Keycap> <Keycap>→</Keycap></> },
                    { label: "Up / down", content: <><Keycap>↑</Keycap> <Keycap>↓</Keycap></> },
                    { label: "Jump", content: <><Keycap>/</Keycap> + <Keycap>↑</Keycap></> },
                    { label: "Normal attack", content: <Keycap wide>,</Keycap> },
                    { label: "Heavy attack", content: <Keycap wide>.</Keycap> },
                    {
                      label: "Skills",
                      content: (
                        <>
                          <Keycap>N1</Keycap> <Keycap>N2</Keycap> <Keycap>N3</Keycap>{" "}
                          <Keycap>N4</Keycap>
                        </>
                      ),
                    },
                    { label: "Special", content: <Keycap>N0</Keycap> },
                  ]}
                />
              </>
            )}

            <button
              className="w-full mt-6 bg-paragon-gold text-void-black py-4 font-section-label text-section-label uppercase tracking-widest font-bold glow-border-gold transition-all hover:scale-105"
              onClick={() => {
                playSound("uiClick");
                onStart();
              }}
            >
              {vsPlayer ? "Start Local Duel" : "Enter the Arena"}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
