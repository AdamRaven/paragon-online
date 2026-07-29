"use client";

import { useState } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import {
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
  return parts.join("   ") || "—";
}

/** Difference in attack/hp against whatever occupies the same slot. */
function compare(item: Item, equipped?: Item): { text: string; good: boolean } | null {
  if (!equipped) return null;
  const a = itemStats(item);
  const b = itemStats(equipped);
  const d =
    (a.attack ?? 0) * 4 + (a.hp ?? 0) * 0.4 + (a.mana ?? 0) * 0.2 + (a.speed ?? 0) * 200 -
    ((b.attack ?? 0) * 4 + (b.hp ?? 0) * 0.4 + (b.mana ?? 0) * 0.2 + (b.speed ?? 0) * 200);
  if (Math.abs(d) < 0.5) return null;
  return { text: d > 0 ? "UPGRADE" : "worse", good: d > 0 };
}

export function ItemRow({
  item,
  actions,
  compareTo,
}: {
  item: Item;
  actions?: React.ReactNode;
  compareTo?: Item;
}) {
  const b = base(item.baseId);
  const r = RARITY_META[item.rarity];
  const cmp = compare(item, compareTo);
  return (
    <div className="item-row" style={{ borderLeft: `4px solid ${r.color}` }}>
      <ItemIcon icon={b.icon} color={r.color} />
      <span className="item-main">
        <strong style={{ color: r.color }}>{itemName(item)}</strong>
        <small className="item-stats">{statLine(item)}</small>
        <small className="item-sub">
          {r.label} · {b.kind}
          {cmp && (
            <em className={cmp.good ? "cmp-up" : "cmp-down"}> · {cmp.text}</em>
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
  const gear = save.inventory.filter((i) => base(i.baseId).kind !== "trash");
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
