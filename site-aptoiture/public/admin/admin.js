(() => {
  'use strict';
  const page = document.body.dataset.page;
  const dirtyText = new Map();
  const dirtyImg = new Map();
  let editing = true;
  let current = null;

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    kids.forEach(k => n.append(k));
    return n;
  };
  async function api(url, { method = 'GET', json, body } = {}) {
    const headers = { 'X-Requested-With': 'fetch' };
    if (json) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { method, headers, credentials: 'same-origin', body: json ? JSON.stringify(json) : body });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/admin'; throw new Error('Session expirée'); }
    if (!r.ok) throw new Error(d.error || 'Erreur');
    return d;
  }

  // ---------- barre d'administration
  const msg = el('span', { class: 'adm-msg' });
  const btnEdit = el('button', { class: 'on', title: 'Activer / désactiver la modification (désactivé : vous pouvez naviguer sur le site)' }, 'Modification : oui');
  const btnReset = el('button', { title: 'Rétablir le texte d\'origine de l\'élément sélectionné', disabled: '' }, 'Rétablir le texte');
  const btnSave = el('button', { class: 'save', disabled: '' }, 'Enregistrer');
  const btnOut = el('button', {}, 'Déconnexion');
  const dash = el('a', { class: 'adm-dash', href: '/admin/tableau-de-bord' }, 'Tableau de bord');
  const bar = el('div', { class: 'adm-bar' }, el('span', { class: 'tag' }, 'Mode administrateur'), dash, btnEdit, btnReset, btnSave, btnOut, msg);
  document.body.append(bar);

  const say = (t, bad) => { msg.textContent = t; msg.className = 'adm-msg' + (bad ? ' bad' : ''); };
  const refresh = () => {
    const n = dirtyText.size + dirtyImg.size;
    btnSave.disabled = n === 0;
    btnSave.textContent = n ? `Enregistrer (${n})` : 'Enregistrer';
    if (n) say('Modifications non enregistrées');
  };

  // ---------- textes
  const texts = () => document.querySelectorAll('[data-ed]');
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('adm-edit', on);
    texts().forEach(n => on ? n.setAttribute('contenteditable', 'true') : n.removeAttribute('contenteditable'));
    btnEdit.textContent = 'Modification : ' + (on ? 'oui' : 'non');
    btnEdit.classList.toggle('on', on);
  }
  document.addEventListener('input', e => {
    const n = e.target.closest && e.target.closest('[data-ed]');
    if (!n) return;
    dirtyText.set(n.dataset.ed, n.innerHTML);
    refresh();
  });
  document.addEventListener('focusin', e => {
    const n = e.target.closest && e.target.closest('[data-ed]');
    if (n) { current = n; btnReset.disabled = false; }
  });
  document.addEventListener('keydown', e => {
    const n = e.target.closest && e.target.closest('[data-ed]');
    if (n && e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  });
  document.addEventListener('paste', e => {
    const n = e.target.closest && e.target.closest('[data-ed]');
    if (!n) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });
  btnReset.addEventListener('click', () => {
    if (!current) return;
    current.innerHTML = current.dataset.edOrig;
    dirtyText.set(current.dataset.ed, current.dataset.edOrig);
    refresh();
  });
  btnEdit.addEventListener('click', () => setEditing(!editing));

  // empêche la navigation / l'envoi de formulaire pendant la modification
  document.addEventListener('click', e => {
    if (!editing || e.target.closest('.adm-bar, .adm-modal, .adm-add, .adm-tools')) return;
    const img = e.target.closest('[data-edi]');
    if (img) { e.preventDefault(); e.stopPropagation(); pickImage(img); return; }
    if (e.target.closest('a')) e.preventDefault();
  }, true);
  document.addEventListener('submit', e => { if (editing) e.preventDefault(); }, true);

  // ---------- images
  function dialog(title, text, buttons) {
    return new Promise(res => {
      const box = el('div', { class: 'adm-box' }, el('h3', {}, title), el('p', {}, text),
        el('div', { class: 'row' }, ...buttons.map(([label, val, pri]) => el('button', { class: pri ? 'pri' : '', onclick: () => { m.remove(); res(val); } }, label))));
      const m = el('div', { class: 'adm-modal' }, box);
      document.body.append(m);
    });
  }
  async function uploadFile(file) {
    const fd = new FormData(); fd.append('file', file);
    return (await api('/api/upload', { method: 'POST', body: fd })).url;
  }
  function chooseFiles(multiple) {
    return new Promise(res => {
      // champ ajouté à la page le temps du choix : plus fiable sur tous les navigateurs (Safari, téléphones)
      const inp = el('input', { type: 'file', accept: 'image/*', style: 'position:fixed;left:-9999px;opacity:0' });
      if (multiple) inp.multiple = true;
      inp.addEventListener('change', () => { res(Array.from(inp.files)); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
  }
  async function pickImage(img) {
    const choice = await dialog('Changer l\'image', 'Choisissez une nouvelle photo ou rétablissez l\'image d\'origine.',
      [['Choisir une photo', 'pick', true], ['Rétablir l\'originale', 'reset'], ['Annuler', null]]);
    if (choice === 'reset') {
      img.src = img.dataset.ediOrig; dirtyImg.set(img.dataset.edi, img.dataset.ediOrig); refresh();
    } else if (choice === 'pick') {
      const [f] = await chooseFiles(false);
      if (!f) return;
      say('Envoi de l\'image…');
      try { const url = await uploadFile(f); img.src = url; dirtyImg.set(img.dataset.edi, url); refresh(); }
      catch (ex) { say(ex.message, true); }
    }
  }

  // ---------- enregistrement
  async function save() {
    if (!dirtyText.size && !dirtyImg.size) return;
    btnSave.disabled = true; say('Enregistrement…');
    try {
      await api('/api/content', { method: 'POST', json: { page, text: Object.fromEntries(dirtyText), img: Object.fromEntries(dirtyImg) } });
      dirtyText.clear(); dirtyImg.clear(); refresh(); say('Modifications enregistrées');
    } catch (ex) { say(ex.message, true); refresh(); }
  }
  btnSave.addEventListener('click', save);
  btnOut.addEventListener('click', async () => {
    if ((dirtyText.size || dirtyImg.size) && !confirm('Des modifications ne sont pas enregistrées. Se déconnecter quand même ?')) return;
    dirtyText.clear(); dirtyImg.clear();
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });
  window.addEventListener('beforeunload', e => { if (dirtyText.size || dirtyImg.size) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- réalisations : un chantier = plusieurs photos + titre, catégorie, description
  const gallery = document.getElementById('gallery');
  if (gallery) {
    const input = el('button', {}, 'Nouvelle réalisation');
    const add = el('div', { class: 'adm-add' }, el('p', {}, 'Choisissez toutes les photos d’un même chantier (plusieurs à la fois), puis renseignez son titre, sa catégorie et sa description. ＋ ajoute des photos à un chantier, ★ choisit la photo de couverture.'), input);
    gallery.before(add);
    async function sendPhotos(files, projectId, btn, label) {
      let id = projectId;
      for (let i = 0; i < files.length; i++) {
        btn.textContent = `Envoi ${i + 1}/${files.length}…`;
        const fd = new FormData(); fd.append('files', files[i]); if (id) fd.append('projectId', id);
        id = (await api('/api/realisations', { method: 'POST', body: fd })).id || id;
      }
      return id;
    }
    input.addEventListener('click', async () => {
      const files = await chooseFiles(true);
      if (!files.length) return;
      input.disabled = true;
      try { await sendPhotos(files, null, input); location.reload(); }
      catch (ex) { say(ex.message, true); input.disabled = false; input.textContent = 'Nouvelle réalisation'; }
    });
    const patch = (id, json, ok) => api('/api/realisations/' + id, { method: 'PATCH', json }).then(() => { if (ok) say(ok); });

    gallery.querySelectorAll('.shot').forEach(fig => {
      const id = fig.dataset.id;
      fig.append(el('div', { class: 'adm-tools' },
        el('button', { title: 'Déplacer avant', onclick: () => move(id, 'up') }, '←'),
        el('button', { title: 'Déplacer après', onclick: () => move(id, 'down') }, '→'),
        el('button', { class: 'del', title: 'Supprimer ce chantier et ses photos', onclick: () => remove(id) }, '×')));
      fig.querySelector('.shot-img').addEventListener('click', e => e.preventDefault());
      fig.querySelectorAll('.adm-ph').forEach(ph => {
        const photo = ph.dataset.photo;
        ph.querySelector('.ph-cover').addEventListener('click', async () => { try { await patch(id, { coverPhoto: photo }); location.reload(); } catch (ex) { say(ex.message, true); } });
        ph.querySelector('.ph-del').addEventListener('click', async () => {
          if ((await dialog('Retirer cette photo ?', 'Elle sera supprimée de ce chantier.', [['Retirer', 'y', true], ['Annuler', null]])) !== 'y') return;
          try { await patch(id, { removePhoto: photo }); location.reload(); } catch (ex) { say(ex.message, true); }
        });
      });
      const plus = fig.querySelector('.adm-ph-add');
      plus.addEventListener('click', async () => {
        const files = await chooseFiles(true); if (!files.length) return;
        plus.disabled = true;
        try { await sendPhotos(files, id, plus); location.reload(); } catch (ex) { say(ex.message, true); plus.disabled = false; plus.textContent = '＋'; }
      });
      [['t', 'title'], ['c', 'category'], ['d', 'description']].forEach(([c, field]) => {
        const n = fig.querySelector('.' + c); if (!n) return;
        n.setAttribute('contenteditable', 'plaintext-only');
        n.dataset.orig = n.textContent;
        n.addEventListener('keydown', e => { if (c !== 'd' && e.key === 'Enter') { e.preventDefault(); n.blur(); } });
        n.addEventListener('blur', async () => {
          const v = n.innerText.trim();
          if (v === n.dataset.orig.trim()) return;
          try { await patch(id, { [field]: v }, 'Enregistré'); n.dataset.orig = v; } catch (ex) { say(ex.message, true); }
        });
      });
    });
    async function move(id, dir) { await api('/api/realisations/move', { method: 'POST', json: { id, dir } }); location.reload(); }
    async function remove(id) {
      if ((await dialog('Supprimer ce chantier ?', 'Toutes ses photos seront supprimées. Cette action est définitive.', [['Supprimer', 'y', true], ['Annuler', null]])) !== 'y') return;
      await api('/api/realisations/' + id, { method: 'DELETE' }); location.reload();
    }
  }

  setEditing(true);
  refresh();
  say('Cliquez sur un texte pour le modifier, sur une image pour la changer.');
})();
