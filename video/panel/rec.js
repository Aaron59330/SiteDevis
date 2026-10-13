/* Enregistre le VRAI site (thème sombre d'origine) scène par scène pour le film « panel ».
   Sortie : OUT/f*.jpg + OUT/timeline.json (horodatage des images et début de chaque scène). */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:3101', OUT = process.env.OUT || '/tmp/panel/raw';
const EMAIL = 'contact@atelier-martin.fr', PASS = 'Passw0rd-Demo1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CURSOR = `(() => { const boot = () => { if (window.__cur) return; window.__cur = 1;
  const c = document.createElement('div'); c.id = 'pcur'; c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2.5l15.5 8.2-6.6 1.9-2.6 6.6z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5));transition:transform .08s;opacity:0';
  document.documentElement.appendChild(c);
  document.addEventListener('mousemove', e => { c.style.opacity = 1; c.style.left = (e.clientX - 5) + 'px'; c.style.top = (e.clientY - 3) + 'px'; }, true);
  window.pPress = () => { c.style.transform = 'scale(.82)'; setTimeout(() => c.style.transform = '', 150); };
  const st = document.createElement('style'); st.textContent = '#toasts,.toast{display:none!important}'; document.documentElement.appendChild(st); };
  if (document.documentElement) boot(); else document.addEventListener('readystatechange', boot, { once: true }); })();`;
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--hide-scrollbars'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 / 3 });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  // connexion (hors film)
  await page.goto(BASE + '/'); await page.waitForSelector('.ld-login'); await page.click('.ld-login');
  await page.fill('form[data-form=login] [name=email]', EMAIL); await page.fill('form[data-form=login] [name=password]', PASS); await page.click('form[data-form=login] button'); await page.waitForSelector('#topbar:not([hidden])');
  await page.evaluate(() => { savePrefs(Object.assign({}, PREF_DEFAULTS, { sound: 'off' })); go('quotes'); scrollTo(0, 0); }); await sleep(1500);
  const frames = []; const marks = []; const clicks = [], hovers = [];
  cdp.on('Page.screencastFrame', ev => { const n = frames.length; frames.push(ev.metadata.timestamp); fs.writeFileSync(path.join(OUT, 'f' + String(n).padStart(6, '0') + '.jpg'), Buffer.from(ev.data, 'base64')); cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}); });
  let pos = { x: 1200, y: 700 };
  const glide = async (x, y, ms = 600) => { const sx = pos.x, sy = pos.y, t0 = Date.now(); for (;;) { const t = Math.min(1, (Date.now() - t0) / ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e); if (t >= 1) break; } pos = { x, y }; };
  const box = async sel => { const l = page.locator(sel).first(); await l.waitFor({ state: 'visible', timeout: 10000 }); await l.scrollIntoViewIfNeeded().catch(() => {}); const bb = await l.boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
  const hover = async (sel, ms = 420, w = 220) => { const p = await box(sel); await glide(p.x, p.y, ms); hovers.push(Date.now() / 1000); await sleep(w); };
  const press = async (sel, o = {}) => { const p = await box(sel); await glide(p.x, p.y, o.ms || 600); await page.evaluate(() => window.pPress()); clicks.push(Date.now() / 1000); await sleep(90); await page.mouse.click(p.x, p.y); await sleep(o.after ?? 500); };
  const type = async (sel, text, o = {}) => { await press(sel, { after: 120 }); if (o.clear) { await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); } await page.keyboard.type(text, { delay: o.delay || 70 }); await sleep(o.after ?? 300); };
  const mark = n => { marks.push({ name: n, ts: Date.now() / 1000 }); console.log(n); };
  const nav = n => `#nav button:nth-child(${n})`;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1920, maxHeight: 1200, everyNthFrame: 1 });
  await sleep(600); await page.mouse.move(pos.x, pos.y);

  mark('s1'); // liste des devis + les menus qui bougent
  await sleep(500); for (const n of [2, 3, 4, 5, 6, 7]) await hover(nav(n), 330, 160); await hover(nav(1), 500, 400); await hover('.stats .stat:nth-child(2)', 600, 500); await hover('#qtable tbody tr:nth-child(2), table.list tbody tr:nth-child(2)', 500, 700);
  mark('s2'); // modèles par métier
  await press('[data-act=tpl-open]', { after: 700 }); for (const id of ['couvreur', 'plombier', 'electricien']) await hover(`.tpl-card[data-id=${id}]`, 380, 150); await press('.tpl-card[data-id=plaquiste]', { after: 1200 }); await press('[data-act=tpl-use]', { after: 1000 });
  mark('s3'); // le devis en direct
  await press('#clientSel', { after: 150 }); await page.selectOption('#clientSel', { label: 'M Paul DUPONT' }); await sleep(600);
  await type('[data-l=qty] >> nth=0', '42', { clear: true, delay: 140, after: 300 }); await type('[data-l=qty] >> nth=1', '58', { clear: true, delay: 140, after: 400 }); await hover('#doc .totbox', 700, 900);
  mark('s4'); // facture d'échéance
  await page.evaluate(() => document.querySelector('#payBody').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(900);
  await press('#payBody .pay:nth-child(1) [data-act=pay-invoice]', { after: 1400 }); await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })); await sleep(900); await hover('#doc .totbox', 700, 700);
  mark('s5'); // envoi par email
  await press('[data-act=send-mail]', { after: 900 }); await hover('#mailForm [name=message]', 500, 500); await press('#mailGo', { after: 300 }); await page.waitForFunction(() => !document.getElementById('modal').open, null, { timeout: 15000 }); await sleep(900);
  mark('s6'); // photo -> devis
  await press(nav(1), { after: 700 }); await press('[data-act=import-pdf]', { after: 700 }); await press('[data-act=imp-photo]', { after: 600 });
  await page.setInputFiles('#phPick', path.join(__dirname, '..', 'film', 'devis-manuscrit.jpg')); await page.waitForSelector('.ph-item'); await sleep(700);
  await press('#phGo', { after: 200 }); await page.waitForSelector('#impLines', { timeout: 20000 }); await sleep(600); await hover('#impLines', 600, 900); await press('[data-act=imp-create]', { after: 1200 });
  mark('s7'); // statistiques
  await press(nav(3), { after: 1000 }); await hover('.stats .stat:nth-child(1)', 500, 300); await hover('.stats .stat:nth-child(3)', 500, 300); await page.evaluate(() => document.querySelector('.chart').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(900); await hover('.chart', 600, 900);
  mark('s8'); // chantiers
  await press(nav(4), { after: 900 }); await press('[data-act=open-site]', { after: 1100 }); await hover('.stats', 600, 600); await page.evaluate(() => scrollTo({ top: 360, behavior: 'smooth' })); await sleep(1100);
  mark('s9'); // catalogue
  await press(nav(6), { after: 900 }); for (const n of [2, 3, 4]) await hover(`.cchip:nth-child(${n})`, 350, 150); await press('.cchip:nth-child(3)', { after: 700 }); await press('.cchip:nth-child(1)', { after: 600 }); await press('.tabs button:nth-child(2)', { after: 900 }); await press('.tabs button:nth-child(1)', { after: 600 });
  mark('s10'); // personnalisation
  await press(nav(9), { after: 900 }); await press('[data-act=pref][data-k=mode][data-v=light]', { after: 1200 }); await press('[data-act=pref][data-k=mode][data-v=dark]', { after: 900 }); await hover('[data-k=hover][data-v=on]', 600, 600);
  mark('s11'); // tour rapide de toutes les rubriques
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) await press(nav(n), { ms: 300, after: 520 });
  await press(nav(1), { ms: 400, after: 800 });
  mark('end');
  await cdp.send('Page.stopScreencast'); await sleep(300);
  await page.evaluate(() => savePrefs(Object.assign({}, PREF_DEFAULTS))); await sleep(600);
  await b.close();
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ frames, marks, clicks, hovers }));
  console.log('images', frames.length, 'durée', (frames[frames.length - 1] - frames[0]).toFixed(1));
})().catch(e => { console.error(e); process.exit(1); });
