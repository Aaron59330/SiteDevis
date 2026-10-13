const { chromium } = require('/opt/node-tools/node_modules/playwright');
const OUT = '/home/user/SiteDevis/public/media/brand/';
const F = [['banniere-linkedin', 1584, 396, 'wide', 1], ['couverture-facebook', 1640, 624, 'wide', 1], ['banniere-x-twitter', 1500, 500, 'wide', 1], ['banniere-youtube', 2560, 1440, 'yt', 1],
  ['image-partage', 1200, 630, 'wide', 1], ['post-instagram', 1080, 1080, 'square', 1], ['story-instagram', 1080, 1920, 'square', 1], ['signature-email', 600, 160, 'sig', 2]];
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  for (const [n, w, h, mode, s] of F) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: s });
    await p.goto(`file:///tmp/brand/banner.html?w=${w}&h=${h}&mode=${mode}`); await p.evaluate(() => window.ready); await p.waitForTimeout(300);
    await p.locator('#b').screenshot({ path: OUT + n + '.png' }); console.log(n); await p.close();
  }
  await b.close();
})();
