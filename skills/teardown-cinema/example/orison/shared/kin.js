// The creature's one input: the beat. Everything that moves reads pulseAt(t), in JS here and in GLSL in glsl.js.
// Numbers are the master image's proportions: rim radius 13 units, crown 6.6 units above the rim.

export const BELL_R = 13;
export const BELL_H = 6.6;
export const GORES = 16;
export const PULSE_LAG = 0.55; // seconds for the squeeze to run from crown to rim
export const NBEATS = 8;
export const BODY_YAW = Math.PI / 16; // a panel, not a rib, faces the hero camera

export const envBeat = (x) => {
  if (x < 0) return 0;
  if (x < 0.55) {
    const k = x / 0.55;
    return k * k * (3 - 2 * k);
  }
  return Math.exp(-(x - 0.55) / 1.35);
};

export const pulseAt = (t, beats) => {
  let p = 0;
  for (const b of beats) p = Math.max(p, envBeat(t - b));
  return p + 0.07 * (0.5 + 0.5 * Math.sin(t * 1.05));
};

const sat = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => {
  const k = sat((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** A point on the dome. th radians, v 0 at the crown to 1 at a rib tip, c the local pulse. Same as bellAt in glsl.js. */
export function bellAt(th, v, c, t) {
  const sn = Math.abs(Math.sin(GORES * 0.5 * th));
  const V = v * (1 - 0.085 * Math.pow(sn, 0.8));
  const a = V * Math.PI * 0.5;
  let r = BELL_R * Math.pow(Math.max(Math.sin(a), 0), 0.92);
  let y = BELL_H * Math.pow(Math.max(Math.cos(a), 0), 0.95);
  const fl = sstep(0.82, 1, V);
  r += 0.7 * fl * fl;
  y -= 0.9 * fl * fl;
  r += 0.22 * sn * Math.sin(Math.PI * Math.min(V * 1.02, 1));
  const ss = sstep(0.12, 0.95, V);
  r *= 1 - 0.2 * c * ss;
  y += c * (1.1 * (1 - V) - 0.5 * V * V);
  r += 0.1 * Math.sin(th * 3 + t * 0.35 + V * 4) * ss;
  y += 0.1 * Math.sin(th * 2 - t * 0.27 + V * 3);
  return [r * Math.cos(th), y, r * Math.sin(th)];
}

/** The whole body's slow rise: each squeeze lifts it a little. Closed form, so any t can be asked for. */
export function bodyY(t, beats) {
  let y = 0;
  for (const b of beats) {
    const x = t - b;
    if (x > 0) y += 0.55 * (1 - Math.exp(-x / 1.6));
  }
  return y + 0.12 * Math.sin(t * 0.31);
}
