// The cinema pipeline: no panels, no labels, no text. One render(t) that a film captures frame by frame and a page runs
// live.
//
// A film frame is the average of N sub-frames. Each sub-frame moves three things at once, the way an accumulation
// buffer does: the time inside the shutter (real motion blur), the camera position on the lens disc with the focus
// plane held still (real depth of field, also through transparent layers), and a sub-pixel offset (anti-aliasing).
// Dithered ray marching converges too, since every sub-frame gets a new dither. Post runs once, on the averaged HDR image.
//
//   const cine = new Cinema({canvas, samples: 16, fps: 24});
//   cine.frame(t, (subT, lens) => { pose(subT); cine.applyLens(camera, shot, lens); draw(); }, look);
import * as THREE from 'three';

const FS_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

const DOWN = `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee; uniform float uFirst;
vec3 S(vec2 o){ vec3 c=texture2D(tSrc, vUv+o*uTexel).rgb; if(isnan(c.r)||isnan(c.g)||isnan(c.b)||isinf(c.r)||isinf(c.g)||isinf(c.b)) return vec3(0.); return max(min(c,vec3(80.)),vec3(0.)); }
void main(){
  vec3 a=S(vec2(-2.,2.)),b=S(vec2(0.,2.)),c=S(vec2(2.,2.)),d=S(vec2(-2.,0.)),e=S(vec2(0.)),f=S(vec2(2.,0.)),g=S(vec2(-2.,-2.)),h=S(vec2(0.,-2.)),i=S(vec2(2.,-2.)),j=S(vec2(-1.,1.)),k=S(vec2(1.,1.)),l=S(vec2(-1.,-1.)),m=S(vec2(1.,-1.));
  vec3 o=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;
  if(uFirst>.5){
    float br=max(o.r,max(o.g,o.b));
    float soft=clamp(br-uThreshold+uKnee,0.,2.*uKnee); soft=soft*soft/(4.*uKnee+1e-4);
    o*=max(soft,br-uThreshold)/max(br,1e-4);
  }
  gl_FragColor=vec4(o,1.);
}`;

const UP = `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
void main(){
  vec2 r=uTexel*uRadius; vec3 s=vec3(0.);
  s+=texture2D(tSrc,vUv+vec2(-r.x,r.y)).rgb+texture2D(tSrc,vUv+vec2(r.x,r.y)).rgb+texture2D(tSrc,vUv+vec2(-r.x,-r.y)).rgb+texture2D(tSrc,vUv+vec2(r.x,-r.y)).rgb;
  s+=2.*(texture2D(tSrc,vUv+vec2(0.,r.y)).rgb+texture2D(tSrc,vUv+vec2(0.,-r.y)).rgb+texture2D(tSrc,vUv+vec2(-r.x,0.)).rgb+texture2D(tSrc,vUv+vec2(r.x,0.)).rgb);
  s+=4.*texture2D(tSrc,vUv).rgb;
  gl_FragColor=vec4(s/16.,1.);
}`;

const STREAK = `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uStep; uniform float uThreshold; uniform float uFirst;
void main(){
  vec3 s=vec3(0.); float w=0.;
  for(int i=-6;i<=6;i++){ float f=float(i); float g=exp(-f*f/18.); vec3 c=texture2D(tSrc,vUv+uStep*f).rgb; if(isnan(c.r)||isnan(c.g)||isnan(c.b)||isinf(c.r)||isinf(c.g)||isinf(c.b)) c=vec3(0.); s+=min(c,vec3(80.))*g; w+=g; }
  s/=w;
  if(uFirst>.5){ float b=max(s.r,max(s.g,s.b)); s*=smoothstep(uThreshold,uThreshold*2.,b); }
  gl_FragColor=vec4(s,1.);
}`;

const RAYS = `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uCenter; uniform float uThreshold; uniform float uDecay; uniform float uLen; uniform float uSeed;
float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uSeed)*43758.5453); }
void main(){
  const int N=48;
  vec2 d=(uCenter-vUv)*uLen/float(N);
  vec2 p=vUv+d*h(gl_FragCoord.xy);
  vec3 s=vec3(0.); float w=1.;
  for(int i=0;i<N;i++){
    vec3 c=texture2D(tSrc,p).rgb;
    if(isnan(c.r)||isnan(c.g)||isnan(c.b)||isinf(c.r)||isinf(c.g)||isinf(c.b)) c=vec3(0.);
    float b=max(c.r,max(c.g,c.b));
    s+=c*smoothstep(uThreshold,uThreshold*2.5,b)*w;
    w*=uDecay; p+=d;
  }
  gl_FragColor=vec4(s/float(N),1.);
}`;

const ACCUM = `
varying vec2 vUv; uniform sampler2D tSrc; uniform float uAlpha; uniform float uClamp;
void main(){
  vec3 c=texture2D(tSrc,vUv).rgb;
  if(!(c.r==c.r)||!(c.g==c.g)||!(c.b==c.b)) c=vec3(0.);
  c=max(min(c,vec3(uClamp)),vec3(0.));
  gl_FragColor=vec4(c,uAlpha);
}`;

const FINAL = `
varying vec2 vUv;
uniform sampler2D tHDR, tBloom, tStreak, tRays;
uniform float uExposure,uBloom,uStreak,uRays,uVig,uCA,uGrain,uSeed,uFade,uSat,uContrast;
uniform vec3 uStreakTint,uRaysTint,uLift,uGamma,uGain;
const mat3 ACESIn=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
const mat3 ACESOut=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
vec3 RRT(vec3 v){ vec3 a=v*(v+.0245786)-.000090537; vec3 b=v*(.983729*v+.4329510)+.238081; return a/b; }
vec3 aces(vec3 c){ return clamp(ACESOut*RRT(ACESIn*c),0.,1.); }
vec3 srgb(vec3 c){ return mix(c*12.92,1.055*pow(max(c,vec3(1e-4)),vec3(1./2.4))-.055,step(.0031308,c)); }
float rnd(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))+uSeed*17.13)*43758.5453); }
void main(){
  vec2 c=vUv-.5; float r2=dot(c,c);
  vec2 off=c*uCA*(.3+r2*2.);
  vec3 hdr=vec3(texture2D(tHDR,vUv+off).r,texture2D(tHDR,vUv).g,texture2D(tHDR,vUv-off).b);
  if(isnan(hdr.r)||isnan(hdr.g)||isnan(hdr.b)||isinf(hdr.r)||isinf(hdr.g)||isinf(hdr.b)) hdr=vec3(0.);
  hdr=max(min(hdr,vec3(200.)),vec3(0.));
  hdr+=texture2D(tBloom,vUv).rgb*uBloom;
  hdr+=texture2D(tStreak,vUv).rgb*uStreak*uStreakTint;
  hdr+=texture2D(tRays,vUv).rgb*uRays*uRaysTint;
  hdr*=uExposure;
  hdr*=mix(1.,1.-smoothstep(.18,.95,sqrt(r2)*1.15),uVig);
  vec3 col=aces(hdr);
  float l=dot(col,vec3(.2126,.7152,.0722));
  col=mix(vec3(l),col,uSat);
  col=clamp(col+uLift*(1.-col),0.,1.);
  col=pow(max(col,vec3(0.)),1./uGamma)*uGain;
  col=mix(col,col*col*(3.-2.*col),uContrast);
  col=srgb(clamp(col,0.,1.));
  float lg=dot(col,vec3(.3333));
  float g=rnd(gl_FragCoord.xy)-.5+rnd(gl_FragCoord.yx+3.1)-.5;
  col+=g*uGrain*(1.-lg*.65);
  col*=uFade;
  gl_FragColor=vec4(col,1.);
}`;

export const LOOK = {
  exposure: 1,
  bloom: 0.07,
  bloomThreshold: 0.9,
  bloomRadius: 1.0,
  streak: 0.06,
  streakThreshold: 3,
  streakTint: [0.55, 0.65, 1.0],
  rays: 0,
  raysCenter: [0.5, 0.5],
  raysThreshold: 1.2,
  raysLen: 0.85,
  raysDecay: 0.965,
  raysTint: [1.0, 0.82, 0.55],
  vignette: 0.55,
  ca: 0.0016,
  grain: 0.022,
  saturation: 1.06,
  contrast: 0.18,
  lift: [0.004, 0.002, 0.012],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  fade: 1,
};

const halton = (i, b) => {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
};

export class Cinema {
  constructor({canvas, samples = 1, fps = 24, shutter = 0.5, msaa = 0, bloomLevels = 6, clamp = 60}) {
    this.canvas = canvas;
    this.samples = samples;
    this.fps = fps;
    this.shutter = shutter;
    this.msaa = msaa;
    this.levels = bloomLevels;
    this.clamp = clamp;
    const r = new THREE.WebGLRenderer({canvas, antialias: false, alpha: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.autoClear = false;
    r.setClearColor(0x000000, 1);
    this.renderer = r;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.quad);
    this.fsCam = new THREE.Camera();
    const pass = (fragmentShader, uniforms, extra = {}) => new THREE.ShaderMaterial({vertexShader: FS_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra});
    this.mDown = pass(DOWN, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}, uThreshold: {value: 1}, uKnee: {value: 0.5}, uFirst: {value: 0}});
    this.mUp = pass(UP, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}, uRadius: {value: 1}}, {blending: THREE.AdditiveBlending, transparent: true});
    this.mStreak = pass(STREAK, {tSrc: {value: null}, uStep: {value: new THREE.Vector2()}, uThreshold: {value: 3}, uFirst: {value: 0}});
    this.mRays = pass(RAYS, {tSrc: {value: null}, uCenter: {value: new THREE.Vector2(0.5, 0.5)}, uThreshold: {value: 1}, uDecay: {value: 0.96}, uLen: {value: 0.8}, uSeed: {value: 0}});
    this.mAccum = pass(ACCUM, {tSrc: {value: null}, uAlpha: {value: 1}, uClamp: {value: clamp}}, {
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
    });
    this.mFinal = pass(FINAL, {
      tHDR: {value: null}, tBloom: {value: null}, tStreak: {value: null}, tRays: {value: null},
      uExposure: {value: 1}, uBloom: {value: 0}, uStreak: {value: 0}, uRays: {value: 0}, uVig: {value: 0}, uCA: {value: 0}, uGrain: {value: 0}, uSeed: {value: 0}, uFade: {value: 1}, uSat: {value: 1}, uContrast: {value: 0},
      uStreakTint: {value: new THREE.Vector3(1, 1, 1)}, uRaysTint: {value: new THREE.Vector3(1, 1, 1)},
      uLift: {value: new THREE.Vector3()}, uGamma: {value: new THREE.Vector3(1, 1, 1)}, uGain: {value: new THREE.Vector3(1, 1, 1)},
    });
    this.size = {w: 0, h: 0};
    this.pr = 1;
    this.frameIndex = 0;
  }

  setSize(w, h, pr = 1) {
    this.pr = pr;
    const W = Math.max(2, Math.round(w * pr));
    const H = Math.max(2, Math.round(h * pr));
    if (W === this.size.w && H === this.size.h) return;
    this.size = {w: W, h: H};
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    const rt = (a, b, opts = {}) => new THREE.WebGLRenderTarget(a, b, {type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...opts});
    for (const t of [this.rtScene, this.rtAccum, this.rtStreakA, this.rtStreakB, this.rtRays, ...(this.mips || [])]) t?.dispose();
    this.rtScene = rt(W, H, {depthBuffer: true, samples: this.msaa});
    this.rtAccum = rt(W, H);
    this.mips = [];
    let a = W;
    let b = H;
    for (let i = 0; i < this.levels; i++) {
      a = Math.max(2, a >> 1);
      b = Math.max(2, b >> 1);
      this.mips.push(rt(a, b));
    }
    this.rtStreakA = rt(W >> 2, H >> 2);
    this.rtStreakB = rt(W >> 2, H >> 2);
    this.rtRays = rt(W >> 1, H >> 1);
  }

  blit(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  /** Start one sub-frame: the caller draws into this target. */
  beginScene() {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear(true, true, true);
  }

  /**
   * Set a camera's projection for one sub-frame. lensRadius in world units, focus the distance of the sharp plane.
   * The camera must already be posed: its position moves on the lens disc and the frustum shears so the focus plane holds.
   */
  applyLens(camera, sample, lensRadius = 0, focus = 10) {
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const lx = sample.lens[0] * lensRadius;
    const ly = sample.lens[1] * lensRadius;
    if (lx || ly) {
      const e = camera.matrixWorld.elements;
      camera.position.x += e[0] * lx + e[4] * ly;
      camera.position.y += e[1] * lx + e[5] * ly;
      camera.position.z += e[2] * lx + e[6] * ly;
      camera.updateMatrixWorld();
    }
    const p = camera.projectionMatrix.elements;
    p[8] += (-lx * p[0]) / focus + (2 * sample.jit[0]) / this.size.w;
    p[9] += (-ly * p[5]) / focus + (2 * sample.jit[1]) / this.size.h;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /** One finished frame on the canvas. draw(subT, sample) renders one sub-frame through beginScene(). */
  frame(t, draw, lookIn = {}) {
    const N = this.samples;
    const r = this.renderer;
    if (N === 1) {
      draw(t, {lens: [0, 0], jit: [0, 0], i: 0, N: 1});
      this.post(this.rtScene.texture, {...LOOK, ...lookIn}, t);
      return;
    }
    for (let i = 0; i < N; i++) {
      const k = (i + 0.5) / N;
      const tu = (halton(i + 1, 5) + 0.37) % 1;
      const rad = Math.sqrt(k);
      const ang = i * 2.39996323;
      const sample = {
        lens: [rad * Math.cos(ang), rad * Math.sin(ang)],
        jit: [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5],
        i,
        N,
      };
      draw(t + ((tu - 0.5) * this.shutter) / this.fps, sample);
      this.mAccum.uniforms.tSrc.value = this.rtScene.texture;
      this.mAccum.uniforms.uAlpha.value = 1 / (i + 1);
      this.blit(this.mAccum, this.rtAccum);
      r.getContext().flush();
    }
    this.post(this.rtAccum.texture, {...LOOK, ...lookIn}, t);
  }

  post(tex, look, t) {
    const {mDown, mUp, mStreak, mRays, mFinal, mips} = this;
    const texel = (rt) => new THREE.Vector2(1 / rt.width, 1 / rt.height);
    // bloom: a 13-tap down chain from a soft threshold, tent filter back up
    mDown.uniforms.uThreshold.value = look.bloomThreshold;
    mDown.uniforms.uKnee.value = look.bloomThreshold * 0.5;
    let src = tex;
    let sw = this.size.w;
    let sh = this.size.h;
    for (let i = 0; i < mips.length; i++) {
      mDown.uniforms.tSrc.value = src;
      mDown.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      mDown.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this.blit(mDown, mips[i]);
      src = mips[i].texture;
      sw = mips[i].width;
      sh = mips[i].height;
    }
    for (let i = mips.length - 1; i > 0; i--) {
      mUp.uniforms.tSrc.value = mips[i].texture;
      mUp.uniforms.uTexel.value.copy(texel(mips[i]));
      mUp.uniforms.uRadius.value = look.bloomRadius;
      this.blit(mUp, mips[i - 1]);
    }
    // the anamorphic streak: a wide horizontal blur of the hottest pixels
    if (look.streak > 0) {
      mStreak.uniforms.uThreshold.value = look.streakThreshold;
      mStreak.uniforms.tSrc.value = tex;
      mStreak.uniforms.uStep.value.set(2 / this.size.w, 0);
      mStreak.uniforms.uFirst.value = 1;
      this.blit(mStreak, this.rtStreakA);
      mStreak.uniforms.uFirst.value = 0;
      let a = this.rtStreakA;
      let b = this.rtStreakB;
      for (const s of [10, 28, 64]) {
        mStreak.uniforms.tSrc.value = a.texture;
        mStreak.uniforms.uStep.value.set(s / this.size.w, 0);
        this.blit(mStreak, b);
        [a, b] = [b, a];
      }
      this.streakTex = a.texture;
    }
    // light shafts toward a point on screen
    if (look.rays > 0) {
      mRays.uniforms.tSrc.value = tex;
      mRays.uniforms.uCenter.value.set(look.raysCenter[0], look.raysCenter[1]);
      mRays.uniforms.uThreshold.value = look.raysThreshold;
      mRays.uniforms.uDecay.value = look.raysDecay;
      mRays.uniforms.uLen.value = look.raysLen;
      mRays.uniforms.uSeed.value = t % 10;
      this.blit(mRays, this.rtRays);
    }
    const u = mFinal.uniforms;
    u.tHDR.value = tex;
    u.tBloom.value = mips[0].texture;
    u.tStreak.value = this.streakTex ?? mips[0].texture;
    u.tRays.value = this.rtRays.texture;
    u.uExposure.value = look.exposure;
    u.uBloom.value = look.bloom;
    u.uStreak.value = look.streak;
    u.uRays.value = look.rays;
    u.uVig.value = look.vignette;
    u.uCA.value = look.ca;
    u.uGrain.value = look.grain;
    u.uSeed.value = (t * 24) % 97;
    u.uFade.value = look.fade;
    u.uSat.value = look.saturation;
    u.uContrast.value = look.contrast;
    u.uStreakTint.value.fromArray(look.streakTint);
    u.uRaysTint.value.fromArray(look.raysTint);
    u.uLift.value.fromArray(look.lift);
    u.uGamma.value.fromArray(look.gamma);
    u.uGain.value.fromArray(look.gain);
    this.blit(mFinal, null);
  }
}

/** Boot a film page: exposes the window.SIM contract that teardown's capture.mjs steps frame by frame. */
export async function runFilm({duration, fps = 24}, setup) {
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  document.body.appendChild(canvas);
  const capture = !!window.__CAPTURE || new URLSearchParams(location.search).has('capture');
  const film = await setup({canvas, capture});
  const resize = () => film.resize(innerWidth, innerHeight, capture ? devicePixelRatio : Math.min(devicePixelRatio, 1));
  addEventListener('resize', resize);
  resize();
  window.SIM = {duration, fps, ready: true, render: (t) => film.render(t)};
  if (capture) {
    film.render(0);
    return;
  }
  // Opened by hand: plays the film in real time, at whatever rate this machine manages.
  const start = performance.now();
  const loop = (now) => {
    film.render(((now - start) / 1000) % duration);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
