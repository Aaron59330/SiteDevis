'use strict';
/* Boîte à outils > Calculatrice : pavé, clavier, pourcentages (« 200 + 10 % » = 220), TVA en un clic, historique.
   Calcul fait localement avec un petit analyseur (aucun eval). */
(function () {
  const st = { expr: '', last: null, hist: [] };
  try { st.hist = JSON.parse(localStorage.getItem('od-calc-hist') || '[]').slice(0, 20); } catch (e) { /* ignore */ }
  const fmt = v => Number.isFinite(v) ? (Math.round(v * 1e10) / 1e10).toLocaleString('fr-FR', { maximumFractionDigits: 10 }) : 'Erreur';
  const plain = v => String(Math.round(v * 1e10) / 1e10).replace('.', ',');

  /* expr := term (+|- term)* ; term := factor (×|÷ factor)* ; factor := [-] (nombre | ( expr )) [%] */
  function evaluate(src) {
    const s = src.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/−/g, '-'); let i = 0;
    const peek = () => s[i];
    function factor() {
      let neg = false; while (peek() === '-' || peek() === '+') { if (s[i] === '-') neg = !neg; i++; }
      let v;
      if (peek() === '(') { i++; v = expr(); if (peek() !== ')') throw 0; i++; }
      else { const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\./i.exec(s.slice(i)); if (!m) throw 0; v = parseFloat(m[0]); i += m[0].length; }
      let pct = false; if (peek() === '%') { pct = true; i++; }
      return { v: neg ? -v : v, pct };
    }
    // un terme seul avec % (ex. « + 10 % ») s'applique au montant qui précède : 200 + 10 % = 220
    function term() {
      const a = factor(); let v = a.pct ? a.v / 100 : a.v, single = true;
      while (peek() === '*' || peek() === '/') { single = false; const op = s[i++], b = factor(), r = b.pct ? b.v / 100 : b.v; v = op === '*' ? v * r : v / r; }
      return { v, rel: single && a.pct ? a.v : null };
    }
    function expr() {
      let v = term().v;
      while (peek() === '+' || peek() === '-') { const op = s[i++], b = term(), r = b.rel != null ? v * b.rel / 100 : b.v; v = op === '+' ? v + r : v - r; }
      return v;
    }
    const v = expr(); if (i !== s.length) throw 0; return v;
  }

  window.calculatorHtml = () => `<div class="calc-wrap">
    <div class="card calc">
      <div class="calc-screen"><div class="calc-expr" id="cExpr">${esc(st.expr) || '&nbsp;'}</div><div class="calc-res" id="cRes">${st.last != null ? fmt(st.last) : '0'}</div></div>
      <div class="calc-tva">
        <span>TVA</span><button data-act="calc-tva" data-k="add" data-r="20" title="Ajouter 20 % de TVA">+20 %</button><button data-act="calc-tva" data-k="add" data-r="10" title="Ajouter 10 % de TVA">+10 %</button><button data-act="calc-tva" data-k="add" data-r="5.5" title="Ajouter 5,5 % de TVA">+5,5 %</button>
        <button data-act="calc-tva" data-k="ht" data-r="20" title="Prix TTC → HT (TVA 20 %)">TTC→HT</button>
      </div>
      <div class="calc-keys">${[['C', 'clr', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['÷', '÷', 'op'], ['7'], ['8'], ['9'], ['×', '×', 'op'], ['4'], ['5'], ['6'], ['−', '−', 'op'], ['1'], ['2'], ['3'], ['+', '+', 'op'], ['%', '%', 'fn'], ['0'], [',', ','], ['⌫', 'del', 'fn']]
        .map(([l, v, c]) => `<button class="${c || ''}" data-act="calc-key" data-v="${esc(v || l)}">${l}</button>`).join('')}
        <button class="eq" data-act="calc-key" data-v="=">=</button></div>
      <p class="muted calc-help">Clavier : chiffres, + − * / ( ) %, Entrée pour calculer, Échap pour effacer. Ex. « 1 250 + 20 % » = 1 500.</p>
    </div>
    <div class="card calc-hist"><div class="row between"><h2 style="margin:0">Historique</h2>${st.hist.length ? '<button class="btn small" data-act="calc-hclear">Effacer</button>' : ''}</div>
      ${st.hist.length ? st.hist.map((h, k) => `<button class="calc-h" data-act="calc-reuse" data-i="${k}" title="Reprendre ce résultat"><span>${esc(h.e)} =</span><b>${fmt(h.v)}</b></button>`).join('')
        : '<p class="muted" style="margin:12px 0 0">Vos calculs s’afficheront ici. Cliquez sur un résultat pour le reprendre.</p>'}</div></div>`;

  const paint = (preview) => {
    const e = document.getElementById('cExpr'), r = document.getElementById('cRes'); if (!e) return;
    e.textContent = st.expr || ' ';
    if (preview) { try { const v = evaluate(st.expr); r.textContent = fmt(v); r.classList.add('pre'); } catch (x) { /* calcul incomplet */ } }
    else { r.textContent = st.last != null ? fmt(st.last) : '0'; r.classList.remove('pre'); }
  };
  const rerender = () => { const b = document.getElementById('toolsBody'); if (b && toolsUI.tab === 'calculator') b.innerHTML = calculatorHtml(); };
  function push(v) {
    if (v === 'clr') { st.expr = ''; st.last = null; return paint(); }
    if (v === 'del') { st.expr = st.expr.slice(0, -1); return paint(true); }
    if (v === '=') {
      if (!st.expr.trim()) return;
      try { const r = evaluate(st.expr); if (!Number.isFinite(r)) throw 0; st.hist.unshift({ e: st.expr, v: r }); st.hist = st.hist.slice(0, 20);
        try { localStorage.setItem('od-calc-hist', JSON.stringify(st.hist)); } catch (e) { /* ignore */ }
        st.last = r; st.expr = plain(r); rerender(); }
      catch (x) { const r = document.getElementById('cRes'); if (r) { r.textContent = 'Calcul incomplet'; r.classList.add('err'); setTimeout(() => r.classList.remove('err'), 900); } }
      return;
    }
    // après un résultat, taper un chiffre recommence un calcul ; un opérateur continue
    if (st.last != null && st.expr === plain(st.last) && /^[\d,(]$/.test(v)) st.expr = '';
    st.expr += v; paint(true);
  }
  Object.assign(actions, {
    'calc-key'(t) { push(t.dataset.v); },
    'calc-tva'(t) { let v; try { v = st.expr ? evaluate(st.expr) : (st.last || 0); } catch (e) { return toast('Calcul incomplet'); }
      const r = num(t.dataset.r), out = t.dataset.k === 'add' ? v * (1 + r / 100) : v / (1 + r / 100);
      st.hist.unshift({ e: `${plain(v)} ${t.dataset.k === 'add' ? '+ TVA ' : 'TTC → HT '}${String(r).replace('.', ',')} %`, v: out }); st.hist = st.hist.slice(0, 20);
      try { localStorage.setItem('od-calc-hist', JSON.stringify(st.hist)); } catch (e) { /* ignore */ }
      st.last = out; st.expr = plain(out); rerender(); },
    'calc-reuse'(t) { const h = st.hist[+t.dataset.i]; if (!h) return; st.last = h.v; st.expr = plain(h.v); rerender();
      try { navigator.clipboard.writeText(plain(h.v)); toast('Résultat copié : ' + fmt(h.v)); } catch (e) { /* ignore */ } },
    'calc-hclear'() { st.hist = []; try { localStorage.removeItem('od-calc-hist'); } catch (e) { /* ignore */ } rerender(); }
  });
  document.addEventListener('keydown', e => {
    if (view !== 'tools' || toolsUI.tab !== 'calculator' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return;
    const k = e.key, map = { '*': '×', '/': '÷', '-': '−', '.': ',', Enter: '=', '=': '=', Backspace: 'del', Escape: 'clr', Delete: 'clr' };
    const v = map[k] || (/^[\d+(),%]$/.test(k) ? k : null); if (!v) return;
    e.preventDefault(); push(v);
    const b = document.querySelector(`.calc-keys [data-v="${CSS.escape(v)}"]`); if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 120); }
  });
  window.calcEvaluate = evaluate;
})();
