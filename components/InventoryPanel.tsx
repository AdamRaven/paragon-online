"use client";

import { memo, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ItemIcon } from "@/components/ItemIcon";
import {
  EFFECT_META,
  RARITY_META,
  SET_NAME,
  base,
  familySlots,
  itemColor,
  itemLore,
  itemName,
  itemScore,
  itemStats,
  itemValue,
  weakestInFamily,
  type EquipSlot,
  type Item,
  type SlotFamily,
} from "@/lib/arena/items";
import type { AdventureSave } from "@/lib/arena/progression";

const SLOT_META: Record<EquipSlot, { label: string; hint: string; glyph: string }> = {
  weapon: { label: "Weapon", hint: "Raises attack power", glyph: "⚔" },
  helmet: { label: "Helmet", hint: "Health and mana", glyph: "🪖" },
  chest: { label: "Chest", hint: "Raises health", glyph: "🛡" },
  legs: { label: "Boots", hint: "Raises health", glyph: "👢" },
  hands: { label: "Gloves", hint: "Health and attack", glyph: "🧤" },
  necklace: { label: "Necklace", hint: "Mana and utility", glyph: "📿" },
  belt: { label: "Belt", hint: "Health and attack", glyph: "🎗" },
  earring1: { label: "Earring", hint: "Mana and utility", glyph: "◎" },
  earring2: { label: "Earring", hint: "Mana and utility", glyph: "◎" },
  ring1: { label: "Ring", hint: "Health and attack", glyph: "◈" },
  ring2: { label: "Ring", hint: "Health and attack", glyph: "◈" },
};

/** Where each slot sits in the paper-doll grid — see .paper-doll in globals.css. */
const SLOT_GRID_AREA: Record<EquipSlot, string> = {
  helmet: "helmet",
  necklace: "necklace",
  earring1: "earring1",
  earring2: "earring2",
  weapon: "weapon",
  chest: "chest",
  ring1: "ring1",
  belt: "belt",
  ring2: "ring2",
  hands: "hands",
  legs: "legs",
};

/** "+8 ATK  +40 HP" — the stat contribution of one item. */
export function statLine(item: Item): string {
  const s = itemStats(item);
  const parts: string[] = [];
  if (s.attack) parts.push(`+${s.attack} ATK`);
  if (s.hp) parts.push(`+${s.hp} HP`);
  if (s.mana) parts.push(`+${s.mana} MP`);
  return parts.join("   ") || "—";
}

/** A legendary's magical affix, e.g. "Heal for 14% of damage dealt". */
export function effectLine(item: Item): string | null {
  if (!item.effect) return null;
  return EFFECT_META[item.effect.kind].describe(item.effect.value);
}

/** Difference in attack/hp against whatever occupies the same slot. */
export function compare(item: Item, equipped?: Item): { text: string; good: boolean } | null {
  if (!equipped) return null;
  const d = itemScore(item) - itemScore(equipped);
  if (Math.abs(d) < 0.5) return null;
  return { text: d > 0 ? "UPGRADE" : "worse", good: d > 0 };
}

/** Per-stat breakdown against whatever's currently equipped in the slot —
 *  the single UPGRADE/worse badge above says "better or worse", this says
 *  "by how much, and in what." Empty when there's nothing to compare (an
 *  open slot, or every stat tied). */
function statDeltas(item: Item, equipped?: Item): Array<{ label: string; delta: number; pct?: boolean }> {
  const a = itemStats(item);
  const b = equipped ? itemStats(equipped) : {};
  const rows: Array<{ label: string; delta: number; pct?: boolean }> = [];
  const push = (label: string, delta: number, pct?: boolean) => {
    if (Math.abs(delta) > (pct ? 0.001 : 0.4)) rows.push({ label, delta, pct });
  };
  push("ATK", (a.attack ?? 0) - (b.attack ?? 0));
  push("HP", (a.hp ?? 0) - (b.hp ?? 0));
  push("MP", (a.mana ?? 0) - (b.mana ?? 0));
  return rows;
}

/**
 * Whichever currently-equipped item a candidate for this item's slot family
 * should be judged against — `undefined` when the family (earrings, rings)
 * still has an open slot, since there's nothing to compare against yet.
 */
export function referenceFor(save: AdventureSave, family: SlotFamily | undefined): Item | undefined {
  if (!family) return undefined;
  return weakestInFamily(save.equipped, family);
}

export function hasOpenSlot(save: AdventureSave, family: SlotFamily | undefined): boolean {
  if (!family) return false;
  return familySlots(family).some((s) => !save.equipped[s]);
}

/**
 * Floats upgrades to the top of the backpack so the player never has to hunt
 * for the one weapon drop that actually helps — an empty slot counts as an
 * upgrade too (there's nothing better to compare against). Everything else
 * keeps its original order rather than being fully re-sorted by stats, so
 * the list doesn't reshuffle itself every time a mob drops junk.
 */
function withUpgradesFirst(items: Item[], save: AdventureSave): Item[] {
  return items
    .map((item, idx) => {
      const family = base(item.baseId).slot;
      const open = hasOpenSlot(save, family);
      const ref = open ? undefined : referenceFor(save, family);
      const upgrade = open || !ref || itemScore(item) - itemScore(ref) > 0.5;
      return { item, idx, upgrade, score: itemScore(item) };
    })
    .sort((a, b) => {
      if (a.upgrade !== b.upgrade) return a.upgrade ? -1 : 1;
      return a.upgrade ? b.score - a.score : a.idx - b.idx;
    })
    .map((s) => s.item);
}

/**
 * The rich hover card: full stats, the legendary affix if any, gold value
 * and a one-line joke about the thing's history. Rendered through a portal
 * straight onto `document.body` and positioned in fixed (viewport) space
 * from the hovered element's own rect, so it can never get clipped by the
 * inventory sheet's own scroll container the way an in-flow tooltip would.
 */
function ItemHoverCard({
  item,
  rect,
  compareTo,
}: {
  item: Item;
  rect: DOMRect;
  compareTo?: Item;
}) {
  const b = base(item.baseId);
  const r = RARITY_META[item.rarity];
  const color = itemColor(item);
  const fx = effectLine(item);
  const deltas = compareTo ? statDeltas(item, compareTo) : [];
  const width = 230;
  const margin = 10;
  const left = Math.max(
    margin,
    Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2)
  );
  const top = Math.min(window.innerHeight - margin, rect.bottom + 8);
  return createPortal(
    <div className="item-hover-card" style={{ left, top, width }}>
      {b.unique && <div className="item-hover-unique">★ Unique</div>}
      <strong style={{ color }}>{itemName(item)}</strong>
      <small className="item-hover-sub">
        {r.label} · {b.kind}
        {b.tier ? ` · tier ${b.tier}` : ""}
      </small>
      <div className="item-hover-stats">{statLine(item)}</div>
      {deltas.length > 0 && (
        <div className="item-hover-delta">
          <small>vs equipped</small>
          {deltas.map((d) => (
            <span key={d.label} className={d.delta > 0 ? "cmp-up" : "cmp-down"}>
              {d.delta > 0 ? "+" : ""}
              {d.pct ? `${Math.round(d.delta * 100)}%` : Math.round(d.delta)} {d.label}
            </span>
          ))}
        </div>
      )}
      {fx && (
        <div className="item-hover-effect" style={{ color: r.color }}>
          {fx}
        </div>
      )}
      {b.setId && (
        <div className="item-hover-set">{SET_NAME[b.setId]} Set</div>
      )}
      <div className="item-hover-price">{itemValue(item)}g</div>
      <p className="item-hover-lore">&ldquo;{itemLore(item)}&rdquo;</p>
    </div>,
    document.body
  );
}

/**
 * Wires up the show-on-hover behavior for the card above and hands back
 * everything a plain `<div>` needs to opt in — no wrapper element, so it
 * drops straight onto an existing row/card without disturbing whatever grid
 * or flex layout it's already participating in. `item` can be undefined
 * (an empty equip slot): the ref/handlers still attach, they just never
 * produce a card, which is exactly "no popup on an empty slot".
 */
function useItemHoverCard(item: Item | undefined, compareTo?: Item) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  return {
    ref,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    card:
      hovered && item && ref.current ? (
        <ItemHoverCard item={item} rect={ref.current.getBoundingClientRect()} compareTo={compareTo} />
      ) : null,
  };
}

export function ItemRow({
  item,
  actions,
  compareTo,
  slotEmpty,
}: {
  item: Item;
  actions?: React.ReactNode;
  compareTo?: Item;
  /** The item's slot exists but has nothing equipped — always an upgrade. */
  slotEmpty?: boolean;
}) {
  const b = base(item.baseId);
  const r = RARITY_META[item.rarity];
  const color = itemColor(item);
  const cmp = compare(item, compareTo);
  const fx = effectLine(item);
  const hover = useItemHoverCard(item, compareTo);
  return (
    <div
      className="item-row"
      style={{ borderLeft: `4px solid ${color}` }}
      ref={hover.ref}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <ItemIcon icon={b.icon} color={color} />
      <span className="item-main">
        <strong style={{ color }}>{itemName(item)}</strong>
        <small className="item-stats">{statLine(item)}</small>
        {fx && (
          <small className="item-effect" style={{ color }}>
            {fx}
          </small>
        )}
        <small className="item-sub">
          {r.label} · {b.kind}
          {cmp ? (
            <em className={cmp.good ? "cmp-up" : "cmp-down"}> · {cmp.text}</em>
          ) : (
            slotEmpty && <em className="cmp-up"> · EQUIP</em>
          )}
        </small>
      </span>
      <span className="item-value">{itemValue(item)}g</span>
      {actions}
      {hover.card}
    </div>
  );
}

/** One paper-doll card. Its own component (not inlined in a `.map()`) purely
 *  so each of the 11 slots gets its own hover-card hook instance. */
function SlotCard({
  slot,
  item,
  onUnequip,
}: {
  slot: EquipSlot;
  item?: Item;
  onUnequip: (slot: EquipSlot) => void;
}) {
  const meta = SLOT_META[slot];
  const color = item ? itemColor(item) : null;
  const hover = useItemHoverCard(item);
  return (
    <div
      ref={hover.ref}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
      className={`slot-card${item ? "" : " empty"}`}
      style={
        {
          ...(color ? { borderColor: color } : {}),
          "--slot-area": SLOT_GRID_AREA[slot],
        } as React.CSSProperties
      }
      title={item ? undefined : `${meta.label} — Empty · ${meta.hint}`}
    >
      {item ? (
        <ItemIcon icon={base(item.baseId).icon} color={color!} size={28} />
      ) : (
        <span className="slot-glyph">{meta.glyph}</span>
      )}
      <span className="slot-body">
        <span className="slot-name">{meta.label}</span>
        {item ? (
          <strong style={{ color: color! }}>{itemName(item)}</strong>
        ) : (
          <small className="slot-hint">Empty</small>
        )}
      </span>
      {item && (
        <button className="btn btn-ghost tiny" onClick={() => onUnequip(slot)}>
          ✕
        </button>
      )}
      {hover.card}
    </div>
  );
}

export const InventoryPanel = memo(function InventoryPanel({
  save,
  onEquip,
  onUnequip,
  onClose,
}: {
  save: AdventureSave;
  /** Bumped on every mutation (see AdventureClient's `mutate`) — `save` is
   *  the engine's live object and never changes reference on its own, so
   *  this is what lets React.memo know real data changed vs. an unrelated
   *  parent re-render (e.g. the ~15Hz combat HUD tick). */
  rev: number;
  onEquip: (item: Item) => void;
  onUnequip: (slot: EquipSlot) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"gear" | "trash">("gear");
  const gear = useMemo(
    () =>
      withUpgradesFirst(
        save.inventory.filter((i) => base(i.baseId).kind !== "trash"),
        save
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save.inventory, save.equipped]
  );
  const trash = useMemo(
    () => save.inventory.filter((i) => base(i.baseId).kind === "trash"),
    [save.inventory]
  );
  const trashWorth = useMemo(() => trash.reduce((n, i) => n + itemValue(i), 0), [trash]);
  const list = tab === "gear" ? gear : trash;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide bag-v2" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Inventory</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {save.gold} gold · {save.stones} stones
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close (I)
          </button>
        </div>

        <div className="inv-layout">
          {/* ---- equipment ------------------------------------------------ */}
          <section>
            <h3 className="section-title">Equipped</h3>
            <div className="paper-doll">
              {(Object.keys(SLOT_META) as EquipSlot[]).map((slot) => (
                <SlotCard key={slot} slot={slot} item={save.equipped[slot]} onUnequip={onUnequip} />
              ))}
            </div>
          </section>

          {/* ---- backpack -------------------------------------------------- */}
          <section className="backpack-section">
            <h3 className="section-title">Backpack</h3>
            <div className="tab-row small">
              <button
                className={`btn ${tab === "gear" ? "" : "btn-ghost"} tab`}
                onClick={() => setTab("gear")}
              >
                Gear ({gear.length})
              </button>
              <button
                className={`btn ${tab === "trash" ? "" : "btn-ghost"} tab`}
                onClick={() => setTab("trash")}
              >
                Trash ({trash.length})
              </button>
            </div>

            <div className="item-list tall">
              {list.length === 0 && (
                <p className="hint">
                  {tab === "gear"
                    ? "No gear yet — keep killing, mobs drop it."
                    : "No trash yet. Most kills drop something to sell."}
                </p>
              )}
              {list.map((item) => {
                const family = base(item.baseId).slot;
                const open = hasOpenSlot(save, family);
                return (
                  <ItemRow
                    key={item.uid}
                    item={item}
                    compareTo={open ? undefined : referenceFor(save, family)}
                    slotEmpty={open}
                    actions={
                      family ? (
                        <button className="btn tiny" onClick={() => onEquip(item)}>
                          Equip
                        </button>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>

            {tab === "trash" && trash.length > 0 && (
              <p className="hint" style={{ marginTop: 10 }}>
                Worth <strong style={{ color: "var(--exp)" }}>{trashWorth}g</strong> at
                the Emberhold blacksmith (travel with M, then press E at the forge).
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
});
