// The interactive version: the same creature, code and light as the film, with no panels and no text. Scroll flies the
// camera on one path from the painting's view into the heart. Moving lights the glass under the cursor. A click or a tap
// makes it beat. A drag looks around. Left alone it keeps breathing and beating by itself.
import * as THREE from 'three';
import {Cinema} from 'cinema-kit/cinema.js';
import {createWorld, QUALITY} from '../shared/world.js';
import {createAudio} from './audio.js';
import posterUrl from '../brief/poster.jpg';
import {pathAt} from './path.js';

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer:coarse)').matches;
const qName = params.get('q') ?? (coarse ? 'lite' : 'live');
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
const $ = (id) => document.getElementById(id);

// the body settles back after each beat rather than climbing for as long as the page is open
const rise = (t, beats) => {
  let y = 0;
  for (let i = beats.length - 1; i >= 0 && i >= beats.length - 8; i--) {
    const x = t - beats[i];
    if (x > 0) y += 0.55 * (1 - Math.exp(-x / 1.2)) * Math.exp(-x / 7);
  }
  return y + 0.12 * Math.sin(t * 0.31);
};

// quality steps, cheapest last; the page moves along them by measured frame rate, and never asks the viewer
const TIERS = [
  {res: 1.0, steps: QUALITY[qName].cloudSteps, light: QUALITY[qName].cloudLight, fil: 1, fly: 1},
  {res: 0.84, steps: Math.max(12, QUALITY[qName].cloudSteps - 6), light: Math.max(1, QUALITY[qName].cloudLight - 1), fil: 1, fly: 1},
  {res: 0.7, steps: 12, light: 1, fil: 0.7, fly: 0.8},
  {res: 0.56, steps: 9, light: 1, fil: 0.45, fly: 0.6},
  {res: 0.42, steps: 7, light: 1, fil: 0.3, fly: 0.5},
];

async function boot() {
  // Open on the painting itself. The creature takes over from it as soon as its shaders are ready.
  const poster = $('poster');
  poster.style.backgroundImage = `url(${posterUrl})`;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'A colossal glass creature floating above an alien cloud sea. Scroll to fly into it, click to make it beat.');
  poster.after(canvas);

  const cine = new Cinema({canvas, samples: 1, msaa: coarse ? 0 : 2, bloomLevels: 5});
  const baseSize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    // cap at about 1080p: past that the glass does not get better, only slower
    const cap = Math.sqrt((1920 * 1080) / Math.max(1, innerWidth * innerHeight * dpr * dpr));
    return dpr * Math.min(1, cap);
  };
  cine.setSize(innerWidth, innerHeight, baseSize());
  const q = QUALITY[qName] ?? QUALITY.live;
  const world = await createWorld({cine, q, beats: [], softClouds: true});
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 6000);
  const audio = createAudio();

  const filaments = world.creature.body.children.find((c) => c.geometry?.attributes?.iA && c.geometry.attributes.aS);
  const flock = world.creature.flock;
  const allFil = filaments?.geometry.instanceCount ?? 0;
  const allFly = flock?.geometry.instanceCount ?? 0;

  let tier = Number(params.get('tier') ?? 0);
  const applyTier = () => {
    const T = TIERS[tier];
    cine.setSize(innerWidth, innerHeight, baseSize() * T.res);
    world.sky.cloudU.uSteps.value = T.steps;
    world.sky.cloudU.uLightSteps.value = T.light;
    if (filaments) filaments.geometry.instanceCount = Math.round(allFil * T.fil);
    if (flock) flock.geometry.instanceCount = Math.round(allFly * T.fly);
  };
  applyTier();
  addEventListener('resize', () => {
    applyTier();
    camera.aspect = innerWidth / innerHeight;
  });

  // the beat: the same function of time the film uses, with times that now come from the viewer
  const beats = [];
  const clock0 = performance.now();
  const now = () => (performance.now() - clock0) / 1000;
  let lastBeat = -10;
  let lastTouch = -100;
  const beat = (level = 1) => {
    const t = now();
    if (t - lastBeat < 0.55) return;
    lastBeat = t;
    beats.push(t);
    world.setBeats(beats);
    audio.boom(level);
  };

  // the cursor: where it touches the glass
  const pointer = {x: 0, y: 0, nx: 0, ny: 0, seen: false, down: false, dragged: false, sx: 0, sy: 0};
  const look = {yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, px: 0, py: 0};
  const touchEl = $('touch');
  const hover = world.shared.uHoverP.value;
  let hoverA = 0;
  const ray = new THREE.Vector3();
  const hitDome = () => {
    // the dome as an ellipsoid: close enough to light the right panel
    ray.set(pointer.nx, pointer.ny, 0.5).unproject(camera).sub(camera.position).normalize();
    const by = world.creature.body.position.y;
    const R = 13.5;
    const H = 8.8;
    const ox = camera.position.x / R;
    const oy = (camera.position.y - by) / H;
    const oz = camera.position.z / R;
    const dx = ray.x / R;
    const dy = ray.y / H;
    const dz = ray.z / R;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - 1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const sq = Math.sqrt(disc);
    for (const k of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
      if (k <= 0) continue;
      const py = camera.position.y + ray.y * k;
      if (py > by - 0.8) {
        hover.set(camera.position.x + ray.x * k, py, camera.position.z + ray.z * k);
        return true;
      }
    }
    return false;
  };

  const BELLS = [587.3, 698.5, 880, 1046.5, 1318.5, 1760];
  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ny = -(e.clientY / innerHeight) * 2 + 1;
    pointer.seen = true;
    touchEl.classList.add('on');
    touchEl.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    if (pointer.down) {
      const dx = e.clientX - pointer.sx;
      const dy = e.clientY - pointer.sy;
      if (Math.hypot(dx, dy) > 6) pointer.dragged = true;
      if (pointer.dragged) {
        look.tYaw = look.px - (dx / innerWidth) * 1.6;
        look.tPitch = look.py + (dy / innerHeight) * 1.0;
      }
    }
  });
  addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('button')) return;
    pointer.down = true;
    pointer.dragged = false;
    pointer.sx = e.clientX;
    pointer.sy = e.clientY;
    look.px = look.tYaw;
    look.py = look.tPitch;
    audio.start();
  });
  addEventListener('pointerup', (e) => {
    if (e.target.closest?.('button')) return;
    const wasDrag = pointer.dragged;
    pointer.down = false;
    if (!wasDrag) {
      pointer.nx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ny = -(e.clientY / innerHeight) * 2 + 1;
      beat(1);
      const t = now();
      if (hitDome()) world.shared.uRipple.value.set(hover.x, hover.y, hover.z, t);
      else world.shared.uRipple.value.set(0, world.shared.uHeart.value.y, 0, t);
      touchEl.classList.add('hit');
      setTimeout(() => touchEl.classList.remove('hit'), 260);
    } else {
      look.tYaw *= 0.0;
      look.tPitch *= 0.0;
    }
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      audio.start();
      beat(1);
    } else if (e.key === 'm' || e.key === 'M') {
      toggleSound();
    }
  });
  const soundBtn = $('sound');
  const toggleSound = () => {
    audio.start();
    const on = audio.toggle();
    soundBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
    soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
  };
  soundBtn.addEventListener('click', toggleSound);

  // the scroll position, eased, is the place on the journey
  const scrollT = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  let s = params.has('s') ? Number(params.get('s')) : scrollT();
  if (params.has('s')) scrollTo(0, Number(params.get('s')) * (document.documentElement.scrollHeight - innerHeight));
  let scrolled = false;
  addEventListener('scroll', () => {
    if (!scrolled && scrollY > 8) {
      scrolled = true;
      $('hint').classList.remove('on');
    }
  }, {passive: true});

  const raysLook = {vignette: 0.55, ca: 0.0014, grain: 0.018, streak: 0.05, streakThreshold: 3.2, saturation: 1.06, contrast: 0.18};
  const place = (t) => {
    const p = pathAt(s);
    const y = world.creature.body.position.y;
    const wob = reduced ? 0 : 1;
    camera.position.set(p.pos[0] + wob * Math.sin(t * 0.37) * 0.14, p.pos[1] + y + wob * Math.sin(t * 0.29 + 2) * 0.11, p.pos[2] + wob * Math.sin(t * 0.23 + 4) * 0.12);
    const aspect = innerWidth / innerHeight;
    const fit = Math.max(1, 1.8 / aspect);
    camera.fov = (2 * Math.atan(Math.tan((p.fov * Math.PI) / 360) * Math.min(fit, 2.1)) * 180) / Math.PI;
    const centre = Math.min(1, Math.max(0, (aspect - 1) / 0.8));
    camera.lookAt(p.target[0] * (s < 0.1 ? centre : 1), p.target[1] + y, p.target[2]);
    // look around: the pointer leans the view a little, a drag leans it a lot
    const lean = pointer.seen && !pointer.down ? 0.022 : 0;
    camera.rotateY(look.yaw - pointer.nx * lean);
    camera.rotateX(look.pitch + pointer.ny * lean * 0.6);
    return p;
  };

  // compile everything before the first frame, so the page never stalls when it appears
  world.pose(0, beats, rise);
  const p0 = place(0);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  world.draw(camera);
  const r = cine.renderer;
  await Promise.all([r.compileAsync(world.scene, camera), r.compileAsync(world.sky.scene, camera), r.compileAsync(world.sky.cloudScene, camera)]);

  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let settled = 0;
  let healthy = 0;
  let climbAfter = 6;
  let shown = false;
  let nextAuto = 3.2;
  const live = (window.__live = {tier, fps: 0, s: 0, q: qName, beats: beats.length, res: [0, 0]});

  const loop = (nowMs) => {
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const t = now();

    // left alone, it keeps its own slow heartbeat
    if (t > nextAuto) {
      beat(0.45);
      nextAuto = t + 6.4;
    }
    if (t - lastBeat < 0.1) nextAuto = Math.max(nextAuto, t + 6.4);

    const target = scrollT();
    s += (target - s) * (1 - Math.exp(-dt * 2.6));
    look.yaw += (look.tYaw - look.yaw) * (1 - Math.exp(-dt * (pointer.down ? 12 : 1.6)));
    look.pitch += (look.tPitch - look.pitch) * (1 - Math.exp(-dt * (pointer.down ? 12 : 1.6)));

    world.pose(t, beats, rise);
    const p = place(t);
    world.soft.alpha = Math.min(0.5, 0.14 + Math.abs(target - s) * 40);
    world.shared.uHeartGlow.value = p.glow;
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const hit = pointer.seen && !pointer.down && hitDome();
    const before = hoverA;
    hoverA += ((hit ? 1 : 0) - hoverA) * (1 - Math.exp(-dt * 5));
    world.shared.uHoverA.value = hoverA;
    if (before < 0.2 && hoverA >= 0.2 && t - lastTouch > 0.35) {
      lastTouch = t;
      audio.bell(BELLS[Math.floor(Math.random() * BELLS.length)], 0.028);
    }

    audio.update(s, t);

    cine.frame(
      t,
      (sub, sample) => {
        cine.applyLens(camera, sample, 0, 10);
        world.draw(camera);
      },
      {...raysLook, exposure: p.exposure, bloom: p.bloom, bloomThreshold: p.threshold},
    );

    $('railDot').style.top = `${s * 127}px`;
    if (!shown) {
      shown = true;
      canvas.classList.add('on');
      poster.classList.add('off');
      $('wake').classList.add('off');
      setTimeout(() => poster.remove(), 2600);
      setTimeout(() => {
        $('rail').classList.add('on');
        soundBtn.classList.add('on');
        if (!scrolled) $('hint').classList.add('on');
      }, 2400);
    }

    // watch the frame rate; step down if this machine needs it
    acc += dt;
    frames++;
    settled += dt;
    if (acc > 1) {
      const fps = frames / acc;
      live.fps = Math.round(fps);
      live.tier = tier;
      live.s = Math.round(s * 1000) / 1000;
      live.beats = beats.length;
      live.res = [cine.size.w, cine.size.h];
      if (fps < 30 && settled > 2.5 && tier < TIERS.length - 1 && !params.has('tier')) {
        tier++;
        applyTier();
        settled = 0;
        healthy = 0;
      } else if (tier > 0 && !params.has('tier')) {
        // a hitch should not cost the whole visit: climb back when frames are healthy, waiting longer after each try
        healthy = fps >= 50 ? healthy + acc : 0;
        if (healthy > climbAfter) {
          tier--;
          applyTier();
          settled = 0;
          healthy = 0;
          climbAfter = Math.min(60, climbAfter * 1.6);
        }
      }
      acc = 0;
      frames = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  void p0;
}

boot();
