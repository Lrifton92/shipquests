"use client";
// One-shot celebration burst: gold "cUSD coin" shards that jet outward once when a
// claim succeeds, then fall + fade. Pure <canvas> + rAF, auto-stops when every
// particle has faded (no loop, no layout thrash). Non-interactive overlay.
//
// Honors prefers-reduced-motion: renders nothing (the success view stays static).
// Mount it inside a positioned success container; it fills that container.
import { useEffect, useRef } from "react";

const COLORS = ["#fcff52", "#fbcc5c", "#ffe27a", "#fff7c2"]; // gold family only
const COUNT = 30;
const GRAVITY = 0.06; // px / frame²
const DRAG = 0.99;

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  life: number; // 0 → 1, fades after 0.6
};

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Re-fires the burst whenever `fireKey` changes (and is truthy). */
export function RewardBurst({ fireKey }: { fireKey: boolean | number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!fireKey || prefersReduced()) return;
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Origin: horizontal centre, slightly above middle (where the amount sits).
    const ox = w / 2;
    const oy = h * 0.42;

    const particles: P[] = Array.from({ length: COUNT }, () => {
      // Upward-biased fan: mostly jets up/out, then gravity pulls down.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      const speed = 3.2 + Math.random() * 4.8;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 0,
      };
    });

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of particles) {
        p.life += 1 / 64; // ~1.05s total
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const alpha = p.life < 0.6 ? 1 : Math.max(0, 1 - (p.life - 0.6) / 0.4);
        if (alpha <= 0) continue;
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        // Coin-ish shard: rounded rect read as a tiny tumbling chip.
        const s = p.size;
        ctx.beginPath();
        ctx.roundRect(-s, -s * 0.5, s * 2, s, s * 0.4);
        ctx.fill();
        ctx.restore();
      }
      if (alive) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, [fireKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
