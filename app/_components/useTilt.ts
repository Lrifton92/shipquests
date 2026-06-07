"use client";
// Pointer-driven 3D tilt for cards. CSS-transform only (no WebGL) — sets two
// CSS custom properties (--rx, --ry) the element's stylesheet consumes inside a
// `perspective` context. Tilt is capped to a gentle ±MAX deg and disabled under
// prefers-reduced-motion (returns no-op handlers + zeroed vars).
import { useCallback, useRef, type CSSProperties, type PointerEvent } from "react";

const MAX = 6; // degrees — gentle, premium, never gimmicky

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const reduced = prefersReduced();

  const onPointerMove = useCallback(
    (e: PointerEvent<T>) => {
      if (reduced || e.pointerType === "touch") return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width; // 0..1
      const py = (e.clientY - r.top) / r.height; // 0..1
      // Top tilts back, bottom tilts forward; left/right mirror.
      const ry = (px - 0.5) * 2 * MAX;
      const rx = -(py - 0.5) * 2 * MAX;
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    },
    [reduced],
  );

  const reset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }, []);

  // Initial vars so the first transition has a "from" value.
  const style: CSSProperties = { "--rx": "0deg", "--ry": "0deg" } as CSSProperties;

  return { ref, style, onPointerMove, onPointerLeave: reset, onPointerUp: reset };
}
