// The film as a list of shots. Each shot is a pure function of time inside it: where the camera is, what it looks at, the
// lens, and the grade. Cuts are hard. The creature keeps living across them on one clock.
import {BODY_YAW, bellAt, bodyY, pulseAt} from '../shared/kin.js';
import tl from './timeline.json';

const sat = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => {
  const k = sat(x);
  return k * k * (3 - 2 * k);
};
const mix = (a, b, k) => a + (b - a) * k;
const mix3 = (a, b, k) => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
// a slow, heavy hand on the camera: a few sines, never a straight line
const drift = (t, s = 1) => [
  s * (Math.sin(t * 0.61) * 0.06 + Math.sin(t * 1.37 + 1) * 0.025),
  s * (Math.sin(t * 0.53 + 2) * 0.05 + Math.sin(t * 1.13 + 4) * 0.02),
  s * Math.sin(t * 0.47 + 3) * 0.05,
];
const up = (t) => bodyY(t, tl.beats);

export const SHOTS = [
  {
    // 1. Inside the cloud sea, rising. Something vast glows overhead.
    t0: 0,
    t1: tl.cuts[0],
    pose(t, k) {
      const e = Math.pow(k, 1.5);
      const y = up(t);
      return {
        pos: mix3([-31, -45, 52], [-19, -19, 33], e),
        target: mix3([-2, -1 + y, 0], [-1, -2 + y, 0], e),
        fov: 34,
        roll: mix(-0.05, -0.012, e),
        focus: 48,
        lens: 0.03,
      };
    },
    look: {exposure: 0.95, rays: 0.26, raysThreshold: 1.6, heartRays: true, bloom: 0.08, aurora: 0.55, heartGlow: 0.6, cloudHeart: 0.085, cloudSun: 0.07},
  },
  {
    // 2. On the skin. The camera slides up a rib, past the towers of the crown, with the aurora behind.
    t0: tl.cuts[0],
    t1: tl.cuts[1],
    pose(t, k) {
      const e = ease(k);
      const th = 2.19 + 0.32 * e;
      const v = mix(0.5, 0.2, e);
      const y = up(t);
      const c = pulseAt(t - v * 0.55, tl.beats);
      // the body is yawed: a point at local angle th sits at world angle th - BODY_YAW
      const P = bellAt(th + BODY_YAW, v, c, t);
      const Q = bellAt(th + BODY_YAW + 0.12, v - 0.2, c, t);
      const yawed = ([x, yy, z]) => {
        const cs = Math.cos(BODY_YAW);
        const sn = Math.sin(BODY_YAW);
        return [x * cs + z * sn, yy, -x * sn + z * cs];
      };
      const Pw = yawed(P);
      const Qw = yawed(Q);
      const nx = Math.cos(th);
      const nz = Math.sin(th);
      return {
        pos: [Pw[0] + nx * 1.9, Pw[1] + y + 1.35, Pw[2] + nz * 1.9],
        target: [Qw[0], Qw[1] + y + 1.3, Qw[2]],
        fov: 34,
        roll: 0.1,
        focus: 6,
        lens: 0.022,
      };
    },
    look: {exposure: 0.84, bloom: 0.08, bloomThreshold: 1.3},
  },
  {
    // 3. Underneath, among the filaments, looking up into the bell as it squeezes.
    t0: tl.cuts[1],
    t1: tl.cuts[2],
    pose(t, k) {
      const e = ease(k);
      const y = up(t);
      return {
        pos: mix3([0.9, -13 + y, 1.1], [0.5, -4.5 + y, 0.7], e),
        target: [0, 3.4 + y, 0],
        fov: mix(58, 66, e),
        roll: mix(-0.25, 0.3, e),
        focus: mix(16, 8.5, e),
        lens: 0.02,
      };
    },
    look: {exposure: 0.62, rays: 0.32, raysThreshold: 2.4, heartRays: true, bloom: 0.07, bloomThreshold: 1.6},
  },
  {
    // 4. Through the glass and into the heart, threading the rings.
    t0: tl.cuts[2],
    t1: tl.cuts[3],
    pose(t, k) {
      const e = ease(k * 0.96);
      const y = up(t);
      const a = 0.42 - e * 0.25 - 0.9 * Math.max(e - 0.35, 0);
      const rr = mix(17, 2.35, Math.pow(e, 0.8));
      const py = mix(4.6, 3.1, e);
      return {
        pos: [rr * Math.sin(a) + y * 0, py + y, rr * Math.cos(a)],
        target: [Math.sin(a) * 0.6, 3.0 + y, Math.cos(a) * 0.6],
        fov: mix(36, 52, e),
        roll: mix(-0.04, 0.16, e),
        focus: Math.max(rr - 0.5, 1.4),
        lens: 0.012,
      };
    },
    look: {exposure: 0.72, rays: 0.34, raysThreshold: 3, heartRays: true, bloom: 0.07, bloomThreshold: 1.8, streak: 0.06},
    // deep among the rings the sun is close: stop down, then let it burn out into the cut
    grade: (k) => ({exposure: mix(0.62, 0.46, ease((k - 0.45) / 0.4)) - 0.2 * Math.exp(-((k - 0.33) * (k - 0.33)) / 0.012) + 1.9 * Math.pow(sat((k - 0.93) / 0.07), 2)}),
  },
  {
    // 5. Flying with the flock around the rim, sun ahead, rim lights streaming past.
    t0: tl.cuts[3],
    t1: tl.cuts[4],
    pose(t, k) {
      const e = k;
      const y = up(t);
      const a = 0.72 - e * 1.1;
      const rr = 16.9;
      return {
        pos: [rr * Math.cos(a), -0.9 + y + 1.3 * Math.sin(e * 2.6), rr * Math.sin(a)],
        target: [(rr - 2.2) * Math.cos(a - 0.85), 0.5 + y, (rr - 2.2) * Math.sin(a - 0.85)],
        fov: 44,
        roll: 0.2 * Math.sin(e * 2.2 + 0.4),
        focus: 7.5,
        lens: 0.018,
      };
    },
    look: {exposure: 0.84, bloom: 0.08, bloomThreshold: 1.4, streak: 0.1, heartGlow: 0.5},
  },
  {
    // 6. The whole of it, as the image painted it. The last beat rolls out through the clouds.
    t0: tl.cuts[4],
    t1: tl.duration,
    pose(t, k) {
      const e = ease(k);
      const y = up(t);
      return {
        pos: mix3([1.8, -2.9 + y, 44], [1.0, -2.6 + y, 36.5], e),
        target: mix3([-3.2, -0.9 + y, 0], [-2.9, -0.8 + y, 0], e),
        fov: 32,
        roll: 0,
        focus: 47,
        lens: 0.012,
      };
    },
    look: {exposure: 1.0, rays: 0.1, raysThreshold: 3, heartRays: true, bloom: 0.07, bloomThreshold: 1.5, streak: 0.05, heartGlow: 0.62},
  },
];

export const shotAt = (t) => SHOTS.find((s) => t < s.t1) ?? SHOTS[SHOTS.length - 1];

export const poseShot = (shot, t) => {
  const k = sat((t - shot.t0) / (shot.t1 - shot.t0));
  const p = shot.pose(t, k);
  const d = drift(t, 1);
  return {...p, pos: [p.pos[0] + d[0], p.pos[1] + d[1], p.pos[2] + d[2]]};
};
