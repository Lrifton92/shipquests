"use client";
// Gas Chase — /arcade. Old school pacman-like: canvas renderer + rAF loop over
// the pure engine (lib/arcade). Keyboard (arrows/WASD) + swipe anywhere on the
// canvas. No onchain. Hi-score persists in localStorage.
import { useEffect, useRef, useState } from "react";
import {
  COLS,
  DIRS,
  MAZE,
  ROWS,
  createGame,
  nextLevel,
  setDirection,
  step,
  type Dir,
  type Game,
} from "@/lib/arcade/engine";
import { isMuted, setMuted, sfx } from "@/lib/arcade/sfx";
import { useT } from "../_components/i18n";
import styles from "./arcade.module.css";

const T = 16; // logical pixels per tile
const W = COLS * T;
const H = ROWS * T;
const HISCORE_KEY = "sq-arcade-hiscore";

const GHOST_COLORS: Record<string, string> = {
  blaze: "#ff4d4d",
  surge: "#ff9ff5",
  wisp: "#41e8e0",
  drift: "#ffb45e",
};

export default function ArcadePage() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState({ score: 0, hi: 0, level: 1, lives: 3 });
  const [muted, setMutedState] = useState(true);

  useEffect(() => {
    const hi = Number(localStorage.getItem(HISCORE_KEY) ?? "0") || 0;
    const game = createGame(hi);
    gameRef.current = game;
    sfx.intro();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let wakaCooldown = 0;
    let wonAt = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const g = gameRef.current!;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (g.phase === "levelWon") {
        if (!wonAt) wonAt = now;
        if (now - wonAt > 1500) {
          gameRef.current = nextLevel(g);
          wonAt = 0;
          sfx.intro();
        }
      } else {
        wonAt = 0;
        step(g, dt);
        wakaCooldown -= dt;
        for (const e of g.events) {
          if (e === "waka" && wakaCooldown <= 0) {
            sfx.waka();
            wakaCooldown = 0.08;
          } else if (e === "power") sfx.power();
          else if (e.startsWith("ghost:")) sfx.ghost();
          else if (e === "fruit") sfx.fruit();
          else if (e === "death") sfx.death();
          else if (e === "won") sfx.won();
        }
      }

      const cur = gameRef.current!;
      render(ctx, cur, now);
      setHud((h) =>
        h.score !== cur.score || h.hi !== cur.hiScore || h.level !== cur.level || h.lives !== cur.lives
          ? { score: cur.score, hi: cur.hiScore, level: cur.level, lives: cur.lives }
          : h,
      );
      if (cur.hiScore > hi) localStorage.setItem(HISCORE_KEY, String(cur.hiScore));
    };
    raf = requestAnimationFrame(loop);

    const dirFromKey = (k: string): Dir | null => {
      switch (k) {
        case "ArrowUp":
        case "w":
        case "z":
          return DIRS.up;
        case "ArrowDown":
        case "s":
          return DIRS.down;
        case "ArrowLeft":
        case "a":
        case "q":
          return DIRS.left;
        case "ArrowRight":
        case "d":
          return DIRS.right;
        default:
          return null;
      }
    };

    const restartIfOver = () => {
      const g = gameRef.current!;
      if (g.phase === "over") {
        gameRef.current = createGame(g.hiScore);
        sfx.intro();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const d = dirFromKey(e.key);
      if (d) {
        e.preventDefault();
        setDirection(gameRef.current!, d);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        restartIfOver();
      }
    };
    window.addEventListener("keydown", onKey);

    let touchStart: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      touchStart = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!touchStart) return;
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        restartIfOver();
        return;
      }
      const d =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS.right : DIRS.left) : dy > 0 ? DIRS.down : DIRS.up;
      setDirection(gameRef.current!, d);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSound = () => {
    setMuted(!isMuted());
    setMutedState(isMuted());
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.hud}>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>{t("arcade.score")}</span>
          <span className={styles.hudValue}>{hud.score}</span>
        </div>
        <div className={styles.hudBlock} style={{ textAlign: "center" }}>
          <span className={styles.hudLabel}>{t("arcade.hiscore")}</span>
          <span className={styles.hudValue}>{hud.hi}</span>
        </div>
        <div className={styles.hudBlock} style={{ textAlign: "right" }}>
          <span className={styles.hudLabel}>{t("arcade.level")}</span>
          <span className={styles.hudValue}>{hud.level}</span>
        </div>
      </div>

      <div className={styles.screen}>
        <canvas ref={canvasRef} className={styles.canvas} width={W} height={H} />
      </div>

      <div className={styles.bar}>
        <div className={styles.lives} aria-label={`${hud.lives} lives`}>
          {Array.from({ length: Math.max(0, hud.lives) }).map((_, i) => (
            <span key={i} className={styles.lifeDot} />
          ))}
        </div>
        <button type="button" className={styles.soundBtn} onClick={toggleSound}>
          {muted ? t("arcade.soundOn") : t("arcade.soundOff")}
        </button>
      </div>

      <p className={styles.hint}>{t("arcade.hint")}</p>
    </main>
  );
}

// ---------------------------------------------------------------- rendering

function px(tile: { c: number; r: number }, dir: Dir | null, progress: number) {
  const dc = dir?.dc ?? 0;
  const dr = dir?.dr ?? 0;
  return {
    x: (tile.c + dc * progress + 0.5) * T,
    y: (tile.r + dr * progress + 0.5) * T,
  };
}

function render(ctx: CanvasRenderingContext2D, g: Game, now: number) {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);

  // walls
  ctx.strokeStyle = "#2c53c9";
  ctx.lineWidth = 2;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const ch = MAZE[r][c];
      if (ch === "#") {
        ctx.strokeStyle = "#2c53c9";
        roundRect(ctx, c * T + 3, r * T + 3, T - 6, T - 6, 3);
        ctx.stroke();
      } else if (ch === "-") {
        ctx.strokeStyle = "#ff9ff5";
        ctx.beginPath();
        ctx.moveTo(c * T + 2, r * T + T / 2);
        ctx.lineTo(c * T + T - 2, r * T + T / 2);
        ctx.stroke();
      }
    }

  // pellets (cUSD coins)
  ctx.fillStyle = "#f5c451";
  for (const k of g.pellets) {
    const [c, r] = k.split(",").map(Number);
    ctx.fillRect(c * T + T / 2 - 1.5, r * T + T / 2 - 1.5, 3, 3);
  }
  // power pellets (airdrops) — pulsing
  const pulse = 3.4 + Math.sin(now / 130) * 1.4;
  for (const k of g.powers) {
    const [c, r] = k.split(",").map(Number);
    ctx.beginPath();
    ctx.arc(c * T + T / 2, r * T + T / 2, pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  // fruit — CELO pixel diamond
  if (g.fruit) {
    const { x, y } = px(g.fruit.tile, null, 0);
    ctx.fillStyle = "#fcff52";
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fill();
  }

  // ghosts
  for (const gh of g.ghosts) {
    const { x, y } = px(gh.tile, gh.dir, gh.progress);
    drawGhost(ctx, x, y, gh.name, gh.mode, g.frightenedT, now);
  }

  // pac
  drawPac(ctx, g, now);

  // overlays
  ctx.textAlign = "center";
  ctx.font = `bold ${T - 3}px ui-monospace, monospace`;
  if (g.phase === "ready") {
    ctx.fillStyle = "#f5c451";
    ctx.fillText("READY!", W / 2, (ROWS / 2 + 2.25) * T);
  } else if (g.phase === "over") {
    ctx.fillStyle = "#ff4d4d";
    ctx.fillText("GAME OVER", W / 2, (ROWS / 2 - 1.7) * T);
    ctx.fillStyle = "#8b8f9f";
    ctx.font = `${T - 6}px ui-monospace, monospace`;
    ctx.fillText("TAP / SPACE", W / 2, (ROWS / 2 + 2.25) * T);
  } else if (g.phase === "levelWon") {
    if (Math.floor(now / 180) % 2 === 0) {
      ctx.fillStyle = "#41e8e0";
      ctx.fillText(`LEVEL ${g.level} CLEAR`, W / 2, (ROWS / 2 - 1.7) * T);
    }
  }
}

function drawPac(ctx: CanvasRenderingContext2D, g: Game, now: number) {
  const p = g.pac;
  const { x, y } = px(p.tile, p.dir, p.progress);
  const R = T / 2 - 1.5;

  if (g.phase === "dying") {
    // death: mouth opens to a full circle until pac vanishes
    const k = Math.min(1, Math.max(0, 1 - g.phaseT / 1.4));
    const open = 0.1 + k * Math.PI;
    ctx.fillStyle = "#f5c451";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R * (1 - k * 0.6), -Math.PI / 2 + open, -Math.PI / 2 - open + Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
    return;
  }

  const angle = p.dir
    ? Math.atan2(p.dir.dr, p.dir.dc)
    : Math.atan2(DIRS.left.dr, DIRS.left.dc);
  const mouth = 0.28 + Math.abs(Math.sin(now / 70)) * 0.36; // chomping
  ctx.fillStyle = "#f5c451";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, R, angle + mouth, angle - mouth + Math.PI * 2, false);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  mode: string,
  frightenedT: number,
  now: number,
) {
  if (mode === "housed") {
    // waiting inside: bob gently
    y += Math.sin(now / 200) * 1.5;
  }
  const R = T / 2 - 1.5;
  const eyesOnly = mode === "eaten";
  const frightened = mode === "frightened";
  const flashing = frightened && frightenedT < 2 && Math.floor(now / 160) % 2 === 0;
  if (!eyesOnly) {
    let body = GHOST_COLORS[name] ?? "#fff";
    if (frightened) body = flashing ? "#f7f7ff" : "#6d5cff"; // vivid indigo, pops on the navy maze
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y - 1, R, Math.PI, 0);
    // skirt
    const bottom = y + R - 1;
    ctx.lineTo(x + R, bottom);
    const waves = 3;
    for (let i = 0; i < waves * 2; i++) {
      const wx = x + R - ((i + 1) * (R * 2)) / (waves * 2);
      const wy = i % 2 === 0 ? bottom - 3 : bottom;
      ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.fill();
  }
  const ex = 3;
  if (frightened && !eyesOnly) {
    // classic frightened face: square eyes + wavy mouth, no pupils
    const face = flashing ? "#d23c3c" : "#f7f7ff";
    ctx.fillStyle = face;
    ctx.fillRect(x - ex - 1, y - 4, 2.6, 2.6);
    ctx.fillRect(x + ex - 1.6, y - 4, 2.6, 2.6);
    ctx.strokeStyle = face;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 3);
    for (let i = 0; i < 5; i++) ctx.lineTo(x - 5 + (i + 1) * 2, y + (i % 2 === 0 ? 1.4 : 3));
    ctx.stroke();
    return;
  }
  // normal / eaten: round white eyes with pupils
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - ex, y - 2, 2.4, 0, Math.PI * 2);
  ctx.arc(x + ex, y - 2, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b3bd6";
  ctx.beginPath();
  ctx.arc(x - ex, y - 2, 1.2, 0, Math.PI * 2);
  ctx.arc(x + ex, y - 2, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
