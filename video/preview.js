const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
const p = await b.newPage({viewport:{width:1920,height:1080}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/SiteDevis/video/index.html');
for (const t of [1.6,5.4,6.9,10.8,14.9,18.2,22.7,26.8,29.2]) { await p.evaluate(t=>seek(t),t); await p.screenshot({path:'/tmp/claude-0/-home-user-SiteDevis/51b490da-49e2-50e1-8776-f30ed782af69/scratchpad/v_'+t+'.png'}); }
console.log(errs); await b.close();})();
