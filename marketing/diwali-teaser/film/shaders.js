/* GLSL for the QUOIN teaser. Every scene is a full-screen fragment shader.
   Convention: uv = (fragCoord - 0.5R)/R.x  ->  x in [-.5,.5], y in [-.889,.889]
   so vertical framing is described in units of SCREEN WIDTH. Colour is carried
   in rough linear HDR and only gamma-encoded in the composite pass, which is
   what lets the bloom bleed the way a real lens does. */
export const PRE = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T;
out vec4 O;
#define PI 3.14159265359
vec3 s2l(vec3 c){ return pow(c, vec3(2.2)); }      // sRGB hex -> ~linear
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float h11(float p){ return fract(sin(p*78.233)*43758.5453123); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
float fbm3(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<3;i++){ s+=a*vnoise(p); p*=2.07; a*=0.5; } return s; }
float sat(float x){ return clamp(x,0.0,1.0); }
float ss(float a,float b,float x){ return smoothstep(a,b,x); }
// QUOIN palette
#define ESPRESSO vec3(0.165,0.086,0.039)
#define TERRA    vec3(0.851,0.365,0.141)
#define ACCENT   vec3(0.659,0.353,0.165)
#define CREAM    vec3(0.961,0.929,0.882)
`;

/* ---------------------------------------------------------- SCENE 1: SPARK
   Extreme close-up on a diya. Black frame, a spark, then a flame that grows
   with a little overshoot and settles into a flicker. The lamp itself is
   almost entirely silhouette — in a frame this dark the flame IS the light,
   so the diya is read from its rim highlight, not from its body. */
export const SCENE1 = PRE + `
uniform float IGN;     // 0 before ignition, 1 after
uniform float GROW;    // flame height multiplier
uniform float FLASH;   // spark flash intensity
uniform float PUSH;    // camera push-in

// Flame field in flame-local space. Returns ~1 at the core, 0 outside.
float flame(vec2 p, float grow){
  float h = 0.46*grow;                             // flame height
  if(grow<0.001) return 0.0;
  p.y /= grow;                                      // grow from the wick
  // lateral sway, stronger toward the tip
  float sway = 0.030*sin(T*2.3 + p.y*5.0) + 0.018*sin(T*3.7 + p.y*9.0);
  p.x += sway * ss(0.0,0.42,p.y);
  // taper: wide at the base, pinched at the tip
  float w = 0.088 * (1.0 - 0.72*ss(-0.02,0.46,p.y)) + 0.010;
  float body = 1.0 - length(vec2(p.x/w, (p.y-0.20)/0.36));
  // turbulent erosion, rising with the convection current
  float n = fbm(vec2(p.x*11.0, p.y*7.0 - T*2.6));
  body -= (n-0.46) * 1.25 * ss(-0.05,0.40,p.y);
  body -= ss(0.30,0.50,p.y)*0.55;                   // let the tip break up
  return sat(body);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*R)/R.x;
  uv /= (1.0 + PUSH);                               // slow push-in
  uv.y += 0.012*sin(T*0.7);                         // breath

  vec3 col = vec3(0.0);
  vec2 wick = vec2(0.0, -0.20);                     // flame origin
  vec2 fp = uv - wick;

  float f = flame(fp, GROW);
  // Temperature ramp: white-hot core -> amber -> deep orange tip.
  vec3 fcol = vec3(0.0);
  fcol += s2l(vec3(1.00,0.42,0.10)) * ss(0.02,0.30,f) * 1.6;
  fcol += s2l(vec3(1.00,0.66,0.22)) * ss(0.22,0.58,f) * 2.2;
  fcol += s2l(vec3(1.00,0.92,0.74)) * ss(0.52,0.86,f) * 3.4;
  // the cool base every real flame has, just enough to be felt
  fcol += s2l(vec3(0.30,0.52,1.00)) * ss(0.30,0.70,f) * ss(0.06,-0.04,fp.y) * 0.9;
  col += fcol;

  // Volumetric halo: the light the flame throws into the dark.
  float d = length((uv-wick-vec2(0.0,0.10)) * vec2(1.0,0.72));
  float halo = exp(-d*10.5)*0.38 + exp(-d*4.4)*0.040;
  col += s2l(vec3(1.0,0.50,0.17)) * halo * GROW * 0.80;

  // Smoke drifting off the tip, visible only against the halo.
  float sm = fbm(vec2(uv.x*14.0 + sin(uv.y*4.0+T*0.6)*0.7, uv.y*5.0 - T*0.9));
  col += s2l(vec3(1.0,0.60,0.30)) * sm * ss(0.14,0.52,uv.y) * ss(0.085,0.02,abs(uv.x)) * 0.026 * GROW;

  // Ignition flash.
  col += s2l(vec3(1.0,0.74,0.40)) * FLASH * exp(-length(uv-wick)*17.0) * 2.6;

  /* The diya. Read as a rim, not a body: an elliptical lip catching the
     flame from above, and below it a bowl that falls away into the dark. */
  vec2 lc = vec2(0.0,-0.265);                       // lip centre
  vec2 lp = (uv-lc)/vec2(0.300,0.062);              // lip ellipse
  float lipD = length(lp)-1.0;
  float inLip = ss(0.02,-0.02,lipD);
  // bowl: hangs beneath the lip, tapering
  float bowl = ss(0.015,-0.015, length((uv-lc-vec2(0.0,0.02))/vec2(0.300,0.235))-1.0) * ss(-0.255,-0.275,uv.y);
  float lamp = max(inLip, bowl);
  // Clay, lit only by the flame above it.
  float up = ss(-0.46,-0.20,uv.y);
  vec3 clay = s2l(vec3(0.33,0.15,0.07)) * (0.016 + 0.40*up*up*up) * (0.75+0.45*fbm3(uv*34.0));
  // the far lip catches a hot specular line
  float rim = ss(0.030,0.0,abs(lipD)) * ss(-0.30,-0.245,uv.y);
  clay += s2l(vec3(1.0,0.55,0.20)) * rim * 1.9 * GROW;
  // oil pool reflecting the flame
  float pool = inLip * ss(-0.248,-0.30,uv.y);
  float pgrad = ss(-0.335,-0.250,uv.y);
  clay += s2l(vec3(1.0,0.46,0.14)) * pool * pgrad * 0.26 * GROW;
  float glint = exp(-abs(uv.x)/0.060) * exp(-abs(uv.y+0.272)/0.013);
  clay += s2l(vec3(1.0,0.72,0.36)) * glint * pool * 1.1 * GROW;
  clay *= mix(1.0, 0.22, ss(-0.30,-0.47,uv.y));
  col = mix(col, clay, lamp*ss(0.06,0.0,-f));       // flame still draws over the lip

  // Embers lifting off the flame.
  for(int i=0;i<16;i++){
    float fi=float(i);
    float sp = 0.055 + h11(fi*1.7)*0.075;
    float life = fract(T*sp*2.2 + h11(fi*3.1));
    float ey = wick.y + 0.10 + life*0.95;
    float ex = (h11(fi*5.3)-0.5)*0.30 + sin(life*5.0 + fi)*0.045*life;
    float sz = (0.0016 + h11(fi*7.9)*0.0022) * (1.0-life*0.55);
    float tw = 0.55 + 0.45*sin(T*(9.0+fi) + fi*2.0);
    float e = exp(-length(uv-vec2(ex,ey))/sz * 0.85);
    col += s2l(vec3(1.0,0.58,0.22)) * e * tw * (1.0-ss(0.55,1.0,life)) * GROW * 1.4;
  }

  O = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------- POST CHAIN */
export const MIXER = PRE + `
uniform sampler2D A; uniform sampler2D B; uniform float K;
void main(){ vec2 t=gl_FragCoord.xy/R; O = mix(texture(A,t), texture(B,t), K); }`;

export const BRIGHT = PRE + `
uniform sampler2D S; uniform float THRESH;
void main(){
  vec2 t=gl_FragCoord.xy/R; vec3 c=texture(S,t).rgb;
  float l=dot(c,vec3(0.2126,0.7152,0.0722));
  O = vec4(c * ss(THRESH, THRESH*2.2, l), 1.0);
}`;

export const BLUR = PRE + `
uniform sampler2D S; uniform vec2 DIR;
void main(){
  vec2 t=gl_FragCoord.xy/R; vec2 o=DIR/R;
  // 9-tap gaussian via 5 linearly-interpolated samples
  vec3 c = texture(S,t).rgb*0.227027;
  c += (texture(S,t+o*1.3846).rgb + texture(S,t-o*1.3846).rgb)*0.316216;
  c += (texture(S,t+o*3.2308).rgb + texture(S,t-o*3.2308).rgb)*0.070270;
  O = vec4(c,1.0);
}`;

export const COMPOSITE = PRE + `
uniform sampler2D S; uniform sampler2D B1; uniform sampler2D B2;
uniform float BLOOM; uniform float EXPOSURE; uniform float GRAIN;
uniform float VIG; uniform float FADE; uniform float CA;
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
void main(){
  vec2 t = gl_FragCoord.xy/R;
  vec2 uv = (gl_FragCoord.xy-0.5*R)/R.x;
  // chromatic aberration grows toward the edges, as a fast lens does
  vec2 dir = uv*CA*0.004;
  vec3 c;
  c.r = texture(S, t - dir).r;
  c.g = texture(S, t).g;
  c.b = texture(S, t + dir).b;
  c += (texture(B1,t).rgb*0.65 + texture(B2,t).rgb*1.0) * BLOOM;
  c *= EXPOSURE;
  c = aces(c);
  // warm the shadows toward espresso, keep highlights clean
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(c, c*vec3(1.06,0.97,0.90), 1.0-l);
  c += ESPRESSO*0.030*(1.0-l);
  // vignette
  float v = 1.0 - VIG*ss(0.22,0.86,length(uv*vec2(1.0,0.62)));
  c *= v;
  c = pow(max(c,0.0), vec3(0.4545));
  // grain, after gamma so it sits in the picture rather than under it
  float g = h21(gl_FragCoord.xy + fract(T)*vec2(133.7,71.3))-0.5;
  c += g*GRAIN*(1.15-l);
  c *= FADE;
  O = vec4(max(c,0.0), 1.0);
}`;

/* -------------------------------------------------------- SCENE 2: VISION
   Night architecture. Towers of varied height down a canyon, a structure
   still under construction passing on the right — slabs and columns, no
   cladding, which is the half-built state Quoin's customers actually work
   in. Concrete is kept dark but never black: the mass has to read, or the
   windows look like confetti floating in a void. */
export const SCENE2 = PRE + `
uniform float TILT; uniform float DOLLY; uniform float HAZE;
mat2 rot(float a){ float s=sin(a),c=cos(a); return mat2(c,-s,s,c); }
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }
float gMat;
float tower(vec3 p, float xoff, float period, float phase, float wx, float wz, float hb, float hv){
  vec3 q=p; float id=floor((q.z+phase)/period);
  q.z = mod(q.z+phase, period) - period*0.5;
  float h = hb + h11(id*1.37 + xoff*0.11)*hv;
  return sdBox(q - vec3(xoff, h-26.0, 0.0), vec3(wx, h, wz));
}
float construction(vec3 p){
  vec3 q = p - vec3(27.0, 0.0, 64.0);
  float bound = sdBox(q - vec3(0.0,16.0,0.0), vec3(12.5,32.0,14.5));
  if(bound > 1.5) return bound;                 // cheap bail before the detail
  vec3 s=q; s.y = mod(s.y+2.5, 5.0) - 2.5;      // floor slabs, 5 m lifts
  float d = sdBox(s, vec3(12.0,0.30,14.0));
  vec3 c=q; c.xz = mod(c.xz+3.0, 6.0) - 3.0;    // columns on a 6 m grid
  d = min(d, sdBox(c - vec3(0.0,16.0,0.0), vec3(0.42,32.0,0.42)));
  return max(d, bound);
}
float crane(vec3 p){
  vec3 q = p - vec3(-34.0, 0.0, 128.0);
  float bound = sdBox(q - vec3(7.0, 40.0, 0.0), vec3(28.0, 42.0, 5.0));
  if(bound > 2.0) return bound;
  float d = sdBox(q - vec3( 0.0, 38.0, 0.0), vec3(1.0, 40.0, 1.0));   // mast
  d = min(d, sdBox(q - vec3(12.0, 76.0, 0.0), vec3(22.0, 0.6, 0.6))); // jib
  d = min(d, sdBox(q - vec3(-6.0, 79.0, 0.0), vec3(6.0, 0.5, 0.5)));  // counter-jib
  d = min(d, sdBox(q - vec3(18.0, 70.0, 0.0), vec3(0.18, 6.0, 0.18)));// hoist line
  return max(d, bound);
}
float map(vec3 p){
  float d = tower(p,-26.0,44.0,22.0, 7.0,12.0,30.0,22.0);
  d = min(d, tower(p, 28.0,38.0,13.0, 6.5,10.0,24.0,18.0));
  d = min(d, tower(p,-46.0,68.0,34.0, 9.0,14.0,42.0,24.0));
  d = min(d, tower(p, 39.0,59.0, 9.0, 8.0,13.0,36.0,20.0));
  d = min(d, sdBox(p - vec3(2.0,30.0,175.0), vec3(14.0,70.0,14.0)));
  gMat = 1.0;
  float cs = construction(p);
  if(cs < d){ d = cs; gMat = 2.0; }
  float cr = crane(p);
  if(cr < d){ d = cr; gMat = 3.0; }
  return d;
}
vec3 nrm(vec3 p){ vec2 e=vec2(0.025,0.0);
  return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float windows(vec3 p, vec3 n, out float warm){
  vec2 c = (abs(n.x) > 0.5) ? vec2(p.z, p.y) : vec2(p.x, p.y);
  vec2 cell = vec2(1.6, 2.05);
  vec2 id = floor(c/cell) + vec2(n.x*7.0 + n.z*13.0);
  vec2 f  = fract(c/cell);
  float pane = ss(0.18,0.26,f.x)*ss(0.82,0.74,f.x)*ss(0.26,0.34,f.y)*ss(0.76,0.68,f.y);
  float lit  = step(0.78, h21(id)) * (1.0 + 2.2*step(0.962, h21(id*3.1+7.7)));
  warm = 0.5 + 0.5*h21(id*1.7+3.3);
  return pane*lit*(1.0 - ss(0.0,0.12,abs(n.y)));   // vertical faces only
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*R)/R.x;
  vec3 ro = vec3(1.5, 2.2 + DOLLY*0.7, -34.0 + DOLLY*8.0);
  vec3 rd = normalize(vec3(uv*1.05, 1.08));
  rd.yz *= rot(-TILT);
  rd.xz *= rot(0.06 + 0.04*sin(T*0.33));
  float t=0.0, glow=0.0; bool hit=false;
  for(int i=0;i<104;i++){
    vec3 p=ro+rd*t; float d=map(p);
    glow += 0.0042/(1.0+d*d*0.9);
    if(d<0.025){ hit=true; break; }
    if(t>260.0) break;
    t += max(d*0.82, 0.03);
  }
  // Sky: warm haze low in frame, falling to near-black overhead.
  vec3 sky = vec3(0.0026,0.0021,0.0023) + vec3(0.020,0.0085,0.0032)*exp(-max(0.0,uv.y+0.50)*2.7);
  vec3 col = sky;
  if(hit){
    vec3 p=ro+rd*t; float m=gMat; vec3 n=nrm(p);
    float conc = fbm(vec2(p.x*0.85+p.z*0.85, p.y*0.32))*0.5 + fbm(p.zy*2.8)*0.22;
    float key = 0.45 + 0.85*max(0.0, dot(n, normalize(vec3(-0.40,0.72,-0.35))));
    if(m > 2.5){
      col = vec3(0.004,0.0032,0.0030)*key;
    } else if(m > 1.5){
      // Steel and raw concrete: colder, harder, catching only rim light.
      col = vec3(0.022,0.019,0.017)*(0.40+0.8*conc)*key;
      col += vec3(0.055,0.030,0.013)*ss(0.3,1.0,abs(n.x))*0.5;   // sodium work-light spill
    } else {
      float warm; float win = windows(p,n,warm);
      col = vec3(0.030,0.021,0.016)*(0.35+0.95*conc)*key;
      vec3 lit = mix(vec3(1.00,0.325,0.052), vec3(1.00,0.560,0.230), warm);
      col += lit * win * (1.15 + 1.05*warm);
    }
  }
  col += vec3(1.0,0.30,0.055) * glow * 0.032;
  float fog = 1.0 - exp(-t*0.0062*HAZE);
  col = mix(col, sky*1.25 + vec3(0.0055,0.0026,0.0011), fog);
  O = vec4(col,1.0);
}`;

/* ---------------------------------------------------- SCENE 3: TAKING SHAPE
   Architectural line work that draws itself. Segments are projected on the
   CPU and handed over in screen space; the shader only has to measure
   distance to each one, which keeps a glowing 3D wireframe cheap enough to
   run inside the same bloom chain as the photographic scenes. The structure
   resolves into the quoin stone — the corner block the brand is named for —
   so the cut to the logo is earned rather than arbitrary. */
export const SCENE3 = PRE + `
#define MAXSEG 72
uniform vec4 SEG[MAXSEG];     // x1,y1,x2,y2 in uv space
uniform vec2 SEGP[MAXSEG];    // x = draw progress 0..1, y = brightness
uniform int  NSEG;
uniform float GRID;           // background blueprint grid
uniform float CONVERGE;       // late pull of everything toward centre
float sdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa=p-a, ba=b-a; float dd=max(dot(ba,ba),1e-9);
  float h=clamp(dot(pa,ba)/dd, 0.0, 1.0);
  return length(pa - ba*h);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*R)/R.x;
  uv *= 1.0 + CONVERGE*0.12;
  vec3 col = vec3(0.0030,0.0024,0.0022);
  // faint drafting grid
  vec2 g = abs(fract(uv*9.0)-0.5);
  float gl1 = ss(0.018,0.0,min(g.x,g.y));
  col += vec3(0.055,0.028,0.013) * gl1 * GRID * 0.085;
  col += vec3(0.040,0.019,0.008) * exp(-length(uv*vec2(1.0,0.7))*2.3) * 0.55;

  vec3 hot  = vec3(1.00,0.560,0.230);   // amber core
  vec3 warm = vec3(1.00,0.300,0.075);   // terracotta falloff
  for(int i=0;i<MAXSEG;i++){
    if(i>=NSEG) break;
    vec2 pr = SEGP[i];
    if(pr.x <= 0.001) continue;
    vec4 s = SEG[i];
    vec2 a = s.xy, b = mix(s.xy, s.zw, pr.x);
    float d = sdSeg(uv, a, b);
    /* Nothing this far from a line contributes as much as 1e-5, which is
       orders of magnitude under a quantisation step. Skipping it is what
       makes 49 glowing segments affordable per pixel in software GL. */
    if(d > 0.08) continue;
    float core = exp(-d/0.0013);
    float halo = exp(-d/0.0075);
    col += (hot*core*1.5 + warm*halo*0.30) * pr.y;
    float db = length(uv-b);
    if(db < 0.040) col += hot * exp(-db/0.0035) * (1.0 - ss(0.88,1.0,pr.x)) * 1.6 * pr.y;
    float da = length(uv-a);
    if(da < 0.026) col += hot * exp(-da/0.0022) * 0.75 * pr.y;
  }
  O = vec4(col,1.0);
}`;

/* --------------------------------------------------- SCENE 4: BRAND REVEAL
   Black, then one hard anamorphic streak across the frame — the light that
   "passes through" and leaves the mark behind it. The logo itself is drawn
   in the DOM layer above this, as real vector geometry, so the brand asset
   is never resampled or distorted by a shader. */
export const SCENE4 = PRE + `
uniform float SWEEP;    // streak position in uv x
uniform float SWEEPI;   // streak intensity
uniform float GLOW;     // pool of light the mark sits in
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*R)/R.x;
  vec3 col = vec3(0.0020,0.0016,0.0015);
  float dx = uv.x - SWEEP;
  float vert = exp(-abs(uv.y+0.02)/0.34);
  col += vec3(1.0,0.60,0.25) * (exp(-abs(dx)/0.0035)*2.4 + exp(-abs(dx)/0.055)*0.30) * vert * SWEEPI;
  // the horizontal lens lobe that sells it as a lens and not a wipe
  col += vec3(1.0,0.48,0.17) * exp(-abs(uv.y+0.02)/0.010) * exp(-abs(dx)/0.30) * 0.55 * SWEEPI;
  col += vec3(0.26,0.115,0.045) * exp(-length(uv*vec2(1.0,1.3))*2.5) * GLOW;
  // slow dust in the beam
  for(int i=0;i<10;i++){
    float fi=float(i);
    vec2 dp = vec2((h11(fi*3.1)-0.5)*0.95, -0.6 + fract(h11(fi*6.7) + T*0.016)*1.25);
    col += vec3(1.0,0.62,0.30) * exp(-length(uv-dp)/0.0016) * (0.25+0.5*h11(fi*9.3)) * GLOW * 0.7;
  }
  O = vec4(col,1.0);
}`;

/* ------------------------------------------------------- SCENE 5: DIWALI
   Warm, minimal, almost entirely out of focus: a field of amber bokeh and
   two small flames low in frame. Restraint is the point — the brief rules
   out the rangoli-and-fireworks template, so the festival is carried by
   light alone. */
export const SCENE5 = PRE + `
uniform float RISE;
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*R)/R.x;
  vec3 col = vec3(0.0070,0.0044,0.0034);
  col += vec3(0.085,0.034,0.012) * exp(-max(0.0,uv.y+0.95)*1.55) * RISE;   // warmth from below
  // defocused lights
  for(int i=0;i<15;i++){
    float fi=float(i);
    float bx = (h11(fi*2.37)-0.5)*1.08;
    float by = -0.80 + h11(fi*5.11)*1.62 + sin(T*0.22+fi*1.7)*0.013;
    float br = 0.020 + h11(fi*7.73)*0.052;
    float d  = length(uv-vec2(bx,by));
    float disc = ss(br, br*0.74, d);
    float rim  = max(0.0, ss(br*1.00,br*0.88,d) - ss(br*0.90,br*0.76,d));
    float amp  = (0.22 + 0.78*h11(fi*11.31)) * RISE;
    col += vec3(1.0,0.42,0.14)*disc*0.20*amp + vec3(1.0,0.60,0.26)*rim*0.26*amp;
  }
  // two small diyas, low and soft
  for(int i=0;i<2;i++){
    float fi=float(i);
    vec2 c = vec2(i==0 ? -0.255 : 0.235, -0.60);
    float fl = 0.0;
    vec2 p = (uv-c)/vec2(0.030,0.062);
    p.x += 0.16*sin(T*2.1+fi*2.0)*ss(-1.0,1.0,p.y);
    fl = 1.0 - length(vec2(p.x, (p.y-0.25)/1.15));
    fl -= (fbm(vec2(p.x*2.2, p.y*1.6 - T*2.0))-0.47)*0.9*ss(-0.6,1.0,p.y);
    fl = sat(fl);
    col += vec3(1.0,0.34,0.07)*ss(0.02,0.35,fl)*0.9*RISE;
    col += vec3(1.0,0.72,0.34)*ss(0.40,0.85,fl)*1.5*RISE;
    col += vec3(1.0,0.45,0.16)*exp(-length(uv-c-vec2(0.0,0.02))*13.0)*0.28*RISE;
    // the lamp beneath, barely there
    float lip = ss(0.012,-0.012, length((uv-c-vec2(0.0,-0.040))/vec2(0.072,0.016))-1.0);
    col = mix(col, vec3(0.022,0.009,0.004), lip*0.85);
  }
  O = vec4(col,1.0);
}`;
