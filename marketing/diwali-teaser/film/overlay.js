/* The DOM layer: typography and the logo lockup. Kept out of WebGL so the
   mark stays true vector geometry and the type stays crisp at 1080 wide.
   Everything is a pure function of t — no CSS transitions, no rAF, or the
   frames would not be reproducible. */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

const $ = id => document.getElementById(id);
const L1=$('L1'), L2=$('L2'), L3=$('L3');
const LOCK=$('lockup'), TAG=$('tagline');
const DW=$('diwali'), DW1=$('dw1'), DW2=$('dw2'), DW3=$('dw3');
const SCRIM=$('scrim');

/* A line of copy: fades up, drifts up a little, and lets its tracking
   settle inward — the move that reads as "considered" rather than "slid in". */
function line(el, t, tIn, tOut, baseLS){
  const i = ss(tIn, tIn+0.85, t);
  const o = tOut==null ? 0 : ss(tOut, tOut+0.60, t);
  const a = i*(1-o);
  el.style.opacity = a.toFixed(4);
  const y = (1-i)*20 - o*14;
  el.style.transform = `translateY(${y.toFixed(2)}px)`;
  const ls = baseLS + (1-i)*0.055;
  el.style.letterSpacing = ls.toFixed(4)+'em';
  el.style.textIndent = (ls/2).toFixed(4)+'em';
}

/* Scene 4's reveal. The mask edge is driven by the same curve as the GL
   streak, so the mark is uncovered by the light rather than merely at the
   same time as it. */
const SW_T0 = 0.30, SW_DUR = 0.62;
export function sweepX(lt){
  const sw = clamp((lt-SW_T0)/SW_DUR, 0, 1);
  return -0.78 + 1.56*(1-Math.pow(1-sw, 2.4));
}

export function tick(t){
  // the scrim only exists while there is copy over picture
  SCRIM.style.opacity = (ss(0.95,1.75,t)*(1-ss(12.35,12.95,t))*0.92).toFixed(4);
  line(L1, t, 1.45, 3.40, 0.30);
  line(L2, t, 4.80, 7.40, 0.30);
  line(L3, t, 9.15, 12.30, 0.26);

  // --- lockup -------------------------------------------------------
  const lt = t - 13.0;
  if(t < 13.0 + SW_T0 || t > 17.25){
    LOCK.style.opacity = '0';
  } else {
    const out = ss(16.62, 17.10, t);
    LOCK.style.opacity = (1-out).toFixed(4);
    const pct = (sweepX(lt) + 0.5) * 100;
    const m = `linear-gradient(90deg, #000 0 ${pct.toFixed(2)}%, rgba(0,0,0,0) ${(pct+4.5).toFixed(2)}% 100%)`;
    LOCK.style.webkitMaskImage = m;
    LOCK.style.maskImage = m;
    const s = 1 + 0.030*(1 - ss(0.30, 1.40, lt));
    LOCK.style.transform = `translateY(-50%) scale(${s.toFixed(4)})`;
  }
  const tagI = ss(14.15, 15.00, t) * (1 - ss(16.55, 17.05, t));
  TAG.style.opacity = tagI.toFixed(4);
  TAG.style.transform = `translateY(${((1-ss(14.15,15.0,t))*14).toFixed(2)}px)`;

  // --- diwali -------------------------------------------------------
  const d1 = ss(17.50, 18.35, t);
  DW1.style.opacity = d1.toFixed(4);
  DW1.style.transform = `translateY(${((1-d1)*18).toFixed(2)}px)`;
  const d2 = ss(18.05, 18.90, t);
  DW2.style.opacity = d2.toFixed(4);
  DW2.style.transform = `translateY(${((1-d2)*14).toFixed(2)}px)`;
  const d3 = ss(18.70, 19.55, t);
  DW3.style.opacity = d3.toFixed(4);
  DW3.style.transform = `translateY(${((1-d3)*12).toFixed(2)}px)`;
  DW.style.opacity = (t < 17.2 ? 0 : 1).toFixed(0);
}
