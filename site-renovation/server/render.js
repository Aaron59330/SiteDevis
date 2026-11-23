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

// Réseaux sociaux : boutons aux couleurs des marques (liens réglés dans le tableau de bord)
const ICON = {
  instagram: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.2.8-.4.3-.6.7-.8 1.2-.2.4-.3 1-.4 2.1C2.7 9.5 2.7 9.9 2.7 12s0 3.5.1 4.7c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.2.3.4.7.6 1.2.8.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.2-.8.4-.3.6-.7.8-1.2.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.2-.3-.4-.7-.6-1.2-.8-.4-.2-1-.3-2.1-.4C15.5 4 15.1 4 12 4zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8zm0 8a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zm6.2-8.2a1.1 1.1 0 1 1-2.3 0 1.1 1.1 0 0 1 2.3 0z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
};
function socialLinks(x) {
  const so = x.socials || {};
  const ig = so.instagram || 'https://www.instagram.com/pa_renovation_/';
  const fb = so.facebook || 'https://www.facebook.com/share/1FKSEeboC4/';
  const handle = (/instagram\.com\/([\w.]+)/.exec(ig) || [])[1] || 'pa_renovation_';
  return [
    { k: 'instagram', url: ig, name: 'Instagram', sub: '@' + handle },
    { k: 'facebook', url: fb, name: 'Facebook', sub: 'PA Rénovation' },
  ];
}
const attrUrl = u => esc(u).replace(/"/g, '&quot;');
function injectSocials($, x) {
  const links = socialLinks(x);
  const btn = (l, cls) => `<a class="${cls} so-${l.k}" href="${attrUrl(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="${l.name} : ${esc(l.sub)} (nouvel onglet)">${ICON[l.k]}<span><b>${l.name}</b><small>${esc(l.sub)}</small></span></a>`;
  // pied de page : on remplace les lignes texte par de vrais boutons
  $('.footer .fgrid a, .footer .fgrid span').each((_, el) => { const t = $(el).text().trim(); if (/^(Instagram|Facebook)\b/i.test(t)) $(el).remove(); });
  $('.footer .fgrid h4').filter((_, el) => $(el).text().trim() === 'Contact').parent().append(`<div class="socials" data-noedit>${links.map(l => btn(l, 'so-btn')).join('')}</div>`);
  // barre du haut : icônes
  $('.topbar .tb-right').prepend(`<span class="tb-socials" data-noedit>${links.map(l => `<a class="tb-so so-${l.k}" href="${attrUrl(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="${l.name} (nouvel onglet)" title="${l.name}">${ICON[l.k]}</a>`).join('')}</span>`);
  // page contact : les lignes Instagram / Facebook deviennent cliquables
  $('.crow').each((_, el) => {
    const label = $(el).find('small').first().text().trim().toLowerCase();
    const l = links.find(z => z.k === label); if (!l) return;
    $(el).replaceWith(btn(l, 'so-card'));
  });
  // accueil : bloc « Suivez nos chantiers » avant l'appel à l'action
  if (x.page === 'index.html') {
    const block = `<section class="section so-band" data-noedit><div class="container so-band-in"><div><p class="eyebrow">Réseaux sociaux</p><h2>Suivez nos chantiers</h2><p class="para">Avant / après, chantiers en cours et réalisations récentes : retrouvez PA Rénovation sur Instagram et Facebook.</p></div><div class="so-band-btns">${links.map(l => btn(l, 'so-big')).join('')}</div></div></section>`;
    const cta = $('main .cta').first();
    if (cta.length) cta.before(block); else $('main').append(block);
  }
}

// Annonce, avis clients et documents : contenus gérés depuis le tableau de bord
function injectExtras($, x, admin) {
  injectSocials($, x);
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
  const attr = v => esc(String(v)).replace(/"/g, '&quot;');
  const html = items.map(it => {
    const photos = it.photos && it.photos.length ? it.photos : [it.file];
    const alt = attr((it.title || it.description || 'Réalisation PA Rénovation').slice(0, 120));
    const n = photos.length, count = `<span class="shot-count">${n} photo${n > 1 ? 's' : ''}</span>`;
    if (admin) {
      return `<figure class="shot adm-shot" data-id="${it.id}"><a class="shot-img" href="${photos[0]}"><img src="${photos[0]}" alt="${alt}" loading="lazy">${count}</a>`
        + `<div class="adm-photos">${photos.map((p, i) => `<span class="adm-ph${i ? '' : ' cover'}" data-photo="${attr(p)}"><img src="${p}" alt="" loading="lazy"><button type="button" class="ph-cover" title="Mettre en photo de couverture">★</button><button type="button" class="ph-del" title="Retirer cette photo">×</button></span>`).join('')}<button type="button" class="adm-ph-add" title="Ajouter des photos à ce chantier">＋</button></div>`
        + `<figcaption><b class="t" data-ph="Titre du chantier">${esc(it.title || '')}</b><span class="c" data-ph="Catégorie (ex. Rénovation complète)">${esc(it.category || '')}</span><span class="d" data-ph="Description du chantier (une ligne vide = nouveau paragraphe)">${esc(it.description || '')}</span></figcaption></figure>`;
    }
    return `<figure class="shot" data-id="${it.id}" data-photos="${attr(JSON.stringify(photos))}"><a class="shot-img" href="${photos[0]}" aria-label="Voir le détail : ${alt}"><img src="${photos[0]}" alt="${alt}" loading="lazy">${count}`
      + `<span class="shot-over">${it.title ? `<b class="t">${esc(it.title)}</b>` : ''}${it.category ? `<span class="c">${esc(it.category)}</span>` : ''}<span class="shot-more">Voir le détail →</span></span></a>`
      + `<span class="d" hidden>${esc(it.description || '')}</span></figure>`;
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
