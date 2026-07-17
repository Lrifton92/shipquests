// Gas Chase — 8-bit style sounds, generated with WebAudio (no external assets).
// All fire-and-forget; muted until the user enables sound (autoplay policy).

let ctx: AudioContext | null = null;
let muted = true;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (!m) ac(); // user gesture: unlock the context
}

export function isMuted() {
  return muted;
}

/** One square-wave blip. t0 relative to now (s). */
function blip(freq: number, t0: number, dur: number, vol = 0.04, type: OscillatorType = "square") {
  const a = ac();
  if (!a || muted) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + t0);
  o.stop(a.currentTime + t0 + dur + 0.02);
}

/** Frequency sweep (for death / power). */
function sweep(from: number, to: number, t0: number, dur: number, vol = 0.05) {
  const a = ac();
  if (!a || muted) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(from, a.currentTime + t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, to), a.currentTime + t0 + dur);
  g.gain.setValueAtTime(vol, a.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + t0);
  o.stop(a.currentTime + t0 + dur + 0.02);
}

let wakaHigh = false;

export const sfx = {
  /** alternating two-tone chomp, the wakawaka */
  waka() {
    wakaHigh = !wakaHigh;
    blip(wakaHigh ? 440 : 330, 0, 0.07, 0.03);
  },
  power() {
    sweep(200, 900, 0, 0.35, 0.05);
  },
  ghost() {
    blip(523, 0, 0.06);
    blip(659, 0.06, 0.06);
    blip(880, 0.12, 0.09);
  },
  fruit() {
    blip(988, 0, 0.06);
    blip(1319, 0.07, 0.1);
  },
  death() {
    sweep(600, 60, 0, 0.9, 0.06);
  },
  /** short intro jingle on READY! */
  intro() {
    const notes = [262, 330, 392, 523, 392, 523];
    notes.forEach((f, i) => blip(f, i * 0.11, 0.1, 0.035, "triangle"));
  },
  won() {
    [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.09, 0.12, 0.04, "triangle"));
  },
};
