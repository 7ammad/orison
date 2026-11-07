// The film page. capture.mjs steps window.SIM.render(t) frame by frame. There is no overlay of any kind.
import * as THREE from 'three';
import {Cinema, runFilm} from 'cinema-kit/cinema.js';
import {createWorld, QUALITY} from '../shared/world.js';
import {poseShot, shotAt} from './shots.js';
import tl from './timeline.json';

const cfg = window.__SIM_CONFIG ?? {};
const params = new URLSearchParams(location.search);
const SAMPLES = cfg.samples ?? Number(params.get('samples') ?? 16);

runFilm({duration: tl.duration, fps: tl.fps}, async ({canvas}) => {
  const cine = new Cinema({canvas, samples: SAMPLES, fps: tl.fps, shutter: 0.5, msaa: SAMPLES > 1 ? 0 : 4});
  cine.setSize(innerWidth, innerHeight, devicePixelRatio);
  const q = {...QUALITY.film, ...(cfg.q ?? {})};
  const world = await createWorld({cine, q, beats: tl.beats});
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 6000);
  const v = new THREE.Vector3();
  const place = (shot, t) => {
    const p = poseShot(shot, t);
    camera.position.fromArray(p.pos);
    camera.fov = p.fov;
    camera.lookAt(p.target[0], p.target[1], p.target[2]);
    camera.rotateZ(p.roll);
    return p;
  };
  return {
    resize(w, h, pr) {
      cine.setSize(w, h, pr);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render(t) {
      // a cut must not smear: every sub-frame of this frame belongs to the shot the frame starts in
      const shot = shotAt(t);
      world.sky.uniforms.uAurora.value = shot.look.aurora ?? 1;
      world.shared.uHeartGlow.value = shot.look.heartGlow ?? 1;
      world.sky.cloudU.uCloudHeart.value = shot.look.cloudHeart ?? 1;
      world.sky.cloudU.uCloudSun.value = shot.look.cloudSun ?? 1;
      const look = {...shot.look, ...(shot.grade ? shot.grade((t - shot.t0) / (shot.t1 - shot.t0)) : {})};
      cine.frame(
        t,
        (sub, sample) => {
          const st = Math.max(shot.t0, Math.min(shot.t1 - 1e-3, sub));
          world.pose(st);
          const p = place(shot, st);
          cine.applyLens(camera, sample, p.lens, p.focus);
          world.draw(camera);
        },
        (() => {
          // the light shafts converge on the heart, wherever it is on screen
          if (shot.look.heartRays) {
            world.pose(t);
            place(shot, t);
            camera.updateMatrixWorld();
            camera.updateProjectionMatrix();
            v.copy(world.shared.uHeart.value).project(camera);
            look.raysCenter = [v.x * 0.5 + 0.5, v.y * 0.5 + 0.5];
            if (v.z > 1) look.rays = 0;
          }
          const endFade = 1 - Math.min(1, Math.max(0, (t - tl.end) / 0.5));
          const startFade = Math.min(1, t / 0.8);
          look.fade = endFade * startFade;
          return look;
        })(),
      );
    },
  };
});
