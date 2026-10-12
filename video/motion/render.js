const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp/mo/frames', FPS = 30, LEN = +(process.env.LEN || 90);
const ONLY = process.env.AT ? process.env.AT.split(',').map(Number) : null;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///tmp/mo/motion.html'); await p.waitForTimeout(1200);
  const DUR = await p.evaluate(() => window.DUR), k = DUR / LEN;
  console.log('DUR', DUR, 'facteur', k.toFixed(3), errs);
  const cues = await p.evaluate(() => window.CUES);
  const sc = v => Array.isArray(v) ? v.map(x => +(x / k).toFixed(3)) : +(v / k).toFixed(3);
  const out = {}; for (const key in cues) out[key] = cues[key].map(sc); out.duration = LEN;
  fs.writeFileSync('/tmp/mo/cues.json', JSON.stringify(out));
  const frames = ONLY ? ONLY.map(s => Math.round(s * FPS)) : [...Array(LEN * FPS).keys()];
  const t0 = Date.now();
  for (const i of frames) {
    await p.evaluate(t => window.render(t), i / FPS * k);
    await p.screenshot({ path: `${OUT}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 300 === 0) console.log('frame', i, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  console.log('fini', errs); await b.close();
})();
