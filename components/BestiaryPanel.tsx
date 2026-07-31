"use client";

import { MOB_TYPES } from "@/lib/arena/mobs";
import type { AdventureSave } from "@/lib/arena/progression";

const BOSS_LORE: Record<string, string> = {
  warden: "Kept the Keep's prisoners in line for thirty years. Never once asked what they'd done.",
  sovereign: "Ruled the Sanctum by never leaving it. The Sanctum ruled her back, eventually.",
  frostking: "Froze his own court solid rather than watch them grow old without him.",
  forgeheart: "Built the Forge, then became part of it. Efficient, if nothing else.",
  tempestwarden: "Guards a fortress that's been falling for a century and hasn't hit the ground yet.",
  rotmother: "Loved the Hollow so much she became its gardener. Everything she plants grows wrong.",
  sunderedking: "The throne cracked under him once. He's made sure it'll never crack again — or move.",
  thehollow: "Was something, once. Whatever it was, it isn't anymore, and it resents you for asking.",
};

export function BestiaryPanel({ save, onClose }: { save: AdventureSave; onClose: () => void }) {
  const all = Object.values(MOB_TYPES).sort((a, b) => a.level - b.level);
  const bosses = all.filter((m) => m.isBoss);
  const regular = all.filter((m) => !m.isBoss);
  const kills = save.mobKills ?? {};

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Bestiary</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {all.filter((m) => (kills[m.id] ?? 0) > 0).length} / {all.length} encountered
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <h3 className="section-title">Bosses</h3>
        <div className="bestiary-list" style={{ marginBottom: 18 }}>
          {bosses.map((m) => {
            const n = kills[m.id] ?? 0;
            return (
              <div className={`bestiary-row${n > 0 ? " seen" : ""}`} key={m.id}>
                <div className="bestiary-row-head">
                  <strong>{n > 0 ? m.name : "??? "}</strong>
                  <span>Lv{m.level} · {n} defeated</span>
                </div>
                {n > 0 && <small className="bestiary-lore">{BOSS_LORE[m.id]}</small>}
              </div>
            );
          })}
        </div>

        <h3 className="section-title">Enemies</h3>
        <div className="bestiary-list">
          {regular.map((m) => {
            const n = kills[m.id] ?? 0;
            return (
              <div className={`bestiary-row${n > 0 ? " seen" : ""}`} key={m.id}>
                <div className="bestiary-row-head">
                  <strong>{n > 0 ? m.name : "???"}</strong>
                  <span>Lv{m.level} · {n} defeated</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
