'use strict';
/* Statistiques : devis du mois, chiffre d'affaires, factures payées et impayées, comparaison avec les mois précédents. */

const statUI = { month: today().slice(0, 7), mode: 'ttc' };
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; };
const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymShort = ym => SHORT[Number(ym.slice(5)) - 1] + (ym.slice(5) === '01' ? ' ' + ym.slice(2, 4) : '');
const amt = q => (statUI.mode === 'ht' ? totals(q).ht : totals(q).ttc);
const sumQ = l => l.reduce((s, q) => s + amt(q), 0);

/* Chiffres d'un mois */
function monthStats(ym) {
  const inM = iso => (iso || '').slice(0, 7) === ym;
  const devis = db.quotes.filter(q => !isInv(q) && inM(q.date));
  const inv = db.quotes.filter(isInv);
  const issued = inv.filter(q => (q.status === 'envoye' || q.status === 'payee') && inM(q.date));
  const cashed = inv.filter(q => q.status === 'payee' && inM(q.paidAt || q.date));
  const unpaidM = issued.filter(q => q.status === 'envoye');
  const accepted = devis.filter(q => q.status === 'accepte');
  return { devis, devisTotal: sumQ(devis.filter(q => q.status !== 'refuse')), accepted, acceptedTotal: sumQ(accepted),
    rate: devis.length ? accepted.length / devis.length : null, issued, issuedTotal: sumQ(issued), cashed, cashedTotal: sumQ(cashed), unpaidM, unpaidTotal: sumQ(unpaidM) };
}
const delta = (cur, prev) => prev > 0 ? (cur - prev) / prev : (cur > 0 ? null : 0);
const pctTxt = d => d == null ? 'nouveau' : (d >= 0 ? '+' : '−') + fmtNum.format(Math.abs(d) * 100).replace(/,00$/, '') + ' %';
function cmp(cur, prev, label, upGood = true) {
  const d = delta(cur, prev);
  const cls = d == null || d === 0 ? 'flat' : (d > 0) === upGood ? 'good' : 'bad';
  return `<span class="delta ${cls}" title="${label}">${d == null ? '●' : d === 0 ? '＝' : d > 0 ? '▲' : '▼'} ${pctTxt(d)}<i> ${label}</i></span>`;
}

function chartSvg(series) {
  const W = 760, H = 240, pad = { l: 8, r: 8, t: 14, b: 30 }, max = Math.max(1, ...series.flatMap(s => [s.devis, s.issued, s.cashed])) * 1.12;
  const bw = (W - pad.l - pad.r) / series.length, g = (W - pad.l - pad.r) / series.length * 0.2, w3 = (bw - g) / 3;
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Évolution mensuelle">`;
  for (let i = 0; i <= 3; i++) { const v = max * i / 3, yy = y(v); out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="gl"/>`; }
  series.forEach((s, i) => {
    const x0 = pad.l + i * bw + g / 2, cur = s.ym === statUI.month;
    [['devis', s.devis], ['issued', s.issued], ['cashed', s.cashed]].forEach(([k, v], j) => {
      const h = Math.max(0, (H - pad.b) - y(v)); out += `<rect x="${x0 + j * w3}" y="${y(v)}" width="${w3 - 2}" height="${h}" rx="3" class="cbar ${k}${cur ? ' cur' : ''}"><title>${ymLabel(s.ym)} — ${{ devis: 'Devis', issued: 'Facturé', cashed: 'Encaissé' }[k]} : ${money(v)}</title></rect>`;
    });
    out += `<text x="${pad.l + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle" class="lab${cur ? ' cur' : ''}">${ymShort(s.ym)}</text>`;
  });
  return out + '</svg>';
}

EXTRA.stats = function renderStats() {
  const ym = statUI.month, prev = ymAdd(ym, -1), ly = ymAdd(ym, -12), now = today().slice(0, 7);
  const S = monthStats(ym), P = monthStats(prev), L = monthStats(ly);
  const avg3 = k => [1, 2, 3].reduce((s, n) => s + monthStats(ymAdd(ym, -n))[k], 0) / 3;
  const series = Array.from({ length: 12 }, (_, i) => { const m = ymAdd(ym, i - 11), s = monthStats(m); return { ym: m, devis: s.devisTotal, issued: s.issuedTotal, cashed: s.cashedTotal, nDevis: s.devis.length, unpaid: s.unpaidTotal }; });
  const allUnpaid = db.quotes.filter(q => isInv(q) && q.status === 'envoye'), late = allUnpaid.filter(q => invState(q) === 'retard');
  const dueOf = q => totals(q).due;
  const card = (n, label, sub, extra = '') => `<div class="stat"><div class="n">${n}</div><div class="l">${label}</div><div class="cmp">${extra}</div>${sub ? `<div class="sub2">${sub}</div>` : ''}</div>`;
  const ytd = ym.slice(0, 4), months = Array.from({ length: Number(ym.slice(5)) }, (_, i) => ytd + '-' + String(i + 1).padStart(2, '0'));
  const ytdNow = months.reduce((s, m) => s + monthStats(m).issuedTotal, 0), ytdPrev = months.reduce((s, m) => s + monthStats(ymAdd(m, -12)).issuedTotal, 0);
  return `
  <div class="row between" style="margin-bottom:16px;flex-wrap:wrap;gap:12px">
    <h1 style="margin:0">Statistiques</h1>
    <div class="row">
      <div class="seg2"><button data-act="stat-mode" data-m="ttc" class="${statUI.mode === 'ttc' ? 'on' : ''}">TTC</button><button data-act="stat-mode" data-m="ht" class="${statUI.mode === 'ht' ? 'on' : ''}">HT</button></div>
      <div class="monthnav"><button class="btn small" data-act="stat-month" data-d="-1" aria-label="Mois précédent">‹</button><b>${ymLabel(ym)}</b><button class="btn small" data-act="stat-month" data-d="1" aria-label="Mois suivant" ${ym >= now ? 'disabled' : ''}>›</button>
        ${ym !== now ? '<button class="btn small" data-act="stat-month" data-d="0">Ce mois-ci</button>' : ''}</div>
    </div>
  </div>
  <div class="stats">
    ${card(money(S.devisTotal), `Devis du mois (${S.devis.length})`, `${S.accepted.length} accepté${S.accepted.length > 1 ? 's' : ''} · ${money(S.acceptedTotal)}${S.rate != null ? ' · ' + Math.round(S.rate * 100) + ' % d\'acceptation' : ''}`, cmp(S.devisTotal, P.devisTotal, 'vs ' + ymLabel(prev).split(' ')[0]))}
    ${card(money(S.issuedTotal), `Facturé (${S.issued.length} facture${S.issued.length > 1 ? 's' : ''})`, 'Chiffre d\'affaires facturé, factures envoyées ou payées', cmp(S.issuedTotal, P.issuedTotal, 'vs ' + ymLabel(prev).split(' ')[0]))}
    ${card(money(S.cashedTotal), `Encaissé (${S.cashed.length} payée${S.cashed.length > 1 ? 's' : ''})`, 'Factures réglées ce mois-ci', cmp(S.cashedTotal, P.cashedTotal, 'vs ' + ymLabel(prev).split(' ')[0]))}
    ${card(money(S.unpaidTotal), `Non payé sur le mois (${S.unpaidM.length})`, `Factures du mois en attente de règlement`, cmp(S.unpaidTotal, P.unpaidTotal, 'vs ' + ymLabel(prev).split(' ')[0], false))}
  </div>
  <div class="grid2" style="margin-bottom:16px;align-items:stretch">
    <div class="card"><h2>Comparaison</h2>
      <table class="list cmp-t"><thead><tr><th></th><th class="right">Ce mois</th><th class="right">Mois préc.</th><th class="right">Moy. 3 mois</th><th class="right">${ymLabel(ly).split(' ')[0]} ${ly.slice(0, 4)}</th></tr></thead><tbody>
        ${[['Devis', 'devisTotal'], ['Facturé', 'issuedTotal'], ['Encaissé', 'cashedTotal']].map(([l, k]) => `<tr><td data-label=""><b>${l}</b></td><td class="right" data-label="Ce mois">${money(S[k])}</td><td class="right" data-label="Mois préc.">${money(P[k])} ${cmp(S[k], P[k], '')}</td><td class="right" data-label="Moy. 3 mois">${money(avg3(k))}</td><td class="right" data-label="Même mois N−1">${money(L[k])} ${cmp(S[k], L[k], '')}</td></tr>`).join('')}
        <tr><td data-label=""><b>Devis créés</b></td><td class="right" data-label="Ce mois">${S.devis.length}</td><td class="right" data-label="Mois préc.">${P.devis.length}</td><td class="right" data-label="Moy. 3 mois">${fmtNum.format([1, 2, 3].reduce((s, n) => s + monthStats(ymAdd(ym, -n)).devis.length, 0) / 3)}</td><td class="right" data-label="Même mois N−1">${L.devis.length}</td></tr>
      </tbody></table>
      <p class="muted" style="margin:10px 0 0;font-size:.85rem">Depuis janvier ${ytd} : <b>${money(ytdNow)}</b> facturé ${cmp(ytdNow, ytdPrev, 'vs même période ' + (Number(ytd) - 1))}</p>
    </div>
    <div class="card"><h2>À encaisser (tous mois)</h2>
      <div class="big-n">${money(allUnpaid.reduce((s, q) => s + dueOf(q), 0))}</div>
      <p class="muted" style="margin:4px 0 12px">${allUnpaid.length} facture${allUnpaid.length > 1 ? 's' : ''} envoyée${allUnpaid.length > 1 ? 's' : ''} non réglée${allUnpaid.length > 1 ? 's' : ''}${late.length ? ` dont <b style="color:var(--danger)">${late.length} en retard (${money(late.reduce((s, q) => s + dueOf(q), 0))})</b>` : ''}</p>
      ${allUnpaid.length ? `<table class="list"><thead><tr><th>Facture</th><th>Client</th><th>Échéance</th><th class="right">Reste dû</th></tr></thead><tbody>${allUnpaid.sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9')).slice(0, 6).map(q => { const c = getClient(q.clientId); return `<tr><td data-label="Facture"><a href="#" data-act="edit" data-id="${q.id}"><b>${esc(q.number)}</b></a></td><td data-label="Client">${esc(c ? c.name : '—')}</td><td data-label="Échéance" ${invState(q) === 'retard' ? 'style="color:var(--danger)"' : ''}>${q.dueDate ? fdate(q.dueDate) : '—'}${invState(q) === 'retard' ? ' · retard' : ''}</td><td class="right" data-label="Reste dû"><b>${money(dueOf(q))}</b></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty" style="padding:18px">Aucune facture en attente de paiement.</div>'}
    </div>
  </div>
  <div class="card" style="margin-bottom:16px"><div class="row between" style="flex-wrap:wrap;gap:8px"><h2 style="margin:0">12 derniers mois</h2>
      <div class="legend"><span><i class="lg devis"></i>Devis</span><span><i class="lg issued"></i>Facturé</span><span><i class="lg cashed"></i>Encaissé</span></div></div>
    ${chartSvg(series)}</div>
  <div class="card"><h2>Devis de ${ymLabel(ym)}</h2>
    ${S.devis.length ? `<table class="list"><thead><tr><th>Numéro</th><th>Client</th><th>Objet</th><th>Date</th><th>Statut</th><th class="right">Total ${statUI.mode.toUpperCase()}</th></tr></thead><tbody>${[...S.devis].sort((a, b) => b.date.localeCompare(a.date)).map(q => { const c = getClient(q.clientId); return `<tr><td data-label="Numéro"><a href="#" data-act="edit" data-id="${q.id}"><b>${esc(q.number)}</b></a></td><td data-label="Client">${esc(c ? c.name : '—')}</td><td data-label="Objet">${esc(q.title)}</td><td data-label="Date">${fdate(q.date)}</td><td data-label="Statut"><span class="badge ${q.status}">${STATUS[q.status] || q.status}</span></td><td class="right" data-label="Total"><b>${money(amt(q))}</b></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">Aucun devis ce mois-ci.</div>'}
  </div>`;
};

Object.assign(actions, {
  'stat-month'(t) { const d = Number(t.dataset.d); statUI.month = d === 0 ? today().slice(0, 7) : ymAdd(statUI.month, d); if (statUI.month > today().slice(0, 7)) statUI.month = today().slice(0, 7); render(); },
  'stat-mode'(t) { statUI.mode = t.dataset.m; render(); }
});
