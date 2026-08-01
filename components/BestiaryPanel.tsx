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

const MOB_LORE_THRESHOLD = 10;

const MOB_LORE: Record<string, string> = {
  husk: "Walked out here for a reason, once. The reason didn't survive the trip.",
  brawler: "Fights for coin nobody's paid him in years. Hasn't noticed. Hasn't stopped.",
  "rabid-cur": "Bites first because thinking second stopped working out for it.",
  "blade-wraith": "The sword remembers the arm. The arm forgot it had a body.",
  cultist: "Chants the same six words. Nobody, including it, remembers what they mean.",
  shieldbearer: "Guards a gate that leads to another gate that leads to this one.",
  colossus: "Someone carved a face into it, a long time before it started moving.",
  revenant: "Died owing a debt. Still trying to work it off, badly, on strangers.",
  sentinel: "Was built to watch for an invasion. Never got the order to stand down.",
  frostfang: "Hunts in the cold because the cold is the only thing that still listens to it.",
  cinderwraith: "Everything it touches keeps burning after it's already moved on.",
  stormcaller: "Talks to the weather. The weather, unfortunately, talks back.",
  plaguebound: "The plague passed through Emberhold a decade ago. Something stayed behind.",
  seraphremnant: "Half of a much larger thing that used to have a much better reason to exist.",
  voidling: "Doesn't so much attack you as forget you were ever supposed to be there.",
  hollowsentinel: "Stands watch at the edge of somewhere that stopped being anywhere.",
  "bog-slime": "Fire hurts it more than anything else ever could. It has not learned this yet.",
  "frost-adept": "Studied the Frostking's court so long she started freezing along with it.",
  "cinder-imp": "Too small to matter alone. It has never once been alone.",
  "storm-wisp": "What's left when lightning forgets to finish striking.",
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
                {n >= MOB_LORE_THRESHOLD && <small className="bestiary-lore">{MOB_LORE[m.id]}</small>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
