/* Gestion des bots clients : chaque client crée son propre bot sur le portail Discord et colle son jeton
   dans le panneau. Le jeton est chiffré, le bot tourne dans un processus séparé (worker.js), et le panneau
   envoie chaque action au bot qui sert le serveur concerné. Le bot principal continue de servir les autres serveurs. */
import { fork } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOp } from "./ops.js";
import { getCustomBot, getCustomBotByApp, listCustomBots, releaseAllGuilds, saveCustomBot, deleteCustomBot, getSetting, setSetting } from "./database.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY = crypto.createHash("sha256").update(String(process.env.BOT_TOKEN_KEY || process.env.SESSION_SECRET || "aero-bot")).digest();
export function encryptToken(token) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
function decryptToken(value) {
  const [iv, tag, enc] = String(value).split(".").map(x => Buffer.from(x, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/* ---------- Réglages de vente (propriétaire) ---------- */
export const defaultSales = { open: false, allowedUserIds: [], maxPerUser: 1, maxTotal: 10 };
export const salesSettings = () => ({ ...defaultSales, ...getSetting("custombots", {}) });
export function saveSalesSettings(input) {
  const ids = String(Array.isArray(input.allowedUserIds) ? input.allowedUserIds.join(",") : input.allowedUserIds || "").split(/[,\s]+/).filter(id => /^\d{17,20}$/.test(id)).slice(0, 500);
  const n = (v, a, b, f) => { const x = Number.parseInt(v, 10); return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : f; };
  const clean = { open: input.open === true, allowedUserIds: [...new Set(ids)], maxPerUser: n(input.maxPerUser, 1, 20, 1), maxTotal: n(input.maxTotal, 1, 100, 10) };
  setSetting("custombots", clean); return clean;
}

/* ---------- Vérification d'un jeton auprès de Discord ---------- */
const FLAG = { members: (1 << 14) | (1 << 15), content: (1 << 18) | (1 << 19) };
export async function inspectToken(token) {
  token = String(token || "").trim().replace(/^Bot\s+/i, "");
  if (!/^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(token)) throw new Error("Ce n’est pas un jeton de bot : copie-le dans le portail Discord, onglet Bot → Reset Token.");
  const get = async p => {
    const r = await fetch("https://discord.com/api/v10" + p, { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(15000) });
    if (r.status === 401) throw new Error("Discord refuse ce jeton : il est faux ou a été régénéré. Copie le nouveau jeton.");
    if (!r.ok) throw new Error(`Discord ne répond pas correctement (erreur ${r.status}).`);
    return r.json();
  };
  const app = await get("/applications/@me");
  const missing = [];
  if (!(app.flags & FLAG.members)) missing.push("Server Members Intent");
  if (!(app.flags & FLAG.content)) missing.push("Message Content Intent");
  const user = app.bot || await get("/users/@me");
  return { token, appId: app.id, name: user.username || app.name, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : "", missing };
}

/* ---------- Processus des bots ---------- */
const workers = new Map();      // id -> { child, pending, status, guilds, error, restarts, stopping }
const workerFile = path.join(here, "worker.js");
export function startBot(id) {
  const row = getCustomBot(id); if (!row || !row.enabled) return;
  stopBot(id, { keep: true });
  let token; try { token = decryptToken(row.token_enc); } catch { workers.set(id, { error: "Jeton illisible : enregistre-le à nouveau.", guilds: [] }); return; }
  const env = { ...process.env, DISCORD_TOKEN: token, BOT_INSTANCE_ID: id, DISCORD_CLIENT_ID: row.app_id, BOT_OWNER_IDS: row.owner_id };
  delete env.DISCORD_CLIENT_SECRET;
  const child = fork(workerFile, [], { env, execArgv: ["--max-old-space-size=200"], stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const w = { child, pending: new Map(), status: null, guilds: [], error: "", restarts: (workers.get(id)?.restarts || 0), stopping: false, startedAt: Date.now() };
  workers.set(id, w);
  child.on("message", m => {
    if (m?.type === "status") { w.status = m.status; w.guilds = m.guilds || []; w.error = ""; w.restarts = 0; }
    else if (m?.type === "fatal") { w.error = m.error; w.fatal = true; }
    else if (m?.type === "result") { const p = w.pending.get(m.rid); if (!p) return; w.pending.delete(m.rid); clearTimeout(p.timer); m.ok ? p.resolve(m.value) : p.reject(Object.assign(new Error(m.error), { gone: m.gone, expose: true, status: 400 })); }
  });
  child.on("exit", code => {
    if (!workers.has(id) || workers.get(id) === w) releaseAllGuilds(id);   // pas les serveurs d'un processus déjà relancé
    for (const p of w.pending.values()) { clearTimeout(p.timer); p.reject(new Error("Le bot s’est arrêté pendant l’opération.")); }
    w.pending.clear(); w.child = null; w.status = null; w.guilds = [];
    if (w.stopping || w.fatal || !getCustomBot(id)?.enabled) return;
    w.restarts++; w.error = `Redémarrage automatique (${w.restarts})…`;
    setTimeout(() => { if (workers.get(id) === w) startBot(id); }, Math.min(60_000, 5_000 * w.restarts));
    console.error(`Bot client ${id} arrêté (code ${code}) : redémarrage.`);
  });
}
export function stopBot(id, { keep = false } = {}) {
  const w = workers.get(id); if (!w) return;
  w.stopping = true;
  try { w.child?.kill("SIGTERM"); } catch { /* déjà arrêté */ }
  releaseAllGuilds(id);
  if (!keep) workers.delete(id);
}
export function startAllBots() {
  // après un arrêt brutal : on repart de zéro, chaque bot reprend ses serveurs une fois connecté
  for (const row of listCustomBots()) { releaseAllGuilds(row.id); if (row.enabled) startBot(row.id); }
}
export function stopAllBots() { for (const id of workers.keys()) stopBot(id); }
process.on("exit", stopAllBots);

function callWorker(id, op, args) {
  const w = workers.get(id);
  if (!w?.child) return Promise.reject(Object.assign(new Error("Le bot de ce serveur est hors ligne : redémarre-le dans « Mon bot personnalisé »."), { expose: true, status: 409 }));
  return new Promise((resolve, reject) => {
    const rid = crypto.randomUUID();
    const timer = setTimeout(() => { w.pending.delete(rid); reject(Object.assign(new Error("Le bot met trop de temps à répondre."), { expose: true, status: 504 })); }, 25_000);
    w.pending.set(rid, { resolve, reject, timer });
    w.child.send({ type: "op", rid, op, args });
  });
}
/* bot qui sert ce serveur : un bot client s'il y est, sinon le bot principal */
export function botForGuild(guildId) {
  for (const [id, w] of workers) if (w.child && w.guilds.some(g => g.id === guildId)) return id;
  return "main";
}
export function opsFor(guildId) {
  const id = botForGuild(guildId);
  return new Proxy({}, { get: (_, op) => (...args) => (id === "main" ? Promise.resolve().then(() => runOp(op, args)) : callWorker(id, op, args)) });
}
export const opsForBot = id => new Proxy({}, { get: (_, op) => (...args) => (id === "main" ? Promise.resolve().then(() => runOp(op, args)) : callWorker(id, op, args)) });
export function customGuild(guildId) {
  for (const [id, w] of workers) { const g = w.child && w.guilds.find(x => x.id === guildId); if (g) return { ...g, botId: id }; }
  return null;
}

/* ---------- Gestion depuis le panneau ---------- */
const inviteUrl = appId => `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: appId, scope: "bot applications.commands", permissions: "1099999603926" })}`;
export function describeBot(row) {
  const w = workers.get(row.id);
  return { id: row.id, name: row.name, avatar: row.avatar, appId: row.app_id, ownerId: row.owner_id, ownerName: row.owner_name, enabled: Boolean(row.enabled), createdAt: row.created_at,
    online: Boolean(w?.status?.ready), guilds: w?.guilds || [], members: w?.status?.members || 0, uptime: w?.status?.uptime || 0, ping: w?.status?.ping || 0,
    error: w?.error || "", inviteUrl: inviteUrl(row.app_id) };
}
export async function createBot({ token, ownerId, ownerName }) {
  const info = await inspectToken(token);
  if (info.appId === process.env.DISCORD_CLIENT_ID) throw new Error("C’est le jeton du bot principal : crée ton propre bot sur le portail Discord.");
  if (getCustomBotByApp(info.appId)) throw new Error("Ce bot est déjà enregistré.");
  const row = { id: crypto.randomBytes(6).toString("hex"), owner_id: ownerId, owner_name: ownerName || "", app_id: info.appId, name: info.name, avatar: info.avatar, token_enc: encryptToken(info.token), enabled: 1, created_at: Date.now() };
  saveCustomBot(row); startBot(row.id);
  return { bot: describeBot(row), missing: info.missing };
}
export async function replaceToken(id, token) {
  const row = getCustomBot(id), info = await inspectToken(token);
  if (info.appId !== row.app_id) throw new Error("Ce jeton appartient à un autre bot. Pour changer de bot, supprime celui-ci et ajoute le nouveau.");
  saveCustomBot({ ...row, token_enc: encryptToken(info.token), name: info.name, avatar: info.avatar, enabled: 1 });
  const w = workers.get(id); if (w) { w.fatal = false; w.restarts = 0; }
  startBot(id); return { missing: info.missing };
}
export function setBotEnabled(id, enabled) {
  const row = getCustomBot(id); saveCustomBot({ ...row, enabled: enabled ? 1 : 0 });
  if (enabled) { const w = workers.get(id); if (w) { w.fatal = false; w.restarts = 0; } startBot(id); } else stopBot(id);
}
export function removeBot(id) { stopBot(id); deleteCustomBot(id); }
export const runningCount = () => [...workers.values()].filter(w => w.child).length;
export function customTotals() {
  let guilds = 0, members = 0;
  for (const w of workers.values()) if (w.child) for (const g of w.guilds) { guilds++; members += g.memberCount || 0; }
  return { guilds, members };
}
