const {chromium} = require('/usr/local/lib/node_modules/playwright');
const ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--hide-scrollbars','--force-device-scale-factor=1','--allow-file-access-from-files',
  '--disable-web-security','--font-render-hinting=none'];
(async()=>{
  const times = process.argv[2].split(',').map(Number);
  const out = process.argv[3] || '/tmp/pv';
  const b = await chromium.launch({args:ARGS});
  const pg = await b.newPage({viewport:{width:1080,height:1920}, deviceScaleFactor:1});
  const errs=[];
  pg.on('pageerror', e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  await pg.goto('file:///home/user/quoin/film/index.html', {waitUntil:'load'});
  try { await pg.waitForFunction('window.__ready===true', {timeout:20000}); }
  catch(e){ console.log(errs.join('\n')||'no error captured'); await b.close(); process.exit(1); }
  await pg.evaluate(()=>document.fonts.ready);
  for(const t of times){
    await pg.evaluate(t=>window.renderFrame(t), t);
    await pg.screenshot({path:`${out}_${t.toFixed(2)}.png`, clip:{x:0,y:0,width:1080,height:1920}});
  }
  if(errs.length) console.log(errs.join('\n'));
  console.log('rendered', times.length);
  await b.close();
})().catch(e=>{console.log('ERR', e.message); process.exit(1);});
