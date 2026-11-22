// Calcul des créneaux de rendez-vous (fuseau Europe/Paris)
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = ds => new Date(ds + 'T12:00:00Z').getUTCDay();
const toMin = t => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10);
const fromMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

function timesFor(date, b) {
  if (b.closed.includes(date)) return [];
  const out = [];
  for (const [s, e] of b.weekly[dow(date)] || []) {
    for (let m = toMin(s); m + b.slotMinutes <= toMin(e); m += b.slotMinutes) out.push(fromMin(m));
  }
  return out;
}
// appts : liste des rendez-vous (les « en_attente » et « confirme » bloquent le créneau)
function availability(settings, appts) {
  const b = settings.booking;
  if (!b.enabled) return [];
  const taken = new Set(appts.filter(a => a.status === 'en_attente' || a.status === 'confirme').map(a => a.date + ' ' + a.time));
  const today = parisToday(), days = [];
  for (let i = b.minNoticeDays; i <= b.maxDaysAhead; i++) {
    const date = addDays(today, i);
    const times = timesFor(date, b).filter(t => !taken.has(date + ' ' + t));
    if (times.length) days.push({ date, times });
  }
  return days;
}
module.exports = { availability, addDays, parisToday };
