// Rappels automatiques de rendez-vous : la veille, le client reçoit un rappel (avec fichier agenda)
// et l'artisan reçoit la liste de ses rendez-vous du lendemain. Vérification toutes les 10 minutes.
const { readJSON, writeJSON } = require('./store');
const settings = require('./settings');
const mailer = require('./mailer');
const sms = require('./sms');
const shortDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const { addDays, parisToday } = require('./booking');

const frDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const parisHour = () => Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const fmtTime = t => t.replace(/^0/, '').replace(':', ' h ').replace(' h 00', ' h');

/* fichier agenda (.ics) : le client ajoute le rendez-vous à son téléphone en un clic */
function ics(a) {
  const d = a.date.replace(/-/g, ''), [h, m] = a.time.split(':').map(Number), end = h * 60 + m + (a.duration || 60);
  const t = (mm) => String(Math.floor(mm / 60)).padStart(2, '0') + String(mm % 60).padStart(2, '0') + '00';
  const esc = s => String(s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//P.A Couverture//Rendez-vous//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT', `UID:rdv-${a.id}@pa-couverture`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Paris:${d}T${t(h * 60 + m)}`, `DTEND;TZID=Europe/Paris:${d}T${t(end)}`,
    `SUMMARY:${esc('P.A Couverture – ' + a.kind)}`, `LOCATION:${esc(a.adresse)}`,
    `DESCRIPTION:${esc(`Rendez-vous avec P.A Couverture (${a.kind}).\nEn cas d'empêchement : ${mailer.PHONE}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Rendez-vous P.A Couverture', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
const icsAttachment = a => ({ filename: 'rendez-vous-pa-couverture.ics', content: ics(a), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' });

let running = false;
async function run() {
  if (!mailer.configured() && !sms.configured()) return;
  await runEvents();
  await runClients();
}
/* rappels de l'agenda personnel (envoyés à l'artisan) */
let evRunning = false;
async function runEvents() {
  if (evRunning) return; evRunning = true;
  try {
    const { list, dueReminders, save } = require('./events');
    const s = settings.get(), evs = list();
    const due = dueReminders(evs, Date.now(), parisToday(), parisHour());
    const byEvent = new Map(); due.forEach(d => byEvent.set(d.event.id, (byEvent.get(d.event.id) || []).concat(d)));
    const done = new Map();
    for (const [, items] of byEvent) {
      const e = items[0].event, d = items.find(x => x.kind === 'avant') || items[0];     // un seul e-mail par événement
      const when = e.allDay ? 'toute la journée' : `à ${fmtTime(e.start)}${e.end ? ' – ' + fmtTime(e.end) : ''}`;
      const res = await mailer.send({
        to: s.notifyEmail, subject: `Rappel : ${e.title} — ${d.text} (${frDate(e.date)}${e.allDay ? '' : ' à ' + fmtTime(e.start)})`,
        mail: {
          eyebrow: 'Rappel de votre agenda', title: `${e.title} — ${d.text}`, footnote: 'Rappel automatique de votre agenda (tableau de bord du site).',
          intro: `Vous avez noté ce rendez-vous dans votre agenda.`,
          rows: [['Date', frDate(e.date)], ['Heure', when], ['Lieu', e.location]],
          quote: { label: 'Notes', text: e.note },
          button: s.siteUrl ? { label: 'Ouvrir mon agenda', url: s.siteUrl + '/admin/tableau-de-bord#agenda' } : null,
        },
      });
      // et par SMS (court) si activé
      let smsOk = false;
      if (s.sms.agenda && sms.configured()) smsOk = (await sms.send(`Rappel : ${e.title} ${d.text} (${shortDate(e.date)}${e.allDay ? '' : ' ' + fmtTime(e.start)})${e.location ? ' - ' + e.location : ''}${e.note ? '\n' + e.note.slice(0, 120) : ''}`)).sent;
      if (res.sent || smsOk) done.set(e.id, items.map(x => x.key).concat(e.remindBefore.filter(m => Date.now() >= require('./events').parisToUtc(e.date, e.allDay ? '08:00' : e.start) - m * 60e3).map(m => 'b' + m)));
    }
    if (done.size) save(list().map(e => (done.has(e.id) ? { ...e, sent: [...new Set(e.sent.concat(done.get(e.id)))] } : e)));
  } catch (e) { console.error('Rappels agenda :', e.message); }
  finally { evRunning = false; }
}
async function runClients() {
  if (running) return;
  const s = settings.get(), r = s.reminders;
  if (!r.enabled || parisHour() < r.hour) return;
  running = true;
  try {
    const tomorrow = addDays(parisToday(), 1);
    const list = readJSON('appointments.json', []);
    const due = list.filter(a => a.status === 'confirme' && a.date === tomorrow && !a.reminderSent && a.email);
    for (const a of due) {
      // confirmé il y a moins de 12 h : l'e-mail de confirmation vient de partir, pas de doublon
      if (a.confirmedAt && Date.now() - new Date(a.confirmedAt) < 12 * 3600e3) { a.reminderSent = 'confirmation'; continue; }
      const res = await mailer.send({
        to: a.email, replyTo: s.notifyEmail, attachments: [icsAttachment(a)],
        subject: `Rappel : rendez-vous demain à ${fmtTime(a.time)} – P.A Couverture`,
        mail: {
          eyebrow: 'Rappel de rendez-vous', title: `Rappel : ${a.kind.toLowerCase()} demain à ${fmtTime(a.time)}`,
          intro: `Bonjour ${a.nom},\n\nNous vous rappelons notre rendez-vous de demain. Merci de vous assurer que l'accès à la toiture (ou au lieu des travaux) sera possible.`,
          rows: [['Date', frDate(a.date)], ['Heure', fmtTime(a.time)], ['Adresse', a.adresse], ['Type', a.kind]],
          note: `Un empêchement ? Prévenez-nous dès que possible au ${mailer.PHONE} ou en répondant à cet e-mail. Le fichier joint ajoute le rendez-vous à votre agenda.`,
        },
      });
      if (res.sent) a.reminderSent = new Date().toISOString();
    }
    // l'artisan reçoit le programme du lendemain (une fois par jour)
    const tomorrowAll = list.filter(a => a.status === 'confirme' && a.date === tomorrow).sort((x, y) => x.time.localeCompare(y.time));
    const meta = readJSON('reminders.json', {});
    const mine = require('./events').list().filter(e => e.date === tomorrow).sort((x, y) => (x.start || '').localeCompare(y.start || ''));
    if (r.dailySummary && (tomorrowAll.length || mine.length) && meta.summaryFor !== tomorrow) {
      const rows = tomorrowAll.map(a => [fmtTime(a.time), `${a.nom} — ${a.adresse || 'adresse non précisée'} — ${a.tel}`])
        .concat(mine.map(e => [e.allDay ? 'Journée' : fmtTime(e.start), `${e.title}${e.location ? ' — ' + e.location : ''} (agenda perso)`]))
        .sort((x, y) => x[0].localeCompare(y[0], 'fr', { numeric: true }));
      const n = rows.length;
      const res = await mailer.send({
        to: s.notifyEmail, subject: `Votre programme de demain (${n}) – ${frDate(tomorrow)}`,
        mail: {
          eyebrow: 'Programme de demain', footnote: 'Programme automatique de votre agenda (tableau de bord du site).', title: `${n} rendez-vous demain`,
          intro: `Voici votre programme du ${frDate(tomorrow)}.${tomorrowAll.length ? ' Les clients ont reçu leur rappel.' : ''}`,
          rows,
          button: s.siteUrl ? { label: 'Ouvrir mon agenda', url: s.siteUrl + '/admin/tableau-de-bord#agenda' } : null,
        },
      });
      let smsOk = false;
      if (s.sms.daily && sms.configured()) smsOk = (await sms.send(`Demain ${shortDate(tomorrow)} : ` + rows.map(([t, v]) => `${t} ${v.split(' — ')[0]}`).join(' / '))).sent;
      if (res.sent || smsOk) writeJSON('reminders.json', { ...meta, summaryFor: tomorrow });
    }
    if (due.length) writeJSON('appointments.json', mergeReminders(due));
  } catch (e) { console.error('Rappels :', e.message); }
  finally { running = false; }
}
// relit le fichier au moment d'écrire (un rendez-vous a pu être modifié pendant l'envoi)
function mergeReminders(done) {
  const sent = new Map(done.filter(a => a.reminderSent).map(a => [a.id, a.reminderSent]));
  return readJSON('appointments.json', []).map(a => (sent.has(a.id) && !a.reminderSent ? { ...a, reminderSent: sent.get(a.id) } : a));
}
function start() { setTimeout(run, 30e3); setInterval(run, 5 * 60e3).unref(); }
module.exports = { start, run, icsAttachment };
