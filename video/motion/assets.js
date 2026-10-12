const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = 'http://localhost:3101', A = '/tmp/mo/a/';
const EMAIL = 'contact@atelier-martin.fr', PASS = 'Passw0rd-Demo1';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--hide-scrollbars'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const login = async pg => { await pg.goto(BASE + '/'); await pg.waitForSelector('.ld-login'); await pg.click('.ld-login'); await pg.fill('form[data-form=login] [name=email]', EMAIL); await pg.fill('form[data-form=login] [name=password]', PASS); await pg.click('form[data-form=login] button'); await pg.waitForSelector('#topbar:not([hidden])'); };
  await login(p);
  await p.evaluate(() => savePrefs({ mode: 'light' })); await p.waitForTimeout(800);
  const shot = async (n, o = {}) => { await p.waitForTimeout(o.wait || 700); await p.screenshot({ path: A + n + '.png', ...(o.clip ? { clip: o.clip } : {}) }); console.log(n); };
  const el = async (n, sel) => { await p.waitForTimeout(600); await p.locator(sel).first().screenshot({ path: A + n + '.png' }); console.log(n); };
  await p.evaluate(() => go('quotes')); await shot('quotes');
  await p.click('[data-act=tpl-open]'); await p.waitForSelector('.tpl-card'); await el('tpl-grid', '#tplBox');
  const cards = await p.$$('.tpl-card'); for (let i = 0; i < 8; i++) { await cards[i].screenshot({ path: A + 'card' + i + '.png' }); }
  await p.click('.tpl-card[data-id=plaquiste]'); await p.waitForSelector('[data-act=tpl-use]'); await el('tpl-preview', '#tplBox');
  await p.click('[data-act=tpl-use]'); await p.waitForSelector('#doc');
  await p.selectOption('#clientSel', { label: 'M Paul DUPONT' }); await p.waitForTimeout(500);
  await p.waitForTimeout(4500); await shot('editor'); await el('doc', '#doc');
  await el('totbox', '#doc .totbox');
  await p.evaluate(() => document.querySelector('#payBody').scrollIntoView({ block: 'center' })); await el('pay', '#payBody');
  await p.click('#payBody .pay:nth-child(1) [data-act=pay-invoice]'); await p.waitForSelector('#doc .dtitle'); await p.waitForTimeout(600); await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(4500); await shot('invoice'); await el('invdoc', '#doc');
  await p.click('[data-act=send-mail]'); await p.waitForSelector('#mailForm'); await el('mail', '#mailForm'); await p.click('[data-act=close-modal]');
  await p.evaluate(() => go('stats')); await p.waitForSelector('.chart'); await shot('stats'); await el('chart', '.chart'); await el('statcards', '.stats');
  await p.evaluate(() => go('sites')); await p.waitForTimeout(600); await p.click('[data-act=open-site]'); await shot('site');
  await p.evaluate(() => go('catalog')); await shot('catalog');
  await p.evaluate(() => go('custom')); await shot('custom');
  await p.evaluate(() => go('quotes')); await p.click('[data-act=import-pdf]'); await p.click('[data-act=imp-photo]'); await p.setInputFiles('#phPick', '/home/user/SiteDevis/video/film/devis-manuscrit.jpg'); await p.waitForSelector('.ph-item'); await p.click('#phGo'); await p.waitForSelector('#impLines', { timeout: 20000 }); await el('import', '#impBox');
  await p.click('[data-act=close-modal]');
  // mobile
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  await login(m); await m.waitForTimeout(800);
  const ms = async n => { await m.waitForTimeout(900); await m.screenshot({ path: A + n + '.png' }); console.log(n); };
  await m.evaluate(() => go('quotes')); await ms('m-quotes');
  await m.evaluate(() => go('stats')); await ms('m-stats');
  await m.evaluate(() => { const q = db.quotes.find(x => x.kind === 'facture' && x.number === 'FAC-2026-001') || db.quotes.find(x => x.kind === 'facture'); go('editor', q.id); }); await m.waitForTimeout(600);
  await m.evaluate(() => { const b = document.querySelector('.pane-switch [data-pane=doc]'); if (b) b.click(); }); await ms('m-doc');
  await m.evaluate(() => go('sites')); await ms('m-sites');
  // page d'accueil (clair)
  const l = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })).newPage();
  await l.goto(BASE + '/'); await l.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); await l.waitForTimeout(1500); await l.screenshot({ path: A + 'landing.png' }); console.log('landing');
  await p.evaluate(() => savePrefs(Object.assign({}, PREF_DEFAULTS))); await p.waitForTimeout(800);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
