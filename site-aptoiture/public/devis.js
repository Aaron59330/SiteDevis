(() => {
  'use strict';
  const root = document.getElementById('devis');
  if (!root || document.body.hasAttribute('data-admin')) return;
  root.classList.add('wiz-js');
  const form = document.getElementById('devis-form');
  const panes = Array.from(form.querySelectorAll('.wiz-pane'));
  const steps = Array.from(root.querySelectorAll('.wiz-steps li'));
  const err = document.getElementById('err'), prev = document.getElementById('prev'), next = document.getElementById('next');
  const files = [];
  let step = 0, sending = false;

  const show = n => {
    step = n;
    panes.forEach((p, i) => p.classList.toggle('on', i === n));
    steps.forEach((s, i) => { s.classList.toggle('on', i === n); s.classList.toggle('done', i < n); });
    prev.style.visibility = n === 0 ? 'hidden' : 'visible';
    next.textContent = n === panes.length - 1 ? 'Envoyer ma demande' : 'Suivant';
    err.textContent = '';
    if (n === panes.length - 1) recap();
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
  };
  const val = n => (form.elements[n] ? form.elements[n].value.trim() : '');
  const recap = () => {
    const r = document.getElementById('recap'); r.innerHTML = '';
    const add = (k, v) => { if (!v) return; const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = k + ' : '; d.append(b, document.createTextNode(v)); r.append(d); };
    add('Travaux', (form.querySelector('input[name=travaux]:checked') || {}).value);
    add('Commune', val('commune')); add('Bâtiment', val('batiment')); add('Photos', files.length ? files.length + ' jointe(s)' : '');
  };
  const validate = n => {
    if (n === 2 && val('commune').length < 2) return 'Indiquez votre commune.';
    if (n === 3) {
      if (val('nom').length < 2) return 'Indiquez votre nom.';
      if (val('tel').replace(/\D/g, '').length < 8) return 'Indiquez un numéro de téléphone valide.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(val('email'))) return 'Indiquez une adresse e-mail valide.';
      if (!form.elements.consent.checked) return 'Merci de cocher la case d\'acceptation.';
    }
    return '';
  };

  // ----- photos
  const thumbs = document.getElementById('thumbs'), input = document.getElementById('photos'), drop = document.getElementById('drop');
  const drawThumbs = () => {
    thumbs.innerHTML = '';
    files.forEach((f, i) => {
      const w = document.createElement('div'); w.className = 'thumb';
      const im = document.createElement('img'); im.src = URL.createObjectURL(f); im.alt = 'Photo ' + (i + 1);
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Retirer la photo'); b.textContent = '×';
      b.addEventListener('click', () => { files.splice(i, 1); drawThumbs(); });
      w.append(im, b); thumbs.append(w);
    });
  };
  const addFiles = list => {
    for (const f of list) {
      if (!/^image\//.test(f.type)) continue;
      if (files.length >= 6) { err.textContent = '6 photos maximum.'; break; }
      files.push(f);
    }
    drawThumbs();
  };
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  ['dragover', 'dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', ev => addFiles(ev.dataTransfer.files));

  // réduit les grosses photos de téléphone avant l'envoi
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      return blob && blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
    } catch { return file; }
  }

  async function send() {
    sending = true; next.disabled = true; next.textContent = 'Envoi en cours…'; err.textContent = '';
    try {
      const fd = new FormData(form);
      fd.delete('photos');
      for (const f of files) fd.append('photos', await shrink(f));
      const r = await fetch('/api/devis', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Envoi impossible.');
      form.hidden = true; root.querySelector('.wiz-steps').hidden = true;
      document.getElementById('done').hidden = false;
      window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
    } catch (e) {
      err.textContent = (e instanceof TypeError ? 'Le service est momentanément indisponible. ' : '') + (e.message && !(e instanceof TypeError) ? e.message : 'Appelez-nous au 06 03 50 82 30.');
      next.disabled = false; next.textContent = 'Envoyer ma demande';
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
  show(0);
  window.scrollTo(0, 0);
})();
