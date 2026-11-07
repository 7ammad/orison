// Shared GLSL: the beat, the dome, the sky colour and the haze. Materials paste what they need.

export const NOISE = /* glsl */ `
uniform highp sampler3D tNoise;
float hash13(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float hash12(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float n3(vec3 p){ return texture(tNoise,p).r; }
float w3(vec3 p){ return texture(tNoise,p).g; }
`;

export const BEAT = /* glsl */ `
uniform float uTime;
uniform float uBeats[8];
#define GORES 16.
#define PULSE_LAG .55
#define M_PI 3.14159265
float envBeat(float x){
  if(x<0.) return 0.;
  if(x<.55){ float k=x/.55; return k*k*(3.-2.*k); }
  return exp(-(x-.55)/1.35);
}
float pulseAt(float t){
  float p=0.;
  for(int i=0;i<8;i++) p=max(p,envBeat(t-uBeats[i]));
  return p+.07*(.5+.5*sin(t*1.05));
}
`;

export const BELL = /* glsl */ `
vec3 bellAt(float th,float v,float c,float t){
  float sn=abs(sin(GORES*.5*th));
  float V=v*(1.-.085*pow(sn,.8));
  float a=V*M_PI*.5;
  float r=13.*pow(max(sin(a),0.),.92);
  float y=6.6*pow(max(cos(a),0.),.95);
  float fl=smoothstep(.82,1.,V);
  r+=.7*fl*fl; y-=.9*fl*fl;
  r+=.22*sn*sin(M_PI*min(V*1.02,1.));
  float ss=smoothstep(.12,.95,V);
  r*=1.-.2*c*ss;
  y+=c*(1.1*(1.-V)-.5*V*V);
  r+=.1*sin(th*3.+t*.35+V*4.)*ss;
  y+=.1*sin(th*2.-t*.27+V*3.);
  return vec3(r*cos(th),y,r*sin(th));
}
// position and outward normal on the dome at (th,v)
vec3 bellPN(float th,float v,float t,out vec3 N){
  float c=pulseAt(t-v*PULSE_LAG);
  vec3 P=bellAt(th,v,c,t);
  float e=.003;
  vec3 A=bellAt(th+e,v,c,t)-P;
  vec3 B=(v>.5?P-bellAt(th,v-e,c,t):bellAt(th,v+e,c,t)-P);
  N=normalize(cross(A,B));
  return P;
}
`;

// The sky's colour without its objects: the haze reads it, so everything distant melts into the right colour.
export const SKYBASE = /* glsl */ `
uniform vec3 uSunDir;
uniform float uHazeK;
vec3 skyBase(vec3 rd){
  float h=rd.y;
  vec3 zen=vec3(.006,.007,.024), mid=vec3(.018,.015,.058), hor=vec3(.085,.05,.125);
  vec3 c=mix(hor,mid,smoothstep(0.,.07,h));
  c=mix(c,zen,smoothstep(.12,.6,h));
  float sd=max(dot(rd,uSunDir),0.);
  float band=exp(-abs(h)*26.);
  c+=vec3(1.2,.42,.12)*pow(sd,70.)*band;
  c+=vec3(3.,1.3,.5)*pow(sd,600.)*.22+vec3(9.,5.2,2.6)*pow(sd,50000.);
  c+=vec3(.11,.055,.1)*exp(-abs(h)*70.);
  c=mix(c,vec3(.05,.033,.09),1.-smoothstep(-.3,0.,h));
  return c;
}
vec3 applyHaze(vec3 col,vec3 wp){
  vec3 d=wp-cameraPosition; float l=length(d);
  float f=1.-exp(-l*uHazeK);
  return mix(col,skyBase(d/max(l,1e-3)),f);
}
float hazeOf(vec3 wp){ return exp(-length(wp-cameraPosition)*uHazeK); }
`;
