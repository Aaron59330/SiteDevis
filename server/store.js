'use strict';
/* Stockage fichier JSON (aucune dépendance). Pour une grosse production, remplacer par PostgreSQL. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DIR, 'users'), { recursive: true });
const FILE = path.join(DIR, 'db.json');

const features = ['Devis illimités', 'Clients et catalogue de prestations', 'Export PDF multi-pages', 'Recherche d\'entreprise par SIRET', 'Support par email'];
const defaults = () => ({
  users: [], sessions: [], tokens: [], payments: [], audit: [], outbox: [], reminders: {},
  plans: [
    { id: 'monthly', name: 'Mensuel', priceCents: 990, interval: 'month', description: 'Sans engagement, renouvelable à la demande', features, active: true },
    { id: 'yearly', name: 'Annuel', priceCents: 9900, interval: 'year', description: '2 mois offerts', features, active: true }
  ],
  settings: { siteName: 'OptiDevis', trialDays: 0, registrationOpen: true, requireVerification: true, supportEmail: '', receiptCounter: 0 }
});

let db;
try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  db = { ...defaults(), ...raw };
  db.settings = { ...defaults().settings, ...raw.settings };
  if (db.settings.siteName === 'Mes Devis') db.settings.siteName = 'OptiDevis';
} catch (e) { db = defaults(); }
db.sessions = db.sessions.filter(s => s.exp > Date.now());
db.tokens = db.tokens.filter(t => t.exp > Date.now());

function flush() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}
let timer = null;
function save() { if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 100); }
process.on('exit', () => { try { flush(); } catch (e) { /* ignore */ } });
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => process.exit(0)));

const userFile = id => path.join(DIR, 'users', String(id).replace(/[^a-zA-Z0-9-]/g, '') + '.json');
function getUserData(id) { try { return JSON.parse(fs.readFileSync(userFile(id), 'utf8')); } catch (e) { return null; } }
function setUserData(id, data) {
  const f = userFile(id);
  fs.writeFileSync(f + '.tmp', JSON.stringify(data));
  fs.renameSync(f + '.tmp', f);
}
function delUserData(id) { try { fs.unlinkSync(userFile(id)); } catch (e) { /* ignore */ } }

module.exports = { db, save, flush, getUserData, setUserData, delUserData, uuid: () => crypto.randomUUID(), DIR };
