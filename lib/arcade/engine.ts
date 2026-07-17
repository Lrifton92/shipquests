// Gas Chase — pure game engine (no DOM). Grid-hop model: each entity sits on a
// tile and advances `progress` (0..1) toward the next tile; decisions (turns,
// ghost AI, collisions) happen on tile arrival. Rendering interpolates.
// Spec: docs/superpowers/specs/2026-07-17-arcade-design.md

import { decideGhostDir, type GhostName } from "./ghosts";

/** Maze legend: # wall · . pellet · o power pellet · ' ' empty · P pac start
 *  G ghost start (in house) · - house door (ghosts only) · T tunnel (wraps). */
export const MAZE = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "####.#.......#.####",
  "####.#.##-##.#.####",
  "T....#.#GGG#.#....T",
  "####.#.#####.#.####",
  "####.#.......#.####",
  "####.#.#####.#.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....P.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "###################",
] as const;

export const COLS = MAZE[0].length;
export const ROWS = MAZE.length;

export type Tile = { c: number; r: number };
export type Dir = { dc: number; dr: number };
export const DIRS: Record<"up" | "down" | "left" | "right", Dir> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

export type GhostMode = "scatter" | "chase" | "frightened" | "eaten" | "housed";

export type Ghost = {
  name: GhostName;
  tile: Tile;
  dir: Dir;
  progress: number;
  mode: GhostMode;
  /** seconds until a housed ghost is released */
  releaseIn: number;
};

export type Game = {
  level: number;
  score: number;
  hiScore: number;
  lives: number;
  /** 'ready' shows READY! (frozen), 'dying' plays death anim, 'over'/'won' terminal */
  phase: "ready" | "playing" | "dying" | "over" | "levelWon";
  phaseT: number;
  pellets: Set<string>; // "c,r"
  powers: Set<string>;
  pelletsTotal: number;
  pac: { tile: Tile; dir: Dir | null; pending: Dir | null; progress: number };
  ghosts: Ghost[];
  /** global scatter/chase clock */
  modeT: number;
  frightenedT: number;
  /** ghost-eat chain value (200,400,800,1600) */
  chain: number;
  fruit: { tile: Tile; t: number } | null;
  fruitTaken: boolean;
  /** transient events for the renderer/sfx, drained each frame */
  events: string[];
};

export const key = (t: Tile) => `${t.c},${t.r}`;

export function tileAt(c: number, r: number): string {
  if (r < 0 || r >= ROWS) return "#";
  const row = MAZE[r];
  if (c < 0 || c >= COLS) return row.includes("T") ? "T" : "#";
  return row[c];
}

/** Walls block everyone; the house door '-' blocks pac but not ghosts. */
export function walkable(c: number, r: number, ghost = false): boolean {
  const ch = tileAt(c, r);
  if (ch === "#") return false;
  if (ch === "-") return ghost;
  if (ch === "G") return ghost;
  return true;
}

function wrap(t: Tile): Tile {
  if (t.c < 0) return { c: COLS - 1, r: t.r };
  if (t.c >= COLS) return { c: 0, r: t.r };
  return t;
}

function findAll(ch: string): Tile[] {
  const out: Tile[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) if (MAZE[r][c] === ch) out.push({ c, r });
  return out;
}

const GHOST_NAMES: GhostName[] = ["blaze", "surge", "wisp", "drift"];
export const HOUSE_DOOR: Tile = findAll("-")[0] ?? { c: 9, r: 8 };

export function createGame(hiScore = 0): Game {
  const pellets = new Set<string>();
  const powers = new Set<string>();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (MAZE[r][c] === ".") pellets.add(`${c},${r}`);
      if (MAZE[r][c] === "o") powers.add(`${c},${r}`);
    }
  const g = {
    level: 1,
    score: 0,
    hiScore,
    lives: 3,
    phase: "ready" as const,
    phaseT: 2.2,
    pellets,
    powers,
    pelletsTotal: pellets.size + powers.size,
    pac: spawnPac(),
    ghosts: spawnGhosts(),
    modeT: 0,
    frightenedT: 0,
    chain: 200,
    fruit: null,
    fruitTaken: false,
    events: [] as string[],
  };
  return g;
}

function spawnPac() {
  const start = findAll("P")[0];
  return { tile: { ...start }, dir: null, pending: DIRS.left, progress: 0 };
}

function spawnGhosts(): Ghost[] {
  const homes = findAll("G");
  return GHOST_NAMES.map((name, i) => ({
    name,
    tile: { ...homes[i % homes.length] },
    dir: DIRS.up,
    progress: 0,
    mode: i === 0 ? ("scatter" as const) : ("housed" as const),
    releaseIn: i * 2.5,
  }));
}

/** First ghost starts outside, on top of the door. */
function placeFirstGhostOutside(ghosts: Ghost[]) {
  ghosts[0].tile = { c: HOUSE_DOOR.c, r: HOUSE_DOOR.r - 1 };
}

export function setDirection(g: Game, d: Dir) {
  g.pac.pending = d;
}

/** Speeds in tiles/second. */
function speeds(g: Game) {
  const lvl = 1 + Math.min(0.35, (g.level - 1) * 0.06);
  return {
    pac: 5.4 * lvl,
    ghost: 4.9 * lvl,
    frightened: 3.2,
    eaten: 9,
  };
}

const SCATTER = 7;
const CHASE = 20;

function globalMode(g: Game): "scatter" | "chase" {
  const t = g.modeT % (SCATTER + CHASE);
  return t < SCATTER ? "scatter" : "chase";
}

export function frightenedDuration(level: number): number {
  return Math.max(2, 6.5 - (level - 1) * 0.75);
}

/** Advance the game by dt seconds. rng ∈ [0,1) injected for testability. */
export function step(g: Game, dt: number, rng: () => number = Math.random) {
  g.events.length = 0;
  if (g.phase === "over" || g.phase === "levelWon") return;

  if (g.phase === "ready" || g.phase === "dying") {
    g.phaseT -= dt;
    if (g.phaseT <= 0) {
      if (g.phase === "dying") {
        if (g.lives <= 0) {
          g.phase = "over";
          return;
        }
        g.pac = spawnPac();
        g.ghosts = spawnGhosts();
        placeFirstGhostOutside(g.ghosts);
        g.frightenedT = 0;
        g.phase = "ready";
        g.phaseT = 1.6;
      } else {
        if (g.modeT === 0) placeFirstGhostOutside(g.ghosts);
        g.phase = "playing";
      }
    }
    return;
  }

  g.modeT += dt;
  if (g.frightenedT > 0) g.frightenedT = Math.max(0, g.frightenedT - dt);
  const sp = speeds(g);

  movePac(g, dt, sp.pac);
  for (const gh of g.ghosts) moveGhost(g, gh, dt, sp, rng);
  handleCollisions(g);
  if (g.fruit) {
    g.fruit.t -= dt;
    if (g.fruit.t <= 0) g.fruit = null;
  }
}

function movePac(g: Game, dt: number, speed: number) {
  const p = g.pac;
  if (p.dir === null && p.pending) {
    const n = { c: p.tile.c + p.pending.dc, r: p.tile.r + p.pending.dr };
    if (walkable(n.c, n.r)) p.dir = p.pending;
  }
  let dir = p.dir;
  if (!dir) return;
  p.progress += speed * dt;
  while (p.progress >= 1) {
    p.progress -= 1;
    p.tile = wrap({ c: p.tile.c + dir.dc, r: p.tile.r + dir.dr });
    eatAt(g);
    // turn if requested & possible, else continue, else stop
    const tryDirs: Dir[] = p.pending ? [p.pending, dir] : [dir];
    let moved = false;
    for (const d of tryDirs) {
      if (walkable(p.tile.c + d.dc, p.tile.r + d.dr)) {
        dir = d;
        moved = true;
        break;
      }
    }
    if (!moved) {
      p.dir = null;
      p.progress = 0;
      return;
    }
  }
  p.dir = dir;
}

function eatAt(g: Game) {
  const k = key(g.pac.tile);
  if (g.pellets.delete(k)) {
    g.score += 10;
    g.events.push("waka");
  } else if (g.powers.delete(k)) {
    g.score += 50;
    g.frightenedT = frightenedDuration(g.level);
    g.chain = 200;
    for (const gh of g.ghosts)
      if (gh.mode === "scatter" || gh.mode === "chase") {
        gh.mode = "frightened";
        gh.dir = { dc: -gh.dir.dc, dr: -gh.dir.dr };
      }
    g.events.push("power");
  }
  const eaten = g.pelletsTotal - (g.pellets.size + g.powers.size);
  if (!g.fruit && !g.fruitTaken && eaten >= Math.floor(g.pelletsTotal / 2)) {
    g.fruit = { tile: { c: HOUSE_DOOR.c, r: HOUSE_DOOR.r + 1 }, t: 10 };
  }
  if (g.fruit && key(g.fruit.tile) === k) {
    g.score += 100 * g.level;
    g.fruit = null;
    g.fruitTaken = true;
    g.events.push("fruit");
  }
  if (g.pellets.size + g.powers.size === 0) {
    g.phase = "levelWon";
    g.events.push("won");
  }
  g.hiScore = Math.max(g.hiScore, g.score);
}

function moveGhost(
  g: Game,
  gh: Ghost,
  dt: number,
  sp: { ghost: number; frightened: number; eaten: number },
  rng: () => number,
) {
  if (gh.mode === "housed") {
    gh.releaseIn -= dt;
    if (gh.releaseIn <= 0) {
      gh.mode = globalMode(g);
      gh.tile = { c: HOUSE_DOOR.c, r: HOUSE_DOOR.r - 1 };
      gh.dir = DIRS.left;
      gh.progress = 0;
    }
    return;
  }
  // follow the global scatter/chase clock (frightened/eaten override)
  if (gh.mode === "scatter" || gh.mode === "chase") {
    if (g.frightenedT > 0 && gh.mode !== ("frightened" as GhostMode)) {
      // already handled on power pellet; keep as-is
    }
    gh.mode = globalMode(g);
  }
  if (gh.mode === "frightened" && g.frightenedT === 0) gh.mode = globalMode(g);

  const speed =
    gh.mode === "eaten" ? sp.eaten : gh.mode === "frightened" ? sp.frightened : sp.ghost;
  gh.progress += speed * dt;
  while (gh.progress >= 1) {
    gh.progress -= 1;
    gh.tile = wrap({ c: gh.tile.c + gh.dir.dc, r: gh.tile.r + gh.dir.dr });
    if (gh.mode === "eaten" && gh.tile.c === HOUSE_DOOR.c && gh.tile.r === HOUSE_DOOR.r) {
      gh.mode = globalMode(g);
      gh.tile = { c: HOUSE_DOOR.c, r: HOUSE_DOOR.r - 1 };
    }
    gh.dir = decideGhostDir(g, gh, rng);
  }
}

function samePos(a: { tile: Tile; progress: number }, b: { tile: Tile; progress: number }) {
  return a.tile.c === b.tile.c && a.tile.r === b.tile.r;
}

function handleCollisions(g: Game) {
  for (const gh of g.ghosts) {
    if (gh.mode === "eaten" || gh.mode === "housed") continue;
    if (!samePos(g.pac, gh)) continue;
    if (gh.mode === "frightened") {
      g.score += g.chain;
      g.events.push(`ghost:${g.chain}`);
      g.chain = Math.min(1600, g.chain * 2);
      gh.mode = "eaten";
    } else {
      g.lives -= 1;
      g.phase = "dying";
      g.phaseT = 1.4;
      g.events.push("death");
      return;
    }
  }
  g.hiScore = Math.max(g.hiScore, g.score);
}

/** Start the next level, keeping score/lives. */
export function nextLevel(g: Game): Game {
  const n = createGame(g.hiScore);
  n.level = g.level + 1;
  n.score = g.score;
  n.lives = g.lives;
  return n;
}
