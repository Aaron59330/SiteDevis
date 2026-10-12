'use strict';
/* Appels vers le serveur (cookie de session + en-tête anti-CSRF) */
async function api(method, path, body) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sitedevis' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) {
    if (r.status === 401 && j && j.code === 'auth' && typeof session !== 'undefined' && session.user) { location.reload(); }
    const e = new Error((j && j.error) || 'Erreur ' + r.status);
    e.status = r.status; e.code = j && j.code; e.data = j;
    throw e;
  }
  return j;
}
