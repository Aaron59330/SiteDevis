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

  const TABS = [['demandes', 'Demandes de devis'], ['rdv', 'Rendez-vous'], ['agenda', 'Agenda'], ['avis', 'Avis'], ['annonce', 'Annonce'], ['horaires', 'Horaires'], ['documents', 'Documents'], ['stats', 'Statistiques'], ['qr', 'QR code'], ['reglages', 'Réglages']];
  let current = 'demandes', info = {};

  /* ---------- Répondre au client par e-mail (historique des réponses + formulaire) */
  function replyBox(item, url, defSubject, onSent) {
    const wrapEl = el('div', { class: 'db-reply' });
    const hist = () => (item.replies || []).map(rp => el('div', { class: 'db-sent' },
      el('div', { class: 'db-sent-h' }, el('b', {}, '✉ Réponse envoyée'), ' le ', frDateTime(rp.at), ' — ', rp.subject),
      el('div', { class: 'db-sent-t' }, rp.text)));
    const open = () => {
      wrapEl.innerHTML = '';
      wrapEl.append(...hist());
      const subj = el('input', { type: 'text', value: defSubject, maxlength: 150 });
      const body = el('textarea', { rows: 7, placeholder: 'Votre réponse au client…' }, `Bonjour ${item.nom},\n\n\n\nCordialement,\nP.A Couverture`);
      const send = el('button', { class: 'pri', type: 'button', onclick: wrap(async () => {
        send.disabled = true; send.textContent = 'Envoi…';
        try {
          const r = await api(url, { method: 'POST', json: { subject: subj.value, message: body.value } });
          item.replies = r.replies; if (r.status) item.status = r.status;
          msg('Réponse envoyée à ' + item.email); onSent ? onSent() : close();
        } finally { send.disabled = false; send.textContent = 'Envoyer la réponse'; }
      }) }, 'Envoyer la réponse');
      wrapEl.append(el('div', { class: 'db-compose' },
        el('div', { class: 'db-compose-h' }, 'Réponse à ', el('b', {}, item.email), ' — mise en page aux couleurs du site, le client peut vous répondre directement.'),
        el('label', {}, 'Objet', subj), el('label', {}, 'Message', body),
        el('div', { class: 'db-actions' }, send, el('button', { type: 'button', onclick: close }, 'Annuler'))));
      body.focus(); body.setSelectionRange(body.value.indexOf('\n\n') + 2, body.value.indexOf('\n\n') + 2);
    };
    const close = () => {
      wrapEl.innerHTML = '';
      wrapEl.append(...hist(), el('div', { class: 'db-actions' }, info.mail
        ? el('button', { class: 'pri', type: 'button', onclick: open }, (item.replies || []).length ? '✉ Répondre à nouveau' : '✉ Répondre par e-mail')
        : el('span', { class: 'db-note-s' }, 'Réponse par e-mail : activez d\'abord l\'envoi d\'e-mails (onglet Réglages).')));
    };
    close();
    return wrapEl;
  }

  // ---------- Agenda : calendrier du mois, rendez-vous clients + rendez-vous personnels
  const AG = { month: null, form: null };
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const BEF = [[10, '10 min avant'], [30, '30 min avant'], [60, '1 h avant'], [120, '2 h avant'], [180, '3 h avant'], [1440, '1 jour avant'], [2880, '2 jours avant'], [10080, '1 semaine avant']];
  const COLS = [['blue', 'Bleu'], ['green', 'Vert'], ['orange', 'Orange'], ['red', 'Rouge'], ['purple', 'Violet'], ['grey', 'Gris']];
  const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  async function agenda(p) {
    const { events, appointments } = await api('/api/admin/events');
    const today = todayStr();
    if (!AG.month) { const [y, m] = today.split('-').map(Number); AG.month = [y, m - 1]; }
    const [Y, M] = AG.month;
    const go = d => () => { let [y, m] = AG.month; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } AG.month = [y, m]; render(); };
    const openForm = ev => { AG.form = ev; render(); setTimeout(() => { const f = document.querySelector('.ag-form'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); f.elements.title.focus(); } }, 50); };
    p.append(el('div', { class: 'ag-top' },
      el('div', { class: 'ag-nav' }, el('button', { type: 'button', onclick: go(-1), 'aria-label': 'Mois précédent' }, '‹'), el('h2', {}, `${MONTHS[M]} ${Y}`), el('button', { type: 'button', onclick: go(1), 'aria-label': 'Mois suivant' }, '›'),
        el('button', { type: 'button', class: 'ag-today', onclick: () => { AG.month = null; render(); } }, "Aujourd'hui")),
      el('button', { type: 'button', class: 'pri ag-add', onclick: () => openForm({ date: today >= iso(Y, M, 1) && today <= iso(Y, M, 31) ? today : iso(Y, M, 1) }) }, '＋ Nouveau rendez-vous')));
    p.append(el('div', { class: 'ag-legend' }, el('span', { class: 'ag-chip c-client' }, 'Client confirmé'), el('span', { class: 'ag-chip c-wait' }, 'Client à confirmer'), el('span', { class: 'ag-chip c-blue' }, 'Mon agenda'), el('span', { class: 'ag-blk-l' }, 'Réservation en ligne bloquée')));
    if (AG.form) p.append(eventForm(AG.form));
    // grille du mois (semaines du lundi au dimanche)
    const first = new Date(Date.UTC(Y, M, 1)), offset = (first.getUTCDay() + 6) % 7, days = new Date(Date.UTC(Y, M + 1, 0)).getUTCDate();
    const grid = el('div', { class: 'ag-grid' }, ...['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => el('div', { class: 'ag-dow' }, d)));
    for (let i = 0; i < offset; i++) grid.append(el('div', { class: 'ag-cell out' }));
    for (let d = 1; d <= days; d++) {
      const date = iso(Y, M, d);
      const evs = events.filter(e => e.date === date), aps = appointments.filter(a => a.date === date);
      const blocked = evs.some(e => e.block !== 'none');
      const items = aps.map(a => ({ t: a.time, node: el('button', { type: 'button', class: 'ag-chip ' + (a.status === 'confirme' ? 'c-client' : 'c-wait'), title: `${a.nom} — ${a.kind}`, onclick: ev => { ev.stopPropagation(); current = 'rdv'; location.hash = 'rdv'; render(); } }, el('b', {}, a.time), ' ', a.nom) }))
        .concat(evs.map(e => ({ t: e.allDay ? '00:00' : e.start, node: el('button', { type: 'button', class: 'ag-chip c-' + e.color, title: e.title + (e.location ? ' — ' + e.location : ''), onclick: ev => { ev.stopPropagation(); openForm(e); } }, el('b', {}, e.allDay ? 'Journée' : e.start), ' ', e.title, (e.remindBefore.length || e.remindDaily) ? ' 🔔' : '') })))
        .sort((x, y) => x.t.localeCompare(y.t)).map(x => x.node);
      grid.append(el('div', { class: 'ag-cell' + (date === today ? ' today' : '') + (date < today ? ' past' : '') + (blocked ? ' blocked' : ''), title: 'Cliquer pour ajouter un rendez-vous le ' + frDate(date, true), onclick: () => openForm({ date }) },
        el('span', { class: 'ag-num' }, d), ...items));
    }
    p.append(grid);
    // liste des prochains rendez-vous (pratique sur téléphone)
    const next = events.filter(e => e.date >= today).map(e => ({ date: e.date, t: e.allDay ? '' : e.start, txt: e.title + (e.location ? ' — ' + e.location : ''), e }))
      .concat(appointments.filter(a => a.date >= today).map(a => ({ date: a.date, t: a.time, txt: `${a.nom} — ${a.kind}${a.status === 'confirme' ? '' : ' (à confirmer)'}` })))
      .sort((x, y) => (x.date + x.t).localeCompare(y.date + y.t)).slice(0, 15);
    p.append(el('h2', { class: 'db-h' }, 'Prochains rendez-vous'), next.length ? el('div', { class: 'ag-list' }, ...next.map(x => el('button', { type: 'button', class: 'ag-li' + (x.e ? ' mine c-' + x.e.color : ''), onclick: () => x.e ? openForm(x.e) : (current = 'rdv', location.hash = 'rdv', render()) },
      el('span', { class: 'ag-li-d' }, frDate(x.date, true), x.t ? ' · ' + x.t : ' · journée'), el('span', {}, x.txt, x.e && (x.e.remindBefore.length || x.e.remindDaily) ? ' 🔔' : '')))) : el('p', { class: 'db-empty' }, 'Aucun rendez-vous à venir.'));
  }
  function eventForm(e) {
    const isNew = !e.id, rb = new Set(e.remindBefore || (isNew ? [1440] : []));
    const f = el('form', { class: 'db-form ag-form', onsubmit: wrap(async ev => {
      ev.preventDefault();
      const body = { title: f.elements.title.value, date: f.elements.date.value, allDay: f.elements.allDay.checked, start: f.elements.start.value, end: f.elements.end.value, location: f.elements.location.value, note: f.elements.note.value, color: f.elements.color.value, block: f.elements.block.value,
        remindBefore: [...f.querySelectorAll('[name=rb]:checked')].map(x => +x.value), remindDaily: +f.elements.daily.value };
      await api('/api/admin/events' + (isNew ? '' : '/' + e.id), { method: isNew ? 'POST' : 'PUT', json: body });
      msg(isNew ? 'Rendez-vous ajouté à votre agenda' : 'Rendez-vous modifié'); AG.form = null; const [y, m] = body.date.split('-').map(Number); AG.month = [y, m - 1]; render();
    }) },
      el('h2', { class: 'db-h' }, isNew ? 'Nouveau rendez-vous' : 'Modifier le rendez-vous'),
      el('label', {}, 'Titre', el('input', { name: 'title', required: true, maxlength: 120, value: e.title || '', placeholder: 'Ex. Chantier toiture M. Martin, fournisseur, rendez-vous banque…' })),
      el('div', { class: 'ag-row' },
        el('label', {}, 'Date', el('input', { type: 'date', name: 'date', required: true, value: e.date || '' })),
        el('label', {}, 'Début', el('input', { type: 'time', name: 'start', value: e.start || '09:00' })),
        el('label', {}, 'Fin (facultatif)', el('input', { type: 'time', name: 'end', value: e.end || '' }))),
      el('label', { class: 'db-check' }, el('input', { type: 'checkbox', name: 'allDay', checked: !!e.allDay, onchange: ev => { f.elements.start.disabled = f.elements.end.disabled = ev.target.checked; } }), ' Toute la journée'),
      el('label', {}, 'Lieu (facultatif)', el('input', { name: 'location', maxlength: 160, value: e.location || '' })),
      el('label', {}, 'Notes (facultatif)', el('textarea', { name: 'note', rows: 3, maxlength: 1500 }, e.note || '')),
      el('div', { class: 'ag-row' },
        el('label', {}, 'Réservation en ligne des clients', el('select', { name: 'block' }, ...[['day', 'Bloquée toute la journée'], ['hours', 'Bloquée seulement pendant ces heures'], ['none', 'Ne pas bloquer']].map(([v, l]) => el('option', { value: v, selected: (e.block || 'day') === v }, l)))),
        el('label', {}, 'Couleur', el('select', { name: 'color' }, ...COLS.map(([v, l]) => el('option', { value: v, selected: (e.color || 'blue') === v }, l))))),
      el('fieldset', { class: 'ag-rem' }, el('legend', {}, '🔔 Me rappeler par e-mail'),
        el('div', { class: 'ag-rem-b' }, ...BEF.map(([m, l]) => el('label', { class: 'db-check' }, el('input', { type: 'checkbox', name: 'rb', value: m, checked: rb.has(m) }), ' ', l))),
        el('label', {}, 'Rappel chaque jour (le matin)', el('select', { name: 'daily' }, ...[[0, 'Non'], [2, 'À partir de 2 jours avant'], [3, 'À partir de 3 jours avant'], [5, 'À partir de 5 jours avant'], [7, 'À partir de 7 jours avant'], [14, 'À partir de 14 jours avant'], [30, 'À partir de 30 jours avant']].map(([v, l]) => el('option', { value: v, selected: (e.remindDaily || 0) === v }, l)))),
        info.mail ? '' : el('p', { class: 'db-note-s' }, 'Les e-mails ne sont pas encore configurés (onglet Réglages) : les rappels partiront dès qu\'ils le seront.')),
      el('div', { class: 'db-actions' }, el('button', { class: 'pri', type: 'submit' }, isNew ? 'Ajouter à mon agenda' : 'Enregistrer'),
        el('button', { type: 'button', onclick: () => { AG.form = null; render(); } }, 'Annuler'),
        isNew ? '' : el('button', { type: 'button', class: 'danger', onclick: wrap(async () => { if (!confirm('Supprimer ce rendez-vous de votre agenda ?')) return; await api('/api/admin/events/' + e.id, { method: 'DELETE' }); AG.form = null; msg('Rendez-vous supprimé'); render(); }) }, 'Supprimer')));
    if (e.allDay) setTimeout(() => { f.elements.start.disabled = f.elements.end.disabled = true; });
    return f;
  }

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
        const set = st => wrap(async () => { const x = await api('/api/admin/requests/' + r.id, { method: 'PATCH', json: { status: st } }); r.status = st; draw(); updateBadges(); msg(x.mailed ? 'Mis à jour : le client a été prévenu par e-mail' : 'Mis à jour' + (info.mail ? '' : ' (e-mails non configurés : client non prévenu)')); });
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
          replyBox(r, `/api/admin/requests/${r.id}/reply`, `Votre ${r.source === 'contact' ? 'message' : 'demande de devis'} – P.A Couverture`, () => { draw(); updateBadges(); }),
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
        const act = (st, ask) => wrap(async () => { if (ask && !confirm(ask)) return; const x = await api(`/api/admin/rdv/${a.id}/status`, { method: 'POST', json: { status: st } }); msg((st === 'confirme' ? 'Rendez-vous confirmé' : 'Mis à jour') + (x.mailed ? ' : le client a été prévenu par e-mail' : info.mail ? '' : ' (e-mails non configurés : pensez à prévenir le client)')); render(); });
        p.append(el('article', { class: 'db-card' + (a.status === 'en_attente' ? ' is-new' : '') },
          el('header', {}, el('h3', {}, frDate(a.date, true), ' à ', a.time, ' ', el('small', {}, a.kind)), badge),
          el('dl', { class: 'db-dl' },
            el('div', {}, el('dt', {}, 'Client'), el('dd', {}, a.nom)),
            el('div', {}, el('dt', {}, 'Téléphone'), el('dd', {}, el('a', { href: 'tel:' + a.tel.replace(/[^\d+]/g, '') }, a.tel))),
            el('div', {}, el('dt', {}, 'E-mail'), el('dd', {}, el('a', { href: 'mailto:' + a.email }, a.email))),
            el('div', {}, el('dt', {}, 'Adresse'), el('dd', {}, a.adresse || '—'))),
          a.note ? el('p', { class: 'db-text' }, a.note) : '',
          a.status === 'confirme' && a.reminderSent && a.reminderSent !== 'confirmation' ? el('p', { class: 'db-note-s' }, '🔔 Rappel envoyé au client le ' + frDateTime(a.reminderSent)) : a.status === 'confirme' && a.date >= today ? el('p', { class: 'db-note-s' }, '🔔 Rappel automatique la veille' + (info.mail ? '' : ' (e-mails non configurés)')) : '',
          replyBox(a, `/api/admin/rdv/${a.id}/reply`, 'Votre rendez-vous – P.A Couverture'),
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
    const f = el('form', { class: 'db-form', onsubmit: wrap(async e => { e.preventDefault(); await api('/api/admin/settings', { method: 'PUT', json: { notifyEmail: f.mail.value, siteUrl: f.url.value, reminders: { enabled: f.rem.checked, hour: f.remh.value, dailySummary: f.sum.checked }, sms: { agenda: f.sa.checked, daily: f.sd.checked, requests: f.sr.checked } } }); msg('Réglages enregistrés'); render(); }) },
      el('h2', { class: 'db-h' }, 'Réglages'),
      el('label', {}, 'Adresse e-mail qui reçoit les notifications', el('input', { type: 'email', name: 'mail', value: s.notifyEmail, required: true })),
      el('label', {}, 'Adresse officielle du site (pour le QR code)', el('input', { type: 'url', name: 'url', value: s.siteUrl, placeholder: 'https://www.mon-site.fr' })),
      el('h2', { class: 'db-h' }, 'Rappels de rendez-vous'),
      el('label', { class: 'db-check' }, el('input', { type: 'checkbox', name: 'rem', checked: s.reminders.enabled }), ' Envoyer un rappel au client la veille de chaque rendez-vous confirmé (avec le fichier agenda)'),
      el('label', { class: 'db-check' }, el('input', { type: 'checkbox', name: 'sum', checked: s.reminders.dailySummary }), ' M\'envoyer chaque veille la liste de mes rendez-vous du lendemain'),
      el('label', {}, 'Heure d\'envoi des rappels (la veille)', el('select', { name: 'remh' }, ...Array.from({ length: 14 }, (_, i) => i + 7).map(h => el('option', { value: h, selected: h === s.reminders.hour }, h + ' h')))),
      el('h2', { class: 'db-h' }, 'SMS sur mon téléphone'),
      i.sms ? el('p', {}, el('span', { class: 'badge ok' }, 'Configuré'), ` Les SMS partent via ${i.smsProvider === 'free' ? 'Free Mobile (gratuit, vers votre ligne Free)' : 'Brevo'}.`, ' ',
          el('button', { type: 'button', onclick: wrap(async e => { e.target.disabled = true; try { await api('/api/admin/test-sms', { method: 'POST' }); msg('SMS d\'essai envoyé : regardez votre téléphone'); } finally { e.target.disabled = false; } }) }, 'Envoyer un SMS d\'essai'))
        : el('p', { class: 'db-note-s' }, el('span', { class: 'badge warn' }, 'Non configuré'), ' Pour recevoir aussi vos rappels par SMS, lancez sur le serveur :  bash deploy/aptoiture-sms.sh'),
      el('label', { class: 'db-check' }, el('input', { type: 'checkbox', name: 'sa', checked: s.sms.agenda }), ' Rappels de mon agenda aussi par SMS'),
      el('label', { class: 'db-check' }, el('input', { type: 'checkbox', name: 'sd', checked: s.sms.daily }), ' Programme du lendemain aussi par SMS'),
      el('label', { class: 'db-check' }, el('input', { type: 'checkbox', name: 'sr', checked: s.sms.requests }), ' SMS à chaque nouvelle demande de devis ou de rendez-vous'),
      el('button', { class: 'pri', type: 'submit' }, 'Enregistrer'));
    p.append(f, el('div', { class: 'db-form' }, el('h2', { class: 'db-h' }, 'Envoi d\'e-mails'),
      i.mail ? [el('p', {}, el('span', { class: 'badge ok' }, 'Configuré'), ' Vous recevez un e-mail à chaque demande et rendez-vous, vos clients reçoivent leurs confirmations et vos réponses.'),
        el('button', { type: 'button', onclick: wrap(async e => { e.target.disabled = true; try { const r = await api('/api/admin/test-mail', { method: 'POST' }); msg('E-mail d\'essai envoyé à ' + r.to); } finally { e.target.disabled = false; } }) }, 'Envoyer un e-mail d\'essai')] :
        el('p', {}, el('span', { class: 'badge warn' }, 'Non configuré'), ' Les demandes sont enregistrées dans ce tableau de bord, mais aucun e-mail n\'est envoyé. Pour les activer, lancez sur le serveur :  bash deploy/aptoiture-mail.sh')));
  }

  // ---------- navigation
  const VIEWS = { demandes, rdv, agenda, avis, annonce, horaires, documents, stats: statistiques, qr, reglages };
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
