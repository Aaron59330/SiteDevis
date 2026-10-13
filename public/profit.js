'use strict';
/* Rentabilité d'un devis : temps passé (chrono ou saisie), coût des matériaux (estimé avec le catalogue ou achats réels),
   frais, coût horaire → marge, taux horaire réellement gagné et verdict. Résumé de tous les devis dans Statistiques > Rentabilité.
   Rien de tout cela n'apparaît sur le document envoyé au client. */
(function () {
  const S = () => db.settings;
  const hourCost = () => num(S().hourCost);
  const targetRate = () => num(S().targetRate);
  const target = () => (S().targetMargin === '' || S().targetMargin == null ? 20 : num(S().targetMargin));
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const hFmt = h => { const m = Math.round(num(h) * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const pr = q => { q.profit = q.profit || { time: [], costs: [], planned: '' }; return q.profit; };

  /* coût estimé des fournitures : lignes du devis retrouvées dans le catalogue (prix d'achat × quantité) */
  function matEstimate(q) {
    let total = 0, found = 0, items = 0;
    q.lines.filter(l => l.t === 'item').forEach(l => {
      items++;
      const c = db.catalog.find(x => (l.ref && x.ref && x.ref === l.ref) || fold(x.desc) === fold(l.desc));
      if (c && typeof itemCost === 'function') { const k = itemCost(c); if (k > 0) { total += k * num(l.qty); found++; } }
    });
    return { total, found, items };
  }
  function calc(q) {
    const p = pr(q), ht = totals(q).ht, est = matEstimate(q);
    const realMat = p.costs.filter(c => c.kind === 'mat').reduce((s, c) => s + num(c.amount), 0);
    const fees = p.costs.filter(c => c.kind !== 'mat').reduce((s, c) => s + num(c.amount), 0);
    const useReal = p.costs.some(c => c.kind === 'mat');
    const mat = useReal ? realMat : est.total;
    const running = p.timerStart ? (Date.now() - new Date(p.timerStart).getTime()) / 36e5 : 0;
    const hours = p.time.reduce((s, t) => s + num(t.hours), 0) + running;
    const labour = hours * hourCost();
    const margin = ht - mat - fees - labour, pct = ht > 0 ? margin / ht * 100 : 0;
    const perHour = hours > 0 ? (ht - mat - fees) / hours : 0;
    const rate = hours > 0 ? ht / hours : 0;              // ex. 500 € HT en 10 h → 50 € / h
    const state = !(ht > 0) ? 'none' : !(hours > 0) && !p.costs.length ? 'todo' : margin < 0 ? 'loss' : pct < target() ? 'low' : 'ok';
    return { ht, mat, est, useReal, fees, hours, labour, margin, pct, perHour, rate, state, planned: num(p.planned), running };
  }
  window.profitCalc = calc;
  const VERDICT = { ok: ['ok', '✓ Rentable'], low: ['warn', 'Peu rentable'], loss: ['bad', '✕ À perte'], todo: ['', 'Temps à saisir'], none: ['', '—'] };

  const enabled = () => db.settings.profit !== false;
  window.profitCard = function (q) {
    if (!q || !enabled() || (isInv(q) && q.fromQuoteId)) return '';      // une facture issue d'un devis : la rentabilité se suit sur le devis
    const r = calc(q), p = pr(q), v = VERDICT[r.state], hc = hourCost();
    const bar = r.planned > 0 ? Math.min(100, r.hours / r.planned * 100) : 0;
    return `<div class="card no-print pf-card" id="pfCard"><div class="row between"><h2 style="margin:0">Rentabilité</h2><div class="row" style="gap:8px">${r.ht > 0 ? `<span class="pf-badge ${v[0]}">${v[1]}</span>` : ''}<button class="btn small" data-act="pf-off" title="Masquer le suivi de rentabilité (réactivable dans Mon entreprise)">Désactiver</button></div></div>
      <p class="muted" style="margin:4px 0 12px;font-size:.82rem">Pour vous seulement : rien de cela n’apparaît sur le document.</p>
      ${(() => { const tr = targetRate(), cls = !r.hours ? '' : tr ? (r.rate >= tr ? 'ok' : 'bad') : '';
        return `<div class="pf-rate ${cls}"><div><span>Taux horaire</span>
          <b>${r.hours ? money(r.rate) + ' / h' : '—'}</b>
          <small>${r.hours ? `${money(r.ht)} HT ÷ ${hFmt(r.hours)}` : 'Ajoutez le temps passé (chrono ou saisie) pour le calculer'}</small></div>
          ${r.hours ? `<div class="pf-rate-r"><span>Après fournitures et frais</span><b>${money(r.perHour)} / h</b>
            ${tr ? `<small>${r.rate >= tr ? '✓ au-dessus' : '✕ en dessous'} de votre objectif de ${money(tr)} / h</small>` : '<small>Fixez un taux horaire visé en bas de la carte</small>'}</div>` : ''}</div>`; })()}
      <div class="pf-grid">
        <div><span>Montant HT</span><b>${money(r.ht)}</b></div>
        <div><span>Fournitures ${r.useReal ? '(achats réels)' : `(estimées${r.est.items ? ` · ${r.est.found}/${r.est.items} lignes` : ''})`}</span><b>− ${money(r.mat)}</b></div>
        <div><span>Frais (déplacement, location…)</span><b>− ${money(r.fees)}</b></div>
        <div><span>Main-d’œuvre ${hc ? `(${hFmt(r.hours)} × ${money(hc)})` : ''}</span><b>− ${money(r.labour)}</b></div>
        <div class="pf-res ${v[0]}"><span>Marge nette</span><b>${money(r.margin)} <small>${r.ht > 0 ? '(' + r.pct.toFixed(0) + ' %)' : ''}</small></b></div>
        <div><span>Temps passé</span><b>${r.hours > 0 ? hFmt(r.hours) : '—'}</b></div>
      </div>
      ${!hc ? `<p class="notice" style="margin:10px 0 0;font-size:.84rem">Indiquez votre <b>coût horaire</b> (ce que vous coûte une heure de travail : salaire, charges…) pour calculer la main-d’œuvre.</p>` : ''}
      <h3 class="pf-h">Temps passé</h3>
      <div class="row pf-timer" style="flex-wrap:wrap;gap:8px;align-items:center">
        <button class="btn ${p.timerStart ? 'danger' : 'primary'} small" data-act="pf-timer">${p.timerStart ? `■ Arrêter le chrono (${hFmt(r.running)})` : '▶ Démarrer le chrono'}</button>
        <span class="muted">ou ajouter :</span><input id="pfH" type="number" step="0.25" min="0" placeholder="h" style="width:80px"><input id="pfNote" placeholder="Note (ex : pose, déplacement)" style="flex:1;min-width:140px">
        <button class="btn small" data-act="pf-add-time">＋ Ajouter</button></div>
      <div class="pf-plan"><label>Temps prévu <input type="number" step="0.5" min="0" data-pf="planned" value="${esc(p.planned)}" style="width:80px"> h</label>
        <span class="muted">Passé : <b>${hFmt(r.hours)}</b>${r.planned ? ` sur ${hFmt(r.planned)}` : ''}</span>
        ${r.planned ? `<div class="pf-meter ${r.hours > r.planned ? 'over' : ''}"><i style="width:${bar}%"></i></div>` : ''}</div>
      ${p.time.length ? `<table class="list pf-list"><tbody>${p.time.slice().reverse().map(t => `<tr><td>${fdate(t.date)}</td><td>${esc(t.note || '—')}</td><td class="right">${hFmt(t.hours)}</td><td class="right"><button class="btn small danger" data-act="pf-del-time" data-id="${t.id}" title="Supprimer">✕</button></td></tr>`).join('')}</tbody></table>` : ''}
      <h3 class="pf-h">Achats et frais réels</h3>
      <div class="row" style="flex-wrap:wrap;gap:8px"><select id="pfKind" style="width:auto"><option value="mat">Fournitures</option><option value="fee">Frais</option></select>
        <input id="pfLabel" placeholder="Ex : Facture Point.P, location échafaudage" style="flex:1;min-width:160px"><input id="pfAmt" type="number" step="0.01" min="0" placeholder="€ HT" style="width:100px">
        <button class="btn small" data-act="pf-add-cost">＋ Ajouter</button></div>
      ${p.costs.length ? `<table class="list pf-list"><tbody>${p.costs.map(c => `<tr><td>${c.kind === 'mat' ? 'Fournitures' : 'Frais'}</td><td>${esc(c.label || '—')}</td><td class="right">${money(c.amount)}</td><td class="right"><button class="btn small danger" data-act="pf-del-cost" data-id="${c.id}">✕</button></td></tr>`).join('')}</tbody></table>`
        : `<p class="muted" style="font-size:.8rem;margin:6px 0 0">Sans achat saisi, les fournitures sont estimées avec les prix d’achat de votre catalogue.</p>`}
      <div class="pf-set"><label>Coût horaire <input type="number" step="0.5" min="0" data-pfs="hourCost" value="${esc(S().hourCost ?? '')}" style="width:90px"> € / h</label>
        <label>Taux horaire visé <input type="number" step="1" min="0" data-pfs="targetRate" value="${esc(S().targetRate ?? '')}" placeholder="ex. 45" style="width:80px"> € / h</label>
        <label>Marge visée <input type="number" step="1" min="0" data-pfs="targetMargin" value="${target()}" style="width:70px"> %</label></div>
    </div>`;
  };
  // redessine la carte (après la fin de l'événement en cours, pour ne pas gêner un champ en train de perdre le focus)
  const refresh = () => setTimeout(() => { const q = getQuote(editingId), el = document.getElementById('pfCard'); if (!q || !el || !el.isConnected) return;
    const d = document.createElement('div'); d.innerHTML = profitCard(q); if (d.firstElementChild) el.replaceWith(d.firstElementChild); }, 0);
  let tick = null;
  const prevEd = AFTER.editor;
  AFTER.editor = function () { if (prevEd) prevEd.apply(this, arguments); clearInterval(tick); const q = getQuote(editingId); if (q && enabled() && pr(q).timerStart) tick = setInterval(() => { if (view !== 'editor') return clearInterval(tick); refresh(); }, 30000); };

  document.addEventListener('change', e => {
    const t = e.target; if (view !== 'editor') return;
    if (t.dataset.pf) { const q = getQuote(editingId); pr(q)[t.dataset.pf] = t.value === '' ? '' : num(t.value); save(); refresh(); }
    if (t.dataset.pfs) { S()[t.dataset.pfs] = t.value === '' ? '' : num(t.value); save(); refresh(); }
  });
  Object.assign(actions, {
    'pf-timer'() { const q = getQuote(editingId), p = pr(q);
      if (p.timerStart) { const h = (Date.now() - new Date(p.timerStart).getTime()) / 36e5; const keep = h > 1 / 120; if (keep) p.time.push({ id: uid(), date: today(), hours: Math.round(h * 100) / 100, note: 'Chrono' }); delete p.timerStart; clearInterval(tick); toast(keep ? `${hFmt(h)} ajoutées` : 'Chrono arrêté (moins d’une minute : rien n’est compté)'); }
      else { p.timerStart = new Date().toISOString(); tick = setInterval(refresh, 30000); toast('Chrono démarré : il continue même si vous fermez la page'); }
      save(); refresh(); },
    'pf-add-time'() { const h = num($('#pfH').value); if (!(h > 0)) return toast('Indiquez un nombre d’heures'); const q = getQuote(editingId); pr(q).time.push({ id: uid(), date: today(), hours: h, note: $('#pfNote').value.trim() }); save(); refresh(); },
    'pf-del-time'(t) { const q = getQuote(editingId), p = pr(q); p.time = p.time.filter(x => x.id !== t.dataset.id); save(); refresh(); },
    'pf-add-cost'() { const a = num($('#pfAmt').value); if (!(a > 0)) return toast('Indiquez un montant'); const q = getQuote(editingId); pr(q).costs.push({ id: uid(), kind: $('#pfKind').value, label: $('#pfLabel').value.trim(), amount: a, date: today() }); save(); refresh(); },
    'pf-del-cost'(t) { const q = getQuote(editingId), p = pr(q); p.costs = p.costs.filter(x => x.id !== t.dataset.id); save(); refresh(); },
    'pf-open'(t) { go('editor', t.dataset.id); },
    'pf-off'() { if (!confirm('Masquer le suivi de rentabilité ?\nVos temps et coûts sont gardés. Vous pourrez le réactiver dans Mon entreprise > Rentabilité.')) return;
      db.settings.profit = false; clearInterval(tick); save(); if (statUI.tab === 'profit') statUI.tab = 'activity'; render(); toast('Suivi de rentabilité désactivé'); }
  });

  /* Statistiques > Rentabilité : tous les devis acceptés ou avec du temps saisi */
  function statsHtml() {
    const list = db.quotes.filter(q => !isInv(q) && (q.status === 'accepte' || (q.profit && (q.profit.time.length || q.profit.costs.length || q.profit.timerStart))))
      .map(q => ({ q, r: calc(q) })).sort((a, b) => (b.q.date || '').localeCompare(a.q.date || ''));
    const tracked = list.filter(x => x.r.state !== 'todo' && x.r.state !== 'none');
    const sum = k => tracked.reduce((s, x) => s + x.r[k], 0), ht = sum('ht'), m = sum('margin'), h = sum('hours');
    const nb = st => list.filter(x => x.r.state === st).length;
    return `<h1 style="margin:0 0 12px">Statistiques</h1>__TABS__
      ${!hourCost() ? '<div class="notice">Renseignez votre <b>coût horaire</b> dans la carte « Rentabilité » d’un devis pour compter la main-d’œuvre.</div>' : ''}
      <div class="stats" style="margin-bottom:16px"><div class="stat"><div class="n">${money(m)}</div><div class="l">Marge nette des devis suivis (${ht > 0 ? (m / ht * 100).toFixed(0) : 0} %)</div></div>
        <div class="stat"><div class="n">${hFmt(h)}</div><div class="l">Temps passé</div></div>
        <div class="stat"><div class="n">${h > 0 ? money(ht / h) + ' / h' : '—'}</div><div class="l">Taux horaire moyen${h > 0 ? ` · ${money((ht - sum('mat') - sum('fees')) / h)} / h après fournitures` : ''}</div></div>
        <div class="stat"><div class="n">${nb('ok')} / ${tracked.length}</div><div class="l">Devis suivis rentables${nb('loss') ? ` · ${nb('loss')} à perte` : ''}${nb('todo') ? ` · ${nb('todo')} sans temps saisi` : ''}</div></div></div>
      <div class="card">${list.length ? `<table class="list"><thead><tr><th>Devis</th><th>Client</th><th class="right">HT</th><th class="right">Temps</th><th class="right">Marge</th><th class="right">Taux horaire</th><th></th></tr></thead><tbody>
        ${list.map(({ q, r }) => `<tr><td><a href="#" data-act="pf-open" data-id="${q.id}"><b>${esc(q.number)}</b></a><div class="muted" style="font-size:.78rem">${esc((q.title || '').slice(0, 60))}</div></td><td>${esc((q.clientText || '').split('\n')[0])}</td>
          <td class="right">${money(r.ht)}</td><td class="right">${r.hours ? hFmt(r.hours) : '—'}${r.planned ? `<div class="muted" style="font-size:.75rem">prévu ${hFmt(r.planned)}</div>` : ''}</td>
          <td class="right">${r.state === 'todo' ? '—' : `<b>${money(r.margin)}</b><div class="muted" style="font-size:.75rem">${r.ht > 0 ? r.pct.toFixed(0) + ' %' : ''}</div>`}</td><td class="right">${r.hours ? `<b>${money(r.rate)}</b><div class="muted" style="font-size:.75rem">net ${money(r.perHour)}</div>` : '—'}</td>
          <td class="right"><span class="pf-badge ${VERDICT[r.state][0]}">${VERDICT[r.state][1]}</span></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">Aucun devis suivi pour le moment. Ouvrez un devis et utilisez la carte « Rentabilité » (chrono, achats).</div>'}</div>`;
  }
  const baseStats = EXTRA.stats;
  EXTRA.stats = function () {
    if (!enabled()) { if (statUI.tab === 'profit') statUI.tab = 'activity'; return baseStats.apply(this, arguments); }
    const btn = `<button data-act="stat-tab" data-t="profit" class="${statUI.tab === 'profit' ? 'on' : ''}">Rentabilité</button>`;
    if (statUI.tab === 'profit') {
      statUI.tab = 'activity'; const html = baseStats.apply(this, arguments); statUI.tab = 'profit';
      const tabs = (/<div class="tabs"[^]*?<\/div>/.exec(html) || [''])[0].replace(/ class="on"/g, ' class=""').replace('</div>', btn + '</div>');
      return statsHtml().replace('__TABS__', tabs);
    }
    return baseStats.apply(this, arguments).replace(/(<div class="tabs"[^]*?)<\/div>/, `$1${btn}</div>`);
  };
})();
