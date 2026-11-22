const { readJSON, writeJSON } = require('./store');

const T = /^([01]\d|2[0-3]):[0-5]\d$/;
const D = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULTS = {
  announcement: { enabled: false, text: '', tone: 'info' },
  booking: {
    enabled: true, slotMinutes: 60, minNoticeDays: 4, maxDaysAhead: 60, confirmDaysBefore: 3,
    weekly: {
      0: [], 6: [],
      1: [['09:00', '12:00'], ['14:00', '17:00']], 2: [['09:00', '12:00'], ['14:00', '17:00']],
      3: [['09:00', '12:00'], ['14:00', '17:00']], 4: [['09:00', '12:00'], ['14:00', '17:00']],
      5: [['09:00', '12:00'], ['14:00', '17:00']],
    },
    closed: [],
  },
  reviews: { googleUrl: '' },
  notifyEmail: 'pro.ap.couverture@gmail.com',
  siteUrl: '',
};

function get() {
  const s = readJSON('settings.json', {});
  const b = s.booking || {};
  return {
    announcement: { ...DEFAULTS.announcement, ...(s.announcement || {}) },
    booking: { ...DEFAULTS.booking, ...b, weekly: { ...DEFAULTS.booking.weekly, ...(b.weekly || {}) }, closed: b.closed || [] },
    reviews: { ...DEFAULTS.reviews, ...(s.reviews || {}) },
    notifyEmail: s.notifyEmail || DEFAULTS.notifyEmail,
    siteUrl: s.siteUrl || '',
  };
}

const int = (v, min, max, def) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def; };
const str = (v, n) => String(v == null ? '' : v).slice(0, n).trim();
const url = v => { v = str(v, 500); return /^https?:\/\/[^\s]+$/i.test(v) ? v : ''; };

// valide et enregistre les réglages envoyés depuis le tableau de bord
function save(input) {
  const cur = get();
  const out = JSON.parse(JSON.stringify(cur));
  if (input.announcement) {
    out.announcement = {
      enabled: Boolean(input.announcement.enabled),
      text: str(input.announcement.text, 240),
      tone: ['info', 'warn'].includes(input.announcement.tone) ? input.announcement.tone : 'info',
    };
  }
  if (input.booking) {
    const b = input.booking, o = out.booking;
    o.enabled = b.enabled !== false;
    o.slotMinutes = int(b.slotMinutes, 15, 240, o.slotMinutes);
    o.minNoticeDays = int(b.minNoticeDays, 0, 30, o.minNoticeDays);
    o.maxDaysAhead = int(b.maxDaysAhead, 7, 180, o.maxDaysAhead);
    o.confirmDaysBefore = int(b.confirmDaysBefore, 0, 14, o.confirmDaysBefore);
    if (b.weekly) {
      for (let d = 0; d < 7; d++) {
        const ranges = Array.isArray(b.weekly[d]) ? b.weekly[d] : [];
        o.weekly[d] = ranges.filter(r => Array.isArray(r) && T.test(r[0]) && T.test(r[1]) && r[0] < r[1]).map(r => [r[0], r[1]]);
      }
    }
    if (Array.isArray(b.closed)) o.closed = [...new Set(b.closed.map(x => str(x, 10)).filter(x => D.test(x)))].sort();
  }
  if (input.reviews) out.reviews.googleUrl = url(input.reviews.googleUrl);
  if ('notifyEmail' in input) {
    const e = str(input.notifyEmail, 120);
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.notifyEmail = e;
  }
  if ('siteUrl' in input) out.siteUrl = url(input.siteUrl).replace(/\/+$/, '');
  writeJSON('settings.json', out);
  return out;
}
module.exports = { get, save };
