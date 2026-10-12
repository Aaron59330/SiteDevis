'use strict';
/* Interface sobre : les émojis et symboles décoratifs du code sont remplacés à l'affichage par des icônes SVG
   monochromes (couleur du texte). Dans les titres, onglets et pastilles, ils sont simplement retirés. */
(function () {
  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    left: '<path d="M19 12H5M12 19l-7-7 7-7"/>', right: '<path d="M5 12h14M12 5l7 7-7 7"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L7 14.2l-5-4.9 6.9-1z"/>',
    edit: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.7 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L22 7H5.1"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 18.5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    store: '<path d="m3 9 1-5h16l1 5M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
    package: '<path d="m7.5 4.3 9 5.2M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7 12 12l8.7-5M12 22V12"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    refresh: '<path d="M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7L21 16M21 21v-5h-5"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
    alert: '<path d="m10.3 3.9-8.5 14.7A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.4L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 17l.6 1.4L7 19l-1.4.6L5 21l-.6-1.4L3 19l1.4-.6z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chart: '<path d="M3 3v18h18M7 15v3M12 9v9M17 5v13"/>', tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>', inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>', hardhat: '<path d="M2 18h20v2H2zM4 18a8 8 0 0 1 16 0M10 10V5h4v5M12 5V3"/>', receipt: '<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2zM8 8h8M8 12h8M8 16h5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
  };
  const MAP = { '＋': 'plus', '✓': 'check', '✔': 'check', '✅': 'check', '✕': 'x', '✖': 'x', '←': 'left', '→': 'right', '⇒': 'right', '↑': 'up', '↓': 'down', '⬇': 'download', '⬆': 'upload', '⧉': 'copy', '🗑': 'trash',
    '🔍': 'search', '🔎': 'search', '★': 'star*', '⭐': 'star*', '☆': 'star', '✎': 'edit', '👁': 'eye', '🖨': 'printer', '💾': 'save', '🛒': 'cart', '📚': 'book', '🧾': 'file', '📄': 'file', '🏪': 'store', '🧱': 'layers',
    '📦': 'package', '👤': 'user', '🏢': 'building', '🛡': 'shield', '🔗': 'link', '📞': 'phone', '📍': 'pin', '🌐': 'globe', '✉': 'mail', '📬': 'mail', '📋': 'clipboard', '↻': 'refresh', '↗': 'external',
    '⚠': 'alert', '🌙': 'moon', '☀': 'sun', '🧮': 'calc', '🔒': 'lock', '✨': 'sparkles' };
  const svg = n => { const f = n.endsWith('*'), k = f ? n.slice(0, -1) : n; return `<svg class="ic" viewBox="0 0 24 24" fill="${f ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`; };
  const KEYS = Object.keys(MAP).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const MAPPED = new RegExp(`(${KEYS})\\s?`, 'g');
  const ANY = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}＋⧉️‍]\s?/gu;
  const STRIP_IN = 'h1,h2,h3,.tabs button,#nav button,.badge,.pill,.chip,.brand,.tag,.stat .l,#saved';
  const NO_SVG = 'option,textarea,title,script,style,svg,#doc,.doc';

  function fixText(node) {
    const el = node.parentElement;
    if (!el || !node.nodeValue) return;
    const raw = node.nodeValue.replace(/️/g, '');
    if (!MAPPED.test(raw) && !ANY.test(raw)) { MAPPED.lastIndex = 0; ANY.lastIndex = 0; return; }
    MAPPED.lastIndex = 0; ANY.lastIndex = 0;
    if (el.closest('.doc')) { node.nodeValue = raw.replace(ANY, ''); return; }
    const plain = el.closest(NO_SVG) || el.closest(STRIP_IN);
    if (plain) { node.nodeValue = raw.replace(/^\s+/, m => m).replace(MAPPED, '').replace(ANY, ''); return; }
    const html = raw.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(MAPPED, (m, g) => svg(MAP[g])).replace(ANY, '');
    const t = document.createElement('template'); t.innerHTML = html;
    node.replaceWith(t.content);
  }
  function fixAttrs(el) {
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && (ANY.test(v) || MAPPED.test(v))) { el.setAttribute(a, v.replace(new RegExp(`(${KEYS})\\s?`, 'g'), '').replace(ANY, '').trim()); }
      ANY.lastIndex = 0; MAPPED.lastIndex = 0;
    }
  }
  function sweep(root) {
    if (root.nodeType === 3) return fixText(root);
    if (root.nodeType !== 1) return;
    if (root.closest && root.closest('svg')) return;
    fixAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const texts = [], els = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) (n.nodeType === 3 ? texts : els).push(n);
    els.forEach(fixAttrs); texts.forEach(fixText);
  }
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') fixText(m.target);
      else m.addedNodes.forEach(n => sweep(n));
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', () => sweep(document.body));
  window.icon = n => svg(n);
})();
