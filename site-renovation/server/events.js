// Agenda personnel de l'artisan : rendez-vous qu'il pose lui-même (chantier, fournisseur, perso…).
// - bloque la réservation en ligne des clients (toute la journée, ou seulement les heures de l'événement)
// - rappels par e-mail : X minutes / heures / jours avant, et/ou chaque jour à partir de N jours avant
const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');

const D = /^\d{4}-\d{2}-\d{2}$/, T = /^([01]\d|2[0-3]):[0-5]\d$/;
const BEFORE = [10, 30, 60, 120, 180, 1440, 2880, 10080];          // minutes proposées
const COLORS = ['blue', 'green', 'orange', 'red', 'purple', 'grey'];
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const toMin = t => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10);

const list = () => readJSON('events.json', []);
const save = l => writeJSON('events.json', l);

function clean(b, old = {}) {
  const e = {
    id: old.id || crypto.randomBytes(6).toString('hex'), created: old.created || new Date().toISOString(),
    title: clip(b.title, 120), date: clip(b.date, 10), allDay: b.allDay === true,
    start: clip(b.start, 5), end: clip(b.end, 5), location: clip(b.location, 160), note: clip(b.note, 1500),
    color: COLORS.includes(b.color) ? b.color : 'blue',
    block: ['day', 'hours', 'none'].includes(b.block) ? b.block : 'day',
    remindBefore: [...new Set((Array.isArray(b.remindBefore) ? b.remindBefore : []).map(Number).filter(m => BEFORE.includes(m)))].sort((x, y) => y - x),
    remindDaily: Math.min(30, Math.max(0, parseInt(b.remindDaily, 10) || 0)),     // 0 = pas de rappel quotidien
    sent: old.sent || [],
  };
  if (!e.title) throw new Error('Donnez un titre au rendez-vous.');
  if (!D.test(e.date)) throw new Error('Choisissez une date.');
  if (e.allDay) { e.start = ''; e.end = ''; }
  else {
    if (!T.test(e.start)) throw new Error('Indiquez l\'heure de début (ou cochez « Toute la journée »).');
    if (e.end && (!T.test(e.end) || toMin(e.end) <= toMin(e.start))) throw new Error('L\'heure de fin doit être après l\'heure de début.');
  }
  // date / heure modifiées : les rappels repartent de zéro
  if (old.date !== e.date || old.start !== e.start) e.sent = [];
  return e;
}

/* les clients ne peuvent plus réserver : toute la journée, ou un créneau qui chevauche l'événement */
function blocks(events, date, time, slotMinutes) {
  return events.some(e => {
    if (e.date !== date || e.block === 'none') return false;
    if (e.block === 'day' || e.allDay) return true;
    const s = toMin(e.start), en = e.end ? toMin(e.end) : s + 60, t = toMin(time);
    return t < en && t + slotMinutes > s;
  });
}

/* heure de Paris → instant réel (gère heure d'été / d'hiver) */
function parisToUtc(date, time) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = (time || '00:00').split(':').map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += Date.UTC(y, mo - 1, d, h, mi) - shown;
  }
  return guess;
}
const remaining = ms => { const m = Math.max(1, Math.round(ms / 60e3)); if (m < 60) return `${m} min`; if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return r >= 10 ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`; } const d = Math.round(m / 1440); return `${d} jour${d > 1 ? 's' : ''}`; };
const label = m => m >= 1440 ? `${m / 1440} jour${m >= 2880 ? 's' : ''}` : m >= 60 ? `${m / 60} h` : `${m} min`;

/* rappels à envoyer maintenant : [{ event, key, kind, text }] */
function dueReminders(events, now, today, hour) {
  const out = [];
  for (const e of events) {
    const at = parisToUtc(e.date, e.allDay ? '08:00' : e.start);
    if (at < now - 3600e3) continue;                                    // passé
    for (const m of e.remindBefore || []) {
      const key = 'b' + m;
      if (!e.sent.includes(key) && now >= at - m * 60e3 && now < at) out.push({ event: e, key, kind: 'avant', text: 'dans ' + remaining(at - now) });
    }
    if (e.remindDaily > 0 && hour >= 8) {
      const days = Math.round((Date.parse(e.date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5);
      const key = 'd' + today;
      if (days >= 0 && days <= e.remindDaily && now < at && !e.sent.includes(key)) out.push({ event: e, key, kind: 'jour', text: days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : `dans ${days} jours` });
    }
  }
  return out;
}
module.exports = { list, save, clean, blocks, dueReminders, parisToUtc, BEFORE, COLORS };
