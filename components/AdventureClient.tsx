"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArenaHud, SkillBar, type ArenaHudData } from "@/components/ArenaHud";
import { BackToHome } from "@/components/BackToHome";
import { ClassPortrait } from "@/components/ClassPortrait";
import { ComboMenu } from "@/components/ComboMenu";
import { DevLevelTools } from "@/components/DevTools";
import { EscapeMenu } from "@/components/EscapeMenu";
import { InventoryPanel } from "@/components/InventoryPanel";
import { MapPanel } from "@/components/MapPanel";
import { BestiaryPanel } from "@/components/BestiaryPanel";
import { BlacksmithPanel } from "@/components/BlacksmithPanel";
import { BountyBoard } from "@/components/BountyBoard";
import { HallOfRecordsPanel } from "@/components/HallOfRecordsPanel";
import { RunCompleteModal } from "@/components/RunCompleteModal";
import { claimWeeklyMilestone } from "@/lib/arena/weekly";
import { featuredBaseId } from "@/lib/arena/featuredItem";
import { VendorPanel } from "@/components/VendorPanel";
import { StoragePanel } from "@/components/StoragePanel";
import { TouchControls } from "@/components/TouchControls";
import {
  hasFinishedTutorialQuest,
  hasSeenTutorial,
  markTutorialSeen,
  TutorialOverlay,
  TutorialQuestBanner,
} from "@/components/TutorialOverlay";
import {
  EFFECT_META,
  MAX_PLUS,
  STONE_PRICE,
  STORAGE_BASE_CAP,
  STORAGE_EXPANSION_SIZE,
  activeSetProgress,
  attemptEnhance,
  base,
  familySlots,
  itemName,
  itemScore,
  itemValue,
  makeItem,
  storageExpansionCost,
  totalUniqueCount,
  type EquipSlot,
  type Item,
  type ItemEffect,
} from "@/lib/arena/items";
import {
  AdventureEngine,
  CRUCIBLE_AFFIX_META,
  type CrucibleAffix,
} from "@/lib/arena/adventure";
import {
  ACHIEVEMENTS,
  checkNewAchievements,
  getAchievement,
  unlockedAuras,
} from "@/lib/arena/achievements";
import { CLASSES, getClass } from "@/lib/arena/classes";
import { MAX_TALENTS, talentsFor } from "@/lib/arena/talents";
import { unlockedPrestigeTiers } from "@/lib/arena/prestige";
import { todayKey } from "@/lib/arena/bounties";
import { DT, MANASTOP_HOLD } from "@/lib/arena/constants";
import { emptyIntent, type Intent } from "@/lib/arena/engine";
import { ArenaInput } from "@/lib/arena/input";
import { loadCustomBindings } from "@/lib/arena/keybinds";
import { STAGES } from "@/lib/arena/mobs";
import {
  BASE_STAT,
  DIFFICULTY_META,
  MAX_LEVEL,
  STAT_META,
  TOWN_TIER_COST,
  ascend,
  clearAdventure,
  createAdventureSave,
  deriveArenaStats,
  expToNext,
  importAdventureSave,
  loadAdventure,
  saveAdventure,
  type AdventureSave,
  type Difficulty,
  type StatKey,
} from "@/lib/arena/progression";
import { PIXEL_SCALE, artSize, worldViewSize } from "@/lib/arena/pixel";
import { renderArena, renderFighterPortraits } from "@/lib/arena/render";
import { playSound, startMusic, stopMusic } from "@/lib/arena/sound";
import type { ClassId, CombatLogEntry } from "@/lib/arena/types";

const MAX_LOGS = 6;
/** Meta-completion threshold for the run-complete screen — Ascension has no
 *  hard cap, so this is a deliberately deep, chosen milestone rather than
 *  "the" ceiling. */
const RUN_COMPLETE_ASCENSION = 10;

export function AdventureClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AdventureEngine | null>(null);
  const inputRef = useRef<ArenaInput | null>(null);
  const rafRef = useRef(0);
  const logIdRef = useRef(0);

  const [save, setSave] = useState<AdventureSave | null>(null);
  const [booted, setBooted] = useState(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState<ArenaHudData | null>(null);
  const [exp, setExp] = useState({ exp: 0, next: 1, level: 1, points: 0 });
  /** Survival Fields only — current wave, live off the engine each HUD tick. */
  const [wave, setWave] = useState(0);
  /** Boss Rush only — live off the engine each HUD tick. */
  const [bossRush, setBossRush] = useState({ index: -1, time: 0, cleared: false });
  /** Daily Rift only — live off the engine each HUD tick. */
  const [dailyChallenge, setDailyChallenge] = useState({ time: 0, cleared: false });
  /** Sundered Crucible only — this run's rolled modifiers. */
  const [crucibleAffixes, setCrucibleAffixes] = useState<CrucibleAffix[]>([]);
  /** First-run quest banner: sticky once true, never reset by leaving town. */
  const [visitedTown, setVisitedTown] = useState(false);
  const [showRunComplete, setShowRunComplete] = useState(false);
  const [logs, setLogs] = useState<CombatLogEntry[]>([]);
  const [panel, setPanel] = useState<
    | "none"
    | "sheet"
    | "map"
    | "inventory"
    | "blacksmith"
    | "vendor"
    | "storage"
    | "escape"
    | "combo"
    | "tutorial"
    | "bounty"
    | "bestiary"
    | "records"
  >("none");
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  /** Bumped whenever the save mutates, to re-render the panels. */
  const [rev, setRev] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = panel === "escape" || panel === "combo" || panel === "tutorial";
  }, [panel]);

  const pushLog = useCallback((text: string, tone: CombatLogEntry["tone"]) => {
    setLogs((prev) => [...prev, { id: logIdRef.current++, text, tone }].slice(-MAX_LOGS));
  }, []);

  useEffect(() => {
    setSave(loadAdventure());
    setBooted(true);
  }, []);

  useEffect(() => {
    if (save && STAGES[save.stage]?.isTown) setVisitedTown(true);
  }, [save?.stage]);

  // ------------------------------------------------------------- engine boot
  useEffect(() => {
    if (!started || !save) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fxCanvas = fxCanvasRef.current;
    const fxCtx = fxCanvas?.getContext("2d") ?? null;

    const input = new ArenaInput(loadCustomBindings());
    input.attach(canvas);
    inputRef.current = input;

    const engine = new AdventureEngine(save, {
      onLog: pushLog,
      onEnd: () => {},
      onPlayerDeath: () => playSound("defeat"),
      onExp: (_amount, _mobName, result) => {
        if (result.levelsGained > 0) playSound("levelUp");
      },
      onLoot: (items) => {
        for (const it of items) pushLog(`Looted ${itemName(it)}.`, "good");
        setRev((r) => r + 1);
        playSound("loot");
      },
    });
    engineRef.current = engine;
    startMusic(engine.stage.biome);

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
    let saveTick = 0;

    const frame = (now: number) => {
      acc += Math.min(200, now - last);
      last = now;
      if (pausedRef.current) {
        acc = 0;
      } else {
        let guard = 0;
        while (acc >= DT * 1000 && guard++ < 8) {
          engine.stepAdventure(readIntent(input));
          input.step(DT);
          acc -= DT * 1000;
        }
      }
      renderArena(ctx, engine);
      if (fxCtx) renderFighterPortraits(fxCtx, engine, fxScale);

      if (++hudTick >= 4) {
        hudTick = 0;
        setHud(buildHud(engine, input));
        setExp({
          exp: engine.save.exp,
          next: expToNext(engine.save.level),
          level: engine.save.level,
          points: engine.save.statPoints,
        });
        if (engine.stage.survival) setWave(engine.waveNumber);
        if (engine.stage.bossRush) {
          setBossRush({
            index: engine.bossRushIndex,
            time: engine.bossRushTime,
            cleared: engine.bossRushCleared,
          });
        }
        if (engine.stage.crucible || engine.stage.dailyChallenge) {
          setCrucibleAffixes(engine.crucibleAffixes);
        }
        if (engine.stage.dailyChallenge) {
          setDailyChallenge({
            time: engine.dailyChallengeTime,
            cleared: engine.dailyChallengeCleared,
          });
        }
        const newAchievements = checkNewAchievements(engine.save);
        if (newAchievements.length) {
          engine.save.achievements = [...(engine.save.achievements ?? []), ...newAchievements];
          for (const id of newAchievements) {
            const a = getAchievement(id);
            if (a) pushLog(`Achievement unlocked: ${a.name}!`, "big");
          }
          playSound("levelUp");
          saveAdventure(engine.save);
          setSave({ ...engine.save });
        }
        if (
          !engine.save.seenRunComplete &&
          (engine.save.ascension ?? 0) >= RUN_COMPLETE_ASCENSION &&
          (engine.save.uniquesFound?.length ?? 0) >= totalUniqueCount()
        ) {
          engine.save.seenRunComplete = true;
          saveAdventure(engine.save);
          setSave({ ...engine.save });
          setShowRunComplete(true);
          playSound("victory");
        }
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
      stopMusic();
    };
    // The engine owns the save object once created; re-running would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, pushLog]);

  // Deliberately never pointer-locked: the HUD (Auto-Grind toggle, etc.)
  // sits directly over the canvas even with no panel open, so the cursor
  // needs to stay visible and clickable at all times rather than
  // requiring Esc first. This trades away the pointer-lock trick that used
  // to swallow the rare Shift+RMB "Inspect Element" browser escape hatch
  // during a heavy-attack combo — contextmenu is still preventDefault()'d
  // for the ordinary right-click case, just not that one.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.unlockPointer();
  }, [started, panel]);

  // E doubles as "talk" when standing at any of the town NPCs — shared by
  // the keyboard handler below and the touch "Talk to ..." button, which
  // has no KeyE event of its own to listen for.
  const interactWithNpc = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.nearBlacksmith) {
      setShopMsg(null);
      setRev((r) => r + 1);
      setPanel((p) => (p === "blacksmith" ? "none" : "blacksmith"));
    } else if (eng.nearVendor) {
      setShopMsg(null);
      setRev((r) => r + 1);
      setPanel((p) => (p === "vendor" ? "none" : "vendor"));
    } else if (eng.nearBank) {
      setRev((r) => r + 1);
      setPanel((p) => (p === "storage" ? "none" : "storage"));
    }
  }, []);

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
        interactWithNpc();
      } else if (e.code === "Escape") {
        setPanel((p) => {
          if (p === "tutorial") markTutorialSeen();
          return p === "none" ? "escape" : "none";
        });
      } else if (e.code === "Tab") {
        e.preventDefault();
        setPanel((p) => (p === "combo" ? "none" : "combo"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, interactWithNpc]);

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

  // Stable identity (empty deps — engineRef is a ref, setSave/setRev are
  // setters) so handlers built on top of it via useCallback stay stable
  // too, which lets memoized panels (Inventory/Blacksmith/Vendor/Storage)
  // actually skip re-rendering on the ~15Hz hud tick instead of every time.
  const mutate = useCallback((fn: (e: AdventureEngine) => void) => {
    const e = engineRef.current;
    if (!e) return;
    fn(e);
    e.applyProgression();
    saveAdventure(e.save);
    setSave({ ...e.save });
    setRev((r) => r + 1);
  }, []);

  const ascendNow = () => {
    const e = engineRef.current;
    if (!e || !ascend(e.save)) return;
    // Recompute stats for the new (level 1, +1 ascension) state before
    // healing to full, rather than healing at the stale pre-Ascend numbers.
    e.applyProgression();
    e.player.hp = e.player.maxHp;
    e.player.mana = e.player.maxMana;
    saveAdventure(e.save);
    setSave({ ...e.save });
    setRev((r) => r + 1);
    pushLog(
      `Ascended to rank ${e.save.ascension}! Back to level 1 — permanently stronger.`,
      "big"
    );
    playSound("levelUp");
  };

  const setTitle = (title: string | undefined) =>
    mutate((e) => {
      e.save.title = title;
    });

  const setAura = (color: string | undefined) =>
    mutate((e) => {
      e.save.auraColor = color;
    });

  const setWeaponSkin = (color: string | undefined) =>
    mutate((e) => {
      e.save.weaponSkin = color;
    });

  const pickTalent = (id: string) =>
    mutate((e) => {
      const chosen = e.save.talents ?? [];
      if (chosen.includes(id) || chosen.length >= MAX_TALENTS || (e.save.talentPoints ?? 0) <= 0) {
        return;
      }
      e.save.talentPoints = (e.save.talentPoints ?? 0) - 1;
      e.save.talents = [...chosen, id];
      playSound("uiClick");
    });

  const closePanel = useCallback(() => setPanel("none"), []);

  const claimBounty = () => mutate((e) => e.claimBounty());
  const toggleAutoGrind = () => mutate((e) => e.toggleAutoGrind());
  const claimWeekly = (index: number) => mutate((e) => claimWeeklyMilestone(e.save, index));

  const importSaveFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importAdventureSave(String(reader.result));
      if (!imported) {
        window.alert("That doesn't look like a valid Paragon save file.");
        playSound("uiError");
        return;
      }
      saveAdventure(imported);
      setSave(imported);
      playSound("uiClick");
    };
    reader.readAsText(file);
  };

  // Dev-only: never reachable in a production build (see DevLevelTools).
  const devAdjustLevel = (delta: number) =>
    mutate((e) => {
      e.save.level = Math.max(1, Math.min(MAX_LEVEL, e.save.level + delta));
      e.save.exp = 0;
    });

  const equip = useCallback(
    (item: Item) =>
      mutate((e) => {
        const family = base(item.baseId).slot;
        if (!family) return;
        // Earrings and rings share 2 physical slots — drop into whichever is
        // empty, or bump the weaker of the two if both are already filled.
        const slots = familySlots(family);
        const target =
          slots.find((s) => !e.save.equipped[s]) ??
          slots.reduce((worst, s) => {
            const w = e.save.equipped[worst];
            const c = e.save.equipped[s];
            return w && c && itemScore(c) < itemScore(w) ? s : worst;
          }, slots[0]);
        const current = e.save.equipped[target];
        e.save.inventory = e.save.inventory.filter((i) => i.uid !== item.uid);
        if (current) e.save.inventory.push(current);
        e.save.equipped[target] = item;
        pushLog(`Equipped ${itemName(item)}.`, "good");
      }),
    [mutate, pushLog]
  );

  const unequip = useCallback(
    (slot: EquipSlot) =>
      mutate((e) => {
        const item = e.save.equipped[slot];
        if (!item) return;
        e.save.inventory.push(item);
        delete e.save.equipped[slot];
      }),
    [mutate]
  );

  const sellOne = useCallback(
    (item: Item) =>
      mutate((e) => {
        const worth = itemValue(item);
        e.save.inventory = e.save.inventory.filter((i) => i.uid !== item.uid);
        e.save.gold += worth;
        setShopMsg(`Sold ${itemName(item)} for ${worth}g.`);
        playSound("loot");
      }),
    [mutate]
  );

  const sellAllTrash = useCallback(
    () =>
      mutate((e) => {
        const trash = e.save.inventory.filter((i) => base(i.baseId).kind === "trash");
        const worth = trash.reduce((n, i) => n + itemValue(i), 0);
        e.save.inventory = e.save.inventory.filter((i) => base(i.baseId).kind !== "trash");
        e.save.gold += worth;
        setShopMsg(`Sold ${trash.length} trash items for ${worth}g.`);
        playSound("loot");
      }),
    [mutate]
  );

  // Only unequipped gear in the backpack — equipped items live in
  // save.equipped and are never touched here, so nothing worn is at risk.
  const sellAllGear = useCallback(
    () =>
      mutate((e) => {
        const gear = e.save.inventory.filter((i) => base(i.baseId).kind !== "trash");
        const worth = gear.reduce((n, i) => n + itemValue(i), 0);
        e.save.inventory = e.save.inventory.filter((i) => base(i.baseId).kind === "trash");
        e.save.gold += worth;
        setShopMsg(`Sold ${gear.length} gear items for ${worth}g.`);
        playSound("loot");
      }),
    [mutate]
  );

  const buyStones = useCallback(
    (n: number) =>
      mutate((e) => {
        const cost = STONE_PRICE * n;
        if (e.save.gold < cost) return;
        e.save.gold -= cost;
        e.save.stones += n;
        setShopMsg(`Bought ${n} stone${n > 1 ? "s" : ""} for ${cost}g.`);
        playSound("uiClick");
      }),
    [mutate]
  );

  /** Gold sink: refund every spent stat point (and chosen talent) at a
   *  per-point cost, so a respec is a real decision instead of a free
   *  do-over. One combined flow rather than a separate talent respec. */
  const RESPEC_COST_PER_POINT = 25;
  const respec = useCallback(
    () =>
      mutate((e) => {
        const s = e.save.stats;
        const statsSpent = s.str + s.vit + s.foc - BASE_STAT * 3;
        const talentsSpent = (e.save.talents ?? []).length;
        const spent = statsSpent + talentsSpent;
        if (spent <= 0) {
          setShopMsg("Nothing to respec.");
          return;
        }
        const cost = spent * RESPEC_COST_PER_POINT;
        if (e.save.gold < cost) {
          setShopMsg(`Respec costs ${cost}g for ${spent} points — you don't have enough.`);
          return;
        }
        e.save.gold -= cost;
        e.save.statPoints += statsSpent;
        e.save.stats = { str: BASE_STAT, vit: BASE_STAT, foc: BASE_STAT };
        e.save.talentPoints = (e.save.talentPoints ?? 0) + talentsSpent;
        e.save.talents = [];
        setShopMsg(`Respec complete — ${spent} points refunded for ${cost}g.`);
        playSound("uiClick");
      }),
    [mutate]
  );

  const buyGear = useCallback(
    (baseId: string) =>
      mutate((e) => {
        const item = makeItem(baseId, "common");
        const price = itemValue(item);
        if (e.save.gold < price) return;
        e.save.gold -= price;
        e.save.inventory.push(item);
        setShopMsg(`Bought ${itemName(item)} for ${price}g.`);
        pushLog(`Bought ${itemName(item)}.`, "good");
        playSound("uiClick");
      }),
    [mutate, pushLog]
  );

  const buyFeaturedGear = useCallback(
    () =>
      mutate((e) => {
        const item = makeItem(featuredBaseId(), "epic");
        const price = itemValue(item);
        if (e.save.gold < price) return;
        e.save.gold -= price;
        e.save.inventory.push(item);
        setShopMsg(`Bought ${itemName(item)} for ${price}g.`);
        pushLog(`Bought this week's featured ${itemName(item)}.`, "good");
        playSound("uiClick");
      }),
    [mutate, pushLog]
  );

  const storeItem = useCallback(
    (item: Item) =>
      mutate((e) => {
        const cap = e.save.storageCap ?? STORAGE_BASE_CAP;
        if (e.save.storage.length >= cap) {
          setShopMsg(`Storage is full (${cap}). Buy more room from the bank keeper.`);
          return;
        }
        e.save.inventory = e.save.inventory.filter((i) => i.uid !== item.uid);
        e.save.storage.push(item);
      }),
    [mutate]
  );

  const expandStorage = useCallback(
    () =>
      mutate((e) => {
        const cap = e.save.storageCap ?? STORAGE_BASE_CAP;
        const cost = storageExpansionCost(cap);
        if (e.save.gold < cost) {
          setShopMsg(`Expanding storage costs ${cost}g — you don't have enough.`);
          return;
        }
        e.save.gold -= cost;
        e.save.storageCap = cap + STORAGE_EXPANSION_SIZE;
        setShopMsg(`Storage expanded to ${e.save.storageCap} slots.`);
        playSound("uiClick");
      }),
    [mutate]
  );

  const buyTownTier = useCallback(
    () =>
      mutate((e) => {
        const tier = e.save.townTier ?? 0;
        const cost = TOWN_TIER_COST[tier];
        if (cost === undefined) {
          setShopMsg("Emberhold is already fully decorated.");
          return;
        }
        if (e.save.gold < cost) {
          setShopMsg(`Decorating Emberhold costs ${cost}g — you don't have enough.`);
          return;
        }
        e.save.gold -= cost;
        e.save.townTier = tier + 1;
        setShopMsg(`Emberhold decorated — tier ${e.save.townTier}.`);
        playSound("uiClick");
      }),
    [mutate]
  );

  const retrieveItem = useCallback(
    (item: Item) =>
      mutate((e) => {
        e.save.storage = e.save.storage.filter((i) => i.uid !== item.uid);
        e.save.inventory.push(item);
      }),
    [mutate]
  );

  const enhance = useCallback(
    (item: Item) =>
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
          playSound("enhanceSuccess");
        } else if (r.downgraded) {
          setShopMsg(`Failed — it dropped to +${r.to}.`);
          pushLog(`Enhancement failed: down to +${r.to}.`, "bad");
          playSound("enhanceFail");
        } else {
          setShopMsg(`Failed, but it held at +${r.to}.`);
          playSound("enhanceFail");
        }
      }),
    [mutate, pushLog]
  );

  /** Fires up to `times` attempts back to back, stopping early if it maxes
   * out or runs out of stones, and reports one rolled-up summary instead of
   * spamming a log line per swing. */
  const enhanceMany = useCallback(
    (item: Item, times: number) =>
      mutate((e) => {
        let attempts = 0;
        let successes = 0;
        let downgrades = 0;
        while (attempts < times && e.save.stones > 0 && item.plus < MAX_PLUS) {
          e.save.stones -= 1;
          attempts += 1;
          const r = attemptEnhance(item);
          if (r.ok) successes += 1;
          else if (r.downgraded) downgrades += 1;
        }
        if (attempts === 0) {
          setShopMsg(
            item.plus >= MAX_PLUS
              ? `${base(item.baseId).name} is already maxed.`
              : "You have no enhancement stones."
          );
          return;
        }
        const summary = `${successes}/${attempts} succeeded — ${base(item.baseId).name} is now +${item.plus}${
          downgrades ? ` (${downgrades} downgrade${downgrades > 1 ? "s" : ""})` : ""
        }.`;
        setShopMsg(summary);
        pushLog(summary, successes > 0 ? "big" : "bad");
        playSound(successes > 0 ? "enhanceSuccess" : "enhanceFail");
      }),
    [mutate, pushLog]
  );

  const travel = (index: number) => {
    const e = engineRef.current;
    if (!e) return;
    if (e.changeStage(index)) {
      saveAdventure(e.save);
      setSave({ ...e.save });
      setPanel("none");
      playSound("travel");
      startMusic(e.stage.biome);
    } else {
      playSound("uiError");
    }
  };

  if (!booted) return <main className="landing-page bg-void-black min-h-screen" />;

  if (!started) {
    return (
      <CharacterGate
        save={save}
        onStart={(s) => {
          saveAdventure(s);
          setSave(s);
          setStarted(true);
          if (!hasSeenTutorial()) setPanel("tutorial");
        }}
        onWipe={() => {
          clearAdventure();
          setSave(null);
        }}
        onImport={importSaveFile}
      />
    );
  }

  const live = engineRef.current?.save ?? save!;
  const expPct = Number.isFinite(exp.next) ? (exp.exp / exp.next) * 100 : 100;

  return (
    <div className={`arena-stage campaign${STAGES[live.stage]?.isTown ? " town" : ""}`}>
      <canvas ref={canvasRef} tabIndex={0} />
      <canvas ref={fxCanvasRef} className="arena-fx-canvas" />
      {hud && <ArenaHud hud={hud} logs={logs} hideSkills />}
      {!hasFinishedTutorialQuest() && (
        <TutorialQuestBanner state={{ kills: live.kills, level: live.level, visitedTown }} />
      )}

      {showRunComplete && (
        <RunCompleteModal save={live} onClose={() => setShowRunComplete(false)} />
      )}

      {process.env.NODE_ENV !== "production" && (
        <DevLevelTools level={live.level} maxLevel={MAX_LEVEL} onAdjust={devAdjustLevel} />
      )}

      {started && hud && panel === "none" && inputRef.current && (
        <TouchControls input={inputRef.current} nearNpc={hud.nearNpc} onInteract={interactWithNpc} />
      )}

      {/* Grouped so a wrapped camp-bar (many buttons, narrow window) pushes
          the console up instead of sliding underneath it — see the
          .campaign-bottom-stack comment in globals.css. */}
      <div className="campaign-bottom-stack">
        {/* One console: skills stacked directly above the XP/gold/nav row,
            inside a single bordered window instead of two stacked panels. */}
        <div className="camp-console">
          {hud && <SkillBar hud={hud} input={inputRef.current ?? undefined} />}

          {/* Campaign-only overlay: level, EXP bar and the panel buttons. */}
          <div className="camp-bar">
          <div className="camp-level">
            LV {exp.level}
            {exp.points > 0 && <span className="pip">+{exp.points}</span>}
          </div>
          {STAGES[live.stage]?.crucible ? (
            <div className="camp-wave">
              Wave {wave}
              <small>best {live.bestCrucibleWave ?? 0}</small>
            </div>
          ) : (
            STAGES[live.stage]?.survival && (
              <div className="camp-wave">
                Wave {wave}
                <small>best {live.bestSurvivalWave ?? 0}</small>
              </div>
            )
          )}
          {(STAGES[live.stage]?.crucible || STAGES[live.stage]?.dailyChallenge) &&
            crucibleAffixes.length > 0 && (
            <div className="camp-affixes" title={crucibleAffixes.map((a) => CRUCIBLE_AFFIX_META[a].blurb).join(" · ")}>
              {crucibleAffixes.map((a) => (
                <span key={a} className="camp-affix-pip">{CRUCIBLE_AFFIX_META[a].label}</span>
              ))}
            </div>
          )}
          {STAGES[live.stage]?.bossRush && (
            <div className="camp-wave">
              {bossRush.cleared
                ? "Cleared!"
                : `Boss ${Math.max(1, bossRush.index + 1)}/7`}
              <small>
                {bossRush.time.toFixed(1)}s
                {live.bestBossRushTime !== undefined && ` · best ${live.bestBossRushTime.toFixed(1)}s`}
              </small>
            </div>
          )}
          {STAGES[live.stage]?.dailyChallenge && (
            <div className="camp-wave">
              {dailyChallenge.cleared ? "Cleared!" : "Daily Rift"}
              <small>
                {dailyChallenge.time.toFixed(1)}s
                {live.dailyChallengeRecord?.date === todayKey() &&
                  live.dailyChallengeRecord?.bestTime !== undefined &&
                  ` · best today ${live.dailyChallengeRecord.bestTime.toFixed(1)}s`}
              </small>
            </div>
          )}
          {live.autoGrind && (
            <div className="camp-wave" title="Manual input is ignored while this is on — toggle it off to take back control.">
              ⚔️ Auto-Grinding…
            </div>
          )}
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
          <button className="btn btn-ghost camp-btn" onClick={() => setPanel("bounty")}>
            Bounty
          </button>
          <button className="btn btn-ghost camp-btn" onClick={() => setPanel("bestiary")}>
            Bestiary
          </button>
          <button className="btn btn-ghost camp-btn" onClick={() => setPanel("records")}>
            Records
          </button>
          {!STAGES[live.stage]?.isTown && (
            <button
              className={`btn camp-btn ${live.autoGrind ? "" : "btn-ghost"}`}
              title="AI-driven: walks to the nearest mob, uses E/R/F whenever they're off cooldown, and collects loot. No jumping, no Q/Shift — manual input is ignored while it's on."
              onClick={toggleAutoGrind}
            >
              {live.autoGrind ? "Auto-Grind: On" : "Auto-Grind"}
            </button>
          )}
          </div>
        </div>
      </div>

      {panel === "sheet" && (
        <div className="overlay" onClick={() => setPanel("none")}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <h2>
                  {getClass(live.classId).name}
                  {(live.ascension ?? 0) > 0 && (
                    <span className="ascension-badge">Ascension {live.ascension}</span>
                  )}
                </h2>
                {live.title && <div className="title-badge">&ldquo;{live.title}&rdquo;</div>}
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
            {live.level >= MAX_LEVEL && (
              <div className="ascend-prompt">
                <p>
                  You&apos;ve hit the level cap. Ascend to reset to level 1 in exchange for a
                  permanent +5% to health, mana and attack power — stacking with every
                  Ascension after this one. Gear, gold and stats already spent are untouched.
                </p>
                <button className="btn" onClick={ascendNow}>
                  Ascend to rank {(live.ascension ?? 0) + 1}
                </button>
              </div>
            )}
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
            <div className="talent-picker">
              <h3 className="section-title">
                Talents
                <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>
                  {(live.talents ?? []).length} / {MAX_TALENTS} chosen
                  {(live.talentPoints ?? 0) > 0 && ` · ${live.talentPoints} point${live.talentPoints === 1 ? "" : "s"} to spend`}
                </span>
              </h3>
              <div className="talent-list">
                {talentsFor(live.classId as ClassId).map((t) => {
                  const chosen = (live.talents ?? []).includes(t.id);
                  const full = (live.talents ?? []).length >= MAX_TALENTS;
                  return (
                    <div className={`talent-row${chosen ? " chosen" : ""}`} key={t.id}>
                      <div className="talent-info">
                        <strong>{t.name}</strong>
                        <small>{t.description}</small>
                      </div>
                      <button
                        className={`btn tiny ${chosen ? "" : "btn-ghost"}`}
                        disabled={chosen || full || (live.talentPoints ?? 0) <= 0}
                        onClick={() => pickTalent(t.id)}
                      >
                        {chosen ? "Chosen" : "Select"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {unlockedAuras(live).length > 0 && (
              <div className="aura-picker">
                <h3 className="section-title">Aura</h3>
                <div className="aura-swatches">
                  <button
                    className={`aura-swatch${!live.auraColor ? " active" : ""}`}
                    style={{ background: "transparent", border: "2px dashed var(--border)" }}
                    onClick={() => setAura(undefined)}
                    title="None"
                  />
                  {unlockedAuras(live).map((a) => (
                    <button
                      key={a.color}
                      className={`aura-swatch${live.auraColor === a.color ? " active" : ""}`}
                      style={{ background: a.color }}
                      onClick={() => setAura(a.color)}
                      title={a.label}
                    />
                  ))}
                </div>
              </div>
            )}
            {unlockedPrestigeTiers(live).length > 0 && (
              <div className="aura-picker">
                <h3 className="section-title">Prestige</h3>
                <p className="hint" style={{ marginBottom: 8 }}>
                  Cosmetic-only rewards for your Ascension rank — no stat effect.
                </p>
                <div className="aura-swatches">
                  <button
                    className={`aura-swatch${!live.weaponSkin ? " active" : ""}`}
                    style={{ background: "transparent", border: "2px dashed var(--border)" }}
                    onClick={() => setWeaponSkin(undefined)}
                    title="None"
                  />
                  {unlockedPrestigeTiers(live).map((t) => (
                    <button
                      key={t.rank}
                      className={`aura-swatch${live.weaponSkin === t.weaponSkin ? " active" : ""}`}
                      style={{ background: t.weaponSkin }}
                      onClick={() => setWeaponSkin(t.weaponSkin)}
                      title={`${t.label} (rank ${t.rank})`}
                    />
                  ))}
                </div>
                <div className="talent-list" style={{ marginTop: 8 }}>
                  {unlockedPrestigeTiers(live).map((t) => {
                    const active = live.title === t.title;
                    return (
                      <div className={`talent-row${active ? " chosen" : ""}`} key={t.rank}>
                        <div className="talent-info">
                          <strong>{t.label}</strong>
                          <small>&ldquo;{t.title}&rdquo; · rank {t.rank}</small>
                        </div>
                        <button
                          className={`btn tiny ${active ? "" : "btn-ghost"}`}
                          disabled={active}
                          onClick={() => setTitle(active ? undefined : t.title)}
                        >
                          {active ? "Equipped" : "Equip"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <AchievementsPanel save={live} onSetTitle={setTitle} />
          </div>
        </div>
      )}

      {panel === "inventory" && (
        <InventoryPanel
          save={live}
          rev={rev}
          onEquip={equip}
          onUnequip={unequip}
          onClose={closePanel}
        />
      )}

      {panel === "blacksmith" && (
        <BlacksmithPanel
          save={live}
          rev={rev}
          onSellAll={sellAllTrash}
          onSellAllGear={sellAllGear}
          onSellOne={sellOne}
          onBuyStones={buyStones}
          onEnhance={enhance}
          onEnhanceMany={enhanceMany}
          onRespec={respec}
          onBuyTownTier={buyTownTier}
          lastResult={shopMsg}
          onClose={closePanel}
        />
      )}

      {panel === "vendor" && (
        <VendorPanel
          save={live}
          rev={rev}
          onBuy={buyGear}
          onBuyFeatured={buyFeaturedGear}
          lastResult={shopMsg}
          onClose={closePanel}
        />
      )}

      {panel === "storage" && (
        <StoragePanel
          save={live}
          rev={rev}
          onStore={storeItem}
          onRetrieve={retrieveItem}
          onExpand={expandStorage}
          onClose={closePanel}
        />
      )}

      {panel === "map" && (
        <MapPanel
          stages={STAGES}
          currentIndex={live.stage}
          playerLevel={live.level}
          onTravel={travel}
          onClose={() => setPanel("none")}
        />
      )}

      {panel === "bounty" && (
        <BountyBoard
          save={live}
          onClaim={claimBounty}
          onClaimWeekly={claimWeekly}
          onClose={() => setPanel("none")}
        />
      )}

      {panel === "bestiary" && <BestiaryPanel save={live} onClose={() => setPanel("none")} />}

      {panel === "records" && <HallOfRecordsPanel save={live} onClose={() => setPanel("none")} />}

      {panel === "escape" && (
        <EscapeMenu
          onResume={() => {
            inputRef.current?.setBindings(loadCustomBindings());
            setPanel("none");
          }}
          onShowTutorial={() => setPanel("tutorial")}
          save={live}
        />
      )}

      {panel === "combo" && (
        <ComboMenu
          classId={live.classId as ClassId}
          onClose={() => setPanel("none")}
        />
      )}

      {panel === "tutorial" && <TutorialOverlay onClose={() => setPanel("none")} />}
    </div>
  );
}

/** "+85 HP", "+20 MP", "20% shorter skill cooldowns" — one set bonus tier, human-readable. */
function describeSetBonus(b: {
  stats: { hp?: number; attack?: number; mana?: number };
  effect?: { kind: ItemEffect; value: number };
}): string {
  const parts: string[] = [];
  if (b.stats.hp) parts.push(`+${b.stats.hp} HP`);
  if (b.stats.attack) parts.push(`+${b.stats.attack} ATK`);
  if (b.stats.mana) parts.push(`+${b.stats.mana} MP`);
  if (b.effect) parts.push(EFFECT_META[b.effect.kind].describe(b.effect.value));
  return parts.join(" ");
}

/** Lists every achievement, checked off as it unlocks, with an equip button
 *  for the title text it grants — the character sheet's own section, not a
 *  separate panel, since there's nothing else competing for that space. */
function AchievementsPanel({
  save,
  onSetTitle,
}: {
  save: AdventureSave;
  onSetTitle: (title: string | undefined) => void;
}) {
  const unlocked = new Set(save.achievements ?? []);
  return (
    <div className="achievements-panel">
      <h3 className="section-title">
        Achievements ({unlocked.size}/{ACHIEVEMENTS.length})
      </h3>
      <div className="achievement-list">
        {ACHIEVEMENTS.map((a) => {
          const done = unlocked.has(a.id);
          const active = save.title === a.title;
          return (
            <div className={`achievement-row${done ? " done" : ""}`} key={a.id}>
              <span className="achievement-main">
                <strong>{done ? "✓ " : "○ "}{a.name}</strong>
                <small>{done ? `"${a.title}"` : a.description}</small>
              </span>
              {done && (
                <button
                  className="btn tiny btn-ghost"
                  disabled={active}
                  onClick={() => onSetTitle(active ? undefined : a.title)}
                >
                  {active ? "Equipped" : "Equip"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DerivedPanel({ save }: { save: AdventureSave }) {
  const d = deriveArenaStats(
    getClass(save.classId),
    save.level,
    save.stats,
    save.equipped,
    save.ascension ?? 0,
    save.talents ?? []
  );
  const cls = getClass(save.classId);
  const sets = activeSetProgress(save.equipped);
  return (
    <>
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
      {sets.length > 0 && (
        <div className="set-bonuses">
          <h3 className="section-title">Gear Sets</h3>
          {sets.map((s) => (
            <div className="set-row" key={s.id}>
              <div className="set-row-head">
                <strong>{s.name}</strong>
                <span>{s.count} equipped</span>
              </div>
              <div className="set-tiers">
                {s.bonuses.map((b) => (
                  <span key={b.count} className={b.active ? "set-tier active" : "set-tier"}>
                    {b.count}pc {describeSetBonus(b)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function readIntent(input: ArenaInput): Intent {
  const b = input.getBindings();
  const i = emptyIntent();
  i.moveX = input.moveX();
  i.sprint = input.isSprinting();
  i.up = input.isDown(b.up);
  i.down = input.isDown(b.down);
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
    playerCdr: p.cdr,
    enemyName: hasFoe ? `${foe.name} Lv${foe.level}` : engine.stage.name,
    enemyClass: p.classId,
    enemyHp: hasFoe ? Math.round(foe.hp) : 0,
    enemyMaxHp: hasFoe ? foe.maxHp : 1,
    enemyMana: 0,
    enemyMaxMana: 1,
    hideEnemyMana: true,
    cooldowns: { ...p.cooldowns },
    comboStacks: p.comboKillerStacks,
    hitStreak: p.hitStreak,
    lmbChain: p.lmbChain,
    rmbChain: p.rmbChain,
    manaflowCharge: input.bothButtonsHeld / MANASTOP_HOLD,
    sprinting: p.sprinting,
    stoic: p.stoicTimer,
    burn: p.burnTimer,
    poison: p.poisonTimer,
    freeze: p.freezeTimer,
    shock: p.shockTimer,
    state: p.state,
    nearNpc: engine.nearBlacksmith
      ? "Blacksmith"
      : engine.nearVendor
        ? "Vendor"
        : engine.nearBank
          ? "Storage"
          : null,
  };
}

/** Difficulty picker for a brand-new character — locked in for the
 *  character's life, same as the class choice, so it's shown once here and
 *  never again after "Begin the Campaign". */
function DifficultyPicker({
  difficulty,
  setDifficulty,
}: {
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
}) {
  const ids = Object.keys(DIFFICULTY_META) as Difficulty[];
  return (
    <div className="mt-4 pt-4 border-t border-outline-variant/20">
      <h3 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-2">
        Difficulty
      </h3>
      <div className="flex gap-2">
        {ids.map((id) => {
          const meta = DIFFICULTY_META[id];
          const isPicked = difficulty === id;
          return (
            <button
              key={id}
              className={`flex-1 p-2 border transition-colors text-left ${
                isPicked ? "border-paragon-gold bg-paragon-gold/10" : "border-outline-variant/30"
              }`}
              onClick={() => setDifficulty(id)}
              title={meta.blurb}
            >
              <strong className="block text-on-surface text-sm">{meta.label}</strong>
              <small className="text-on-surface-variant text-xs">{meta.blurb}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CharacterGate({
  save,
  onStart,
  onWipe,
  onImport,
}: {
  save: AdventureSave | null;
  onStart: (s: AdventureSave) => void;
  onWipe: () => void;
  onImport: (file: File) => void;
}) {
  const [picked, setPicked] = useState<ClassId>("paragon");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const ids = Object.keys(CLASSES) as ClassId[];

  if (save) {
    const cls = getClass(save.classId);
    const d = deriveArenaStats(
      cls,
      save.level,
      save.stats,
      save.equipped,
      save.ascension ?? 0,
      save.talents ?? []
    );
    return (
      <main className="landing-page font-body-md text-body-md min-h-screen bg-void-black text-on-surface px-margin-mobile py-12 md:py-16">
        <div className="max-w-2xl mx-auto space-y-stack-lg">
          <div className="flex items-center justify-between">
            <BackToHome />
            <div className="font-display-hero text-headline-lg text-paragon-gold tracking-tighter">
              PARAGON
            </div>
          </div>

          <header className="text-center space-y-stack-sm">
            <h1 className="font-display-hero text-headline-lg-mobile md:text-display-hero text-paragon-gold gold-glow-text uppercase tracking-tighter leading-none">
              CAMPAIGN
            </h1>
            <p className="text-on-surface-variant leading-relaxed">
              The same 2D arena, the same skills and movement — now with mobs, experience and
              levels.
            </p>
          </header>

          <section className="glass-panel border border-primary/20 p-8">
            <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-4">
              Your Fighter
            </h2>
            <div className="flex justify-between items-baseline">
              <strong className="text-xl text-on-surface">
                {cls.name}
                {(save.ascension ?? 0) > 0 && (
                  <span className="ascension-badge">Ascension {save.ascension}</span>
                )}
                {save.difficulty && save.difficulty !== "normal" && (
                  <span className="ascension-badge">{DIFFICULTY_META[save.difficulty].label}</span>
                )}
                {save.title && <span className="title-badge inline">&ldquo;{save.title}&rdquo;</span>}
              </strong>
              <span className="text-paragon-gold font-section-label text-section-label">
                Level {save.level}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-outline-variant/20">
              <div className="space-y-1">
                <span className="block font-section-label text-[10px] uppercase text-on-surface-variant">
                  Power
                </span>
                <strong className="text-on-surface">{d.power.toLocaleString()}</strong>
              </div>
              <div className="space-y-1">
                <span className="block font-section-label text-[10px] uppercase text-on-surface-variant">
                  Kills
                </span>
                <strong className="text-on-surface">{save.kills}</strong>
              </div>
              <div className="space-y-1">
                <span className="block font-section-label text-[10px] uppercase text-on-surface-variant">
                  Deaths
                </span>
                <strong className="text-on-surface">{save.deaths}</strong>
              </div>
            </div>
            {save.statPoints > 0 && (
              <p className="text-secondary text-sm mt-4">{save.statPoints} unspent stat points.</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 bg-paragon-gold text-void-black py-3 font-section-label text-section-label uppercase tracking-widest font-bold glow-border-gold transition-all hover:scale-105"
                onClick={() => onStart(save)}
              >
                Continue
              </button>
              <button
                className="px-6 py-3 border border-error/50 text-error font-section-label text-section-label uppercase tracking-widest transition-colors hover:bg-error/10"
                onClick={() => {
                  if (window.confirm("Delete this campaign character?")) onWipe();
                }}
              >
                Delete
              </button>
            </div>
            <div className="flex gap-3 mt-3 text-xs">
              <label className="flex-1 text-on-surface-variant hover:text-on-surface underline underline-offset-2 cursor-pointer text-center">
                Import a save file
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (window.confirm("This replaces your current character with the imported save. Continue?")) {
                      onImport(file);
                    }
                  }}
                />
              </label>
            </div>
          </section>

          <Link
            href="/arena"
            className="block text-center border-2 border-mana-glow text-mana-glow py-3 font-section-label text-section-label uppercase tracking-widest font-bold transition-all hover:bg-mana-glow/10 hover:scale-[1.02]"
          >
            Duel mode instead
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="landing-page font-body-md text-body-md min-h-screen bg-void-black text-on-surface px-margin-mobile py-12 md:py-16">
      <div className="max-w-2xl mx-auto space-y-stack-lg">
        <div className="flex items-center justify-between">
          <BackToHome />
          <div className="font-display-hero text-headline-lg text-paragon-gold tracking-tighter">
            PARAGON
          </div>
        </div>

        <header className="text-center space-y-stack-sm">
          <h1 className="font-display-hero text-headline-lg-mobile md:text-display-hero text-paragon-gold gold-glow-text uppercase tracking-tighter leading-none">
            CAMPAIGN
          </h1>
          <p className="text-on-surface-variant leading-relaxed">
            Pick a class and fight through three stages of mobs. Identical movement, combos
            and skills to the duel — plus experience and levels.
          </p>
        </header>

        <section className="glass-panel border border-primary/20 p-8">
          <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-4">
            Choose Your Class
          </h2>
          <div className="space-y-3">
            {ids.map((id) => {
              const c = getClass(id);
              const isPicked = picked === id;
              return (
                <button
                  key={id}
                  className={`w-full flex items-center gap-4 p-3 border transition-colors text-left ${
                    isPicked
                      ? "border-paragon-gold bg-paragon-gold/10"
                      : "border-outline-variant/30 hover:border-primary/40"
                  }`}
                  style={{ "--aura": c.colors.aura } as React.CSSProperties}
                  onClick={() => setPicked(id)}
                >
                  <ClassPortrait classId={id} aura={c.colors.aura} size={52} />
                  <span className="flex-1 min-w-0">
                    <strong className="block text-on-surface">{c.name}</strong>
                    <small className="text-on-surface-variant text-xs">
                      {c.maxHp} HP · {c.maxMana} {c.manaLabel} · {c.weapon}
                    </small>
                  </span>
                  <span
                    className={`font-section-label text-[10px] uppercase tracking-widest px-2 py-1 ${
                      isPicked ? "bg-paragon-gold text-void-black" : "text-outline"
                    }`}
                  >
                    {isPicked ? "PICKED" : "PICK"}
                  </span>
                </button>
              );
            })}
          </div>
          <DifficultyPicker difficulty={difficulty} setDifficulty={setDifficulty} />
          <button
            className="w-full mt-6 bg-paragon-gold text-void-black py-4 font-section-label text-section-label uppercase tracking-widest font-bold glow-border-gold transition-all hover:scale-105"
            onClick={() => onStart(createAdventureSave(picked, difficulty))}
          >
            Begin the Campaign
          </button>
          <label className="block w-full mt-3 text-center text-xs text-on-surface-variant hover:text-on-surface underline underline-offset-2 cursor-pointer">
            Or import an existing save file
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onImport(file);
              }}
            />
          </label>
        </section>
      </div>
    </main>
  );
}
