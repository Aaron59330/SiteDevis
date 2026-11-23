// Crée ou change le compte administrateur : npm run set-admin
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { writeJSON } = require('../server/store');

function ask(q, hidden) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = s => { if (s.includes(q)) process.stdout.write(s); };
  return new Promise(r => rl.question(q, a => { rl.close(); if (hidden) process.stdout.write('\n'); r(a); }));
}
(async () => {
  const email = (process.argv[2] || await ask('E-mail administrateur : ')).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('E-mail invalide.'); process.exit(1); }
  const pw = process.argv[3] || await ask('Mot de passe (10 caractères minimum) : ', true);
  if (pw.length < 10) { console.error('Mot de passe trop court (10 caractères minimum).'); process.exit(1); }
  writeJSON('admin.json', { email, hash: bcrypt.hashSync(pw, 12) });
  console.log('Compte administrateur enregistré pour ' + email);
})();
