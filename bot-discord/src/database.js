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
