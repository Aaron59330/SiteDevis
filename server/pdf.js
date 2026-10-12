'use strict';
/* Génération de PDF : le document affiché (HTML + CSS du site) est rendu par Chromium sans interface,
   avec exactement la même mise en page que l'impression. Chromium est installé par deploy/install.sh ;
   sans lui, le site retombe sur l'impression du navigateur. */
const fs = require('fs');
const path = require('path');

let playwright = null;
try { playwright = require('playwright-core'); } catch (e) { /* module absent */ }

const PUBLIC = path.join(__dirname, '..', 'public');
const CSS_FILES = ['style.css', 'doc.css'].map(f => path.join(PUBLIC, f));
/* Les polices du site sont intégrées au HTML (le rendu n'a pas accès au réseau) */
const siteCss = () => CSS_FILES.map(f => fs.readFileSync(f, 'utf8')).join('\n').replace(/url\(\/(fonts\/[\w.\-]+)\)/g, (m, f) => {
  try { return 'url(data:font/woff2;base64,' + fs.readFileSync(path.join(PUBLIC, f)).toString('base64') + ')'; } catch (e) { return m; }
});
let browser = null, launching = null, active = 0;
const waiting = [];
const MAX_PARALLEL = 2;

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { const p = playwright.chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  return null;
}
const available = () => !!playwright && !!chromiumPath();

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  if (!launching) {
    launching = playwright.chromium.launch({
      executablePath: chromiumPath(), headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--font-render-hinting=none']
    }).then(b => { browser = b; b.on('disconnected', () => { browser = null; }); return b; }).finally(() => { launching = null; });
  }
  return launching;
}

const attr = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cssStr = s => '"' + String(s).replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, ' ') + '"';

/* On ne garde que du balisage d'affichage : aucun script, cadre, formulaire ni ressource externe. */
function clean(html) {
  return String(html)
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|style)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(src|href)\s*=\s*("|')\s*(?!data:image\/|#)[^"']*\2/gi, '$1=$2$2');
}

function pageCss(o) {
  return `@page { size: A4; margin: 14mm 4mm 6.3mm;
      @top-left { content: ${cssStr(o.label)}; font: 600 8pt Nunito, sans-serif; color: #6b7488; }
      @top-right { content: ${cssStr(o.date)}; font: 600 8pt Nunito, sans-serif; color: #6b7488; }
      @bottom-right { content: "Page " counter(page) " / " counter(pages); font: 700 7.3pt Nunito, sans-serif; color: #263238; vertical-align: bottom; padding: 0 0 2mm; } }
    @page :first { margin-top: 4mm; @top-left { content: none; } @top-right { content: none; } }`;
}

async function render(o) {
  const doc = `<!doctype html><html lang="fr" data-theme="light"><head><meta charset="utf-8">
<style>${siteCss()}</style><style>${pageCss(o)}</style></head>
<body><main><div class="editor"><div class="preview-wrap"><div class="doc" id="doc" style="--accent:${/^#[0-9a-f]{6}$/i.test(o.accent || '') ? o.accent : '#263238'}">${clean(o.html)}</div></div></div></main></body></html>`;
  const b = await getBrowser();
  const ctx = await b.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false });
  try {
    await ctx.route('**/*', r => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    await page.setContent(doc, { waitUntil: 'load', timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, timeout: 20000 });
  } finally { await ctx.close().catch(() => {}); }
}

/* File d'attente : au plus MAX_PARALLEL rendus en même temps */
async function toPdf(o) {
  if (active >= MAX_PARALLEL) await new Promise(res => waiting.push(res));
  active++;
  try { return await render(o); }
  finally { active--; const n = waiting.shift(); if (n) n(); }
}

module.exports = { available, toPdf, attr };
