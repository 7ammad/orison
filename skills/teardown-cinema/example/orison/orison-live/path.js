// The site's journey: one continuous camera flight from the painting's view, over the crown city, down the flank, under
// the rim, up the axis and into the heart. Scroll position picks the point on it; both directions work. Numbers are
// relative to the creature's body, and each stop also sets the grade.

const STOPS = [
  {pos: [1.0, -2.6, 36.5], target: [-2.9, -0.8, 0], fov: 32, exposure: 1.0, glow: 0.62, bloom: 0.07, threshold: 1.5},
  {pos: [-6, 0, 30], target: [-1, 1, 0], fov: 32, exposure: 0.82, glow: 0.44, bloom: 0.07, threshold: 1.5},
  {pos: [-13, 10.5, 23], target: [-1, 5.5, 0], fov: 34, exposure: 0.82, glow: 0.4, bloom: 0.08, threshold: 1.4},
  {pos: [-5.6, 9.9, 6.6], target: [1.6, 7.5, -2.2], fov: 42, exposure: 0.8, glow: 0.5, bloom: 0.08, threshold: 1.4},
  {pos: [-0.8, 10.3, 3.6], target: [1.2, 6.8, -13], fov: 46, exposure: 0.84, glow: 0.5, bloom: 0.08, threshold: 1.4},
  {pos: [12, 8.5, -12.5], target: [1, 2.2, -1], fov: 42, exposure: 0.66, glow: 0.42, bloom: 0.08, threshold: 1.4},
  {pos: [17, 1.6, -8], target: [3, 0.6, -3], fov: 42, exposure: 0.68, glow: 0.5, bloom: 0.08, threshold: 1.4},
  {pos: [13.5, -9.5, 2], target: [1, 2.2, 0], fov: 50, exposure: 0.74, glow: 0.7, bloom: 0.07, threshold: 1.6},
  {pos: [2.6, -11.5, 2.2], target: [0, 3.4, 0], fov: 60, exposure: 0.62, glow: 0.9, bloom: 0.07, threshold: 1.6},
  {pos: [0.6, -3.6, 0.7], target: [0, 3.6, 0], fov: 66, exposure: 0.6, glow: 0.9, bloom: 0.07, threshold: 1.6},
  {pos: [0.9, 0.5, 1.0], target: [0, 3.0, 0], fov: 60, exposure: 0.54, glow: 0.8, bloom: 0.07, threshold: 1.8},
  {pos: [1.9, 2.8, 1.4], target: [0, 3.0, 0], fov: 56, exposure: 0.48, glow: 0.7, bloom: 0.07, threshold: 1.8},
];

const cr = (a, b, c, d, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
};

export function pathAt(s) {
  const n = STOPS.length - 1;
  const x = Math.min(0.99999, Math.max(0, s)) * n;
  const i = Math.floor(x);
  const t = x - i;
  const p0 = STOPS[Math.max(0, i - 1)];
  const p1 = STOPS[i];
  const p2 = STOPS[Math.min(n, i + 1)];
  const p3 = STOPS[Math.min(n, i + 2)];
  const v3 = (k) => [0, 1, 2].map((j) => cr(p0[k][j], p1[k][j], p2[k][j], p3[k][j], t));
  const ease = t * t * (3 - 2 * t);
  const m = (k) => p1[k] + (p2[k] - p1[k]) * ease;
  return {pos: v3('pos'), target: v3('target'), fov: m('fov'), exposure: m('exposure'), glow: m('glow'), bloom: m('bloom'), threshold: m('threshold')};
}
