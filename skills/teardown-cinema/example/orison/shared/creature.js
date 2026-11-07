// The creature, rebuilt from the master image: a stained-glass dome on sixteen pearl ribs, rows of light organs, a crown
// city of spires, twelve frilled arms, thousands of filaments, and a flock. Every part reads the same beat and the same
// dome function, so nothing can drift from anything else. Nothing is keyframed.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {BEAT, BELL, NOISE, SKYBASE} from './glsl.js';

const rngOf = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};
const TAU = Math.PI * 2;

/** Paste the shared chunks and the dome deformation into a stock PBR material. */
function injectStd(mat, shared, {head, pos, normalVar = 'objectNormal', frag = ''}) {
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${BEAT}\n${BELL}\n${head}\nvarying vec3 vWP;`)
      .replace('#include <beginnormal_vertex>', `vec3 ${normalVar}; vec3 poseP=${pos};`)
      .replace('#include <begin_vertex>', 'vec3 transformed=poseP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${SKYBASE}\nvarying vec3 vWP;\n${frag.split('//MAIN')[0]}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${frag.split('//MAIN')[1] ?? ''}`)
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb=applyHaze(gl_FragColor.rgb,vWP);');
  };
  return mat;
}

function membrane(shared, tex, q) {
  const NU = q.domeU;
  const NV = q.domeV;
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3);
  const ap = new Float32Array((NU + 1) * (NV + 1) * 2);
  const idx = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const k = i + j * (NU + 1);
    ap[k * 2] = (i / NU) * TAU;
    ap[k * 2 + 1] = 0.004 + (j / NV) * 0.996;
    if (i < NU && j < NV) idx.push(k, k + 1, k + NU + 1, k + 1, k + NU + 2, k + NU + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aP', new THREE.BufferAttribute(ap, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const make = (side, back) => new THREE.ShaderMaterial({
    side,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {...shared, tGore: {value: tex.gore}, uBack: {value: back}},
    vertexShader: /* glsl */ `
      ${BEAT}${BELL}
      attribute vec2 aP; varying vec3 vWP,vN; varying vec2 vTH;
      void main(){
        vec3 N; vec3 P=bellPN(aP.x,aP.y,uTime,N);
        vec4 w=modelMatrix*vec4(P,1.);
        vWP=w.xyz; vN=N; vTH=aP;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */ `
      ${BEAT}${SKYBASE}
      uniform sampler2D tGore; uniform float uBack; uniform float uInside;
      uniform vec3 uHeart,uHeartCol; uniform float uHeartI;
      uniform vec3 uHoverP; uniform float uHoverA; uniform vec4 uRipple;
      varying vec3 vWP,vN; varying vec2 vTH;
      vec3 film(float x){ return .5+.5*cos(6.2831*(x+vec3(0.,.33,.67))); }
      void main(){
        float gx=vTH.x*GORES/(2.*M_PI);
        float u=fract(gx); if(mod(floor(gx),2.)>.5) u=1.-u;
        // Mercator up the dome: a gore narrows toward the crown, so the cells shrink with it and stay round.
        // The plate is mirrored upward above its lace band.
        float my=-log(tan(max(vTH.y,.015)*M_PI*.25))/.5236;
        float myk=my*.62;
        float ty=my<.2?my:.2+.42*abs(mod((myk-.124)/.42+1.,2.)-1.);
        vec4 tx=textureGrad(tGore,vec2(u,ty),dFdx(vec2(gx,my)),dFdy(vec2(gx,my)));
        vec3 base=pow(tx.rgb,vec3(1.55))*1.1;
        float lum=dot(base,vec3(.3,.5,.2));
        float solid=smoothstep(.035,.16,lum);
        if(solid<.01) discard;
        vec3 V=normalize(cameraPosition-vWP);
        vec3 N=normalize(vN);
        float nv=dot(N,V);
        vec3 Nf=nv<0.?-N:N;
        float ndv=abs(nv);
        float F=pow(max(1.-ndv,0.),4.);
        // the heart's light coming through the glass: strongest straight out from the heart
        vec3 H=uHeart-vWP; float d2=dot(H,H);
        vec3 Hn=H/sqrt(d2);
        float inline_=max(dot(Hn,-V),0.);
        float through=.3+.7*pow(inline_,1.4);
        vec3 heart=vec3(1.,.84,.64)*uHeartI*through*(34./(9.+d2));
        // the low sun lights the crown from behind and rakes the near side
        float sunBack=pow(max(dot(-V,uSunDir),0.),4.);
        float sunRake=pow(max(dot(N,uSunDir),0.),2.);
        vec3 sunc=vec3(2.6,1.05,.42);
        vec3 light=vec3(.3,.44,.66)+heart*1.5+sunc*(sunBack*.5+sunRake*.3);
        vec3 col=base*light;
        // the opal shift with viewing angle
        col*=mix(vec3(1.),film(ndv*1.2+lum*1.5)*1.7,.14);
        col=mix(vec3(dot(col,vec3(.33))),col,1.3);
        col*=mix(vec3(.8,1.02,1.2),vec3(1.),through);
        // sky in the glass
        vec3 R=reflect(-V,Nf);
        col+=(skyBase(R)*.9+sunc*3.*pow(max(dot(R,uSunDir),0.),260.))*(.04+F*.9);
        // thin hot line of sun along the crown's edge
        col+=sunc*2.2*pow(max(1.-ndv,0.),5.)*max(dot(N,uSunDir)+.2,0.);
        float a=solid*mix(.56,.95,F)*(1.-.8*pow(inline_,7.));
        {
          vec3 dv=vWP-uHoverP; float hv=uHoverA*exp(-dot(dv,dv)*.075);
          vec3 dr=vWP-uRipple.xyz; float age=uTime-uRipple.w; float front=length(dr)-age*9.;
          float rip=exp(-front*front*.22)*exp(-age*.75)*step(0.,age);
          col+=base*vec3(1.,.9,.74)*(hv*1.5+rip*3.2);
          a=mix(a,solid*.95,clamp(hv*.4+rip*.7,0.,1.));
        }
        if(uBack>.5){ col*=mix(.3,1.05,uInside); a*=mix(.42,.8,uInside); }
        float hz=hazeOf(vWP);
        vec3 d=normalize(vWP-cameraPosition);
        gl_FragColor=vec4((col*solid)*hz+skyBase(d)*(1.-hz)*a,a);
      }`,
  });
  const backM = new THREE.Mesh(g, make(THREE.BackSide, 1));
  const frontM = new THREE.Mesh(g, make(THREE.FrontSide, 0));
  backM.frustumCulled = frontM.frustumCulled = false;
  backM.renderOrder = 10;
  frontM.renderOrder = 40;
  return {backM, frontM};
}

/** Instanced bands that follow the dome: ribs, mullions and hoops are one geometry with different parameters. */
function ribs(shared, env, q) {
  const SU = q.ribU;
  const SA = 10;
  const pos = new Float32Array((SU + 1) * (SA + 1) * 3);
  const ua = new Float32Array((SU + 1) * (SA + 1) * 2);
  const idx = [];
  for (let j = 0; j <= SU; j++) for (let i = 0; i <= SA; i++) {
    const k = i + j * (SA + 1);
    ua[k * 2] = j / SU;
    ua[k * 2 + 1] = (i / SA) * TAU;
    if (i < SA && j < SU) idx.push(k, k + 1, k + SA + 1, k + 1, k + SA + 2, k + SA + 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aUA', new THREE.BufferAttribute(ua, 2));
  g.setIndex(idx);
  const fam = [];
  const size = [];
  const add = (th, tw, v0, v1, w, h, kind) => {
    fam.push(th, tw, v0, v1);
    size.push(w, h, kind);
  };
  for (let i = 0; i < 16; i++) add((i / 16) * TAU, 0, 0.03, 1, 0.34, 0.13, 0); // the sixteen main ribs
  for (let i = 0; i < 16; i++) add(((i + 0.5) / 16) * TAU, 0, 0.06, 0.92, 0.055, 0.04, 1); // thin mullions, one mid-gore
  for (const v of q.hoops) add(0, TAU, v, v, 0.07, 0.05, 1);
  g.setAttribute('iFam', new THREE.InstancedBufferAttribute(new Float32Array(fam), 4));
  g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(size), 3));
  g.instanceCount = fam.length / 4;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#efe2cf',
    roughness: 0.3,
    metalness: 0.12,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [180, 520],
    clearcoat: 0.6,
    clearcoatRoughness: 0.28,
    envMap: env,
    envMapIntensity: 1.6,
  });
  injectStd(mat, shared, {
    head: /* glsl */ `
      attribute vec2 aUA; attribute vec4 iFam; attribute vec3 iSize; varying float vKind; varying float vRibV; varying float vSx; varying float vSy;
      vec3 ribPose(out vec3 nrm){
        float u=aUA.x,ph=aUA.y;
        float th=iFam.x+iFam.y*u;
        float v=mix(iFam.z,iFam.w,u);
        float c=pulseAt(uTime-v*PULSE_LAG);
        vec3 P=bellAt(th,v,c,uTime);
        float e=.003;
        vec3 A=bellAt(th+e,v,c,uTime)-P;
        vec3 B=(v>.5?P-bellAt(th,v-e,c,uTime):bellAt(th,v+e,c,uTime)-P);
        vec3 N=normalize(cross(A,B));
        vec3 T=normalize(iFam.y*A/e+(iFam.w-iFam.z)*B/e);
        vec3 S=normalize(cross(N,T));
        float taper=mix(.45,1.,smoothstep(0.,.3,v))*(iSize.z<.5?(1.-.55*smoothstep(.93,1.,v)):1.);
        float w=iSize.x*taper,h=iSize.y*taper;
        float cx=cos(ph),cy=sin(ph);
        float sx=sign(cx)*pow(abs(cx),.62),sy=sign(cy)*pow(abs(cy),.62);
        nrm=normalize(S*sx/w+N*sy/h);
        vKind=iSize.z; vRibV=v; vSx=sx; vSy=sy;
        return P+N*(h*.7)+S*sx*w+N*sy*h;
      }`,
    pos: 'ribPose(objectNormal)',
    frag: /* glsl */ `
      varying float vKind; varying float vRibV; varying float vSx; varying float vSy;
      //MAIN
      float edge=smoothstep(.55,.86,abs(vSx));
      float groove=(1.-smoothstep(.1,.34,abs(vSx)))*step(.5,1.-vKind);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.95,.7,.34),max(vKind*.85,edge*.9));
      diffuseColor.rgb*=1.-groove*.2;
      vec3 pearl=.5+.5*cos(6.2831*(vSx*.55+vRibV*2.6+vec3(0.,.33,.67)));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*(.72+.56*pearl),(1.-edge)*(1.-vKind));
      totalEmissiveRadiance+=mix(vec3(.98,.88,.8)*(.82+.36*pearl),vec3(1.1,.68,.28),max(vKind,edge))*(.3+.2*vRibV)*(1.-groove*.25);
    `,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/** Rows of light organs along the ribs, plus the lights on the hem. One draw of soft discs. */
function beads(shared, q) {
  const r = rngOf(11);
  const a = [];
  for (let i = 0; i < 16; i++) {
    const th = (i / 16) * TAU;
    const n = q.beadsPerRib;
    for (let k = 0; k < n; k++) {
      const v = 0.14 + (k / n) * 0.85;
      a.push(th, v, 0.11 + 0.06 * v, r());
    }
  }
  for (let i = 0; i < q.hemBeads; i++) {
    const th = (i / q.hemBeads) * TAU;
    a.push(th, 0.993, 0.042, r());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((a.length / 4) * 3), 3));
  g.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(a), 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {...shared},
    vertexShader: /* glsl */ `
      ${BEAT}${BELL}
      attribute vec4 aB; uniform vec2 uRes; varying float vI; varying float vHz;
      void main(){
        vec3 N; vec3 P=bellPN(aB.x,aB.y,uTime,N);
        vec4 w=modelMatrix*vec4(P+N*.2,1.);
        vec4 mv=viewMatrix*w;
        gl_Position=projectionMatrix*mv;
        float px=aB.z*projectionMatrix[1][1]*uRes.y*.5/-mv.z;
        gl_PointSize=clamp(px*2.6,2.,240.);
        float wave=.5+.5*sin(aB.y*26.-uTime*2.4+aB.x*2.+pulseAt(uTime-aB.y*PULSE_LAG)*6.);
        vI=(.6+1.1*wave*wave+pulseAt(uTime-aB.y*PULSE_LAG)*2.2)*min(1.,px/.9);
        vHz=exp(-length(w.xyz-cameraPosition)*.0045);
      }`,
    fragmentShader: /* glsl */ `
      varying float vI; varying float vHz;
      void main(){
        vec2 q=gl_PointCoord*2.-1.; float d=dot(q,q); if(d>1.) discard;
        float core=exp(-d*16.); float halo=exp(-d*3.5)*(1.-d);
        vec3 c=vec3(1.,.82,.54)*(core*11.+halo*1.)*vI*vHz;
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.renderOrder = 45;
  return p;
}

/** The crown city: spires, onion towers and barnacles, standing along the dome's normal. */
function spires(shared, env, q) {
  const lathe = (pts) => {
    const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const prof = curve.getPoints(q.spireProfile).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
    return new THREE.LatheGeometry(prof, q.spireSides).toNonIndexed();
  };
  const proto = lathe([[0.34, 0], [0.27, 0.12], [0.235, 0.55], [0.2, 1.1], [0.185, 1.42], [0.25, 1.5], [0.2, 1.58], [0.3, 1.8], [0.37, 2.02], [0.3, 2.24], [0.13, 2.46], [0.05, 2.7], [0.02, 3.2], [0.006, 3.8]]);
  const proto2 = lathe([[0.32, 0], [0.28, 0.14], [0.26, 0.5], [0.33, 0.58], [0.27, 0.66], [0.25, 1.1], [0.31, 1.18], [0.25, 1.26], [0.2, 1.6], [0.09, 1.92], [0.025, 2.3], [0.006, 2.7]]);
  const proto3 = lathe([[0.5, 0], [0.5, 0.1], [0.4, 0.3], [0.26, 0.44], [0.2, 0.47], [0.15, 0.4], [0.08, 0.33], [0.005, 0.3]]);
  const geos = [proto, proto2, proto3];
  const all = [];
  const r = rngOf(23);
  // the crowning spire at the very top
  const place = (arr, th, v, s, seed) => arr.push(th, v, s, seed);
  const lists = [[], [], []];
  place(lists[0], 0, 0.004, 1.5, r());
  for (let i = 0; i < 16; i++) {
    place(lists[0], (i / 16) * TAU, 0.075, 1.15 + 0.4 * r(), r());
    place(lists[1], ((i + 0.5) / 16) * TAU, 0.135, 0.95 + 0.3 * r(), r());
    place(lists[0], (i / 16) * TAU, 0.19, 0.8 + 0.3 * r(), r());
    place(lists[1], ((i + 0.5) / 16) * TAU, 0.27, 0.7 + 0.3 * r(), r());
    place(lists[0], (i / 16) * TAU, 0.33, 0.55 + 0.25 * r(), r());
  }
  for (let i = 0; i < q.spires; i++) {
    const near = Math.floor(r() * 16);
    const th = ((near + (r() - 0.5) * 0.5) / 16) * TAU;
    const v = 0.06 + Math.pow(r(), 1.8) * 0.42;
    const s = (0.65 - v) * (0.3 + 0.55 * r());
    const pick = r();
    place(lists[pick < 0.3 ? 0 : pick < 0.65 ? 1 : 2], th, v, s, r());
  }
  const group = new THREE.Group();
  geos.forEach((geo, gi) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', geo.getAttribute('position'));
    g.setAttribute('normal', geo.getAttribute('normal'));
    g.setAttribute('iS', new THREE.InstancedBufferAttribute(new Float32Array(lists[gi]), 4));
    g.instanceCount = lists[gi].length / 4;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.MeshStandardMaterial({color: '#ecc27c', metalness: 0.5, roughness: 0.34, envMap: env, envMapIntensity: 2.1, emissive: '#b67c3c', emissiveIntensity: 0.3});
    injectStd(mat, shared, {
      head: /* glsl */ `
        attribute vec4 iS; varying vec3 vLoc; varying float vSeed;
        vec3 spirePose(out vec3 nrm){
          vec3 N; vec3 P=bellPN(iS.x,iS.y,uTime,N);
          if(iS.y<.01) N=vec3(0.,1.,0.);
          // lean a little toward straight up, as a city built under gravity would
          vec3 U=normalize(N+vec3(0.,.55,0.));
          vec3 X=normalize(cross(U,vec3(.31,.11,.94)));
          vec3 Z=cross(X,U);
          vLoc=position; vSeed=iS.w;
          nrm=normalize(X*normal.x+U*normal.y+Z*normal.z);
          return P+(X*position.x+U*position.y+Z*position.z)*iS.z*(.36+.2*(1.-smoothstep(.0,.3,iS.y)))-N*.03;
        }`,
      pos: 'spirePose(objectNormal)',
      frag: /* glsl */ `
        varying vec3 vLoc; varying float vSeed;
        float hw(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
        //MAIN
        {
          // bone towers and gold towers, in the same city
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.86,.74),step(.62,vSeed)*.9);
          // fluted metal: vertical ribs that catch the light
          float flute=sin(atan(vLoc.z,vLoc.x)*18.);
          normal=normalize(normal+.3*flute*normalize(cross(normal,vec3(.03,1.,.02))));
          float ang=atan(vLoc.z,vLoc.x);
          vec2 g=vec2(ang*5.,vLoc.y*17.);
          vec2 id=floor(g); vec2 f=fract(g)-.5;
          float lit=step(.72,hw(id+vSeed*91.));
          float win=(1.-smoothstep(.1,.22,abs(f.x)))*(1.-smoothstep(.16,.3,abs(f.y)))*lit;
          totalEmissiveRadiance+=vec3(1.,.62,.26)*win*(1.1+1.2*hw(id+vSeed*13.));
        }
      `,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    group.add(m);
    all.push(m);
  });
  return group;
}

/** A filigree band laid on the dome: gold plate cut out by its own black. */
function collar(shared, env, tex, v0, v1, repeats, q) {
  const NU = q.domeU;
  const pos = new Float32Array((NU + 1) * 2 * 3);
  const ap = new Float32Array((NU + 1) * 2 * 2);
  const uv = new Float32Array((NU + 1) * 2 * 2);
  const idx = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j < 2; j++) {
    const k = i * 2 + j;
    ap[k * 2] = (i / NU) * TAU;
    ap[k * 2 + 1] = j ? v1 : v0;
    uv[k * 2] = (i / NU) * repeats;
    uv[k * 2 + 1] = j ? 0 : 1;
    if (i < NU && j === 0) idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aP', new THREE.BufferAttribute(ap, 2));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.MeshStandardMaterial({
    map: tex.filigree,
    alphaMap: tex.filigree,
    alphaTest: 0.06,
    bumpMap: tex.filigree,
    bumpScale: 1.2,
    metalness: 0.9,
    roughness: 0.34,
    side: THREE.DoubleSide,
    envMap: env,
    envMapIntensity: 2.4,
    emissive: '#ffc070',
    emissiveMap: tex.filigree,
    emissiveIntensity: 2.1,
  });
  injectStd(mat, shared, {
    head: /* glsl */ `
      attribute vec2 aP;
      vec3 stripPose(out vec3 nrm){ vec3 N; vec3 P=bellPN(aP.x,aP.y,uTime,N); nrm=N; return P+N*.07; }`,
    pos: 'stripPose(objectNormal)',
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/** Twelve frilled arms: a grid swept along a curve in the vertex shader, with the silk plate on it. */
function arms(shared, tex, q) {
  const NU = q.armU;
  const NW = q.armW;
  const pos = new Float32Array((NU + 1) * (NW + 1) * 3);
  const ap = new Float32Array((NU + 1) * (NW + 1) * 2);
  const idx = [];
  for (let j = 0; j <= NU; j++) for (let i = 0; i <= NW; i++) {
    const k = i + j * (NW + 1);
    ap[k * 2] = j / NU;
    ap[k * 2 + 1] = i / NW;
    if (i < NW && j < NU) idx.push(k, k + 1, k + NW + 1, k + 1, k + NW + 2, k + NW + 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aUW', new THREE.BufferAttribute(ap, 2));
  g.setIndex(idx);
  const r = rngOf(5);
  const inst = [];
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * TAU + (r() - 0.5) * 0.25;
    const inner = i % 2;
    const root = inner ? 4.2 + r() * 1.2 : 8.2 + r() * 1.6;
    const L = inner ? 9.5 + r() * 2.5 : 9.5 + r() * 3;
    const out = (inner ? 4 + r() * 4 : 7 + r() * 6) * (1 - 0.5 * Math.max(0, Math.sin(th)));
    inst.push(th, root, L, out, r() * TAU, r());
  }
  // two attributes: (th,root,L) (out,phase,seed)
  const ia = new Float32Array(36);
  const ib = new Float32Array(36);
  for (let i = 0; i < 12; i++) {
    ia.set(inst.slice(i * 6, i * 6 + 3), i * 3);
    ib.set(inst.slice(i * 6 + 3, i * 6 + 6), i * 3);
  }
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(ia, 3));
  g.setAttribute('iB', new THREE.InstancedBufferAttribute(ib, 3));
  g.instanceCount = 12;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {...shared, tSilk: {value: tex.silk}},
    vertexShader: /* glsl */ `
      ${BEAT}${BELL}
      attribute vec2 aUW; attribute vec3 iA,iB;
      varying vec3 vWP; varying vec2 vUW; varying float vSeed; varying float vPh;
      vec3 spine(float u,float t){
        float lag=u*2.6;
        float c=pulseAt(t-lag-.2);
        float th=iA.x;
        float rr=iA.y*(1.-.16*pulseAt(t-.3));
        vec3 root=vec3(rr*cos(th),1.6-.1*rr,rr*sin(th));
        // an outward S, like the master image's arms reaching across the sky
        float o=iB.x*pow(u,1.25)*(.8+.2*sin(t*.11+iB.y));
        vec3 rad=vec3(cos(th),0.,sin(th)),tan_=vec3(-sin(th),0.,cos(th));
        float ph=iB.y+u*5.2-t*.16;
        vec3 p=root+rad*o+vec3(0.,-iA.z*u,0.);
        p+=(rad*cos(ph)+tan_*sin(ph))*(.4+3.6*u*u);
        // the squeeze travels down the arm and draws it inward
        p+=rad*(-3.4*c*u*(1.-.3*u))+vec3(0.,1.5*c*u,0.);
        return p;
      }
      void main(){
        float u=aUW.x,w=aUW.y;
        float t=uTime;
        vec3 P=spine(u,t);
        vec3 T=normalize(spine(u+.004,t)-P);
        vec3 A=normalize(cross(T,vec3(.21,.13,.97)));
        vec3 B=cross(T,A);
        float tw=iB.y+u*13.+.3*sin(t*.2+u*4.);
        vec3 X=A*cos(tw)+B*sin(tw);
        vec3 Y=-A*sin(tw)+B*cos(tw);
        float W=mix(.72,1.85,smoothstep(0.,.2,u))*mix(1.,.2,pow(u,1.5));
        float frill=w*w;
        float kf=62.+iB.z*14.;
        float ph=u*kf+iB.z*20.+t*.28;
        float folds=sin(ph);
        vPh=ph;
        vec3 p=P+X*W*((w-.15)*(1.+.1*w*cos(ph*2.)))+Y*(.5*W*frill*folds+.06*W*sin(u*30.+w*3.));
        vec4 wp=modelMatrix*vec4(p,1.);
        vWP=wp.xyz; vUW=aUW; vSeed=iB.z;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${BEAT}${SKYBASE}
      uniform sampler2D tSilk; uniform vec3 uHeart,uHeartCol; uniform float uHeartI;
      varying vec3 vWP; varying vec2 vUW; varying float vSeed; varying float vPh;
      vec3 film(float x){ return .5+.5*cos(6.2831*(x+vec3(0.,.33,.67))); }
      void main(){
        float u=vUW.x,w=vUW.y;
        vec2 uv=vec2(vPh/(2.*M_PI)/2.6,clamp(w*.94+.02,0.,1.));
        vec3 base=pow(texture(tSilk,uv).rgb,vec3(1.35));
        base=mix(base*vec3(.74,1.04,1.16),base*vec3(1.16,.98,.8),smoothstep(.04,.8,w));
        vec3 Nc=cross(dFdx(vWP),dFdy(vWP)); vec3 Nn=dot(Nc,Nc)>1e-14?normalize(Nc):vec3(0.,1.,0.);
        vec3 V=normalize(cameraPosition-vWP);
        float ndv=abs(dot(Nn,V));
        float F=pow(max(1.-ndv,0.),3.);
        vec3 H=uHeart-vWP; float d2=dot(H,H);
        vec3 heart=uHeartCol*uHeartI*(58./(40.+d2));
        float sunB=pow(max(dot(-V,uSunDir),0.),3.);
        float sunR=abs(dot(Nn,uSunDir));
        vec3 sunc=vec3(2.2,1.,.48);
        float foldL=.62+.5*abs(dot(Nn,normalize(vec3(.4,.5,.76))));
        vec3 light=(vec3(.56,.56,.72)+heart*1.2+sunc*(sunB*.7+sunR*.2))*foldL;
        vec3 col=base*light;
        col*=mix(vec3(1.),film(u*2.3+w*.6+vSeed)*1.7,.12);
        col+=F*skyBase(reflect(-V,Nn))*.5;
        // gold trim and beads of light on the frill's edge, and a run of light along the spine
        float trim=smoothstep(.93,.985,w);
        col+=vec3(1.,.7,.34)*trim*(.8+uHeartI*.4);
        float K=210.;
        float bead=1.-smoothstep(.12,.34,length(vec2(fract(u*K)-.5,(w-.97)*22.)));
        float run=.45+.55*sin(u*22.-uTime*2.6+vSeed*9.);
        col+=vec3(1.,.8,.5)*bead*(5.+6.*run);
        float sp=exp(-(w-.14)*(w-.14)*256.);
        col+=vec3(1.,.78,.5)*sp*(.5+.5*sin(u*60.-uTime*3.+vSeed*9.))*.9;
        float a=mix(.62,.94,F)*smoothstep(0.,.02,w);
        float tip=1.-smoothstep(.93,1.,u);
        a*=tip; col*=tip;
        float hz=hazeOf(vWP);
        vec3 d=normalize(vWP-cameraPosition);
        gl_FragColor=vec4(col*a*hz+skyBase(d)*(1.-hz)*a,a);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 20;
  return m;
}

/** The frilled hem under the scallops: a short ruffled curtain of the silk plate, following the rim exactly. */
function skirt(shared, tex, q) {
  const NU = q.domeU * 2;
  const NW = 7;
  const pos = new Float32Array((NU + 1) * (NW + 1) * 3);
  const a = new Float32Array((NU + 1) * (NW + 1) * 2);
  const idx = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NW; j++) {
    const k = j + i * (NW + 1);
    a[k * 2] = (i / NU) * TAU;
    a[k * 2 + 1] = j / NW;
    if (i < NU && j < NW) idx.push(k, k + NW + 1, k + 1, k + 1, k + NW + 1, k + NW + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(a, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {...shared, tSilk: {value: tex.silk}},
    vertexShader: /* glsl */ `
      ${BEAT}${BELL}
      attribute vec2 aS; varying vec3 vWP; varying vec2 vS;
      void main(){
        float th=aS.x,w=aS.y;
        vec3 N; vec3 P=bellPN(th,1.,uTime,N);
        float sn=abs(sin(GORES*.5*th));
        float drop=(.16+.24*sn)*w;
        float fr=sin(th*180.+uTime*.3+sin(th*9.)*2.);
        vec3 rad=normalize(vec3(P.x,0.,P.z));
        vec3 p=P+vec3(0.,-drop,0.)+rad*(w*.1+fr*.09*w*w);
        vec4 wp=modelMatrix*vec4(p,1.);
        vWP=wp.xyz; vS=aS;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${BEAT}${SKYBASE}
      uniform sampler2D tSilk; uniform vec3 uHeart; uniform float uHeartI;
      varying vec3 vWP; varying vec2 vS;
      void main(){
        float w=vS.y;
        vec3 base=pow(texture(tSilk,vec2(vS.x*GORES*1.5,clamp(1.-w*.9,0.,1.))).rgb,vec3(1.3));
        vec3 H=uHeart-vWP; float d2=dot(H,H);
        vec3 light=vec3(1.05,.82,.86)+vec3(1.,.78,.56)*uHeartI*(70./(30.+d2));
        vec3 col=base*light;
        col+=vec3(1.,.74,.42)*smoothstep(.86,.98,w)*(.8+uHeartI*.4);
        float a=mix(.84,.6,w)*(1.-smoothstep(.97,1.,w));
        float hz=hazeOf(vWP);
        vec3 d=normalize(vWP-cameraPosition);
        gl_FragColor=vec4(col*a*hz+skyBase(d)*(1.-hz)*a,a);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 25;
  return m;
}

/** Thousands of hair-fine filaments, each a screen-facing ribbon at least a pixel wide, carrying beads of light. */
function filaments(shared, q) {
  const S = q.filSeg;
  const pos = new Float32Array((S + 1) * 2 * 3);
  const a = new Float32Array((S + 1) * 2 * 2);
  const idx = [];
  for (let j = 0; j <= S; j++) for (let i = 0; i < 2; i++) {
    const k = j * 2 + i;
    a[k * 2] = j / S;
    a[k * 2 + 1] = i ? 1 : -1;
    if (j < S && i === 0) idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(a, 2));
  g.setIndex(idx);
  const r = rngOf(31);
  const n = q.filaments;
  const iA = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const hem = i < n * 0.16;
    const th = r() * TAU;
    const v = hem ? 0.965 + r() * 0.03 : 0.22 + Math.pow(r(), 1.3) * 0.62;
    const L = hem ? 0.5 + Math.pow(r(), 2.4) * 2.6 : 5 + Math.pow(r(), 1.4) * 7.5;
    iA.set([th, v, L, r()], i * 4);
  }
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {...shared},
    vertexShader: /* glsl */ `
      ${BEAT}${BELL}
      attribute vec2 aS; attribute vec4 iA; uniform vec2 uRes;
      varying float vS,vI,vSeed,vHz;
      vec3 hair(float s,float t){
        float c=pulseAt(t-iA.y*PULSE_LAG);
        vec3 P0=bellAt(iA.x,iA.y,c,t);
        P0.y=min(P0.y,1.8+P0.y*.08);
        vec3 rad=normalize(vec3(P0.x,0.,P0.z)+1e-4);
        float cs=pulseAt(t-s*1.9-iA.y*PULSE_LAG);
        vec3 p=P0+vec3(0.,-iA.z*s,0.);
        p+=rad*(-2.8*cs*s*s*(iA.z*.08)+.5*s);
        float f=iA.w*6.283;
        p.x+=sin(t*.23+f+s*3.)*.5*s*s+sin(t*.07+f*2.+s*7.)*.14*s;
        p.z+=cos(t*.19+f*1.7+s*2.6)*.5*s*s;
        return p;
      }
      void main(){
        float s=aS.x;
        vec3 p=hair(s,uTime);
        vec3 p2=hair(min(s+.015,1.02),uTime);
        vec4 w=modelMatrix*vec4(p,1.);
        vec4 c=projectionMatrix*viewMatrix*w;
        vec4 c2=projectionMatrix*viewMatrix*modelMatrix*vec4(p2,1.);
        vec2 d=normalize((c2.xy/c2.w-c.xy/c.w)*uRes+1e-5);
        vec2 perp=vec2(-d.y,d.x);
        float worldW=(.011+.012*iA.w)*(1.-.75*s);
        float px=worldW*projectionMatrix[1][1]*uRes.y*.5/c.w;
        float halfPx=max(px,.75);
        c.xy+=perp*aS.y*halfPx*2./uRes*c.w;
        gl_Position=c;
        vS=s; vSeed=iA.w;
        vI=min(1.,px/.75)*(1.+pulseAt(uTime-s*1.9)*1.4);
        vHz=exp(-length(w.xyz-cameraPosition)*.005);
      }`,
    fragmentShader: /* glsl */ `
      ${BEAT}
      varying float vS,vI,vSeed,vHz;
      void main(){
        float fall=pow(max(1.-vS,0.),1.5);
        vec3 col=mix(vec3(1.,.66,.28),vec3(.98,.58,.42),vSeed*.4+vS*.3);
        float bead=pow(max(.5+.5*sin(vS*(16.+vSeed*18.)-uTime*(1.2+vSeed*1.4)+vSeed*50.),0.),60.);
        vec3 c=col*(.2*fall+bead*.3*(.2+fall))*vI*vHz;
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 15;
  return m;
}

/** The winged flock: two hinged quads per flyer, circling the rim. Each flyer's path is a function of time. */
function flock(shared, tex, q) {
  const pos = [];
  const a = [];
  const idx = [];
  const seg = 6;
  for (let i = 0; i <= seg * 2; i++) for (let j = 0; j < 2; j++) {
    const x = i / seg - 1;
    pos.push(0, 0, 0);
    a.push(x, j);
    const k = i * 2 + j;
    if (i < seg * 2 && j === 0) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aX', new THREE.BufferAttribute(new Float32Array(a), 2));
  g.setIndex(idx);
  const r = rngOf(17);
  const n = q.flyers;
  const ia = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) ia.set([r(), r(), r(), r()], i * 4);
  g.setAttribute('iF', new THREE.InstancedBufferAttribute(ia, 4));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {...shared, tFly: {value: tex.flyer}},
    vertexShader: /* glsl */ `
      ${BEAT}
      attribute vec2 aX; attribute vec4 iF; varying vec2 vUv; varying vec3 vWP; varying float vLit;
      vec3 path(float t){
        float band=floor(iF.x*5.);
        float ang=band*1.256+iF.x*3.4-t*(.1+.05*iF.y)*(mod(band,2.)<.5?1.:-.8);
        float rr=14.6+band*.6+iF.y*5.+1.2*sin(t*.2+iF.z*30.);
        float y=-2.2+iF.z*4.4+band*.4+.9*sin(t*.33+iF.y*20.)+.3*sin(t*1.1+iF.x*50.);
        return vec3(rr*cos(ang),y,rr*sin(ang));
      }
      void main(){
        float t=uTime;
        vec3 P=path(t);
        vec3 Fw=normalize(path(t+.05)-P);
        vec3 Up=normalize(vec3(0.,1.,0.)+Fw*.1);
        vec3 Rt=normalize(cross(Fw,Up));
        Up=cross(Rt,Fw);
        float bank=(iF.z-.5)*2.2+.6*sin(t*.4+iF.x*40.);
        vec3 Rb=Rt*cos(bank)+Up*sin(bank);
        Up=-Rt*sin(bank)+Up*cos(bank); Rt=Rb;
        vec3 toC=normalize(cameraPosition-P);
        Up=normalize(Up*.5+toC);
        Rt=normalize(cross(Fw,Up));
        Fw=cross(Up,Rt);
        float sz=.2+.2*iF.w;
        float flap=.45+sin(t*(5.+3.*iF.y)+iF.x*80.)*.6;
        float x=aX.x;
        float lift=abs(x)*abs(x)*flap;
        float w=abs(x);
        vec3 p=P+Rt*x*sz*cos(flap*.5*w)+Up*lift*sz*.55+Fw*(aX.y-.5)*sz*1.5;
        vec4 wp=modelMatrix*vec4(p,1.);
        vWP=wp.xyz; vUv=vec2(x*.5+.5,aX.y); vLit=1.;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      ${BEAT}${SKYBASE}
      uniform sampler2D tFly; varying vec2 vUv; varying vec3 vWP;
      void main(){
        vec3 tx=texture(tFly,vUv).rgb;
        float l=dot(tx,vec3(.33));
        float a=smoothstep(.03,.2,l);
        if(a<.01) discard;
        vec3 c=tx*vec3(1.5,1.2,.95)*1.9+vec3(1.,.72,.42)*pow(l,3.)*3.;
        float hz=hazeOf(vWP);
        gl_FragColor=vec4(c*a*hz,a*hz);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 30;
  return m;
}

/** Drifting dust that always surrounds the camera, and gold spores thrown from the rim on each beat. */
function motes(shared, q) {
  const r = rngOf(47);
  const n = q.motes;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set([r(), r(), r(), r()], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aM', new THREE.BufferAttribute(a, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {...shared},
    vertexShader: /* glsl */ `
      ${BEAT}
      attribute vec4 aM; uniform vec2 uRes; varying float vI; varying vec3 vC;
      void main(){
        float box=46.;
        vec3 p=aM.xyz*box+vec3(sin(uTime*.05+aM.w*9.)*2.,uTime*(.12+.2*aM.w),cos(uTime*.04+aM.w*7.)*2.);
        p=mod(p-cameraPosition+box*.5,box)-box*.5+cameraPosition;
        vec4 mv=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        float ws=.008+.018*aM.w*aM.w;
        float px=ws*projectionMatrix[1][1]*uRes.y*.5/-mv.z;
        gl_PointSize=clamp(px*2.,1.2,48.);
        float d=length(mv.xyz);
        vI=min(1.,px*2./1.2)*smoothstep(2.,7.,d)*(1.-smoothstep(16.,23.,d))*(.7+.3*sin(uTime*2.+aM.w*40.));
        vC=mix(vec3(1.,.74,.44),vec3(.7,.76,1.),step(.9,aM.w));
      }`,
    fragmentShader: /* glsl */ `
      varying float vI; varying vec3 vC;
      void main(){
        vec2 q=gl_PointCoord*2.-1.; float d=dot(q,q); if(d>1.) discard;
        gl_FragColor=vec4(vC*exp(-d*3.)*(1.-d)*vI*1.5,1.);
      }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.renderOrder = 60;
  return p;
}

export function createCreature({shared, tex, env, q}) {
  const body = new THREE.Group();
  const {backM, frontM} = membrane(shared, tex, q);
  const rb = ribs(shared, env, q);
  const bd = beads(shared, q);
  const sp = spires(shared, env, q);
  const am = arms(shared, tex, q);
  const fl = filaments(shared, q);
  const flk = flock(shared, tex, q);
  const mt = motes(shared, q);
  body.add(backM, frontM, rb, bd, sp, am, fl, flk, skirt(shared, tex, q));
  body.add(collar(shared, env, tex, 0.095, 0.148, 16, q));
  body.add(collar(shared, env, tex, 0.335, 0.362, 32, q));
  return {body, world: [mt], backM, frontM, flock: flk};
}
