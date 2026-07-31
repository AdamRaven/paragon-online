"use client";

import { ItemRow } from "@/components/InventoryPanel";
import {
  STORAGE_BASE_CAP,
  STORAGE_EXPANSION_SIZE,
  storageExpansionCost,
  type Item,
} from "@/lib/arena/items";
import type { AdventureSave } from "@/lib/arena/progression";

export function StoragePanel({
  save,
  onStore,
  onRetrieve,
  onExpand,
  onClose,
}: {
  save: AdventureSave;
  onStore: (item: Item) => void;
  onRetrieve: (item: Item) => void;
  onExpand: () => void;
  onClose: () => void;
}) {
  const cap = save.storageCap ?? STORAGE_BASE_CAP;
  const full = save.storage.length >= cap;
  const expandCost = storageExpansionCost(cap);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Bank</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {save.storage.length} / {cap} items stored
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Leave (Esc)
          </button>
        </div>

        <p className="hint" style={{ marginBottom: 12 }}>
          Items in storage are safe and don&apos;t clutter your backpack. Move
          things back any time.
        </p>

        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginBottom: 12 }}
          disabled={save.gold < expandCost}
          onClick={onExpand}
        >
          {full ? "Storage full — " : ""}Buy {STORAGE_EXPANSION_SIZE} more slots ({expandCost}g)
        </button>

        <div className="inv-layout">
          <section>
            <h3 className="section-title">Backpack ({save.inventory.length})</h3>
            <div className="item-list tall">
              {save.inventory.length === 0 && <p className="hint">Nothing to store.</p>}
              {save.inventory.map((item) => (
                <ItemRow
                  key={item.uid}
                  item={item}
                  actions={
                    <button className="btn tiny" onClick={() => onStore(item)}>
                      Store
                    </button>
                  }
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="section-title">Storage ({save.storage.length})</h3>
            <div className="item-list tall">
              {save.storage.length === 0 && <p className="hint">Storage is empty.</p>}
              {save.storage.map((item) => (
                <ItemRow
                  key={item.uid}
                  item={item}
                  actions={
                    <button className="btn tiny" onClick={() => onRetrieve(item)}>
                      Retrieve
                    </button>
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
