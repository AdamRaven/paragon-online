"use client";

import { useState } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import { ItemRow, effectLine, statLine } from "@/components/InventoryPanel";
import {
  DOWNGRADE_FLOOR,
  MAX_PLUS,
  RARITY_META,
  STONE_PRICE,
  base,
  enhanceChance,
  itemName,
  itemValue,
  type Item,
} from "@/lib/arena/items";
import { BASE_STAT, type AdventureSave } from "@/lib/arena/progression";

const RESPEC_COST_PER_POINT = 25;

type Tab = "sell" | "buy" | "enhance";

export function BlacksmithPanel({
  save,
  onSellAll,
  onSellAllGear,
  onSellOne,
  onBuyStones,
  onEnhance,
  onEnhanceMany,
  onRespec,
  lastResult,
  onClose,
}: {
  save: AdventureSave;
  onSellAll: () => void;
  onSellAllGear: () => void;
  onSellOne: (item: Item) => void;
  onBuyStones: (n: number) => void;
  onEnhance: (item: Item) => void;
  onEnhanceMany: (item: Item, times: number) => void;
  onRespec: () => void;
  lastResult: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("sell");
  const trash = save.inventory.filter((i) => base(i.baseId).kind === "trash");
  const trashWorth = trash.reduce((n, i) => n + itemValue(i), 0);
  // Gear you're not wearing can be sold too; equip/unequip happens in the bag.
  const gear = save.inventory.filter((i) => base(i.baseId).kind !== "trash");
  const gearWorth = gear.reduce((n, i) => n + itemValue(i), 0);

  // Anything enhanceable: equipped gear plus weapons in the bag.
  const enhanceable: Item[] = [
    ...Object.values(save.equipped).filter(Boolean),
    ...save.inventory.filter((i) => base(i.baseId).kind === "weapon"),
  ] as Item[];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Emberhold Blacksmith</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {save.gold} gold · {save.stones} enhancement stones
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Leave (Esc)
          </button>
        </div>

        <div className="tab-row">
          {(["sell", "buy", "enhance"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`btn ${tab === t ? "" : "btn-ghost"} tab`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {lastResult && <div className="merchant-result">{lastResult}</div>}

        {tab === "sell" && (
          <>
            <p className="hint" style={{ marginBottom: 12 }}>
              Trash loot has no stats — sell it for gold, then buy stones. Gear
              you&apos;re not wearing can be sold too (unequip it from the bag first).
            </p>
            {trash.length > 0 && (
              <button className="btn" style={{ width: "100%", marginBottom: 12 }} onClick={onSellAll}>
                Sell all trash ({trash.length}) for {trashWorth}g
              </button>
            )}
            {gear.length > 0 && (
              <>
                <button
                  className="btn btn-danger"
                  style={{ width: "100%", marginBottom: 12 }}
                  onClick={onSellAllGear}
                >
                  Sell all gear ({gear.length}) for {gearWorth}g
                </button>
                <h3 className="section-title">Gear</h3>
                <div className="item-list" style={{ marginBottom: 12 }}>
                  {gear.map((i) => (
                    <ItemRow
                      key={i.uid}
                      item={i}
                      actions={
                        <button className="btn tiny" onClick={() => onSellOne(i)}>
                          Sell
                        </button>
                      }
                    />
                  ))}
                </div>
              </>
            )}
            <h3 className="section-title">Trash</h3>
            <div className="item-list">
              {trash.length === 0 && <p className="hint">Nothing to sell.</p>}
              {trash.map((i) => (
                <ItemRow
                  key={i.uid}
                  item={i}
                  actions={
                    <button className="btn tiny" onClick={() => onSellOne(i)}>
                      Sell
                    </button>
                  }
                />
              ))}
            </div>
          </>
        )}

        {tab === "buy" && (
          <>
            <p className="hint" style={{ marginBottom: 12 }}>
              Each enhancement attempt consumes one stone, win or lose.
            </p>
            <div className="buy-row">
              <ItemIcon icon="enh-stone" color="#7dd3fc" />
              <span className="item-main">
                <strong>Enhancement Stone</strong>
                <small>{STONE_PRICE} gold each</small>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {[1, 5, 10, 100].map((n) => (
                <button
                  key={n}
                  className="btn"
                  style={{ flex: 1, minWidth: 90 }}
                  disabled={save.gold < STONE_PRICE * n}
                  onClick={() => onBuyStones(n)}
                >
                  Buy {n} ({STONE_PRICE * n}g)
                </button>
              ))}
              {save.gold >= STONE_PRICE * 1000 && (
                <button
                  className="btn"
                  style={{ flex: 1, minWidth: 90 }}
                  onClick={() => onBuyStones(1000)}
                >
                  Buy 1000 ({STONE_PRICE * 1000}g)
                </button>
              )}
              {save.gold >= STONE_PRICE * 10000 && (
                <button
                  className="btn"
                  style={{ flex: 1, minWidth: 90 }}
                  onClick={() => onBuyStones(10000)}
                >
                  Buy 10000 ({STONE_PRICE * 10000}g)
                </button>
              )}
              {(() => {
                const maxN = Math.floor(save.gold / STONE_PRICE);
                return (
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1, minWidth: 90 }}
                    disabled={maxN <= 0}
                    onClick={() => onBuyStones(maxN)}
                  >
                    {maxN <= 0 ? "Buy Max" : `Buy Max (${maxN})`}
                  </button>
                );
              })()}
            </div>

            {(() => {
              const spent =
                save.stats.str + save.stats.agi + save.stats.vit + save.stats.foc - BASE_STAT * 4;
              const cost = spent * RESPEC_COST_PER_POINT;
              return (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <h3 className="section-title">Respec</h3>
                  <p className="hint" style={{ marginBottom: 10 }}>
                    Refund every point you&apos;ve put into Strength, Agility, Vitality and
                    Focus, so you can reallocate them from scratch.
                  </p>
                  <button
                    className="btn"
                    style={{ width: "100%" }}
                    disabled={spent <= 0 || save.gold < cost}
                    onClick={onRespec}
                  >
                    {spent <= 0 ? "Nothing to respec" : `Respec ${spent} points (${cost}g)`}
                  </button>
                </div>
              );
            })()}
          </>
        )}

        {tab === "enhance" && (
          <>
            <p className="hint" style={{ marginBottom: 12 }}>
              Every level adds 14% of the item&apos;s base stats. Success chance
              drops as the level climbs, and heavier weapons are harder to push —
              a Warden&apos;s Maul is a far bigger gamble than knuckles. From{" "}
              <strong>+{DOWNGRADE_FLOOR}</strong> upward a failure costs you a level.
            </p>
            <div className="item-list">
              {enhanceable.length === 0 && <p className="hint">Nothing to enhance.</p>}
              {enhanceable.map((i) => {
                const b = base(i.baseId);
                const maxed = i.plus >= MAX_PLUS;
                const chance = Math.round(enhanceChance(i) * 100);
                const risky = i.plus >= DOWNGRADE_FLOOR;
                return (
                  <div className="item-row" key={i.uid}>
                    <span className="icon-plus-wrap">
                      <ItemIcon icon={b.icon} color={RARITY_META[i.rarity].color} />
                      {i.plus > 0 && <span className="icon-plus-badge">+{i.plus}</span>}
                    </span>
                    <span className="item-main">
                      <strong style={{ color: RARITY_META[i.rarity].color }}>
                        {itemName(i)}
                      </strong>
                      <small>
                        {statLine(i)}
                        {b.weight ? ` · weight ${b.weight.toFixed(2)}` : ""}
                      </small>
                      {effectLine(i) && (
                        <small className="item-effect" style={{ color: RARITY_META[i.rarity].color }}>
                          {effectLine(i)}
                        </small>
                      )}
                    </span>
                    <span
                      className="item-value"
                      style={{ color: chance > 60 ? "var(--accent)" : chance > 30 ? "var(--exp)" : "var(--danger)" }}
                    >
                      {maxed ? "MAX" : `${chance}%`}
                      {risky && !maxed && <em className="risk"> risk</em>}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn tiny"
                        disabled={maxed || save.stones <= 0}
                        onClick={() => onEnhance(i)}
                      >
                        +1
                      </button>
                      <button
                        className="btn tiny btn-ghost"
                        disabled={maxed || save.stones <= 0}
                        title="Attempts 10 enhancements back to back, stopping early if it maxes out or you run out of stones."
                        onClick={() => onEnhanceMany(i, 10)}
                      >
                        x10
                      </button>
                      {!maxed && save.stones >= 100 && (
                        <button
                          className="btn tiny btn-ghost"
                          title="Attempts 100 enhancements back to back, stopping early if it maxes out or you run out of stones."
                          onClick={() => onEnhanceMany(i, 100)}
                        >
                          x100
                        </button>
                      )}
                      {!maxed && save.stones >= 1000 && (
                        <button
                          className="btn tiny btn-ghost"
                          title="Attempts 1000 enhancements back to back, stopping early if it maxes out or you run out of stones."
                          onClick={() => onEnhanceMany(i, 1000)}
                        >
                          x1000
                        </button>
                      )}
                      {!maxed && save.stones >= 10000 && (
                        <button
                          className="btn tiny btn-ghost"
                          title="Attempts 10000 enhancements back to back, stopping early if it maxes out or you run out of stones."
                          onClick={() => onEnhanceMany(i, 10000)}
                        >
                          x10000
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
