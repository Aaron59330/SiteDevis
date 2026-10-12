// Rendu image par image (30 fps) de index.html -> frames/f0000.jpg ...
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-SiteDevis/51b490da-49e2-50e1-8776-f30ed782af69/scratchpad/frames';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + __dirname + '/index.html');
  const FPS = 30, N = 30 * FPS;
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => seek(t), i / FPS);
    await p.screenshot({ path: OUT + '/f' + String(i).padStart(4, '0') + '.jpg', type: 'jpeg', quality: 93 });
    if (i % 60 === 0) console.log('frame', i, '/', N);
  }
  await b.close(); console.log('DONE');
})();
