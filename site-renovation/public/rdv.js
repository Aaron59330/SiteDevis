(() => {
  'use strict';
  const root = document.getElementById('rdv');
  if (!root || document.body.hasAttribute('data-admin')) return;
  root.classList.add('wiz-js');
  const form = document.getElementById('rdv-form');
  const panes = Array.from(form.querySelectorAll('.wiz-pane'));
  const steps = Array.from(root.querySelectorAll('.wiz-steps li'));
  const err = document.getElementById('err'), prev = document.getElementById('prev'), next = document.getElementById('next');
  let step = 0, sending = false, sel = { date: '', time: '' }, avail = {}, months = [], mi = 0;

  const frLong = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const val = n => form.elements[n].value.trim();
  const show = n => {
    step = n;
    panes.forEach((p, i) => p.classList.toggle('on', i === n));
    steps.forEach((s, i) => { s.classList.toggle('on', i === n); s.classList.toggle('done', i < n); });
    prev.style.visibility = n === 0 ? 'hidden' : 'visible';
    next.textContent = n === panes.length - 1 ? 'Demander ce rendez-vous' : 'Suivant';
    err.textContent = '';
    if (n === 2) {
      const r = document.getElementById('recap'); r.innerHTML = '';
      const b = document.createElement('b'); b.textContent = (form.querySelector('input[name=kind]:checked') || {}).value || '';
      r.append(b, document.createElement('br'), document.createTextNode(frLong(sel.date) + ' à ' + sel.time));
    }
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
  };

  // ----- calendrier
  const grid = document.getElementById('cgrid'), monthEl = document.getElementById('cmonth'), timesEl = document.getElementById('times'), title = document.getElementById('ctitle');
  const cprev = document.getElementById('cprev'), cnext = document.getElementById('cnext');
  const drawCal = () => {
    const [y, m] = months[mi].split('-').map(Number);
    monthEl.textContent = new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    cprev.disabled = mi === 0; cnext.disabled = mi === months.length - 1;
    grid.innerHTML = '';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(d => { const e = document.createElement('div'); e.className = 'dow'; e.textContent = d; grid.append(e); });
    const first = (new Date(Date.UTC(y, m - 1, 1, 12)).getUTCDay() + 6) % 7;
    for (let i = 0; i < first; i++) grid.append(document.createElement('span'));
    const nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= nd; d++) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (avail[key]) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = d; b.className = 'avail' + (sel.date === key ? ' sel' : '');
        b.addEventListener('click', () => { sel = { date: key, time: '' }; drawCal(); drawTimes(); });
        grid.append(b);
      } else { const s = document.createElement('span'); s.className = 'd'; s.textContent = d; grid.append(s); }
    }
  };
  const drawTimes = () => {
    timesEl.innerHTML = ''; title.hidden = !sel.date;
    if (!sel.date) return;
    title.textContent = 'Créneaux disponibles le ' + frLong(sel.date) + ' :';
    avail[sel.date].forEach(t => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.className = sel.time === t ? 'sel' : '';
      b.addEventListener('click', () => { sel.time = t; drawTimes(); }); timesEl.append(b);
    });
  };
  cprev.addEventListener('click', () => { if (mi > 0) { mi--; drawCal(); } });
  cnext.addEventListener('click', () => { if (mi < months.length - 1) { mi++; drawCal(); } });

  fetch('/api/slots').then(r => r.json()).then(d => {
    if (d.confirmDaysBefore != null) document.getElementById('cdb').textContent = d.confirmDaysBefore;
    d.days.forEach(x => { avail[x.date] = x.times; });
    months = [...new Set(d.days.map(x => x.date.slice(0, 7)))];
    if (!d.enabled || !months.length) {
      document.getElementById('cal').hidden = true; title.hidden = false;
      title.textContent = 'Aucun créneau n\'est disponible en ligne pour le moment. Appelez-nous au 07 89 58 02 24.';
      next.disabled = true; return;
    }
    drawCal();
  }).catch(() => { document.getElementById('cal').hidden = true; title.hidden = false; title.textContent = 'Le service de réservation est momentanément indisponible. Appelez-nous au 07 89 58 02 24.'; next.disabled = true; });

  const validate = n => {
    if (n === 1 && !(sel.date && sel.time)) return 'Choisissez une date puis une heure.';
    if (n === 2) {
      if (val('nom').length < 2) return 'Indiquez votre nom.';
      if (val('tel').replace(/\D/g, '').length < 8) return 'Indiquez un numéro de téléphone valide.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(val('email'))) return 'Indiquez une adresse e-mail valide.';
      if (!form.elements.consent.checked) return 'Merci de cocher la case d\'acceptation.';
    }
    return '';
  };
  async function send() {
    sending = true; next.disabled = true; next.textContent = 'Envoi en cours…'; err.textContent = '';
    try {
      const fd = new FormData(form); const o = Object.fromEntries(fd); o.date = sel.date; o.time = sel.time;
      const r = await fetch('/api/rdv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Envoi impossible.');
      form.hidden = true; root.querySelector('.wiz-steps').hidden = true; document.getElementById('done').hidden = false;
      window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
    } catch (e) {
      err.textContent = e instanceof TypeError ? 'Le service est momentanément indisponible. Appelez-nous au 07 89 58 02 24.' : e.message;
      next.disabled = false; next.textContent = 'Demander ce rendez-vous';
    }
    sending = false;
  }
  next.addEventListener('click', () => {
    if (sending) return;
    const m = validate(step);
    if (m) { err.textContent = m; return; }
    if (step === panes.length - 1) send(); else show(step + 1);
  });
  prev.addEventListener('click', () => { if (step > 0 && !sending) show(step - 1); });
  form.addEventListener('submit', e => e.preventDefault());
  show(0); window.scrollTo(0, 0);
})();
