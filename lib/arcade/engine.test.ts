import { describe, expect, it } from "vitest";
import {
  COLS,
  DIRS,
  MAZE,
  ROWS,
  createGame,
  frightenedDuration,
  key,
  nextLevel,
  setDirection,
  step,
  tileAt,
  walkable,
} from "./engine";

const rng0 = () => 0; // deterministic "random"

/** Run the ready countdown so the game is actually playing. */
function playing() {
  const g = createGame();
  step(g, 3, rng0);
  expect(g.phase).toBe("playing");
  return g;
}

describe("maze integrity", () => {
  it("is rectangular with walls top and bottom", () => {
    for (const row of MAZE) expect(row.length).toBe(COLS);
    expect(MAZE[0]).toBe("#".repeat(COLS));
    expect(MAZE[ROWS - 1]).toBe("#".repeat(COLS));
  });

  it("has exactly one pac start, 3 ghost slots, 1 door, 4 power pellets", () => {
    const all = MAZE.join("");
    expect([...all].filter((c) => c === "P").length).toBe(1);
    expect([...all].filter((c) => c === "G").length).toBe(3);
    expect([...all].filter((c) => c === "-").length).toBe(1);
    expect([...all].filter((c) => c === "o").length).toBe(4);
  });

  it("tunnel row wraps: both ends are open", () => {
    const r = MAZE.findIndex((row) => row.startsWith("T"));
    expect(r).toBeGreaterThan(0);
    expect(MAZE[r].endsWith("T")).toBe(true);
    expect(walkable(0, r)).toBe(true);
    expect(walkable(COLS - 1, r)).toBe(true);
  });

  it("every pellet is reachable-ish: pellets never sit inside walls", () => {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (MAZE[r][c] === "." || MAZE[r][c] === "o") {
          const open =
            walkable(c + 1, r) || walkable(c - 1, r) || walkable(c, r + 1) || walkable(c, r - 1);
          expect(open, `pellet at ${c},${r} is sealed`).toBe(true);
        }
  });

  it("house door blocks pac but not ghosts", () => {
    let door: [number, number] | null = null;
    for (let r = 0; r < ROWS; r++) {
      const c = MAZE[r].indexOf("-");
      if (c >= 0) door = [c, r];
    }
    expect(door).not.toBeNull();
    const [c, r] = door!;
    expect(tileAt(c, r)).toBe("-");
    expect(walkable(c, r, false)).toBe(false);
    expect(walkable(c, r, true)).toBe(true);
  });
});

describe("pac movement & eating", () => {
  it("starts frozen on READY then plays", () => {
    const g = createGame();
    expect(g.phase).toBe("ready");
    step(g, 0.5, rng0);
    expect(g.phase).toBe("ready");
    step(g, 3, rng0);
    expect(g.phase).toBe("playing");
  });

  it("moves left from spawn and eats pellets (10 pts each)", () => {
    const g = playing();
    const before = g.pellets.size;
    setDirection(g, DIRS.left);
    step(g, 0.5, rng0); // ~2.7 tiles at 5.4 t/s
    expect(g.pellets.size).toBeLessThan(before);
    expect(g.score).toBe((before - g.pellets.size) * 10);
  });

  it("does not walk through walls", () => {
    const g = playing();
    setDirection(g, DIRS.down); // wall directly below spawn row path
    const start = { ...g.pac.tile };
    step(g, 0.3, rng0);
    // either stayed (blocked) or moved along a walkable axis — never inside a wall
    expect(walkable(g.pac.tile.c, g.pac.tile.r)).toBe(true);
    expect(Math.abs(g.pac.tile.r - start.r)).toBeLessThanOrEqual(1);
  });

  it("power pellet triggers frightened mode and 50 pts", () => {
    const g = playing();
    // teleport pac next to a power pellet, then step onto it
    const [pk] = [...g.powers];
    const [c, r] = pk.split(",").map(Number);
    g.pac.tile = { c, r };
    g.pac.progress = 0;
    g.pac.dir = null;
    g.pac.pending = null;
    // simulate arrival by re-eating current tile through a 1-tile move:
    const from = walkable(c - 1, r) ? DIRS.right : DIRS.left;
    g.pac.tile = { c: c - from.dc, r: r - from.dr };
    setDirection(g, from);
    const scoreBefore = g.score;
    step(g, 0.25, rng0);
    expect(g.powers.has(pk)).toBe(false);
    expect(g.score).toBeGreaterThanOrEqual(scoreBefore + 50);
    expect(g.frightenedT).toBeGreaterThan(0);
    expect(g.ghosts.some((gh) => gh.mode === "frightened")).toBe(true);
  });
});

describe("ghosts & collisions", () => {
  it("housed ghosts are released over time", () => {
    const g = playing();
    expect(g.ghosts.filter((gh) => gh.mode === "housed").length).toBeGreaterThan(0);
    for (let i = 0; i < 90; i++) step(g, 0.1, rng0);
    if (g.phase === "playing") {
      expect(g.ghosts.filter((gh) => gh.mode === "housed").length).toBe(0);
    }
  });

  it("touching a normal ghost costs a life and re-enters READY", () => {
    const g = playing();
    const gh = g.ghosts[0];
    gh.mode = "chase";
    gh.tile = { ...g.pac.tile };
    step(g, 0.016, rng0);
    expect(g.lives).toBe(2);
    expect(g.phase).toBe("dying");
    step(g, 2, rng0); // death anim over -> ready
    expect(g.phase).toBe("ready");
  });

  it("eating a frightened ghost scores the doubling chain", () => {
    const g = playing();
    g.frightenedT = 5;
    const [a, b] = g.ghosts;
    a.mode = "frightened";
    a.tile = { ...g.pac.tile };
    step(g, 0.016, rng0);
    expect(g.score).toBeGreaterThanOrEqual(200);
    expect(a.mode).toBe("eaten");
    b.mode = "frightened";
    b.tile = { ...g.pac.tile };
    const s = g.score;
    step(g, 0.016, rng0);
    expect(g.score - s).toBe(400);
  });

  it("pass-through counts: crossing a frightened ghost between tiles eats it", () => {
    const g = playing();
    g.frightenedT = 5;
    const gh = g.ghosts[0];
    // pac and ghost face each other on adjacent tiles of the home row
    const { c, r } = g.pac.tile;
    g.pac.dir = DIRS.left;
    g.pac.pending = DIRS.left;
    gh.mode = "frightened";
    gh.tile = { c: c - 1, r };
    gh.dir = DIRS.right;
    gh.progress = 0;
    // small steps so they swap tiles between arrivals instead of landing together
    for (let i = 0; i < 30 && gh.mode === "frightened"; i++) step(g, 0.02, rng0);
    expect(gh.mode).toBe("eaten");
  });

  it("pass-through counts: crossing a normal ghost kills pac", () => {
    const g = playing();
    const gh = g.ghosts[0];
    const { c, r } = g.pac.tile;
    g.pac.dir = DIRS.left;
    g.pac.pending = DIRS.left;
    gh.mode = "chase";
    gh.tile = { c: c - 1, r };
    gh.dir = DIRS.right;
    gh.progress = 0;
    for (let i = 0; i < 30 && g.phase === "playing"; i++) step(g, 0.02, rng0);
    expect(g.phase).toBe("dying");
  });

  it("scatter/chase clock pauses while frightened", () => {
    const g = playing();
    const before = g.modeT;
    g.frightenedT = 3;
    step(g, 1, rng0);
    expect(g.modeT).toBe(before);
    g.frightenedT = 0;
    step(g, 1, rng0);
    expect(g.modeT).toBeGreaterThan(before);
  });

  it("game over at 0 lives", () => {
    const g = playing();
    g.lives = 1;
    const gh = g.ghosts[0];
    gh.mode = "chase";
    gh.tile = { ...g.pac.tile };
    step(g, 0.016, rng0);
    expect(g.phase).toBe("dying");
    step(g, 2, rng0);
    expect(g.phase).toBe("over");
  });
});

describe("level flow & scaling", () => {
  it("clearing all pellets wins the level and nextLevel keeps score/lives", () => {
    const g = playing();
    g.pellets.clear();
    g.powers = new Set([key({ c: g.pac.tile.c - 1, r: g.pac.tile.r })]);
    setDirection(g, DIRS.left);
    step(g, 0.25, rng0);
    expect(g.phase).toBe("levelWon");
    g.score = 1234;
    g.lives = 2;
    const n = nextLevel(g);
    expect(n.level).toBe(2);
    expect(n.score).toBe(1234);
    expect(n.lives).toBe(2);
    expect(n.pellets.size).toBeGreaterThan(0);
  });

  it("frightened duration shrinks with level but never below 2s", () => {
    expect(frightenedDuration(1)).toBeGreaterThan(frightenedDuration(3));
    expect(frightenedDuration(50)).toBe(2);
  });
});
