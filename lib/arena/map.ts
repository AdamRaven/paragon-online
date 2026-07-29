import type { ArenaMap } from "./types";

const GROUND_Y = 560;

/**
 * A single arena: solid ground on the left and right, a gap through the middle
 * that drops you out of the world, and a one-way platform floating over the
 * gap that both classes can reach with a normal jump.
 */
export const ARENA: ArenaMap = {
  width: 2000,
  height: 720,
  ground: [
    { x: 0, w: 860, y: GROUND_Y },
    { x: 1160, w: 840, y: GROUND_Y },
  ],
  platforms: [
    // Bridge over the gap. One-way: jump up through it, drop down with S+Space.
    // The gap itself is 300px: a sprinting jump clears it, a walking one does not.
    { x: 900, y: 400, w: 220, oneWay: true },
    // Side ledges, also one-way, to give the fight some verticality.
    { x: 300, y: 420, w: 190, oneWay: true },
    { x: 1510, y: 420, w: 190, oneWay: true },
  ],
  spawnA: { x: 150, y: GROUND_Y - 60 },
  spawnB: { x: 1830, y: GROUND_Y - 60 },
  killY: 760,
};

/** Ground height at x, or null when x is over the gap. */
export function groundAt(map: ArenaMap, x: number): number | null {
  for (const g of map.ground) {
    if (x >= g.x && x <= g.x + g.w) return g.y;
  }
  return null;
}
