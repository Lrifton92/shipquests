// Gas Chase — ghost decision logic (old school behaviours, simplified).
// Each ghost picks a direction on tile arrival: never reverses unless dead-end,
// otherwise greedily minimises distance to its target tile (classic arcade rule).

import { DIRS, HOUSE_DOOR, walkable, type Dir, type Game, type Ghost, type Tile } from "./engine";

export type GhostName = "blaze" | "surge" | "wisp" | "drift";

/** Scatter corners (one per ghost), clockwise from top-left. */
const CORNERS: Record<GhostName, Tile> = {
  blaze: { c: 17, r: 1 },
  surge: { c: 1, r: 1 },
  wisp: { c: 17, r: 19 },
  drift: { c: 1, r: 19 },
};

function dist2(a: Tile, b: Tile): number {
  const dc = a.c - b.c;
  const dr = a.r - b.r;
  return dc * dc + dr * dr;
}

/** Classic-style per-ghost chase target. */
export function chaseTarget(g: Game, gh: Ghost): Tile {
  const pac = g.pac.tile;
  const pdir = g.pac.dir ?? DIRS.left;
  switch (gh.name) {
    case "blaze": // Blinky: pac himself
      return pac;
    case "surge": // Pinky: 4 tiles ahead of pac
      return { c: pac.c + pdir.dc * 4, r: pac.r + pdir.dr * 4 };
    case "wisp": // Inky-ish: 2 ahead, doubled from blaze's position
      return { c: pac.c + pdir.dc * 2, r: pac.r + pdir.dr * 2 };
    case "drift": {
      // Clyde: chase pac when far, retreat to corner when close
      return dist2(gh.tile, pac) > 64 ? pac : CORNERS.drift;
    }
  }
}

export function decideGhostDir(g: Game, gh: Ghost, rng: () => number): Dir {
  const reverse = { dc: -gh.dir.dc, dr: -gh.dir.dr };
  const options: Dir[] = [];
  for (const d of Object.values(DIRS)) {
    if (d.dc === reverse.dc && d.dr === reverse.dr) continue;
    if (walkable(gh.tile.c + d.dc, gh.tile.r + d.dr, true)) options.push(d);
  }
  if (options.length === 0) return reverse; // dead-end: allowed to turn back

  if (gh.mode === "frightened") {
    return options[Math.floor(rng() * options.length)];
  }

  const target =
    gh.mode === "eaten"
      ? HOUSE_DOOR
      : gh.mode === "scatter"
        ? CORNERS[gh.name]
        : chaseTarget(g, gh);

  let best = options[0];
  let bestD = Infinity;
  for (const d of options) {
    const n = { c: gh.tile.c + d.dc, r: gh.tile.r + d.dr };
    const dd = dist2(n, target);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}
