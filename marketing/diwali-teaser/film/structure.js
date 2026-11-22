/* The thing Scene 3 draws: a frame that assembles itself, and then the
   quoin stone forming on its corner. Coordinates are metres-ish; y is up
   and the model is centred on the origin in plan. */
const R = 1.15, H = 4.20;
const CORNERS = [[-R,-R],[R,-R],[R,R],[-R,R]];

function boxEdges(x0,y0,z0, x1,y1,z1){
  const v = [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],
             [x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  const e = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  return e.map(([i,j])=>[v[i], v[j]]);
}

export function buildModel(){
  const S = [];
  const add=(a,b,t0,dur)=>S.push({a,b,t0,dur});
  // 1. the ground grid — the site, before anything stands on it
  const N=7;
  for(let i=0;i<N;i++){
    const u = -R + 2*R*i/(N-1);
    add([u,0,-R],[u,0,R], 0.00 + i*0.055, 0.42);
    add([-R,0,u],[R,0,u], 0.03 + i*0.055, 0.42);
  }
  // 2. columns
  CORNERS.forEach((c,i)=> add([c[0],0,c[1]],[c[0],H,c[1]], 1.05 + i*0.13, 0.52));
  // 3. floor plates
  [1.05,2.10,3.15,H].forEach((y,fi)=>{
    for(let i=0;i<4;i++){
      const a=CORNERS[i], b=CORNERS[(i+1)%4];
      add([a[0],y,a[1]],[b[0],y,b[1]], 1.70 + fi*0.30 + i*0.065, 0.38);
    }
  });
  // 4. bracing — the diagonals that make a frame rigid
  add([-R,0,-R],[ R,1.05,-R], 2.90,0.42);
  add([ R,1.05,R],[-R,2.10,R], 3.04,0.42);
  add([-R,2.10,-R],[-R,3.15,R], 3.18,0.42);
  // 5. the quoin stone, cut into the corner
  const q=0.85;
  boxEdges(R-q,0,R-q, R,q,R).forEach((e,i)=> add(e[0],e[1], 3.55 + i*0.050, 0.34));
  return S;
}

/* Perspective projection into the shader's uv space
   (x in [-.5,.5], y in [-.889,.889]). */
export function project(p, ry, rx, dist, fov, cy){
  let [x,y,z] = p;
  y -= cy;
  const c1=Math.cos(ry), s1=Math.sin(ry);
  const X = x*c1 + z*s1, Z1 = -x*s1 + z*c1;
  const c2=Math.cos(rx), s2=Math.sin(rx);
  const Y = y*c2 - Z1*s2, Z = y*s2 + Z1*c2 + dist;
  const s = fov / Math.max(Z, 0.15);
  return [X*s, Y*s, Z];
}
