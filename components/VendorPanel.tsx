"use client";

import { ItemIcon } from "@/components/ItemIcon";
import { statLine } from "@/components/InventoryPanel";
import {
  ITEM_BASES,
  RARITY_META,
  itemName,
  itemValue,
  makeItem,
  type Item,
  type ItemBase,
} from "@/lib/arena/items";
import type { AdventureSave } from "@/lib/arena/progression";

/** The vendor only stocks gear roughly around the player's level. */
function stock(level: number): ItemBase[] {
  return Object.values(ITEM_BASES)
    .filter((b) => b.kind !== "trash" && b.tier <= level + 3)
    .sort((a, b) => a.tier - b.tier);
}

export function VendorPanel({
  save,
  onBuy,
  lastResult,
  onClose,
}: {
  save: AdventureSave;
  onBuy: (baseId: string) => void;
  lastResult: string | null;
  onClose: () => void;
}) {
  const items = stock(save.level);
  const preview = (baseId: string): Item => makeItem(baseId, "common");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Gear Vendor</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {save.gold} gold
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Leave (Esc)
          </button>
        </div>

        <p className="hint" style={{ marginBottom: 12 }}>
          Fresh, unenhanced gear. Stock grows as you level up.
        </p>

        {lastResult && <div className="merchant-result">{lastResult}</div>}

        <div className="item-list tall">
          {items.map((b) => {
            const item = preview(b.id);
            const price = itemValue(item);
            const afford = save.gold >= price;
            return (
              <div className="item-row" key={b.id} style={{ borderLeft: `4px solid ${RARITY_META.common.color}` }}>
                <ItemIcon icon={b.icon} color={RARITY_META.common.color} />
                <span className="item-main">
                  <strong>{itemName(item)}</strong>
                  <small className="item-stats">{statLine(item)}</small>
                  <small className="item-sub">{b.kind} · tier {b.tier}</small>
                </span>
                <span className="item-value">{price}g</span>
                <button className="btn tiny" disabled={!afford} onClick={() => onBuy(b.id)}>
                  Buy
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
