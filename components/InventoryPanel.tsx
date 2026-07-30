"use client";

import { useState } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import {
  EFFECT_META,
  RARITY_META,
  base,
  itemName,
  itemStats,
  itemValue,
  type EquipSlot,
  type Item,
} from "@/lib/arena/items";
import type { AdventureSave } from "@/lib/arena/progression";

const SLOT_META: Record<EquipSlot, { label: string; hint: string; glyph: string }> = {
  weapon: { label: "Weapon", hint: "Raises attack power", glyph: "⚔" },
  armor: { label: "Armour", hint: "Raises health", glyph: "🛡" },
  trinket: { label: "Trinket", hint: "Mana and speed", glyph: "◈" },
};

/** "+8 ATK  +40 HP" — the stat contribution of one item. */
export function statLine(item: Item): string {
  const s = itemStats(item);
  const parts: string[] = [];
  if (s.attack) parts.push(`+${s.attack} ATK`);
  if (s.hp) parts.push(`+${s.hp} HP`);
  if (s.mana) parts.push(`+${s.mana} MP`);
  if (s.speed) parts.push(`+${Math.round(s.speed * 100)}% SPD`);
  if (s.atkSpeed) parts.push(`+${Math.round(s.atkSpeed * 100)}% AS`);
  return parts.join("   ") || "—";
}

/** A legendary's magical affix, e.g. "Heal for 14% of damage dealt". */
export function effectLine(item: Item): string | null {
  if (!item.effect) return null;
  return EFFECT_META[item.effect.kind].describe(item.effect.value);
}

/** A single weighted number so items can be ranked, not just labelled. */
function statScore(item: Item): number {
  const s = itemStats(item);
  // A legendary affix is worth chasing even over a plain stat upgrade; an
  // epic's weaker "junior" version of one is still worth a solid nudge.
  const effectBonus = item.effect ? (item.rarity === "legendary" ? 250 : 130) : 0;
  return (
    (s.attack ?? 0) * 4 +
    (s.hp ?? 0) * 0.4 +
    (s.mana ?? 0) * 0.2 +
    (s.speed ?? 0) * 200 +
    (s.atkSpeed ?? 0) * 200 +
    effectBonus
  );
}

/** Difference in attack/hp against whatever occupies the same slot. */
export function compare(item: Item, equipped?: Item): { text: string; good: boolean } | null {
  if (!equipped) return null;
  const d = statScore(item) - statScore(equipped);
  if (Math.abs(d) < 0.5) return null;
  return { text: d > 0 ? "UPGRADE" : "worse", good: d > 0 };
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
      const slot = base(item.baseId).slot;
      const equipped = slot ? save.equipped[slot] : undefined;
      const upgrade = !equipped || statScore(item) - statScore(equipped) > 0.5;
      return { item, idx, upgrade, score: statScore(item) };
    })
    .sort((a, b) => {
      if (a.upgrade !== b.upgrade) return a.upgrade ? -1 : 1;
      return a.upgrade ? b.score - a.score : a.idx - b.idx;
    })
    .map((s) => s.item);
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
  const cmp = compare(item, compareTo);
  const fx = effectLine(item);
  return (
    <div className="item-row" style={{ borderLeft: `4px solid ${r.color}` }}>
      <ItemIcon icon={b.icon} color={r.color} />
      <span className="item-main">
        <strong style={{ color: r.color }}>{itemName(item)}</strong>
        <small className="item-stats">{statLine(item)}</small>
        {fx && (
          <small className="item-effect" style={{ color: r.color }}>
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
    </div>
  );
}

export function InventoryPanel({
  save,
  onEquip,
  onUnequip,
  onClose,
}: {
  save: AdventureSave;
  onEquip: (item: Item) => void;
  onUnequip: (slot: EquipSlot) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"gear" | "trash">("gear");
  const gear = withUpgradesFirst(
    save.inventory.filter((i) => base(i.baseId).kind !== "trash"),
    save
  );
  const trash = save.inventory.filter((i) => base(i.baseId).kind === "trash");
  const trashWorth = trash.reduce((n, i) => n + itemValue(i), 0);
  const list = tab === "gear" ? gear : trash;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
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
            <div className="slot-column">
              {(Object.keys(SLOT_META) as EquipSlot[]).map((slot) => {
                const item = save.equipped[slot];
                const meta = SLOT_META[slot];
                const r = item ? RARITY_META[item.rarity] : null;
                return (
                  <div
                    key={slot}
                    className={`slot-card${item ? "" : " empty"}`}
                    style={r ? { borderColor: r.color } : undefined}
                  >
                    {item ? (
                      <ItemIcon icon={base(item.baseId).icon} color={r!.color} size={34} />
                    ) : (
                      <span className="slot-glyph">{meta.glyph}</span>
                    )}
                    <span className="slot-body">
                      <span className="slot-name">{meta.label}</span>
                      {item ? (
                        <>
                          <strong style={{ color: r!.color }}>{itemName(item)}</strong>
                          <small className="item-stats">{statLine(item)}</small>
                          {effectLine(item) && (
                            <small className="item-effect" style={{ color: r!.color }}>
                              {effectLine(item)}
                            </small>
                          )}
                        </>
                      ) : (
                        <small className="slot-hint">Empty · {meta.hint}</small>
                      )}
                    </span>
                    {item && (
                      <button className="btn btn-ghost tiny" onClick={() => onUnequip(slot)}>
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---- backpack -------------------------------------------------- */}
          <section>
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
                const slot = base(item.baseId).slot;
                return (
                  <ItemRow
                    key={item.uid}
                    item={item}
                    compareTo={slot ? save.equipped[slot] : undefined}
                    slotEmpty={!!slot && !save.equipped[slot]}
                    actions={
                      slot ? (
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
                the Emberhold merchant (travel with M, then press E at the stall).
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
