import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import {
  db, getGiveaway, getGuildConfig, getPoll, getPollVoteCounts, getPollVoteHistory, getPollVoteHistoryCount, listGiveaways, listPolls,
  saveGuildConfig, SQLiteSessionStore, listCases, caseStats, revokeCase, leaderboard, resetLevels, levelFromXp, listSuggestions, listTemplates, saveTemplate, deleteTemplate, recordSentMessage, listSentMessages, getSentMessage, updateSentMessage, deleteSentMessage, getPresenceSettings, savePresenceSettings, addLog, listLogs, logCounts, LOG_CATEGORIES, publicCounts
} from "./database.js";
import { sanitizeConfig } from "./config.js";
import { bot, fetchFiveMStatus, isBotOwner, renderPresenceText } from "./discord.js";
import {
  opsFor, opsForBot, customGuild, startAllBots, stopAllBots, describeBot, createBot, replaceToken, setBotEnabled, removeBot,
  salesSettings, saveSalesSettings, runningCount, customTotals
} from "./bots.js";
import { listCustomBots, getCustomBot } from "./database.js";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "SESSION_SECRET"];
function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  }
  catch { return false; }
}
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Configuration manquante : ${missing.join(", ")}. Copiez .env.example vers .env puis complétez les valeurs.`);
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 3000);
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl}/auth/callback`;
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const production = process.env.NODE_ENV === "production";
if (production) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    ...(production ? { upgradeInsecureRequests: [] } : {})
  }
} }));
const smallJson = express.json({ limit: "32kb" }), imageJson = express.json({ limit: "14mb" });
app.use((req, res, next) => (/^\/api\/guilds\/\d{17,20}\/profile$/.test(req.path) ? imageJson : smallJson)(req, res, next));
app.use(session({
  name: "atelier.sid",
  secret: process.env.SESSION_SECRET,
  store: new SQLiteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: production, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(publicDir, { maxAge: production ? "1h" : 0 }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: "draft-8", legacyHeaders: false });
app.use("/auth", loginLimiter);
app.use("/api", apiLimiter);

const panelActor = req => ({ id: req.session.user?.id || "", name: `${req.session.user?.username || "?"} (panneau)` });

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Connecte-toi avec Discord pour continuer." });
  next();
}

function requireCsrf(req, res, next) {
  const sent = req.get("x-csrf-token");
  const expected = req.session.csrfToken;
  if (!sent || !expected || sent.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return res.status(403).json({ error: "Session expirée. Recharge la page et réessaie." });
  }
  next();
}

function userCanManage(req, guildId) {
  const guild = req.session.guilds?.find(item => item.id === guildId);
  if (!guild) return false;
  try {
    const permissions = BigInt(guild.permissions || "0");
    return (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
  } catch { return false; }
}

function requireGuildAccess(req, res, next) {
  if (!/^\d{17,20}$/.test(req.params.guildId) || !userCanManage(req, req.params.guildId)) {
    return res.status(403).json({ error: "Tu dois avoir la permission Gérer le serveur ou Administrateur." });
  }
  next();
}

async function discordFetch(path, init = {}) {
  const response = await fetch(`https://discord.com/api/v10${path}`, init);
  if (!response.ok) throw new Error(`Discord API (${response.status})`);
  return response.json();
}

app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get("/auth/callback", async (req, res, next) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect("/?login=cancelled");
  if (!code || !state || !req.session.oauthState || state !== req.session.oauthState) return res.redirect("/?login=failed");
  delete req.session.oauthState;
  try {
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri
      })
    });
    if (!tokenResponse.ok) throw new Error("Échange du code OAuth impossible.");
    const tokenData = await tokenResponse.json();
    const headers = { Authorization: `${tokenData.token_type} ${tokenData.access_token}` };
    const [user, guilds] = await Promise.all([
      discordFetch("/users/@me", { headers }),
      discordFetch("/users/@me/guilds", { headers })
    ]);
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.user = { id: user.id, username: user.global_name || user.username, avatar: user.avatar };
    req.session.guilds = guilds;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.redirect("/");
  } catch (err) { next(err); }
});

app.post("/auth/logout", requireAuth, requireCsrf, (req, res) => {
  req.session.destroy(error => {
    if (error) return res.status(500).json({ error: "Impossible de fermer la session." });
    res.clearCookie("atelier.sid", { httpOnly: true, sameSite: "lax", secure: production });
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.json({ authenticated: false, botReady: bot.isReady() });
  const manageable = (req.session.guilds || []).filter(guild => userCanManage(req, guild.id));
  const guilds = manageable.map(guild => {
    const custom = customGuild(guild.id);
    const available = custom || bot.guilds.cache.get(guild.id);
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
      botInstalled: Boolean(available),
      memberCount: available?.memberCount || null,
      customBot: custom ? custom.botId : null
    };
  });
  const sales = salesSettings(), uid = req.session.user.id;
  const canCustom = isBotOwner(uid) || sales.open || sales.allowedUserIds.includes(uid) || listCustomBots(uid).length > 0;
  res.json({ authenticated: true, isOwner: isBotOwner(uid), canCustomBot: canCustom, user: req.session.user, csrfToken: req.session.csrfToken, botReady: bot.isReady(), clientId: process.env.DISCORD_CLIENT_ID, guilds });
});

app.get("/api/guilds/:guildId", requireAuth, requireGuildAccess, async (req, res) => {
  const summary = await opsFor(req.params.guildId).summary(req.params.guildId);
  if (!summary) return res.status(409).json({ error: "Le bot n’est pas encore présent sur ce serveur." });
  res.json({ config: getGuildConfig(req.params.guildId), guild: summary });
});

app.put("/api/guilds/:guildId/config", requireAuth, requireCsrf, requireGuildAccess, async (req, res) => {
  const summary = await opsFor(req.params.guildId).summary(req.params.guildId);
  if (!summary) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
  const config = sanitizeConfig(req.body);
  const channelIds = new Set(summary.channels.map(channel => channel.id));
  const categoryIds = new Set(summary.categories.map(channel => channel.id));
  const roleIds = new Set(summary.roles.map(role => role.id));
  const assignableRoleIds = new Set(summary.roles.filter(role => role.assignable).map(role => role.id));
  if (config.welcome.enabled && !config.welcome.channelId) return res.status(400).json({ error: "Choisis un salon avant d’activer le message d’arrivée." });
  if (config.autorole.enabled && !config.autorole.roleId) return res.status(400).json({ error: "Choisis un rôle avant d’activer l’auto-rôle." });
  if (config.tickets.enabled && !config.tickets.panelChannelId) return res.status(400).json({ error: "Choisis un salon avant d’activer les tickets." });
  if (config.anonymous.enabled && !config.anonymous.channelId) return res.status(400).json({ error: "Choisis un salon avant d’activer les messages anonymes." });
  if ((config.tickets.logsEnabled || config.tickets.transcriptsEnabled) && !config.tickets.logChannelId) return res.status(400).json({ error: "Choisis un salon de logs avant d’activer les journaux ou les transcriptions." });
  if (config.welcome.channelId && !channelIds.has(config.welcome.channelId)) return res.status(400).json({ error: "Choisis un salon de texte existant pour le message d’arrivée." });
  if (config.autorole.roleId && !roleIds.has(config.autorole.roleId)) return res.status(400).json({ error: "Choisis un rôle existant pour l’auto-rôle." });
  if (config.autorole.roleId && !assignableRoleIds.has(config.autorole.roleId)) return res.status(400).json({ error: "Place le rôle du bot au-dessus du rôle d’auto-rôle dans Discord." });
  if (config.tickets.panelChannelId && !channelIds.has(config.tickets.panelChannelId)) return res.status(400).json({ error: "Choisis un salon de texte existant pour le panneau de tickets." });
  if (config.anonymous.channelId) {
    if (!channelIds.has(config.anonymous.channelId)) return res.status(400).json({ error: "Choisis un salon textuel existant pour les messages anonymes." });
    if (config.anonymous.enabled && !(await opsFor(req.params.guildId).anonymousReady(req.params.guildId, config.anonymous.channelId))) {
      return res.status(400).json({ error: "Dans le salon anonyme, le bot doit pouvoir envoyer des messages, gérer les messages et joindre des fichiers." });
    }
  }
  if (config.tickets.logChannelId && !channelIds.has(config.tickets.logChannelId)) return res.status(400).json({ error: "Choisis un salon de texte existant pour les journaux." });
  if (config.tickets.categoryId && !categoryIds.has(config.tickets.categoryId)) return res.status(400).json({ error: "Choisis une catégorie existante pour les tickets." });
  if (config.tickets.supportRoleId && !roleIds.has(config.tickets.supportRoleId)) return res.status(400).json({ error: "Choisis un rôle existant pour le support." });
  if (config.fivem.enabled && !config.fivem.host) return res.status(400).json({ error: "Indique l’adresse IP ou le nom d’hôte de ton serveur FiveM." });
  if (config.fivem.panelEnabled && !config.fivem.panelChannelId) return res.status(400).json({ error: "Choisis un salon pour publier le statut FiveM." });
  if (config.fivem.panelChannelId && !channelIds.has(config.fivem.panelChannelId)) return res.status(400).json({ error: "Choisis un salon textuel existant pour le statut FiveM." });
  const previous = getGuildConfig(req.params.guildId);
  saveGuildConfig(req.params.guildId, config);
  const MOD = { welcome: "Arrivées", autorole: "Auto-rôle", tickets: "Tickets", anonymous: "Salon anonyme", commands: "Commandes", fivem: "FiveM" };
  const changed = Object.keys(MOD).filter(k => JSON.stringify(previous[k]) !== JSON.stringify(config[k])).map(k => MOD[k]);
  if (changed.length) addLog(req.params.guildId, "panneau", "Réglages enregistrés", changed.join(", "), panelActor(req));
  let commandsSynced = true;
  try { await opsFor(req.params.guildId).syncGuildCommands(req.params.guildId, config); }
  catch (error) {
    commandsSynced = false;
    console.error(`Synchronisation des commandes impossible sur ${req.params.guildId}:`, error.message);
  }
  res.json({ ok: true, config, commandsSynced });
});

app.post("/api/guilds/:guildId/tickets/publish", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const config = getGuildConfig(req.params.guildId);
    if (!config.tickets.enabled) return res.status(400).json({ error: "Active les tickets et enregistre la configuration avant de publier." });
    if (!config.tickets.panelChannelId) return res.status(400).json({ error: "Choisis le salon où publier le panneau." });
    const message = await opsFor(req.params.guildId).publishTicketPanel(req.params.guildId, config);
    addLog(req.params.guildId, "panneau", "Panneau de tickets publié", "", panelActor(req));
    res.json({ ok: true, channelId: message.channelId, messageId: message.id });
  } catch (error) { next(error); }
});

app.get("/api/guilds/:guildId/activities", requireAuth, requireGuildAccess, async (req, res) => {
  const guild = await opsFor(req.params.guildId).summary(req.params.guildId);
  if (!guild) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
  const polls = listPolls(req.params.guildId).map(poll => {
    const counts = getPollVoteCounts(poll.id);
    const totalVotes = counts.reduce((sum, row) => sum + row.count, 0);
    return { ...poll, totalVotes, counts, voteChangesCount: getPollVoteHistoryCount(poll.id), voteHistory: getPollVoteHistory(poll.id, 25) };
  });
  const giveaways = listGiveaways(req.params.guildId).map(item => {
    let winners = [];
    try { winners = JSON.parse(item.winners_json || "[]"); } catch { /* Garde un historique lisible si des données anciennes sont invalides. */ }
    return { ...item, winners };
  });
  res.json({ polls, giveaways });
});

app.post("/api/guilds/:guildId/polls", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const summary = await opsFor(req.params.guildId).summary(req.params.guildId);
    if (!summary) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
    const channelId = /^\d{17,20}$/.test(String(req.body?.channelId ?? "")) ? String(req.body.channelId) : "";
    if (!summary.channels.some(channel => channel.id === channelId)) return res.status(400).json({ error: "Choisis un salon textuel valide." });
    const question = String(req.body?.question ?? "").trim().slice(0, 200);
    const options = Array.isArray(req.body?.options) ? req.body.options.slice(0, 10).map(item => String(item ?? "").trim().slice(0, 60)) : [];
    const durationHours = Number.parseInt(req.body?.durationHours, 10);
    if (!question) return res.status(400).json({ error: "Écris la question du sondage." });
    if (options.length < 2 || options.some(option => !option)) return res.status(400).json({ error: "Un sondage doit avoir entre 2 et 10 choix non vides." });
    if (new Set(options.map(option => option.toLocaleLowerCase("fr-FR"))).size !== options.length) return res.status(400).json({ error: "Les choix du sondage doivent être différents." });
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) return res.status(400).json({ error: "La durée du vote doit être comprise entre 1 et 720 heures." });
    const embedColor = String(req.body?.embedColor || "#3566a6");
    const imageUrl = String(req.body?.imageUrl || "").trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(embedColor)) return res.status(400).json({ error: "Choisis une couleur d’embed valide." });
    if (imageUrl && (imageUrl.length > 2048 || !isHttpsUrl(imageUrl))) return res.status(400).json({ error: "L’image doit utiliser une URL HTTPS valide (2 048 caractères maximum)." });
    const result = await opsFor(req.params.guildId).publishPoll(req.params.guildId, { channelId, question, options, durationHours, embedColor, imageUrl, createdBy: req.session.user.id });
    addLog(req.params.guildId, "animations", "Sondage publié", `« ${String(req.body?.question || "").slice(0, 200)} »`, panelActor(req));
    res.json({ ok: true, pollId: result.pollId, messageId: result.message.id });
  } catch (error) { next(error); }
});

app.post("/api/guilds/:guildId/polls/:pollId/close", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const poll = getPoll(req.params.pollId);
    if (!poll || poll.guild_id !== req.params.guildId) return res.status(404).json({ error: "Sondage introuvable." });
    const closed = await opsFor(req.params.guildId).finishPoll(poll.id);
    if (closed) addLog(req.params.guildId, "animations", "Sondage clôturé depuis le panneau", "", panelActor(req));
    res.json({ ok: true, closed });
  } catch (error) { next(error); }
});

app.post("/api/guilds/:guildId/giveaways", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const summary = await opsFor(req.params.guildId).summary(req.params.guildId);
    if (!summary) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
    const channelId = /^\d{17,20}$/.test(String(req.body?.channelId ?? "")) ? String(req.body.channelId) : "";
    if (!summary.channels.some(channel => channel.id === channelId)) return res.status(400).json({ error: "Choisis un salon textuel valide." });
    const prize = String(req.body?.prize ?? "").trim().slice(0, 200);
    const durationHours = Number.parseInt(req.body?.durationHours, 10);
    const winnersCount = Number.parseInt(req.body?.winnersCount, 10);
    if (!prize) return res.status(400).json({ error: "Décris le lot à gagner." });
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) return res.status(400).json({ error: "La durée du tirage doit être comprise entre 1 et 720 heures." });
    if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 10) return res.status(400).json({ error: "Choisis entre 1 et 10 gagnants." });
    const embedColor = String(req.body?.embedColor || "#3566a6");
    const imageUrl = String(req.body?.imageUrl || "").trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(embedColor)) return res.status(400).json({ error: "Choisis une couleur d’embed valide." });
    if (imageUrl && (imageUrl.length > 2048 || !isHttpsUrl(imageUrl))) return res.status(400).json({ error: "L’image doit utiliser une URL HTTPS valide (2 048 caractères maximum)." });
    const result = await opsFor(req.params.guildId).publishGiveaway(req.params.guildId, { channelId, prize, durationHours, winnersCount, embedColor, imageUrl, createdBy: req.session.user.id });
    addLog(req.params.guildId, "animations", "Tirage au sort publié", String(req.body?.prize || "").slice(0, 200), panelActor(req));
    res.json({ ok: true, giveawayId: result.giveawayId, messageId: result.message.id });
  } catch (error) { next(error); }
});

app.post("/api/guilds/:guildId/giveaways/:giveawayId/end", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const giveaway = getGiveaway(req.params.giveawayId);
    if (!giveaway || giveaway.guild_id !== req.params.guildId) return res.status(404).json({ error: "Tirage introuvable." });
    const result = await opsFor(req.params.guildId).finishGiveaway(giveaway.id);
    res.json({ ok: true, ...result });
  } catch (error) { next(error); }
});

app.post("/api/guilds/:guildId/fivem/test", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const config = getGuildConfig(req.params.guildId);
    if (!config.fivem.host) return res.status(400).json({ error: "Enregistre d’abord l’adresse de ton serveur FiveM." });
    const status = await fetchFiveMStatus(config.fivem);
    res.json({ ok: true, status });
  } catch (error) { res.status(400).json({ error: error.message || "Impossible de lire le serveur FiveM." }); }
});

app.post("/api/guilds/:guildId/fivem/publish", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const config = getGuildConfig(req.params.guildId);
    if (!config.fivem.enabled) return res.status(400).json({ error: "Active puis enregistre le module FiveM avant de publier." });
    if (!config.fivem.panelEnabled) return res.status(400).json({ error: "Active puis enregistre le panneau de statut FiveM." });
    if (!config.fivem.panelChannelId) return res.status(400).json({ error: "Choisis puis enregistre le salon du panneau FiveM." });
    const message = await opsFor(req.params.guildId).publishFiveMStatusPanel(req.params.guildId, config.fivem, config.fivem.panelMessageId);
    config.fivem.panelMessageId = message.id;
    saveGuildConfig(req.params.guildId, config);
    addLog(req.params.guildId, "panneau", "Statut FiveM publié", "", panelActor(req));
    res.json({ ok: true, channelId: message.channelId, messageId: message.id });
  } catch (error) { next(error); }
});

/* lecture et vérification d'un message composé dans le panneau ; renvoie { data } ou { error } */
function parseMessageInput(guild, input = {}, { requireChannel = true } = {}) {
    const text = (value, max) => String(value ?? "").trim().slice(0, max);
    const isHttps = value => {
      try { return new URL(value).protocol === "https:"; }
      catch { return false; }
    };
    const channelId = /^\d{17,20}$/.test(String(input.channelId ?? "")) ? String(input.channelId) : "";
    if (requireChannel && !guild.channels.some(channel => channel.id === channelId)) return ({ error: "Choisis un salon de texte valide." });
    const data = {
      channelId,
      content: text(input.content, 2000),
      embedEnabled: input.embedEnabled === true,
      embedTitle: text(input.embedTitle, 256),
      embedDescription: text(input.embedDescription, 4096),
      embedColor: /^#[0-9a-fA-F]{6}$/.test(String(input.embedColor ?? "")) ? String(input.embedColor).toLowerCase() : "#81aadf",
      embedImageUrl: text(input.embedImageUrl, 2048),
      embedImagePosition: input.embedImagePosition === "thumbnail" ? "thumbnail" : "image",
      embedFooter: text(input.embedFooter, 2048),
      buttons: Array.isArray(input.buttons) ? input.buttons.slice(0, 5).map(button => ({
        label: text(button?.label, 80),
        type: button?.type === "role" ? "role" : "link",
        url: text(button?.url, 512),
        roleId: /^\d{17,20}$/.test(String(button?.roleId ?? "")) ? String(button.roleId) : ""
      })) : []
    };
    if (data.embedImageUrl && !isHttps(data.embedImageUrl)) return ({ error: "L’image doit utiliser un lien HTTPS." });
    for (const button of data.buttons) {
      if (!button.label) return ({ error: "Chaque bouton doit avoir un libellé." });
      if (button.type === "role") {
        if (!button.roleId) return ({ error: "Choisis un rôle pour chaque bouton de rôle." });
        if (!guild.roles.some(role => role.id === button.roleId && role.assignable)) return ({ error: "Le rôle choisi n’est pas attribuable par le bot. Vérifie la permission Gérer les rôles et la hiérarchie des rôles." });
        continue;
      }
      let validUrl = false;
      try { const parsed = new URL(button.url); validUrl = ["https:", "http:"].includes(parsed.protocol); }
      catch { validUrl = false; }
      if (!validUrl) return ({ error: "Chaque bouton lien doit avoir une URL HTTP ou HTTPS valide." });
    }
    const hasEmbedContent = Boolean(data.embedTitle || data.embedDescription || data.embedImageUrl || data.embedFooter);
    if (!data.content && !(data.embedEnabled && hasEmbedContent) && !data.buttons.length) return ({ error: "Ajoute un texte, un embed ou au moins un bouton." });
    return { data };
}

app.post("/api/guilds/:guildId/messages", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const guild = await opsFor(req.params.guildId).summary(req.params.guildId);
    if (!guild) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
    const parsed = parseMessageInput(guild, req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const data = parsed.data;
    const message = await opsFor(req.params.guildId).publishCustomMessage(req.params.guildId, data);
    const sentId = recordSentMessage(req.params.guildId, { channelId: message.channelId, messageId: message.id, data, by: req.session.user?.username || "" });
    addLog(req.params.guildId, "panneau", "Message personnalisé envoyé", `#${guild.channels.find(channel => channel.id === message.channelId)?.name || "?"}`, panelActor(req));
    res.json({ ok: true, sentId, channelId: message.channelId, messageId: message.id, url: `https://discord.com/channels/${req.params.guildId}/${message.channelId}/${message.id}` });
  } catch (error) { next(error); }
});

/* Profil du bot sur ce serveur */
const profileHits = new Map();
app.get("/api/guilds/:guildId/profile", requireAuth, requireGuildAccess, async (req, res, next) => {
  const profile = await opsFor(req.params.guildId).botProfile(req.params.guildId).catch(next);
  if (res.headersSent) return;
  if (!profile) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
  res.json({ ...profile, bio: getGuildConfig(req.params.guildId).profile?.bio || "" });
});
app.put("/api/guilds/:guildId/profile", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    if (!(await opsFor(req.params.guildId).botProfile(req.params.guildId))) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
    const now = Date.now(), hits = (profileHits.get(req.params.guildId) || []).filter(t => now - t < 10 * 60e3);
    if (hits.length >= 8) return res.status(429).json({ error: "Trop de modifications : attends quelques minutes." });
    hits.push(now); profileHits.set(req.params.guildId, hits);
    const b = req.body || {}, changes = {}, done = [];
    const image = (value, label) => {
      if (value === undefined) return undefined;                  // inchangé
      if (value === null || value === "") return null;            // retour à l'image par défaut
      const m = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(value));
      if (!m) throw Object.assign(new Error(`${label} : choisis une image PNG, JPG, GIF ou WebP.`), { status: 400 });
      if (Buffer.byteLength(m[2], "base64") > 8 * 1024 * 1024) throw Object.assign(new Error(`${label} : 8 Mo maximum.`), { status: 400 });
      return String(value);
    };
    if (b.nick !== undefined) { changes.nick = String(b.nick).trim().slice(0, 32); done.push(changes.nick ? `nom « ${changes.nick} »` : "nom par défaut"); }
    if (b.bio !== undefined) { changes.bio = String(b.bio).trim().slice(0, 190); done.push("bio"); }
    try { changes.avatar = image(b.avatar, "Avatar"); changes.banner = image(b.banner, "Bannière"); }
    catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
    if (changes.avatar !== undefined) done.push(changes.avatar ? "avatar" : "avatar par défaut");
    if (changes.banner !== undefined) done.push(changes.banner ? "bannière" : "bannière par défaut");
    try { await opsFor(req.params.guildId).updateBotProfile(req.params.guildId, changes); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (changes.bio !== undefined) { const config = getGuildConfig(req.params.guildId); config.profile = { bio: changes.bio }; saveGuildConfig(req.params.guildId, config); }
    if (done.length) addLog(req.params.guildId, "panneau", "Profil du bot modifié", done.join(", "), panelActor(req));
    res.json({ ok: true, ...(await opsFor(req.params.guildId).botProfile(req.params.guildId)), bio: getGuildConfig(req.params.guildId).profile?.bio || "" });
  } catch (error) { next(error); }
});

/* Modération : historique des sanctions */
app.get("/api/guilds/:guildId/cases", requireAuth, requireGuildAccess, (req, res) => {
  res.json({ cases: listCases(req.params.guildId, { limit: 100 }), stats: caseStats(req.params.guildId) });
});
app.post("/api/guilds/:guildId/cases/:caseId/revoke", requireAuth, requireCsrf, requireGuildAccess, (req, res) => {
  if (!revokeCase(req.params.guildId, Number(req.params.caseId))) return res.status(404).json({ error: "Sanction introuvable ou déjà annulée." });
  addLog(req.params.guildId, "moderation", `Sanction #${req.params.caseId} annulée`, "", panelActor(req));
  res.json({ ok: true });
});
/* Niveaux : classement et remise à zéro */
app.get("/api/guilds/:guildId/leaderboard", requireAuth, requireGuildAccess, async (req, res, next) => {
  try {
    const ops = opsFor(req.params.guildId), rows = leaderboard(req.params.guildId, 50);
    const [summary, users] = await Promise.all([ops.summary(req.params.guildId), ops.users(rows.map(r => r.user_id))]);
    res.json({ rows: rows.map(r => {
      const user = users[r.user_id], info = levelFromXp(r.xp);
      return { userId: r.user_id, name: user?.name || r.user_name || r.user_id, avatar: user?.avatar || "", xp: r.xp, level: info.level, current: info.current, needed: info.needed, messages: r.messages };
    }), members: summary?.memberCount || 0 });
  } catch (error) { next(error); }
});
app.post("/api/guilds/:guildId/leaderboard/reset", requireAuth, requireCsrf, requireGuildAccess, (req, res) => {
  const n = resetLevels(req.params.guildId);
  addLog(req.params.guildId, "panneau", "Niveaux remis à zéro", `${n} membre(s)`, panelActor(req));
  res.json({ ok: true, n });
});
/* Suggestions */
app.get("/api/guilds/:guildId/suggestions", requireAuth, requireGuildAccess, (req, res) => res.json({ rows: listSuggestions(req.params.guildId) }));
app.post("/api/guilds/:guildId/suggestions/:id/decide", requireAuth, requireCsrf, requireGuildAccess, async (req, res) => {
  const status = req.body?.status === "accepted" ? "accepted" : req.body?.status === "refused" ? "refused" : "";
  if (!status) return res.status(400).json({ error: "Décision invalide." });
  const rows = listSuggestions(req.params.guildId, 500);
  if (!rows.some(s => s.id === Number(req.params.id))) return res.status(404).json({ error: "Suggestion introuvable." });
  try { await opsFor(req.params.guildId).decideSuggestion(Number(req.params.id), status, String(req.body?.note || "").slice(0, 500), panelActor(req)); res.json({ ok: true }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
/* Compteurs : valeurs actuelles pour l'aperçu */
app.get("/api/guilds/:guildId/counters", requireAuth, requireGuildAccess, async (req, res, next) => {
  try {
    const values = await opsFor(req.params.guildId).counterValues(req.params.guildId);
    if (!values) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
    res.json({ values });
  } catch (error) { next(error); }
});

/* Modèles de messages et historique des messages envoyés */
app.get("/api/guilds/:guildId/message-library", requireAuth, requireGuildAccess, async (req, res) => {
  const guild = await opsFor(req.params.guildId).summary(req.params.guildId).catch(() => null);
  const channelName = id => guild?.channels.find(channel => channel.id === id)?.name || "salon supprimé";
  res.json({
    templates: listTemplates(req.params.guildId),
    sent: listSentMessages(req.params.guildId).map(item => ({ ...item, channelName: channelName(item.channel_id), url: `https://discord.com/channels/${req.params.guildId}/${item.channel_id}/${item.message_id}` }))
  });
});
app.post("/api/guilds/:guildId/templates", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  const guild = await opsFor(req.params.guildId).summary(req.params.guildId).catch(next);
  if (res.headersSent) return;
  if (!guild) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
  const name = String(req.body?.name || "").trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: "Donne un nom au modèle." });
  const parsed = parseMessageInput(guild, req.body?.data || {}, { requireChannel: false });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const template = saveTemplate(req.params.guildId, { id: req.body?.id, name, data: parsed.data, by: req.session.user?.username });
    addLog(req.params.guildId, "panneau", req.body?.id ? "Modèle de message mis à jour" : "Modèle de message créé", `« ${name} »`, panelActor(req));
    res.json({ ok: true, template });
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
app.delete("/api/guilds/:guildId/templates/:templateId", requireAuth, requireCsrf, requireGuildAccess, (req, res) => {
  if (!deleteTemplate(req.params.guildId, req.params.templateId)) return res.status(404).json({ error: "Modèle introuvable." });
  res.json({ ok: true });
});
app.put("/api/guilds/:guildId/sent/:sentId", requireAuth, requireCsrf, requireGuildAccess, async (req, res, next) => {
  try {
    const guild = await opsFor(req.params.guildId).summary(req.params.guildId);
    if (!guild) return res.status(409).json({ error: "Le bot n’est pas présent sur ce serveur." });
    const sent = getSentMessage(req.params.guildId, req.params.sentId);
    if (!sent) return res.status(404).json({ error: "Message introuvable dans l’historique." });
    const parsed = parseMessageInput(guild, { ...(req.body || {}), channelId: sent.channel_id }, { requireChannel: false });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try { await opsFor(req.params.guildId).editCustomMessage(req.params.guildId, sent.channel_id, sent.message_id, parsed.data); }
    catch (error) { if (error.gone) deleteSentMessage(req.params.guildId, sent.id); return res.status(400).json({ error: error.message }); }
    updateSentMessage(req.params.guildId, sent.id, parsed.data);
    addLog(req.params.guildId, "panneau", "Message modifié sur Discord", `#${guild.channels.find(channel => channel.id === sent.channel_id)?.name || "?"}`, panelActor(req));
    res.json({ ok: true, url: `https://discord.com/channels/${req.params.guildId}/${sent.channel_id}/${sent.message_id}` });
  } catch (error) { next(error); }
});
app.delete("/api/guilds/:guildId/sent/:sentId", requireAuth, requireCsrf, requireGuildAccess, (req, res) => {
  deleteSentMessage(req.params.guildId, req.params.sentId);
  res.json({ ok: true });
});

/* Statut animé du bot (commun à tous les serveurs : réservé au propriétaire du bot) */
function requireOwner(req, res, next) {
  if (!isBotOwner(req.session.user?.id)) return res.status(403).json({ error: "Réservé au propriétaire du bot." });
  next();
}
/* ?bot=<id> : statut d'un bot client (son créateur ou le propriétaire) ; sans paramètre : bot principal (propriétaire) */
function presenceTarget(req, res, next) {
  const id = String(req.query.bot || "main");
  if (id === "main") return requireOwner(req, res, () => { req.botId = "main"; next(); });
  const row = getCustomBot(id);
  if (!row || !canManageBot(req, row)) return res.status(404).json({ error: "Bot introuvable." });
  req.botId = id; next();
}
app.get("/api/presence", requireAuth, presenceTarget, async (req, res) => {
  const values = await opsForBot(req.botId).presenceValues().catch(() => ({}));
  res.json({ settings: getPresenceSettings(req.botId), values });
});
app.put("/api/presence", requireAuth, requireCsrf, presenceTarget, async (req, res) => {
  const settings = savePresenceSettings(req.body || {}, req.botId);
  const values = await opsForBot(req.botId).restartPresence().then(() => opsForBot(req.botId).presenceValues()).catch(() => ({}));
  res.json({ ok: true, settings, preview: settings.items.map(item => renderPresenceText(item.text, values)) });
});

/* ---------- Bots personnalisés : chaque client utilise son propre bot Discord ---------- */
const canManageBot = (req, row) => isBotOwner(req.session.user?.id) || row.owner_id === req.session.user?.id;
function botRow(req, res, next) {
  const row = getCustomBot(String(req.params.botId));
  if (!row || !canManageBot(req, row)) return res.status(404).json({ error: "Bot introuvable." });
  req.botRow = row; next();
}
app.get("/api/custombots", requireAuth, (req, res) => {
  const uid = req.session.user.id, owner = isBotOwner(uid), sales = salesSettings();
  const rows = owner ? listCustomBots() : listCustomBots(uid);
  const allowed = owner || sales.open || sales.allowedUserIds.includes(uid);
  res.json({
    bots: rows.map(describeBot), isOwner: owner, mainClientId: process.env.DISCORD_CLIENT_ID,
    canCreate: allowed && (owner || listCustomBots(uid).length < sales.maxPerUser) && listCustomBots().length < (owner ? 100 : sales.maxTotal),
    allowed, limits: { perUser: sales.maxPerUser }, settings: owner ? sales : undefined, running: owner ? runningCount() : undefined
  });
});
const tokenLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
app.post("/api/custombots", requireAuth, requireCsrf, tokenLimiter, async (req, res) => {
  const uid = req.session.user.id, owner = isBotOwner(uid), sales = salesSettings();
  if (!owner && !sales.open && !sales.allowedUserIds.includes(uid)) return res.status(403).json({ error: "Les bots personnalisés ne sont pas ouverts à ton compte. Contacte le propriétaire d’AERO BOT." });
  if (!owner && listCustomBots(uid).length >= sales.maxPerUser) return res.status(403).json({ error: `Limite atteinte : ${sales.maxPerUser} bot(s) par compte.` });
  if (!owner && listCustomBots().length >= sales.maxTotal) return res.status(403).json({ error: "Plus de place pour un nouveau bot pour le moment. Contacte le propriétaire d’AERO BOT." });
  try {
    const result = await createBot({ token: req.body?.token, ownerId: uid, ownerName: req.session.user.username });
    res.json({ ok: true, ...result });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.put("/api/custombots/:botId/token", requireAuth, requireCsrf, tokenLimiter, botRow, async (req, res) => {
  try { res.json({ ok: true, ...(await replaceToken(req.botRow.id, req.body?.token)) }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/custombots/:botId/:action", requireAuth, requireCsrf, botRow, (req, res) => {
  const { action } = req.params;
  if (action === "start" || action === "restart") setBotEnabled(req.botRow.id, true);
  else if (action === "stop") setBotEnabled(req.botRow.id, false);
  else return res.status(404).json({ error: "Action inconnue." });
  res.json({ ok: true });
});
app.delete("/api/custombots/:botId", requireAuth, requireCsrf, botRow, (req, res) => { removeBot(req.botRow.id); res.json({ ok: true }); });
app.put("/api/custombots-settings", requireAuth, requireCsrf, requireOwner, (req, res) => res.json({ ok: true, settings: saveSalesSettings(req.body || {}) }));

/* Journal : tout ce qui se passe sur le serveur Discord et dans le panneau */
app.get("/api/guilds/:guildId/logs", requireAuth, requireGuildAccess, (req, res) => {
  const category = LOG_CATEGORIES.includes(req.query.category) ? req.query.category : "";
  const rows = listLogs(req.params.guildId, { category, q: String(req.query.q || ""), before: Number(req.query.before) || 0, limit: 60 });
  res.json({ rows, counts: logCounts(req.params.guildId), hasMore: rows.length === 60 });
});

/* Page d'accueil publique : chiffres globaux du bot */
let publicStatsCache = { at: 0, data: null };
app.get("/api/public/stats", (req, res) => {
  if (!publicStatsCache.data || Date.now() - publicStatsCache.at > 30_000) {
    const guilds = [...bot.guilds.cache.values()].filter(guild => !customGuild(guild.id)), extra = customTotals();
    publicStatsCache = { at: Date.now(), data: {
      botReady: bot.isReady(),
      guilds: guilds.length + extra.guilds,
      members: guilds.reduce((sum, guild) => sum + (guild.memberCount || 0), 0) + extra.members,
      uptime: bot.uptime || 0,
      ping: Math.max(0, Math.round(bot.ws?.ping ?? 0)),
      clientId: process.env.DISCORD_CLIENT_ID || "",
      ...publicCounts()
    } };
  }
  res.set("Cache-Control", "public, max-age=30").json(publicStatsCache.data);
});

app.get("/api/status", (req, res) => res.json({ botReady: bot.isReady(), uptime: bot.uptime }));
app.get(/.*/, (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((error, req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  if (error.expose) return res.status(error.status || 400).json({ error: error.message });
  res.status(500).json({ error: error.message?.startsWith("Discord API") ? "Discord ne répond pas pour le moment. Réessaie dans un instant." : "Une erreur est survenue. Vérifie les réglages du bot et réessaie." });
});

const server = app.listen(port, process.env.HOST || "0.0.0.0", () => console.log(`Panneau web prêt sur ${baseUrl}`));
startAllBots();
bot.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("Connexion Discord impossible :", error.message);
  server.close(() => process.exit(1));
});

function shutdown() {
  server.close();
  stopAllBots();
  bot.destroy();
  db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
