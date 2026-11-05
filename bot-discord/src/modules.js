/* Modules AERO BOT : modération, niveaux, réponses automatiques, suggestions, compteurs,
   salons vocaux temporaires et messages de départ. Tout se règle depuis le panneau. */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder
} from "discord.js";
import {
  addCase, addLog, addTempVoice, addXp, activeWarnCount, clearWarns, countMessage, createSuggestion, getGuildConfig, getLevelRow,
  getSuggestion, getTempVoice, leaderboard, levelFromXp, listCases, listTempVoice, rankOf, removeTempVoice, revokeCase,
  setSuggestionMessage, setSuggestionStatus, suggestionVotes, voteSuggestion
} from "./database.js";

const BLUE = 0x3566a6, RED = 0xed4245, GREEN = 0x23a55a, AMBER = 0xf0b232;
const nf = n => new Intl.NumberFormat("fr-FR").format(n || 0);
const who = user => (user ? { id: user.id, name: user.globalName || user.username || "" } : null);
const display = user => user?.globalName || user?.username || "inconnu";
const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
const duration = minutes => minutes >= 1440 ? `${Math.round(minutes / 1440)} jour(s)` : minutes >= 60 ? `${Math.round(minutes / 60)} heure(s)` : `${minutes} minute(s)`;
const TYPE_LABEL = { warn: "Avertissement", mute: "Exclusion temporaire", unmute: "Fin d’exclusion", kick: "Expulsion", ban: "Bannissement", unban: "Débannissement" };
const TYPE_COLOR = { warn: AMBER, mute: AMBER, unmute: GREEN, kick: RED, ban: RED, unban: GREEN };

/* =============================== Commandes =============================== */
export function moduleCommandDefinitions(config) {
  const list = [];
  const user = (o, name = "membre", d = "Membre concerné.") => o.addUserOption(x => x.setName(name).setDescription(d).setRequired(true));
  const reason = (o, required = false) => o.addStringOption(x => x.setName("raison").setDescription("Raison (visible dans l’historique).").setMaxLength(400).setRequired(required));
  if (config.moderation?.enabled) {
    list.push(reason(user(new SlashCommandBuilder().setName("warn").setDescription("Avertit un membre.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)), true));
    list.push(reason(user(new SlashCommandBuilder().setName("mute").setDescription("Exclut temporairement un membre (il ne peut plus écrire ni parler).").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers))
      .addIntegerOption(x => x.setName("minutes").setDescription("Durée en minutes (1 à 40 320 = 28 jours).").setRequired(true).setMinValue(1).setMaxValue(40320))));
    list.push(reason(user(new SlashCommandBuilder().setName("unmute").setDescription("Lève l’exclusion temporaire d’un membre.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers))));
    list.push(reason(user(new SlashCommandBuilder().setName("kick").setDescription("Expulse un membre du serveur.").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers))));
    list.push(reason(user(new SlashCommandBuilder().setName("ban").setDescription("Bannit un membre du serveur.").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)))
      .addIntegerOption(x => x.setName("supprimer_messages").setDescription("Supprimer ses messages des derniers jours (0 à 7).").setMinValue(0).setMaxValue(7)));
    list.push(reason(new SlashCommandBuilder().setName("unban").setDescription("Lève le bannissement d’un utilisateur.").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption(x => x.setName("identifiant").setDescription("Identifiant Discord de l’utilisateur.").setRequired(true))));
    list.push(user(new SlashCommandBuilder().setName("sanctions").setDescription("Affiche l’historique des sanctions d’un membre.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)));
    list.push(new SlashCommandBuilder().setName("unwarn").setDescription("Annule un avertissement (numéro visible dans /sanctions).").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addIntegerOption(x => x.setName("numero").setDescription("Numéro de la sanction (#12 → 12).").setRequired(true).setMinValue(1)));
    list.push(user(new SlashCommandBuilder().setName("clearwarns").setDescription("Efface tous les avertissements actifs d’un membre.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)));
    list.push(reason(new SlashCommandBuilder().setName("lock").setDescription("Verrouille un salon : plus personne ne peut écrire.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption(x => x.setName("salon").setDescription("Salon à verrouiller (par défaut : celui-ci).").addChannelTypes(ChannelType.GuildText))));
    list.push(new SlashCommandBuilder().setName("unlock").setDescription("Déverrouille un salon.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption(x => x.setName("salon").setDescription("Salon à déverrouiller (par défaut : celui-ci).").addChannelTypes(ChannelType.GuildText)));
  }
  if (config.levels?.enabled) {
    list.push(new SlashCommandBuilder().setName("niveau").setDescription("Affiche ton niveau et ton expérience.").addUserOption(x => x.setName("membre").setDescription("Voir le niveau d’un autre membre.")));
    list.push(new SlashCommandBuilder().setName("classement").setDescription("Affiche le classement des membres les plus actifs."));
  }
  if (config.suggestions?.enabled) {
    list.push(new SlashCommandBuilder().setName("suggestion").setDescription("Propose une idée pour le serveur.")
      .addStringOption(x => x.setName("idee").setDescription("Ton idée, en quelques phrases.").setRequired(true).setMinLength(10).setMaxLength(1500)));
  }
  return list.map(c => c.toJSON());
}
export const MODULE_COMMANDS = new Set(["warn", "mute", "unmute", "kick", "ban", "unban", "sanctions", "unwarn", "clearwarns", "lock", "unlock", "niveau", "classement", "suggestion"]);

/* ---------- Modération ---------- */
async function modLog(guild, config, embed) {
  const channel = config.moderation.logChannelId ? guild.channels.cache.get(config.moderation.logChannelId) : null;
  if (channel?.isTextBased()) await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}
/* enregistre la sanction, prévient le membre en privé, journalise ; renvoie le numéro */
async function recordSanction(guild, config, { type, target, moderator, reason, minutes }) {
  const caseId = addCase(guild.id, { userId: target.id, userName: display(target), modId: moderator?.id, modName: moderator ? display(moderator) : "AERO BOT (automatique)", type, reason, duration: minutes });
  const embed = new EmbedBuilder().setColor(TYPE_COLOR[type] || BLUE).setTitle(`${TYPE_LABEL[type]} · #${caseId}`)
    .addFields({ name: "Membre", value: `${target} (${display(target)})`, inline: true }, { name: "Par", value: moderator ? `${moderator}` : "Sanction automatique", inline: true })
    .setTimestamp();
  if (minutes) embed.addFields({ name: "Durée", value: duration(minutes), inline: true });
  embed.addFields({ name: "Raison", value: reason || "Aucune raison précisée" });
  await modLog(guild, config, embed);
  addLog(guild.id, "moderation", `${TYPE_LABEL[type]} #${caseId}`, `${reason || "sans raison"}${minutes ? ` · ${duration(minutes)}` : ""}`, who(target));
  if (config.moderation.dmUsers && ["warn", "mute", "kick", "ban"].includes(type)) {
    const dm = new EmbedBuilder().setColor(TYPE_COLOR[type]).setTitle(`${TYPE_LABEL[type]} sur ${guild.name}`).setDescription(`**Raison :** ${reason || "aucune raison précisée"}${minutes ? `\n**Durée :** ${duration(minutes)}` : ""}`).setTimestamp();
    await target.send({ embeds: [dm] }).catch(() => {});
  }
  return caseId;
}
/* sanctions automatiques selon le nombre d'avertissements actifs */
async function autoSanction(guild, config, member) {
  const m = config.moderation, n = activeWarnCount(guild.id, member.id);
  const reason = `${n} avertissements`;
  if (m.autoBanAt && n >= m.autoBanAt && member.bannable) { await recordSanction(guild, config, { type: "ban", target: member.user, reason }); await member.ban({ reason: `AERO BOT : ${reason}` }).catch(() => {}); return "banni"; }
  if (m.autoKickAt && n >= m.autoKickAt && member.kickable) { await recordSanction(guild, config, { type: "kick", target: member.user, reason }); await member.kick(`AERO BOT : ${reason}`).catch(() => {}); return "expulsé"; }
  if (m.autoMuteAt && n >= m.autoMuteAt && member.moderatable && n % m.autoMuteAt === 0) {
    await member.timeout(m.autoMuteMinutes * 60_000, `AERO BOT : ${reason}`).catch(() => {});
    await recordSanction(guild, config, { type: "mute", target: member.user, reason, minutes: m.autoMuteMinutes });
    return `exclu ${duration(m.autoMuteMinutes)}`;
  }
  return "";
}
function canAct(interaction, member) {
  if (!member) return "Ce membre n’est pas sur le serveur.";
  if (member.id === interaction.user.id) return "Tu ne peux pas te sanctionner toi-même.";
  if (member.id === interaction.client.user.id) return "Je ne peux pas me sanctionner moi-même.";
  if (member.id === interaction.guild.ownerId) return "Impossible de sanctionner le propriétaire du serveur.";
  const mine = interaction.member?.roles?.highest?.position ?? 0;
  if (interaction.user.id !== interaction.guild.ownerId && member.roles.highest.position >= mine) return "Ce membre a un rôle égal ou supérieur au tien.";
  return "";
}
const ok = (interaction, text, color = GREEN) => interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setDescription(text)], ephemeral: true });

async function handleModeration(interaction, config) {
  const name = interaction.commandName, guild = interaction.guild;
  const reason = interaction.options.getString("raison") || "";
  if (["warn", "mute", "unmute", "kick", "ban", "sanctions", "clearwarns"].includes(name)) {
    const target = interaction.options.getUser("membre", true);
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (name === "sanctions") {
      const cases = listCases(guild.id, { userId: target.id, limit: 15 });
      const active = activeWarnCount(guild.id, target.id);
      const embed = new EmbedBuilder().setColor(BLUE).setTitle(`Sanctions de ${display(target)}`).setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setDescription(cases.length ? cases.map(c => `**#${c.id}** · ${TYPE_LABEL[c.type] || c.type}${c.active ? "" : " ~~(annulé)~~"} · <t:${Math.floor(c.at / 1000)}:d>\n> ${c.reason || "sans raison"} — *${c.mod_name}*`).join("\n") : "Aucune sanction enregistrée.")
        .setFooter({ text: `${active} avertissement(s) actif(s)` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (name === "clearwarns") { const n = clearWarns(guild.id, target.id); addLog(guild.id, "moderation", "Avertissements effacés", `${n} avertissement(s)`, who(target)); return ok(interaction, `${n} avertissement(s) de ${target} effacé(s).`); }
    if (name !== "ban" || member) { const err = canAct(interaction, member); if (err) return ok(interaction, err, RED); }
    if (name === "warn") {
      const caseId = await recordSanction(guild, config, { type: "warn", target, moderator: interaction.user, reason });
      const extra = member ? await autoSanction(guild, config, member) : "";
      return ok(interaction, `${target} a reçu un avertissement (#${caseId}). Il en a maintenant **${activeWarnCount(guild.id, target.id)}**.${extra ? `\nSanction automatique : **${extra}**.` : ""}`, AMBER);
    }
    if (name === "mute") {
      const minutes = interaction.options.getInteger("minutes", true);
      if (!member.moderatable) return ok(interaction, "Je ne peux pas exclure ce membre : vérifie que mon rôle est au-dessus du sien et que j’ai la permission « Exclure temporairement ».", RED);
      await member.timeout(minutes * 60_000, `${interaction.user.tag} : ${reason || "sans raison"}`);
      const caseId = await recordSanction(guild, config, { type: "mute", target, moderator: interaction.user, reason, minutes });
      return ok(interaction, `${target} est exclu pendant **${duration(minutes)}** (#${caseId}).`, AMBER);
    }
    if (name === "unmute") {
      if (!member.isCommunicationDisabled()) return ok(interaction, "Ce membre n’est pas exclu.", AMBER);
      await member.timeout(null, `${interaction.user.tag} : ${reason || "fin d’exclusion"}`);
      await recordSanction(guild, config, { type: "unmute", target, moderator: interaction.user, reason });
      return ok(interaction, `L’exclusion de ${target} est levée.`);
    }
    if (name === "kick") {
      if (!member.kickable) return ok(interaction, "Je ne peux pas expulser ce membre (rôle trop haut ou permission manquante).", RED);
      const caseId = await recordSanction(guild, config, { type: "kick", target, moderator: interaction.user, reason });
      await member.kick(`${interaction.user.tag} : ${reason || "sans raison"}`);
      return ok(interaction, `${display(target)} a été expulsé (#${caseId}).`, RED);
    }
    if (name === "ban") {
      if (member && !member.bannable) return ok(interaction, "Je ne peux pas bannir ce membre (rôle trop haut ou permission manquante).", RED);
      const caseId = await recordSanction(guild, config, { type: "ban", target, moderator: interaction.user, reason });
      await guild.members.ban(target.id, { reason: `${interaction.user.tag} : ${reason || "sans raison"}`, deleteMessageSeconds: (interaction.options.getInteger("supprimer_messages") || 0) * 86400 });
      return ok(interaction, `${display(target)} a été banni (#${caseId}).`, RED);
    }
  }
  if (name === "unban") {
    const id = interaction.options.getString("identifiant", true).trim();
    if (!/^\d{17,20}$/.test(id)) return ok(interaction, "Identifiant invalide : clic droit sur l’utilisateur → « Copier l’identifiant ».", RED);
    const user = await interaction.client.users.fetch(id).catch(() => null);
    try { await guild.members.unban(id, `${interaction.user.tag} : ${reason || "débannissement"}`); }
    catch { return ok(interaction, "Cet utilisateur n’est pas banni.", AMBER); }
    if (user) await recordSanction(guild, config, { type: "unban", target: user, moderator: interaction.user, reason });
    return ok(interaction, `${user ? display(user) : id} n’est plus banni.`);
  }
  if (name === "unwarn") {
    const id = interaction.options.getInteger("numero", true);
    if (!revokeCase(guild.id, id)) return ok(interaction, `Aucune sanction active n° ${id}.`, AMBER);
    addLog(guild.id, "moderation", `Sanction #${id} annulée`, "", who(interaction.user));
    return ok(interaction, `La sanction #${id} est annulée.`);
  }
  if (name === "lock" || name === "unlock") {
    const channel = interaction.options.getChannel("salon") || interaction.channel;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: name === "lock" ? false : null }, { reason: `${interaction.user.tag} : ${reason || name}` });
    addLog(guild.id, "moderation", name === "lock" ? "Salon verrouillé" : "Salon déverrouillé", `#${channel.name}${reason ? ` · ${reason}` : ""}`, who(interaction.user));
    if (name === "lock") await channel.send({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`Ce salon est verrouillé par l’équipe.${reason ? `\n**Raison :** ${reason}` : ""}`)] }).catch(() => {});
    return ok(interaction, `${channel} est ${name === "lock" ? "verrouillé" : "déverrouillé"}.`);
  }
  return false;
}

/* ---------- Niveaux ---------- */
function progressBar(current, needed, size = 14) { const filled = Math.round(current / needed * size); return "▰".repeat(filled) + "▱".repeat(size - filled); }
async function handleLevels(interaction) {
  const guild = interaction.guild;
  if (interaction.commandName === "niveau") {
    const user = interaction.options.getUser("membre") || interaction.user;
    const row = getLevelRow(guild.id, user.id), info = levelFromXp(row.xp);
    const embed = new EmbedBuilder().setColor(BLUE).setAuthor({ name: display(user), iconURL: user.displayAvatarURL({ size: 64 }) })
      .setTitle(`Niveau ${info.level}`)
      .setDescription(`${progressBar(info.current, info.needed)}  **${nf(info.current)}** / ${nf(info.needed)} XP`)
      .addFields({ name: "Classement", value: row.xp ? `#${rankOf(guild.id, user.id)}` : "—", inline: true }, { name: "XP total", value: nf(row.xp), inline: true }, { name: "Messages", value: nf(row.messages), inline: true })
      .setThumbnail(user.displayAvatarURL({ size: 128 }));
    return interaction.reply({ embeds: [embed] });
  }
  const rows = leaderboard(guild.id, 10);
  const medal = i => ["🥇", "🥈", "🥉"][i] || `**${i + 1}.**`;
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(`Classement · ${guild.name}`)
    .setDescription(rows.length ? rows.map((r, i) => `${medal(i)} <@${r.user_id}> · niveau **${r.level}** · ${nf(r.xp)} XP`).join("\n") : "Personne n’a encore gagné d’expérience.")
    .setFooter({ text: "Gagne de l’XP en participant · /niveau pour voir ta progression" });
  return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}
const xpCooldown = new Map();
async function onMessageLevels(message, config) {
  const l = config.levels;
  if (l.ignoredChannelIds.includes(message.channelId) || message.member?.roles.cache.some(r => l.ignoredRoleIds.includes(r.id))) return;
  const key = `${message.guild.id}:${message.author.id}`, now = Date.now();
  if (now - (xpCooldown.get(key) || 0) < l.cooldown * 1000) { countMessage(message.guild.id, message.author.id, display(message.author)); return; }
  xpCooldown.set(key, now);
  const gain = l.xpMin + Math.floor(Math.random() * (l.xpMax - l.xpMin + 1));
  const result = addXp(message.guild.id, message.author.id, display(message.author), gain);
  if (!result.levelUp) return;
  addLog(message.guild.id, "membres", `Niveau ${result.level} atteint`, "", who(message.author));
  // rôles récompenses
  const member = message.member;
  if (member && l.rewards.length) {
    const earned = l.rewards.filter(r => r.level <= result.level);
    const best = earned[earned.length - 1];
    for (const reward of l.rewards) {
      const role = message.guild.roles.cache.get(reward.roleId); if (!role || !role.editable) continue;
      const shouldHave = l.stackRewards ? reward.level <= result.level : reward === best;
      if (shouldHave && !member.roles.cache.has(role.id)) await member.roles.add(role, `Niveau ${result.level} atteint`).catch(() => {});
      if (!shouldHave && !l.stackRewards && member.roles.cache.has(role.id)) await member.roles.remove(role, "Récompense de niveau remplacée").catch(() => {});
    }
  }
  if (l.announce === "off") return;
  const text = fill(l.message, { user: `${message.author}`, pseudo: display(message.author), level: result.level, server: message.guild.name });
  const embed = new EmbedBuilder().setColor(BLUE).setDescription(text).setThumbnail(message.author.displayAvatarURL({ size: 64 }));
  if (l.announce === "dm") return message.author.send({ embeds: [embed] }).catch(() => {});
  const channel = l.announce === "channel" ? message.guild.channels.cache.get(l.channelId) : message.channel;
  if (channel?.isTextBased()) await channel.send({ embeds: [embed], allowedMentions: { users: [message.author.id] } }).catch(() => {});
}

/* ---------- Réponses automatiques ---------- */
const responderCooldown = new Map();
async function onMessageResponder(message, config) {
  const text = (message.content || "").toLowerCase().trim(); if (!text) return;
  for (const item of config.autoresponder.items) {
    const trigger = item.trigger.toLowerCase().trim();
    const hit = item.match === "exact" ? text === trigger : item.match === "starts" ? text.startsWith(trigger) : text.includes(trigger);
    if (!hit) continue;
    const key = `${message.channelId}:${trigger}`; if (Date.now() - (responderCooldown.get(key) || 0) < 5000) return;
    responderCooldown.set(key, Date.now());
    const response = fill(item.response, { user: `${message.author}`, pseudo: display(message.author), server: message.guild.name, memberCount: nf(message.guild.memberCount), channel: `${message.channel}` });
    const payload = { content: response.slice(0, 2000), allowedMentions: { users: [message.author.id] } };
    await (item.reply ? message.reply(payload) : message.channel.send(payload)).catch(() => {});
    return;
  }
}

/* ---------- Suggestions ---------- */
const SUGG = { pending: ["En attente de l’avis de l’équipe", BLUE], accepted: ["Acceptée", GREEN], refused: ["Refusée", RED] };
function suggestionPayload(s, author) {
  const votes = suggestionVotes(s.id), [label, color] = SUGG[s.status] || SUGG.pending;
  const embed = new EmbedBuilder().setColor(color).setAuthor({ name: `Suggestion de ${s.user_name}`, iconURL: author?.displayAvatarURL({ size: 64 }) || undefined })
    .setDescription(s.content).addFields({ name: "Statut", value: label, inline: true }, { name: "Votes", value: `👍 ${votes.up} · 👎 ${votes.down}`, inline: true })
    .setFooter({ text: `Suggestion #${s.id}` }).setTimestamp(s.at);
  if (s.staff_note) embed.addFields({ name: "Réponse de l’équipe", value: s.staff_note });
  const pending = s.status === "pending";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`aero:sugg:up:${s.id}`).setLabel(`Pour · ${votes.up}`).setStyle(ButtonStyle.Success).setDisabled(!pending),
    new ButtonBuilder().setCustomId(`aero:sugg:down:${s.id}`).setLabel(`Contre · ${votes.down}`).setStyle(ButtonStyle.Danger).setDisabled(!pending),
    new ButtonBuilder().setCustomId(`aero:sugg:accept:${s.id}`).setLabel("Accepter").setStyle(ButtonStyle.Secondary).setDisabled(!pending),
    new ButtonBuilder().setCustomId(`aero:sugg:refuse:${s.id}`).setLabel("Refuser").setStyle(ButtonStyle.Secondary).setDisabled(!pending));
  return { embeds: [embed], components: [row] };
}
export async function decideSuggestion(client, id, status, note, by) {
  const s = getSuggestion(id); if (!s) throw new Error("Suggestion introuvable.");
  setSuggestionStatus(id, status, note);
  const updated = getSuggestion(id), guild = client.guilds.cache.get(s.guild_id);
  const channel = guild?.channels.cache.get(s.channel_id), message = channel ? await channel.messages.fetch(s.message_id).catch(() => null) : null;
  const author = await client.users.fetch(s.user_id).catch(() => null);
  if (message) await message.edit(suggestionPayload(updated, author)).catch(() => {});
  addLog(s.guild_id, "animations", status === "accepted" ? "Suggestion acceptée" : "Suggestion refusée", `#${id} · ${s.content.slice(0, 120)}`, by);
  return updated;
}
async function handleSuggestionCommand(interaction, config) {
  const channel = interaction.guild.channels.cache.get(config.suggestions.channelId);
  if (!channel?.isTextBased()) return ok(interaction, "Le salon des suggestions n’est pas configuré. Préviens l’équipe.", RED);
  const content = interaction.options.getString("idee", true);
  const id = createSuggestion(interaction.guild.id, { channelId: channel.id, userId: interaction.user.id, userName: display(interaction.user), content });
  const message = await channel.send(suggestionPayload(getSuggestion(id), interaction.user));
  setSuggestionMessage(id, message.id);
  addLog(interaction.guild.id, "animations", "Suggestion proposée", `#${id} · ${content.slice(0, 160)}`, who(interaction.user));
  return ok(interaction, `Merci ! Ta suggestion a été publiée dans ${channel}.`);
}
async function onSuggestionButton(interaction) {
  const [, , action, rawId] = interaction.customId.split(":"), id = Number(rawId), s = getSuggestion(id);
  if (!s || s.guild_id !== interaction.guild.id) return interaction.reply({ content: "Cette suggestion n’existe plus.", ephemeral: true });
  const config = getGuildConfig(interaction.guild.id);
  if (action === "up" || action === "down") {
    if (s.status !== "pending") return interaction.reply({ content: "Les votes sont clos pour cette suggestion.", ephemeral: true });
    const value = voteSuggestion(id, interaction.user.id, action === "up" ? 1 : -1);
    const author = await interaction.client.users.fetch(s.user_id).catch(() => null);
    await interaction.update(suggestionPayload(getSuggestion(id), author));
    return interaction.followUp({ content: value === 0 ? "Ton vote est retiré." : value === 1 ? "Tu votes **pour** cette suggestion." : "Tu votes **contre** cette suggestion.", ephemeral: true });
  }
  const staff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || (config.suggestions.staffRoleId && interaction.member?.roles?.cache?.has(config.suggestions.staffRoleId));
  if (!staff) return interaction.reply({ content: "Seule l’équipe peut accepter ou refuser une suggestion.", ephemeral: true });
  await interaction.deferUpdate();
  await decideSuggestion(interaction.client, id, action === "accept" ? "accepted" : "refused", "", who(interaction.user));
}

/* ---------- Compteurs ---------- */
const counterState = new Map();   // salon -> { last, at }
export function counterValues(guild) {
  const members = guild.members.cache;
  const bots = members.filter(m => m.user.bot).size, full = members.size >= guild.memberCount * 0.9;
  return { membres: nf(guild.memberCount), humains: full ? nf(guild.memberCount - bots) : nf(guild.memberCount), bots: nf(bots), boosts: nf(guild.premiumSubscriptionCount || 0), salons: nf(guild.channels.cache.size), roles: nf(guild.roles.cache.size - 1) };
}
let handles = null;
async function refreshCounters(client) {
  for (const guild of client.guilds.cache.values()) {
    if (handles && !handles(guild.id)) continue;
    const c = getGuildConfig(guild.id).counters; if (!c?.enabled || !c.items.length) continue;
    const values = counterValues(guild);
    for (const item of c.items) {
      const channel = guild.channels.cache.get(item.channelId); if (!channel) continue;
      const name = fill(item.template, values).slice(0, 100), st = counterState.get(channel.id) || {};
      if (channel.name === name || Date.now() - (st.at || 0) < 5.5 * 60_000) continue;   // Discord : 2 renommages par 10 min
      counterState.set(channel.id, { at: Date.now() });
      await channel.setName(name, "Compteur AERO BOT").catch(error => console.error("Compteur impossible :", error.message));
    }
  }
}

/* ---------- Salons vocaux temporaires ---------- */
async function onVoiceState(oldState, newState) {
  const guild = newState.guild, t = getGuildConfig(guild.id).tempvoice;
  // départ d'un salon temporaire : suppression quand il est vide
  if (oldState.channelId && oldState.channelId !== newState.channelId && getTempVoice(oldState.channelId)) {
    const ch = oldState.channel;
    if (ch && ch.members.size === 0) { await ch.delete("Salon vocal temporaire vide").catch(() => {}); removeTempVoice(ch.id); }
  }
  if (!t?.enabled || !t.hubChannelId || newState.channelId !== t.hubChannelId || !newState.member) return;
  const member = newState.member, hub = newState.channel;
  try {
    const channel = await guild.channels.create({
      name: fill(t.nameTemplate, { pseudo: member.displayName, user: member.displayName }).slice(0, 100) || `Salon de ${member.displayName}`,
      type: ChannelType.GuildVoice, parent: t.categoryId || hub.parentId || undefined, userLimit: t.userLimit || undefined,
      permissionOverwrites: [{ id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect] }],
      reason: `Salon temporaire de ${member.user.tag}`
    });
    addTempVoice(channel.id, guild.id, member.id);
    await member.voice.setChannel(channel).catch(async () => { await channel.delete().catch(() => {}); removeTempVoice(channel.id); });
    addLog(guild.id, "salons", "Salon vocal temporaire créé", `🔊 ${channel.name}`, who(member.user));
  } catch (error) { console.error("Salon vocal temporaire impossible :", error.message); }
}

/* ---------- Départs ---------- */
async function onMemberLeave(member) {
  const l = getGuildConfig(member.guild.id).leave; if (!l?.enabled || !l.channelId) return;
  const channel = member.guild.channels.cache.get(l.channelId); if (!channel?.isTextBased()) return;
  const text = fill(l.message, { user: `**${display(member.user)}**`, pseudo: display(member.user), server: member.guild.name, memberCount: nf(member.guild.memberCount) });
  const embed = new EmbedBuilder().setColor(parseInt(l.embedColor.slice(1), 16)).setDescription(text).setThumbnail(member.user.displayAvatarURL({ size: 128 })).setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

/* =============================== Branchement =============================== */
export async function handleModuleCommand(interaction, config) {
  const name = interaction.commandName;
  if (!MODULE_COMMANDS.has(name)) return false;
  const on = { niveau: config.levels?.enabled, classement: config.levels?.enabled, suggestion: config.suggestions?.enabled }[name] ?? config.moderation?.enabled;
  if (!on) { await interaction.reply({ content: "Ce module est désactivé dans le panneau.", ephemeral: true }); return true; }
  try {
    if (name === "niveau" || name === "classement") await handleLevels(interaction);
    else if (name === "suggestion") await handleSuggestionCommand(interaction, config);
    else await handleModeration(interaction, config);
  } catch (error) {
    console.error(`Commande /${name} impossible :`, error);
    const text = "La commande a échoué : vérifie les permissions et la position du rôle du bot.";
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: text, ephemeral: true }).catch(() => {}); else await interaction.reply({ content: text, ephemeral: true }).catch(() => {});
  }
  return true;
}
export function registerModules(bot, handlesGuild) {
  handles = handlesGuild;
  bot.on("messageCreate", async message => {
    if (!message.guild || message.author.bot || message.webhookId) return;
    const config = getGuildConfig(message.guild.id);
    try {
      if (config.autoresponder?.enabled && config.autoresponder.items.length) await onMessageResponder(message, config);
      if (config.levels?.enabled) await onMessageLevels(message, config);
    } catch (error) { console.error("Module messages :", error.message); }
  });
  bot.on("interactionCreate", interaction => { if (interaction.isButton() && interaction.customId.startsWith("aero:sugg:")) onSuggestionButton(interaction).catch(error => console.error("Suggestion :", error.message)); });
  bot.on("voiceStateUpdate", (oldState, newState) => onVoiceState(oldState, newState).catch(error => console.error("Vocal temporaire :", error.message)));
  bot.on("guildMemberRemove", member => onMemberLeave(member).catch(() => {}));
  bot.once("clientReady", async () => {
    // salons temporaires restés vides pendant un redémarrage
    for (const item of listTempVoice()) {
      if (!bot.guilds.cache.has(item.guild_id) || (handles && !handles(item.guild_id))) continue;
      const channel = bot.guilds.cache.get(item.guild_id)?.channels.cache.get(item.channel_id);
      if (!channel) removeTempVoice(item.channel_id);
      else if (channel.members.size === 0) { await channel.delete("Salon vocal temporaire vide").catch(() => {}); removeTempVoice(item.channel_id); }
    }
    // membres en cache pour les compteurs humains / bots
    for (const guild of bot.guilds.cache.values()) if (getGuildConfig(guild.id).counters?.enabled) await guild.members.fetch().catch(() => {});
    refreshCounters(bot);
    setInterval(() => refreshCounters(bot), 6 * 60_000).unref();
  });
}
