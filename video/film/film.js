/* Film de présentation OptiDevis : on pilote le VRAI site avec Playwright et on filme l'écran (Page.screencast) image par image.
   Usage :  node film.js prep   -> prépare le compte de démonstration
            node film.js rec    -> enregistre dans OUT (frames + timeline.json)
   Variables : BASE (http://localhost:3101), OUT (dossier de sortie), EMAIL, PASS */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:3101';
const OUT = process.env.OUT || '/tmp/film';
const EMAIL = process.env.EMAIL || 'contact@atelier-martin.fr', PASS = process.env.PASS || 'Passw0rd-Demo1';
const FX = fs.readFileSync(path.join(__dirname, 'fx.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const launch = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
async function login(page) {
  await page.goto(BASE + '/'); await page.waitForSelector('form[data-form=login]');
  await page.fill('[name=email]', EMAIL); await page.fill('[name=password]', PASS); await page.click('form[data-form=login] button'); await page.waitForSelector('#topbar:not([hidden])');
}

/* ---------- Compte de démonstration ---------- */
async function prep() {
  const b = await launch(), page = await (await b.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  await login(page);
  await page.evaluate(() => {
    const id = () => Math.random().toString(36).slice(2, 10);
    const sup = { id: 'sup1', name: 'Point.P', contact: '', phone: '', email: '', address: '', website: '', account: '', notes: '', markup: 25 };
    const cat = (ref, desc, cat, unit, cost, price, vat) => ({ id: id(), type: 'prestation', ref, desc, cat, unit, cost, price, vat, fav: false });
    const raw = {
      company: { name: 'ATELIER MARTIN RÉNOVATION', legalLine: 'JEAN MARTIN – ENTREPRENEUR INDIVIDUEL (EI)', address: '12 rue des Lilas\n59000 LILLE', phone: '+33 6 12 34 56 78', email: 'contact@atelier-martin.fr', siret: '123 456 789 00012', vatNumber: '', bank: 'Coordonnées bancaires : Crédit Agricole\nIBAN : FR76 1670 6050 7254 0198 3411 836\nBIC/SWIFT : AGRIFRPP867', logo: '', vatExempt: true, accent: '#263238' },
      settings: { useSites: true, defaultVat: 0, defaultPayments: '30 | Acompte à la commande\n70 | Solde à la fin des travaux' },
      clients: [
        { id: 'c1', type: 'particulier', civ: 'M', firstName: 'Paul', lastName: 'DUPONT', name: 'M Paul DUPONT', address: '8 rue de la Gare\n59100 ROUBAIX', email: 'paul.dupont@exemple.fr', phone: '+33 6 11 22 33 44' },
        { id: 'c2', type: 'pro', name: 'SCI LES TILLEULS', siret: '823 456 789 00019', address: '25 avenue Foch\n59000 LILLE', contact: 'Claire LAMBERT', email: 'contact@sci-tilleuls.fr', phone: '+33 3 20 00 00 00', vatNumber: '' }
      ],
      suppliers: [sup],
      catalog: [
        cat('CLOI-1', 'Cloison de distribution BA13 sur ossature métallique', 'Plâtrerie', 'm²', 14, 28, 0),
        cat('DO', 'Doublage sur optima, traitement des bandes à joints', 'Plâtrerie', 'm²', 12, 25, 0),
        cat('PEINT', 'Peinture 2 couches, finition mate', 'Peinture', 'm²', 6, 14, 0),
        cat('PARQ', 'Pose de parquet', 'Sols', 'm²', 2.5, 5, 0)
      ],
      sites: [{ id: 's1', name: 'Rénovation appartement Dupont', ref: 'CH-2026-014', clientId: 'c1', address: '8 rue de la Gare', zip: '59100', city: 'Roubaix', start: '2026-11-03', end: '2026-11-21', plannedHours: 80, team: 'Marc, Julien', status: 'encours', access: 'Digicode 4521, 2e étage', notes: '',
        log: [{ id: 'l1', date: '2026-11-03', hours: 8, who: 'Marc', note: 'Dépose et protections' }, { id: 'l2', date: '2026-11-04', hours: 15, who: 'Marc, Julien', note: 'Ossature et cloisons' }, { id: 'l3', date: '2026-11-05', hours: 14, who: 'Marc, Julien', note: 'Isolation, plaques' }] }],
      quotes: []
    };
    const q = (n, d, title, cid, st, lines) => ({ id: id(), kind: 'devis', number: n, date: d, validUntil: '2026-11-30', clientId: cid, title, status: st, lines: lines.map(([ref, desc, qty, unit, price]) => ({ t: 'item', ref, desc, qty, unit, price, vat: 0 })) });
    raw.quotes = [
      q('DEV-2026-001', '2026-10-02', 'RÉNOVATION APPARTEMENT 8 RUE DE LA GARE', 'c1', 'accepte', [['CLOI-1', 'Cloison de distribution BA13', 30, 'm²', 28], ['DO', 'Doublage sur optima', 60, 'm²', 25]]),
      q('DEV-2026-002', '2026-10-06', 'PEINTURE CAGE D’ESCALIER', 'c2', 'envoye', [['PEINT', 'Peinture 2 couches', 140, 'm²', 14]]),
      q('DEV-2026-003', '2026-10-09', 'POSE DE PARQUET SALON', 'c1', 'brouillon', [['PARQ', 'Pose de parquet', 32, 'm²', 5]])
    ];
    raw.settings.next = 4;
    db = normalize(raw); save();
  });
  await page.waitForTimeout(1500); await page.evaluate(() => push && push()); await page.waitForTimeout(1200);
  await b.close(); console.log('compte de démonstration prêt');
}

/* ---------- Enregistrement ---------- */
async function rec() {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1920 / 1440, acceptDownloads: true });
  await ctx.addInitScript(FX);
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  const frames = []; let wall0 = null;
  cdp.on('Page.screencastFrame', ev => {
    const n = frames.length; frames.push({ ts: ev.metadata.timestamp, wall: Date.now() / 1000 });
    fs.writeFileSync(path.join(OUT, 'f' + String(n).padStart(6, '0') + '.jpg'), Buffer.from(ev.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });
  const cues = { pop: [], click: [], type: [], whoosh: [], chime: [], cash: [], count: [], hit: [], riser: [] }; const wall = () => Date.now() / 1000;
  const cue = (k, a, b2) => (k === 'type' || k === 'count' || k === 'riser' ? cues[k].push([a, b2]) : cues[k].push(wall()));
  let pos = { x: 700, y: 420 };
  const glide = async (x, y, ms = 650) => {
    const sx = pos.x, sy = pos.y, t0 = Date.now();
    for (;;) { const t = Math.min(1, (Date.now() - t0) / ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e); if (t >= 1) break; }
    pos = { x, y };
  };
  const box = async sel => { const l = page.locator(sel).first(); await l.waitFor({ state: 'visible', timeout: 8000 }); await l.scrollIntoViewIfNeeded().catch(() => {}); const bb = await l.boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, w: bb.width, h: bb.height, left: bb.x }; };
  const slow = (n, t0) => { const d = wall() - t0; if (d > 2.2) console.log('   lent', n, d.toFixed(1) + 's'); };
  const press = async (sel, o = {}) => { const _t = wall();
    const p = await box(sel); const x = o.at === 'left' ? p.left + 40 : p.x + (o.dx || 0), y = p.y;
    await glide(x, y, o.ms || 650); await page.evaluate(([x, y]) => window.fxPress(x, y), [x, y]); cue('click'); await sleep(110); await page.mouse.click(x, y); await sleep(o.after ?? 350); slow('press ' + sel, _t);
  };
  const type = async (sel, text, o = {}) => { const _t = wall();
    await press(sel, { at: o.at, ms: o.ms || 500, after: 150 });
    if (o.clear) { await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); }
    const a = wall(); await page.keyboard.type(text, { delay: o.delay || 62 }); cue('type', a, wall()); await sleep(o.after ?? 250); slow('type ' + sel, _t);
  };
  const T0 = wall(); const caption = async (k, t, s) => { console.log(k, (wall() - T0).toFixed(1) + 's'); await page.evaluate(([k, t, s]) => window.fxCap(k, t, s), [k, t, s]); cue('pop'); cue('whoosh'); };
  const capOff = () => page.evaluate(() => window.fxCapHide());
  const ring = (sel, pad) => page.evaluate(([s, p]) => window.fxRing(s, p), [sel, pad || 8]);
  const zoom = (sel, sc, ms = 1100) => page.evaluate(([s, c, m]) => window.fxZoom(s, c, m), [sel, sc, ms]);
  const shot = n => process.env.DEBUG ? page.screenshot({ path: path.join(OUT, '_' + n + '.png') }) : null;

  await page.goto(BASE + '/'); await page.waitForSelector('form[data-form=login]'); await sleep(600);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await page.evaluate(() => { window.fxProgress(60); window.fxCover('intro'); }); cue('hit'); cue('pop');
  await sleep(3600); await page.evaluate(() => window.fxCoverOut('intro')); await sleep(900);

  /* 1 — connexion */
  await caption('01 — Connexion', 'Votre espace, en un clic', 'Comptes sécurisés, vos données sont privées.');
  await type('[name=email]', EMAIL, { delay: 45 }); await type('[name=password]', PASS, { delay: 55 });
  await press('form[data-form=login] button', { after: 200 }); await page.waitForSelector('#topbar:not([hidden])'); await sleep(900); await shot('1-login');

  /* 2 — liste des devis */
  await caption('02 — Vos devis', 'Toute votre activité d’un coup d’œil', 'Statuts, montants, suivi. Facturez en un clic.');
  await sleep(2200); await ring('.stats', 10); await sleep(1200); await shot('2-liste');
  await press('[data-act=new-quote]', { after: 700 });

  /* 3 — le devis */
  await caption('03 — Le devis', 'Complet, modifiable, en direct', 'Votre document se construit pendant que vous saisissez.');
  await type('[data-f=title]', 'RÉNOVATION APPARTEMENT 8 RUE DE LA GARE', { delay: 48 });
  await press('#clientSel', { after: 200 }); await page.selectOption('#clientSel', { label: 'M Paul DUPONT' }); await sleep(900);
  await press('[data-act=catalog-open]', { after: 900 });
  await press('.cp-row:nth-of-type(1) .cp-add', { after: 700 }); await press('.cp-row:nth-of-type(2) .cp-add', { after: 700 });
  await sleep(500); await shot('3-catalogue');
  await press('[data-act=close-modal]', { after: 600 });
  await type('[data-l=qty] >> nth=0', '30', { clear: true, delay: 110, after: 400 }); await type('[data-l=qty] >> nth=1', '60', { clear: true, delay: 110, after: 600 });
  await zoom('#doc .totbox', 1.55, 1000); await ring('#doc .totbox', 10); await sleep(1900); await zoom(null, 1, 900); await sleep(800); await shot('3-devis');
  await type('[data-f=notes]', 'Plafon et pienture 2 couche inclus. Evacuation des gravats comprise.', { delay: 38, after: 700 });

  /* 4 — une facture par paiement */
  await caption('04 — Un paiement, une facture', 'Facturez chaque échéance', 'Acompte, intermédiaire, solde : une facture claire pour chaque paiement.');
  await page.evaluate(() => document.querySelector('#payBody').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(1100);
  await type('#payBody .pay:nth-child(2) [data-p=pct]', '40', { clear: true, delay: 120, after: 300 });
  await type('#payBody .pay:nth-child(2) [data-p=label]', 'paiement intermédiaire', { clear: true, delay: 45, after: 300 });
  await press('[data-act=add-pay]', { after: 500 });
  await type('#payBody .pay:nth-child(3) [data-p=pct]', '30', { clear: true, delay: 120, after: 300 });
  await type('#payBody .pay:nth-child(3) [data-p=label]', 'à réception', { delay: 45, after: 700 });
  await shot('4-echeancier');
  await press('#payBody .pay:nth-child(1) [data-act=pay-invoice]', { after: 1200 }); cue('chime');
  await page.waitForSelector('#doc .dtitle'); await zoom('#doc .totbox', 1.5, 1000); await ring('#doc .totbox', 10); await sleep(2000); await zoom(null, 1, 900); cue('cash'); await sleep(900); await shot('4-facture');

  /* 5 — PDF */
  await caption('05 — PDF en un clic', 'Téléchargez, envoyez', 'Même mise en page à l’écran et sur le PDF.');
  await press('[data-act=pdf]', { after: 1800 }); await shot('5-pdf'); await sleep(900);

  /* 6 — fautes */
  await page.evaluate(() => go('quotes')); await sleep(600); await page.evaluate(() => { const q = db.quotes.find(q => q.number !== 'DEV-2026-001' && q.title.startsWith('RÉNOVATION')); go('editor', q.id); });
  await page.waitForSelector('[data-act=ai-review]'); await sleep(600);
  await caption('06 — Zéro faute', 'Vérifiez avant d’envoyer', 'Le correcteur propose, vous décidez : rien ne change sans votre accord.');
  await press('[data-act=ai-review]', { after: 700 }); await page.evaluate(() => { const c = document.getElementById('aiConsent'); if (c) c.click(); });
  await press('#aiGo', { after: 1500 }); await page.waitForSelector('#aiBody ins', { timeout: 15000 }).catch(() => {}); await sleep(900); await shot('6-fautes');
  await ring('#aiBody .ai-item, #aiBody ins', 12); await sleep(1500);
  await press('[data-act=ai-apply-all]', { after: 1200 }).catch(() => {}); await sleep(900);
  await press('[data-act=close-modal]', { after: 500 }).catch(() => {});

  /* 7 — chantiers */
  await press('[data-view=sites]', { after: 1000 }); await caption('07 — Chantiers', 'Suivez vos chantiers', 'Lieu, dates, heures prévues et réalisées, devis et factures rattachés.');
  await sleep(1300); await press('[data-act=open-site]', { after: 1200 }); await ring('.bar', 14); await sleep(1800); await shot('7-chantier');

  /* 8 — personnalisation */
  await press('[data-view=custom]', { after: 900 }); await caption('08 — À vos couleurs', 'Votre interface, vos couleurs', 'Couleur, mode clair ou sombre, sons, tailles.');
  await press('[data-act=pref][data-k=accent][data-v="#3b82f6"]', { after: 900 }); await press('[data-act=pref][data-k=accent][data-v="#8b5cf6"]', { after: 900 });
  await press('[data-act=pref][data-k=mode][data-v=light]', { after: 1300 }); await press('[data-act=pref][data-k=mode][data-v=dark]', { after: 700 });
  await press('[data-act=pref][data-k=accent][data-v="#e3a04b"]', { after: 1100 }); await shot('8-couleurs');

  /* outro */
  await capOff(); await sleep(400); cue('riser', wall(), wall() + 1.3); await page.evaluate(() => window.fxCover('outro')); await sleep(1400); cue('hit'); cue('chime'); await sleep(3600);

  await cdp.send('Page.stopScreencast'); await sleep(400); await b.close();
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ frames, cues }));
  console.log('frames', frames.length, 'durée', (frames[frames.length - 1].ts - frames[0].ts).toFixed(1), 's');
}
({ prep, rec }[process.argv[2]] || (() => console.log('usage: node film.js prep|rec')))().catch(e => { console.error(e); process.exit(1); });
