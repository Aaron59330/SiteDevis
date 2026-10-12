/* Calques d'animation injectés dans le vrai site pendant l'enregistrement : curseur, légendes, anneau, zoom, intro et outro. */
(() => {
  if (window.__fx) return; window.__fx = true;
  const boot = () => {
  const css = `
  #fx{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font-family:Inter,"Segoe UI",system-ui,sans-serif}
  #fx *{box-sizing:border-box}
  #fx-cur{position:fixed;left:0;top:0;width:30px;height:30px;opacity:0;transition:opacity .3s;filter:drop-shadow(0 4px 8px rgba(0,0,0,.55));z-index:5}
  #fx-cur svg{width:100%;height:100%;transition:transform .12s}
  #fx-cur.press svg{transform:scale(.8)}
  .fx-rip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #e3a04b;opacity:.9;animation:fxrip .7s ease-out forwards}
  @keyframes fxrip{to{transform:scale(4.5);opacity:0}}
  #fx-cap{position:fixed;left:40px;bottom:44px;max-width:620px;padding:18px 28px 20px;border-radius:20px;background:rgba(13,10,7,.82);backdrop-filter:blur(14px);border:1px solid rgba(227,160,75,.5);box-shadow:0 20px 70px rgba(0,0,0,.55),0 0 50px rgba(227,160,75,.18);opacity:0;transform:translateY(24px);transition:opacity .5s,transform .6s cubic-bezier(.2,.8,.2,1);z-index:4}
  #fx-cap.on{opacity:1;transform:none}
  #fx-cap .k{font-size:13px;letter-spacing:.2em;font-weight:700;color:#e3a04b;text-transform:uppercase}
  #fx-cap .t{font-size:34px;line-height:1.1;font-weight:800;color:#f7ead4;letter-spacing:-.02em;margin-top:6px}
  #fx-cap .s{font-size:16px;color:#c9b693;margin-top:8px;line-height:1.4}
  .fx-ring{position:fixed;border:3px solid #e3a04b;border-radius:14px;box-shadow:0 0 0 6px rgba(227,160,75,.18),0 0 40px rgba(227,160,75,.55);animation:fxring 1.6s ease-in-out forwards;z-index:3}
  @keyframes fxring{0%{opacity:0;transform:scale(1.15)}20%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0}}
  #fx-prog{position:fixed;left:0;bottom:0;height:4px;width:0;background:#e3a04b;z-index:6;box-shadow:0 0 14px #e3a04b}
  .fx-cover{position:fixed;inset:0;background:#0d0a07;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;z-index:7;overflow:hidden}
  .fx-cover.on{opacity:1}
  .fx-cover .glow{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(227,160,75,.38),transparent 68%);filter:blur(50px);animation:fxglow 6s ease-in-out infinite alternate}
  @keyframes fxglow{to{transform:translate(70px,40px) scale(1.15)}}
  .fx-cover img{position:relative;width:132px;height:132px;border-radius:34px;box-shadow:0 0 0 14px rgba(227,160,75,.12),0 30px 80px rgba(227,160,75,.35);transform:scale(.4);opacity:0}
  .fx-cover.on img{animation:fxpop .9s .1s cubic-bezier(.2,1.3,.3,1) forwards}
  @keyframes fxpop{to{transform:none;opacity:1}}
  .fx-cover .w{position:relative;margin-top:26px;font-size:104px;font-weight:800;letter-spacing:-.04em;color:#f7ead4;display:flex}
  .fx-cover .w span{display:inline-block;opacity:0;transform:translateY(60px);filter:blur(12px)}
  .fx-cover.on .w span{animation:fxlet .8s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(.55s + var(--i)*.06s)}
  .fx-cover .w .d{color:#e3a04b}
  @keyframes fxlet{to{opacity:1;transform:none;filter:none}}
  .fx-cover .tg{position:relative;margin-top:14px;font-size:26px;color:#c9b693;opacity:0}
  .fx-cover.on .tg{animation:fxfade .8s 1.5s forwards}
  .fx-cover .cta{position:relative;margin-top:34px;padding:16px 38px;border-radius:999px;background:#e3a04b;color:#0a0a0a;font-weight:800;font-size:24px;letter-spacing:.04em;opacity:0}
  .fx-cover.on .cta{animation:fxfade .8s 2.1s forwards}
  .fx-cover .url{position:relative;margin-top:18px;font-size:22px;color:#f7ead4;opacity:0;letter-spacing:.06em}
  .fx-cover.on .url{animation:fxfade .8s 2.5s forwards}
  @keyframes fxfade{to{opacity:1}}
  .fx-cover.out{transition:opacity .9s;opacity:0}
  `;
  const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
  const root = document.createElement('div'); root.id = 'fx';
  root.innerHTML = '<div id="fx-prog"></div><div id="fx-cap"><div class="k"></div><div class="t"></div><div class="s"></div></div><div id="fx-cur"><svg viewBox="0 0 24 24"><path d="M3 2l17 8-7 2-2 7z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg></div>';
  document.documentElement.appendChild(root);
  const cur = root.querySelector('#fx-cur'), cap = root.querySelector('#fx-cap');
  document.addEventListener('mousemove', e => { cur.style.opacity = 1; cur.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 3}px)`; }, true);
  window.fxPress = (x, y) => {
    cur.classList.add('press'); setTimeout(() => cur.classList.remove('press'), 160);
    const r = document.createElement('div'); r.className = 'fx-rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; root.appendChild(r); setTimeout(() => r.remove(), 800);
  };
  window.fxCap = (k, t, s) => { cap.querySelector('.k').textContent = k; cap.querySelector('.t').textContent = t; cap.querySelector('.s').textContent = s || ''; cap.querySelector('.s').style.display = s ? '' : 'none'; cap.classList.add('on'); };
  window.fxCapHide = () => cap.classList.remove('on');
  window.fxRing = (sel, pad = 8) => {
    const el = document.querySelector(sel); if (!el) return; const b = el.getBoundingClientRect();
    const r = document.createElement('div'); r.className = 'fx-ring'; r.style.cssText = `left:${b.left - pad}px;top:${b.top - pad}px;width:${b.width + 2 * pad}px;height:${b.height + 2 * pad}px`;
    root.appendChild(r); setTimeout(() => r.remove(), 1700);
  };
  window.fxZoom = (sel, scale, ms) => {
    const el = sel && document.querySelector(sel), b = document.body;
    if (!el || !scale || scale === 1) { b.style.transition = `transform ${ms}ms cubic-bezier(.3,.7,.2,1)`; b.style.transform = 'none'; return; }
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    b.style.transformOrigin = `${x}px ${y}px`; b.style.transition = `transform ${ms}ms cubic-bezier(.3,.7,.2,1)`; b.style.transform = `scale(${scale})`;
  };
  window.fxProgress = total => { const bar = root.querySelector('#fx-prog'), t0 = performance.now(); (function f() { const p = Math.min(1, (performance.now() - t0) / 1000 / total); bar.style.width = p * 100 + '%'; if (p < 1) requestAnimationFrame(f); })(); };
  window.fxCover = (kind) => {
    const c = document.createElement('div'); c.className = 'fx-cover'; c.id = 'fx-cover-' + kind;
    const word = [...'OptiDevis'].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('') + '<span class="d" style="--i:9">.</span>';
    c.innerHTML = `<div class="glow"></div><img src="/logo.svg" alt=""><div class="w">${word}</div>` + (kind === 'intro'
      ? '<div class="tg">Des devis professionnels, en quelques minutes.</div>'
      : '<div class="cta">Essayez-le maintenant</div><div class="url">optidevis.pro</div>');
    root.appendChild(c); requestAnimationFrame(() => c.classList.add('on'));
  };
  window.fxCoverOut = kind => { const c = document.getElementById('fx-cover-' + kind); if (c) { c.classList.add('out'); setTimeout(() => c.remove(), 1000); } };
  };
  if (document.documentElement) boot(); else document.addEventListener('readystatechange', boot, { once: true });
})();
