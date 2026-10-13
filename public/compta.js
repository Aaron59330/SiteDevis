'use strict';
/* Statistiques > Comptabilité : recettes, charges, résultat, TVA à reverser, cotisations estimées,
   charges récurrentes, échéances à prévoir et exports (livre des recettes, registre des achats). */
(function () {
  const CATS = ['Achats de matériaux et fournitures', 'Sous-traitance', 'Carburant et déplacements', 'Véhicule (entretien, assurance, leasing)', 'Outillage et matériel', 'Loyer et locaux',
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
  const cfg = () => { db.compta = Object.assign({ regime: db.company.vatExempt ? 'micro' : 'reel', activity: 'services', rate: '', vl: false, period: 'month', vatPeriod: 'month', declPeriod: 'month' }, db.compta || {}); if (!Array.isArray(db.expenses)) db.expenses = []; return db.compta; };
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
    return { cashed, issued, ttc: sum(cashed, 'ttc'), ht: sum(cashed, 'ht'), vatCashed: sum(cashed, 'vat'), vatIssued: sum(issued, 'vat'), issuedHt: sum(issued, 'ht') };
  }

  function figures(p) {
    const c = cfg(), R = receipts(p), E = occurrences(p);
    const chHt = r2(E.reduce((s, e) => s + num(e.ht), 0)), chTtc = r2(E.reduce((s, e) => s + num(e.ttc), 0)), chVat = r2(chTtc - chHt);
    const micro = c.regime === 'micro', act = ACT[c.activity] || ACT.services;
    const rate = num(c.rate) > 0 ? num(c.rate) : act.rate, total = rate + (c.vl ? act.vl : 0);
    const cotis = micro ? r2(R.ttc * total / 100) : 0;                 // micro : sur les recettes encaissées
    const vatOut = micro ? 0 : (db.company.vatDebits ? R.vatIssued : R.vatCashed);
    const vatDue = micro ? 0 : r2(vatOut - chVat);
    const recHt = micro ? R.ttc : R.ht;
    const result = r2(recHt - (micro ? chTtc : chHt) - cotis);
    const cash = r2(R.ttc - chTtc - Math.max(0, vatDue) - cotis);
    return { R, E, chHt, chTtc, chVat, micro, act, rate: total, cotis, vatOut, vatDue, recHt, result, cash };
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
    const y = statUI.month.slice(0, 4), yearCash = receipts({ from: y + '-01-01', to: y + '-12-31' }).ttc, cap = F.act.cap;
    const list = F.E.filter(e => !ui.cat || e.cat === ui.cat);
    const card = (n, l, sub, extra = '') => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div><div class="cmp">${extra}</div>${sub ? `<div class="sub2">${sub}</div>` : ''}</div>`;
    const cats = [...new Set(F.E.map(e => e.cat || 'Autres'))];
    return `
    <div class="row between" style="margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div class="seg2">${[['month', 'Mois'], ['quarter', 'Trimestre'], ['year', 'Année']].map(([k, l]) => `<button data-act="cp-period" data-p="${k}" class="${c.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="monthnav"><button class="btn small" data-act="cp-move" data-d="-1" aria-label="Période précédente">‹</button><b>${esc(p.label)}</b><button class="btn small" data-act="cp-move" data-d="1" aria-label="Période suivante">›</button></div>
      <div class="row"><button class="btn" data-act="cp-export" data-k="recettes" title="Obligatoire pour les micro-entreprises">⬇ Livre des recettes</button><button class="btn" data-act="cp-export" data-k="achats">⬇ Registre des charges</button><button class="btn primary" data-act="exp-new">＋ Ajouter une charge</button></div>
    </div>
    <div class="stats">
      ${card(money(F.R.ttc), `Recettes encaissées (${F.R.cashed.length})`, F.micro ? 'Factures payées sur la période' : `dont ${money(F.R.ht)} HT`, cmp(F.R.ttc, PF.R.ttc, 'vs période préc.'))}
      ${card(money(F.micro ? F.chTtc : F.chHt), `Charges${F.micro ? '' : ' HT'} (${F.E.length})`, F.micro ? 'Dépenses de la période' : `dont ${money(F.chVat)} de TVA déductible`, cmp(F.micro ? F.chTtc : F.chHt, F.micro ? PF.chTtc : PF.chHt, 'vs période préc.', false))}
      ${card(`<span style="color:${F.result < 0 ? 'var(--danger)' : 'inherit'}">${money(F.result)}</span>`, F.micro ? 'Reste après charges et cotisations' : 'Résultat avant impôt', F.micro ? 'Recettes − charges − cotisations estimées' : 'Recettes HT − charges HT', cmp(F.result, PF.result, 'vs période préc.'))}
      ${F.micro ? card(money(F.cotis), 'Cotisations URSSAF estimées', `${fmtNum.format(F.rate)} % des recettes encaissées${c.vl ? ' (avec versement libératoire)' : ''}`)
        : card(`<span style="color:${F.vatDue < 0 ? 'var(--ok)' : 'inherit'}">${money(Math.abs(F.vatDue))}</span>`, F.vatDue < 0 ? 'Crédit de TVA' : 'TVA à reverser', `Collectée ${money(F.vatOut)} − déductible ${money(F.chVat)}${db.company.vatDebits ? ' (sur les débits)' : ' (sur les encaissements)'}`)}
    </div>
    <div class="grid2" style="margin-bottom:16px;align-items:stretch">
      <div class="card"><h2>Charges par catégorie</h2>${barsByCat(F.E)}</div>
      <div class="card"><h2>Trésorerie et repères</h2>
        <div class="big-n" style="color:${F.cash < 0 ? 'var(--danger)' : 'inherit'}">${money(F.cash)}</div>
        <p class="muted" style="margin:4px 0 14px;font-size:.86rem">Ce qui reste de la période : encaissé − charges${F.micro ? ' − cotisations estimées' : ' − TVA à reverser'}.</p>
        ${F.micro ? `<div class="cat-bar"><div class="row between"><span>Plafond micro-entreprise ${y} (${money(cap)})</span><b>${Math.round(yearCash / cap * 100)} %</b></div><div class="cb"><i style="width:${Math.min(100, yearCash / cap * 100)}%"></i></div></div>
          <p class="muted" style="font-size:.8rem;margin:6px 0 14px">${money(yearCash)} encaissés depuis janvier. Plafond indicatif pour ${esc(F.act.label.toLowerCase())}, à vérifier sur urssaf.fr.</p>` : ''}
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
        <div class="field"><label>Activité</label><select data-cp="activity">${Object.entries(ACT).map(([k, a]) => `<option value="${k}" ${c.activity === k ? 'selected' : ''}>${a.label}</option>`).join('')}</select></div>
        <div class="field"><label>Taux de cotisations sociales (%) — vide = ${fmtNum.format(F.act.rate)} %</label><input type="number" step="0.1" data-cp="rate" value="${esc(c.rate)}" placeholder="${F.act.rate}"></div>
        <div class="field"><label>Déclaration URSSAF</label><select data-cp="declPeriod"><option value="month" ${c.declPeriod === 'month' ? 'selected' : ''}>Mensuelle</option><option value="quarter" ${c.declPeriod === 'quarter' ? 'selected' : ''}>Trimestrielle</option></select></div>
        <label class="check"><input type="checkbox" data-cp="vl" ${c.vl ? 'checked' : ''}> Versement libératoire de l’impôt sur le revenu (+${fmtNum.format(F.act.vl)} %)</label>`
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
      <div class="field"><label>Libellé *</label><input name="label" value="${esc(e.label)}" required placeholder="Ex : Plaques de plâtre chantier Dupont, plein de gasoil, assurance décennale…"></div>
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
  function exportCsv(kind) {
    const p = period(), n = v => String(r2(v)).replace('.', ','), q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    let rows, name;
    if (kind === 'recettes') {
      rows = [['Date d’encaissement', 'N° de facture', 'Client', 'Nature', 'Montant HT', 'TVA', 'Montant TTC', 'Mode de règlement']];
      receipts(p).cashed.sort((a, b) => (a.paidAt || a.date).localeCompare(b.paidAt || b.date)).forEach(f => { const t = totals(f); rows.push([f.paidAt || f.date, f.number, (f.clientText || '').split('\n')[0], f.title || '', n(t.ht), n(t.vat), n(t.ttc), f.payMethod || '']); });
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
    'exp-new'() { if (requireAccess()) expModal(null); },
    'exp-edit'(t) { expModal(t.dataset.id); },
    'exp-del'(t) { const e = db.expenses.find(x => x.id === t.dataset.id); if (e && confirm(`Supprimer « ${e.label} »${e.recurring && e.recurring !== 'none' ? ' et toutes ses échéances' : ''} ?`)) { db.expenses = db.expenses.filter(x => x !== e); save(); render(); } },
    'exp-cat'(t) { ui.cat = t.dataset.c; render(); }
  });
  document.addEventListener('change', e => { const t = e.target; if (view !== 'stats' || !t.dataset || !t.dataset.cp) return; cfg()[t.dataset.cp] = t.type === 'checkbox' ? t.checked : t.value; save(); render(); });
})();
