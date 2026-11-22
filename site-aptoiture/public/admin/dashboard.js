(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    kids.flat().forEach(c => n.append(c instanceof Node ? c : document.createTextNode(c == null ? '' : c)));
    return n;
  };
  async function api(url, { method = 'GET', json, body } = {}) {
    const headers = { 'X-Requested-With': 'fetch' };
    if (json) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { method, headers, credentials: 'same-origin', body: json ? JSON.stringify(json) : body });
    if (r.status === 401) { location.href = '/admin'; throw new Error('Session expirée'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Erreur');
    return d;
  }
  const msg = (t, bad) => { const m = $('msg'); m.textContent = t || ''; m.className = 'db-msg' + (bad ? ' bad' : ''); if (t) setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 4000); };
  const wrap = fn => async (...a) => { try { await fn(...a); } catch (e) { msg(e.message, true); } };
  const frDate = (d, long) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const frDateTime = iso => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);

  const TABS = [['demandes', 'Demandes de devis'], ['rdv', 'Rendez-vous'], ['avis', 'Avis'], ['annonce', 'Annonce'], ['horaires', 'Horaires'], ['documents', 'Documents'], ['stats', 'Statistiques'], ['qr', 'QR code'], ['reglages', 'Réglages']];
  let current = 'demandes', info = {};

  // ---------- Demandes
  async function demandes(p) {
    const list = await api('/api/admin/requests');
    let filter = 'nouveau';
    const box = el('div');
    const draw = () => {
      box.innerHTML = '';
      const shown = list.filter(r => filter === 'tous' || r.status === filter);
      const sel = el('select', { onchange: e => { filter = e.target.value; draw(); } },
        ...[['nouveau', 'Nouvelles'], ['traite', 'Traitées'], ['archive', 'Archivées'], ['tous', 'Toutes']].map(([v, l]) => el('option', { value: v, selected: v === filter }, `${l} (${v === 'tous' ? list.length : list.filter(r => r.status === v).length})`)));
      box.append(el('div', { class: 'db-bar' }, sel));
      if (!shown.length) box.append(el('p', { class: 'db-empty' }, 'Aucune demande dans cette catégorie.'));
      shown.forEach(r => {
        const photos = (r.photos || []).map(f => el('a', { href: '/api/admin/private/' + f, target: '_blank', rel: 'noopener' }, el('img', { src: '/api/admin/private/' + f, alt: 'Photo du client', loading: 'lazy' })));
        const note = el('textarea', { rows: 2, placeholder: 'Note personnelle (visible uniquement par vous)', onblur: wrap(async e => { if (e.target.value !== (r.note || '')) { await api('/api/admin/requests/' + r.id, { method: 'PATCH', json: { note: e.target.value } }); r.note = e.target.value; msg('Note enregistrée'); } }) }, r.note || '');
        const set = st => wrap(async () => { await api('/api/admin/requests/' + r.id, { method: 'PATCH', json: { status: st } }); r.status = st; draw(); updateBadges(); });
        box.append(el('article', { class: 'db-card' + (r.status === 'nouveau' ? ' is-new' : '') },
          el('header', {}, el('h3', {}, r.nom, ' ', el('small', {}, r.source === 'contact' ? 'Message de contact' : 'Demande de devis')), el('span', { class: 'db-date' }, frDateTime(r.created))),
          el('dl', { class: 'db-dl' },
            el('div', {}, el('dt', {}, 'Travaux'), el('dd', {}, r.travaux || '—')),
            el('div', {}, el('dt', {}, 'Commune'), el('dd', {}, r.commune || '—')),
            el('div', {}, el('dt', {}, 'Téléphone'), el('dd', {}, el('a', { href: 'tel:' + r.tel.replace(/[^\d+]/g, '') }, r.tel))),
            el('div', {}, el('dt', {}, 'E-mail'), el('dd', {}, el('a', { href: 'mailto:' + r.email }, r.email))),
            r.batiment ? el('div', {}, el('dt', {}, 'Bâtiment'), el('dd', {}, r.batiment)) : '',
            r.surface ? el('div', {}, el('dt', {}, 'Surface'), el('dd', {}, r.surface)) : '',
            r.delai ? el('div', {}, el('dt', {}, 'Délai'), el('dd', {}, r.delai)) : ''),
          r.message ? el('p', { class: 'db-text' }, r.message) : '',
          photos.length ? el('div', { class: 'db-photos' }, photos) : '',
          note,
          el('div', { class: 'db-actions' },
            r.status !== 'traite' ? el('button', { class: 'pri', onclick: set('traite') }, 'Marquer comme traitée') : el('button', { onclick: set('nouveau') }, 'Rouvrir'),
            r.status !== 'archive' ? el('button', { onclick: set('archive') }, 'Archiver') : '',
            el('button', { class: 'danger', onclick: wrap(async () => { if (!confirm('Supprimer définitivement cette demande et ses photos ?')) return; await api('/api/admin/requests/' + r.id, { method: 'DELETE' }); list.splice(list.indexOf(r), 1); draw(); updateBadges(); }) }, 'Supprimer'))));
      });
    };
    p.append(box); draw();
  }

  // ---------- Rendez-vous
  async function rdv(p) {
    const { list, confirmDaysBefore } = await api('/api/admin/rdv');
    if (!info.mail) p.append(el('p', { class: 'db-note' }, 'Les e-mails automatiques ne sont pas configurés : pensez à appeler ou écrire au client après avoir confirmé (voir l\'onglet Réglages).'));
    p.append(el('p', { class: 'db-note info' }, `Chaque rendez-vous doit être confirmé au plus tard ${confirmDaysBefore} jours avant la date prévue.`));
    const today = todayStr();
    const groups = [['À confirmer', a => a.status === 'en_attente'], ['Confirmés', a => a.status === 'confirme'], ['Refusés / annulés', a => a.status === 'refuse' || a.status === 'annule']];
    groups.forEach(([title, fn]) => {
      const items = list.filter(fn).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      p.append(el('h2', { class: 'db-h' }, `${title} (${items.length})`));
      if (!items.length) p.append(el('p', { class: 'db-empty' }, 'Aucun rendez-vous.'));
      items.forEach(a => {
        const left = daysBetween(today, a.confirmBy);
        const badge = a.status !== 'en_attente' ? '' :
          left < 0 ? el('span', { class: 'badge bad' }, `Confirmation en retard (échéance le ${frDate(a.confirmBy)})`) :
          left === 0 ? el('span', { class: 'badge warn' }, 'À confirmer aujourd\'hui') :
          el('span', { class: 'badge' + (left <= 2 ? ' warn' : '') }, `À confirmer avant le ${frDate(a.confirmBy)} (dans ${left} j)`);
        const act = (st, ask) => wrap(async () => { if (ask && !confirm(ask)) return; await api(`/api/admin/rdv/${a.id}/status`, { method: 'POST', json: { status: st } }); msg(st === 'confirme' ? 'Rendez-vous confirmé' + (info.mail ? ' : e-mail envoyé au client' : ' (pensez à prévenir le client)') : 'Mis à jour'); render(); });
        p.append(el('article', { class: 'db-card' + (a.status === 'en_attente' ? ' is-new' : '') },
          el('header', {}, el('h3', {}, frDate(a.date, true), ' à ', a.time, ' ', el('small', {}, a.kind)), badge),
          el('dl', { class: 'db-dl' },
            el('div', {}, el('dt', {}, 'Client'), el('dd', {}, a.nom)),
            el('div', {}, el('dt', {}, 'Téléphone'), el('dd', {}, el('a', { href: 'tel:' + a.tel.replace(/[^\d+]/g, '') }, a.tel))),
            el('div', {}, el('dt', {}, 'E-mail'), el('dd', {}, el('a', { href: 'mailto:' + a.email }, a.email))),
            el('div', {}, el('dt', {}, 'Adresse'), el('dd', {}, a.adresse || '—'))),
          a.note ? el('p', { class: 'db-text' }, a.note) : '',
          el('div', { class: 'db-actions' },
            a.status === 'en_attente' ? [el('button', { class: 'pri', onclick: act('confirme') }, 'Confirmer'), el('button', { onclick: act('refuse', 'Refuser ce créneau ? Le client sera prévenu par e-mail.') }, 'Refuser')] : '',
            a.status === 'confirme' ? el('button', { onclick: act('annule', 'Annuler ce rendez-vous ? Le client sera prévenu par e-mail.') }, 'Annuler') : '',
            el('button', { class: 'danger', onclick: wrap(async () => { if (!confirm('Supprimer ce rendez-vous ?')) return; await api('/api/admin/rdv/' + a.id, { method: 'DELETE' }); render(); }) }, 'Supprimer'))));
      });
    });
  }

  // ---------- Avis
  async function avis(p) {
    const [list, s] = await Promise.all([api('/api/admin/reviews'), api('/api/admin/settings')]);
    const f = el('form', { class: 'db-form', onsubmit: wrap(async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      await api('/api/admin/reviews', { method: 'POST', json: d }); msg('Avis ajouté'); render();
    }) },
      el('h2', { class: 'db-h' }, 'Ajouter un avis'),
      el('p', { class: 'db-note info' }, 'Ajoutez uniquement de vrais avis de clients (par exemple recopiés depuis votre fiche Google). La section n\'apparaît sur le site que lorsqu\'il y a au moins un avis.'),
      el('label', {}, 'Nom du client', el('input', { name: 'author', required: true, maxlength: 60 })),
      el('label', {}, 'Note', el('select', { name: 'rating' }, ...[5, 4, 3, 2, 1].map(n => el('option', { value: n }, n + ' / 5')))),
      el('label', {}, 'Date (facultatif)', el('input', { type: 'date', name: 'date' })),
      el('label', {}, 'Texte de l\'avis', el('textarea', { name: 'text', rows: 3, required: true, maxlength: 800 })),
      el('button', { class: 'pri', type: 'submit' }, 'Ajouter'));
    const g = el('form', { class: 'db-form', onsubmit: wrap(async e => { e.preventDefault(); await api('/api/admin/settings', { method: 'PUT', json: { reviews: { googleUrl: g.url.value } } }); msg('Lien enregistré'); }) },
      el('h2', { class: 'db-h' }, 'Lien vers vos avis Google'),
      el('label', {}, 'Adresse du lien (affiché sous les avis)', el('input', { name: 'url', type: 'url', value: s.reviews.googleUrl, placeholder: 'https://g.page/r/...' })),
      el('button', { class: 'pri', type: 'submit' }, 'Enregistrer'));
    p.append(f, g, el('h2', { class: 'db-h' }, `Avis publiés (${list.length})`));
    if (!list.length) p.append(el('p', { class: 'db-empty' }, 'Aucun avis pour le moment.'));
    list.forEach(r => p.append(el('article', { class: 'db-card' }, el('header', {}, el('h3', {}, r.author, ' ', el('small', {}, '★'.repeat(r.rating))), el('span', { class: 'db-date' }, r.date ? frDate(r.date) : '')), el('p', { class: 'db-text' }, r.text),
      el('div', { class: 'db-actions' }, el('button', { class: 'danger', onclick: wrap(async () => { if (!confirm('Supprimer cet avis ?')) return; await api('/api/admin/reviews/' + r.id, { method: 'DELETE' }); render(); }) }, 'Supprimer')))));
  }

  // ---------- Annonce
  async function annonce(p) {
    const s = await api('/api/admin/settings');
    const a = s.announcement;
    const f = el('form', { class: 'db-form', onsubmit: wrap(async e => {
      e.preventDefault();
      await api('/api/admin/settings', { method: 'PUT', json: { announcement: { enabled: f.enabled.checked, text: f.text.value, tone: f.tone.value } } });
      msg(f.enabled.checked ? 'Annonce affichée sur le site' : 'Annonce masquée');
    }) },
      el('h2', { class: 'db-h' }, 'Bandeau d\'annonce'),
      el('p', { class: 'db-note info' }, 'Affiché en haut de toutes les pages. Exemples : « Fermé du 24 au 31 décembre », « Délai actuel pour un devis : 1 semaine ».'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', name: 'enabled', checked: a.enabled }), ' Afficher le bandeau sur le site'),
      el('label', {}, 'Message (240 caractères maximum)', el('input', { name: 'text', maxlength: 240, value: a.text, placeholder: 'Votre annonce…' })),
      el('label', {}, 'Style', el('select', { name: 'tone' }, el('option', { value: 'info', selected: a.tone === 'info' }, 'Information (bleu)'), el('option', { value: 'warn', selected: a.tone === 'warn' }, 'Important (orange)'))),
      el('button', { class: 'pri', type: 'submit' }, 'Enregistrer'));
    p.append(f);
  }

  // ---------- Horaires de rendez-vous
  async function horaires(p) {
    const s = (await api('/api/admin/settings')).booking;
    const names = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const fmt = r => (r || []).map(x => x.join('-')).join(', ');
    const f = el('form', { class: 'db-form', onsubmit: wrap(async e => {
      e.preventDefault();
      const weekly = {};
      for (const d of order) {
        const v = f['d' + d].value.trim();
        weekly[d] = v ? v.split(',').map(x => x.trim().split('-').map(t => t.trim())) : [];
        if (weekly[d].some(r => r.length !== 2 || !/^\d{2}:\d{2}$/.test(r[0]) || !/^\d{2}:\d{2}$/.test(r[1]))) throw new Error(`Format incorrect pour ${names[d]} : écrivez par exemple 09:00-12:00, 14:00-17:00`);
      }
      const out = await api('/api/admin/settings', { method: 'PUT', json: { booking: {
        enabled: f.enabled.checked, slotMinutes: f.slot.value, minNoticeDays: f.notice.value, maxDaysAhead: f.ahead.value, confirmDaysBefore: f.confirm.value, weekly,
        closed: f.closed.value.split(/[\s,;]+/).filter(Boolean) } } });
      msg('Horaires enregistrés'); render();
    }) },
      el('h2', { class: 'db-h' }, 'Horaires de prise de rendez-vous'),
      el('p', { class: 'db-note info' }, 'Les visiteurs ne peuvent réserver que dans ces plages. Laissez un jour vide pour le fermer.'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', name: 'enabled', checked: s.enabled }), ' Autoriser la prise de rendez-vous en ligne'),
      el('div', { class: 'db-grid2' }, ...order.map(d => el('label', {}, names[d], el('input', { name: 'd' + d, value: fmt(s.weekly[d]), placeholder: 'fermé (ex. 09:00-12:00, 14:00-17:00)' })))),
      el('div', { class: 'db-grid2' },
        el('label', {}, 'Durée d\'un créneau (minutes)', el('input', { type: 'number', name: 'slot', min: 15, max: 240, step: 15, value: s.slotMinutes })),
        el('label', {}, 'Délai minimum de réservation (jours)', el('input', { type: 'number', name: 'notice', min: 0, max: 30, value: s.minNoticeDays })),
        el('label', {}, 'Réservation possible jusqu\'à (jours)', el('input', { type: 'number', name: 'ahead', min: 7, max: 180, value: s.maxDaysAhead })),
        el('label', {}, 'Je confirme les rendez-vous (jours avant)', el('input', { type: 'number', name: 'confirm', min: 0, max: 14, value: s.confirmDaysBefore }))),
      el('label', {}, 'Jours fermés (dates AAAA-MM-JJ, séparées par des espaces ou des virgules)', el('textarea', { name: 'closed', rows: 2, placeholder: '2026-12-25 2026-12-31' }, s.closed.join(' '))),
      el('p', { class: 'db-note' }, 'Astuce : gardez un délai minimum supérieur au nombre de jours de confirmation, pour avoir le temps de répondre.'),
      el('button', { class: 'pri', type: 'submit' }, 'Enregistrer'));
    p.append(f);
  }

  // ---------- Documents
  async function documents(p) {
    const i = await api('/api/admin/info');
    const input = el('input', { type: 'file', accept: 'application/pdf', onchange: wrap(async e => {
      const file = e.target.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      await api('/api/admin/document', { method: 'POST', body: fd }); msg('Attestation mise en ligne'); render();
    }) });
    p.append(el('div', { class: 'db-form' },
      el('h2', { class: 'db-h' }, 'Attestation de garantie décennale'),
      el('p', { class: 'db-note info' }, 'Le PDF est proposé en téléchargement sur la page « À propos ». Tant qu\'aucun fichier n\'est envoyé, le bloc reste invisible pour les visiteurs.'),
      el('p', {}, i.doc ? el('span', { class: 'badge ok' }, 'Document en ligne') : el('span', { class: 'badge warn' }, 'Aucun document')),
      i.doc ? el('p', {}, el('a', { href: '/attestation-decennale.pdf', target: '_blank', rel: 'noopener' }, 'Consulter le PDF actuel')) : '',
      el('label', {}, i.doc ? 'Remplacer par un nouveau PDF' : 'Envoyer le PDF (10 Mo maximum)', input),
      i.doc ? el('div', { class: 'db-actions' }, el('button', { class: 'danger', onclick: wrap(async () => { if (!confirm('Retirer l\'attestation du site ?')) return; await api('/api/admin/document', { method: 'DELETE' }); render(); }) }, 'Retirer le document')) : ''));
  }

  // ---------- Statistiques
  async function statistiques(p) {
    let days = 30;
    const box = el('div');
    const draw = async () => {
      const s = await api('/api/admin/stats?days=' + days);
      box.innerHTML = '';
      const card = (n, l) => el('div', { class: 'db-stat' }, el('strong', {}, n), el('span', {}, l));
      const max = Math.max(1, ...s.days.map(d => d.views));
      const W = 720, H = 180, bw = W / s.days.length;
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H + 24}`); svg.setAttribute('class', 'db-chart');
      s.days.forEach((d, i) => {
        const h = Math.round((d.views / max) * H);
        const r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('x', i * bw + 1); r.setAttribute('y', H - h); r.setAttribute('width', Math.max(1, bw - 2)); r.setAttribute('height', h); r.setAttribute('class', 'bar');
        const t = document.createElementNS(svgNS, 'title'); t.textContent = `${frDate(d.date)} : ${d.views} visites, ${d.visitors} visiteurs, ${d.calls} appels`; r.append(t);
        svg.append(r);
      });
      const lab = (x, t, a) => { const e = document.createElementNS(svgNS, 'text'); e.setAttribute('x', x); e.setAttribute('y', H + 18); e.setAttribute('text-anchor', a); e.textContent = t; svg.append(e); };
      lab(0, frDate(s.days[0].date).slice(0, 5), 'start'); lab(W, frDate(s.days[s.days.length - 1].date).slice(0, 5), 'end');
      const table = (title, obj) => {
        const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return el('div', { class: 'db-card' }, el('h3', {}, title), rows.length ? el('table', { class: 'db-table' }, ...rows.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, v)))) : el('p', { class: 'db-empty' }, 'Pas encore de données.'));
      };
      box.append(
        el('div', { class: 'db-bar' }, el('select', { onchange: e => { days = +e.target.value; draw(); } }, ...[[7, '7 derniers jours'], [30, '30 derniers jours'], [90, '90 derniers jours']].map(([v, l]) => el('option', { value: v, selected: v === days }, l)))),
        el('div', { class: 'db-stats' }, card(s.views, 'pages vues'), card(s.visitors, 'visiteurs (cumul par jour)'), card(s.calls, 'clics sur « Appeler »'), card(s.forms, 'demandes envoyées')),
        el('div', { class: 'db-card' }, el('h3', {}, 'Visites par jour'), svg),
        el('div', { class: 'db-grid2' }, table('Pages les plus vues', s.pages), table('D\'où viennent les visiteurs', s.sources),
          table('Appareils', { Mobile: s.devices.mobile, Ordinateur: s.devices.desktop })),
        el('p', { class: 'db-note' }, 'Mesure anonyme, sans cookie : aucune adresse IP n\'est conservée. Les robots et les visites de l\'administrateur ne sont pas comptés.'));
    };
    p.append(box); await draw();
  }

  // ---------- QR code
  async function qr(p) {
    const s = await api('/api/admin/settings');
    let target = 'accueil';
    const img = el('img', { class: 'db-qr', alt: 'QR code', width: 260, height: 260 });
    const links = el('div', { class: 'db-actions' });
    const upd = () => {
      const q = `/api/admin/qr?target=${target}`;
      img.src = q + '&t=' + Date.now();
      links.innerHTML = '';
      links.append(el('a', { class: 'btnlink', href: q + '&format=svg&download=1' }, 'Télécharger (SVG)'), el('a', { class: 'btnlink', href: q + '&format=png&download=1' }, 'Télécharger (PNG)'), el('a', { class: 'btnlink pri', href: `/admin/qr-print?target=${target}`, target: '_blank', rel: 'noopener' }, 'Affiche à imprimer'));
    };
    const sel = el('select', { onchange: e => { target = e.target.value; upd(); } },
      el('option', { value: 'accueil' }, 'Page d\'accueil'), el('option', { value: 'devis' }, 'Devis en ligne'), el('option', { value: 'rdv' }, 'Prise de rendez-vous'),
      s.reviews.googleUrl ? el('option', { value: 'avis' }, 'Avis Google') : '');
    const warn = !s.siteUrl ? el('p', { class: 'db-note' }, 'Attention : l\'adresse officielle du site n\'est pas encore renseignée (onglet Réglages). Le QR code pointe actuellement vers l\'adresse utilisée dans votre navigateur (' + location.origin + '), qui ne fonctionnera pas pour vos clients tant que le site n\'est pas en ligne.') : '';
    p.append(el('div', { class: 'db-form' }, el('h2', { class: 'db-h' }, 'QR code imprimable'), el('p', { class: 'db-note info' }, 'À coller sur votre camionnette, vos flyers et vos devis. Les scans sont comptés dans les statistiques (source « QR code »).'), warn, el('label', {}, 'Où doit mener le QR code ?', sel), img, links));
    upd();
  }

  // ---------- Réglages
  async function reglages(p) {
    const [s, i] = await Promise.all([api('/api/admin/settings'), api('/api/admin/info')]);
    const f = el('form', { class: 'db-form', onsubmit: wrap(async e => { e.preventDefault(); await api('/api/admin/settings', { method: 'PUT', json: { notifyEmail: f.mail.value, siteUrl: f.url.value } }); msg('Réglages enregistrés'); render(); }) },
      el('h2', { class: 'db-h' }, 'Réglages'),
      el('label', {}, 'Adresse e-mail qui reçoit les notifications', el('input', { type: 'email', name: 'mail', value: s.notifyEmail, required: true })),
      el('label', {}, 'Adresse officielle du site (pour le QR code)', el('input', { type: 'url', name: 'url', value: s.siteUrl, placeholder: 'https://www.mon-site.fr' })),
      el('button', { class: 'pri', type: 'submit' }, 'Enregistrer'));
    p.append(f, el('div', { class: 'db-form' }, el('h2', { class: 'db-h' }, 'Envoi d\'e-mails'),
      i.mail ? el('p', {}, el('span', { class: 'badge ok' }, 'Configuré'), ' Vous recevez un e-mail à chaque demande et vos clients reçoivent leurs confirmations.') :
        el('p', {}, el('span', { class: 'badge warn' }, 'Non configuré'), ' Les demandes sont enregistrées dans ce tableau de bord, mais aucun e-mail n\'est envoyé. Pour les activer, renseignez les variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (et MAIL_FROM) chez votre hébergeur. Voir le README.')));
  }

  // ---------- navigation
  const VIEWS = { demandes, rdv, avis, annonce, horaires, documents, stats: statistiques, qr, reglages };
  async function render() {
    const panel = $('panel'); panel.innerHTML = '';
    try { info = await api('/api/admin/info'); await VIEWS[current](panel); } catch (e) { msg(e.message, true); }
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === current));
  }
  async function updateBadges() {
    try {
      const [r, a] = await Promise.all([api('/api/admin/requests'), api('/api/admin/rdv')]);
      const n = { demandes: r.filter(x => x.status === 'nouveau').length, rdv: a.list.filter(x => x.status === 'en_attente').length };
      document.querySelectorAll('#tabs button').forEach(b => { const c = n[b.dataset.t]; b.querySelector('i').textContent = c ? c : ''; });
    } catch {}
  }
  TABS.forEach(([k, l]) => $('tabs').append(el('button', { type: 'button', 'data-t': k, role: 'tab', onclick: () => { current = k; location.hash = k; render(); } }, l, el('i', { class: 'cnt' }))));
  if (TABS.some(t => t[0] === location.hash.slice(1))) current = location.hash.slice(1);
  $('out').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/'; });
  render(); updateBadges();
})();
