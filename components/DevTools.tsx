"use client";

/**
 * A local-dev-only cheat panel for quickly jumping to a level to test late
 * content without grinding. `process.env.NODE_ENV` is inlined at build time,
 * so `next build` dead-code-eliminates this entire branch — it never ships.
 */
export function DevLevelTools({
  level,
  maxLevel,
  onAdjust,
}: {
  level: number;
  maxLevel: number;
  onAdjust: (delta: number) => void;
}) {
  return (
    <div className="dev-tools">
      <span className="dev-tools-tag">DEV</span>
      <span className="dev-tools-level">
        Lv {level}/{maxLevel}
      </span>
      <div className="dev-tools-buttons">
        <button className="btn btn-ghost tiny" disabled={level <= 1} onClick={() => onAdjust(-10)}>
          -10
        </button>
        <button className="btn btn-ghost tiny" disabled={level <= 1} onClick={() => onAdjust(-1)}>
          -1
        </button>
        <button className="btn btn-ghost tiny" disabled={level >= maxLevel} onClick={() => onAdjust(1)}>
          +1
        </button>
        <button className="btn btn-ghost tiny" disabled={level >= maxLevel} onClick={() => onAdjust(10)}>
          +10
        </button>
      </div>
    </div>
  );
}
