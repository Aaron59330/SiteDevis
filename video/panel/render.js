const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp/panel/frames', FPS = 30;
const ONLY = process.env.AT ? process.env.AT.split(',').map(Number) : null;
const SEG = JSON.parse(fs.readFileSync('/tmp/panel/segs.json', 'utf8'));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(s => { window.SEG = s; }, SEG);
  await p.goto('file:///tmp/panel/panel.html');
  await p.waitForFunction(() => document.getElementById('v').readyState >= 2, null, { timeout: 30000 });
  const DUR = await p.evaluate(() => window.DUR); console.log('DUR', DUR, errs);
  const cues = await p.evaluate(() => window.CUES); cues.duration = DUR;
  const S = await p.evaluate(() => window.S.map(s => ({ k: s.k, a: s.a, d: s.d })));
  const raw = JSON.parse(fs.readFileSync('/tmp/panel/rawcues.json', 'utf8')); cues.hover = [];
  const map = r => { for (let i = 1; i < S.length - 1; i++) { const s = S[i], s0 = SEG[s.k], s1 = SEG[S[i + 1].k] || SEG.end, rate = (s1 - s0 - .1) / s.d; if (r >= s0 && r < s1) { const t = s.a + (r - s0) / rate; return t < s.a + s.d - .05 ? +t.toFixed(3) : null; } } return null; };
  raw.clicks.map(map).filter(x => x != null).forEach(t => cues.click.push(t)); raw.hovers.map(map).filter(x => x != null).forEach(t => cues.hover.push(t)); fs.writeFileSync('/tmp/panel/cues.json', JSON.stringify(cues));
  const frames = ONLY ? ONLY.map(s => Math.round(s * FPS)) : [...Array(Math.round(DUR * FPS)).keys()];
  const t0 = Date.now();
  for (const i of frames) {
    await p.evaluate(t => window.frame(t), i / FPS);
    await p.screenshot({ path: `${OUT}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 300 === 0) console.log('image', i, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  console.log('fini', errs); await b.close();
})();
