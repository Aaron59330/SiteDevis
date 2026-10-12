'use strict';
/* Import d'un devis ou d'une facture PDF réalisé ailleurs : lecture (IA ou gratuite), vérification, puis création dans OptiDevis. */
const imp = { file: null, doc: null, source: '', warnings: [] };
const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };

function importOpen() {
  const cfg = session.config, ai = !!cfg.importAi, free = !!cfg.importFree;
  imp.file = null; imp.doc = null;
  if (!ai && !free) return toast('L\'import de PDF n\'est pas disponible sur ce serveur.');
  openModal(`<div class="modal-wide" id="impBox"><div class="row between"><h2 style="margin:0">Importer un devis ou une facture</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
    <div class="seg2" style="margin:12px 0 4px"><button type="button" class="on" data-act="import-pdf">PDF</button><button type="button" data-act="imp-photo">Photo</button></div>
    <div id="impBody"><p class="muted" style="margin:10px 0">Vous avez un devis ou une facture fait sur un autre site ou un autre logiciel ? Déposez son PDF : OptiDevis le relit et le recrée à l'identique (lignes, quantités, prix, client, échéancier). Vous vérifiez et corrigez avant de le créer.</p>
      <label class="dropzone" id="impDrop"><input type="file" id="impFile" accept="application/pdf,.pdf" hidden><b>Choisir un fichier PDF</b><span class="muted">ou glissez-le ici (8 Mo maximum)</span><span id="impName" class="muted"></span></label>
      <div class="field" style="margin-top:14px"><label>Méthode de lecture</label>
        ${ai ? '<label class="check"><input type="radio" name="impMethod" value="ai" checked> <span><b>Lecture par IA</b> (plus précise, lit aussi les PDF scannés). Le PDF est envoyé au service d\'IA d\'Anthropic.</span></label>' : ''}
        ${free ? `<label class="check"><input type="radio" name="impMethod" value="text" ${ai ? '' : 'checked'}> <span><b>Lecture gratuite</b> sur notre serveur, sans IA ni envoi à un tiers (PDF contenant du texte uniquement). Vérifiez bien le résultat.</span></label>` : ''}</div>
      <div class="form-err" id="impErr" hidden></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="impGo" data-act="imp-run" disabled>Lire le PDF</button></div></div></div>`);
  const inp = $('#impFile'), drop = $('#impDrop');
  const set = f => { if (!f) return; if (!/pdf$/i.test(f.type || f.name)) return toast('Choisissez un fichier PDF'); if (f.size > 8e6) return toast('Fichier trop volumineux (8 Mo maximum)'); imp.file = f; $('#impName').textContent = f.name + ' — ' + Math.round(f.size / 1024) + ' Ko'; $('#impGo').disabled = false; };
  inp.onchange = () => set(inp.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); set(e.dataTransfer.files[0]); };
}
async function importRun() {
  const err = $('#impErr'), btn = $('#impGo'); if (!imp.file) return;
  const method = (document.querySelector('input[name=impMethod]:checked') || {}).value || 'text';
  btn.disabled = true; btn.textContent = 'Lecture en cours…'; err.hidden = true;
  try {
    const r = await api('POST', '/api/import/pdf', { data: b64(await imp.file.arrayBuffer()), method, name: imp.file.name });
    imp.doc = r.doc; imp.source = r.source; imp.warnings = r.warnings || [];
    importReview();
  } catch (e) { err.hidden = false; err.textContent = e.message; btn.disabled = false; btn.textContent = 'Lire le PDF'; }
}

function impLineRows(d) {
  return d.lines.map((l, i) => l.type === 'item' ? `<tr data-i="${i}"><td><input data-k="ref" value="${esc(l.ref)}" placeholder="Réf."></td><td><textarea data-k="desc" rows="2">${esc(l.desc)}</textarea></td>
      <td><input data-k="qty" type="number" step="any" value="${l.qty}"></td><td><input data-k="unit" value="${esc(l.unit)}"></td><td><input data-k="price" type="number" step="any" value="${l.price}"></td>
      <td><input data-k="vat" type="number" step="any" value="${l.vat}"></td><td class="right"><b data-t>${money(l.qty * l.price)}</b></td><td><button class="btn small icon danger" data-act="imp-del-line" title="Retirer">✕</button></td></tr>`
    : `<tr data-i="${i}" class="kindrow"><td colspan="7"><span class="tag">${l.type === 'title' ? 'Titre' : 'Sous-total'}</span> <input data-k="desc" value="${esc(l.desc)}" style="width:70%"></td><td><button class="btn small icon danger" data-act="imp-del-line" title="Retirer">✕</button></td></tr>`).join('');
}
function impTotals() {
  const d = imp.doc, exempt = db.company.vatExempt; let ht = 0, vat = 0;
  d.lines.filter(l => l.type === 'item').forEach(l => { const t = l.qty * l.price; ht += t; vat += exempt ? 0 : t * l.vat / 100; });
  const k = 1 - num(d.discount) / 100; ht *= k; vat *= k; return { ht, ttc: ht + vat };
}
function impCheck() {
  const d = imp.doc, t = impTotals(), el = $('#impCheck'); if (!el) return;
  const ref = d.totalTtc || d.totalHt, mine = d.totalTtc ? t.ttc : t.ht;
  el.className = 'notice ' + (!ref ? '' : Math.abs(ref - mine) < 0.02 ? 'ok' : 'bad');
  el.innerHTML = `Total calculé par OptiDevis : <b>${money(t.ttc)} TTC</b> (${money(t.ht)} HT)` + (ref ? ` — total du PDF : <b>${money(ref)}</b> ${Math.abs(ref - mine) < 0.02 ? '✓ identique' : '⚠ différent : vérifiez les lignes, quantités et TVA'}` : ' — le PDF ne donne pas de total à comparer.');
}
function importReview() {
  const d = imp.doc, cl = d.client, match = db.clients.find(c => normName(c.name) === normName(cl.name) && cl.name);
  const isI = d.kind === 'facture';
  $('#impBody').innerHTML = `
    <div class="notice ${imp.source === 'ia' ? 'ok' : ''}" style="margin:10px 0">Document lu ${imp.source === 'ia' ? 'par l\'IA' : 'par la lecture gratuite'}. <b>Vérifiez</b> chaque information avant de créer : vous pouvez tout corriger ici.${imp.warnings.map(w => '<br>⚠ ' + esc(w)).join('')}</div>
    <div class="grid3"><div class="field"><label>Type</label><select id="iKind"><option value="devis" ${isI ? '' : 'selected'}>Devis</option><option value="facture" ${isI ? 'selected' : ''}>Facture</option></select></div>
      <div class="field"><label>Numéro (laissez vide pour un numéro automatique)</label><input id="iNum" value="${esc(d.number)}"></div>
      <div class="field"><label>Date</label><input type="date" id="iDate" value="${d.date}"></div></div>
    <div class="grid2"><div class="field"><label id="iEndL">${isI ? 'Échéance de paiement' : 'Valable jusqu\'au'}</label><input type="date" id="iEnd" value="${isI ? d.dueDate : d.validUntil}"></div>
      <div class="field"><label>Remise globale (%)</label><input type="number" step="any" id="iDisc" value="${d.discount}"></div></div>
    <div class="field"><label>Titre du document (objet des travaux)</label><textarea id="iTitle" rows="2">${esc(d.title)}</textarea></div>
    <div class="grid2"><div class="field"><label>Client</label><input id="iCName" value="${esc(cl.name)}"><div class="muted" style="font-size:.8rem;margin-top:4px">${match ? 'Client déjà enregistré : sa fiche sera utilisée.' : cl.name ? 'Nouveau client.' : 'Client non reconnu : renseignez-le.'}</div></div>
      <div class="field"><label>Adresse du client</label><textarea id="iCAddr" rows="3">${esc(cl.address)}</textarea></div></div>
    <div class="grid3"><div class="field"><label>Email</label><input id="iCMail" value="${esc(cl.email)}"></div><div class="field"><label>Téléphone</label><input id="iCTel" value="${esc(cl.phone)}"></div><div class="field"><label>SIRET</label><input id="iCSiret" value="${esc(cl.siret)}"></div></div>
    <label class="check" ${match || !cl.name ? 'hidden' : ''}><input type="checkbox" id="iCSave" checked> Enregistrer ce client dans mes clients</label>
    <h3 style="margin:14px 0 6px">Lignes</h3>
    <div style="overflow-x:auto"><table class="list" id="impLines"><thead><tr><th>Réf.</th><th style="min-width:220px">Désignation</th><th>Qté</th><th>Unité</th><th>PU HT</th><th>TVA %</th><th class="right">Total</th><th></th></tr></thead><tbody>${impLineRows(d)}</tbody></table></div>
    <div id="impCheck" class="notice" style="margin:10px 0"></div>
    <h3 style="margin:14px 0 6px">Échéancier</h3>
    <div id="impPays">${d.payments.length ? d.payments.map((p, i) => `<div class="pay" data-i="${i}"><input type="number" step="any" data-k="pct" value="${p.pct}" style="width:80px"> <span>%</span> <input data-k="label" value="${esc(p.label)}"></div>`).join('') : '<p class="muted" style="margin:0">Aucun échéancier trouvé : celui de vos réglages sera utilisé.</p>'}</div>
    <p class="muted" style="font-size:.82rem;margin:12px 0">Le document sera créé avec <b>votre</b> entreprise comme émetteur, vos coordonnées bancaires et vos mentions légales.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="imp-back">← Autre fichier</button><button class="btn primary" data-act="imp-create">Créer le document</button></div>`;
  impCheck();
}
function impRead() {
  const d = imp.doc, v = id => ($('#' + id) || {}).value || '';
  d.kind = v('iKind'); d.number = v('iNum').trim(); d.date = v('iDate'); d.discount = num(v('iDisc')); d.title = v('iTitle').trim();
  if (d.kind === 'facture') d.dueDate = v('iEnd'); else d.validUntil = v('iEnd');
  Object.assign(d.client, { name: v('iCName').trim(), address: v('iCAddr').trim(), email: v('iCMail').trim(), phone: v('iCTel').trim(), siret: v('iCSiret').trim() });
  document.querySelectorAll('#impLines tbody tr').forEach(tr => { const l = d.lines[+tr.dataset.i]; if (!l) return; tr.querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k; l[k] = ['qty', 'price', 'vat'].includes(k) ? num(i.value) : i.value; }); });
  document.querySelectorAll('#impPays .pay').forEach(p => { const x = d.payments[+p.dataset.i]; if (x) { x.pct = num(p.querySelector('[data-k=pct]').value); x.label = p.querySelector('[data-k=label]').value; } });
}
function importCreate() {
  if (!requireAccess()) return; impRead(); const d = imp.doc, c = d.client, isI = d.kind === 'facture';
  if (!d.lines.some(l => l.type === 'item')) return toast('Ajoutez au moins une ligne');
  let cl = c.name ? db.clients.find(x => normName(x.name) === normName(c.name)) : null;
  if (!cl && c.name && ($('#iCSave') ? $('#iCSave').checked : false)) {
    const pro = c.type === 'pro' || !!c.siret;
    cl = { id: uid(), type: pro ? 'pro' : 'particulier', civ: '', firstName: '', lastName: pro ? '' : c.name, name: c.name, address: c.address, email: c.email, phone: c.phone, siret: c.siret, contact: c.contact, vatNumber: c.vatNumber };
    db.clients.push(cl); db.clients.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  const auto = !d.number, number = d.number || makeNumber(d.kind), date = d.date || today();
  const q = normQuote({
    id: uid(), kind: d.kind, number, date, validUntil: isI ? '' : (d.validUntil || addDays(date, num(db.settings.validityDays))), dueDate: isI ? (d.dueDate || addDays(date, num(db.settings.dueDays))) : undefined,
    clientId: cl ? cl.id : '', clientText: cl ? clientBlock(cl) : [c.name, c.address, c.email, c.phone].filter(Boolean).join('\n'), title: d.title, status: 'brouillon', discount: d.discount, notes: '',
    lines: d.lines.map(l => ({ t: l.type, ref: l.ref, desc: l.desc, label: l.type === 'subtotal' ? (l.desc || 'Sous Total') : undefined, qty: l.qty, unit: l.unit, price: l.price, vat: l.vat })),
    payments: d.payments.length ? d.payments.map(p => ({ id: uid(), invoiceId: '', pct: p.pct, label: p.label })) : undefined
  }, db);
  if (isI) { q.opts = { ...q.opts, docLabel: 'FACTURE', agreeLabel: '' }; q.payMethod = 'Virement bancaire'; }
  if (auto) bumpNumber(d.kind);
  db.quotes.push(q); save(); $('#modal').close(); toast(`${isI ? 'Facture' : 'Devis'} ${q.number} créé à partir du PDF`); go('editor', q.id);
}
/* ---- Import par photo : appareil photo du téléphone ou pellicule, lecture par IA ---- */
const photos = [];
async function shrink(file) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { bmp = await new Promise((ok, ko) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => ko(new Error('Photo illisible')); i.src = u; }); }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, 2200 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .86));
  if (!blob) throw new Error('Photo illisible');
  return { data: b64(await blob.arrayBuffer()), url: URL.createObjectURL(blob), size: blob.size };
}
function photoThumbs() {
  const el = $('#phList'); if (!el) return;
  el.innerHTML = photos.map((p, i) => `<div class="ph-item"><img src="${p.url}" alt="Photo ${i + 1}"><button type="button" class="ph-x" data-act="ph-del" data-i="${i}" aria-label="Retirer">✕</button></div>`).join('');
  const go = $('#phGo'); if (go) go.disabled = !photos.length;
}
function photoOpen() {
  if (!session.config.importPhoto) { $('#impBody').innerHTML = `<div class="notice" style="margin:12px 0">La lecture de photos n'est pas activée sur ce serveur. En attendant, importez un PDF.</div>`; return; }
  photos.length = 0;
  document.querySelectorAll('.seg2 [data-act]').forEach(b => b.classList.toggle('on', b.dataset.act === 'imp-photo'));
  $('#impBody').innerHTML = `<p class="muted" style="margin:10px 0">Prenez en photo un devis, même écrit à la main, ou choisissez des photos dans la pellicule : l'IA lit chaque ligne et recrée le devis. Plusieurs photos = plusieurs pages du même document.</p>
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <label class="btn primary" style="cursor:pointer">${icon('file')} Prendre une photo<input type="file" id="phCam" accept="image/*" capture="environment" hidden></label>
      <label class="btn" style="cursor:pointer">${icon('upload')} Choisir dans la pellicule<input type="file" id="phPick" accept="image/*" multiple hidden></label>
    </div>
    <div id="phList" class="ph-list"></div>
    <p class="muted" style="font-size:.82rem;margin:10px 0">Conseils : page entière dans le cadre, bonne lumière, texte net. ${session.config.photoKind === 'tesseract' ? '<b>Lecture gratuite sur notre serveur :</b> elle comprend le texte imprimé, pas l\'écriture à la main. ' : session.config.photoKind === 'gemini' ? 'Les photos sont envoyées au service gratuit Google Gemini pour être lues. ' : 'Les photos sont envoyées au service d\'IA d\'Anthropic pour être lues. '}OptiDevis ne conserve pas les photos. Vérifiez toujours le résultat avant de créer le devis.</p>
    <div class="form-err" id="impErr" hidden></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="phGo" data-act="ph-run" disabled>Lire la photo</button></div>`;
  const add = async files => {
    const err = $('#impErr'); err.hidden = true;
    for (const f of [...files]) {
      if (photos.length >= 6) { toast('6 photos maximum'); break; }
      try { photos.push(await shrink(f)); } catch (e) { err.hidden = false; err.textContent = 'Cette photo n\'a pas pu être lue (format non pris en charge ?). Essayez une autre photo.'; }
    }
    photoThumbs();
  };
  $('#phCam').onchange = e => { add(e.target.files); e.target.value = ''; };
  $('#phPick').onchange = e => { add(e.target.files); e.target.value = ''; };
}
async function photoRun() {
  const err = $('#impErr'), btn = $('#phGo'); if (!photos.length) return;
  btn.disabled = true; btn.textContent = 'Lecture en cours… (jusqu\'à 1 minute)'; err.hidden = true;
  try {
    const r = await api('POST', '/api/import/photo', { images: photos.map(p => ({ data: p.data })) });
    imp.doc = r.doc; imp.source = r.source; imp.warnings = r.warnings || [];
    importReview();
  } catch (e) { err.hidden = false; err.textContent = e.message; btn.disabled = false; btn.textContent = 'Lire la photo'; }
}
Object.assign(actions, {
  'imp-photo': photoOpen, 'ph-run': photoRun, 'ph-del'(t) { photos.splice(+t.dataset.i, 1); photoThumbs(); },
  'import-pdf': importOpen, 'imp-run': importRun, 'imp-create': importCreate, 'imp-back': importOpen,
  'imp-del-line'(t) { impRead(); imp.doc.lines.splice(+t.closest('tr').dataset.i, 1); const tb = document.querySelector('#impLines tbody'); tb.innerHTML = impLineRows(imp.doc); impCheck(); }
});
document.addEventListener('input', e => {
  if (!e.target.closest || !e.target.closest('#impLines')) { if (e.target.id === 'iDisc' || e.target.id === 'iCName') { if (e.target.id === 'iDisc') { imp.doc.discount = num(e.target.value); impCheck(); } } return; }
  const tr = e.target.closest('tr'), l = imp.doc.lines[+tr.dataset.i]; if (!l) return;
  const k = e.target.dataset.k; l[k] = ['qty', 'price', 'vat'].includes(k) ? num(e.target.value) : e.target.value;
  const tot = tr.querySelector('[data-t]'); if (tot) tot.textContent = money(l.qty * l.price); impCheck();
});
document.addEventListener('change', e => { if (e.target.id === 'iKind') { const f = e.target.value === 'facture'; const L = $('#iEndL'); if (L) L.textContent = f ? 'Échéance de paiement' : 'Valable jusqu\'au'; } });
