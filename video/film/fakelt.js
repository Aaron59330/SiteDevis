/* Serveur de démonstration pour le film : correcteur LanguageTool simulé (hors ligne) + PDF actif. */
process.env.CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const spell = require('/home/user/SiteDevis/server/spell.js');
spell.useFetch(async (url, o) => {
  const text = new URLSearchParams(o.body).get('text'), matches = [];
  for (const [bad, good, msg] of [['Plafon', 'Plafond', 'Faute de frappe'], ['pienture', 'peinture', 'Faute de frappe'], ['2 couche ', '2 couches ', 'Accord'], ['Evacuation', 'Évacuation', 'Majuscule accentuée']]) {
    let i = -1; while ((i = text.indexOf(bad, i + 1)) >= 0) matches.push({ message: msg, offset: i, length: bad.length, replacements: [{ value: good }], rule: { category: { id: 'TYPOS' } } });
  }
  return { ok: true, status: 200, json: async () => ({ matches }) };
});
require('/home/user/SiteDevis/server.js');
