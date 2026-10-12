'use strict';
/* Tableaux : sur téléphone, chaque ligne devient une carte (les en-têtes sont recopiés dans data-label). */
(function () {
  function label(root) {
    (root.querySelectorAll ? root.querySelectorAll('table.list') : []).forEach(t => {
      const heads = [...t.querySelectorAll('thead th')].map(h => h.textContent.trim());
      t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.dataset.label === undefined) td.dataset.label = heads[i] || ''; }));
    });
  }
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; label(document.body); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => { if (typeof fitDoc === 'function') fitDoc(); });
})();
