"use client";
// Desktop-only cursor spotlight on the deep-black background.
// Writes --mx/--my CSS vars directly on the overlay ref (no React state, no
// re-render per mousemove), throttled to one update per animation frame.
// Guarded to fine-pointer / hover devices that don't prefer reduced motion.
import { useEffect, useRef } from "react";
import styles from "./CursorGlow.module.css";

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only run on devices with a fine pointer and hover, motion not reduced.
    const ok =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok) return;

    let raf = 0;
    let x = 0;
    let y = 0;
    let shown = false;

    const apply = () => {
      raf = 0;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      if (!shown) {
        shown = true;
        el.classList.add(styles.on);
      }
    };

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      shown = false;
      el.classList.remove(styles.on);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={styles.root} aria-hidden>
      <div className={styles.halo} />
      <div className={styles.grid} />
    </div>
  );
}
