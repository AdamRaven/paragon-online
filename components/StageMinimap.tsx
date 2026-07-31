export interface MinimapMob {
  x: number;
  boss: boolean;
  elite: boolean;
  dead: boolean;
}

export interface MinimapLoot {
  x: number;
  label: string;
  color: string;
}

export interface MinimapData {
  mapWidth: number;
  playerX: number;
  mobs: MinimapMob[];
  loot: MinimapLoot[];
}

/** A thin horizontal bar showing where the player (and mobs) sit along the
 *  current stage's width — the campaign's maps are wide, flat sidescrollers
 *  with no other sense of "how far along am I." */
export function StageMinimap({ data }: { data: MinimapData }) {
  const pct = (x: number) => Math.min(100, Math.max(0, (x / data.mapWidth) * 100));
  return (
    <div className="stage-minimap">
      <div className="stage-minimap-track">
        {data.loot.map((l, i) => (
          <span
            key={`loot${i}`}
            className="minimap-dot loot"
            style={{ left: `${pct(l.x)}%`, background: l.color, boxShadow: `0 0 4px ${l.color}` }}
            title={l.label}
          />
        ))}
        {data.mobs.map((m, i) => (
          <span
            key={i}
            className={`minimap-dot mob${m.boss ? " boss" : ""}${m.elite ? " elite" : ""}${
              m.dead ? " dead" : ""
            }`}
            style={{ left: `${pct(m.x)}%` }}
          />
        ))}
        <span className="minimap-dot player" style={{ left: `${pct(data.playerX)}%` }} />
      </div>
    </div>
  );
}
