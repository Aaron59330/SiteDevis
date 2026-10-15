'use strict';
/* Rappels : cloche dans la barre du haut avec les échéances (factures impayées, devis sans réponse, déclarations URSSAF / TVA, CFE,
   charges récurrentes, abonnement). Chaque rappel revient tous les jours tant que la situation n'est pas réglée ;
   « Vu » le masque seulement jusqu'au lendemain. Notification sur l'appareil une fois par jour si elle est autorisée. */
(function () {
  const dayDiff = d => Math.round((new Date(d + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5);
  const inDays = n => n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n > 1 ? `dans ${n} jours` : n === -1 ? 'hier' : `il y a ${-n} jours`;
  const clientOf = q => (q.clientText || '').split('\n')[0] || 'votre client';

  function compute() {
    const out = [];
    if (!db || !db.quotes) return out;
    // factures envoyées non payées
    db.quotes.filter(q => isInv(q) && q.status === 'envoye').forEach(q => {
      const due = totals(q).due; if (!(due > 0.004)) return;
      if (!q.dueDate) return out.push({ id: 'inv-' + q.id, lvl: 'info', ico: 'file', title: `Facture ${q.number} non payée`, text: `${money(due)} attendus de ${clientOf(q)} (pas d’échéance indiquée).`, go: ['editor', q.id] });
      const n = dayDiff(q.dueDate);
      if (n < 0) out.push({ id: 'inv-' + q.id, lvl: 'danger', ico: 'alert', title: `Facture ${q.number} impayée — en retard`, text: `${clientOf(q)} n’a pas encore payé ${money(due)}. Échéance dépassée depuis ${-n} jour${n < -1 ? 's' : ''} (${fdate(q.dueDate)}).`, go: ['editor', q.id], sort: n });
      else if (n <= 7) out.push({ id: 'inv-' + q.id, lvl: 'warn', ico: 'file', title: `Facture ${q.number} à payer ${inDays(n)}`, text: `${money(due)} attendus de ${clientOf(q)} avant le ${fdate(q.dueDate)}.`, go: ['editor', q.id], sort: n });
    });
    // devis envoyés sans réponse
    db.quotes.filter(q => !isInv(q) && q.status === 'envoye' && q.validUntil).forEach(q => {
      const n = dayDiff(q.validUntil);
      if (n < 0 && n >= -30) out.push({ id: 'dev-' + q.id, lvl: 'warn', ico: 'clipboard', title: `Devis ${q.number} expiré sans réponse`, text: `Relancez ${clientOf(q)} : le devis n’est plus valable depuis le ${fdate(q.validUntil)}.`, go: ['editor', q.id], sort: 20 + n });
      else if (n >= 0 && n <= 5) out.push({ id: 'dev-' + q.id, lvl: 'info', ico: 'clipboard', title: `Devis ${q.number} : réponse attendue`, text: `Valable jusqu’au ${fdate(q.validUntil)} (${inDays(n)}). Pensez à relancer ${clientOf(q)}.`, go: ['editor', q.id], sort: 30 + n });
    });
    // déclarations et paiements (Comptabilité > À prévoir)
    if (typeof window.comptaDeadlines === 'function') {
      try {
        window.comptaDeadlines().forEach(([d, t]) => { const n = dayDiff(d); if (n < 0 || n > 15) return;
          out.push({ id: 'cp-' + d + '-' + t.slice(0, 40), lvl: n <= 3 ? 'warn' : 'info', ico: 'calc', title: `${t.split(' — ')[0]}`, text: `À faire avant le ${fdate(d)} (${inDays(n)}).`, go: ['stats', 'compta'], sort: 40 + n }); });
      } catch (e) { /* ignore */ }
    }
    // administrateur : questions des visiteurs pas encore lues
    if (session.user && session.user.role === 'admin' && window.__adminUnread > 0) { const n = window.__adminUnread;
      out.push({ id: 'msg-' + n, lvl: 'warn', ico: 'mail', title: `${n} nouvelle${n > 1 ? 's' : ''} question${n > 1 ? 's' : ''} de visiteurs`, text: 'Posée' + (n > 1 ? 's' : '') + ' depuis la page Questions. Répondez-y dans Administration > Questions.', go: ['admin', 'messages'], sort: -100 }); }
    // abonnement
    const a = session.access || {};
    if (a.active && a.until && session.user && session.user.role !== 'admin') { const n = dayDiff(String(a.until).slice(0, 10)); if (n >= 0 && n <= 5) out.push({ id: 'sub-' + String(a.until).slice(0, 10), lvl: 'warn', ico: 'lock', title: 'Votre abonnement se termine bientôt', text: `Accès jusqu’au ${fdate(String(a.until).slice(0, 10))} (${inDays(n)}). Renouvelez-le pour continuer à travailler.`, go: ['billing'], sort: 50 }); }
    return out.sort((x, y) => (x.lvl === 'danger' ? -1 : 0) - (y.lvl === 'danger' ? -1 : 0) || (x.sort ?? 99) - (y.sort ?? 99));
  }
  const seen = () => (db.settings.notifSeen = db.settings.notifSeen || {});
  const unread = l => l.filter(n => seen()[n.id] !== today());

  function bell() {
    const box = document.getElementById('notifbox'); if (!box || !session.user) return;
    let pop = document.getElementById('notifPop');
    const list = compute(), u = unread(list), danger = u.some(n => n.lvl === 'danger');
    box.innerHTML = `<button class="theme-btn notif-btn" data-act="notif-open" title="Rappels" aria-label="Rappels (${u.length})"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>${u.length ? `<b class="notif-count ${danger ? 'd' : ''}">${u.length > 9 ? '9+' : u.length}</b>` : ''}</button>`;
    // le panneau reste ouvert pendant les mises à jour de la cloche
    if (!pop) pop = Object.assign(document.createElement('div'), { className: 'notif-pop', id: 'notifPop', hidden: true });
    box.appendChild(pop); if (!pop.hidden) panel();
  }
  function panel() {
    const pop = document.getElementById('notifPop'); if (!pop) return;
    const list = compute(), s = seen();
    pop.innerHTML = `<div class="np-head"><b>Rappels</b>${list.length ? '<button class="btn small" data-act="notif-all">Tout marquer vu</button>' : ''}</div>
      ${list.length ? list.map(n => `<div class="np-item ${n.lvl} ${s[n.id] === today() ? 'read' : ''}"><button class="np-go" data-act="notif-go" data-id="${esc(n.id)}"><span class="np-ico">${icon(n.ico)}</span><span><b>${esc(n.title)}</b><span>${esc(n.text)}</span></span></button>
        ${s[n.id] === today() ? '<i class="np-seen">vu</i>' : `<button class="np-ok" data-act="notif-seen" data-id="${esc(n.id)}" title="Masquer jusqu’à demain">Vu</button>`}</div>`).join('')
        : '<p class="muted" style="padding:14px 4px;margin:0">Aucun rappel. Tout est à jour ✓</p>'}
      <div class="np-foot">${'Notification' in window ? (Notification.permission === 'granted' ? '<span class="muted">Notifications activées sur cet appareil</span>' : Notification.permission === 'denied' ? '<span class="muted">Notifications bloquées dans le navigateur</span>' : '<button class="btn small" data-act="notif-perm">Recevoir aussi une notification sur cet appareil</button>') : ''}
        <label class="check" style="margin:6px 0 0"><input type="checkbox" id="notifMail" ${db.settings.notifEmail ? 'checked' : ''}> Recevoir les rappels par email chaque matin</label></div>`;
    const m = document.getElementById('notifMail'); if (m) m.onchange = () => { db.settings.notifEmail = m.checked; save(); toast(m.checked ? 'Rappels par email activés' : 'Rappels par email désactivés'); };
  }
  /* Une fois par jour : bandeau et notification système */
  function daily() {
    if (!session.user || !db.quotes) return;
    const u = unread(compute()), key = 'od-notif-day';
    let last = ''; try { last = localStorage.getItem(key) || ''; } catch (e) { /* ignore */ }
    if (!u.length || last === today()) return;
    try { localStorage.setItem(key, today()); } catch (e) { /* ignore */ }
    const d = u.filter(n => n.lvl === 'danger').length;
    toast(`🔔 ${u.length} rappel${u.length > 1 ? 's' : ''} aujourd’hui${d ? ` dont ${d} facture${d > 1 ? 's' : ''} impayée${d > 1 ? 's' : ''}` : ''}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { const n = new Notification('OptiDevis — ' + u[0].title, { body: u.length > 1 ? `${u[0].text}\n+ ${u.length - 1} autre${u.length > 2 ? 's' : ''} rappel${u.length > 2 ? 's' : ''}` : u[0].text, icon: '/icon-192.png', tag: 'optidevis-' + today() }); n.onclick = () => { window.focus(); n.close(); }; } catch (e) { /* ignore */ }
    }
  }
  const base = window.updateTopbar;
  window.updateTopbar = updateTopbar = function () { base.apply(this, arguments); if (session.viewer) return; bell(); setTimeout(daily, 1200); if (lastUnread == null) setTimeout(pollAdmin, 800); };
  setInterval(() => { bell(); daily(); }, 30 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { bell(); daily(); } });
  const close = () => { const p = document.getElementById('notifPop'); if (p) p.hidden = true; };
  document.addEventListener('click', e => { if (e.target.isConnected && !e.target.closest('#notifbox')) close(); });
  Object.assign(actions, {
    'notif-open'() { const p = document.getElementById('notifPop'); if (!p) return; if (p.hidden) { panel(); p.hidden = false; } else p.hidden = true; },
    'notif-seen'(t) { seen()[t.dataset.id] = today(); save(); bell(); },
    'notif-all'() { compute().forEach(n => { seen()[n.id] = today(); }); save(); bell(); },
    'notif-go'(t) { const n = compute().find(x => x.id === t.dataset.id); close(); if (!n) return; seen()[n.id] = today(); save(); if (n.go[0] === 'stats') { statUI.tab = n.go[1]; go('stats'); } else if (n.go[0] === 'admin') { adminTab = n.go[1]; go('admin'); } else go(n.go[0], n.go[1]); bell(); },
    async 'notif-perm'() { try { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifications activées sur cet appareil' : 'Notifications refusées'); } catch (e) { /* ignore */ } panel(); }
  });
  // la cloche se met à jour quand les données changent (facture payée, devis accepté…)
  const baseSave = window.save;
  if (typeof baseSave === 'function') window.save = save = function () { const r = baseSave.apply(this, arguments); clearTimeout(window.__nb); window.__nb = setTimeout(bell, 300); return r; };
  window.notifCompute = compute;
  /* administrateur : compte des questions non lues (toutes les 5 minutes) ; notification sur l'appareil quand une nouvelle arrive */
  let lastUnread = null;
  async function pollAdmin() {
    if (!session.user || session.user.role !== 'admin') return;
    try { const r = await api('GET', '/api/admin/messages'); const n = r.unread;
      if (lastUnread != null && n > lastUnread) { const m = r.rows.find(x => x.status === 'new');
        toast(`❓ Nouvelle question de ${m ? m.name : 'un visiteur'}`);
        if ('Notification' in window && Notification.permission === 'granted') try { new Notification('OptiDevis — nouvelle question', { body: m ? `${m.name} : ${m.text.slice(0, 140)}` : '', icon: '/icon-192.png' }); } catch (e) { /* ignore */ } }
      lastUnread = n; window.__adminUnread = n; bell();
      document.querySelectorAll('[data-tab=messages]').forEach(b => { const c = b.querySelector('.tab-count'); if (n && !c) b.insertAdjacentHTML('beforeend', ` <b class="tab-count">${n}</b>`); else if (c) { if (n) c.textContent = n; else c.remove(); } });
    } catch (e) { /* ignore */ }
  }
  window.notifRefresh = () => { lastUnread = window.__adminUnread; bell(); };
  setTimeout(pollAdmin, 1500); setInterval(pollAdmin, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollAdmin(); });
})();
