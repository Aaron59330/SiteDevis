/* Film de présentation OptiDevis : on pilote le VRAI site avec Playwright et on filme l'écran (Page.screencast) image par image.
   Usage :  node film.js prep   -> prépare le compte de démonstration
            node film.js rec    -> enregistre dans OUT (frames + timeline.json)
   Serveur : PORT=3101 DATA_DIR=… node server.js (services simulés).
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
  await page.goto(BASE + '/'); await page.waitForSelector('.ld-login'); await page.click('.ld-login'); await page.waitForSelector('form[data-form=login]');
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
    const inv = (n, d, st, paid, cid, price) => ({ id: id(), kind: 'facture', number: n, date: d, dueDate: d, paidAt: paid, clientId: cid, title: 'Facture', status: st, lines: [{ t: 'item', ref: '', desc: 'Travaux', qty: 1, unit: 'forfait', price, vat: 0 }] });
    const back = n => { const dt = new Date(); dt.setMonth(dt.getMonth() - n, 12); return dt.toISOString().slice(0, 10); };
    [[1, 3200, 'payee'], [1, 1800, 'payee'], [2, 2600, 'payee'], [2, 900, 'envoye'], [3, 2100, 'payee'], [4, 3900, 'payee'], [4, 1200, 'payee'], [5, 1500, 'payee']].forEach(([n, p, st], i) => raw.quotes.push(inv('FAC-2026-0' + (10 + i), back(n), st, st === 'payee' ? back(n) : '', i % 2 ? 'c2' : 'c1', p)));
    [[1, 5400, 'accepte'], [1, 2100, 'accepte'], [2, 3300, 'accepte'], [3, 2600, 'accepte'], [4, 5200, 'accepte'], [5, 1700, 'envoye']].forEach(([n, p, st], i) => raw.quotes.push(q('DEV-2026-0' + (20 + i), back(n), 'CHANTIER ' + (i + 1), i % 2 ? 'c2' : 'c1', st, [['', 'Travaux', 1, 'forfait', p]])));
    const cur = (add) => { const dt = new Date(); dt.setDate(Math.max(1, dt.getDate() - add)); return dt.toISOString().slice(0, 10); };
    raw.quotes.push(inv('FAC-2026-030', cur(3), 'payee', cur(1), 'c1', 4200), inv('FAC-2026-031', cur(2), 'envoye', '', 'c2', 2750), inv('FAC-2026-032', cur(1), 'payee', cur(0), 'c1', 1800));
    raw.quotes.forEach(x => { if (x.number === 'DEV-2026-001') { x.siteId = 's1'; } if (x.number === 'FAC-2026-030' || x.number === 'FAC-2026-032') x.siteId = 's1'; });
    raw.quotes.find(x => x.number === 'DEV-2026-001').date = cur(5);
    raw.settings.next = 4;
    db = normalize(raw); save();
  });
  await page.evaluate(() => savePrefs(Object.assign({}, PREF_DEFAULTS)));
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
  const cues = { pop: [], click: [], type: [], whoosh: [], chime: [], cash: [], count: [], hit: [], riser: [], hover: [] }; const wall = () => Date.now() / 1000;
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
  const marks = []; const T0 = wall(); const caption = async (k, t, s) => { marks.push({ name: k, wall: wall() }); console.log(k, (wall() - T0).toFixed(1) + 's'); await page.evaluate(([k, t, s]) => window.fxCap(k, t, s), [k, t, s]); cue('pop'); cue('whoosh'); };
  const capOff = () => page.evaluate(() => window.fxCapHide());
  const ring = (sel, pad) => page.evaluate(([s, p]) => window.fxRing(s, p), [sel, pad || 8]);
  const zoom = (sel, sc, ms = 1100) => page.evaluate(([s, c, m]) => window.fxZoom(s, c, m), [sel, sc, ms]);
  const shot = n => process.env.DEBUG ? page.screenshot({ path: path.join(OUT, '_' + n + '.png') }) : null;

  const hover = async (sel, ms = 520, wait = 260) => { const p = await box(sel); await glide(p.x, p.y, ms); cue('hover'); await sleep(wait); };
  const scrollTo = (y, ms = 1200) => page.evaluate(([y]) => window.scrollTo({ top: y, behavior: 'smooth' }), [y]).then(() => sleep(ms));

  await page.goto(BASE + '/'); await page.waitForSelector('.ld-login'); await sleep(800);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 2 });
  await page.evaluate(() => { window.fxProgress(92); window.fxCover('intro'); }); cue('hit'); cue('pop');
  await sleep(3600); await page.evaluate(() => window.fxCoverOut('intro')); await sleep(900);

  /* 1 — page d'accueil et connexion */
  await caption('01 — Bienvenue', 'Des devis qui font signer', 'Une page claire : fonctionnalités, métiers, questions fréquentes.');
  await hover('.ld-links a:nth-child(1)'); await hover('.ld-links a:nth-child(2)'); await hover('.ld-links a:nth-child(3)', 520, 500);
  await scrollTo(860, 1500); await scrollTo(1700, 1500); await scrollTo(0, 1300); await shot('1-accueil');
  await press('.ld-login', { after: 700 });
  await type('form[data-form=login] [name=email]', EMAIL, { delay: 40 }); await type('form[data-form=login] [name=password]', PASS, { delay: 50 });
  await press('form[data-form=login] button', { after: 200 }); await page.waitForSelector('#topbar:not([hidden])'); await sleep(900);

  /* 2 — modèles par métier */
  await caption('02 — Pour tous les métiers', 'Un devis de départ en un clic', 'Couvreur, plaquiste, plombier, électricien… 17 métiers prêts à adapter.');
  await hover('#nav button:nth-child(2)'); await hover('#nav button:nth-child(1)'); await ring('.stats', 10); await sleep(900);
  await press('[data-act=tpl-open]', { after: 900 });
  await hover('.tpl-card[data-id=couvreur]', 420, 180); await hover('.tpl-card[data-id=electricien]', 420, 180); await hover('.tpl-card[data-id=peintre]', 420, 180); await hover('.tpl-card[data-id=plaquiste]', 420, 300);
  await press('.tpl-card[data-id=plaquiste]', { after: 1300 }); await shot('2-modele');
  await press('[data-act=tpl-use]', { after: 1100 });

  /* 3 — le devis */
  await caption('03 — Le devis', 'Complet, modifiable, en direct', 'Le document se construit pendant que vous saisissez.');
  await press('#clientSel', { after: 200 }); await page.selectOption('#clientSel', { label: 'M Paul DUPONT' }); await sleep(800);
  await type('[data-l=qty] >> nth=0', '42', { clear: true, delay: 120, after: 400 }); await type('[data-l=qty] >> nth=1', '58', { clear: true, delay: 120, after: 500 });
  await zoom('#doc .totbox', 1.5, 1000); await ring('#doc .totbox', 10); await sleep(1700); await zoom(null, 1, 900); await sleep(600); await shot('3-devis');

  /* 4 — une facture par paiement */
  await caption('04 — Un paiement, une facture', 'Facturez chaque échéance', 'Acompte, situation, solde : chaque facture est reliée au devis.');
  await page.evaluate(() => document.querySelector('#payBody').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(1100);
  await ring('#payBody', 10); await sleep(900);
  await press('#payBody .pay:nth-child(1) [data-act=pay-invoice]', { after: 1200 }); cue('chime');
  await page.waitForSelector('#doc .dtitle'); await zoom('#doc .totbox', 1.45, 1000); await ring('#doc .totbox', 10); await sleep(1800); await zoom(null, 1, 900); cue('cash'); await sleep(700); await shot('4-facture');

  /* 5 — envoi par email */
  await caption('05 — Envoi par email', 'Directement chez votre client', 'Le PDF part en pièce jointe, la réponse arrive dans votre boîte.');
  await press('[data-act=send-mail]', { after: 900 }); await ring('#mailForm', 10); await sleep(1200); await shot('5-mail');
  await press('#mailGo', { after: 300 }); await page.waitForFunction(() => !document.getElementById('modal').open, null, { timeout: 15000 }); cue('chime'); await sleep(1300);

  /* 6 — PDF */
  await caption('06 — PDF en un clic', 'Téléchargez, imprimez, archivez', 'Même mise en page à l’écran et sur le PDF.');
  await press('[data-act=pdf]', { after: 1800 }); await sleep(600);

  /* 7 — photo d'un devis manuscrit */
  await page.evaluate(() => go('quotes')); await sleep(700);
  await caption('07 — Photo → devis', 'Un devis écrit à la main ? Photographiez-le', 'L’IA lit chaque ligne et recrée le devis : vous vérifiez, c’est prêt.');
  await press('[data-act=import-pdf]', { after: 800 }); await press('[data-act=imp-photo]', { after: 700 });
  await page.setInputFiles('#phPick', path.join(__dirname, 'devis-manuscrit.jpg')); await page.waitForSelector('.ph-item'); cue('pop'); await sleep(1200);
  await press('#phGo', { after: 300 }); await page.waitForSelector('#impLines', { timeout: 20000 }); cue('chime'); await sleep(900);
  await ring('#impLines', 10); await sleep(1700); await shot('7-photo');
  await press('[data-act=imp-create]', { after: 1100 });

  /* 8 — zéro faute */
  await caption('08 — Zéro faute', 'Relisez avant d’envoyer', 'Le correcteur propose, vous décidez.');
  await type('[data-f=notes]', 'Plafon et pienture 2 couche inclus.', { delay: 34, after: 500 });
  await press('[data-act=ai-review]', { after: 700 }); await page.evaluate(() => { const c = document.getElementById('aiConsent'); if (c) c.click(); });
  await press('#aiGo', { after: 1300 }).catch(() => {}); await page.waitForSelector('#aiBody ins', { timeout: 15000 }).catch(() => {}); await sleep(800); await shot('8-fautes');
  await ring('#aiBody .ai-item, #aiBody ins', 12); await sleep(1300);
  await press('[data-act=ai-apply-all]', { after: 1000 }).catch(() => {}); await press('[data-act=close-modal]', { after: 500 }).catch(() => {});

  /* 9 — catalogue */
  await press('[data-view=catalog]', { after: 900 });
  await caption('09 — Catalogue', 'Vos prix, vos marges, vos matériaux', 'Prestations, ouvrages et matériaux classés par catégorie.');
  await hover('.cchip:nth-child(2)', 450, 200); await hover('.cchip:nth-child(3)', 450, 200); await press('.cchip:nth-child(3)', { after: 900 }); await press('.cchip:nth-child(1)', { after: 900 }); await shot('9-catalogue');

  /* 10 — statistiques */
  await press('[data-view=stats]', { after: 900 }); await caption('10 — Statistiques', 'Pilotez votre chiffre d’affaires', 'Devis du mois, facturé, encaissé, impayés et comparatifs.');
  await sleep(700); await ring('.stats', 10); await sleep(1500); await page.evaluate(() => document.querySelector('.chart').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(1100); await ring('.chart', 10); await sleep(1400); await shot('10-stats');

  /* 11 — chantiers */
  await press('[data-view=sites]', { after: 1000 }); await caption('11 — Chantiers', 'Suivez vos chantiers', 'Dates, heures prévues et réalisées, documents rattachés.');
  await sleep(900); await press('[data-act=open-site]', { after: 1200 }); await sleep(1500); await shot('11-chantier');

  /* 12 — personnalisation */
  await press('[data-view=custom]', { after: 900 }); await caption('12 — À votre façon', 'Clair ou sombre, sons discrets', 'Réglez l’interface en un clic.');
  await press('[data-act=pref][data-k=mode][data-v=light]', { after: 1300 }); await press('[data-act=pref][data-k=mode][data-v=dark]', { after: 900 }); await shot('12-perso');

  /* outro */
  marks.push({ name: 'outro', wall: wall() }); await capOff(); await sleep(400); cue('riser', wall(), wall() + 1.3); await page.evaluate(() => window.fxCover('outro')); await sleep(1400); cue('hit'); cue('chime'); await sleep(3800);

  await cdp.send('Page.stopScreencast'); await sleep(400); await b.close();
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ frames, cues, marks }));
  console.log('frames', frames.length, 'durée', (frames[frames.length - 1].ts - frames[0].ts).toFixed(1), 's');
}
({ prep, rec }[process.argv[2]] || (() => console.log('usage: node film.js prep|rec')))().catch(e => { console.error(e); process.exit(1); });
