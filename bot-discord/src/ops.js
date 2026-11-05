/* Opérations que le panneau demande à un bot. Elles tournent dans le processus qui possède le bot
   (le bot principal, ou un bot client lancé par bots.js) et renvoient uniquement des données simples (JSON). */
import { PermissionFlagsBits } from "discord.js";
import {
  bot, botGuildSummary, botProfile, editCustomMessage, finishGiveaway, finishPoll, publishCustomMessage,
  publishFiveMStatusPanel, publishGiveaway, publishPoll, publishTicketPanel, syncGuildCommands, updateBotProfile, presenceValues, restartPresence
} from "./discord.js";
import { counterValues, decideSuggestion } from "./modules.js";

const msg = m => (m ? { id: m.id, channelId: m.channelId } : null);
export const ops = {
  summary: guildId => botGuildSummary(guildId),
  publishTicketPanel: async (guildId, config) => msg(await publishTicketPanel(guildId, config)),
  publishPoll: async (guildId, input) => { const r = await publishPoll(guildId, input); return { pollId: r.pollId, message: msg(r.message) }; },
  finishPoll: async pollId => finishPoll(pollId),
  publishGiveaway: async (guildId, input) => { const r = await publishGiveaway(guildId, input); return { giveawayId: r.giveawayId, message: msg(r.message) }; },
  finishGiveaway: async giveawayId => finishGiveaway(giveawayId),
  publishFiveMStatusPanel: async (guildId, settings, messageId) => msg(await publishFiveMStatusPanel(guildId, settings, messageId)),
  publishCustomMessage: async (guildId, data) => msg(await publishCustomMessage(guildId, data)),
  editCustomMessage: async (guildId, channelId, messageId, data) => msg(await editCustomMessage(guildId, channelId, messageId, data)),
  syncGuildCommands: async (guildId, config) => { await syncGuildCommands(guildId, config); return true; },
  botProfile: guildId => botProfile(guildId),
  updateBotProfile: async (guildId, changes) => { await updateBotProfile(guildId, changes); return true; },
  decideSuggestion: async (id, status, note, by) => { await decideSuggestion(bot, id, status, note, by); return true; },
  counterValues: guildId => { const guild = bot.guilds.cache.get(guildId); return guild ? counterValues(guild) : null; },
  channelName: (guildId, channelId) => bot.guilds.cache.get(guildId)?.channels.cache.get(channelId)?.name || "",
  anonymousReady: (guildId, channelId) => {
    const p = bot.guilds.cache.get(guildId)?.channels.cache.get(channelId)?.permissionsFor(bot.user);
    return Boolean(p?.has(PermissionFlagsBits.SendMessages) && p.has(PermissionFlagsBits.ManageMessages) && p.has(PermissionFlagsBits.AttachFiles));
  },
  users: ids => Object.fromEntries(ids.map(id => { const u = bot.users.cache.get(id); return [id, u ? { name: u.globalName || u.username, avatar: u.displayAvatarURL({ size: 64 }) } : null]; })),
  presenceValues: () => presenceValues(),
  restartPresence: () => { restartPresence(); return true; },
  guilds: () => [...bot.guilds.cache.values()].map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount })),
  status: () => ({
    ready: bot.isReady(), uptime: bot.uptime || 0, ping: Math.max(0, Math.round(bot.ws?.ping ?? 0)),
    user: bot.user ? { id: bot.user.id, name: bot.user.username, avatar: bot.user.displayAvatarURL({ size: 128 }) } : null,
    guilds: bot.guilds.cache.size, members: [...bot.guilds.cache.values()].reduce((s, g) => s + (g.memberCount || 0), 0)
  })
};
/* exécute une opération et transforme une erreur en message lisible pour le panneau */
export async function runOp(name, args = []) {
  if (!ops[name]) throw new Error(`Opération inconnue : ${name}`);
  return ops[name](...args);
}
