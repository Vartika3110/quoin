/* Renders the whole film to a PNG sequence. One browser, one page, frames
   driven by explicit time — nothing here reads a clock, so the sequence is
   reproducible and the transitions land on exact frames. */
const {chromium} = require('/usr/local/lib/node_modules/playwright');
const fs = require('fs');
const FPS = 30, DUR = 20.0, N = Math.round(FPS*DUR);
const OUT = '/home/user/quoin/frames';
const ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--hide-scrollbars','--force-device-scale-factor=1','--allow-file-access-from-files',
  '--disable-web-security','--font-render-hinting=none'];
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const b = await chromium.launch({args:ARGS});
  const pg = await b.newPage({viewport:{width:1080,height:1920}, deviceScaleFactor:1});
  const errs=[];
  pg.on('pageerror', e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto('file:///home/user/quoin/film/index.html', {waitUntil:'load'});
  await pg.waitForFunction('window.__ready===true', {timeout:20000});
  await pg.evaluate(()=>document.fonts.ready);
  const t0=Date.now();
  for(let i=0;i<N;i++){
    const fp=`${OUT}/f${String(i).padStart(5,"0")}.png`;
    if(fs.existsSync(fp) && fs.statSync(fp).size>2000) continue;
    const t = i/FPS;
    await pg.evaluate(t=>window.renderFrame(t), t);
    await pg.screenshot({path:`${OUT}/f${String(i).padStart(5,'0')}.png`,
                         clip:{x:0,y:0,width:1080,height:1920}});
    if(i%30===0){
      const el=(Date.now()-t0)/1000;
      console.log(`${i}/${N}  ${el.toFixed(0)}s  eta ${(el/Math.max(i,1)*(N-i)).toFixed(0)}s`);
    }
  }
  if(errs.length) console.log('ERRORS:', errs.slice(0,5).join(' | '));
  console.log('DONE', N, 'frames in', ((Date.now()-t0)/1000).toFixed(0),'s');
  await b.close();
})().catch(e=>{console.log('ERR',e.message); process.exit(1);});
