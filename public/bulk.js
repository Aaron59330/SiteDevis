'use strict';
/* Téléchargement groupé : tous les devis ou toutes les factures affichés (par exemple ceux d'un mois) en PDF, dans une archive ZIP.
   Les factures complètes sont produites au format électronique Factur-X. */
(function () {
  const BATCH = 40;
  const csvOf = list => {
    const n = v => String(Math.round(v * 100) / 100).replace('.', ','), q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const rows = [['Numéro', 'Date', 'Client', 'Objet', 'Statut', 'Total HT', 'TVA', 'Total TTC']];
    list.forEach(d => { const t = totals(d); rows.push([d.number, d.date, (d.clientText || '').split('\n')[0], d.title, (statusOf(d)[d.status] || d.status), n(t.ht), n(t.vat), n(t.ttc)]); });
    return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  };
  async function run(btn, kind) {
    const list = kind === 'facture' ? invList() : quoteList();
    if (!list.length) return toast('Aucun document à télécharger');
    if (!session.config.pdf) return toast('Le téléchargement PDF n’est pas disponible sur ce serveur');
    const month = kind === 'facture' ? invFilter.month : filter.month;
    const base = (kind === 'facture' ? 'factures' : 'devis') + (month ? '-' + month : '-' + today());
    const old = btn.innerHTML; btn.disabled = true;
    try {
      const parts = Math.ceil(list.length / BATCH);
      for (let p = 0; p < parts; p++) {
        const chunk = list.slice(p * BATCH, (p + 1) * BATCH);
        btn.textContent = `Création des PDF… ${Math.min(list.length, (p + 1) * BATCH)}/${list.length}`;
        const docs = chunk.map(q => {
          const d = { html: renderDoc(q), accent: accentOf(), label: `${q.opts.docLabel} N° ${q.number}`, date: flongdate(q.date), filename: `${q.opts.docLabel}-${q.number}`, author: db.company.name || '' };
          if (isInv(q) && typeof eiCheck === 'function' && session.config.einvoice && eiCheck(q).ok) d.xml = ciiXml(q);
          return d;
        });
        const r = await fetch('/api/pdf/batch', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sitedevis' },
          body: JSON.stringify({ docs, name: base + (parts > 1 ? `-partie-${p + 1}` : ''), csv: p === 0 ? csvOf(list) : undefined }) });
        if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) { /* ignore */ } throw new Error(m || 'Erreur ' + r.status); }
        const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
        a.href = url; a.download = base + (parts > 1 ? `-partie-${p + 1}` : '') + '.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      toast(`${list.length} ${kind === 'facture' ? 'facture' : 'devis'}${list.length > 1 && kind === 'facture' ? 's' : ''} téléchargé${list.length > 1 ? 's' : ''} (ZIP)`);
    } catch (e) { toast('Téléchargement impossible : ' + e.message); }
    btn.disabled = false; btn.innerHTML = old;
  }
  Object.assign(actions, { 'bulk-dl'(t) { run(t, t.dataset.kind); } });
})();
