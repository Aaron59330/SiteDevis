'use strict';
/* Annuaire des magasins de bricolage / négoce et reconnaissance approximative du nom d'un fournisseur (« pointp », « poin t P », « leroy merlain »…). */
const STORES = [
  ['Leroy Merlin', 'leroymerlin.fr', ['leroymerlin', 'lm']], ['Castorama', 'castorama.fr', []], ['Brico Dépôt', 'bricodepot.fr', ['bricodepot', 'bd']],
  ['Point.P', 'pointp.fr', ['pointp', 'point p', 'ptp']], ['Cedeo', 'cedeo.fr', ['cedeo', 'cédéo']], ['Gedimat', 'gedimat.fr', []], ['Tout Faire Matériaux', 'toutfairemateriaux.fr', ['toutfaire', 'tfm']],
  ['BigMat', 'bigmat.fr', ['big mat']], ['Bricomarché', 'bricomarche.com', ['bricomarche']], ['Mr Bricolage', 'mr-bricolage.fr', ['mrbricolage', 'monsieur bricolage']], ['Weldom', 'weldom.fr', []],
  ['Lapeyre', 'lapeyre.fr', []], ['Brico Cash', 'bricocash.fr', ['bricocash']], ['Prolians', 'prolians.fr', []], ['Bricozor', 'bricozor.com', []], ['ManoMano', 'manomano.fr', ['mano mano']],
  ['Wurth', 'wurth.fr', ['würth']], ['Richardson', 'richardson.fr', []], ['Sonepar', 'sonepar.fr', []], ['Rexel', 'rexel.fr', []], ['Plateforme du Bâtiment', 'plateforme-du-batiment.fr', ['plateforme du batiment', 'pdb']],
  ['Doras', 'doras.fr', []], ['Samse', 'samse.fr', []], ['Chausson Matériaux', 'chausson.fr', ['chausson']], ['Zolpan', 'zolpan.fr', []], ['Saint-Gobain', 'saint-gobain.fr', ['saintgobain']]
];
const key = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const domainOf = u => { try { const h = new URL(/^https?:\/\//.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : ''; } catch (e) { return ''; } };

/* Renvoie { name, domain, score } si le nom ressemble à un magasin connu, sinon le site saisi par l'utilisateur, sinon null */
function matchStore(name, website) {
  const k = key(name); let best = null;
  if (k.length >= 2) for (const [n, d, al] of STORES) {
    for (const c of [n, ...al]) {
      const kc = key(c); if (!kc) continue;
      let score = 0;
      if (k === kc) score = 1;
      else if (kc.length >= 4 && k.length >= 4 && (k.includes(kc) || kc.includes(k))) score = 0.92;
      else if (k.length >= 5 && kc.length >= 5) { const sim = 1 - lev(k, kc) / Math.max(k.length, kc.length); if (sim >= 0.72) score = sim; }
      if (score && (!best || score > best.score)) best = { name: n, domain: d, score };
    }
  }
  if (best) return best;
  const dom = domainOf(website); return dom ? { name: String(name || dom).trim(), domain: dom, score: 0.5 } : null;
}
module.exports = { STORES, matchStore, domainOf, key, lev };
