// The world behind the creature: stars, Milky Way, living aurora, the painted planet and its rings, two moons, the sun on
// the horizon, and a true ray-marched cloud sea lit by the sun and by the creature's heart.
import * as THREE from 'three';
import {NOISE, SKYBASE, BEAT} from './glsl.js';

const FS = /* glsl */ `
varying vec3 vRd; uniform mat4 uInvPV;
void main(){
  vec4 p=uInvPV*vec4(position.xy,1.,1.);
  vRd=p.xyz/p.w-cameraPosition;
  gl_Position=vec4(position.xy,1.,1.);
}`;

const SKY_FRAG = /* glsl */ `
varying vec3 vRd;
${NOISE}
${SKYBASE}
uniform float uT;
uniform float uAurora;
uniform int uAuroraSteps;
uniform sampler2D tPlanet, tRings;
uniform vec3 uPlanetDir, uPlanetU, uPlanetV, uRingN;
uniform float uPlanetTan;
uniform vec3 uMoonA, uMoonB;
uniform float uSkyOnly;

vec3 stars(vec3 rd){
  vec3 col=vec3(0.);
  for(int i=0;i<4;i++){
    float sc=60.+float(i)*80.;
    vec3 p=rd*sc; vec3 id=floor(p); vec3 f=fract(p)-.5;
    float h=hash13(id+float(i)*7.);
    if(h>.62){
      vec3 o=vec3(hash13(id+1.3),hash13(id+2.7),hash13(id+4.1))-.5;
      float d=length(f-o*.7);
      float b=pow(hash13(id+9.1),6.)*13.+.24;
      vec3 tint=mix(vec3(1.,.82,.66),vec3(.72,.84,1.),hash13(id+5.5));
      col+=tint*b*exp(-d*d*(420.+float(i)*260.));
    }
  }
  return col;
}
vec3 milky(vec3 rd){
  vec3 n=normalize(vec3(.42,.74,-.52));
  float b=dot(rd,n);
  float band=exp(-b*b*9.);
  float f=n3(rd*.55+7.)*.55+n3(rd*1.3+2.)*.3+n3(rd*3.1)*.15;
  float dust=smoothstep(.34,.62,n3(rd*.9+3.3)*.6+n3(rd*2.4+5.)*.4);
  vec3 c=mix(vec3(.16,.12,.26),vec3(.55,.42,.5),smoothstep(.35,.7,f));
  return c*band*band*smoothstep(.3,.72,f)*(1.-dust*.75)*.95;
}
// aurora: ribbons with a sharp lower hem and rays streaming up from it, green at the hem and violet at the top.
// Coordinates are the horizontal direction, so there is no seam anywhere around the sky.
vec3 ribbon(vec2 hd,float el,float seed,float base,float amp,float height,float t){
  float w=n3(vec3(hd*.42+seed,t*.006))*2.-1.;
  float w2=n3(vec3(hd*1.2+seed*2.,t*.018+.7))*2.-1.;
  float ec=base+amp*w+amp*.3*w2;
  float x=el-ec;
  if(x<-.3) return vec3(0.);
  float lower=smoothstep(-.03,.03,x);
  float below=exp(min(x,0.)/.075)*(1.-lower);
  float up_=exp(-max(x,0.)/height);
  vec2 sh=hd+vec2(w,w2)*.09;
  float r1=n3(vec3(sh*1.15+seed,t*.012+.2));
  float r2=n3(vec3(sh*3.6+seed*3.,t*.022+.6));
  float r3=n3(vec3(sh*10.+seed,t*.03+.9));
  float rays=smoothstep(.34,.72,r1*.45+r2*.38+r3*.17);
  float pres=smoothstep(.36,.6,n3(vec3(hd*.11+seed*5.,t*.004+.4)));
  float k=clamp(x/(height*2.4),0.,1.);
  vec3 col=mix(vec3(.04,1.,.4),vec3(.42,.08,1.),smoothstep(.1,.6,k));
  col=mix(col,vec3(.8,.08,.52),smoothstep(.72,1.,k));
  return (col*lower*up_*(.12+rays*rays*2.1)+vec3(.04,.5,.26)*below*(.1+rays*.5))*pres;
}
vec3 aurora(vec3 rd,float t){
  if(rd.y<.0) return vec3(0.);
  vec2 hd=normalize(rd.xz+1e-5);
  float el=rd.y;
  vec3 c=ribbon(hd,el,.13,.17,.2,.07,t);
  c+=ribbon(hd,el,.57,.33,.24,.1,t)*.85;
  c+=ribbon(hd,el,.81,.52,.2,.09,t)*.6;
  return c*1.25;
}
float moon(vec3 rd,vec3 m,float tanR,out vec3 n){
  vec3 u=normalize(cross(m,vec3(0.,1.,0.))); vec3 v=cross(u,m);
  float dm=dot(rd,m); if(dm<=0.){ n=vec3(0.); return 0.; }
  vec2 q=vec2(dot(rd,u),dot(rd,v))/dm/tanR;
  float r2=dot(q,q);
  n=normalize(q.x*u+q.y*v-sqrt(max(1.-r2,0.))*m);
  return 1.-smoothstep(.97,1.,sqrt(r2));
}
void main(){
  vec3 rd=normalize(vRd);
  vec3 c=skyBase(rd);
  if(rd.y>-.02){
    c+=stars(rd)*smoothstep(-.02,.1,rd.y);
    c+=milky(rd)*smoothstep(-.02,.2,rd.y);
    if(uAurora>0.) c+=aurora(rd,uT)*uAurora;
  }
  // moons
  vec3 n; float a;
  a=moon(rd,uMoonA,.018,n);
  if(a>0.){
    float l=max(dot(n,normalize(vec3(.62,.3,.72))),0.);
    float cr=n3(n*.7)*.6+n3(n*2.3)*.4;
    vec3 mc=mix(vec3(.5,.46,.44),vec3(.85,.82,.78),cr)*(.08+1.1*pow(l,.8));
    c=mix(c,mc,a);
  }
  a=moon(rd,uMoonB,.0058,n);
  if(a>0.){
    float l=max(dot(n,normalize(vec3(.62,.3,.72))),0.);
    c=mix(c,vec3(.7,.62,.58)*(.06+pow(l,.8)),a);
  }
  // the painted planet: a plate, since it sits at infinity and never shows parallax
  float dp=dot(rd,uPlanetDir);
  vec2 pq=vec2(dot(rd,uPlanetU),dot(rd,uPlanetV))/max(dp,1e-3)/uPlanetTan;
  float pr=length(pq);
  float disc=(dp>0.)?1.-smoothstep(.992,1.003,pr):0.;
  vec3 pl=vec3(0.);
  if(disc>0.){
    // plate disc: centre (.49,.495), radius .442 of the image
    vec2 uv=vec2(.49,.495)+pq*.442;
    pl=texture(tPlanet,uv).rgb; pl=mix(vec3(dot(pl,vec3(.3,.5,.2))),pl,.86)*.82;
    c=mix(c,pl,disc);
  }
  // limb glow
  c+=vec3(.9,.6,.32)*exp(-max(pr-1.,0.)*26.)*step(1.,pr)*.25*(dp>0.?1.:0.)*smoothstep(-.5,.8,pq.x);
  // rings: a plane through the planet's centre at a finite distance
  const float D=9.; // the planet's distance: far enough that its ring has no wide-angle fan
  vec3 C=uPlanetDir*D;
  float dn=dot(rd,uRingN);
  if(abs(dn)>1e-4 && dp>0.){
    float s=dot(C,uRingN)/dn;
    if(s>0.){
      vec3 P=rd*s-C;
      float R=length(P)/(uPlanetTan*D);
      float k=(R-4.)/(6.-4.);
      if(k>0.&&k<1.){
        vec3 ring=texture(tRings,vec2(.5,1.-(.14+k*.72))).rgb;
        float op=dot(ring,vec3(.33));
        float along=dot(P,C);
        bool front=s<D; // nearer than the planet's centre: in front of the disc
        // planet's shadow on the far side of the ring
        vec3 Q=P/(uPlanetTan*D);
        vec3 sunT=-uSunDir;
        float sdw=dot(Q,sunT); vec3 perp=Q-sunT*sdw;
        float shadow=(sdw>0.&&length(perp)<1.)?.06:1.;
        vec3 rc=ring*vec3(1.2,1.1,1.)*.95*shadow;
        float aa=smoothstep(.04,.34,op)*.92;
        if(front||disc<.5) c=mix(c,rc,aa);
      }
    }
  }
  gl_FragColor=vec4(c,1.);
}`;

const CLOUD_FRAG = /* glsl */ `
varying vec3 vRd;
${NOISE}
${SKYBASE}
${BEAT}
uniform vec3 uHeart; uniform float uHeartI; uniform vec3 uHeartCol;
uniform float uCloudTop, uCloudBot, uFrame, uFar; uniform int uSteps; uniform int uLightSteps;
uniform float uDense, uShock, uShockR, uCloudHeart, uCloudSun;
float densityAt(vec3 p,bool detail){
  float h=(p.y-uCloudBot)/(uCloudTop-uCloudBot);
  if(h<0.||h>1.) return 0.;
  vec3 w=vec3(uTime*.55,0.,uTime*.28);
  float big=n3(vec3((p.xz+w.xz*.5)*.0021,.31));
  float mid=n3((p+w)*.0105);
  float low=n3((p+w)*.034);
  float shape=big*.62+mid*.5+low*.14;
  float top=1.-smoothstep(.34,1.,h);
  float bot=smoothstep(0.,.1,h);
  float d=shape*bot*(.18+.82*top)-(.44+h*.2)+uDense;
  if(d<=0.) return 0.;
  if(detail){
    float e=w3((p+w*1.2)*.075);
    d-=(1.-e)*.075*(1.-d*2.);
    float f=n3((p+w*1.6)*.21);
    d-=(.5-f)*.032;
  }
  return clamp(d*8.,0.,1.);
}
float HG(float c,float g){ float g2=g*g; return (1.-g2)/pow(max(1.+g2-2.*g*c,1e-3),1.5)/12.566; }
void main(){
  vec3 rd=normalize(vRd);
  vec3 ro=cameraPosition;
  float t0=0.,t1=uFar;
  if(abs(rd.y)<1e-4){ gl_FragColor=vec4(0.); return; }
  float tTop=(uCloudTop-ro.y)/rd.y, tBot=(uCloudBot-ro.y)/rd.y;
  float tA=min(tTop,tBot), tB=max(tTop,tBot);
  t0=max(tA,0.); t1=min(tB,uFar);
  if(t1<=t0){ gl_FragColor=vec4(0.); return; }
  float N=float(uSteps);
  float seg=t1-t0;
  float dith=hash12(gl_FragCoord.xy+uFrame*37.7);
  float T=1.; vec3 L=vec3(0.);
  float cs=dot(rd,uSunDir);
  float ph=mix(HG(cs,.78),HG(cs,-.1),.62)*5.;
  float heartBoost=uHeartI;
  for(int i=0;i<uSteps;i++){
    if(T<.015) break;
    float u0=(float(i)+dith)/N, u1=(float(i)+1.+dith)/N;
    float tt=t0+seg*u0*u0;
    float dt=seg*(u1*u1-u0*u0);
    vec3 p=ro+rd*tt;
    float far=tt/uFar;
    float d=densityAt(p,far<.28);
    if(d>0.){
      // light toward the low sun
      float od=0.;
      for(int j=1;j<=uLightSteps;j++){
        vec3 q=p+uSunDir*float(j)*float(j)*2.1;
        od+=densityAt(q,false);
      }
      float beer=exp(-od*1.25);
      float powder=1.-exp(-d*3.5);
      float hn=(p.y-uCloudBot)/(uCloudTop-uCloudBot);
      vec3 amb=mix(vec3(.024,.015,.062),vec3(.1,.058,.21),smoothstep(.1,.68,hn));
      vec3 sunc=vec3(3.2,1.15,.38)*beer*beer*powder*ph*1.0;
      // the heart's light falls on the cloud tops under the creature
      vec3 toH=uHeart-p; float h2=dot(toH.xz,toH.xz);
      float pocket=.35+.65*smoothstep(.3,.62,n3(vec3(p.xz*.016,.61)));
      vec3 hl=uHeartCol*heartBoost*exp(-h2*.0011)*(.05+smoothstep(.3,.68,hn)*.95)*(.5+.5*beer)*pocket;
      vec3 edge=vec3(1.5,.74,.3)*beer*(1.-d)*(1.-d)*smoothstep(.25,.66,hn)*.3*uCloudSun;
      // a shockwave of light rolling out through the tops
      float sr=sqrt(h2);
      vec3 shock=vec3(1.6,.95,.5)*uShock*exp(-(sr-uShockR)*(sr-uShockR)*.0026)*(.25+hn*hn)*5.5;
      vec3 fogOrb=uHeartCol*heartBoost*HG(dot(rd,normalize(toH)),.8)*(.05+heartBoost*.035);
      vec3 col=amb+edge+sunc*uCloudSun+(hl+fogOrb+shock)*uCloudHeart;
      float a=1.-exp(-d*dt*.42);
      // distance melts into the sky
      float hz=exp(-tt*uHazeK*.62);
      col=mix(skyBase(rd),col,hz);
      L+=T*a*col; T*=1.-a;
    }
  }
  // beyond the march: a flat far sea melting into the horizon
  float edge=smoothstep(uFar*.55,uFar,t1);
  float A=1.-T;
  gl_FragColor=vec4(L,A);
}`;

/** A tiling 3D noise texture: R is billowy perlin-worley, G is finer worley, both built from one seed at load. */
export function makeNoise3D(size = 64, seed = 7) {
  const rnd = (() => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const worley = (cells) => {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rnd();
    const at = (x, y, z) => {
      const fx = x * cells, fy = y * cells, fz = z * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
      let best = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = (ix + dx + cells) % cells, cy = (iy + dy + cells) % cells, cz = (iz + dz + cells) % cells;
        const k = (cx + cy * cells + cz * cells * cells) * 3;
        const px = ix + dx + pts[k] - fx, py = iy + dy + pts[k + 1] - fy, pz = iz + dz + pts[k + 2] - fz;
        const d = px * px + py * py + pz * pz;
        if (d < best) best = d;
      }
      return 1 - Math.min(1, Math.sqrt(best));
    };
    return at;
  };
  const w1 = worley(4), w2 = worley(9), w3 = worley(18), w4 = worley(5), w5 = worley(11);
  const data = new Uint8Array(size * size * size * 4);
  let o = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const X = x / size, Y = y / size, Z = z / size;
    const a = w1(X, Y, Z) * 0.6 + w2(X, Y, Z) * 0.28 + w3(X, Y, Z) * 0.12;
    const b = w4(X, Y, Z) * 0.65 + w5(X, Y, Z) * 0.35;
    data[o++] = Math.min(255, Math.max(0, a * 255));
    data[o++] = Math.min(255, Math.max(0, b * 255));
    data[o++] = 0;
    data[o++] = 255;
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createSky({shared, planetTex, ringsTex, q}) {
  const planetDir = new THREE.Vector3(-0.515, 0.258, -1).normalize();
  const pu = new THREE.Vector3().crossVectors(planetDir, new THREE.Vector3(0.12, 1, 0)).normalize();
  const pv = new THREE.Vector3().crossVectors(pu, planetDir);
  const ringN = new THREE.Vector3(-0.0932, 0.9477, 0.3105).normalize();
  const uniforms = {
    ...shared,
    uInvPV: {value: new THREE.Matrix4()},
    uT: shared.uTime,
    uAurora: {value: 1},
    uAuroraSteps: {value: q.auroraSteps},
    tPlanet: {value: planetTex},
    tRings: {value: ringsTex},
    uPlanetDir: {value: planetDir},
    uPlanetU: {value: pu},
    uPlanetV: {value: pv},
    uRingN: {value: ringN},
    uPlanetTan: {value: 0.125},
    uMoonA: {value: new THREE.Vector3(-0.26, 0.295, -1).normalize()},
    uMoonB: {value: new THREE.Vector3(-0.214, 0.279, -1).normalize()},
    uSkyOnly: {value: 0},
  };
  const geo = new THREE.PlaneGeometry(2, 2);
  const skyMat = new THREE.ShaderMaterial({vertexShader: FS, fragmentShader: SKY_FRAG, uniforms, depthTest: false, depthWrite: false, toneMapped: false});
  const sky = new THREE.Mesh(geo, skyMat);
  sky.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(sky);

  const cloudU = {
    ...shared,
    uInvPV: uniforms.uInvPV,
    uCloudTop: {value: -24},
    uCloudBot: {value: -62},
    uFar: {value: q.cloudFar},
    uSteps: {value: q.cloudSteps},
    uLightSteps: {value: q.cloudLight},
    uFrame: {value: 0},
    uDense: {value: 0},
    uShock: {value: 0},
    uShockR: {value: 0},
    uCloudHeart: {value: 1},
    uCloudSun: {value: 1},
  };
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: FS,
    fragmentShader: CLOUD_FRAG,
    uniforms: cloudU,
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
  const clouds = new THREE.Mesh(geo, cloudMat);
  clouds.frustumCulled = false;
  const cloudScene = new THREE.Scene();
  cloudScene.add(clouds);

  const inv = new THREE.Matrix4();
  const setCamera = (camera, frame) => {
    inv.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).invert();
    uniforms.uInvPV.value.copy(inv);
    cloudU.uFrame.value = frame;
  };
  return {scene, cloudScene, uniforms, cloudU, setCamera, cloudTop: cloudU.uCloudTop};
}
