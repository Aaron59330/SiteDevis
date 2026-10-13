'use strict';
/* Chantiers (optionnel) : lieu, ville, dates, heures prévues / réalisées, et rattachement des devis et factures.
   Activé dans « Mon entreprise » (db.settings.useSites). Un devis garde son lien via q.siteId. */

const SITE_STATUS = { planifier: 'À planifier', encours: 'En cours', termine: 'Terminé', annule: 'Annulé' };
const SITE_BADGE = { planifier: 'brouillon', encours: 'envoye', termine: 'payee', annule: 'annulee' };
const siteUI = { q: '', status: '' };
const hFmt = h => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num(h)) + ' h';

function normSite(s) {
  s = s || {};
  s.id = s.id || uid();
  for (const k of ['name', 'ref', 'clientId', 'address', 'zip', 'city', 'access', 'start', 'end', 'team', 'notes']) s[k] = s[k] || '';
  s.status = SITE_STATUS[s.status] ? s.status : 'planifier';
  s.plannedHours = num(s.plannedHours);
  s.log = Array.isArray(s.log) ? s.log : [];
  return s;
}
const sites = () => db.sites;
const getSite = id => db.sites.find(s => s.id === id);
const siteDone = s => s.log.reduce((t, e) => t + num(e.hours), 0);
const siteDocs = s => db.quotes.filter(q => q.siteId === s.id);
const sitePlace = s => [s.address, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const siteMapUrl = s => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(sitePlace(s));

/* ---------- Dans l'éditeur de devis ---------- */
function siteOptions(sel) {
  return '<option value="">— Aucun chantier —</option>' +
    db.sites.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}${s.city ? ' — ' + esc(s.city) : ''}</option>`).join('');
}
function siteField(q) {
  if (!db.settings.useSites && !q.siteId) return '';
  const s = getSite(q.siteId);
  return `<div class="field"><label>Chantier (optionnel)</label>
    <div class="row" style="flex-wrap:nowrap">
      <select data-f="siteId" id="siteSel">${siteOptions(q.siteId)}</select>
      <button class="btn" data-act="new-site-inline" title="Nouveau chantier">＋</button>
      ${s ? `<button class="btn" data-act="open-site" data-id="${s.id}" title="Ouvrir la fiche du chantier">Fiche</button>` : ''}
    </div>
    ${s ? `<div class="muted" style="margin-top:6px;font-size:.82rem">${esc(sitePlace(s) || 'Adresse non renseignée')}${s.plannedHours ? ' · ' + hFmt(s.plannedHours) + ' prévues' : ''}</div>` : ''}
  </div>`;
}

/* ---------- Sur le document ---------- */
function siteDocLine(q) {
  const s = q.opts.showSite || q.opts.showSiteHours ? getSite(q.siteId) : null;
  if (!s) return '';
  const parts = [];
  if (q.opts.showSite) {
    parts.push(`<span><b>${typeof sectorWord === 'function' ? sectorWord(false, true) : 'Chantier'} :</b> ${esc(s.name)}${sitePlace(s) ? ' — ' + esc(sitePlace(s)) : ''}</span>`);
    if (s.start && s.end) parts.push(`<span>Du ${fdate(s.start)} au ${fdate(s.end)}</span>`);
    else if (s.start) parts.push(`<span>Début prévu le ${fdate(s.start)}</span>`);
  }
  if (q.opts.showSiteHours && s.plannedHours) parts.push(`<span>Durée estimée : ${hFmt(s.plannedHours)}</span>`);
  return parts.length ? `<div class="dmeta">${parts.join('')}</div>` : '';
}

/* ---------- Liste ---------- */
EXTRA.sites = function renderSites() {
  const all = db.sites;
  const list = all.filter(s => {
    const c = getClient(s.clientId);
    const hay = `${s.name} ${s.ref} ${s.city} ${s.address} ${s.zip} ${c ? c.name : ''}`.toLowerCase();
    return (!siteUI.q || hay.includes(siteUI.q.toLowerCase())) && (!siteUI.status || s.status === siteUI.status);
  }).sort((a, b) => (a.status === 'termine') - (b.status === 'termine') || (a.start || '9').localeCompare(b.start || '9') || a.name.localeCompare(b.name, 'fr'));
  const active = all.filter(s => s.status === 'encours').length;
  const planned = all.filter(s => s.status !== 'annule' && s.status !== 'termine').reduce((t, s) => t + s.plannedHours, 0);
  const done = all.reduce((t, s) => t + siteDone(s), 0);
  return `
  <div class="row between" style="margin-bottom:16px"><h1>Chantiers</h1><button class="btn primary" data-act="new-site">＋ Nouveau chantier</button></div>
  <div class="stats">
    <div class="stat"><div class="n">${all.length}</div><div class="l">Chantiers au total</div></div>
    <div class="stat"><div class="n">${active}</div><div class="l">En cours</div></div>
    <div class="stat"><div class="n">${hFmt(planned)}</div><div class="l">Heures prévues (à faire)</div></div>
    <div class="stat"><div class="n">${hFmt(done)}</div><div class="l">Heures réalisées</div></div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:12px">
      <input class="grow" id="siteSearch" placeholder="Rechercher (chantier, ville, client)…" value="${esc(siteUI.q)}" style="max-width:360px">
      <select id="siteStatus" style="width:180px"><option value="">Tous les statuts</option>
        ${Object.entries(SITE_STATUS).map(([k, v]) => `<option value="${k}" ${siteUI.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div>
    ${list.length ? `<table class="list">
      <thead><tr><th>Chantier</th><th>Client</th><th>Lieu</th><th>Période</th><th>Heures</th><th>Statut</th><th>Documents</th><th></th></tr></thead>
      <tbody>${list.map(s => {
        const c = getClient(s.clientId), d = siteDone(s);
        return `<tr>
          <td><a href="#" data-act="open-site" data-id="${s.id}"><b>${esc(s.name)}</b></a>${s.ref ? `<div class="muted" style="font-size:.78rem">${esc(s.ref)}</div>` : ''}</td>
          <td>${esc(c ? c.name : '—')}</td>
          <td>${esc(sitePlace(s) || '—')}</td>
          <td>${s.start ? fdate(s.start) + (s.end ? ' → ' + fdate(s.end) : '') : '—'}</td>
          <td>${hFmt(d)}${s.plannedHours ? ' / ' + hFmt(s.plannedHours) : ''}</td>
          <td><span class="badge ${SITE_BADGE[s.status]}">${SITE_STATUS[s.status]}</span></td>
          <td>${siteDocs(s).length}</td>
          <td class="right" style="white-space:nowrap"><button class="btn small" data-act="open-site" data-id="${s.id}">Ouvrir</button>
            <button class="btn small" data-act="edit-site" data-id="${s.id}">Modifier</button>
            <button class="btn small danger" data-act="del-site" data-id="${s.id}" title="Supprimer">🗑</button></td></tr>`;
      }).join('')}</tbody></table>`
      : `<div class="empty">${all.length ? 'Aucun chantier ne correspond.' : 'Aucun chantier pour le moment.<br><br>Créez-en un, puis rattachez-y vos devis et factures depuis l\'éditeur.'}</div>`}
  </div>`;
};

/* ---------- Fiche d'un chantier ---------- */
EXTRA.site = function renderSite() {
  const s = getSite(editingId);
  if (!s) return '<div class="empty">Chantier introuvable.</div>';
  const c = getClient(s.clientId), d = siteDone(s), docs = siteDocs(s).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));
  const pctDone = s.plannedHours ? Math.min(100, Math.round(d / s.plannedHours * 100)) : 0;
  const over = s.plannedHours && d > s.plannedHours;
  const sum = f => docs.filter(f).reduce((t, q) => t + totals(q).ttc, 0);
  const quotesTtc = sum(q => !isInv(q) && q.status !== 'refuse');
  const billed = sum(q => isInv(q) && q.status !== 'annulee');
  const cashed = sum(q => isInv(q) && q.status === 'payee');
  const log = s.log.slice().sort((a, b) => b.date.localeCompare(a.date));
  return `
  <div class="row between" style="margin-bottom:16px">
    <div><button class="btn small" data-act="goto-sites">← Chantiers</button></div>
    <div class="row"><button class="btn" data-act="edit-site" data-id="${s.id}">Modifier</button>
      <button class="btn primary" data-act="site-new-quote" data-id="${s.id}">＋ Nouveau devis pour ce chantier</button></div>
  </div>
  <div class="row" style="gap:12px;margin-bottom:6px"><h1 style="margin:0">${esc(s.name)}</h1><span class="badge ${SITE_BADGE[s.status]}">${SITE_STATUS[s.status]}</span></div>
  <p class="muted" style="margin-top:0">${[s.ref, c && c.name].filter(Boolean).map(esc).join(' · ')}</p>
  <div class="stats">
    <div class="stat"><div class="n">${money(quotesTtc)}</div><div class="l">Devis (TTC, hors refusés)</div></div>
    <div class="stat"><div class="n">${money(billed)}</div><div class="l">Facturé (TTC)</div></div>
    <div class="stat"><div class="n">${money(cashed)}</div><div class="l">Encaissé</div></div>
    <div class="stat"><div class="n" style="color:${over ? 'var(--danger)' : 'inherit'}">${hFmt(d)}</div><div class="l">Heures réalisées${s.plannedHours ? ' sur ' + hFmt(s.plannedHours) : ''}</div></div>
  </div>
  <div class="grid2" style="align-items:start">
    <div class="card"><h2>Informations</h2>
      <dl class="kv">
        <dt>Lieu</dt><dd>${sitePlace(s) ? `${esc(sitePlace(s))} <a href="${siteMapUrl(s)}" target="_blank" rel="noopener">Itinéraire</a>` : '—'}</dd>
        <dt>Période</dt><dd>${s.start ? fdate(s.start) + (s.end ? ' au ' + fdate(s.end) : '') : '—'}</dd>
        <dt>Équipe</dt><dd>${esc(s.team) || '—'}</dd>
        <dt>Accès</dt><dd style="white-space:pre-line">${esc(s.access) || '—'}</dd>
        <dt>Notes</dt><dd style="white-space:pre-line">${esc(s.notes) || '—'}</dd>
      </dl>
    </div>
    <div class="card"><h2>Suivi des heures</h2>
      ${s.plannedHours ? `<div class="bar${over ? ' over' : ''}"><i style="width:${pctDone}%"></i></div>
        <p class="muted" style="margin:6px 0 12px;font-size:.85rem">${hFmt(d)} sur ${hFmt(s.plannedHours)} prévues (${pctDone} %)${over ? ' — dépassement de ' + hFmt(d - s.plannedHours) : d < s.plannedHours ? ' — reste ' + hFmt(s.plannedHours - d) : ''}</p>` : '<p class="muted">Aucune heure prévue : renseignez-les en modifiant le chantier.</p>'}
      <div class="grid3" style="align-items:end">
        <div class="field"><label>Date</label><input type="date" id="logDate" value="${today()}"></div>
        <div class="field"><label>Heures</label><input type="number" step="0.25" min="0" id="logHours" placeholder="7,5"></div>
        <div class="field"><label>Qui</label><input id="logWho" placeholder="Nom" value="${esc(s.team.split(',')[0].trim())}"></div>
      </div>
      <div class="row" style="flex-wrap:nowrap"><input class="grow" id="logNote" placeholder="Note (travaux faits ce jour-là)"><button class="btn primary" data-act="log-add" data-id="${s.id}">Ajouter</button></div>
      ${log.length ? `<table class="list" style="margin-top:12px"><thead><tr><th>Date</th><th>Qui</th><th>Note</th><th class="right">Heures</th><th></th></tr></thead>
        <tbody>${log.map(e => `<tr><td>${fdate(e.date)}</td><td>${esc(e.who) || '—'}</td><td>${esc(e.note) || '—'}</td><td class="right">${hFmt(e.hours)}</td>
          <td class="right"><button class="btn small danger" data-act="log-del" data-id="${s.id}" data-e="${e.id}" title="Supprimer">✕</button></td></tr>`).join('')}</tbody></table>` : ''}
    </div>
  </div>
  <div class="card"><h2>Devis et factures rattachés</h2>
    ${docs.length ? `<table class="list"><thead><tr><th>Numéro</th><th>Type</th><th>Date</th><th>Statut</th><th class="right">Total TTC</th></tr></thead>
      <tbody>${docs.map(q => `<tr><td><a href="#" data-act="edit" data-id="${q.id}"><b>${esc(q.number)}</b></a></td>
        <td>${isInv(q) ? 'Facture' : 'Devis'}</td><td>${fdate(q.date)}</td>
        <td><span class="badge ${q.status}">${esc(statusOf(q)[q.status] || q.status)}</span></td><td class="right"><b>${money(totals(q).ttc)}</b></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Aucun document rattaché. Créez un devis pour ce chantier ou choisissez-le dans l\'éditeur d\'un devis existant.</div>'}
  </div>`;
};

/* ---------- Formulaire ---------- */
function siteModal(id, after) {
  const old = getSite(id);
  const s = old ? { ...old } : normSite({ clientId: after && after.clientId || '' });
  const m = openModal(`<div class="modal-wide"><form id="siteForm"><h2>${id ? 'Modifier le chantier' : 'Nouveau chantier'}</h2>
    <div class="grid2"><div class="field"><label>Nom du chantier *</label><input name="name" required value="${esc(s.name)}" placeholder="Ex : Rénovation salle de bain — Dupont"></div>
      <div class="field"><label>Référence interne</label><input name="ref" value="${esc(s.ref)}" placeholder="Ex : CH-2026-014"></div></div>
    <div class="grid2"><div class="field"><label>Client</label><select name="clientId">${clientOptions(s.clientId)}</select></div>
      <div class="field"><label>Statut</label><select name="status">${Object.entries(SITE_STATUS).map(([k, v]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
    <div class="field"><label>Adresse du chantier <a href="#" id="siteFromClient" style="float:right;font-weight:400">recopier l'adresse du client</a></label><input name="address" value="${esc(s.address)}" placeholder="N° et rue"></div>
    <div class="grid2"><div class="field"><label>Code postal</label><input name="zip" inputmode="numeric" value="${esc(s.zip)}"></div>
      <div class="field"><label>Ville</label><input name="city" value="${esc(s.city)}"></div></div>
    <div class="grid3"><div class="field"><label>Début prévu</label><input type="date" name="start" value="${s.start}"></div>
      <div class="field"><label>Fin prévue</label><input type="date" name="end" value="${s.end}"></div>
      <div class="field"><label>Heures prévues</label><input type="number" name="plannedHours" min="0" step="0.5" value="${s.plannedHours || ''}"></div></div>
    <div class="field"><label>Équipe / intervenants</label><input name="team" value="${esc(s.team)}" placeholder="Ex : Marc, Julien"></div>
    <div class="field"><label>Accès (digicode, étage, stationnement, contact sur place…)</label><textarea name="access" rows="2">${esc(s.access)}</textarea></div>
    <div class="field"><label>Notes</label><textarea name="notes" rows="2">${esc(s.notes)}</textarea></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></form></div>`);
  const f = $('#siteForm');
  $('#siteFromClient').onclick = e => {
    e.preventDefault();
    const c = getClient(f.elements.clientId.value);
    if (!c || !c.address) return toast('Choisissez d\'abord un client avec une adresse');
    const lines = c.address.split('\n').map(x => x.trim()).filter(Boolean);
    const last = lines[lines.length - 1] || '', mm = /^(\d{5})\s+(.+)$/.exec(last);
    f.elements.address.value = mm ? lines.slice(0, -1).join(', ') : lines.join(', ');
    if (mm) { f.elements.zip.value = mm[1]; f.elements.city.value = mm[2]; }
  };
  f.onsubmit = e => {
    e.preventDefault();
    const g = k => f.elements[k].value.trim();
    const data = { name: g('name'), ref: g('ref'), clientId: g('clientId'), status: g('status'), address: g('address'), zip: g('zip'), city: g('city'),
      start: g('start'), end: g('end'), plannedHours: num(g('plannedHours')), team: g('team'), access: g('access'), notes: g('notes') };
    if (data.start && data.end && data.end < data.start) return toast('La fin prévue précède le début');
    let site = getSite(id);
    if (site) Object.assign(site, data); else { site = normSite(data); db.sites.push(site); }
    save(); m.close();
    if (after && typeof after === 'function') after(site); else render();
  };
}

/* ---------- Actions ---------- */
Object.assign(actions, {
  'goto-sites': () => go('sites'),
  'new-site': () => siteModal(null),
  'edit-site': t => siteModal(t.dataset.id),
  'open-site': t => go('site', t.dataset.id),
  'new-site-inline'() {
    const q = getQuote(editingId); const cb = site => {
      q.siteId = site.id;
      if (!q.clientId && site.clientId) { q.clientId = site.clientId; q.clientText = clientBlock(getClient(site.clientId)); }
      if (!q.title) q.title = site.name;
      save(); render();
    };
    cb.clientId = q.clientId; siteModal(null, cb);
  },
  'del-site'(t) {
    const s = getSite(t.dataset.id), n = siteDocs(s).length;
    if (!confirm(`Supprimer le chantier « ${s.name} » ?${n ? `\n${n} document(s) y sont rattachés : ils seront conservés, simplement détachés.` : ''}`)) return;
    db.quotes.forEach(q => { if (q.siteId === s.id) q.siteId = ''; });
    db.sites = db.sites.filter(x => x !== s); save();
    if (view === 'site') go('sites'); else render();
  },
  'site-new-quote'(t) {
    const s = getSite(t.dataset.id); if (!requireAccess()) return;
    newQuote();
    const q = getQuote(editingId);
    q.siteId = s.id; q.title = s.name;
    if (s.clientId) { q.clientId = s.clientId; q.clientText = clientBlock(getClient(s.clientId)); }
    q.opts.showSite = true;
    save(); render();
  },
  'log-add'(t) {
    const s = getSite(t.dataset.id), hours = num($('#logHours').value);
    if (!(hours > 0)) return toast('Indiquez un nombre d\'heures');
    s.log.push({ id: uid(), date: $('#logDate').value || today(), hours, who: $('#logWho').value.trim(), note: $('#logNote').value.trim() });
    if (s.status === 'planifier') s.status = 'encours';
    save(); render();
  },
  'log-del'(t) {
    const s = getSite(t.dataset.id); s.log = s.log.filter(e => e.id !== t.dataset.e); save(); render();
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (view !== 'sites' || (t.id !== 'siteSearch' && t.id !== 'siteStatus')) return;
  if (t.id === 'siteSearch') { siteUI.q = t.value; const pos = t.selectionStart; render(); const s = $('#siteSearch'); s.focus(); s.setSelectionRange(pos, pos); }
  else { siteUI.status = t.value; render(); }
});
/* Changer de chantier dans un devis : reprend le client et le titre s'ils sont vides, puis rafraîchit l'éditeur */
document.addEventListener('change', e => {
  const t = e.target;
  if (view !== 'editor' || t.dataset.f !== 'siteId') return;
  const q = getQuote(editingId), s = getSite(q.siteId);
  if (s) {
    if (!q.clientId && s.clientId) { q.clientId = s.clientId; q.clientText = clientBlock(getClient(s.clientId)); }
    if (!q.title) q.title = s.name;
  } else { q.opts.showSite = false; q.opts.showSiteHours = false; }
  save(); const y = window.scrollY; render(); window.scrollTo(0, y);
});
