'use strict';
/* Statistiques > Comptabilité : recettes, charges, résultat, TVA à reverser, cotisations estimées,
   charges récurrentes, échéances à prévoir et exports (livre des recettes, registre des achats). */
(function () {
  const CATS = ['Achats de matériaux et fournitures', 'Achats de marchandises (revente)', 'Sous-traitance', 'Carburant et déplacements', 'Véhicule (entretien, assurance, leasing)', 'Outillage et matériel', 'Loyer et locaux',
    'Assurances (décennale, RC pro)', 'Téléphone et internet', 'Logiciels et abonnements', 'Banque et frais bancaires', 'Comptable et juridique', 'Publicité et marketing',
    'Cotisations sociales (URSSAF)', 'Impôts et taxes (CFE…)', 'Salaires et charges', 'Repas et réceptions', 'Formation', 'Autres'];
  const PAY = ['Carte bancaire', 'Virement', 'Prélèvement', 'Chèque', 'Espèces'];
  const REC = { none: 'Ponctuelle', monthly: 'Tous les mois', quarterly: 'Tous les trimestres', yearly: 'Tous les ans' };
  const ACT = {   // micro-entreprise : taux de cotisations sociales par défaut (modifiables), versement libératoire, plafond de chiffre d'affaires
    vente: { label: 'Vente de marchandises (BIC)', rate: 12.3, vl: 1, cap: 188700 },
    services: { label: 'Prestations de services artisanales ou commerciales (BIC)', rate: 21.2, vl: 1.7, cap: 77700 },
    bnc: { label: 'Professions libérales (BNC)', rate: 26.1, vl: 2.2, cap: 77700 }
  };
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const cfg = () => { db.compta = Object.assign({ regime: db.company.vatExempt ? 'micro' : 'reel', activity: (typeof sector === 'function' ? sector().act : 'services'), rate: '', vl: false, period: 'month', vatPeriod: 'month', declPeriod: 'month' }, db.compta || {}); if (!Array.isArray(db.expenses)) db.expenses = []; return db.compta; };
  const ui = { cat: '' };

  /* ---------- Périodes ---------- */
  function period() {
    const c = cfg(), ym = statUI.month, y = ym.slice(0, 4), m = Number(ym.slice(5));
    if (c.period === 'year') return { from: y + '-01-01', to: y + '-12-31', label: 'Année ' + y, prev: ymAdd(ym, -12) };
    if (c.period === 'quarter') { const q = Math.ceil(m / 3), a = (q - 1) * 3 + 1, b = a + 2; return { from: `${y}-${String(a).padStart(2, '0')}-01`, to: `${y}-${String(b).padStart(2, '0')}-31`, label: `${q}${q === 1 ? 'er' : 'e'} trimestre ${y}`, prev: ymAdd(ym, -3) }; }
    return { from: ym + '-01', to: ym + '-31', label: ymLabel(ym), prev: ymAdd(ym, -1) };
  }
  const inP = (d, p) => !!d && d >= p.from && d <= p.to;

  /* ---------- Charges (avec les occurrences des charges récurrentes) ---------- */
  function occurrences(p) {
    const out = [];
    for (const e of db.expenses) {
      if (!e.recurring || e.recurring === 'none') { if (inP(e.date, p)) out.push(e); continue; }
      const step = { monthly: 1, quarterly: 3, yearly: 12 }[e.recurring] || 1;
      let d = new Date(e.date + 'T12:00:00');
      for (let i = 0; i < 400; i++) {
        const iso = d.toISOString().slice(0, 10);
        if (iso > p.to || (e.until && iso > e.until) || (p.past !== false && iso > today())) break;   // échéances futures : pas encore des charges
        if (iso >= p.from) out.push({ ...e, date: iso, virtual: i > 0, srcId: e.id });
        d = new Date(d.getFullYear(), d.getMonth() + step, Math.min(d.getDate(), 28), 12);
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  /* ---------- Recettes ---------- */
  function receipts(p) {
    const cashed = db.quotes.filter(q => isInv(q) && q.status === 'payee' && inP(q.paidAt || q.date, p));
    const issued = db.quotes.filter(q => isInv(q) && (q.status === 'envoye' || q.status === 'payee') && inP(q.date, p));
    const sum = (l, k) => r2(l.reduce((s, q) => s + totals(q)[k], 0));
    // ventilation ventes de marchandises / prestations de services (au prorata des lignes de chaque facture)
    const part = (k, nat) => r2(cashed.reduce((s, q) => s + totals(q)[k] * invSplit(q)[nat], 0));
    return { cashed, issued, ttc: sum(cashed, 'ttc'), ht: sum(cashed, 'ht'), vatCashed: sum(cashed, 'vat'), vatIssued: sum(issued, 'vat'), issuedHt: sum(issued, 'ht'),
      venteTtc: part('ttc', 'vente'), serviceTtc: part('ttc', 'service'), venteHt: part('ht', 'vente'), serviceHt: part('ht', 'service') };
  }

  /* Répartition d'un devis facturé en plusieurs fois : les matériaux (ventes) passent en priorité sur les premières factures,
     les prestations ensuite. Ex. devis avec 3 200 € de ventes : une 1re facture de 2 400 € est entièrement « vente »,
     la suivante porte les 800 € de ventes restants puis les services. */
  function quoteAlloc(src) {
    const inv = linkedInvoices(src).filter(i => i.status !== 'annulee');
    const totalV = totals(src).ttc * natSplit(src).vente; let left = totalV; const out = {};
    inv.forEach(i => { const t = totals(i).ttc, v = Math.max(0, Math.min(t, left)); left -= v; out[i.id] = { vente: t > 0 ? v / t : 0, venteTtc: v, totalV }; });
    return out;
  }
  function invSplit(q) {
    const src = q.fromQuoteId && getQuote(q.fromQuoteId);
    if (!src) return natSplit(q);
    const a = quoteAlloc(src)[q.id]; if (!a) return natSplit(q);
    return { vente: a.vente, service: 1 - a.vente };
  }
  window.invoiceNatSplit = invSplit;

  /* Coût des matériaux des factures encaissées : achats réels saisis dans la carte « Rentabilité » du devis,
     sinon prix d'achat du catalogue × quantité (au prorata de la part facturée) */
  const MAT_CATS = ['Achats de matériaux et fournitures', 'Achats de marchandises (revente)'];
  const fold = s => String(s || '').trim().toLowerCase();
  function invoiceMatCost(q, micro) {
    const src = q.fromQuoteId && getQuote(q.fromQuoteId), base = src || q;
    const linesHt = (base.lines || []).filter(l => l.t === 'item').reduce((s, l) => s + num(l.qty) * num(l.price), 0);
    const share = linesHt > 0 ? Math.min(1, totals(q).ht / (src ? totals(src).ht || linesHt : linesHt)) : 0;
    const real = src && src.profit ? src.profit.costs.filter(c => c.kind === 'mat').reduce((s, c) => s + num(c.amount), 0) : 0;
    let est = real;
    if (!real) (base.lines || []).filter(l => l.t === 'item').forEach(l => {
      const c = db.catalog.find(x => (l.ref && x.ref && x.ref === l.ref) || (fold(x.desc) && fold(x.desc) === fold(l.desc)));
      const k = c && typeof itemCost === 'function' ? itemCost(c) : 0;
      if (k > 0) est += k * num(l.qty) * (micro ? 1.2 : 1);                         // prix d'achat connu (catalogue)
      else if (lineNature(l) === 'vente') est += num(l.qty) * num(l.price);   // vente sans prix d'achat : déduite au montant facturé
    });
    if (real) est = real * (micro ? 1.2 : 1);
    // les matériaux suivent la répartition des ventes (priorité aux premières factures)
    let k = share;
    if (src) { const a = quoteAlloc(src)[q.id]; if (a && a.totalV > 0.005) k = Math.min(1, a.venteTtc / a.totalV); }
    return est * k;   // micro : prix d'achat majoré de 20 % de TVA non récupérée
  }

  function figures(p) {
    const c = cfg(), R = receipts(p), E = occurrences(p);
    const chHt = r2(E.reduce((s, e) => s + num(e.ht), 0)), chTtc = r2(E.reduce((s, e) => s + num(e.ttc), 0)), chVat = r2(chTtc - chHt);
    const micro = c.regime === 'micro', act = ACT[c.activity] || ACT.services;
    // micro : cotisations sur les recettes encaissées, avec un taux pour les ventes et un autre pour les prestations
    const sAct = c.activity === 'bnc' ? ACT.bnc : ACT.services;
    const rateV = (num(c.rateV) > 0 ? num(c.rateV) : ACT.vente.rate) + (c.vl ? ACT.vente.vl : 0);
    const rateS = (num(c.rate) > 0 ? num(c.rate) : sAct.rate) + (c.vl ? sAct.vl : 0);
    const cotisV = micro ? r2(R.venteTtc * rateV / 100) : 0, cotisS = micro ? r2(R.serviceTtc * rateS / 100) : 0;
    const cotis = r2(cotisV + cotisS), total = R.ttc > 0 ? cotis / R.ttc * 100 : rateS;
    const vatOut = micro ? 0 : (db.company.vatDebits ? R.vatIssued : R.vatCashed);
    const vatDue = micro ? 0 : r2(vatOut - chVat);
    const recHt = micro ? R.ttc : R.ht;
    // matériaux : on ne compte que ce qui n'est pas déjà saisi en charges « achats de matériaux / marchandises »
    const matEst = r2(R.cashed.reduce((s, q) => s + invoiceMatCost(q, micro), 0));
    const matCharged = r2(E.filter(e => MAT_CATS.includes(e.cat)).reduce((s, e) => s + num(micro ? e.ttc : e.ht), 0));
    const mat = r2(Math.max(0, matEst - matCharged));
    const result = r2(recHt - (micro ? chTtc : chHt) - mat - cotis);
    const cash = r2(R.ttc - chTtc - mat - Math.max(0, vatDue) - cotis);
    return { R, E, chHt, chTtc, chVat, matEst, matCharged, mat, micro, act, sAct, rate: total, rateV, rateS, cotisV, cotisS, cotis, vatOut, vatDue, recHt, result, cash };
  }

  /* ---------- Affichage ---------- */
  const barsByCat = E => {
    const by = {}; E.forEach(e => { by[e.cat || 'Autres'] = (by[e.cat || 'Autres'] || 0) + num(e.ht); });
    const list = Object.entries(by).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...list.map(x => x[1])), tot = list.reduce((s, x) => s + x[1], 0);
    if (!list.length) return '<p class="muted">Aucune charge sur la période.</p>';
    return list.map(([k, v]) => `<div class="cat-bar"><div class="row between"><span>${esc(k)}</span><b>${money(v)} <i>${Math.round(v / tot * 100)} %</i></b></div><div class="cb"><i style="width:${v / max * 100}%"></i></div></div>`).join('');
  };
  function chart12() {
    const ym = statUI.month, W = 760, H = 230, pad = { l: 8, r: 8, t: 12, b: 30 };
    const S = Array.from({ length: 12 }, (_, i) => { const m = ymAdd(ym, i - 11), p = { from: m + '-01', to: m + '-31' }, f = figures(p); return { m, rec: f.recHt, ch: f.micro ? f.chTtc : f.chHt, res: f.result }; });
    const max = Math.max(1, ...S.flatMap(s => [s.rec, s.ch])) * 1.12, min = Math.min(0, ...S.map(s => s.res));
    const span = max - min, y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / span), bw = (W - pad.l - pad.r) / 12, w2 = bw * .32;
    let o = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Recettes, charges et résultat sur 12 mois">`;
    for (let i = 0; i <= 3; i++) { const yy = y(min + span * i / 3); o += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="gl"/>`; }
    o += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" class="gl" style="stroke-opacity:.6"/>`;
    S.forEach((s, i) => {
      const x0 = pad.l + i * bw + bw * .16;
      o += `<rect x="${x0}" y="${y(s.rec)}" width="${w2}" height="${Math.max(0, y(0) - y(s.rec))}" rx="3" class="b-rec"><title>Recettes ${ymLabel(s.m)} : ${money(s.rec)}</title></rect>`;
      o += `<rect x="${x0 + w2 + 2}" y="${y(s.ch)}" width="${w2}" height="${Math.max(0, y(0) - y(s.ch))}" rx="3" class="b-ch"><title>Charges ${ymLabel(s.m)} : ${money(s.ch)}</title></rect>`;
      o += `<text x="${pad.l + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle" class="lab ${s.m === ym ? "cur" : ""}">${ymShort(s.m)}</text>`;
    });
    o += `<polyline class="l-res" fill="none" points="${S.map((s, i) => `${pad.l + i * bw + bw / 2},${y(s.res)}`).join(' ')}"/>`;
    S.forEach((s, i) => { o += `<circle cx="${pad.l + i * bw + bw / 2}" cy="${y(s.res)}" r="3.5" class="d-res"><title>Résultat ${ymLabel(s.m)} : ${money(s.res)}</title></circle>`; });
    return o + '</svg>';
  }
  window.comptaDeadlines = () => deadlines();
  function deadlines() {
    const c = cfg(), now = today(), out = [], y = Number(now.slice(0, 4)), m = Number(now.slice(5, 7));
    const end = (yy, mm) => new Date(yy, mm, 0).toISOString().slice(0, 10);
    if (c.regime === 'micro') {
      if (c.declPeriod === 'quarter') { const q = Math.ceil(m / 3), lm = q * 3 + 1; out.push([end(lm > 12 ? y + 1 : y, lm > 12 ? lm - 12 : lm), `Déclaration URSSAF du ${q}${q === 1 ? 'er' : 'e'} trimestre (chiffre d’affaires encaissé)`]); }
      else out.push([end(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1), `Déclaration URSSAF de ${ymLabel(now.slice(0, 7))} (chiffre d’affaires encaissé)`]);
    } else {
      if (c.vatPeriod === 'quarter') { const q = Math.ceil(m / 3), lm = q * 3 + 1; out.push([`${lm > 12 ? y + 1 : y}-${String(lm > 12 ? lm - 12 : lm).padStart(2, '0')}-24`, `Déclaration de TVA du ${q}${q === 1 ? 'er' : 'e'} trimestre (date indicative)`]); }
      else out.push([`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-24`, `Déclaration de TVA de ${ymLabel(now.slice(0, 7))} (CA3, date indicative)`]);
    }
    out.push([`${y}-12-15`, 'Cotisation foncière des entreprises (CFE) : paiement du solde']);
    occurrences({ from: now, to: ymAdd(now.slice(0, 7), 1) + '-31', past: false }).filter(e => e.recurring && e.recurring !== 'none').slice(0, 5).forEach(e => out.push([e.date, `${e.label} — ${money(num(e.ttc))}`]));
    return out.filter(d => d[0] >= now).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 6);
  }

  function comptaHtml() {
    const c = cfg(), p = period(), F = figures(p), pp = (() => { const ym = p.prev; const sm = statUI.month; statUI.month = ym; const r = period(); statUI.month = sm; return r; })(), PF = figures(pp);
    const y = statUI.month.slice(0, 4), YR = receipts({ from: y + '-01-01', to: y + '-12-31' }), yearCash = YR.ttc, cap = F.act.cap;
    const capBar = (label, v, max) => `<div class="cat-bar"><div class="row between"><span>${label} (${money(max)})</span><b>${Math.round(v / max * 100)} %</b></div><div class="cb"><i style="width:${Math.min(100, v / max * 100)}%"></i></div></div>`;
    const list = F.E.filter(e => !ui.cat || e.cat === ui.cat);
    const card = (n, l, sub, extra = '') => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div><div class="cmp">${extra}</div>${sub ? `<div class="sub2">${sub}</div>` : ''}</div>`;
    const cats = [...new Set(F.E.map(e => e.cat || 'Autres'))];
    return `
    <div class="row between" style="margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div class="seg2">${[['month', 'Mois'], ['quarter', 'Trimestre'], ['year', 'Année']].map(([k, l]) => `<button data-act="cp-period" data-p="${k}" class="${c.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="monthnav"><button class="btn small" data-act="cp-move" data-d="-1" aria-label="Période précédente">‹</button><b>${esc(p.label)}</b><button class="btn small" data-act="cp-move" data-d="1" aria-label="Période suivante">›</button></div>
      <div class="row"><button class="btn" data-act="cp-export" data-k="recettes" title="Obligatoire pour les micro-entreprises">⬇ Livre des recettes</button><button class="btn" data-act="cp-export" data-k="achats">⬇ Registre des charges</button><button class="btn" data-act="bilan-open" title="Synthèse annuelle, déclarations à faire et où les envoyer">📋 Bilan de l’année</button><button class="btn primary" data-act="exp-new">＋ Ajouter une charge</button></div>
    </div>
    <div class="stats">
      ${card(money(F.R.ttc), `Recettes encaissées (${F.R.cashed.length})`, (F.R.venteTtc > 0.005 && F.R.serviceTtc > 0.005) || F.R.venteTtc > 0.005 ? `Ventes ${money(F.micro ? F.R.venteTtc : F.R.venteHt)} · Services ${money(F.micro ? F.R.serviceTtc : F.R.serviceHt)}${F.micro ? '' : ' (HT)'}` : F.micro ? 'Prestations de services' : `dont ${money(F.R.ht)} HT`, cmp(F.R.ttc, PF.R.ttc, 'vs période préc.'))}
      ${card(money(F.micro ? F.chTtc : F.chHt), `Charges${F.micro ? '' : ' HT'} (${F.E.length})`, F.micro ? 'Dépenses de la période' : `dont ${money(F.chVat)} de TVA déductible`, cmp(F.micro ? F.chTtc : F.chHt, F.micro ? PF.chTtc : PF.chHt, 'vs période préc.', false))}
      ${card(`<span style="color:${F.result < 0 ? 'var(--danger)' : 'inherit'}">${money(F.result)}</span>`, F.micro ? 'Reste après charges, matériaux et cotisations' : 'Résultat avant impôt', (F.micro ? 'Recettes − charges' : 'Recettes HT − charges HT') + (F.matEst > 0.005 ? ` − matériaux / part vente ${money(F.mat)}${F.matCharged > 0.005 ? ` (${money(F.matEst)}, dont ${money(F.matCharged)} déjà en charges)` : ''}` : '') + (F.micro ? ' − cotisations estimées' : ''), cmp(F.result, PF.result, 'vs période préc.'))}
      ${F.micro ? card(money(F.cotis), 'Cotisations URSSAF estimées', [F.R.venteTtc > 0.005 && `${fmtNum.format(F.rateV)} % des ventes (${money(F.cotisV)})`, (F.R.serviceTtc > 0.005 || !(F.R.venteTtc > 0.005)) && `${fmtNum.format(F.rateS)} % des services (${money(F.cotisS)})`].filter(Boolean).join(' + ') + (c.vl ? ' — avec versement libératoire' : ''))
        : card(`<span style="color:${F.vatDue < 0 ? 'var(--ok)' : 'inherit'}">${money(Math.abs(F.vatDue))}</span>`, F.vatDue < 0 ? 'Crédit de TVA' : 'TVA à reverser', `Collectée ${money(F.vatOut)} − déductible ${money(F.chVat)}${db.company.vatDebits ? ' (sur les débits)' : ' (sur les encaissements)'}`)}
    </div>
    <div class="grid2" style="margin-bottom:16px;align-items:stretch">
      <div class="card"><h2>Charges par catégorie</h2>${barsByCat(F.E)}</div>
      <div class="card"><h2>Trésorerie et repères</h2>
        <div class="big-n" style="color:${F.cash < 0 ? 'var(--danger)' : 'inherit'}">${money(F.cash)}</div>
        <p class="muted" style="margin:4px 0 14px;font-size:.86rem">Ce qui reste de la période : encaissé − charges${F.micro ? ' − cotisations estimées' : ' − TVA à reverser'}.</p>
        ${F.micro ? (YR.venteTtc > 0.005
          ? `${capBar(`Plafond total ${y} — ventes + services`, yearCash, ACT.vente.cap)}${capBar(`Dont plafond services ${y}`, YR.serviceTtc, F.sAct.cap)}
          <p class="muted" style="font-size:.8rem;margin:6px 0 14px">Depuis janvier : ventes ${money(YR.venteTtc)}, services ${money(YR.serviceTtc)}. Activité mixte : le total ne doit pas dépasser ${money(ACT.vente.cap)} et les services ${money(F.sAct.cap)}. Plafonds indicatifs, à vérifier sur urssaf.fr.</p>`
          : `${capBar(`Plafond micro-entreprise ${y}`, yearCash, F.sAct.cap)}
          <p class="muted" style="font-size:.8rem;margin:6px 0 14px">${money(yearCash)} encaissés depuis janvier. Plafond indicatif pour les prestations de services, à vérifier sur urssaf.fr.</p>`) : ''}
        <h3 style="margin:6px 0 8px;font-size:.95rem">À prévoir</h3>
        ${deadlines().map(([d, t]) => `<div class="dl-row"><b>${fdate(d)}</b><span>${esc(t)}</span></div>`).join('') || '<p class="muted">Rien à venir.</p>'}
      </div>
    </div>
    <div class="card" style="margin-bottom:16px"><div class="row between" style="flex-wrap:wrap;gap:8px"><h2 style="margin:0">Recettes, charges et résultat — 12 mois</h2>
      <div class="legend"><span><i class="lg rec"></i>Recettes</span><span><i class="lg ch"></i>Charges</span><span><i class="lg res"></i>Résultat</span></div></div>${chart12()}</div>
    <div class="card" style="margin-bottom:16px"><div class="row between" style="flex-wrap:wrap;gap:8px;margin-bottom:10px"><h2 style="margin:0">Charges — ${esc(p.label)}</h2>
      ${cats.length > 1 ? `<div class="chips"><button class="cchip ${!ui.cat ? 'on' : ''}" data-act="exp-cat" data-c="">Toutes</button>${cats.map(k => `<button class="cchip ${ui.cat === k ? 'on' : ''}" data-act="exp-cat" data-c="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}</div>
      ${list.length ? `<table class="list"><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th class="right">HT</th><th class="right">TVA</th><th class="right">TTC</th><th>Paiement</th><th></th></tr></thead><tbody>
        ${list.map(e => `<tr><td data-label="Date">${fdate(e.date)}</td><td data-label="Libellé"><b>${esc(e.label)}</b>${e.supplier ? `<div class="muted" style="font-size:.8rem">${esc(e.supplier)}</div>` : ''}${e.recurring && e.recurring !== 'none' ? ` <span class="badge brouillon" title="${REC[e.recurring]}">↻ ${REC[e.recurring].toLowerCase()}</span>` : ''}</td>
          <td data-label="Catégorie">${esc(e.cat || 'Autres')}</td><td class="right" data-label="HT">${money(num(e.ht))}</td><td class="right" data-label="TVA">${money(num(e.ttc) - num(e.ht))}</td><td class="right" data-label="TTC"><b>${money(num(e.ttc))}</b></td>
          <td data-label="Paiement">${esc(e.pay || '')}</td><td class="right" style="white-space:nowrap"><button class="btn small" data-act="exp-edit" data-id="${e.srcId || e.id}">Modifier</button> <button class="btn small danger" data-act="exp-del" data-id="${e.srcId || e.id}" title="Supprimer">🗑</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Aucune charge sur la période.<br><br><button class="btn primary" data-act="exp-new">＋ Ajouter une charge</button></div>`}
    </div>
    <details class="card"><summary style="cursor:pointer"><b>Régime et réglages</b> <span class="muted" style="font-size:.85rem">— ${F.micro ? 'Micro-entreprise' : 'Régime réel (TVA)'}</span></summary>
      <div class="grid2" style="margin-top:14px">
        <div class="field"><label>Régime</label><select data-cp="regime"><option value="micro" ${c.regime === 'micro' ? 'selected' : ''}>Micro-entreprise</option><option value="reel" ${c.regime === 'reel' ? 'selected' : ''}>Régime réel (avec TVA)</option></select></div>
        ${c.regime === 'micro' ? `
        <div class="field"><label>Activité principale (lignes dont la nature n’est pas précisée)</label><select data-cp="activity">${Object.entries(ACT).map(([k, a]) => `<option value="${k}" ${c.activity === k ? 'selected' : ''}>${a.label}</option>`).join('')}</select></div>
        <div class="field"><label>Taux sur les prestations de services (%) — vide = ${fmtNum.format(F.sAct.rate)} %</label><input type="number" step="0.1" data-cp="rate" value="${esc(c.rate)}" placeholder="${F.sAct.rate}"></div>
        <div class="field"><label>Taux sur les ventes de marchandises (%) — vide = ${fmtNum.format(ACT.vente.rate)} %</label><input type="number" step="0.1" data-cp="rateV" value="${esc(c.rateV || '')}" placeholder="${ACT.vente.rate}"></div>
        <div class="field"><label>Déclaration URSSAF</label><select data-cp="declPeriod"><option value="month" ${c.declPeriod === 'month' ? 'selected' : ''}>Mensuelle</option><option value="quarter" ${c.declPeriod === 'quarter' ? 'selected' : ''}>Trimestrielle</option></select></div>
        <label class="check"><input type="checkbox" data-cp="vl" ${c.vl ? 'checked' : ''}> Versement libératoire de l’impôt sur le revenu (+${fmtNum.format(ACT.vente.vl)} % sur les ventes, +${fmtNum.format(F.sAct.vl)} % sur les services)</label>
        <p class="muted" style="font-size:.8rem;margin:0;grid-column:1/-1">Chaque ligne de vos devis et factures porte une étiquette <b>Service</b> ou <b>Vente</b> (cliquez dessus pour la changer). Les ventes de marchandises (ou les fournitures facturées à part) ont un taux et un plafond différents des prestations : les deux montants sont à déclarer séparément à l’URSSAF.</p>`
        : `<div class="field"><label>Déclaration de TVA</label><select data-cp="vatPeriod"><option value="month" ${c.vatPeriod === 'month' ? 'selected' : ''}>Mensuelle</option><option value="quarter" ${c.vatPeriod === 'quarter' ? 'selected' : ''}>Trimestrielle</option></select></div>`}
      </div>
      <p class="muted" style="font-size:.8rem;margin:6px 0 0">Les montants sont des <b>estimations</b> calculées à partir de vos factures payées et des charges saisies. Les taux par défaut sont indicatifs : vérifiez-les sur urssaf.fr et impots.gouv.fr, et faites valider vos déclarations par votre comptable.</p>
    </details>`;
  }

  /* ---------- Saisie d'une charge ---------- */
  function expModal(id) {
    const e = db.expenses.find(x => x.id === id) || { date: today(), label: '', supplier: '', cat: 'Achats de matériaux et fournitures', ht: '', vat: db.company.vatExempt ? 0 : 20, ttc: '', pay: 'Carte bancaire', recurring: 'none', until: '', note: '' };
    const m = openModal(`<form id="expForm"><h2>${id ? 'Modifier la charge' : 'Nouvelle charge'}</h2>
      <div class="grid2"><div class="field"><label>Date *</label><input type="date" name="date" value="${e.date}" required></div>
        <div class="field"><label>Catégorie</label><select name="cat">${CATS.map(k => `<option ${e.cat === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div></div>
      <div class="field"><label>Libellé *</label><input name="label" value="${esc(e.label)}" required placeholder="Ex : achat de marchandises, plein de carburant, assurance, abonnement…"></div>
      <div class="field"><label>Fournisseur</label><input name="supplier" list="expSup" value="${esc(e.supplier)}"><datalist id="expSup">${db.suppliers.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist></div>
      <div class="grid3"><div class="field"><label>Montant TTC *</label><input type="number" step="0.01" name="ttc" value="${e.ttc}"></div>
        <div class="field"><label>TVA</label><select name="vat">${[0, 5.5, 10, 20].map(v => `<option value="${v}" ${num(e.vat) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></div>
        <div class="field"><label>Montant HT</label><input type="number" step="0.01" name="ht" value="${e.ht}"></div></div>
      <div class="grid2"><div class="field"><label>Paiement</label><select name="pay">${PAY.map(k => `<option ${e.pay === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label>Récurrence</label><select name="recurring">${Object.entries(REC).map(([k, l]) => `<option value="${k}" ${e.recurring === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field" id="untilF" ${e.recurring === 'none' ? 'hidden' : ''}><label>Jusqu’au (facultatif)</label><input type="date" name="until" value="${e.until || ''}"></div>
      <div class="field"><label>Note</label><input name="note" value="${esc(e.note || '')}" placeholder="N° de facture fournisseur, chantier…"></div>
      <div class="form-err" hidden></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
    const f = m.querySelector('#expForm'), E = f.elements;
    const fromTtc = () => { E.ht.value = E.ttc.value === '' ? '' : r2(num(E.ttc.value) / (1 + num(E.vat.value) / 100)); };
    E.ttc.oninput = fromTtc; E.vat.onchange = fromTtc; E.ht.oninput = () => { E.ttc.value = E.ht.value === '' ? '' : r2(num(E.ht.value) * (1 + num(E.vat.value) / 100)); };
    E.recurring.onchange = () => { f.querySelector('#untilF').hidden = E.recurring.value === 'none'; };
    f.onsubmit = ev => {
      ev.preventDefault();
      if (!E.label.value.trim() || !E.date.value || !(num(E.ttc.value) > 0)) { const er = f.querySelector('.form-err'); er.hidden = false; er.textContent = 'Indiquez la date, le libellé et le montant TTC.'; return; }
      const data = { date: E.date.value, label: E.label.value.trim(), supplier: E.supplier.value.trim(), cat: E.cat.value, ttc: r2(num(E.ttc.value)), vat: num(E.vat.value), ht: E.ht.value === '' ? r2(num(E.ttc.value) / (1 + num(E.vat.value) / 100)) : r2(num(E.ht.value)), pay: E.pay.value, recurring: E.recurring.value, until: E.recurring.value === 'none' ? '' : E.until.value, note: E.note.value.trim() };
      if (id) Object.assign(db.expenses.find(x => x.id === id), data); else db.expenses.push({ id: uid(), ...data });
      save(); m.close(); toast(id ? 'Charge modifiée' : 'Charge ajoutée'); render();
    };
    setTimeout(() => E.label.focus(), 30);
  }

  /* ---------- Exports CSV (séparateur ; , virgule décimale, ouverture directe dans Excel) ---------- */
  function exportCsv(kind, p) {
    p = p || period(); const n = v => String(r2(v)).replace('.', ','), q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    let rows, name;
    if (kind === 'recettes') {
      rows = [['Date d’encaissement', 'N° de facture', 'Client', 'Objet', 'Montant HT', 'TVA', 'Montant TTC', 'Dont ventes de marchandises (TTC)', 'Dont prestations de services (TTC)', 'Mode de règlement']];
      receipts(p).cashed.sort((a, b) => (a.paidAt || a.date).localeCompare(b.paidAt || b.date)).forEach(f => { const t = totals(f), sp = invSplit(f); rows.push([f.paidAt || f.date, f.number, (f.clientText || '').split('\n')[0], f.title || '', n(t.ht), n(t.vat), n(t.ttc), n(t.ttc * sp.vente), n(t.ttc * sp.service), f.payMethod || '']); });
      name = 'livre-des-recettes';
    } else {
      rows = [['Date', 'Libellé', 'Fournisseur', 'Catégorie', 'Montant HT', 'TVA', 'Montant TTC', 'Paiement', 'Note']];
      occurrences(p).reverse().forEach(e => rows.push([e.date, e.label, e.supplier, e.cat, n(num(e.ht)), n(num(e.ttc) - num(e.ht)), n(num(e.ttc)), e.pay, e.note || '']));
      name = 'registre-des-charges';
    }
    const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `${name}-${p.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Export téléchargé');
  }


  /* ---------- Bilan de l'année : synthèse complète + où et quand déclarer ---------- */
  const FORMS = { ei_micro: 'Entreprise individuelle — micro-entreprise', ei_reel: 'Entreprise individuelle au régime réel', societe_is: 'Société (EURL, SARL, SAS, SASU…)' };
  const CASES = { vente: ['5KO', '5TA'], services: ['5KP', '5TB'], bnc: ['5HQ', '5TE'] };   // déclaration 2042-C-PRO : sans / avec versement libératoire
  function yearData(y) {
    const P = { from: y + '-01-01', to: y + '-12-31' }, F = figures(P);
    const months = Array.from({ length: 12 }, (_, i) => { const m = `${y}-${String(i + 1).padStart(2, '0')}`, f = figures({ from: m + '-01', to: m + '-31' }); return { m, f }; });
    const quarters = [0, 1, 2, 3].map(k => months.slice(k * 3, k * 3 + 3).reduce((s, x) => ({ ttc: s.ttc + x.f.R.ttc, v: s.v + x.f.R.venteTtc, sv: s.sv + x.f.R.serviceTtc, cotis: s.cotis + x.f.cotis }), { ttc: 0, v: 0, sv: 0, cotis: 0 }));
    const byCat = {}; F.E.forEach(e => { const k = e.cat || 'Autres'; byCat[k] = (byCat[k] || 0) + (F.micro ? num(e.ttc) : num(e.ht)); });
    const unpaid = db.quotes.filter(q => isInv(q) && q.status === 'envoye' && q.date && q.date <= P.to);
    return { y, P, F, months, quarters, byCat, unpaid };
  }
  function steps(D) {
    const c = cfg(), y = Number(D.y), n = y + 1, form = c.form || (c.regime === 'micro' ? 'ei_micro' : 'ei_reel'), out = [];
    const L = (t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`;
    if (form === 'ei_micro') {
      const cs = CASES[c.activity === 'bnc' ? 'bnc' : 'services'] || CASES.services, cv = CASES.vente;
      out.push([`Chaque ${c.declPeriod === 'quarter' ? 'trimestre' : 'mois'}`, 'Déclarer le chiffre d’affaires encaissé à l’URSSAF et payer les cotisations', `Montants à déclarer : tableau « ${c.declPeriod === 'quarter' ? 'Par trimestre' : 'Par mois'} » ci-dessus${D.F.R.venteTtc > 0.005 ? ', en séparant bien les ventes de marchandises et les prestations de services (deux lignes distinctes sur la déclaration)' : ''}. Même à 0 € si vous n’avez rien encaissé.`, L('autoentrepreneur.urssaf.fr', 'https://www.autoentrepreneur.urssaf.fr')]);
      out.push([`Mai – juin ${n}`, `Déclaration de revenus ${y} (formulaire 2042-C-PRO)`, `Reportez le chiffre d’affaires annuel : ${D.F.R.venteTtc > 0.005 ? `ventes de marchandises ${money(D.F.R.venteTtc)} en case ${c.vl ? cv[1] : cv[0]}, prestations de services ${money(D.F.R.serviceTtc)} en case ${c.vl ? cs[1] : cs[0]}${c.vl ? ' (versement libératoire)' : ''}` : `${money(D.F.R.ttc)} en case ${c.vl ? cs[1] + ' (versement libératoire)' : cs[0]}`}. Pas de bilan ni de liasse fiscale à faire en micro-entreprise : l’abattement forfaitaire est appliqué par l’administration.`, L('impots.gouv.fr', 'https://www.impots.gouv.fr')]);
      out.push([`15 décembre ${n}`, 'Cotisation foncière des entreprises (CFE)', 'L’avis est à consulter et payer dans votre espace professionnel (pas d’envoi papier).', L('Espace professionnel impots.gouv.fr', 'https://www.impots.gouv.fr')]);
      out.push(['À conserver', 'Livre des recettes et registre des achats', 'Téléchargez-les dans OptiDevis (Statistiques › Comptabilité) et gardez-les (avec vos factures) au moins 10 ans. Ils ne sont pas à envoyer, sauf contrôle.', '']);
    } else {
      out.push([c.vatPeriod === 'quarter' ? 'Chaque trimestre' : 'Chaque mois', 'Déclaration et paiement de la TVA', `TVA de l’année : collectée ${money(D.F.vatOut)} − déductible ${money(D.F.chVat)} = ${money(D.F.vatDue)}${D.F.vatDue < 0 ? ' (crédit)' : ''}. Détail mois par mois ci-dessus. Au régime simplifié : une déclaration annuelle CA12 (début mai) et deux acomptes (juillet et décembre).`, L('Espace professionnel impots.gouv.fr', 'https://www.impots.gouv.fr')]);
      out.push([`Début mai ${n}`, form === 'societe_is' ? 'Liasse fiscale et déclaration de résultat (2065 + 2033 ou 2050)' : 'Liasse fiscale (2031 + 2033 pour les BIC, 2035 pour les BNC)', 'Elle se transmet obligatoirement par voie électronique, en général par votre expert-comptable. Donnez-lui le dossier de clôture d’OptiDevis (bouton « Dossier complet » : bilan PDF, livre des recettes, registre des charges). La date limite exacte est publiée chaque année sur impots.gouv.fr.', L('impots.gouv.fr', 'https://www.impots.gouv.fr')]);
      if (form === 'ei_reel') out.push([`Mai – juin ${n}`, `Déclaration de revenus ${y} (2042-C-PRO)`, 'Reportez le résultat de la liasse fiscale (votre comptable vous indique les cases).', L('impots.gouv.fr', 'https://www.impots.gouv.fr')]);
      if (form === 'societe_is') {
        out.push([`Avant le 15 mai ${n}`, 'Solde de l’impôt sur les sociétés (formulaire 2572)', 'Calculé par votre comptable à partir de la liasse.', L('impots.gouv.fr', 'https://www.impots.gouv.fr')]);
        out.push([`Dans les 6 mois`, 'Approbation des comptes (assemblée ou décision de l’associé unique)', 'Procès-verbal à rédiger et signer, souvent préparé par le comptable.', '']);
        out.push([`Dans le mois qui suit`, 'Dépôt des comptes annuels au greffe', 'Bilan, compte de résultat et procès-verbal, déposés en ligne.', L('Guichet unique', 'https://formalites.entreprises.gouv.fr')]);
      }
      out.push([`15 décembre ${n}`, 'Cotisation foncière des entreprises (CFE)', 'À payer dans votre espace professionnel.', L('impots.gouv.fr', 'https://www.impots.gouv.fr')]);
      out.push(['À conserver', 'Factures, justificatifs de charges, relevés bancaires', 'Au moins 10 ans (6 ans pour le contrôle fiscal).', '']);
    }
    return out;
  }
  function bilanHtml(D, forPdf) {
    const c = cfg(), F = D.F, co = db.company, micro = F.micro, mixed = micro && F.R.venteTtc > 0.005;
    const th = 'style="text-align:left;padding:6px 8px;border-bottom:1.5px solid #222;font-size:9pt"', thr = 'style="text-align:right;padding:6px 8px;border-bottom:1.5px solid #222;font-size:9pt"';
    const td = 'style="padding:5px 8px;border-bottom:1px solid #ddd;font-size:9pt"', tdr = 'style="padding:5px 8px;border-bottom:1px solid #ddd;font-size:9pt;text-align:right;white-space:nowrap"';
    const tot = 'style="padding:6px 8px;font-size:9.5pt;font-weight:700;text-align:right;border-top:1.5px solid #222"', totl = 'style="padding:6px 8px;font-size:9.5pt;font-weight:700;border-top:1.5px solid #222"';
    const h2 = 'style="font-size:12pt;margin:18px 0 6px;color:#111"';
    const cats = Object.entries(D.byCat).sort((a, b) => b[1] - a[1]);
    const box = (l, v, sub) => `<div style="flex:1;min-width:150px;border:1px solid #ddd;border-radius:8px;padding:10px 12px"><div style="font-size:8.5pt;color:#666">${l}</div><div style="font-size:15pt;font-weight:700;margin-top:2px">${v}</div>${sub ? `<div style="font-size:8pt;color:#777;margin-top:2px">${sub}</div>` : ''}</div>`;
    return `<div style="font-family:Nunito,Arial,sans-serif;color:#111">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
        <div><div style="font-size:18pt;font-weight:800">Bilan de l’année ${D.y}</div><div style="font-size:10pt;color:#555;margin-top:2px">Du 1er janvier au 31 décembre ${D.y} — établi le ${fdate(today())}</div></div>
        <div style="text-align:right;font-size:9pt;line-height:1.4"><b>${esc(co.name || '')}</b><br>${esc(co.address || '').replace(/\n/g, '<br>')}${co.siret ? `<br>SIRET : ${esc(co.siret)}` : ''}<br>${esc(FORMS[c.form] || (micro ? FORMS.ei_micro : FORMS.ei_reel))}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        ${box('Chiffre d’affaires encaissé', money(F.R.ttc), micro ? '' : `${money(F.R.ht)} HT`)}
        ${box(micro ? 'Charges payées' : 'Charges HT', money(micro ? F.chTtc : F.chHt), `${F.E.length} dépense${F.E.length > 1 ? 's' : ''}`)}
        ${box(micro ? 'Reste après charges, matériaux et cotisations' : 'Résultat avant impôt', money(F.result), (micro ? '' : 'Recettes HT − charges HT') + (F.mat > 0.005 ? ` (matériaux ${money(F.mat)} déduits)` : ''))}
        ${micro ? box('Cotisations URSSAF estimées', money(F.cotis), F.R.venteTtc > 0.005 ? `${fmtNum.format(F.rateV)} % des ventes + ${fmtNum.format(F.rateS)} % des services` : `${fmtNum.format(F.rate)} % du CA`) : box(F.vatDue < 0 ? 'Crédit de TVA' : 'TVA à reverser', money(Math.abs(F.vatDue)), `collectée ${money(F.vatOut)} − déductible ${money(F.chVat)}`)}
      </div>
      <div ${h2}>${micro ? 'Recettes et charges' : 'Compte de résultat simplifié'}</div>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Poste</th><th ${thr}>Montant${micro ? '' : ' HT'}</th></tr></thead><tbody>
        <tr><td ${td}><b>Chiffre d’affaires (factures encaissées)</b></td><td ${tdr}><b>${money(F.recHt)}</b></td></tr>
        ${cats.map(([k, v]) => `<tr><td ${td}>&nbsp;&nbsp;− ${esc(k)}</td><td ${tdr}>${money(v)}</td></tr>`).join('')}
        ${F.mat > 0.005 ? `<tr><td ${td}>&nbsp;&nbsp;− Matériaux / part vente des factures encaissées (prix d’achat ou montant vendu, hors charges déjà saisies)</td><td ${tdr}>${money(F.mat)}</td></tr>` : ''}
        ${micro ? `<tr><td ${td}>&nbsp;&nbsp;− Cotisations URSSAF estimées</td><td ${tdr}>${money(F.cotis)}</td></tr>` : ''}
        <tr><td ${totl}>${micro ? 'Reste' : 'Résultat'}</td><td ${tot}>${money(F.result)}</td></tr></tbody></table>
      <div ${h2}>${micro ? (c.declPeriod === 'quarter' ? 'Par trimestre (à déclarer à l’URSSAF)' : 'Par mois (à déclarer à l’URSSAF)') : 'Par mois'}</div>
      ${micro && c.declPeriod === 'quarter'
        ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Trimestre</th>${mixed ? `<th ${thr}>Ventes de marchandises</th><th ${thr}>Prestations de services</th>` : ''}<th ${thr}>CA encaissé</th><th ${thr}>Cotisations estimées</th></tr></thead><tbody>${D.quarters.map((x, i) => `<tr><td ${td}>${i + 1}${i ? 'e' : 'er'} trimestre</td>${mixed ? `<td ${tdr}>${money(x.v)}</td><td ${tdr}>${money(x.sv)}</td>` : ''}<td ${tdr}>${money(x.ttc)}</td><td ${tdr}>${money(x.cotis)}</td></tr>`).join('')}</tbody></table>`
        : `<table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Mois</th>${mixed ? `<th ${thr}>Ventes</th><th ${thr}>Services</th>` : ''}<th ${thr}>Encaissé</th><th ${thr}>Charges</th>${micro ? `<th ${thr}>Cotisations</th>` : `<th ${thr}>TVA collectée</th><th ${thr}>TVA déductible</th><th ${thr}>TVA due</th>`}<th ${thr}>Résultat</th></tr></thead><tbody>
          ${D.months.map(({ m, f }) => `<tr><td style="padding:5px 8px;border-bottom:1px solid #ddd;font-size:9pt;text-transform:capitalize">${ymLabel(m)}</td>${mixed ? `<td ${tdr}>${money(f.R.venteTtc)}</td><td ${tdr}>${money(f.R.serviceTtc)}</td>` : ''}<td ${tdr}>${money(f.R.ttc)}</td><td ${tdr}>${money(micro ? f.chTtc : f.chHt)}</td>${micro ? `<td ${tdr}>${money(f.cotis)}</td>` : `<td ${tdr}>${money(f.vatOut)}</td><td ${tdr}>${money(f.chVat)}</td><td ${tdr}>${money(f.vatDue)}</td>`}<td ${tdr}>${money(f.result)}</td></tr>`).join('')}
          <tr><td ${totl}>Total</td>${mixed ? `<td ${tot}>${money(F.R.venteTtc)}</td><td ${tot}>${money(F.R.serviceTtc)}</td>` : ''}<td ${tot}>${money(F.R.ttc)}</td><td ${tot}>${money(micro ? F.chTtc : F.chHt)}</td>${micro ? `<td ${tot}>${money(F.cotis)}</td>` : `<td ${tot}>${money(F.vatOut)}</td><td ${tot}>${money(F.chVat)}</td><td ${tot}>${money(F.vatDue)}</td>`}<td ${tot}>${money(F.result)}</td></tr></tbody></table>`}
      ${D.unpaid.length ? `<div ${h2}>Factures non encaissées au 31/12 (créances clients)</div>
        <table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Facture</th><th ${th}>Date</th><th ${th}>Client</th><th ${thr}>Reste dû</th></tr></thead><tbody>${D.unpaid.map(q => `<tr><td ${td}>${esc(q.number)}</td><td ${td}>${fdate(q.date)}</td><td ${td}>${esc((q.clientText || '').split('\n')[0])}</td><td ${tdr}>${money(totals(q).due)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div ${h2}>Ce qu’il faut faire, où et quand</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${steps(D).map(([w, t, d, l]) => `<tr><td style="vertical-align:top;white-space:nowrap;font-weight:700;padding:7px 8px;border-bottom:1px solid #ddd;font-size:9pt">${w}</td><td style="padding:7px 8px;border-bottom:1px solid #ddd;font-size:9pt"><b>${t}</b><br><span style="color:#555">${d}</span>${l && !forPdf ? `<br>${l}` : l ? `<br><span style="color:#555">${l.replace(/<[^>]+>/g, '').replace(' ↗', '')}</span>` : ''}</td></tr>`).join('')}</tbody></table>
      <p style="font-size:7.5pt;color:#777;margin-top:14px">Document de synthèse établi par OptiDevis à partir des factures encaissées et des charges saisies. Les cotisations et la TVA sont des estimations ; les taux, cases et dates sont indicatifs et doivent être vérifiés sur urssaf.fr et impots.gouv.fr. Il ne remplace pas les comptes annuels certifiés par un expert-comptable.</p>
    </div>`;
  }
  let bilanYear = null;
  function bilanModal() {
    const y0 = Number(today().slice(0, 4)), y = bilanYear || (Number(today().slice(5, 7)) <= 6 ? y0 - 1 : y0), D = yearData(String(y)), c = cfg();
    const years = [y0, y0 - 1, y0 - 2];
    openModal(`<div class="modal-wide" id="bilanBox" style="max-width:980px"><div class="row between" style="flex-wrap:wrap;gap:10px"><h2 style="margin:0">Bilan de l’année</h2>
        <div class="row"><div class="seg2">${years.map(v => `<button data-act="bilan-year" data-y="${v}" class="${v === y ? 'on' : ''}">${v}</button>`).join('')}</div><button class="btn small" data-act="close-modal">Fermer</button></div></div>
      <div class="grid2" style="margin:12px 0"><div class="field"><label>Statut de l’entreprise</label><select data-cp="form" id="bilanForm">${Object.entries(FORMS).map(([k, l]) => `<option value="${k}" ${(c.form || (c.regime === 'micro' ? 'ei_micro' : 'ei_reel')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="row" style="align-items:flex-end;justify-content:flex-end;flex-wrap:wrap;gap:8px"><button class="btn primary" data-act="bilan-pdf">⬇ Bilan PDF</button><button class="btn" data-act="bilan-all">⬇ Dossier complet (PDF + exports)</button></div></div>
      <div class="bilan-prev">${bilanHtml(D)}</div></div>`);
    document.getElementById('bilanForm').onchange = e => { cfg().form = e.target.value; if (e.target.value === 'ei_micro') cfg().regime = 'micro'; else cfg().regime = 'reel'; save(); bilanModal(); };
  }
  async function bilanPdf(y) {
    const D = yearData(String(y));
    const r = await fetch('/api/pdf', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sitedevis' },
      body: JSON.stringify({ html: bilanHtml(D, true), accent: '#111111', label: 'Bilan ' + y, date: fdate(today()), filename: `bilan-${y}` }) });
    if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) { /* ignore */ } throw new Error(m || 'Erreur ' + r.status); }
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = url; a.download = `bilan-${y}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const curBilanYear = () => bilanYear || (Number(today().slice(5, 7)) <= 6 ? Number(today().slice(0, 4)) - 1 : Number(today().slice(0, 4)));

  /* ---------- Onglets dans Statistiques ---------- */
  const baseStats = EXTRA.stats;
  EXTRA.stats = function () {
    cfg(); statUI.tab = statUI.tab || 'activity';
    const tabs = `<div class="tabs" style="margin-bottom:18px"><button data-act="stat-tab" data-t="activity" class="${statUI.tab === 'activity' ? 'on' : ''}">Activité</button><button data-act="stat-tab" data-t="compta" class="${statUI.tab === 'compta' ? 'on' : ''}">Comptabilité</button></div>`;
    if (statUI.tab !== 'compta') return tabs + baseStats();
    return `<h1 style="margin:0 0 12px">Statistiques</h1>${tabs}${comptaHtml()}`;
  };
  Object.assign(actions, {
    'stat-tab'(t) { statUI.tab = t.dataset.t; render(); },
    'cp-period'(t) { cfg().period = t.dataset.p; save(); render(); },
    'cp-move'(t) { const c = cfg(), k = c.period === 'year' ? 12 : c.period === 'quarter' ? 3 : 1; statUI.month = ymAdd(statUI.month, Number(t.dataset.d) * k); render(); },
    'cp-export'(t) { exportCsv(t.dataset.k); },
    'bilan-open'() { bilanYear = null; bilanModal(); },
    'bilan-year'(t) { bilanYear = Number(t.dataset.y); bilanModal(); },
    async 'bilan-pdf'(t) { if (!session.config.pdf) return window.print(); const old = t.innerHTML; t.disabled = true; t.textContent = 'Création…'; try { await bilanPdf(curBilanYear()); toast('Bilan téléchargé'); } catch (e) { toast('PDF impossible : ' + e.message); } t.disabled = false; t.innerHTML = old; },
    async 'bilan-all'(t) { const y = curBilanYear(), P = { from: y + '-01-01', to: y + '-12-31', label: 'Année ' + y }; const old = t.innerHTML; t.disabled = true; t.textContent = 'Préparation…';
      try { if (session.config.pdf) await bilanPdf(y); exportCsv('recettes', P); await new Promise(r => setTimeout(r, 400)); exportCsv('achats', P); toast('Dossier de clôture téléchargé'); } catch (e) { toast('Impossible : ' + e.message); } t.disabled = false; t.innerHTML = old; },
    'exp-new'() { if (requireAccess()) expModal(null); },
    'exp-edit'(t) { expModal(t.dataset.id); },
    'exp-del'(t) { const e = db.expenses.find(x => x.id === t.dataset.id); if (e && confirm(`Supprimer « ${e.label} »${e.recurring && e.recurring !== 'none' ? ' et toutes ses échéances' : ''} ?`)) { db.expenses = db.expenses.filter(x => x !== e); save(); render(); } },
    'exp-cat'(t) { ui.cat = t.dataset.c; render(); }
  });
  document.addEventListener('change', e => { const t = e.target; if (view !== 'stats' || !t.dataset || !t.dataset.cp) return; cfg()[t.dataset.cp] = t.type === 'checkbox' ? t.checked : t.value; save(); render(); });
})();
