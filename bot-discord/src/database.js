import crypto from "node:crypto";
import Database from "better-sqlite3";
import session from "express-session";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig, sanitizeConfig } from "./config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "app.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");   // plusieurs processus (bots clients) partagent la base
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tickets (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS tickets_user_status ON tickets(guild_id, user_id, status);
  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL DEFAULT '',
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    embed_color TEXT NOT NULL DEFAULT '#3566a6',
    image_url TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    ends_at INTEGER,
    closed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS polls_guild_created ON polls(guild_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    voted_at INTEGER NOT NULL,
    PRIMARY KEY(poll_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS poll_vote_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    voted_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS poll_vote_history_poll ON poll_vote_history(poll_id, voted_at DESC);
  CREATE TABLE IF NOT EXISTS giveaways (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL DEFAULT '',
    prize TEXT NOT NULL,
    winners_count INTEGER NOT NULL,
    embed_color TEXT NOT NULL DEFAULT '#3566a6',
    image_url TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    ended_at INTEGER,
    winners_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS giveaways_guild_created ON giveaways(guild_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY(giveaway_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS giveaway_entries_giveaway ON giveaway_entries(giveaway_id);
  CREATE TABLE IF NOT EXISTS web_sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS web_sessions_expires ON web_sessions(expires);
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL DEFAULT '',
    actor_name TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS logs_guild_at ON logs(guild_id, at DESC);
  CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS message_templates_guild ON message_templates(guild_id, updated_at DESC);
  CREATE TABLE IF NOT EXISTS sent_messages (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    sent_by TEXT NOT NULL DEFAULT '',
    sent_at INTEGER NOT NULL,
    edited_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS sent_messages_guild ON sent_messages(guild_id, sent_at DESC);
  CREATE TABLE IF NOT EXISTS mod_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT '',
    mod_id TEXT NOT NULL DEFAULT '',
    mod_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    duration INTEGER,
    at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS mod_cases_guild ON mod_cases(guild_id, at DESC);
  CREATE INDEX IF NOT EXISTS mod_cases_user ON mod_cases(guild_id, user_id);
  CREATE TABLE IF NOT EXISTS levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT '',
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0,
    messages INTEGER NOT NULL DEFAULT 0,
    last_xp_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(guild_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS levels_rank ON levels(guild_id, xp DESC);
  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    staff_note TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS suggestions_guild ON suggestions(guild_id, at DESC);
  CREATE TABLE IF NOT EXISTS suggestion_votes (
    suggestion_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    value INTEGER NOT NULL,
    PRIMARY KEY(suggestion_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS temp_voice (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS custom_bots (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    app_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    token_enc TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bot_guilds (
    guild_id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ticket_counters (
    guild_id TEXT NOT NULL,
    type_id TEXT NOT NULL,
    last INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(guild_id, type_id)
  );
`);

const ticketColumns = new Set(db.prepare("PRAGMA table_info(tickets)").all().map(column => column.name));
if (!ticketColumns.has("claimed_by")) db.exec("ALTER TABLE tickets ADD COLUMN claimed_by TEXT");
if (!ticketColumns.has("ticket_type")) db.exec("ALTER TABLE tickets ADD COLUMN ticket_type TEXT NOT NULL DEFAULT ''");
if (!ticketColumns.has("number")) db.exec("ALTER TABLE tickets ADD COLUMN number INTEGER");
if (!ticketColumns.has("delete_at")) db.exec("ALTER TABLE tickets ADD COLUMN delete_at INTEGER");
for (const table of ["polls", "giveaways"]) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
  if (!columns.has("embed_color")) db.exec(`ALTER TABLE ${table} ADD COLUMN embed_color TEXT NOT NULL DEFAULT '#3566a6'`);
  if (!columns.has("image_url")) db.exec(`ALTER TABLE ${table} ADD COLUMN image_url TEXT NOT NULL DEFAULT ''`);
}

export function getGuildConfig(guildId) {
  const row = db.prepare("SELECT config_json FROM guild_configs WHERE guild_id = ?").get(guildId);
  if (!row) return structuredClone(defaultConfig);
  try { return sanitizeConfig(JSON.parse(row.config_json)); }
  catch { return structuredClone(defaultConfig); }
}

export function saveGuildConfig(guildId, config) {
  db.prepare(`INSERT INTO guild_configs(guild_id, config_json, updated_at)
    VALUES(?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP`)
    .run(guildId, JSON.stringify(sanitizeConfig(config)));
}

export function listConfiguredGuildIds() {
  return db.prepare("SELECT guild_id FROM guild_configs").all().map(row => row.guild_id);
}

export function getOpenTicket(guildId, userId) {
  return db.prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'")
    .get(guildId, userId);
}

export function getTicketByChannel(channelId) {
  return db.prepare("SELECT channel_id, guild_id, user_id, status, claimed_by, ticket_type, created_at FROM tickets WHERE channel_id = ?")
    .get(channelId);
}

export function addTicket(channelId, guildId, userId, ticketType = "") {
  db.prepare("INSERT INTO tickets(channel_id, guild_id, user_id, status, ticket_type) VALUES(?, ?, ?, 'open', ?)")
    .run(channelId, guildId, userId, ticketType);
}

export function closeTicket(channelId) {
  db.prepare("UPDATE tickets SET status = 'closed' WHERE channel_id = ?").run(channelId);
}

export function reopenTicket(channelId) {
  db.prepare("UPDATE tickets SET status = 'open' WHERE channel_id = ?").run(channelId);
}

export function claimTicket(channelId, userId) {
  db.prepare("UPDATE tickets SET claimed_by = ? WHERE channel_id = ? AND status = 'open'").run(userId, channelId);
}

export function listOpenTickets() {
  return db.prepare("SELECT channel_id, guild_id, user_id, ticket_type, claimed_by, created_at FROM tickets WHERE status = 'open'").all();
}

export function createPollRecord(poll) {
  db.prepare(`INSERT INTO polls(id, guild_id, channel_id, question, options_json, embed_color, image_url, created_by, created_at, ends_at)
    VALUES(@id, @guildId, @channelId, @question, @optionsJson, @embedColor, @imageUrl, @createdBy, @createdAt, @endsAt)`).run(poll);
}

export function setPollMessageId(id, messageId) {
  db.prepare("UPDATE polls SET message_id = ? WHERE id = ?").run(messageId, id);
}

export function deletePollRecord(id) {
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM poll_vote_history WHERE poll_id = ?").run(id);
    db.prepare("DELETE FROM poll_votes WHERE poll_id = ?").run(id);
    db.prepare("DELETE FROM polls WHERE id = ?").run(id);
  });
  remove();
}

export function getPoll(id) {
  const row = db.prepare("SELECT * FROM polls WHERE id = ?").get(id);
  return row ? { ...row, options: JSON.parse(row.options_json) } : null;
}

export function listPolls(guildId, limit = 30) {
  return db.prepare("SELECT * FROM polls WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?").all(guildId, limit)
    .map(row => ({ ...row, options: JSON.parse(row.options_json) }));
}

export function listDuePolls(now = Date.now()) {
  return db.prepare("SELECT * FROM polls WHERE closed_at IS NULL AND ends_at IS NOT NULL AND ends_at <= ?").all(now)
    .map(row => ({ ...row, options: JSON.parse(row.options_json) }));
}

export function getPollVoteCounts(pollId) {
  return db.prepare("SELECT option_index, COUNT(*) AS count FROM poll_votes WHERE poll_id = ? GROUP BY option_index").all(pollId);
}

export function getPollVoteHistory(pollId, limit = 100) {
  return db.prepare("SELECT user_id, option_index, voted_at FROM poll_vote_history WHERE poll_id = ? ORDER BY voted_at DESC LIMIT ?").all(pollId, limit);
}

export function getPollVoteHistoryCount(pollId) {
  return db.prepare("SELECT COUNT(*) AS count FROM poll_vote_history WHERE poll_id = ?").get(pollId).count;
}

export function castPollVote(pollId, userId, optionIndex) {
  const vote = db.transaction(() => {
    const poll = db.prepare("SELECT closed_at, ends_at FROM polls WHERE id = ?").get(pollId);
    if (!poll || poll.closed_at || (poll.ends_at && poll.ends_at <= Date.now())) return false;
    const timestamp = Date.now();
    db.prepare(`INSERT INTO poll_votes(poll_id, user_id, option_index, voted_at) VALUES(?, ?, ?, ?)
      ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index, voted_at = excluded.voted_at`)
      .run(pollId, userId, optionIndex, timestamp);
    db.prepare("INSERT INTO poll_vote_history(poll_id, user_id, option_index, voted_at) VALUES(?, ?, ?, ?)")
      .run(pollId, userId, optionIndex, timestamp);
    return true;
  });
  return vote.immediate();
}

export function closePollRecord(pollId, closedAt = Date.now()) {
  return db.prepare("UPDATE polls SET closed_at = COALESCE(closed_at, ?) WHERE id = ? AND closed_at IS NULL").run(closedAt, pollId).changes > 0;
}

export function createGiveawayRecord(item) {
  db.prepare(`INSERT INTO giveaways(id, guild_id, channel_id, prize, winners_count, embed_color, image_url, created_by, created_at, ends_at)
    VALUES(@id, @guildId, @channelId, @prize, @winnersCount, @embedColor, @imageUrl, @createdBy, @createdAt, @endsAt)`).run(item);
}

export function setGiveawayMessageId(id, messageId) {
  db.prepare("UPDATE giveaways SET message_id = ? WHERE id = ?").run(messageId, id);
}

export function deleteGiveawayRecord(id) {
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM giveaway_entries WHERE giveaway_id = ?").run(id);
    db.prepare("DELETE FROM giveaways WHERE id = ?").run(id);
  });
  remove();
}

export function getGiveaway(id) {
  return db.prepare("SELECT * FROM giveaways WHERE id = ?").get(id) || null;
}

export function listGiveaways(guildId, limit = 30) {
  return db.prepare(`SELECT g.*, COUNT(e.user_id) AS entries_count FROM giveaways g
    LEFT JOIN giveaway_entries e ON e.giveaway_id = g.id
    WHERE g.guild_id = ? GROUP BY g.id ORDER BY g.created_at DESC LIMIT ?`).all(guildId, limit);
}

export function listDueGiveaways(now = Date.now()) {
  return db.prepare("SELECT * FROM giveaways WHERE ended_at IS NULL AND ends_at <= ?").all(now);
}

export function enterGiveaway(id, userId) {
  return db.prepare(`INSERT OR IGNORE INTO giveaway_entries(giveaway_id, user_id, joined_at)
    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM giveaways WHERE id = ? AND ended_at IS NULL AND ends_at > ?)`)
    .run(id, userId, Date.now(), id, Date.now()).changes > 0;
}

export function listGiveawayEntrants(id) {
  return db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?").all(id).map(row => row.user_id);
}

export function getGiveawayEntryCount(id) {
  return db.prepare("SELECT COUNT(*) AS count FROM giveaway_entries WHERE giveaway_id = ?").get(id).count;
}

export function finalizeGiveaway(id, winnerIds, endedAt = Date.now()) {
  return db.prepare("UPDATE giveaways SET ended_at = ?, winners_json = ? WHERE id = ? AND ended_at IS NULL")
    .run(endedAt, JSON.stringify(winnerIds), id).changes > 0;
}

export function drawGiveaway(id, chooseWinners, endedAt = Date.now()) {
  const draw = db.transaction(() => {
    const giveaway = db.prepare("SELECT winners_count, ended_at, winners_json FROM giveaways WHERE id = ?").get(id);
    if (!giveaway) return { ended: false, winners: [] };
    if (giveaway.ended_at) return { ended: false, winners: JSON.parse(giveaway.winners_json || "[]") };
    const entrants = db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?").all(id).map(row => row.user_id);
    const winners = chooseWinners(entrants, giveaway.winners_count);
    db.prepare("UPDATE giveaways SET ended_at = ?, winners_json = ? WHERE id = ? AND ended_at IS NULL")
      .run(endedAt, JSON.stringify(winners), id);
    return { ended: true, winners };
  });
  return draw.immediate();
}

export class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    this.getStmt = database.prepare("SELECT sess, expires FROM web_sessions WHERE sid = ?");
    this.setStmt = database.prepare(`INSERT INTO web_sessions(sid, sess, expires) VALUES(?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`);
    this.destroyStmt = database.prepare("DELETE FROM web_sessions WHERE sid = ?");
    this.touchStmt = database.prepare("UPDATE web_sessions SET expires = ? WHERE sid = ?");
    this.cleanupStmt = database.prepare("DELETE FROM web_sessions WHERE expires <= ?");
    this.timer = setInterval(() => this.cleanupStmt.run(Date.now()), 60 * 60 * 1000).unref();
  }
  get(sid, callback) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) { this.destroyStmt.run(sid); return callback(null, null); }
      callback(null, JSON.parse(row.sess));
    } catch (error) { callback(error); }
  }
  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86_400_000;
      this.setStmt.run(sid, JSON.stringify(sess), expires);
      callback(null);
    } catch (error) { callback(error); }
  }
  destroy(sid, callback = () => {}) {
    try { this.destroyStmt.run(sid); callback(null); } catch (error) { callback(error); }
  }
  touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86_400_000;
      this.touchStmt.run(expires, sid);
      callback(null);
    } catch (error) { callback(error); }
  }
}

/* ---------- Numéro de ticket par type (boutique-1, boutique-2…) ---------- */
export function nextTicketNumber(guildId, typeId) {
  return db.transaction(() => {
    db.prepare("INSERT INTO ticket_counters(guild_id, type_id, last) VALUES(?, ?, 0) ON CONFLICT(guild_id, type_id) DO NOTHING").run(guildId, typeId);
    db.prepare("UPDATE ticket_counters SET last = last + 1 WHERE guild_id = ? AND type_id = ?").run(guildId, typeId);
    return db.prepare("SELECT last FROM ticket_counters WHERE guild_id = ? AND type_id = ?").get(guildId, typeId).last;
  })();
}
export function setTicketNumber(channelId, number) {
  db.prepare("UPDATE tickets SET number = ? WHERE channel_id = ?").run(number, channelId);
}

/* ---------- Journal d'activité (consultable dans le panneau) ---------- */
export const LOG_CATEGORIES = ["membres", "tickets", "messages", "moderation", "salons", "commandes", "animations", "panneau"];
const MAX_LOGS_PER_GUILD = 20000;
let logInserts = 0;
export function addLog(guildId, category, action, details = "", actor = null) {
  if (!guildId) return;
  try {
    db.prepare("INSERT INTO logs(guild_id, at, category, action, actor_id, actor_name, details) VALUES(?, ?, ?, ?, ?, ?, ?)")
      .run(String(guildId), Date.now(), category, String(action).slice(0, 120), String(actor?.id || ""), String(actor?.name || "").slice(0, 100), String(details || "").slice(0, 1500));
    if (++logInserts % 500 === 0) {   // ménage : 90 jours et 20 000 lignes par serveur au maximum
      db.prepare("DELETE FROM logs WHERE at < ?").run(Date.now() - 90 * 864e5);
      db.prepare(`DELETE FROM logs WHERE id IN (SELECT id FROM logs WHERE guild_id = ? ORDER BY at DESC LIMIT -1 OFFSET ${MAX_LOGS_PER_GUILD})`).run(String(guildId));
    }
  } catch (error) { console.error("Écriture du journal impossible :", error.message); }
}
export function listLogs(guildId, { category = "", q = "", before = 0, limit = 50 } = {}) {
  const where = ["guild_id = ?"], args = [guildId];
  if (category && LOG_CATEGORIES.includes(category)) { where.push("category = ?"); args.push(category); }
  if (before) { where.push("at < ?"); args.push(Number(before)); }
  if (q) { where.push("(action LIKE ? OR details LIKE ? OR actor_name LIKE ?)"); const like = `%${String(q).slice(0, 80).replace(/[%_]/g, "")}%`; args.push(like, like, like); }
  return db.prepare(`SELECT id, at, category, action, actor_id, actor_name, details FROM logs WHERE ${where.join(" AND ")} ORDER BY at DESC, id DESC LIMIT ?`).all(...args, Math.min(200, Math.max(1, limit)));
}
export function logCounts(guildId, since = Date.now() - 864e5) {
  return db.prepare("SELECT category, COUNT(*) AS n FROM logs WHERE guild_id = ? AND at >= ? GROUP BY category").all(guildId, since);
}

export function setTicketDeleteAt(channelId, at) {
  db.prepare("UPDATE tickets SET delete_at = ? WHERE channel_id = ?").run(at, channelId);
}
export function listPendingTicketDeletes() {
  return db.prepare("SELECT channel_id, guild_id, delete_at FROM tickets WHERE delete_at IS NOT NULL").all();
}

/* Chiffres publics de la page d'accueil (aucune donnée personnelle) */
export function publicCounts() {
  const one = sql => db.prepare(sql).get().n || 0;
  return {
    tickets: one("SELECT COALESCE(SUM(last), 0) AS n FROM ticket_counters") || one("SELECT COUNT(*) AS n FROM tickets"),
    events: one("SELECT COUNT(*) AS n FROM logs"),
    commands: one("SELECT COUNT(*) AS n FROM logs WHERE category = 'commandes'"),
    polls: one("SELECT COUNT(*) AS n FROM polls"),
    giveaways: one("SELECT COUNT(*) AS n FROM giveaways")
  };
}

/* ---------- Réglages globaux du bot (statut animé…) ---------- */
export const PRESENCE_TYPES = ["playing", "watching", "listening", "competing", "custom"];
export const defaultPresence = {
  enabled: true, status: "online", interval: 20,
  items: [
    { type: "custom", text: "Surveille {membres} membres" },
    { type: "custom", text: "{tickets_ouverts} tickets ouverts en ce moment" },
    { type: "custom", text: "Présent sur {serveurs} serveurs" },
    { type: "watching", text: "bot.optidevis.pro" }
  ]
};
export function sanitizePresence(input = {}) {
  const items = (Array.isArray(input.items) ? input.items : []).slice(0, 15)
    .map(item => ({ type: PRESENCE_TYPES.includes(item?.type) ? item.type : "watching", text: String(item?.text ?? "").trim().slice(0, 120) }))
    .filter(item => item.text);
  return {
    enabled: input.enabled !== false,
    status: ["online", "idle", "dnd"].includes(input.status) ? input.status : "online",
    interval: Math.min(600, Math.max(15, Number.parseInt(input.interval, 10) || 20)),
    items: items.length ? items : structuredClone(defaultPresence.items)
  };
}
/* statut propre à chaque bot : « presence » pour le bot principal, « presence:<id> » pour un bot client */
const presenceKey = (botId = process.env.BOT_INSTANCE_ID || "main") => (botId === "main" ? "presence" : `presence:${botId}`);
export function getPresenceSettings(botId) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(presenceKey(botId));
  if (!row) return structuredClone(defaultPresence);
  try { return sanitizePresence(JSON.parse(row.value)); } catch { return structuredClone(defaultPresence); }
}
export function savePresenceSettings(value, botId) {
  const clean = sanitizePresence(value);
  db.prepare("INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(presenceKey(botId), JSON.stringify(clean));
  return clean;
}

/* ---------- Modèles de messages et messages envoyés ---------- */
const parseRow = row => (row ? { ...row, data: JSON.parse(row.data_json), data_json: undefined } : null);
export function listTemplates(guildId) {
  return db.prepare("SELECT * FROM message_templates WHERE guild_id = ? ORDER BY updated_at DESC LIMIT 100").all(guildId).map(parseRow);
}
export function getTemplate(guildId, id) {
  return parseRow(db.prepare("SELECT * FROM message_templates WHERE guild_id = ? AND id = ?").get(guildId, id));
}
export function saveTemplate(guildId, { id, name, data, by }) {
  const now = Date.now();
  if (id && getTemplate(guildId, id)) {
    db.prepare("UPDATE message_templates SET name = ?, data_json = ?, updated_at = ? WHERE guild_id = ? AND id = ?").run(name, JSON.stringify(data), now, guildId, id);
    return getTemplate(guildId, id);
  }
  if (db.prepare("SELECT COUNT(*) AS n FROM message_templates WHERE guild_id = ?").get(guildId).n >= 100) throw Object.assign(new Error("100 modèles au maximum : supprime-en un."), { status: 400 });
  const newId = crypto.randomUUID();
  db.prepare("INSERT INTO message_templates(id, guild_id, name, data_json, created_by, updated_at) VALUES(?, ?, ?, ?, ?, ?)").run(newId, guildId, name, JSON.stringify(data), by || "", now);
  return getTemplate(guildId, newId);
}
export function deleteTemplate(guildId, id) {
  return db.prepare("DELETE FROM message_templates WHERE guild_id = ? AND id = ?").run(guildId, id).changes > 0;
}
export function recordSentMessage(guildId, { channelId, messageId, data, by }) {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO sent_messages(id, guild_id, channel_id, message_id, data_json, sent_by, sent_at) VALUES(?, ?, ?, ?, ?, ?, ?)").run(id, guildId, channelId, messageId, JSON.stringify(data), by || "", Date.now());
  db.prepare("DELETE FROM sent_messages WHERE guild_id = ? AND id NOT IN (SELECT id FROM sent_messages WHERE guild_id = ? ORDER BY sent_at DESC LIMIT 200)").run(guildId, guildId);
  return id;
}
export function listSentMessages(guildId, limit = 40) {
  return db.prepare("SELECT * FROM sent_messages WHERE guild_id = ? ORDER BY sent_at DESC LIMIT ?").all(guildId, limit).map(parseRow);
}
export function getSentMessage(guildId, id) {
  return parseRow(db.prepare("SELECT * FROM sent_messages WHERE guild_id = ? AND id = ?").get(guildId, id));
}
export function updateSentMessage(guildId, id, data) {
  db.prepare("UPDATE sent_messages SET data_json = ?, edited_at = ? WHERE guild_id = ? AND id = ?").run(JSON.stringify(data), Date.now(), guildId, id);
}
export function deleteSentMessage(guildId, id) {
  db.prepare("DELETE FROM sent_messages WHERE guild_id = ? AND id = ?").run(guildId, id);
}

/* ---------- Modération : sanctions (cases) ---------- */
export function addCase(guildId, c) {
  const r = db.prepare("INSERT INTO mod_cases(guild_id, user_id, user_name, mod_id, mod_name, type, reason, duration, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(guildId, c.userId, c.userName || "", c.modId || "", c.modName || "", c.type, String(c.reason || "").slice(0, 500), c.duration || null, Date.now());
  return Number(r.lastInsertRowid);
}
export function listCases(guildId, { userId = "", limit = 50 } = {}) {
  return userId
    ? db.prepare("SELECT * FROM mod_cases WHERE guild_id = ? AND user_id = ? ORDER BY at DESC LIMIT ?").all(guildId, userId, limit)
    : db.prepare("SELECT * FROM mod_cases WHERE guild_id = ? ORDER BY at DESC LIMIT ?").all(guildId, limit);
}
export function activeWarnCount(guildId, userId) {
  return db.prepare("SELECT COUNT(*) AS n FROM mod_cases WHERE guild_id = ? AND user_id = ? AND type = 'warn' AND active = 1").get(guildId, userId).n;
}
export function revokeCase(guildId, caseId) {
  return db.prepare("UPDATE mod_cases SET active = 0 WHERE guild_id = ? AND id = ? AND active = 1").run(guildId, caseId).changes > 0;
}
export function clearWarns(guildId, userId) {
  return db.prepare("UPDATE mod_cases SET active = 0 WHERE guild_id = ? AND user_id = ? AND type = 'warn' AND active = 1").run(guildId, userId).changes;
}
export function caseStats(guildId) {
  return db.prepare("SELECT type, COUNT(*) AS n FROM mod_cases WHERE guild_id = ? GROUP BY type").all(guildId);
}

/* ---------- Niveaux ---------- */
export const xpForLevel = level => 5 * level * level + 50 * level + 100;          // XP pour passer du niveau level à level+1
export function levelFromXp(xp) { let level = 0, rest = xp; while (rest >= xpForLevel(level)) { rest -= xpForLevel(level); level++; } return { level, current: rest, needed: xpForLevel(level) }; }
export function getLevelRow(guildId, userId) {
  return db.prepare("SELECT * FROM levels WHERE guild_id = ? AND user_id = ?").get(guildId, userId) || { guild_id: guildId, user_id: userId, xp: 0, level: 0, messages: 0, last_xp_at: 0 };
}
export function addXp(guildId, userId, userName, amount) {
  db.prepare(`INSERT INTO levels(guild_id, user_id, user_name, xp, level, messages, last_xp_at) VALUES(?, ?, ?, ?, 0, 1, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp, messages = messages + 1, last_xp_at = excluded.last_xp_at, user_name = excluded.user_name`)
    .run(guildId, userId, userName, amount, Date.now());
  const row = getLevelRow(guildId, userId), info = levelFromXp(row.xp), up = info.level > row.level;
  if (up) db.prepare("UPDATE levels SET level = ? WHERE guild_id = ? AND user_id = ?").run(info.level, guildId, userId);
  return { ...row, level: info.level, levelUp: up, previous: row.level };
}
export function countMessage(guildId, userId, userName) {
  db.prepare(`INSERT INTO levels(guild_id, user_id, user_name, messages) VALUES(?, ?, ?, 1) ON CONFLICT(guild_id, user_id) DO UPDATE SET messages = messages + 1, user_name = excluded.user_name`).run(guildId, userId, userName);
}
export function leaderboard(guildId, limit = 10, offset = 0) {
  return db.prepare("SELECT * FROM levels WHERE guild_id = ? AND xp > 0 ORDER BY xp DESC LIMIT ? OFFSET ?").all(guildId, limit, offset);
}
export function rankOf(guildId, userId) {
  const row = getLevelRow(guildId, userId);
  return db.prepare("SELECT COUNT(*) + 1 AS r FROM levels WHERE guild_id = ? AND xp > ?").get(guildId, row.xp).r;
}
export function resetLevels(guildId, userId = "") {
  return userId ? db.prepare("DELETE FROM levels WHERE guild_id = ? AND user_id = ?").run(guildId, userId).changes : db.prepare("DELETE FROM levels WHERE guild_id = ?").run(guildId).changes;
}
export function setUserXp(guildId, userId, xp) {
  const info = levelFromXp(Math.max(0, xp));
  db.prepare(`INSERT INTO levels(guild_id, user_id, xp, level) VALUES(?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level`).run(guildId, userId, Math.max(0, xp), info.level);
  return info.level;
}

/* ---------- Suggestions ---------- */
export function createSuggestion(guildId, s) {
  return Number(db.prepare("INSERT INTO suggestions(guild_id, channel_id, user_id, user_name, content, at) VALUES(?, ?, ?, ?, ?, ?)").run(guildId, s.channelId, s.userId, s.userName || "", s.content, Date.now()).lastInsertRowid);
}
export function setSuggestionMessage(id, messageId) { db.prepare("UPDATE suggestions SET message_id = ? WHERE id = ?").run(messageId, id); }
export function getSuggestion(id) { return db.prepare("SELECT * FROM suggestions WHERE id = ?").get(id); }
export function voteSuggestion(id, userId, value) {
  const current = db.prepare("SELECT value FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?").get(id, userId);
  if (current && current.value === value) { db.prepare("DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?").run(id, userId); return 0; }
  db.prepare("INSERT INTO suggestion_votes(suggestion_id, user_id, value) VALUES(?, ?, ?) ON CONFLICT(suggestion_id, user_id) DO UPDATE SET value = excluded.value").run(id, userId, value);
  return value;
}
export function suggestionVotes(id) {
  const r = db.prepare("SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM suggestion_votes WHERE suggestion_id = ?").get(id);
  return { up: r.up || 0, down: r.down || 0 };
}
export function setSuggestionStatus(id, status, note = "") { db.prepare("UPDATE suggestions SET status = ?, staff_note = ? WHERE id = ?").run(status, String(note).slice(0, 500), id); }
export function listSuggestions(guildId, limit = 50) {
  return db.prepare("SELECT * FROM suggestions WHERE guild_id = ? ORDER BY at DESC LIMIT ?").all(guildId, limit).map(s => ({ ...s, ...suggestionVotes(s.id) }));
}

/* ---------- Salons vocaux temporaires ---------- */
export function addTempVoice(channelId, guildId, ownerId) { db.prepare("INSERT OR REPLACE INTO temp_voice(channel_id, guild_id, owner_id, created_at) VALUES(?, ?, ?, ?)").run(channelId, guildId, ownerId, Date.now()); }
export function getTempVoice(channelId) { return db.prepare("SELECT * FROM temp_voice WHERE channel_id = ?").get(channelId); }
export function removeTempVoice(channelId) { db.prepare("DELETE FROM temp_voice WHERE channel_id = ?").run(channelId); }
export function listTempVoice() { return db.prepare("SELECT * FROM temp_voice").all(); }

/* ---------- Bots clients (chaque client utilise son propre bot Discord) ---------- */
export function listCustomBots(ownerId = "") {
  return ownerId ? db.prepare("SELECT * FROM custom_bots WHERE owner_id = ? ORDER BY created_at").all(ownerId) : db.prepare("SELECT * FROM custom_bots ORDER BY created_at").all();
}
export function getCustomBot(id) { return db.prepare("SELECT * FROM custom_bots WHERE id = ?").get(id); }
export function getCustomBotByApp(appId) { return db.prepare("SELECT * FROM custom_bots WHERE app_id = ?").get(appId); }
export function saveCustomBot(b) {
  db.prepare(`INSERT INTO custom_bots(id, owner_id, owner_name, app_id, name, avatar, token_enc, enabled, created_at) VALUES(@id, @owner_id, @owner_name, @app_id, @name, @avatar, @token_enc, @enabled, @created_at)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, token_enc = excluded.token_enc, enabled = excluded.enabled, app_id = excluded.app_id`).run(b);
}
export function deleteCustomBot(id) { db.prepare("DELETE FROM custom_bots WHERE id = ?").run(id); db.prepare("DELETE FROM bot_guilds WHERE bot_id = ?").run(id); db.prepare("DELETE FROM app_settings WHERE key = ?").run(`presence:${id}`); }
/* serveurs pris en charge par un bot client : le bot principal les ignore (pas de double réponse) */
export function claimGuild(guildId, botId) { db.prepare("INSERT INTO bot_guilds(guild_id, bot_id) VALUES(?, ?) ON CONFLICT(guild_id) DO UPDATE SET bot_id = excluded.bot_id").run(guildId, botId); }
export function releaseGuild(guildId, botId) { db.prepare("DELETE FROM bot_guilds WHERE guild_id = ? AND bot_id = ?").run(guildId, botId); }
export function releaseAllGuilds(botId) { db.prepare("DELETE FROM bot_guilds WHERE bot_id = ?").run(botId); }
export function claimedGuilds() { return db.prepare("SELECT guild_id, bot_id FROM bot_guilds").all(); }
export function getSetting(key, fallback) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  if (!row) return fallback; try { return JSON.parse(row.value); } catch { return fallback; }
}
export function setSetting(key, value) { db.prepare("INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value)); }
