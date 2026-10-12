/* Serveur de démonstration pour le film (hors ligne) : correcteur, envoi d'email et lecture de photo simulés, PDF actif.
   Usage : PORT=3101 DATA_DIR=… node server.js */
process.env.CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
process.env.RESEND_API_KEY = 'demo'; process.env.MAIL_FROM = 'OptiDevis <contact@optidevis.pro>'; process.env.GEMINI_API_KEY = 'demo'; process.env.GEMINI_MODEL = 'demo';
const spell = require('/home/user/SiteDevis/server/spell.js');
spell.useFetch(async (url, o) => {
  const text = new URLSearchParams(o.body).get('text'), matches = [];
  for (const [bad, good, msg] of [['Plafon', 'Plafond', 'Faute de frappe'], ['pienture', 'peinture', 'Faute de frappe'], ['2 couche ', '2 couches ', 'Accord']]) {
    let i = -1; while ((i = text.indexOf(bad, i + 1)) >= 0) matches.push({ message: msg, offset: i, length: bad.length, replacements: [{ value: good }], rule: { category: { id: 'TYPOS' } } });
  }
  return { ok: true, status: 200, json: async () => ({ matches }) };
});
const real = global.fetch;
global.fetch = async (url, o) => {
  const u = String(url);
  if (u.startsWith('https://api.resend.com/')) { await new Promise(r => setTimeout(r, 700)); return { ok: true, status: 200, text: async () => '{}', json: async () => ({ id: 'demo' }) }; }
  if (u.startsWith('https://generativelanguage.googleapis.com/')) {
    await new Promise(r => setTimeout(r, 1600));
    const doc = { kind: 'devis', number: '', date: new Date().toISOString().slice(0, 10), valid_until: '', due_date: '', title: 'SALLE DE BAIN — RÉNOVATION',
      client: { type: 'particulier', name: 'Mme LEROY', address: '14 rue Nationale\n59000 LILLE', siret: '', vat_number: '', email: '', phone: '', contact: '' },
      lines: [{ type: 'item', ref: '', desc: 'Dépose de la baignoire', qty: 1, unit: 'forfait', unit_price: 350, vat_percent: 0 }, { type: 'item', ref: '', desc: 'Receveur de douche et paroi', qty: 1, unit: 'u', unit_price: 980, vat_percent: 0 },
        { type: 'item', ref: '', desc: 'Faïence murale', qty: 18, unit: 'm2', unit_price: 58, vat_percent: 0 }, { type: 'item', ref: '', desc: 'Peinture plafond', qty: 9, unit: 'm2', unit_price: 18, vat_percent: 0 }],
      discount_percent: 0, payments: [], notes: '', total_ht: 2536, total_ttc: 0 };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(doc) }] } }] }), text: async () => '' };
  }
  return real(url, o);
};
require('/home/user/SiteDevis/server.js');
