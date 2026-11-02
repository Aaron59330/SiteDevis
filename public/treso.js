'use strict';
/* Trésorerie (façon Plum) : comptes bancaires connectés ou relevés importés, solde, entrées et sorties,
   catégories automatiques (qui apprennent de vos corrections), graphiques, chiffre d'affaires,
   cagnottes virtuelles (URSSAF, impôts, dépenses futures) et rapprochement avec les factures et les charges. */
(function () {
  /* ---------- Catégories ---------- */
  const CATS = [
    ['client', 'Encaissements clients', '#34d399', 'in'], ['rembours', 'Remboursements et autres entrées', '#60a5fa', 'in'],
    ['materiel', 'Matériaux et fournitures', '#e2a646', 'out', 'Achats de matériaux et fournitures'],
    ['carburant', 'Carburant et déplacements', '#f97316', 'out', 'Carburant et déplacements'],
    ['outillage', 'Outillage et matériel', '#a78bfa', 'out', 'Outillage et matériel'],
    ['assurance', 'Assurances', '#38bdf8', 'out', 'Assurances (décennale, RC pro)'],
    ['urssaf', 'URSSAF et cotisations', '#f43f5e', 'out', 'Cotisations sociales (URSSAF)'],
    ['impots', 'Impôts et taxes', '#fb7185', 'out', 'Impôts et taxes (CFE…)'],
    ['vehicule', 'Véhicule (entretien, leasing)', '#fbbf24', 'out', 'Véhicule (entretien, assurance, leasing)'],
    ['telecom', 'Téléphone et internet', '#22d3ee', 'out', 'Téléphone et internet'],
    ['logiciels', 'Logiciels et abonnements', '#818cf8', 'out', 'Logiciels et abonnements'],
    ['soustraitance', 'Sous-traitance', '#c084fc', 'out', 'Sous-traitance'],
    ['loyer', 'Loyer et locaux', '#94a3b8', 'out', 'Loyer et locaux'],
    ['banque', 'Frais bancaires', '#64748b', 'out', 'Banque et frais bancaires'],
    ['repas', 'Repas', '#f472b6', 'out', 'Repas et réceptions'],
    ['salaires', 'Salaires', '#2dd4bf', 'out', 'Salaires et charges'],
    ['perso', 'Rémunération / virements personnels', '#a3a3a3', 'any'],
    ['autre', 'Autres', '#737373', 'any', 'Autres']
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c[0], { key: c[0], label: c[1], color: c[2], dir: c[3], compta: c[4] || '' }]));
  const KEYS = [
    [/urssaf|cotisations? sociales?|net-entreprises/, 'urssaf'],
    [/dgfip|impot|imp[oô]ts|tresor public|finances publiques|\bcfe\b|\bsie\b/, 'impots'],
    [/total ?energies|\besso\b|\bshell\b|\bbp\b|\bavia\b|carbu|station|gazole|p[ée]age|autoroute|vinci|sanef|aprr|parking|sncf|uber/, 'carburant'],
    [/leroy|castorama|brico|point\.? ?p\b|cedeo|gedimat|big ?mat|weldom|chausson|tout faire|rexel|sonepar|yesss|richardson|frans bonhomme|brossette|plateforme du batiment|materiaux|wurth|würth/, 'materiel'],
    [/makita|dewalt|milwaukee|hilti|festool|outillage|manomano|kiloutou|loxam/, 'outillage'],
    [/axa|maaf|macif|allianz|smabtp|groupama|\bmma\b|assurance|hiscox|generali|april/, 'assurance'],
    [/orange|\bsfr\b|bouygues|free mobile|\bfree\b|sosh|red by/, 'telecom'],
    [/adobe|google|microsoft|\bovh\b|ionos|apple\.com|canva|optidevis|dropbox|notion|stripe/, 'logiciels'],
    [/garage|pneu|norauto|feu vert|midas|speedy|vidange|controle technique|leasing|diac|rci banque|credipar/, 'vehicule'],
    [/restaurant|brasserie|boulangerie|pizz|kebab|burger|mcdo|traiteur|snack/, 'repas'],
    [/frais|commission|cotisation (carte|cb)|agios|tenue de compte|abonnement (pro|banque)|offre groupee/, 'banque'],
    [/loyer|bail/, 'loyer'], [/salaire|paie\b/, 'salaires']
  ];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /* « clé » d'un commerçant pour les règles : nom sans les mentions bancaires ni les numéros */
  const merchant = t => norm(t.who || t.label).replace(/\b(prlv|prelevement|sepa|vir|virement|cb|carte|paiement|achat|recu|emis|inst|instantane|de|du|le|la|facture|fact|ref|x\d+)\b/g, ' ')
    .replace(/[0-9/.*:#\-_]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  const T = () => { db.treso = db.treso || {}; const t = db.treso; t.rules = t.rules || []; t.env = t.env || null; return t; };
  function guess(t) {
    const s = norm(t.label + ' ' + t.who);
    if (t.amount > 0) return /rembours|\brbt\b|avoir|cpam|caf\b|ameli|vir(ement)? interne|depuis (mon|le) compte/.test(s) ? 'rembours' : 'client';
    for (const [re, c] of KEYS) if (re.test(s)) return c;
    if (/retrait|\bdab\b/.test(s)) return 'perso';
    return 'autre';
  }
  const catOf = t => {
    if (t.cat && CAT[t.cat]) return t.cat;
    const s = norm(t.label + ' ' + t.who), r = T().rules.find(x => x.k && s.includes(x.k) && (x.dir == null || (x.dir === 'in') === (t.amount > 0)));
    return r ? r.cat : guess(t);
  };

  /* ---------- Données ---------- */
  const ui = { data: null, loading: false, kind: 'all', cat: '', q: '', month: '', range: '90', limit: 80 };
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const txs = () => (ui.data ? ui.data.tx : []);
  async function load(force) {
    if (ui.loading || (ui.data && !force)) return;
    ui.loading = true;
    try { ui.data = await api('GET', '/api/bank'); } catch (e) { toast(e.message); ui.data = ui.data || { accounts: [], tx: [], connect: false }; }
    ui.loading = false; if (view === 'treso') render();
  }
  const balance = () => (ui.data ? ui.data.accounts.filter(a => a.balance != null).reduce((s, a) => s + a.balance, 0) : 0);
  const inRange = (t, from, to) => t.date >= from && t.date <= to;
  const monthEnd = ym => ym + '-31';

  /* ---------- Cagnottes ---------- */
  function envs() {
    const t = T();
    if (!t.env) {
      const c = db.compta || {}, rate = num(c.rate) || (c.activity === 'vente' ? 12.3 : c.activity === 'bnc' ? 26.1 : 21.2), from = ymAdd(today().slice(0, 7), -1) + '-01';
      t.env = [
        { id: 'urssaf', name: 'Cotisations URSSAF', kind: 'pct', pct: rate, cat: 'urssaf', from, moves: [] },
        { id: 'impots', name: 'Impôts (CFE, impôt sur le revenu)', kind: 'pct', pct: c.vl ? 1.7 : 3, cat: 'impots', from, moves: [] },
        { id: 'futur', name: 'Dépenses futures (outillage, véhicule…)', kind: 'manual', target: 2000, cat: '', from, moves: [] }
      ];
    }
    return t.env;
  }
  function envAmount(e) {
    const L = txs().filter(t => t.date >= e.from && !t.pending);
    let v = (e.moves || []).reduce((s, m) => s + num(m.amount), 0);
    if (e.kind === 'pct') v += L.filter(t => t.amount > 0 && catOf(t) === 'client').reduce((s, t) => s + t.amount, 0) * num(e.pct) / 100;
    if (e.kind === 'monthly') { const a = new Date(e.from + 'T12:00:00'), b = new Date(); v += num(e.monthly) * Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1); }
    if (e.cat) v += L.filter(t => t.amount < 0 && catOf(t) === e.cat).reduce((s, t) => s + t.amount, 0);   // les paiements vident la cagnotte
    return r2(Math.max(0, v));
  }
  const saved = () => envs().reduce((s, e) => s + envAmount(e), 0);

  /* ---------- Graphiques ---------- */
  /* solde jour par jour, reconstitué à partir du solde actuel et des opérations */
  function balanceSeries(days) {
    const accs = ui.data.accounts.filter(a => a.balance != null), ids = new Set(accs.map(a => a.id));
    let b = accs.reduce((s, a) => s + a.balance, 0);
    const L = txs().filter(t => ids.has(t.acc)).slice().sort((x, y) => y.date.localeCompare(x.date));
    const out = []; let i = 0; const d = new Date(today() + 'T12:00:00');
    for (let k = 0; k < days; k++) {
      const iso = d.toISOString().slice(0, 10);
      while (i < L.length && L[i].date > iso) { b -= L[i].amount; i++; }
      out.push({ date: iso, v: r2(b) }); d.setDate(d.getDate() - 1);
    }
    return out.reverse();
  }
  function areaChart(S) {
    const W = 760, H = 290, pad = { l: 8, r: 8, t: 22, b: 28 };
    const vals = S.map(s => s.v), max = Math.max(...vals, 0), min = Math.min(...vals, 0), span = (max - min) || 1;
    const x = i => pad.l + (W - pad.l - pad.r) * i / Math.max(1, S.length - 1), y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (span * 1.08));
    const pts = S.map((s, i) => `${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ');
    let o = `<svg viewBox="0 0 ${W} ${H}" class="chart tr-area" role="img" aria-label="Évolution du solde"><defs><linearGradient id="trg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
    for (let k = 0; k <= 3; k++) { const yy = pad.t + (H - pad.t - pad.b) * k / 3, v = min + span * 1.08 * (1 - k / 3); o += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="gl"/><text x="${pad.l + 2}" y="${yy - 5}" class="lab tr-ylab">${Math.round(v).toLocaleString('fr-FR')} €</text>`; }
    if (min < 0) o += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" class="gl zero"/>`;
    o += `<polygon points="${x(0)},${y(Math.max(min, 0))} ${pts} ${x(S.length - 1)},${y(Math.max(min, 0))}" fill="url(#trg)"/><polyline points="${pts}" class="tr-line" fill="none"/>`;
    const step = Math.max(1, Math.round(S.length / 6));
    S.forEach((s, i) => { if (i % step === 0 || i === S.length - 1) o += `<text x="${Math.min(W - 30, Math.max(24, x(i)))}" y="${H - 8}" text-anchor="middle" class="lab">${S.length > 120 ? ymShort(s.date.slice(0, 7)) : s.date.slice(8, 10) + '/' + s.date.slice(5, 7)}</text>`; });
    S.forEach((s, i) => { if (i % Math.max(1, Math.round(S.length / 60)) === 0 || i === S.length - 1) o += `<circle cx="${x(i)}" cy="${y(s.v)}" r="7" class="tr-hit"><title>${fdate(s.date)} : ${money(s.v)}</title></circle>`; });
    const last = S[S.length - 1]; o += `<circle cx="${x(S.length - 1)}" cy="${y(last.v)}" r="4.5" class="tr-dot"/>`;
    return o + '</svg>';
  }
  function flowChart() {
    const ym = today().slice(0, 7), W = 760, H = 210, pad = { l: 8, r: 8, t: 12, b: 28 };
    const S = Array.from({ length: 12 }, (_, i) => { const m = ymAdd(ym, i - 11), L = txs().filter(t => t.date.slice(0, 7) === m);
      return { m, inn: L.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), out: -L.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0) }; });
    const max = Math.max(1, ...S.flatMap(s => [s.inn, s.out])) * 1.1, bw = (W - pad.l - pad.r) / 12, w2 = bw * .32, y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    let o = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Entrées et sorties sur 12 mois">`;
    for (let k = 0; k <= 3; k++) { const yy = y(max * k / 3); o += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="gl"/>`; }
    S.forEach((s, i) => { const x0 = pad.l + i * bw + bw * .16;
      o += `<rect x="${x0}" y="${y(s.inn)}" width="${w2}" height="${Math.max(0, y(0) - y(s.inn))}" rx="3" class="tr-in"><title>Entrées ${ymLabel(s.m)} : ${money(s.inn)}</title></rect>`;
      o += `<rect x="${x0 + w2 + 2}" y="${y(s.out)}" width="${w2}" height="${Math.max(0, y(0) - y(s.out))}" rx="3" class="tr-out"><title>Sorties ${ymLabel(s.m)} : ${money(s.out)}</title></rect>`;
      o += `<text x="${pad.l + i * bw + bw / 2}" y="${H - 9}" text-anchor="middle" class="lab ${s.m === ym ? 'cur' : ''}">${ymShort(s.m)}</text>`; });
    return o + '</svg>';
  }

  /* ---------- Page ---------- */
  function page() {
    if (!ui.data) { load(); return `<h1>Trésorerie</h1><div class="card"><div class="empty">Chargement de vos comptes…</div></div>`; }
    const D = ui.data, has = D.accounts.length > 0;
    const head = `<div class="row between" style="margin-bottom:16px;flex-wrap:wrap;gap:10px"><h1 style="margin:0">Trésorerie</h1>
      <div class="row">${has ? `<button class="btn" data-act="tr-sync" title="Récupérer les dernières opérations">${icon('refresh')} Actualiser</button>` : ''}<button class="btn" data-act="tr-import">${icon('upload')} Importer un relevé</button>${D.connect ? `<button class="btn primary" data-act="tr-connect">${icon('building')} Connecter ma banque</button>` : ''}</div></div>`;
    if (!has) return head + `<div class="card tr-hero"><div class="tr-hero-ic">${icon('building')}</div><h2>Suivez votre argent automatiquement</h2>
      <p class="muted">Solde, encaissements, dépenses classées par catégorie, évolution de votre trésorerie et argent mis de côté pour l’URSSAF et les impôts : tout au même endroit.</p>
      <div class="row" style="justify-content:center;margin-top:18px">${D.connect ? `<button class="btn primary" data-act="tr-connect">${icon('building')} Connecter mon compte pro</button>` : ''}<button class="btn ${D.connect ? '' : 'primary'}" data-act="tr-import">${icon('upload')} Importer un relevé (CSV, OFX)</button><button class="btn" data-act="tr-demo">Essayer avec un exemple</button></div>
      ${D.connect ? '<p class="muted" style="font-size:.8rem;margin-top:14px">Connexion sécurisée et agréée (DSP2) : vous vous identifiez sur le site de votre banque, OptiDevis ne voit jamais vos codes et ne peut faire aucun paiement.</p>' : '<p class="muted" style="font-size:.8rem;margin-top:14px">Téléchargez le relevé de votre compte depuis l’espace en ligne de votre banque (format CSV ou OFX), puis importez-le ici.</p>'}</div>`;

    const ym = today().slice(0, 7), pm = ymAdd(ym, -1), all = txs();
    const sum = (L, f) => r2(L.filter(f).reduce((s, t) => s + t.amount, 0));
    const M = all.filter(t => t.date.slice(0, 7) === ym), P = all.filter(t => t.date.slice(0, 7) === pm);
    const inM = sum(M, t => t.amount > 0), outM = -sum(M, t => t.amount < 0), inP = sum(P, t => t.amount > 0), outP = -sum(P, t => t.amount < 0);
    const bal = balance(), sav = saved(), free = r2(bal - sav), noBal = D.accounts.some(a => a.balance == null);
    const pct = (a, b) => b > 0.005 ? `<span class="${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))} %</span> vs ${ymLabel(pm)}` : '';
    const card = (n, l, sub, cls = '') => `<div class="stat ${cls}"><div class="n">${n}</div><div class="l">${l}</div>${sub ? `<div class="sub2">${sub}</div>` : ''}</div>`;
    /* chiffre d'affaires */
    const year = ym.slice(0, 4), caYear = sum(all.filter(t => t.date.slice(0, 4) === year), t => t.amount > 0 && catOf(t) === 'client');
    const caM = sum(M, t => t.amount > 0 && catOf(t) === 'client'), caP = sum(P, t => t.amount > 0 && catOf(t) === 'client');
    const pendingInv = db.quotes.filter(q => isInv(q) && q.status === 'envoye'), pendingAmt = pendingInv.reduce((s, q) => s + totals(q).due, 0);
    const billedYear = db.quotes.filter(q => isInv(q) && (q.status === 'envoye' || q.status === 'payee') && (q.date || '').slice(0, 4) === year).reduce((s, q) => s + totals(q).ttc, 0);
    /* dépenses par catégorie */
    const days = ui.range === '30' ? 30 : ui.range === '365' ? 365 : 90, from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
    const byCat = {}; all.filter(t => t.amount < 0 && t.date >= from).forEach(t => { const c = catOf(t); byCat[c] = (byCat[c] || 0) - t.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), catTot = cats.reduce((s, c) => s + c[1], 0) || 1;

    return head + `
    ${D.accounts.some(a => a.error) ? `<div class="tr-alert">${D.accounts.filter(a => a.error).map(a => `<div><b>${esc(a.name)}</b> : ${esc(a.error)} ${a.provider === 'enablebanking' && D.connect ? '<button class="btn small" data-act="tr-connect">Reconnecter</button>' : ''}</div>`).join('')}</div>` : ''}
    <div class="stats tr-kpis">
      ${card(`<span class="${bal < 0 ? 'neg' : ''}">${money(bal)}</span>`, 'Solde bancaire', noBal ? '<button class="linkbtn" data-act="tr-accounts">Indiquer le solde d’un compte</button>' : `${D.accounts.length} compte${D.accounts.length > 1 ? 's' : ''} · ${lastSync()}`, 'tr-main')}
      ${card(`<span class="${free < 0 ? 'neg' : ''}">${money(free)}</span>`, 'Disponible réel', `Solde − ${money(sav)} mis de côté`)}
      ${card(`<span class="pos">+ ${money(inM)}</span>`, `Encaissements · ${ymLabel(ym)}`, pct(inM, inP))}
      ${card(`<span>− ${money(outM)}</span>`, `Dépenses · ${ymLabel(ym)}`, pct(outM, outP).replace('class="up"', 'class="down"').replace(/class="down">▼/, 'class="up">▼'))}
    </div>
    <div class="tr-grid">
      <div class="card"><div class="row between" style="flex-wrap:wrap;gap:8px"><h2 style="margin:0">Évolution de la trésorerie</h2>
        <div class="seg2">${[['30', '30 j'], ['90', '3 mois'], ['365', '12 mois']].map(([k, l]) => `<button data-act="tr-range" data-r="${k}" class="${ui.range === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${noBal && !D.accounts.some(a => a.balance != null) ? '<div class="empty">Indiquez le solde actuel de votre compte pour tracer son évolution.<br><br><button class="btn" data-act="tr-accounts">Indiquer le solde</button></div>' : areaChart(balanceSeries(days))}</div>
      <div class="card"><div class="row between"><h2 style="margin:0">Cagnottes</h2><button class="btn small" data-act="tr-env-new">＋ Cagnotte</button></div>
        <p class="muted" style="font-size:.8rem;margin:4px 0 12px">De l’argent mis de côté virtuellement : il reste sur votre compte mais n’est plus compté comme disponible.</p>
        <div class="tr-envs">${envs().map(e => { const v = envAmount(e), tg = num(e.target);
          return `<div class="tr-env"><div class="row between"><b>${esc(e.name)}</b><b>${money(v)}</b></div>
            <div class="muted" style="font-size:.76rem">${e.kind === 'pct' ? `${fmtNum.format(num(e.pct))} % de chaque encaissement` : e.kind === 'monthly' ? `${money(num(e.monthly))} chaque mois` : 'Versements manuels'}${e.cat ? ` · se vide avec les paiements « ${esc(CAT[e.cat].label)} »` : ''}</div>
            ${tg > 0 ? `<div class="cb tr-cb"><i style="width:${Math.min(100, v / tg * 100)}%"></i></div><div class="muted" style="font-size:.74rem">Objectif ${money(tg)} · ${Math.min(100, Math.round(v / tg * 100))} %</div>` : ''}
            <div class="tr-env-acts"><button class="btn small" data-act="tr-env-move" data-id="${e.id}" data-s="1">＋ Mettre de côté</button><button class="btn small" data-act="tr-env-move" data-id="${e.id}" data-s="-1">− Utiliser</button><button class="btn small" data-act="tr-env-edit" data-id="${e.id}">Régler</button></div></div>`; }).join('')}</div></div>
    </div>
    <div class="tr-grid">
      <div class="card"><div class="row between" style="flex-wrap:wrap;gap:8px"><h2 style="margin:0">Entrées et sorties — 12 mois</h2><div class="legend"><span><i class="lg tr-in"></i>Entrées</span><span><i class="lg tr-out"></i>Sorties</span></div></div>${flowChart()}</div>
      <div class="card"><h2 style="margin:0 0 4px">Chiffre d’affaires</h2>
        <div class="tr-ca"><div><span class="muted">${esc(ymLabel(ym))}</span><b>${money(caM)}</b><small>${pct(caM, caP) || '&nbsp;'}</small></div><div><span class="muted">Depuis janvier ${year}</span><b>${money(caYear)}</b><small>encaissé sur le compte</small></div></div>
        <div class="tr-ca-rows"><div><span>Facturé en ${year}</span><b>${money(billedYear)}</b></div><div><span>Factures en attente de paiement (${pendingInv.length})</span><b>${money(pendingAmt)}</b></div>
        <div><span>Trésorerie prévue après encaissement</span><b>${money(bal + pendingAmt)}</b></div></div></div>
    </div>
    <div class="card" style="margin-bottom:16px"><div class="row between" style="flex-wrap:wrap;gap:8px"><h2 style="margin:0">Dépenses par catégorie</h2><span class="muted" style="font-size:.85rem">${days === 30 ? '30 derniers jours' : days === 90 ? '3 derniers mois' : '12 derniers mois'} · ${money(cats.reduce((s, c) => s + c[1], 0))}</span></div>
      ${cats.length ? `<div class="tr-cats">${cats.map(([k, v]) => `<button class="tr-cat" data-act="tr-filter-cat" data-c="${k}"><span class="tr-dotc" style="background:${CAT[k].color}"></span><span class="grow">${esc(CAT[k].label)}</span><b>${money(v)}</b><span class="muted">${Math.round(v / catTot * 100)} %</span><span class="tr-bar"><i style="width:${v / catTot * 100}%;background:${CAT[k].color}"></i></span></button>`).join('')}</div>` : '<div class="empty">Aucune dépense sur la période.</div>'}</div>
    ${txList()}`;
  }
  const lastSync = () => { const d = ui.data.accounts.map(a => a.lastSync).filter(Boolean).sort().pop(); if (!d) return ''; const m = Math.round((Date.now() - new Date(d)) / 60000); return 'actualisé ' + (m < 2 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : 'le ' + fdate(d.slice(0, 10))); };

  /* ---------- Opérations ---------- */
  function filtered() {
    const q = norm(ui.q);
    return txs().filter(t => (ui.kind === 'all' || (ui.kind === 'in' ? t.amount > 0 : t.amount < 0)) && (!ui.cat || catOf(t) === ui.cat) && (!ui.month || t.date.slice(0, 7) === ui.month)
      && (!q || norm(t.label + ' ' + t.who + ' ' + (t.note || '') + ' ' + String(t.amount).replace('.', ',')).includes(q)));
  }
  const accName = id => { const a = ui.data.accounts.find(x => x.id === id); return a ? a.name : ''; };
  const isDemo = t => { const a = ui.data.accounts.find(x => x.id === t.acc); return !!a && a.provider === 'demo'; };
  function matchInvoice(t) {
    if (t.amount <= 0 || t.link || isDemo(t)) return null;
    return db.quotes.find(q => isInv(q) && q.status === 'envoye' && Math.abs(totals(q).due - t.amount) < 0.01) || null;
  }
  const inCharges = t => db.expenses.find(e => e.bankTx === t.id) || (t.amount < 0 && db.expenses.find(e => Math.abs(num(e.ttc) + t.amount) < 0.01 && Math.abs(new Date(e.date) - new Date(t.date)) <= 4 * 864e5));
  function txList() {
    const L = filtered(), months = [...new Set(txs().map(t => t.date.slice(0, 7)))];
    const tin = L.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), tout = L.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    let lastDay = '';
    const rows = L.slice(0, ui.limit).map(t => {
      const c = CAT[catOf(t)], inv = matchInvoice(t), linked = t.link && getQuote(t.link), ch = t.amount < 0 && inCharges(t);
      const day = t.date !== lastDay ? `<div class="tr-day">${flongdate(t.date)}</div>` : ''; lastDay = t.date;
      return day + `<div class="tr-tx ${t.pending ? 'pend' : ''}">
        <span class="tr-av" style="background:${c.color}22;color:${c.color}">${esc((t.who || t.label || '?').trim().charAt(0).toUpperCase())}</span>
        <div class="grow tr-txt"><b>${esc(t.who || t.label)}</b><span class="muted">${esc([t.who && t.label !== t.who ? t.label.replace(t.who + ' — ', '') : '', t.pending ? 'en cours' : '', ui.data.accounts.length > 1 ? accName(t.acc) : ''].filter(Boolean).join(' · '))}</span>
          <div class="tr-tags"><select class="tr-catsel" data-tx="${esc(t.id)}" style="--c:${c.color}">${CATS.filter(k => k[3] === 'any' || k[3] === (t.amount > 0 ? 'in' : 'out') || k[0] === c.key).map(k => `<option value="${k[0]}" ${k[0] === c.key ? 'selected' : ''}>${k[1]}</option>`).join('')}</select>
          ${linked ? `<span class="badge payee">Facture ${esc(linked.number)}</span>` : inv ? `<button class="tr-sug" data-act="tr-paid" data-tx="${esc(t.id)}" data-q="${inv.id}">Facture ${esc(inv.number)} payée ?</button>` : ''}
          ${t.amount < 0 && !isDemo(t) ? (ch ? '<span class="badge accepte">✓ En charges</span>' : CAT[c.key].compta ? `<button class="tr-sug" data-act="tr-charge" data-tx="${esc(t.id)}">＋ Ajouter aux charges</button>` : '') : ''}</div></div>
        <b class="tr-amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+ ' : '− '}${money(Math.abs(t.amount))}</b></div>`;
    }).join('');
    return `<div class="card" id="trList"><div class="row between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><h2 style="margin:0">Opérations</h2>
        <div class="row" style="gap:8px"><button class="btn small" data-act="tr-auto" title="Factures payées et charges reconnues automatiquement">${icon('sparkles')} Rapprocher automatiquement</button><button class="btn small" data-act="tr-accounts">Comptes</button></div></div>
      <div class="tr-filters"><input id="trQ" placeholder="Rechercher (libellé, montant…)" value="${esc(ui.q)}">
        <div class="seg2">${[['all', 'Tout'], ['in', 'Entrées'], ['out', 'Sorties']].map(([k, l]) => `<button data-act="tr-kind" data-k="${k}" class="${ui.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select id="trCat"><option value="">Toutes les catégories</option>${CATS.map(k => `<option value="${k[0]}" ${ui.cat === k[0] ? 'selected' : ''}>${k[1]}</option>`).join('')}</select>
        <select id="trMonth"><option value="">Tous les mois</option>${months.map(m => `<option value="${m}" ${ui.month === m ? 'selected' : ''}>${ymLabel(m)}</option>`).join('')}</select></div>
      <div class="tr-sum muted">${L.length} opération${L.length > 1 ? 's' : ''} · <span class="pos">+ ${money(tin)}</span> · − ${money(-tout)}</div>
      ${L.length ? `<div class="tr-txs">${rows}</div>${L.length > ui.limit ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-act="tr-more">Voir plus (${L.length - ui.limit})</button></div>` : ''}` : '<div class="empty">Aucune opération.</div>'}</div>`;
  }

  /* ---------- Actions ---------- */
  async function setCat(id, cat) {
    const t = txs().find(x => x.id === id); if (!t) return;
    const key = merchant(t), similar = key.length >= 3 ? txs().filter(x => x !== t && merchant(x) === key && (x.amount > 0) === (t.amount > 0) && catOf(x) !== cat) : [];
    t.cat = cat;
    let ids = [id];
    if (similar.length && confirm(`Classer aussi ${similar.length} autre${similar.length > 1 ? 's' : ''} opération${similar.length > 1 ? 's' : ''} « ${key} » et les prochaines dans « ${CAT[cat].label} » ?`)) {
      similar.forEach(x => { x.cat = cat; }); ids = ids.concat(similar.map(x => x.id));
      const R = T().rules.filter(r => r.k !== key); R.unshift({ k: key, cat, dir: t.amount > 0 ? 'in' : 'out' }); T().rules = R.slice(0, 300); save();
    }
    try { await api('PATCH', '/api/bank/tx', { ids, set: { cat } }); } catch (e) { toast(e.message); }
    render(); toast('Catégorie enregistrée');
  }
  function addCharge(t) {
    const c = CAT[catOf(t)], vat = db.company.vatExempt ? 0 : 20, ttc = r2(-t.amount);
    db.expenses = db.expenses || [];
    const e = { id: uid(), date: t.date, label: (t.who || t.label).slice(0, 80), supplier: t.who || '', cat: c.compta || 'Autres', ttc, vat, ht: r2(ttc / (1 + vat / 100)), pay: /prlv|prelev/i.test(t.label) ? 'Prélèvement' : /vir/i.test(t.label) ? 'Virement' : 'Carte bancaire', recurring: 'none', until: '', note: 'Depuis la banque', bankTx: t.id };
    db.expenses.push(e); return e;
  }
  async function markPaid(t, q) {
    q.status = 'payee'; q.paidAt = t.date; if (!q.payMethod) q.payMethod = 'Virement'; save();
    t.link = q.id; try { await api('PATCH', '/api/bank/tx', { ids: [t.id], set: { link: q.id } }); } catch (e) { /* ignore */ }
  }
  Object.assign(actions, {
    'tr-range'(b) { ui.range = b.dataset.r; render(); },
    'tr-kind'(b) { ui.kind = b.dataset.k; ui.limit = 80; render(); },
    'tr-more'() { ui.limit += 150; render(); },
    'tr-filter-cat'(b) { ui.cat = b.dataset.c; ui.kind = 'all'; render(); setTimeout(() => { const l = $('#trList'); if (l) l.scrollIntoView({ behavior: 'smooth' }); }, 50); },
    async 'tr-sync'(b) {
      if (!ui.data.accounts.some(a => a.provider === 'enablebanking')) { load(true); return toast('Les comptes importés s’actualisent en important un nouveau relevé'); }
      b.disabled = true; b.textContent = 'Actualisation…';
      try { const r = await api('POST', '/api/bank/sync'); ui.data = { ...ui.data, accounts: r.accounts, tx: r.tx }; toast(r.errors && r.errors.length ? r.errors[0] : r.added ? `${r.added} nouvelle${r.added > 1 ? 's' : ''} opération${r.added > 1 ? 's' : ''}` : 'Comptes à jour'); }
      catch (e) { toast(e.message); }
      render();
    },
    async 'tr-paid'(b) { const t = txs().find(x => x.id === b.dataset.tx), q = getQuote(b.dataset.q); if (!t || !q) return; await markPaid(t, q); toast(`Facture ${q.number} marquée payée`); render(); },
    'tr-charge'(b) { const t = txs().find(x => x.id === b.dataset.tx); if (!t) return; if (!requireAccess()) return; addCharge(t); save(); toast('Ajouté aux charges de la comptabilité'); render(); },
    async 'tr-auto'() {
      if (!requireAccess()) return;
      const pays = txs().map(t => [t, matchInvoice(t)]).filter(x => x[1]), used = new Set(), P = pays.filter(([, q]) => !used.has(q.id) && used.add(q.id));
      const C = txs().filter(t => t.amount < 0 && !t.pending && !isDemo(t) && CAT[catOf(t)].compta && !['urssaf', 'autre'].includes(catOf(t)) && !inCharges(t));
      if (!P.length && !C.length) return toast('Tout est déjà rapproché ✓');
      if (!confirm(`Rapprochement automatique :\n\n• ${P.length} facture${P.length > 1 ? 's' : ''} marquée${P.length > 1 ? 's' : ''} payée${P.length > 1 ? 's' : ''} (même montant reçu sur le compte)\n• ${C.length} dépense${C.length > 1 ? 's' : ''} ajoutée${C.length > 1 ? 's' : ''} aux charges de la comptabilité\n\nLes opérations « URSSAF » et « Autres » ne sont pas ajoutées (cotisations déjà estimées, catégorie à préciser). Continuer ?`)) return;
      for (const [t, q] of P) await markPaid(t, q);
      C.forEach(addCharge); save(); toast('Rapprochement effectué'); render();
    },
    'tr-import'() { importModal(); },
    'tr-connect'() { connectModal(); },
    'tr-accounts'() { accountsModal(); },
    async 'tr-demo'() { if (!requireAccess()) return; try { const r = await api('POST', '/api/bank/import', demoData()); ui.data = { ...ui.data, accounts: r.accounts, tx: r.tx }; toast('Exemple chargé : vous pourrez le supprimer dans « Comptes »'); render(); } catch (e) { toast(e.message); } },
    'tr-env-new'() { envModal(null); },
    'tr-env-edit'(b) { envModal(envs().find(e => e.id === b.dataset.id)); },
    'tr-env-move'(b) {
      const e = envs().find(x => x.id === b.dataset.id); if (!e) return; const s = Number(b.dataset.s);
      const v = prompt(s > 0 ? `Montant à mettre de côté dans « ${e.name} » (€)` : `Montant utilisé de « ${e.name} » (€)`); if (v == null) return;
      const a = num(String(v).replace(',', '.')); if (!(a > 0)) return toast('Montant invalide');
      e.moves = e.moves || []; e.moves.push({ date: today(), amount: s * a }); save(); render();
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.classList && t.classList.contains('tr-catsel')) return setCat(t.dataset.tx, t.value);
    if (t.id === 'trCat') { ui.cat = t.value; ui.limit = 80; render(); }
    if (t.id === 'trMonth') { ui.month = t.value; ui.limit = 80; render(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'trQ') { ui.q = e.target.value; const L = $('#trList'); if (L) { const pos = e.target.selectionStart; L.outerHTML = txList(); const q = $('#trQ'); q.focus(); q.setSelectionRange(pos, pos); } } });

  /* ---------- Cagnotte : création / réglages ---------- */
  function envModal(e) {
    const x = e || { name: '', kind: 'pct', pct: 10, monthly: 100, target: '', cat: '', from: today().slice(0, 7) + '-01', moves: [] };
    const m = openModal(`<form id="envForm"><h2>${e ? 'Régler la cagnotte' : 'Nouvelle cagnotte'}</h2>
      <div class="field"><label>Nom</label><input name="name" required value="${esc(x.name)}" placeholder="Ex : Nouveau camion, Vacances, TVA…"></div>
      <div class="field"><label>Comment elle se remplit</label><select name="kind"><option value="pct" ${x.kind === 'pct' ? 'selected' : ''}>Un pourcentage de chaque encaissement client</option><option value="monthly" ${x.kind === 'monthly' ? 'selected' : ''}>Un montant fixe chaque mois</option><option value="manual" ${x.kind === 'manual' ? 'selected' : ''}>À la main uniquement</option></select></div>
      <div class="grid2"><div class="field" data-k="pct"><label>Pourcentage (%)</label><input name="pct" type="number" step="0.1" value="${esc(x.pct)}"></div><div class="field" data-k="monthly"><label>Montant par mois (€)</label><input name="monthly" type="number" step="1" value="${esc(x.monthly || '')}"></div>
        <div class="field"><label>Objectif (€, facultatif)</label><input name="target" type="number" step="1" value="${esc(x.target || '')}"></div>
        <div class="field"><label>À partir du</label><input name="from" type="date" value="${esc(x.from)}"></div></div>
      <div class="field"><label>Se vide automatiquement avec les paiements de la catégorie</label><select name="cat"><option value="">Aucune (je l’utilise à la main)</option>${CATS.filter(k => k[3] !== 'in').map(k => `<option value="${k[0]}" ${x.cat === k[0] ? 'selected' : ''}>${k[1]}</option>`).join('')}</select></div>
      <div class="row between" style="margin-top:12px">${e ? '<button type="button" class="btn danger" id="envDel">Supprimer</button>' : '<span></span>'}<div class="row"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></div></form>`);
    const f = m.querySelector('#envForm'), E = f.elements;
    const sync = () => f.querySelectorAll('[data-k]').forEach(d => { d.hidden = d.dataset.k !== E.kind.value; });
    E.kind.onchange = sync; sync();
    if (e) f.querySelector('#envDel').onclick = () => { if (confirm('Supprimer cette cagnotte ?')) { T().env = envs().filter(y => y !== e); save(); m.close(); render(); } };
    f.onsubmit = ev => { ev.preventDefault();
      const d = { name: E.name.value.trim() || 'Cagnotte', kind: E.kind.value, pct: num(E.pct.value), monthly: num(E.monthly.value), target: num(E.target.value) || '', from: E.from.value || today(), cat: E.cat.value };
      if (e) Object.assign(e, d); else envs().push({ id: uid(), moves: [], ...d });
      save(); m.close(); render(); };
  }

  /* ---------- Comptes ---------- */
  function accountsModal() {
    const A = ui.data.accounts;
    const m = openModal(`<div><div class="row between"><h2 style="margin:0">Comptes</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
      <div class="sh-list" style="margin-top:14px">${A.map(a => `<div class="sh-row"><div class="grow"><b>${esc(a.name)}</b> <span class="muted">${esc(a.bank || '')} ${esc(a.iban || '')}</span>
        <div class="muted" style="font-size:.78rem">${a.provider === 'enablebanking' ? 'Connecté à la banque' + (a.validUntil ? ` · autorisation jusqu’au ${fdate(a.validUntil.slice(0, 10))}` : '') : a.provider === 'demo' ? 'Exemple' : 'Relevés importés'}${a.lastSync ? ' · mis à jour le ' + fdate(a.lastSync.slice(0, 10)) : ''}</div>
        <div class="row" style="gap:8px;margin-top:8px"><label class="muted" style="font-size:.8rem;margin:0">Solde actuel (€)</label><input type="number" step="0.01" class="tr-balin" data-id="${a.id}" value="${a.balance == null ? '' : a.balance}" ${a.provider === 'enablebanking' ? 'disabled title="Donné par la banque"' : ''} style="max-width:140px"></div></div>
        <div class="sh-acts"><button class="btn small danger" data-act="tr-acc-del" data-id="${a.id}">Supprimer</button></div></div>`).join('') || '<div class="empty">Aucun compte.</div>'}</div></div>`);
    m.querySelectorAll('.tr-balin').forEach(i => { i.onchange = async () => { try { const r = await api('PATCH', '/api/bank/accounts/' + i.dataset.id, { balance: i.value }); ui.data = { ...ui.data, accounts: r.accounts, tx: r.tx }; toast('Solde enregistré'); render(); } catch (e) { toast(e.message); } }; });
  }
  actions['tr-acc-del'] = async b => {
    const a = ui.data.accounts.find(x => x.id === b.dataset.id); if (!a || !confirm(`Supprimer « ${a.name} » et ses opérations de la trésorerie ?${a.provider === 'enablebanking' ? ' L’accès à la banque sera aussi coupé.' : ''}`)) return;
    try { const r = await api('DELETE', '/api/bank/accounts/' + a.id); ui.data = { ...ui.data, accounts: r.accounts, tx: r.tx }; $('#modal').close(); toast('Compte supprimé'); render(); } catch (e) { toast(e.message); }
  };

  /* ---------- Connexion bancaire ---------- */
  async function connectModal() {
    if (!requireAccess()) return;
    const m = openModal(`<div><div class="row between"><h2 style="margin:0">Connecter ma banque</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
      <p class="muted" style="margin:8px 0 12px">Choisissez votre banque : vous serez redirigé vers son site pour vous identifier et autoriser la lecture de vos comptes (90 à 180 jours, renouvelable). OptiDevis ne voit jamais vos identifiants et ne peut faire aucun virement.</p>
      <div class="seg2" style="margin-bottom:10px"><button type="button" class="on" data-psu="business">Compte professionnel</button><button type="button" data-psu="personal">Compte personnel</button></div>
      <input id="bkQ" placeholder="Rechercher votre banque (Qonto, Shine, Crédit Agricole…)" style="width:100%"><div id="bkList" class="bk-list"><div class="empty">Chargement des banques…</div></div></div>`);
    let list = [], psu = 'business';
    m.querySelectorAll('[data-psu]').forEach(b => { b.onclick = () => { psu = b.dataset.psu; m.querySelectorAll('[data-psu]').forEach(x => x.classList.toggle('on', x === b)); }; });
    const draw = () => { const q = norm($('#bkQ').value), L = list.filter(b => !q || norm(b.name).includes(q)).slice(0, 80);
      $('#bkList').innerHTML = L.map(b => `<button class="bk-item" data-name="${esc(b.name)}">${b.logo ? `<img src="${esc(b.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tr-av">${esc(b.name.charAt(0))}</span>`}<span>${esc(b.name)}</span></button>`).join('') || '<div class="empty">Aucune banque trouvée.</div>';
      $('#bkList').querySelectorAll('.bk-item').forEach(x => { x.onclick = async () => { x.disabled = true; x.querySelector('span:last-child').textContent = 'Redirection vers ' + x.dataset.name + '…';
        try { const r = await api('POST', '/api/bank/connect', { bank: x.dataset.name, psu }); location.href = r.url; } catch (e) { toast(e.message); x.disabled = false; draw(); } }; }); };
    $('#bkQ').oninput = draw;
    try { list = (await api('GET', '/api/bank/banks')).banks; draw(); } catch (e) { $('#bkList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  /* ---------- Import d'un relevé CSV / OFX ---------- */
  const amt = s => { s = String(s || '').replace(/[\s €]/g, '').replace(/^\((.*)\)$/, '-$1'); if (!s) return NaN; if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); return parseFloat(s); };
  const dateIso = s => { s = String(s || '').trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(s); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = /^(\d{4})(\d{2})(\d{2})/.exec(s); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
  function parseOfx(txt) {
    const g = (b, k) => { const m = new RegExp('<' + k + '>([^<\\r\\n]*)', 'i').exec(b); return m ? m[1].trim() : ''; };
    const tx = [...txt.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi)].map(m => ({ id: g(m[1], 'FITID') ? 'o' + g(m[1], 'FITID') : '', date: dateIso(g(m[1], 'DTPOSTED')), amount: amt(g(m[1], 'TRNAMT').replace(',', '.')), label: [g(m[1], 'NAME'), g(m[1], 'MEMO')].filter(Boolean).join(' — ') }));
    const lb = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(txt);
    return { tx, balance: lb ? amt(g(lb[1], 'BALAMT').replace(',', '.')) : null, balanceAt: lb ? dateIso(g(lb[1], 'DTASOF')) : '', bank: g(txt, 'ORG') };
  }
  function splitCsv(line, d) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === d && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(s => s.trim()); }
  function parseCsv(txt) {
    const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const d = [';', '\t', ','].map(c => [c, lines.slice(0, 15).reduce((s, l) => s + splitCsv(l, c).length, 0)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = lines.map(l => splitCsv(l, d));
    let hi = rows.findIndex(r => r.some(c => /date/i.test(c)) && r.some(c => /montant|amount|d[ée]bit|cr[ée]dit|somme/i.test(c)));
    const H = hi >= 0 ? rows[hi].map(c => norm(c)) : [];
    const col = re => H.findIndex(h => re.test(h));
    let cD = col(/date (d.)?op|date op|^date$|date comptable|booking/); if (cD < 0) cD = col(/date/);
    let cA = col(/^montant|amount|somme/), cDb = col(/debit/), cCr = col(/credit/), cS = col(/solde|balance/);
    const cL = H.map((h, i) => /libell|description|intitul|detail|label|motif|nature|beneficiaire|tiers|reference/.test(h) && i !== cD ? i : -1).filter(i => i >= 0);
    let data = rows.slice(hi + 1);
    if (hi < 0) {   // pas d'en-tête : on devine les colonnes au contenu
      const s = rows.slice(0, 20); cD = s[0].findIndex((c, i) => s.filter(r => dateIso(r[i])).length > s.length * .6);
      cA = s[0].map((c, i) => i).filter(i => i !== cD && s.filter(r => !isNaN(amt(r[i]))).length > s.length * .6).pop();
      const tl = s[0].map((c, i) => i).filter(i => i !== cD && i !== cA).sort((a, b) => s.reduce((t, r) => t + (r[b] || '').length, 0) - s.reduce((t, r) => t + (r[a] || '').length, 0));
      cL.push(tl[0]); data = rows;
    }
    if (cD < 0 || (cA < 0 && cDb < 0 && cCr < 0)) throw new Error('Colonnes « date » et « montant » introuvables dans ce fichier.');
    let lastBal = null, lastBalDate = '';
    const tx = data.map(r => {
      const date = dateIso(r[cD]); if (!date) return null;
      let a = cA >= 0 && r[cA] !== '' ? amt(r[cA]) : NaN;
      if (isNaN(a)) { const db_ = cDb >= 0 ? amt(r[cDb]) : NaN, cr = cCr >= 0 ? amt(r[cCr]) : NaN; a = (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(db_) ? 0 : Math.abs(db_)); }
      if (cS >= 0 && !isNaN(amt(r[cS])) && date >= lastBalDate) { lastBal = amt(r[cS]); lastBalDate = date; }
      return { date, amount: a, label: cL.map(i => r[i]).filter(Boolean).join(' — ').replace(/\s+/g, ' ') };
    }).filter(t => t && t.amount && !isNaN(t.amount));
    return { tx, balance: lastBal, balanceAt: lastBalDate, bank: '' };
  }
  function importModal() {
    if (!requireAccess()) return;
    const A = ui.data.accounts.filter(a => a.provider !== 'enablebanking');
    const m = openModal(`<form id="impForm"><h2>Importer un relevé bancaire</h2>
      <p class="muted" style="margin:0 0 12px">Dans l’espace en ligne de votre banque, téléchargez le relevé de votre compte au format <b>CSV</b>, <b>OFX</b> ou <b>QIF/Excel exporté en CSV</b>. Les opérations déjà importées ne sont pas dupliquées.</p>
      <label class="dropzone"><input type="file" id="impF" accept=".csv,.ofx,.qfx,.txt,text/csv" hidden><b>Choisir le fichier</b><span class="muted" id="impN">CSV ou OFX</span></label>
      <div id="impPrev" class="muted" style="margin:10px 0"></div>
      <div class="grid2"><div class="field"><label>Compte</label><select name="acc">${A.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}<option value="">＋ Nouveau compte</option></select></div>
        <div class="field" id="impNameF"><label>Nom du compte</label><input name="name" value="Compte professionnel"></div></div>
      <div class="field"><label>Solde actuel du compte (€)</label><input name="balance" type="number" step="0.01" placeholder="Visible sur votre espace bancaire"></div>
      <div class="form-err" hidden></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary" id="impGo" disabled>Importer</button></div></form>`);
    const f = m.querySelector('#impForm'), E = f.elements; let parsed = null;
    const nm = () => { f.querySelector('#impNameF').hidden = !!E.acc.value; }; E.acc.onchange = nm; nm();
    f.querySelector('#impF').onchange = async ev => {
      const file = ev.target.files[0]; if (!file) return; const er = f.querySelector('.form-err'); er.hidden = true;
      f.querySelector('#impN').textContent = file.name;
      try {
        const buf = await file.arrayBuffer(); let txt = new TextDecoder('utf-8').decode(buf); if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
        parsed = /<OFX>|OFXHEADER/i.test(txt) ? parseOfx(txt) : parseCsv(txt);
        if (!parsed.tx.length) throw new Error('Aucune opération trouvée dans ce fichier.');
        const ds = parsed.tx.map(t => t.date).sort();
        f.querySelector('#impPrev').innerHTML = `<b>${parsed.tx.length} opérations</b> du ${fdate(ds[0])} au ${fdate(ds[ds.length - 1])} · entrées ${money(parsed.tx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))} · sorties ${money(-parsed.tx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))}`;
        if (parsed.balance != null && !isNaN(parsed.balance)) E.balance.value = parsed.balance;
        f.querySelector('#impGo').disabled = false;
      } catch (e2) { parsed = null; er.textContent = e2.message; er.hidden = false; f.querySelector('#impGo').disabled = true; }
    };
    f.onsubmit = async ev => { ev.preventDefault(); if (!parsed) return; const go = f.querySelector('#impGo'); go.disabled = true; go.textContent = 'Import…';
      try {
        const r = await api('POST', '/api/bank/import', { accountId: E.acc.value || undefined, name: E.name.value, bank: parsed.bank, tx: parsed.tx, balance: E.balance.value === '' ? null : num(E.balance.value), balanceAt: E.balance.value === '' ? '' : today() });
        ui.data = { ...ui.data, accounts: r.accounts, tx: r.tx }; m.close(); toast(`${r.added} opération${r.added > 1 ? 's' : ''} importée${r.added > 1 ? 's' : ''}`); render();
      } catch (e2) { const er = f.querySelector('.form-err'); er.textContent = e2.message; er.hidden = false; go.disabled = false; go.textContent = 'Importer'; } };
  }

  /* ---------- Exemple ---------- */
  function demoData() {
    const tx = [], d0 = new Date(); let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const add = (daysAgo, amount, label, who) => { const d = new Date(d0 - daysAgo * 864e5).toISOString().slice(0, 10); tx.push({ id: 'demo' + tx.length, date: d, amount, label, who }); };
    for (let k = 0; k < 180; k += 1) {
      if (k % 9 === 2) add(k, Math.round(800 + rnd() * 3200), 'VIR SEPA RECU ' + ['M. DUPONT', 'SCI LES LILAS', 'MME LEROY', 'SARL BATIPRO', 'M. MARTIN'][k % 5], ['M. Dupont', 'SCI Les Lilas', 'Mme Leroy', 'SARL Batipro', 'M. Martin'][k % 5]);
      if (k % 6 === 1) add(k, -Math.round(60 + rnd() * 420), 'CB LEROY MERLIN ' + (k % 3 ? 'LILLE' : 'LOMME'), 'Leroy Merlin');
      if (k % 8 === 3) add(k, -Math.round(70 + rnd() * 25), 'CB TOTALENERGIES RELAIS', 'TotalEnergies');
      if (k % 11 === 5) add(k, -Math.round(40 + rnd() * 160), 'CB POINT P MATERIAUX', 'Point.P');
      if (k % 13 === 7) add(k, -Math.round(12 + rnd() * 20), 'CB BOULANGERIE DU CENTRE', 'Boulangerie du Centre');
      if (k % 30 === 4) add(k, -Math.round(500 + rnd() * 400), 'PRLV SEPA URSSAF NORD PAS DE CALAIS', 'URSSAF');
      if (k % 30 === 10) add(k, -96.5, 'PRLV SEPA SMABTP ASSURANCE DECENNALE', 'SMABTP');
      if (k % 30 === 12) add(k, -36, 'PRLV SEPA ORANGE PRO', 'Orange');
      if (k % 30 === 15) add(k, -9.9, 'FRAIS TENUE DE COMPTE PRO', '');
      if (k % 30 === 20) add(k, -1200, 'VIR EMIS REMUNERATION GERANT', 'Moi');
      if (k % 45 === 22) add(k, -Math.round(150 + rnd() * 250), 'CB MAKITA OUTILLAGE PRO', 'Makita');
    }
    return { name: 'Compte pro (exemple)', bank: 'Banque exemple', demo: true, tx, balance: 8452.37, balanceAt: today() };
  }

  /* ---------- Intégration ---------- */
  EXTRA.treso = page;
  /* retour de la banque après connexion (?bank=ok) : ouvert par boot.js */
  window.trBankReturn = msg => { ui.data = null; view = 'treso'; toast(msg === 'ok' ? '✓ Banque connectée : vos opérations arrivent' : 'Connexion bancaire : ' + msg); };
})();
