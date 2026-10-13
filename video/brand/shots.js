const { chromium } = require('/opt/node-tools/node_modules/playwright');
const A = '/tmp/brand/a/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--hide-scrollbars'] });
  const login = async pg => { await pg.goto('http://localhost:3101/'); await pg.waitForSelector('.ld-login'); await pg.click('.ld-login'); await pg.fill('form[data-form=login] [name=email]', 'contact@atelier-martin.fr'); await pg.fill('form[data-form=login] [name=password]', 'Passw0rd-Demo1'); await pg.click('form[data-form=login] button'); await pg.waitForSelector('#topbar:not([hidden])'); await pg.addStyleTag({ content: '#toasts,.toast{display:none!important}' }); };
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage(); await login(p);
  await p.evaluate(() => go('quotes')); await p.waitForTimeout(900); await p.screenshot({ path: A + 'quotes.png' });
  await p.evaluate(() => go('stats')); await p.waitForTimeout(900); await p.screenshot({ path: A + 'stats.png' });
  await p.evaluate(() => { const q = db.quotes.find(x => x.kind === 'facture' && x.lines.length > 2) || db.quotes.find(x => x.kind === 'facture'); go('editor', q.id); }); await p.waitForTimeout(1200); await p.screenshot({ path: A + 'editor.png' });
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage(); await login(m);
  await m.evaluate(() => go('quotes')); await m.waitForTimeout(900); await m.screenshot({ path: A + 'm-quotes.png' });
  await m.evaluate(() => go('stats')); await m.waitForTimeout(900); await m.screenshot({ path: A + 'm-stats.png' });
  await b.close(); console.log('ok');
})();
