'use strict';
/* Relecture IA d'un devis : propose des corrections et des conseils ; rien n'est modifié sans l'accord de l'utilisateur. */
const aiSt = { qid: '', res: null, state: {}, undo: {} };
const AI_CAT = { faute: 'Faute', clarte: 'Clarté', coherence: 'Cohérence', oubli: 'À compléter', conseil: 'Conseil' };

function aiPayload(q) {
  return { kind: q.kind, date: q.date, validUntil: q.validUntil, dueDate: q.dueDate, vatExempt: db.company.vatExempt, discount: q.discount, title: q.title,
    lines: q.lines.map(l => ({ t: l.t, ref: l.ref, desc: l.desc, label: l.label, qty: l.qty, unit: l.unit, price: l.price, vat: l.vat })),
    notes: q.notes, payments: q.payments, footer: q.footer, agreeLabel: q.opts.agreeLabel };
}
function aiGet(q, s) {
  if (s.target === 'title') return q.title; if (s.target === 'notes') return q.notes; if (s.target === 'footer') return q.footer;
  if (s.target === 'line') { const l = q.lines[s.index]; return l ? (l.t === 'subtotal' ? l.label : l.desc) : null; }
  if (s.target === 'payment') { const p = q.payments[s.index]; return p ? p.label : null; }
  return null;
}
function aiSet(q, s, v) {
  if (s.target === 'title') q.title = v; else if (s.target === 'notes') q.notes = v; else if (s.target === 'footer') q.footer = v;
  else if (s.target === 'line') { const l = q.lines[s.index]; if (l.t === 'subtotal') l.label = v; else l.desc = v; }
  else if (s.target === 'payment') q.payments[s.index].label = v;
}
function aiWhere(s, q) {
  if (s.target === 'title') return 'Titre du document'; if (s.target === 'notes') return 'Notes'; if (s.target === 'footer') return 'Pied de page'; if (s.target === 'general') return 'Remarque générale';
  if (s.target === 'payment') return `Échéance ${s.index + 1}`;
  const l = q.lines[s.index]; const d = l ? String(l.t === 'subtotal' ? l.label : l.desc || '').slice(0, 40) : '';
  return `Ligne ${s.index + 1}${d ? ' — ' + d : ''}`;
}
function wordDiff(a, b) { // renvoie [html du texte d'origine avec suppressions, html du texte corrigé avec ajouts]
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/), n = A.length, m = B.length;
  if (n * m > 250000) return [esc(a), esc(b)];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, o = '', c = '';
  while (i < n && j < m) {
    if (A[i] === B[j]) { o += esc(A[i]); c += esc(B[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { o += `<del>${esc(A[i])}</del>`; i++; }
    else { c += `<ins>${esc(B[j])}</ins>`; j++; }
  }
  while (i < n) o += `<del>${esc(A[i++])}</del>`;
  while (j < m) c += `<ins>${esc(B[j++])}</ins>`;
  return [o, c];
}

function aiOpen() {
  const q = getQuote(editingId); if (!q) return;
  aiSt.qid = q.id; aiSt.res = null; aiSt.state = {}; aiSt.undo = {};
  let consent = false; try { consent = localStorage.getItem('sitedevis.aiConsent') === '1'; } catch (e) { /* ignore */ }
  openModal(`<div class="modal-wide"><div class="row between"><h2 style="margin:0">Relecture par l'IA</h2><button class="btn small" data-act="close-modal">Fermer</button></div>
    <div id="aiBody"><p class="muted" style="margin:10px 0">L'IA relit votre ${isInv(q) ? 'facture' : 'devis'} : elle repère les fautes d'orthographe, les formulations floues et les oublis, puis vous propose des corrections.
      <b>Rien n'est modifié sans votre accord</b> : vous acceptez ou ignorez chaque suggestion.</p>
      <div class="notice" style="margin:12px 0">Pour l'analyse, le contenu du document (titre, lignes, quantités, prix, notes, échéancier, mentions) est envoyé au service d'IA d'Anthropic. Vos coordonnées bancaires, l'adresse et les coordonnées de votre client ne sont pas transmises. Évitez d'écrire des informations sensibles dans les champs libres.</div>
      ${consent ? '' : '<label class="check"><input type="checkbox" id="aiConsent"> J\'ai compris et j\'accepte l\'envoi du contenu du document pour analyse.</label>'}
      <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="ai-run" id="aiGo" ${consent ? '' : 'disabled'}>Lancer l'analyse</button></div></div></div>`);
  const cb = document.getElementById('aiConsent'); if (cb) cb.onchange = () => { document.getElementById('aiGo').disabled = !cb.checked; };
}
async function aiRun() {
  const q = getQuote(aiSt.qid), body = document.getElementById('aiBody'); if (!q || !body) return;
  const cb = document.getElementById('aiConsent'); if (cb && cb.checked) { try { localStorage.setItem('sitedevis.aiConsent', '1'); } catch (e) { /* ignore */ } }
  body.innerHTML = '<div class="empty"><div class="spin"></div><br>Analyse en cours… cela peut prendre quelques secondes.</div>';
  try { aiSt.res = await api('POST', '/api/ai/review', aiPayload(q)); aiSt.state = {}; aiList(); }
  catch (e) { body.innerHTML = `<div class="notice bad">${esc(e.message)}</div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="ai-run">Réessayer</button></div>`; }
}
function aiList() {
  const q = getQuote(aiSt.qid), body = document.getElementById('aiBody'); if (!q || !body || !aiSt.res) return;
  const list = aiSt.res.suggestions, pending = list.filter(s => s.suggested != null && !aiSt.state[s.id]);
  body.innerHTML = `<p style="margin:10px 0">${esc(aiSt.res.summary || '')}</p>
    ${list.length ? `<div class="row between" style="margin-bottom:10px"><span class="muted">${list.length} suggestion${list.length > 1 ? 's' : ''}${pending.length ? ` dont ${pending.length} correction${pending.length > 1 ? 's' : ''} applicable${pending.length > 1 ? 's' : ''}` : ''}</span>
      <div class="row">${pending.length ? `<button class="btn small primary" data-act="ai-apply-all">Appliquer toutes les corrections (${pending.length})</button>` : ''}<button class="btn small" data-act="ai-run">Relancer l'analyse</button></div></div>` : '<div class="notice ok">Aucune faute ni oubli détecté. Votre document semble en bon état.</div>'}
    ${list.map(s => {
      const st = aiSt.state[s.id], d = s.suggested != null ? wordDiff(s.original, s.suggested) : null;
      return `<div class="ai-card ${st || ''}"><div class="row between"><div class="row"><span class="badge ${s.category === 'faute' ? 'refuse' : s.severity === 'important' ? 'retard' : 'brouillon'}">${AI_CAT[s.category] || 'Conseil'}</span><b style="font-size:.9rem">${esc(aiWhere(s, q))}</b></div>
        ${st === 'applied' ? '<span class="badge accepte">Appliquée</span>' : st === 'ignored' ? '<span class="badge brouillon">Ignorée</span>' : st === 'stale' ? '<span class="badge retard">Texte modifié</span>' : ''}</div>
        <p style="margin:8px 0">${esc(s.message)}</p>
        ${d ? `<div class="ai-diff"><div><span class="muted">Avant</span><div class="ai-txt">${d[0]}</div></div><div><span class="muted">Après</span><div class="ai-txt">${d[1]}</div></div></div>` : ''}
        <div class="row" style="margin-top:8px">${d && !st ? `<button class="btn small primary" data-act="ai-apply" data-id="${s.id}">Appliquer la correction</button>` : ''}
          ${st === 'applied' ? `<button class="btn small" data-act="ai-undo" data-id="${s.id}">Annuler la correction</button>` : ''}
          ${!st ? `<button class="btn small" data-act="ai-ignore" data-id="${s.id}">${d ? 'Ignorer' : 'Compris'}</button>` : ''}</div></div>`;
    }).join('')}`;
}
function aiSync(s) {
  const set = (sel, v) => { const el = document.querySelector(sel); if (el) { el.value = v; if (el.tagName === 'TEXTAREA') autosize(); } };
  if (s.target === 'title') set('[data-f=title]', getQuote(aiSt.qid).title);
  else if (s.target === 'notes') set('[data-f=notes]', getQuote(aiSt.qid).notes);
  else if (s.target === 'footer') set('[data-f=footer]', getQuote(aiSt.qid).footer);
  else if (s.target === 'line') refreshLines(); else if (s.target === 'payment') refreshPayments();
  refreshPreview();
}
function aiApplyOne(s, quiet) {
  const q = getQuote(aiSt.qid);
  if (!q || view !== 'editor' || editingId !== q.id) { toast('Ouvrez le document pour appliquer la correction'); return false; }
  if (aiGet(q, s) !== s.original) { aiSt.state[s.id] = 'stale'; if (!quiet) toast('Ce texte a changé depuis l\'analyse : relancez la relecture'); return false; }
  aiSet(q, s, s.suggested); aiSt.state[s.id] = 'applied'; save(); aiSync(s); return true;
}
Object.assign(actions, {
  'ai-review': aiOpen,
  'ai-run': aiRun,
  'ai-apply'(t) { const s = aiSt.res.suggestions.find(x => x.id === t.dataset.id); if (s && aiApplyOne(s)) toast('Correction appliquée'); aiList(); },
  'ai-apply-all'() {
    let n = 0; aiSt.res.suggestions.forEach(s => { if (s.suggested != null && !aiSt.state[s.id] && aiApplyOne(s, true)) n++; });
    toast(n ? `${n} correction${n > 1 ? 's' : ''} appliquée${n > 1 ? 's' : ''}` : 'Aucune correction appliquée'); aiList();
  },
  'ai-ignore'(t) { aiSt.state[t.dataset.id] = 'ignored'; aiList(); },
  'ai-undo'(t) {
    const s = aiSt.res.suggestions.find(x => x.id === t.dataset.id), q = getQuote(aiSt.qid);
    if (s && q && aiGet(q, s) === s.suggested) { aiSet(q, s, s.original); delete aiSt.state[s.id]; save(); aiSync(s); toast('Correction annulée'); } else toast('Le texte a été modifié depuis : annulation impossible');
    aiList();
  }
});
