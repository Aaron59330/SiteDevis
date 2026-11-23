const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const UPLOADS = path.join(DATA, 'uploads');
const PRIVATE = path.join(DATA, 'private');   // photos envoyées par les clients (jamais publiques)
const DOCS = path.join(DATA, 'documents');
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(PRIVATE, { recursive: true });
fs.mkdirSync(DOCS, { recursive: true });

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return fallback; }
}
function writeJSON(name, obj) {
  const p = path.join(DATA, name);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}
module.exports = { DATA, UPLOADS, PRIVATE, DOCS, readJSON, writeJSON };
