'use strict';
/* Lecture directe d'une fiche produit ou d'une recherche sur le site d'un magasin (JSON-LD schema.org / balises Open Graph).
   Sécurité : https uniquement, domaines connus ou site du fournisseur, jamais d'adresse privée, redirections contrôlées, taille et durée limitées. */
const dns = require('dns').promises, net = require('net');
const stores = require('./stores');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
let fetchImpl = (...a) => fetch(...a), lookup = h => dns.lookup(h, { all: true });
const inject = o => { if (o.fetch) fetchImpl = o.fetch; if (o.lookup) lookup = o.lookup; };

const privateIp = ip => {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const v = ip.toLowerCase(); return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('::ffff:');
};
async function safeUrl(u, extraDomains = []) {
  let x; try { x = new URL(String(u)); } catch (e) { return null; }
  if (x.protocol !== 'https:' || x.username || x.password || (x.port && x.port !== '443')) return null;
  const h = x.hostname.toLowerCase(); if (net.isIP(h)) return null;
  const allowed = [...stores.STORES.map(s => s[1]), ...extraDomains.filter(Boolean)];
  if (!allowed.some(d => h === d || h.endsWith('.' + d))) return null;
  let addrs; try { addrs = await lookup(h); } catch (e) { return null; }
  if (!addrs.length || addrs.some(a => privateIp(a.address))) return null;
  return x;
}

async function getHtml(u, extraDomains) {
  let url = await safeUrl(u, extraDomains); if (!url) { const e = new Error('Adresse non autorisée.'); e.status = 400; throw e; }
  for (let hop = 0; hop < 5; hop++) {
    const r = await fetchImpl(url.href, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9' }, signal: AbortSignal.timeout(9000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { const nx = await safeUrl(new URL(r.headers.get('location'), url).href, extraDomains); if (!nx) { const e = new Error('Redirection non autorisée.'); e.status = 400; throw e; } url = nx; continue; }
    if (r.status === 403 || r.status === 429 || r.status === 503) { const e = new Error('Le site du magasin refuse la lecture automatique.'); e.status = 403; throw e; }
    if (!r.ok) { const e = new Error('Page introuvable (' + r.status + ').'); e.status = 404; throw e; }
    const chunks = []; let size = 0;
    for await (const c of r.body) { size += c.length; if (size > 1.6e6) break; chunks.push(Buffer.from(c)); }
    return { html: Buffer.concat(chunks).toString('utf8'), url: url.href };
  }
  const e = new Error('Trop de redirections.'); e.status = 400; throw e;
}

const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[\s  €]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const text = v => String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
function walk(o, out) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(x => walk(x, out)); out.push(o); if (o['@graph']) walk(o['@graph'], out); }
const meta = (html, prop) => { const m = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop.replace(/[.:]/g, '\\$&') + '["\'][^>]*content=["\']([^"\']*)["\']', 'i').exec(html) || new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + prop.replace(/[.:]/g, '\\$&') + '["\']', 'i').exec(html); return m ? text(m[1]) : ''; };

/* Extrait titre, prix TTC, référence, EAN, marque d'une page produit */
function parseProduct(html, pageUrl) {
  const nodes = [], re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) { try { walk(JSON.parse(m[1].trim()), nodes); } catch (e) { /* bloc illisible */ } }
  const prod = nodes.find(n => [].concat(n['@type'] || []).some(t => /^Product$/i.test(t)));
  let title = '', price = null, sku = '', ean = '', brand = '', link = pageUrl, image = '';
  if (prod) {
    title = text(prod.name); sku = text(prod.sku || prod.mpn || prod.productID); ean = text(prod.gtin13 || prod.gtin || prod.gtin14 || prod.gtin8);
    brand = text(prod.brand && (prod.brand.name || prod.brand)); image = [].concat(prod.image || [])[0]; image = text(image && image.url || image);
    const offers = [].concat(prod.offers || []).flatMap(o => o && o['@type'] === 'AggregateOffer' ? [o] : [].concat(o && o.offers ? o.offers : o)).filter(Boolean);
    for (const o of offers) { const p = num(o.price != null ? o.price : (o.priceSpecification && o.priceSpecification.price) != null ? o.priceSpecification.price : o.lowPrice); if (p != null && p > 0) { price = p; if (o.url && /^https:/.test(o.url)) link = o.url; break; } }
  }
  if (price == null) { const p = num(meta(html, 'product:price:amount') || meta(html, 'og:price:amount')); if (p > 0) price = p; }
  if (!title) title = meta(html, 'og:title') || text((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]);
  if (!image) image = meta(html, 'og:image');
  return price != null && title ? { title: title.slice(0, 200), price, sku: sku.slice(0, 60), ean: ean.slice(0, 20), brand: brand.slice(0, 60), link, image: /^https:/.test(image) ? image : '' } : null;
}

/* Modèles d'URL de recherche des principaux magasins (une référence exacte redirige en général vers la fiche) */
// adresses de recherche du site du magasin, essayées dans l'ordre (la barre de recherche du magasin redirige souvent vers la fiche quand la référence est exacte)
const SEARCH = {
  'leroymerlin.fr': r => ['https://www.leroymerlin.fr/recherche/?q=' + r, 'https://www.leroymerlin.fr/search?term=' + r, 'https://www.leroymerlin.fr/produits/?q=' + r],
  'castorama.fr': r => ['https://www.castorama.fr/search?term=' + r, 'https://www.castorama.fr/recherche?q=' + r],
  'bricodepot.fr': r => ['https://www.bricodepot.fr/catalogue/recherche/?q=' + r, 'https://www.bricodepot.fr/recherche?q=' + r],
  'pointp.fr': r => ['https://www.pointp.fr/recherche?q=' + r, 'https://www.pointp.fr/search?q=' + r],
  'cedeo.fr': r => ['https://www.cedeo.fr/recherche?q=' + r],
  'gedimat.fr': r => ['https://www.gedimat.fr/catalogsearch/result/?q=' + r],
  'bricomarche.com': r => ['https://www.bricomarche.com/recherche?q=' + r],
  'manomano.fr': r => ['https://www.manomano.fr/recherche/' + r]
};

const nkey = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Lit une fiche produit (adresse collée) ou cherche la référence dans la barre de recherche du magasin ; renvoie null si aucune fiche lisible */
async function lookup_(refOrUrl, store, extraDomains) {
  const isUrl = /^https:\/\//i.test(refOrUrl);
  const domains = [...extraDomains, store && store.domain];
  const urls = isUrl ? [refOrUrl] : (store && SEARCH[store.domain] ? SEARCH[store.domain](encodeURIComponent(refOrUrl)) : []);
  const rk = nkey(refOrUrl);
  const seen = new Set();
  const read = async (url, depth) => {
    if (seen.has(url)) return null; seen.add(url);
    let page; try { page = await getHtml(url, domains); } catch (e) { return null; }
    const p = parseProduct(page.html, page.url);
    if (p) return { p, finalUrl: page.url };
    if (isUrl || depth > 0 || rk.length < 4) return null;
    // page de résultats : on suit le premier lien de fiche dont l'adresse contient la référence
    const base = (() => { try { return new URL(page.url); } catch (e) { return null; } })(); if (!base) return null;
    const re = /href=["']([^"'#]+)["']/gi; let m;
    while ((m = re.exec(page.html))) {
      let u; try { u = new URL(m[1].replace(/&amp;/g, '&'), base); } catch (e) { continue; }
      if (u.hostname !== base.hostname || !nkey(u.pathname).includes(rk) || seen.has(u.href)) continue;
      const r = await read(u.href, depth + 1); if (r) return r;
    }
    return null;
  };
  for (const url of urls) {
    const r = await read(url, 0); if (!r) continue;
    const { p, finalUrl } = r;
    let host = ''; try { host = new URL(finalUrl).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
    const known = stores.STORES.find(s => host === s[1] || host.endsWith('.' + s[1]));
    return { ...p, store: known ? known[0] : (store ? store.name : host), priceText: p.price.toFixed(2).replace('.', ',') + ' €', thumbnail: p.image, direct: true };
  }
  return null;
}
module.exports = { safeUrl, parseProduct, lookup: lookup_, inject, privateIp, SEARCH };
