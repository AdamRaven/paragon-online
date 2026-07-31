"use client";

import { ItemIcon } from "@/components/ItemIcon";
import { compare, effectLine, hasOpenSlot, referenceFor, statLine } from "@/components/InventoryPanel";
import { featuredBaseId } from "@/lib/arena/featuredItem";
import {
  ITEM_BASES,
  RARITY_META,
  base,
  itemName,
  itemValue,
  makeItem,
  type Item,
  type ItemBase,
} from "@/lib/arena/items";
import type { AdventureSave } from "@/lib/arena/progression";

/** The vendor only stocks gear roughly around the player's level — uniques
 *  are never for sale, only a boss kill drops one. */
function stock(level: number): ItemBase[] {
  return Object.values(ITEM_BASES)
    .filter((b) => b.kind !== "trash" && !b.unique && b.tier <= level + 3)
    .sort((a, b) => a.tier - b.tier);
}

export function VendorPanel({
  save,
  onBuy,
  onBuyFeatured,
  lastResult,
  onClose,
}: {
  save: AdventureSave;
  onBuy: (baseId: string) => void;
  onBuyFeatured: () => void;
  lastResult: string | null;
  onClose: () => void;
}) {
  const items = stock(save.level);
  const preview = (baseId: string): Item => makeItem(baseId, "common");

  const featuredBase = base(featuredBaseId());
  const featured = makeItem(featuredBase.id, "epic");
  const featuredPrice = itemValue(featured);
  const featuredOpen = hasOpenSlot(save, featuredBase.slot);
  const featuredCmp = featuredOpen ? undefined : compare(featured, referenceFor(save, featuredBase.slot));

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

        <h3 className="section-title">Featured This Week</h3>
        <div
          className="item-row"
          style={{ borderLeft: `4px solid ${RARITY_META.epic.color}`, marginBottom: 14 }}
        >
          <ItemIcon icon={featuredBase.icon} color={RARITY_META.epic.color} />
          <span className="item-main">
            <strong style={{ color: RARITY_META.epic.color }}>{itemName(featured)}</strong>
            <small className="item-stats">{statLine(featured)}</small>
            {effectLine(featured) && (
              <small className="item-effect" style={{ color: RARITY_META.epic.color }}>
                {effectLine(featured)}
              </small>
            )}
            <small className="item-sub">
              Guaranteed epic · changes weekly
              {featuredCmp && (
                <em className={featuredCmp.good ? "cmp-up" : "cmp-down"}> · {featuredCmp.text}</em>
              )}
            </small>
          </span>
          <span className="item-value">{featuredPrice}g</span>
          <button className="btn tiny" disabled={save.gold < featuredPrice} onClick={onBuyFeatured}>
            Buy
          </button>
        </div>

        <h3 className="section-title">General Stock</h3>

        <div className="item-list tall">
          {items.map((b) => {
            const item = preview(b.id);
            const price = itemValue(item);
            const afford = save.gold >= price;
            const open = hasOpenSlot(save, b.slot);
            const equipped = open ? undefined : referenceFor(save, b.slot);
            const cmp = compare(item, equipped);
            const slotEmpty = open;
            return (
              <div className="item-row" key={b.id} style={{ borderLeft: `4px solid ${RARITY_META.common.color}` }}>
                <ItemIcon icon={b.icon} color={RARITY_META.common.color} />
                <span className="item-main">
                  <strong>{itemName(item)}</strong>
                  <small className="item-stats">{statLine(item)}</small>
                  <small className="item-sub">
                    {b.kind} · tier {b.tier}
                    {cmp ? (
                      <em className={cmp.good ? "cmp-up" : "cmp-down"}> · {cmp.text}</em>
                    ) : (
                      slotEmpty && <em className="cmp-up"> · EQUIP</em>
                    )}
                  </small>
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
