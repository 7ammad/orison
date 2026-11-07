// Everything in one place: textures, shared uniforms, the sky, the creature and the heart. The film and the live page both
// build this, then differ only in who holds the camera.
import * as THREE from 'three';
import goreUrl from '../assets/gore.jpg';
import filigreeUrl from '../assets/filigree.jpg';
import silkUrl from '../assets/silk.jpg';
import planetUrl from '../assets/planet.jpg';
import ringsUrl from '../assets/rings.jpg';
import flyerUrl from '../assets/flyer.jpg';
import {SKYBASE} from './glsl.js';
import {createSky, makeNoise3D} from './sky.js';
import {createCreature} from './creature.js';
import {createHeart} from './heart.js';
import {BODY_YAW, bodyY, envBeat} from './kin.js';

const CLOUD_SURFACE = -22;

export const QUALITY = {
  film: {domeU: 800, domeV: 160, ribU: 96, hoops: [], beadsPerRib: 30, hemBeads: 420, spires: 560, spireProfile: 34, spireSides: 18, armU: 640, armW: 34, filSeg: 34, filaments: 3200, flyers: 170, motes: 9000, ringSeg: 256, auroraSteps: 32, cloudSteps: 72, cloudLight: 4, cloudFar: 1600, noise: 64, aniso: 16},
  live: {domeU: 400, domeV: 80, ribU: 56, hoops: [], beadsPerRib: 24, hemBeads: 520, spires: 260, spireProfile: 14, spireSides: 8, armU: 300, armW: 20, filSeg: 16, filaments: 1800, flyers: 180, motes: 3000, ringSeg: 128, auroraSteps: 12, cloudSteps: 22, cloudLight: 2, cloudFar: 900, noise: 48, aniso: 8},
  lite: {domeU: 240, domeV: 56, ribU: 36, hoops: [], beadsPerRib: 16, hemBeads: 320, spires: 120, spireProfile: 8, spireSides: 6, armU: 180, armW: 12, filSeg: 10, filaments: 800, flyers: 90, motes: 1400, ringSeg: 72, auroraSteps: 7, cloudSteps: 12, cloudLight: 1, cloudFar: 600, noise: 32, aniso: 4},
};

async function loadTex(renderer, q) {
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb = true, wrap = THREE.RepeatWrapping) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = wrap;
    t.anisotropy = Math.min(q.aniso, renderer.capabilities.getMaxAnisotropy());
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  };
  const filigree = await load(filigreeUrl, true, THREE.MirroredRepeatWrapping);
  const filigreeHoop = filigree.clone();
  filigreeHoop.needsUpdate = true;
  return {
    gore: await load(goreUrl, true, THREE.ClampToEdgeWrapping),
    filigree,
    filigreeHoop,
    silk: await load(silkUrl, true, THREE.MirroredRepeatWrapping),
    planet: await load(planetUrl, true, THREE.ClampToEdgeWrapping),
    rings: await load(ringsUrl, true, THREE.ClampToEdgeWrapping),
    flyer: await load(flyerUrl, true, THREE.ClampToEdgeWrapping),
  };
}

/** A small painted room for reflections: the sky's colours, the planet's warmth, the aurora's green, the clouds' violet. */
function makeEnv(renderer, shared) {
  const scene = new THREE.Scene();
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      toneMapped: false,
      uniforms: {...shared},
      vertexShader: `varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `
        ${SKYBASE}
        varying vec3 vD;
        void main(){
          vec3 d=normalize(vD);
          vec3 c=skyBase(d)*1.4+vec3(.03,.025,.06);
          c+=vec3(1.3,.75,.34)*pow(max(dot(d,normalize(vec3(-.34,.32,-.88))),0.),14.)*.7;
          c+=vec3(.1,1.,.5)*pow(max(dot(d,normalize(vec3(.6,.55,-.55))),0.),6.)*.32;
          c+=vec3(.5,.14,.9)*pow(max(dot(d,normalize(vec3(.1,.7,.7))),0.),5.)*.22;
          c+=vec3(1.2,.72,.4)*max(-d.y,0.)*.55;
          gl_FragColor=vec4(c,1.);
        }`,
    }),
  );
  scene.add(m);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.015).texture;
  pm.dispose();
  return tex;
}

export async function createWorld({cine, q, beats: beatsIn = [], softClouds = false}) {
  const renderer = cine.renderer;
  const noise = makeNoise3D(q.noise);
  const beats = [...beatsIn];
  const beatArr = new Float32Array(8).fill(-1e4);
  beats.slice(-8).forEach((b, i) => (beatArr[i] = b));
  const sunDir = new THREE.Vector3(0.33, 0.016, -0.944).normalize();
  const shared = {
    uTime: {value: 0},
    uBeats: {value: beatArr},
    tNoise: {value: noise},
    uSunDir: {value: sunDir},
    uHazeK: {value: 0.0034},
    uHeart: {value: new THREE.Vector3(0, 3.0, 0)},
    uHeartI: {value: 1},
    uHeartCol: {value: new THREE.Color(1.0, 0.68, 0.34)},
    uRes: {value: new THREE.Vector2(1920, 960)},
    uInside: {value: 0},
    uHeartGlow: {value: 1},
    uHoverP: {value: new THREE.Vector3()},
    uHoverA: {value: 0},
    uRipple: {value: new THREE.Vector4(0, 0, 0, -1e4)},
  };
  const tex = await loadTex(renderer, q);
  const env = makeEnv(renderer, shared);
  const sky = createSky({shared, planetTex: tex.planet, ringsTex: tex.rings, q});
  sky.cloudTop.value = -6;
  sky.cloudU.uCloudBot.value = -48;

  const scene = new THREE.Scene();
  const creature = createCreature({shared, tex, env, q});
  const heart = createHeart({shared, tex, env, q});
  scene.add(creature.body);
  creature.body.add(heart.root);
  creature.world.forEach((o) => scene.add(o));
  // the low sun, and the violet fill from the cloud sea and sky
  const sun = new THREE.DirectionalLight('#ffb27a', 3.2);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#5a4f9a', '#a06a58', 0.85));

  /** Pose the whole world for time t. Pure: t alone decides everything. */
  const pose = (t, beatList = beats, rise = bodyY) => {
    shared.uTime.value = t;
    const y = rise(t, beatList);
    creature.body.position.y = y;
    creature.body.rotation.z = 0.018 * Math.sin(t * 0.21);
    creature.body.rotation.x = 0.014 * Math.sin(t * 0.17 + 1);
    creature.body.rotation.y = BODY_YAW;
    heart.update(t, beatList);
    shared.uHeart.value.set(0, 3.0 + y, 0);
    // the light ring that rolls out through the cloud tops after each beat
    let shock = 0;
    let rad = 0;
    for (const b of beatList) {
      const x = t - b;
      if (x > 0 && x < 7) {
        const s = Math.exp(-x / 2.1) * Math.min(1, x / 0.25);
        if (s > shock) {
          shock = s;
          rad = 8 + x * 24;
        }
      }
    }
    sky.cloudU.uShock.value = shock;
    sky.cloudU.uShockR.value = rad;
  };

  const setBeats = (list) => {
    beatArr.fill(-1e4);
    list.slice(-8).forEach((b, i) => (beatArr[i] = b));
  };

  // soft clouds: a half-resolution layer, averaged over frames, then laid into the picture
  const soft = {a: null, b: null, cur: null, w: 0, h: 0, alpha: 0.2, fresh: true};
  const softBlend = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tNew,tOld; uniform float uAlpha;
      void main(){ gl_FragColor=mix(texture2D(tOld,vUv),texture2D(tNew,vUv),uAlpha); }`,
    uniforms: {tNew: {value: null}, tOld: {value: null}, uAlpha: {value: 1}},
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const softOver = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; void main(){ gl_FragColor=texture2D(tSrc,vUv); }`,
    uniforms: {tSrc: {value: null}},
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const softTargets = () => {
    const w = Math.max(2, cine.size.w >> 1);
    const h = Math.max(2, cine.size.h >> 1);
    if (w === soft.w && h === soft.h) return;
    for (const t of [soft.a, soft.b, soft.cur]) t?.dispose();
    const make = () => new THREE.WebGLRenderTarget(w, h, {type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter});
    soft.a = make();
    soft.b = make();
    soft.cur = make();
    soft.w = w;
    soft.h = h;
    soft.fresh = true;
  };
  const renderSoftClouds = (camera) => {
    softTargets();
    renderer.setRenderTarget(soft.cur);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setClearColor(0x000000, 1);
    renderer.render(sky.cloudScene, camera);
    softBlend.uniforms.tNew.value = soft.cur.texture;
    softBlend.uniforms.tOld.value = soft.a.texture;
    softBlend.uniforms.uAlpha.value = soft.fresh ? 1 : soft.alpha;
    soft.fresh = false;
    cine.blit(softBlend, soft.b);
    [soft.a, soft.b] = [soft.b, soft.a];
  };
  const layCloudsIn = () => {
    softOver.uniforms.tSrc.value = soft.a.texture;
    cine.blit(softOver, cine.rtScene);
  };

  let frameId = 0;
  /** Draw one sub-frame with a camera that has its lens applied. */
  const draw = (camera) => {
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    sky.setCamera(camera, (frameId++) % 1024);
    shared.uRes.value.set(cine.size.w, cine.size.h);
    const above = camera.position.y > CLOUD_SURFACE;
    // inside the bell the far wall is the view, so it lights up
    const hy = shared.uHeart.value.y;
    const dist = Math.hypot(camera.position.x, camera.position.y - (hy - 2), camera.position.z);
    const kIn = Math.min(1, Math.max(0, (15.5 - dist) / 5));
    shared.uInside.value = kIn * kIn * (3 - 2 * kIn);
    if (softClouds) {
      renderSoftClouds(camera);
      cine.beginScene();
      renderer.render(sky.scene, camera);
      if (above) layCloudsIn();
      renderer.render(scene, camera);
      if (!above) layCloudsIn();
      return;
    }
    cine.beginScene();
    renderer.render(sky.scene, camera);
    if (above) renderer.render(sky.cloudScene, camera);
    renderer.render(scene, camera);
    if (!above) renderer.render(sky.cloudScene, camera);
  };

  return {scene, sky, creature, heart, shared, pose, draw, setBeats, envBeat, soft};
}
