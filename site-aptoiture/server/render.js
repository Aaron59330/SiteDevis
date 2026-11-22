const cheerio = require('cheerio');

const INLINE = new Set(['br', 'b', 'strong', 'em', 'i']);
const SKIP = new Set(['script', 'style', 'svg', 'textarea', 'select', 'option', 'input', 'noscript', 'iframe']);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Nettoie un fragment HTML : ne garde que texte, <br>, <b>, <strong>, <em>, <i>
function sanitize(html) {
  const $ = cheerio.load('<div id="r">' + String(html || '') + '</div>', null, false);
  const walk = nodes => {
    let out = '';
    nodes.each((_, n) => {
      if (n.type === 'text') out += esc(n.data.replace(/\s+/g, ' '));
      else if (n.type === 'tag') {
        if (n.name === 'br') out += '<br>';
        else if (n.name === 'b' || n.name === 'strong') out += '<b>' + walk($(n).contents()) + '</b>';
        else if (n.name === 'em' || n.name === 'i') out += '<em>' + walk($(n).contents()) + '</em>';
        else if (n.name === 'div' || n.name === 'p') out += (out && !out.endsWith('<br>') ? '<br>' : '') + walk($(n).contents());
        else if (!SKIP.has(n.name)) out += walk($(n).contents());
      }
    });
    return out;
  };
  return walk($('#r').contents()).replace(/(<br>)+$/, '').trim();
}

const isScopeGlobal = ($, el) => $(el).closest('header, footer, .topbar').length > 0;

// Parcourt la page, repère textes et images modifiables, applique les modifications enregistrées.
function process(raw, { admin = false, overrides = {}, page = '', gallery = null, extras = null } = {}) {
  const $ = cheerio.load(raw);
  const $body = $('body');

  if (gallery) fillGallery($, gallery, admin);
  if (extras) injectExtras($, extras, admin);

  // 1. Entoure les textes « mixtes » (texte + éléments non-inline) dans des <span>
  $body.find('*').each((_, el) => {
    if (SKIP.has(el.name) || $(el).closest('[data-noedit]').length || $(el).closest('svg').length) return;
    const kids = el.children || [];
    const mixed = kids.some(k => k.type === 'tag' && !INLINE.has(k.name));
    if (!mixed) return;
    kids.forEach(k => {
      if (k.type === 'text' && k.data.trim()) $(k).replaceWith($('<span></span>').text(k.data));
    });
  });

  const texts = {}, imgs = {};
  const counters = { g: 0, p: 0, gi: 0, pi: 0 };
  const ov = { g: overrides.global || {}, p: (overrides.pages || {})[page] || {} };

  const visit = el => {
    if (el.type !== 'tag' || SKIP.has(el.name) || $(el).is('[data-noedit]')) return;
    if (el.name === 'img') {
      const sc = isScopeGlobal($, el) ? 'g' : 'p';
      const key = sc + 'i' + counters[sc + 'i']++;
      const orig = $(el).attr('src') || '';
      imgs[key] = orig;
      const o = (sc === 'g' ? ov.g : ov.p)[key];
      if (o && o.o === orig && typeof o.v === 'string') $(el).attr('src', o.v);
      if (admin) $(el).attr('data-edi', key).attr('data-edi-orig', orig);
      return;
    }
    const kids = el.children || [];
    const leaf = kids.length > 0
      && kids.every(k => k.type === 'text' || k.type === 'comment' || (k.type === 'tag' && INLINE.has(k.name)))
      && $(el).text().trim() !== '';
    if (leaf) {
      const sc = isScopeGlobal($, el) ? 'g' : 'p';
      const key = sc + counters[sc]++;
      const orig = sanitize($(el).html());
      texts[key] = orig;
      const o = (sc === 'g' ? ov.g : ov.p)[key];
      if (o && o.o === orig && typeof o.v === 'string') {
        $(el).html(o.v);
        syncLink($, el);
      }
      if (admin) $(el).attr('data-ed', key).attr('data-ed-orig', orig);
      return;
    }
    kids.forEach(visit);
  };
  $body.children().each((_, el) => visit(el));

  if (admin) {
    $('head').append('<link rel="stylesheet" href="/admin/admin.css">');
    $body.attr('data-admin', '').attr('data-page', page);
    $body.append('<script src="/admin/admin.js" defer></script>');
  }
  return { $, texts, imgs };
}

// Annonce, avis clients et documents : contenus gérés depuis le tableau de bord
function injectExtras($, x, admin) {
  const a = x.announce;
  if (a && a.enabled && a.text) {
    $('body').prepend(`<div class="announce tone-${a.tone === 'warn' ? 'warn' : 'info'}" role="status" data-noedit data-text="${esc(a.text).replace(/"/g, '&quot;')}"><span>${esc(a.text)}</span><button type="button" class="announce-x" aria-label="Fermer l'annonce">&times;</button></div>`);
  }
  $('[data-needs-doc]').each((_, el) => { if (!x.hasDoc) $(el).remove(); });
  const sec = $('[data-reviews]');
  if (sec.length) {
    const list = x.reviews || [];
    if (!list.length) {
      if (admin) sec.replaceWith('<section class="section" data-noedit><div class="container"><div class="note-admin">Section « Avis clients » masquée pour les visiteurs tant qu\'aucun avis n\'est ajouté (tableau de bord &rarr; Avis).</div></div></section>');
      else sec.remove();
    } else {
      const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
      const stars = n => '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i>';
      const cards = list.slice(0, 6).map(r => `<blockquote class="card review"><div class="stars">${stars(r.rating)}</div><p>« ${esc(r.text)} »</p><cite>${esc(r.author)}${r.date ? ' · ' + esc(r.date.split('-').reverse().join('/')) : ''}</cite></blockquote>`).join('');
      const link = x.googleUrl ? `<p class="reviews-more"><a class="btn btn-ghost" href="${esc(x.googleUrl).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">Voir tous les avis sur Google</a></p>` : '';
      sec.replaceWith(`<section class="section alt" data-noedit><div class="container"><div class="head"><p class="eyebrow">Avis clients</p><h2>Ils nous ont fait confiance</h2><p class="rating"><span class="stars">${stars(Math.round(avg))}</span> <b>${avg.toFixed(1).replace('.', ',')}/5</b> · ${list.length} avis</p></div><div class="grid3">${cards}</div>${link}</div></section>`);
    }
  }
}

// Garde les liens « tel: » et « mailto: » cohérents avec le texte modifié
function syncLink($, el) {
  const a = el.name === 'a' ? $(el) : $(el).closest('a');
  if (!a.length) return;
  const href = a.attr('href') || '';
  const txt = a.text().trim();
  if (href.startsWith('tel:')) {
    const d = txt.replace(/[^\d+]/g, '');
    if (d.length >= 6) a.attr('href', 'tel:' + (d.startsWith('0') ? '+33' + d.slice(1) : d));
  } else if (href.startsWith('mailto:') && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(txt)) {
    a.attr('href', 'mailto:' + txt);
  }
}

function fillGallery($, items, admin) {
  const g = $('#gallery');
  if (!g.length) return;
  g.attr('data-noedit', '');
  if (!items.length) {
    g.html('<p class="empty">' + (admin ? 'Aucune photo pour le moment. Utilisez « Ajouter des photos » ci-dessus.' : 'Les réalisations seront bientôt publiées.') + '</p>');
    return;
  }
  const html = items.map(it => {
    const alt = esc((it.title || it.description || 'Réalisation P.A Couverture').slice(0, 120)).replace(/"/g, '&quot;');
    return `<figure class="shot" data-id="${it.id}"><a class="shot-img" href="${it.file}"><img src="${it.file}" alt="${alt}" loading="lazy"></a><figcaption><b class="t" data-ph="Ajouter un titre">${esc(it.title || '')}</b><span class="d" data-ph="Ajouter une description du chantier">${esc(it.description || '')}</span></figcaption></figure>`;
  }).join('');
  g.html(html);
}

// Données structurées pour Google (FAQ), générées à partir du contenu affiché
function faqJsonLd($) {
  const items = [];
  $('.faq-item').each((_, el) => {
    const q = $(el).find('.faq-q span').first().text().replace(/\s+/g, ' ').trim();
    const a = $(el).find('.faq-a').text().replace(/\s+/g, ' ').trim();
    if (q && a) items.push({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } });
  });
  if (!items.length) return;
  const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items }).replace(/</g, '\\u003c');
  $('head').append('<script type="application/ld+json">' + json + '</script>');
}

module.exports = { process, sanitize, faqJsonLd };
