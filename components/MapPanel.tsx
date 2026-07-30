import type { Biome, Stage } from "@/lib/arena/mobs";

const BIOME_GLYPH: Record<Biome, string> = {
  town: "🏠",
  outskirts: "🌲",
  undercity: "🕳️",
  keep: "🔥",
  abyss: "🌀",
  frost: "❄️",
  forge: "🌋",
  storm: "⚡",
  blight: "☠️",
  divine: "✨",
};

const BIOME_TINT: Record<Biome, string> = {
  town: "#f6b352",
  outskirts: "#5f9e63",
  undercity: "#7c5cc4",
  keep: "#e05a3c",
  abyss: "#c4b5fd",
  frost: "#dff3ff",
  forge: "#fb923c",
  storm: "#93c5fd",
  blight: "#a3e635",
  divine: "#fef3c7",
};

export function MapPanel({
  stages,
  currentIndex,
  playerLevel,
  onTravel,
  onClose,
}: {
  stages: Stage[];
  currentIndex: number;
  playerLevel: number;
  onTravel: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide map-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>World Map</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              The road from {stages[0]?.name} to {stages[stages.length - 1]?.name}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="map-trail">
          {stages.map((st, i) => {
            const locked = playerLevel < st.requiredLevel;
            const here = currentIndex === i;
            const tint = BIOME_TINT[st.biome];
            return (
              <div className="map-node-wrap" key={st.id}>
                {i > 0 && (
                  <div
                    className={`map-link${locked ? " locked" : ""}`}
                    style={{ "--tint": tint } as React.CSSProperties}
                  />
                )}
                <button
                  className={`map-node${here ? " here" : ""}${locked ? " locked" : ""}`}
                  style={{ "--tint": tint } as React.CSSProperties}
                  disabled={locked || here}
                  onClick={() => onTravel(i)}
                  title={st.subtitle}
                >
                  <span className="map-node-glyph">{locked ? "🔒" : BIOME_GLYPH[st.biome]}</span>
                  {here && <span className="map-node-ping" />}
                </button>
                <div className="map-node-label">
                  <strong>{st.name}</strong>
                  <small>
                    {here ? "You are here" : locked ? `Requires level ${st.requiredLevel}` : st.subtitle}
                  </small>
                </div>
              </div>
            );
          })}
        </div>

        <p className="hint" style={{ marginTop: 18 }}>
          Enemies more than two levels below you give reduced experience, so
          move on once a stage stops paying out.
        </p>
      </div>
    </div>
  );
}
