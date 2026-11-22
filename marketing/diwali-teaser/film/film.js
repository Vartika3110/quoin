import {Engine} from './engine.js';
import * as S from './shaders.js';
import {buildModel, project} from './structure.js';
import {tick as uiTick} from './overlay.js';

export const FPS = 30, DUR = 20.0;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

const eng = new Engine(document.getElementById('gl'));
['s1','s2','s3','s4','s5'].forEach(n=>eng.compile(n, S['SCENE'+n.slice(1)]));
eng.compile('mix',S.MIXER); eng.compile('bright',S.BRIGHT);
eng.compile('blur',S.BLUR); eng.compile('comp',S.COMPOSITE);

/* The cut list. `xf` is how long this scene takes to dissolve UP from the
   one before it; 0 means a hard cut. */
const SCENES = [
  {name:'s1', start: 0.0,  end: 4.0,  xf:0.00},
  {name:'s2', start: 4.0,  end: 8.0,  xf:0.55},
  {name:'s3', start: 8.0,  end:13.0,  xf:0.50},
  {name:'s4', start:13.0,  end:17.0,  xf:0.00},   // brief: cut to complete black
  {name:'s5', start:17.0,  end:20.0,  xf:0.45},
];

function state(name, lt, gt){
  if(name==='s1'){
    const IGN=0.55;
    let raw=clamp((lt-IGN)/0.50,0,1);
    let g=(1-Math.pow(1-raw,3))*(1+0.24*Math.sin(raw*Math.PI));
    if(lt<IGN) g=0;
    g*=1+0.045*Math.sin(lt*7.3)+0.030*Math.sin(lt*12.9+1.3)+0.02*Math.sin(lt*21.1);
    return {T:lt, GROW:Math.max(0,g), IGN:lt<IGN?0:1,
            FLASH: lt<IGN?0:Math.exp(-(lt-IGN)*8.5), PUSH:0.24+0.15*ss(0,4.0,lt)};
  }
  if(name==='s2'){
    return {T:lt, DOLLY:lt, TILT:0.50+0.14*ss(0,4.0,lt), HAZE:1.0};
  }
  if(name==='s4'){
    // 13.0 black -> 13.3 streak enters -> 13.85 mark lands
    const sw = clamp((lt-0.30)/0.62, 0, 1);
    return {T:lt, SWEEP: -0.78 + 1.56*(sw<1?1-Math.pow(1-sw,2.4):1),
            SWEEPI: lt<0.30 ? 0 : Math.sin(Math.min(sw,1)*Math.PI)*1.0 + (lt>0.92?0.06:0),
            GLOW: ss(0.72,1.45,lt)};
  }
  if(name==='s5'){ return {T:lt, RISE: ss(0,1.1,lt)}; }
  return {T:lt};
}

const MODEL = buildModel();
const SEGBUF = new Float32Array(72*4), PRGBUF = new Float32Array(72*2);
const easeOut = x => 1-Math.pow(1-x,2.2);

function s3Pass(lt, target){
  const k = clamp(lt/5.0, 0, 1);
  const ry = -0.78 + 0.66*easeOut(k) + 0.04*Math.sin(lt*0.5);
  const rx =  0.46 - 0.36*easeOut(k);
  const dist = 5.95 - 1.45*easeOut(k);
  const n = Math.min(MODEL.length, 72);
  for(let i=0;i<n;i++){
    const m = MODEL[i];
    const A = project(m.a, ry, rx, dist, 0.98, 2.15);
    const B = project(m.b, ry, rx, dist, 0.98, 2.15);
    SEGBUF[i*4+0]=A[0]; SEGBUF[i*4+1]=A[1]; SEGBUF[i*4+2]=B[0]; SEGBUF[i*4+3]=B[1];
    let pr = clamp((lt - m.t0)/m.dur, 0, 1);
    pr = pr<=0 ? 0 : easeOut(pr);
    // hot while it is still being drawn, settling once it lands
    let br = pr<=0 ? 0 : (1.35 - 0.45*clamp((lt-m.t0-m.dur)/0.5,0,1));
    br *= clamp(1.50 - (A[2]+B[2])*0.5*0.20, 0.35, 1.25);   // depth falloff
    br *= 1 - 0.75*ss(4.55,5.0,lt);                           // dim into the cut
    PRGBUF[i*2+0]=pr; PRGBUF[i*2+1]=Math.max(0,br);
  }
  eng.pass('s3', target,
    {T:lt, GRID: ss(0,0.9,lt)*(1-ss(4.3,5.0,lt)), CONVERGE: ss(4.45,5.0,lt)},
    {},
    {SEG:{t:'4fv',d:SEGBUF}, SEGP:{t:'2fv',d:PRGBUF}, NSEG:{t:'1i',d:n}});
}

function draw(name, gt, target){
  const sc = SCENES.find(s=>s.name===name);
  const lt = gt - sc.start;
  if(name==='s3'){ s3Pass(lt, target); return; }
  const prog = eng.programs[name] ? name : 's1';     // scenes not yet built
  eng.pass(prog, target, state(prog, lt, gt));
}

function post(t){
  // Scene 2 carries more air, so it blooms a touch harder.
  const s2 = ss(3.9,4.6,t)*(1-ss(7.6,8.2,t));
  return {BLOOM:0.52+0.14*s2, EXPOSURE:1.0, GRAIN:0.032, VIG:0.80, CA:1.0, FADE:1.0};
}

export function renderFrame(t){
  t = clamp(t, 0, DUR-1e-4);
  uiTick(t);
  let i = SCENES.findIndex(s=>t>=s.start && t<s.end);
  if(i<0) i = SCENES.length-1;
  const cur = SCENES[i];
  const k = (cur.xf>0 && i>0) ? clamp((t-cur.start)/cur.xf,0,1) : 1;
  if(k<1){
    draw(SCENES[i-1].name, t, 'a');   // previous scene keeps running under the dissolve
    draw(cur.name,         t, 'b');
    eng.pass('mix','mix',{K:k},{A:'a',B:'b'});
  } else {
    draw(cur.name, t, 'mix');
  }
  const P = post(t);
  eng.pass('bright','br',{THRESH:0.88},{S:'mix'});
  eng.pass('blur','bl1',{DIR:[1,0]},{S:'br'});
  eng.pass('blur','bl2',{DIR:[0,1]},{S:'bl1'});
  eng.pass('blur','q1',{DIR:[2,0]},{S:'bl2'});
  eng.pass('blur','q2',{DIR:[0,2]},{S:'q1'});
  eng.pass('comp', null, Object.assign({T:t},P), {S:'mix',B1:'bl2',B2:'q2'});
  eng.finish();
}
window.renderFrame = renderFrame;
window.SCENES = SCENES;
window.__ready = true;
