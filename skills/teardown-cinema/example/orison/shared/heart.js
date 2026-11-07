// The heart: a nested orrery, half clock and half grown bone. Rings turn on their own axes as pure functions of time
// and each beat kicks them forward, so the mechanism and the pulse can never disagree.
import * as THREE from 'three';
import {NOISE} from './glsl.js';
import {envBeat} from './kin.js';

const TAU = Math.PI * 2;

function bandGeo(r, w, t, seg = 180) {
  // a flat band with a raised lip, lathed around Y
  const h = w / 2;
  const p = [[r - t, -h], [r + t * 0.3, -h], [r + t * 0.6, -h * 0.82], [r + t * 0.3, -h * 0.64], [r + t * 0.5, 0], [r + t * 0.3, h * 0.64], [r + t * 0.6, h * 0.82], [r + t * 0.3, h], [r - t, h], [r - t, -h]];
  return new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

function teeth(r, count, size, mat) {
  const g = new THREE.BoxGeometry(size * 0.55, size * 0.9, size);
  const m = new THREE.InstancedMesh(g, mat, count);
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    o.rotation.y = -a;
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  }
  m.frustumCulled = false;
  return m;
}

function hoop(r, w, repeats, mat) {
  const g = new THREE.CylinderGeometry(r, r, w, 220, 1, true);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeats);
  return new THREE.Mesh(g, mat);
}

export function createHeart({shared, tex, env, q}) {
  const root = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({side: THREE.DoubleSide, color: '#e7b25c', metalness: 1, roughness: 0.28, envMap: env, envMapIntensity: 1.9, emissive: '#ff9a3c', emissiveIntensity: 0.6});
  const bone = new THREE.MeshStandardMaterial({color: '#f0e2c8', metalness: 0.2, roughness: 0.4, envMap: env, envMapIntensity: 1.3, emissive: '#e8bc84', emissiveIntensity: 0.7, side: THREE.DoubleSide});
  // filigree plate: gold metal, cut out by its own black, lit from within
  const lace = tex.filigreeHoop;
  const filig = new THREE.MeshStandardMaterial({
    map: lace,
    alphaMap: lace,
    alphaTest: 0.06,
    bumpMap: lace,
    bumpScale: 1.6,
    metalness: 1,
    roughness: 0.3,
    side: THREE.DoubleSide,
    envMap: env,
    envMapIntensity: 1.9,
    emissive: '#ffb25c',
    emissiveMap: lace,
    emissiveIntensity: 1.7,
  });

  // [radius, band width, filigree?, teeth, axis tilt (x, z), spin axis, speed, kick]
  const specs = [
    {r: 4.5, w: 0.46, lace: 1.15, teeth: 150, tilt: [0.22, 0.05], spin: [0, 1, 0], sp: 0.05, kick: 0.2},
    {r: 3.85, w: 0.34, lace: 0.9, teeth: 0, tilt: [1.2, 0.3], spin: [0, 1, 0], sp: -0.09, kick: -0.35},
    {r: 3.25, w: 0.3, lace: 0.78, teeth: 96, tilt: [0.5, 1.1], spin: [1, 0, 0], sp: 0.13, kick: 0.5},
    {r: 2.62, w: 0.26, lace: 0.62, teeth: 0, tilt: [1.5, 0.9], spin: [0, 0, 1], sp: -0.18, kick: -0.7},
    {r: 2.06, w: 0.2, lace: 0.48, teeth: 72, tilt: [0.9, 0.4], spin: [1, 0, 0], sp: 0.26, kick: 0.9},
    {r: 1.56, w: 0.16, lace: 0.34, teeth: 0, tilt: [0.2, 1.4], spin: [0, 1, 0], sp: -0.37, kick: -1.1},
    {r: 1.16, w: 0.11, lace: 0, teeth: 48, tilt: [1.1, 1.2], spin: [0, 0, 1], sp: 0.52, kick: 1.4},
  ];
  const rings = specs.map((s, i) => {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    pivot.rotation.set(s.tilt[0], 0, s.tilt[1]);
    pivot.add(spin);
    spin.add(new THREE.Mesh(bandGeo(s.r, s.w, 0.05 + s.w * 0.1, q.ringSeg), i % 2 ? bone : gold));
    if (s.lace) {
      const repeats = Math.round((TAU * s.r) / (s.lace * 3.0));
      const h = hoop(s.r + 0.004, s.lace, repeats, filig);
      spin.add(h);
      const h2 = new THREE.Mesh(new THREE.TorusGeometry(s.r, 0.035, 8, q.ringSeg), gold);
      h2.rotation.x = Math.PI / 2;
      h2.position.y = s.lace / 2;
      const h3 = h2.clone();
      h3.position.y = -s.lace / 2;
      spin.add(h2, h3);
    }
    if (s.teeth) spin.add(teeth(s.r + 0.1, s.teeth, 0.09 + s.w * 0.14, gold));
    root.add(pivot);
    return {pivot, spin, s};
  });

  // glass orbs riding the rings
  const orbMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {uColor: {value: new THREE.Color(1, 0.8, 0.55)}, uI: shared.uHeartI},
    vertexShader: `varying vec3 vN,vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN,vV; uniform vec3 uColor; uniform float uI;
      void main(){ float d=max(dot(normalize(vN),normalize(vV)),0.); float f=pow(max(1.-d,0.),2.5);
      vec3 c=mix(vec3(1.,.72,.5),vec3(.62,.9,1.),f)*(f*3.2+pow(d,10.)*5.*uI+.12);
      gl_FragColor=vec4(c,1.); }`,
  });
  const orbs = [[0, 0.4, 0.42], [0, 2.8, 0.3], [1, 1.1, 0.34], [2, 4.2, 0.28], [2, 0.9, 0.22], [3, 2.1, 0.24], [4, 5.2, 0.17]];
  for (const [ri, ang, sz] of orbs) {
    const rr = specs[ri].r + 0.02;
    const m = new THREE.Mesh(new THREE.SphereGeometry(sz, 32, 20), orbMat);
    m.position.set(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
    rings[ri].spin.add(m);
    const collarM = new THREE.Mesh(new THREE.TorusGeometry(sz * 1.08, 0.016, 8, 48), gold);
    collarM.position.copy(m.position);
    collarM.rotation.x = 1.1;
    collarM.rotation.y = ang;
    rings[ri].spin.add(collarM);
  }

  // the cage: bone meridians around the sun
  const cage = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.012, 6, 72), gold);
    t.rotation.y = (i / 14) * Math.PI;
    cage.add(t);
  }
  root.add(cage);

  // the small white-gold sun
  const sunMat = new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {...shared},
    vertexShader: `varying vec3 vP,vN,vV; void main(){ vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime,uHeartI,uHeartGlow; varying vec3 vP,vN,vV;
      void main(){
        vec3 p=normalize(vP);
        float n=n3(p*.35+uTime*.03)*.6+n3(p*.9-uTime*.05)*.3+n3(p*2.1)*.1;
        float d=max(dot(normalize(vN),normalize(vV)),0.);
        vec3 c=mix(vec3(1.,.55,.2),vec3(1.,.95,.82),smoothstep(.32,.62,n));
        gl_FragColor=vec4(c*(2.6+uHeartI*3.)*uHeartGlow*(.45+.55*pow(d,.5))*(.7+n),1.);
      }`,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), sunMat);
  root.add(sun);

  // corona: a soft star on a billboard
  const coronaMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {...shared},
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.-1.; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=position.xy; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uHeartI; uniform float uHeartGlow; varying vec2 vUv;
      void main(){
        float r=length(vUv); float a=atan(vUv.y,vUv.x+1e-5);
        float glow=exp(-r*9.)*.42+exp(-r*26.)*1.7;
        float spikes=pow(abs(cos(a*6.)),36.)*exp(-r*7.)*.55+pow(abs(cos(a*6.+.52)),60.)*exp(-r*9.)*.35;
        vec3 c=vec3(1.,.74,.42)*(glow+spikes)*uHeartI*uHeartGlow*(1.-smoothstep(.75,1.,r));
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), coronaMat);
  corona.renderOrder = 35;
  corona.frustumCulled = false;
  root.add(corona);

  const light = new THREE.PointLight('#ffc98a', 30, 0, 1.15);
  root.add(light);

  root.position.set(0, 3.0, 0);
  root.scale.setScalar(0.9);

  const update = (t, beats) => {
    for (const {spin, s} of rings) {
      let kicked = t * s.sp;
      // each beat throws the ring forward by a closed-form amount
      for (const b of beats) {
        const x = t - b;
        if (x > 0) kicked += s.kick * (1 - Math.exp(-x / 1.1)) * 0.9;
      }
      spin.rotation.y = kicked;
    }
    const pivots = [0.03, -0.05, 0.07, -0.1, 0.13, -0.17, 0.21];
    rings.forEach(({pivot, s}, i) => {
      pivot.rotation.x = s.tilt[0] + t * pivots[i];
      pivot.rotation.z = s.tilt[1] + t * pivots[6 - i] * 0.7;
    });
    cage.rotation.y = -t * 0.3;
    cage.rotation.x = t * 0.11;
    let beat = 0;
    for (const b of beats) beat = Math.max(beat, envBeat(t - b));
    const I = 1 + 0.12 * Math.sin(t * 1.3) + beat * 1.9;
    shared.uHeartI.value = I;
    const g = shared.uHeartGlow.value;
    filig.emissiveIntensity = 1.7 * (0.45 + 0.55 * g);
    gold.emissiveIntensity = 0.6 * (0.6 + 0.4 * g);
    light.intensity = 30 * I * (0.5 + 0.5 * g);
    const sc = 1 + beat * 0.12;
    sun.scale.setScalar(sc);
    return I;
  };
  return {root, update, rings};
}
