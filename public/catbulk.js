'use strict';
/* Catalogue : sélection multiple et suppression groupée (prestations, matériaux, fournisseurs).
   Une case par ligne (ou par fiche fournisseur), « Tout sélectionner » ne prend que ce qui est affiché (filtre et recherche). */
(function () {
  const sel = new Set(); let selTab = '';
  const rowsOf = () => catUI.tab === 'fournisseurs' ? [...document.querySelectorAll('.sup-grid .card.sup')] : [...document.querySelectorAll('#catTable tbody tr')];
  const idOf = el => (el.querySelector('[data-act=del-item],[data-act=del-sup]') || {}).dataset?.id;
  const visible = () => rowsOf().filter(r => !r.hidden && idOf(r));
  const word = n => catUI.tab === 'fournisseurs' ? `fournisseur${n > 1 ? 's' : ''}` : catUI.tab === 'materiaux' ? `matériau${n > 1 ? 'x' : ''}` : `prestation${n > 1 ? 's' : ''}`;

  const e_ = n => (catUI.tab === 'prestations' ? 'e' : '') + (n > 1 ? 's' : '');   // accord : sélectionnée(s) / supprimé(s)
  function sync() {
    const v = visible(), all = document.getElementById('cbAll'), bar = document.getElementById('bulkBar');
    v.forEach(r => { const id = idOf(r), cb = r.querySelector('.cb-row'); if (cb) cb.checked = sel.has(id); r.classList.toggle('sel', sel.has(id)); });
    const nv = v.filter(r => sel.has(idOf(r))).length;
    if (all) { all.checked = v.length > 0 && nv === v.length; all.indeterminate = nv > 0 && nv < v.length; }
    if (bar) { bar.classList.toggle('on', sel.size > 0); const t = bar.querySelector('.bb-n'); if (t) t.textContent = sel.size ? `${sel.size} ${word(sel.size)} sélectionné${e_(sel.size)}` : `Cochez des ${word(2)} pour les supprimer d’un coup`; }
  }
  function decorate() {
    if (selTab !== catUI.tab) { sel.clear(); selTab = catUI.tab; }
    const exist = new Set(catUI.tab === 'fournisseurs' ? sups().map(s => s.id) : db.catalog.map(c => c.id));
    [...sel].forEach(id => { if (!exist.has(id)) sel.delete(id); });
    const tbl = document.getElementById('catTable'), grid = document.querySelector('.sup-grid');
    const host = catUI.tab === 'fournisseurs' ? grid : tbl; if (!host) return;
    const bar = document.createElement('div'); bar.id = 'bulkBar'; bar.className = 'bulk-bar';
    bar.innerHTML = `<label class="check bb-all"><input type="checkbox" id="cbAll"> Tout sélectionner</label><span class="bb-n muted"></span>
      <span class="bb-act"><button class="btn small" data-act="bulk-none">Annuler</button><button class="btn small danger" data-act="bulk-del">🗑 Supprimer la sélection</button></span>`;
    host.parentNode.insertBefore(bar, host);
    if (tbl && catUI.tab !== 'fournisseurs') {
      const th = document.createElement('th'); th.className = 'cb-cell'; tbl.querySelector('thead tr').prepend(th);
      tbl.querySelectorAll('tbody tr').forEach(tr => { const id = idOf(tr); const td = document.createElement('td'); td.className = 'cb-cell'; if (id) td.innerHTML = `<input type="checkbox" class="cb-row" data-id="${esc(id)}" aria-label="Sélectionner">`; tr.prepend(td); });
    } else grid.querySelectorAll('.card.sup').forEach(c => { const id = idOf(c); if (id) (c.querySelector('h3') || c).insertAdjacentHTML('afterbegin', `<label class="cb-sup" title="Sélectionner"><input type="checkbox" class="cb-row" data-id="${esc(id)}" aria-label="Sélectionner"></label>`); });
    sync();
  }
  const prev = AFTER.catalog;
  AFTER.catalog = function () { if (prev) prev.apply(this, arguments); decorate(); };

  document.addEventListener('change', e => {
    const t = e.target; if (view !== 'catalog') return;
    if (t.classList.contains('cb-row')) { t.checked ? sel.add(t.dataset.id) : sel.delete(t.dataset.id); sync(); }
    else if (t.id === 'cbAll') { visible().forEach(r => { const id = idOf(r); t.checked ? sel.add(id) : sel.delete(id); }); sync(); }
  });
  // un clic sur la ligne (hors boutons et liens) coche aussi la case : plus rapide
  document.addEventListener('click', e => {
    if (view !== 'catalog' || !sel.size) return;
    const tr = e.target.closest('#catTable tbody tr'); if (!tr || e.target.closest('button,a,input,label')) return;
    const cb = tr.querySelector('.cb-row'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  // la recherche masque des lignes : on remet à jour la case « Tout sélectionner »
  document.addEventListener('input', e => { if (e.target.id === 'catSearch') setTimeout(sync); });

  Object.assign(actions, {
    'bulk-none'() { sel.clear(); sync(); },
    'bulk-del'() {
      const n = sel.size; if (!n) return;
      if (catUI.tab === 'fournisseurs') {
        const mats = db.catalog.filter(c => sel.has(c.supplierId));
        if (!confirm(`Supprimer ${n} ${word(n)} ?${mats.length ? `\n${n > 1 ? 'Leurs' : 'Ses'} ${mats.length} matériau${mats.length > 1 ? 'x' : ''} ser${mats.length > 1 ? 'ont' : 'a'} aussi supprimé${mats.length > 1 ? 's' : ''}.` : ''}\n\nCette action est définitive.`)) return;
        const ids = new Set(mats.map(c => c.id));
        db.catalog.filter(isPack).forEach(p => { p.parts = (p.parts || []).filter(x => !ids.has(x.id)); });
        db.catalog = db.catalog.filter(c => !ids.has(c.id)); db.suppliers = sups().filter(s => !sel.has(s.id));
      } else {
        const used = db.catalog.filter(x => isPack(x) && !sel.has(x.id) && (x.parts || []).some(p => sel.has(p.id)));
        if (!confirm(`Supprimer ${n} ${word(n)} ?${used.length ? `\n${used.length} ouvrage${used.length > 1 ? 's' : ''} composé${used.length > 1 ? 's' : ''} les utilise${used.length > 1 ? 'nt' : ''} : ces lignes en seront retirées.` : ''}\n\nCette action est définitive.`)) return;
        used.forEach(u => { u.parts = u.parts.filter(p => !sel.has(p.id)); });
        db.catalog = db.catalog.filter(c => !sel.has(c.id));
      }
      sel.clear(); save(); render(); toast(`${n} ${word(n)} supprimé${e_(n)}`);
    }
  });
})();
