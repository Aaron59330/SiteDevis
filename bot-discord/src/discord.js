import crypto from "node:crypto";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder,
  GatewayIntentBits, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle
} from "discord.js";
import {
  addTicket, castPollVote, claimTicket, closePollRecord, closeTicket, createGiveawayRecord, createPollRecord,
  deleteGiveawayRecord, deletePollRecord, drawGiveaway, enterGiveaway, getGiveaway, getGiveawayEntryCount, getPoll,
  getPollVoteCounts, getOpenTicket, getTicketByChannel, listConfiguredGuildIds, listDueGiveaways, listDuePolls,
  getGuildConfig, listGiveaways, listOpenTickets, listPolls, reopenTicket, saveGuildConfig,
  setGiveawayMessageId, setPollMessageId
} from "./database.js";

export async function fetchFiveMStatus(settings) {
  const host = String(settings.host || "").trim();
  if (!host || /[\s/@?#]/.test(host) || host.includes("://")) throw new Error("Indique un nom d’hôte ou une adresse IP FiveM valide, sans http:// ni chemin.");
  const base = `${settings.protocol === "https" ? "https" : "http"}://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${Number(settings.port) || 30120}`;
  let lastError;
  for (const endpoint of ["dynamic.json", "info.json"]) {
    try {
      const response = await fetch(`${base}/${endpoint}`, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const vars = data.vars || {};
      const clients = Number(data.clients ?? data.clientsCount ?? vars.clients ?? vars.sv_maxClients ?? NaN);
      const maxClients = Number(data.sv_maxclients ?? data.sv_maxClients ?? vars.sv_maxClients ?? vars.sv_maxclients ?? NaN);
      return {
        online: true,
        hostname: String(data.hostname || data.serverName || vars.sv_projectName || "Serveur FiveM").slice(0, 180),
        players: Number.isFinite(clients) ? clients : null,
        maxPlayers: Number.isFinite(maxClients) ? maxClients : null,
        gameType: String(data.gametype || vars.gametype || vars.sv_projectDesc || "").slice(0, 100),
        map: String(data.mapname || vars.mapname || "").slice(0, 100),
        checkedAt: Date.now()
      };
    } catch (error) { lastError = error; }
  }
  return { online: false, hostname: "Serveur FiveM", players: null, maxPlayers: null, gameType: "", map: "", checkedAt: Date.now(), error: lastError?.message || "Serveur inaccessible" };
}

function fiveMEmbed(settings, status) {
  const embed = new EmbedBuilder().setColor(parseInt(settings.embedColor.slice(1), 16)).setTitle(settings.panelTitle || "État du serveur FiveM")
    .setDescription(status.online ? `🟢 **En ligne**\n${status.hostname}` : "🔴 **Hors ligne ou inaccessible**");
  const players = status.players === null ? "Indisponible" : `${status.players}${status.maxPlayers === null ? "" : ` / ${status.maxPlayers}`}`;
  embed.addFields({ name: "Joueurs", value: players, inline: true });
  if (status.gameType) embed.addFields({ name: "Mode", value: status.gameType, inline: true });
  if (status.map) embed.addFields({ name: "Carte", value: status.map, inline: true });
  embed.setFooter({ text: `Actualisé · ${new Date(status.checkedAt).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" })}` });
  return embed;
}

export async function publishFiveMStatusPanel(guildId, settings, existingMessageId = "") {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("Le bot n’est pas présent sur ce serveur.");
  const channel = guild.channels.cache.get(settings.panelChannelId);
  if (!channel?.isTextBased()) throw new Error("Choisis un salon textuel valide pour le statut FiveM.");
  const permissions = channel.permissionsFor(bot.user);
  if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) throw new Error("Le bot doit pouvoir envoyer des messages et intégrer des liens dans ce salon.");
  const status = await fetchFiveMStatus(settings);
  const payload = { embeds: [fiveMEmbed(settings, status)] };
  if (settings.connectUrl) {
    payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Rejoindre le serveur").setStyle(ButtonStyle.Link).setURL(settings.connectUrl))];
  }
  if (existingMessageId) {
    const oldMessage = await channel.messages.fetch(existingMessageId).catch(() => null);
    if (oldMessage) return oldMessage.edit(payload);
  }
  return channel.send(payload);
}

export const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
const lastFiveMPanelRefresh = new Map();

function canGrantWithButton(role, guild) {
  const botMember = guild.members.me;
  const protectedPermissions = [
    PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.MentionEveryone
  ];
  return Boolean(role && role.id !== guild.id && !role.managed && botMember?.permissions.has(PermissionFlagsBits.ManageRoles) && role.editable &&
    !protectedPermissions.some(permission => role.permissions.has(permission)));
}

function pollPayload(poll) {
  const counts = new Map(getPollVoteCounts(poll.id).map(row => [row.option_index, row.count]));
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const closed = Boolean(poll.closed_at) || (poll.ends_at && poll.ends_at <= Date.now());
  const lines = poll.options.map((option, index) => `**${index + 1}. ${option}** — ${counts.get(index) || 0} vote(s)`).join("\n");
  const embed = new EmbedBuilder().setColor(parseInt((poll.embed_color || "#ff941c").slice(1), 16)).setTitle(poll.question)
    .setDescription(`${lines}\n\n**Total : ${total} vote(s)**${poll.ends_at ? `\nFin : <t:${Math.floor(poll.ends_at / 1000)}:R>` : ""}`)
    .setFooter({ text: closed ? "Sondage clôturé · Les résultats restent consultables." : "Clique sur un choix pour voter · Ton vote peut être modifié." });
  if (poll.image_url) embed.setImage(poll.image_url);
  const components = [];
  for (let start = 0; start < poll.options.length; start += 5) {
    const row = new ActionRowBuilder().addComponents(poll.options.slice(start, start + 5).map((option, offset) => {
      const index = start + offset;
      return new ButtonBuilder().setCustomId(`atelier:poll:${poll.id}:${index}`).setLabel(option).setStyle(ButtonStyle.Secondary).setDisabled(Boolean(closed));
    }));
    components.push(row);
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

async function updatePollMessage(poll) {
  if (!poll?.message_id) return;
  const channel = bot.channels.cache.get(poll.channel_id);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(poll.message_id).catch(() => null);
  if (message) await message.edit(pollPayload(poll));
}

export async function publishPoll(guildId, input) {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("Le bot n’est pas présent sur ce serveur.");
  const channel = guild.channels.cache.get(input.channelId);
  if (!channel?.isTextBased()) throw new Error("Choisis un salon textuel valide pour le sondage.");
  const permissions = channel.permissionsFor(bot.user);
  if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) throw new Error("Le bot doit pouvoir envoyer des messages et intégrer des liens dans ce salon.");
  const poll = {
    id: crypto.randomUUID(), guildId, channelId: input.channelId, question: input.question,
    optionsJson: JSON.stringify(input.options), embedColor: input.embedColor || "#ff941c", imageUrl: input.imageUrl || "",
    createdBy: input.createdBy, createdAt: Date.now(),
    endsAt: Date.now() + input.durationHours * 60 * 60 * 1000
  };
  createPollRecord(poll);
  try {
    const message = await channel.send(pollPayload({ ...poll, options: input.options, ends_at: poll.endsAt, closed_at: null, embed_color: poll.embedColor, image_url: poll.imageUrl }));
    setPollMessageId(poll.id, message.id);
    return { pollId: poll.id, message };
  } catch (error) { deletePollRecord(poll.id); throw error; }
}

export async function finishPoll(pollId) {
  const poll = getPoll(pollId);
  if (!poll || !closePollRecord(pollId)) return false;
  await updatePollMessage(getPoll(pollId)).catch(error => console.error("Mise à jour du sondage clôturé impossible :", error.message));
  return true;
}

function giveawayPayload(giveaway, ended = false) {
  const entries = getGiveawayEntryCount(giveaway.id);
  const embed = new EmbedBuilder().setColor(parseInt((giveaway.embed_color || "#ff941c").slice(1), 16)).setTitle("🎁 Tirage au sort")
    .setDescription(`**Lot : ${giveaway.prize}**\n\nGagnant(s) : **${giveaway.winners_count}**\nParticipants : **${entries}**${ended ? "\n\n🔒 **Terminé**" : `\n\nFin : <t:${Math.floor(giveaway.ends_at / 1000)}:R>`}`)
    .setFooter({ text: ended ? "Tirage terminé" : "Clique sur Participer pour t’inscrire." });
  if (giveaway.image_url) embed.setImage(giveaway.image_url);
  return { embeds: [embed], components: ended ? [] : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`atelier:giveaway:${giveaway.id}:join`).setLabel("Participer").setStyle(ButtonStyle.Success))], allowedMentions: { parse: [] } };
}

async function updateGiveawayMessage(giveaway, ended = false, winners = []) {
  if (!giveaway?.message_id) return;
  const channel = bot.channels.cache.get(giveaway.channel_id);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  if (!message) return;
  const payload = giveawayPayload(giveaway, ended);
  if (ended) {
    payload.content = winners.length ? `🎉 Félicitations ${winners.map(id => `<@${id}>`).join(", ")} ! Vous remportez **${giveaway.prize}**.` : `Le tirage pour **${giveaway.prize}** est terminé : aucun participant ne s’est inscrit.`;
    payload.allowedMentions = { users: winners };
  }
  await message.edit(payload);
}

export async function publishGiveaway(guildId, input) {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("Le bot n’est pas présent sur ce serveur.");
  const channel = guild.channels.cache.get(input.channelId);
  if (!channel?.isTextBased()) throw new Error("Choisis un salon textuel valide pour le tirage.");
  const permissions = channel.permissionsFor(bot.user);
  if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) throw new Error("Le bot doit pouvoir envoyer des messages et intégrer des liens dans ce salon.");
  const giveaway = {
    id: crypto.randomUUID(), guild_id: guildId, channel_id: input.channelId, message_id: "",
    prize: input.prize, winners_count: input.winnersCount, created_by: input.createdBy,
    embed_color: input.embedColor || "#ff941c", image_url: input.imageUrl || "",
    created_at: Date.now(), ends_at: Date.now() + input.durationHours * 60 * 60 * 1000,
    ended_at: null, winners_json: "[]"
  };
  createGiveawayRecord({ id: giveaway.id, guildId, channelId: input.channelId, prize: input.prize, winnersCount: input.winnersCount, embedColor: giveaway.embed_color, imageUrl: giveaway.image_url, createdBy: input.createdBy, createdAt: giveaway.created_at, endsAt: giveaway.ends_at });
  try {
    const message = await channel.send(giveawayPayload(giveaway));
    setGiveawayMessageId(giveaway.id, message.id);
    return { giveawayId: giveaway.id, message };
  } catch (error) { deleteGiveawayRecord(giveaway.id); throw error; }
}

export async function finishGiveaway(giveawayId) {
  const giveaway = getGiveaway(giveawayId);
  if (!giveaway) return { ended: false, winners: [] };
  const result = drawGiveaway(giveawayId, (entrants, winnersCount) => {
    for (let index = entrants.length - 1; index > 0; index--) {
      const other = crypto.randomInt(index + 1);
      [entrants[index], entrants[other]] = [entrants[other], entrants[index]];
    }
    return entrants.slice(0, Math.min(winnersCount, entrants.length));
  });
  if (!result.ended) return result;
  const closed = getGiveaway(giveawayId);
  await updateGiveawayMessage(closed, true, result.winners).catch(error => console.error("Mise à jour du tirage clôturé impossible :", error.message));
  return result;
}

bot.once("clientReady", () => console.log(`Bot connecté : ${bot.user.tag}`));
bot.on("error", error => console.error("Erreur Discord :", error));

function commandDefinitions(config) {
  const commands = [];
  if (config.commands.clearMessages) {
    commands.push(new SlashCommandBuilder()
      .setName("clearmessages")
      .setDescription("Supprime des messages récents dans ce salon.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption(option => option.setName("nombre").setDescription("Nombre de messages à supprimer (1 à 100)." ).setRequired(true).setMinValue(1).setMaxValue(100)));
  }
  if (config.commands.slowmode) {
    commands.push(new SlashCommandBuilder()
      .setName("slowmode")
      .setDescription("Règle le délai entre les messages dans ce salon.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addIntegerOption(option => option.setName("secondes").setDescription("Délai en secondes (0 pour désactiver)." ).setRequired(true).setMinValue(0).setMaxValue(21600)));
  }
  if (config.commands.userInfo) {
    commands.push(new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("Affiche les informations d’un membre.")
      .addUserOption(option => option.setName("membre").setDescription("Membre à consulter.")));
  }
  if (config.commands.serverInfo) {
    commands.push(new SlashCommandBuilder().setName("serverinfo").setDescription("Affiche les informations du serveur."));
  }
  if (config.commands.avatar) {
    commands.push(new SlashCommandBuilder()
      .setName("avatar")
      .setDescription("Affiche l’avatar d’un membre en grand.")
      .addUserOption(option => option.setName("membre").setDescription("Membre à consulter.")));
  }
  if (config.fivem?.enabled && config.fivem.commandEnabled) {
    commands.push(new SlashCommandBuilder().setName("fivemstatus").setDescription("Affiche l’état actuel du serveur FiveM."));
  }
  return commands.map(command => command.toJSON());
}

export async function syncGuildCommands(guildId, config = getGuildConfig(guildId)) {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("Le bot n’est pas présent sur ce serveur.");
  await guild.commands.set(commandDefinitions(config));
}

async function handleSlashCommand(interaction) {
  const config = getGuildConfig(interaction.guildId);
  const command = interaction.commandName;
  const enabled = {
    clearmessages: config.commands.clearMessages,
    slowmode: config.commands.slowmode,
    userinfo: config.commands.userInfo,
    serverinfo: config.commands.serverInfo,
    avatar: config.commands.avatar,
    fivemstatus: config.fivem?.enabled && config.fivem.commandEnabled
  }[command];
  if (!enabled) return interaction.reply({ content: "Cette commande est désactivée dans le panneau web.", ephemeral: true });

  try {
    if (command === "clearmessages") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "Il faut la permission Gérer les messages.", ephemeral: true });
      if (typeof interaction.channel?.bulkDelete !== "function") return interaction.reply({ content: "Cette commande ne fonctionne que dans un salon textuel classique.", ephemeral: true });
      const amount = interaction.options.getInteger("nombre", true);
      await interaction.deferReply({ ephemeral: true });
      let deletedCount = 0;
      if (amount === 1) {
        const latest = await interaction.channel.messages.fetch({ limit: 1 });
        const message = latest.first();
        if (message) { await message.delete(); deletedCount = 1; }
      } else {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        deletedCount = deleted.size;
      }
      return interaction.editReply(`🧹 ${deletedCount} message(s) supprimé(s). Les messages de plus de 14 jours ne peuvent pas être effacés en lot.`);
    }

    if (command === "slowmode") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: "Il faut la permission Gérer les salons.", ephemeral: true });
      if (typeof interaction.channel?.setRateLimitPerUser !== "function") return interaction.reply({ content: "Ce salon ne prend pas en charge le mode lent.", ephemeral: true });
      const seconds = interaction.options.getInteger("secondes", true);
      await interaction.channel.setRateLimitPerUser(seconds, `Réglé par ${interaction.user.tag}`);
      return interaction.reply({ content: seconds ? `🐢 Mode lent réglé sur ${seconds} seconde(s).` : "✅ Mode lent désactivé.", ephemeral: true });
    }

    if (command === "userinfo") {
      const user = interaction.options.getUser("membre") || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const embed = new EmbedBuilder().setColor(0x7c6cff).setTitle(`Membre · ${user.username}`).setThumbnail(user.displayAvatarURL({ size: 256 })).addFields(
        { name: "Identifiant", value: user.id, inline: true },
        { name: "Compte créé", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "Arrivée sur le serveur", value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "Information indisponible", inline: true }
      );
      if (member) {
        const roles = member.roles.cache.filter(role => role.id !== interaction.guildId).sort((a, b) => b.position - a.position).map(role => role.toString());
        embed.addFields({ name: "Rôles", value: roles.join(", ").slice(0, 1000) || "Aucun rôle" });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (command === "serverinfo") {
      const owner = await interaction.guild.fetchOwner().catch(() => null);
      const embed = new EmbedBuilder().setColor(0x7c6cff).setTitle(interaction.guild.name)
        .addFields(
          { name: "Membres", value: String(interaction.guild.memberCount), inline: true },
          { name: "Propriétaire", value: owner ? owner.user.tag : "Indisponible", inline: true },
          { name: "Créé le", value: `<t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:D>`, inline: true },
          { name: "Identifiant", value: interaction.guildId, inline: true }
        );
      const guildIcon = interaction.guild.iconURL({ size: 256 });
      if (guildIcon) embed.setThumbnail(guildIcon);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (command === "avatar") {
      const user = interaction.options.getUser("membre") || interaction.user;
      const embed = new EmbedBuilder().setColor(0x7c6cff).setTitle(`Avatar · ${user.username}`).setImage(user.displayAvatarURL({ size: 1024 }));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (command === "fivemstatus") {
      await interaction.deferReply({ ephemeral: true });
      const status = await fetchFiveMStatus(config.fivem);
      const response = { embeds: [fiveMEmbed(config.fivem, status)] };
      if (status.online && config.fivem.connectUrl) response.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Rejoindre le serveur").setStyle(ButtonStyle.Link).setURL(config.fivem.connectUrl))];
      return interaction.editReply(response);
    }
  } catch (error) {
    console.error(`Commande /${command} impossible :`, error);
    const message = "La commande a échoué. Vérifie les permissions du bot et du salon.";
    if (interaction.deferred || interaction.replied) return interaction.editReply(message).catch(() => {});
    return interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
}

bot.on("guildMemberAdd", async member => {
  const config = getGuildConfig(member.guild.id);
  if (config.autorole.enabled && config.autorole.roleId) {
    try { await member.roles.add(config.autorole.roleId, "Rôle automatique configuré dans le panneau"); }
    catch (error) { console.error(`Impossible d’attribuer le rôle sur ${member.guild.id}:`, error.message); }
  }
  if (config.welcome.enabled && config.welcome.channelId) {
    const channel = member.guild.channels.cache.get(config.welcome.channelId);
    if (channel?.isTextBased()) {
      const message = config.welcome.message
        .replaceAll("{user}", config.welcome.embedEnabled ? member.displayName : `<@${member.id}>`)
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{memberCount}", String(member.guild.memberCount));
      try {
        const payload = { allowedMentions: { users: config.welcome.message.includes("{user}") ? [member.id] : [] } };
        if (config.welcome.embedEnabled) {
          if (config.welcome.message.includes("{user}")) payload.content = `<@${member.id}>`;
          const embed = new EmbedBuilder().setColor(parseInt(config.welcome.embedColor.slice(1), 16)).setDescription(message);
          if (config.welcome.imageUrl) embed.setImage(config.welcome.imageUrl);
          if (config.welcome.avatarEnabled && config.welcome.avatarUrl) embed.setAuthor({ name: member.guild.name, iconURL: config.welcome.avatarUrl });
          if (config.welcome.footerEnabled && config.welcome.footerText) embed.setFooter({ text: config.welcome.footerText });
          payload.embeds = [embed];
        } else {
          payload.content = message;
          if (config.welcome.imageUrl) payload.embeds = [new EmbedBuilder().setImage(config.welcome.imageUrl)];
        }
        await channel.send(payload);
      }
      catch (error) { console.error(`Impossible d’envoyer l’accueil sur ${member.guild.id}:`, error.message); }
    }
  }
});

bot.on("messageCreate", async message => {
  if (!message.guild || message.author.bot || message.webhookId) return;
  const config = getGuildConfig(message.guild.id);
  if (!config.anonymous?.enabled || message.channelId !== config.anonymous.channelId) return;

  const permissions = message.channel.permissionsFor(bot.user);
  if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.ManageMessages) || (message.attachments.size > 0 && !permissions.has(PermissionFlagsBits.AttachFiles))) {
    console.error(`Relais anonyme indisponible dans ${message.guild.id}/${message.channelId} : permissions manquantes.`);
    return;
  }

  const attachments = [...message.attachments.values()].slice(0, 10);
  const stickerText = [...message.stickers.values()].map(sticker => `[Autocollant : ${sticker.name}]`).join("\n");
  const text = [message.content, stickerText].filter(Boolean).join("\n").slice(0, 2000);
  const anonymousFiles = attachments.map((attachment, index) => {
    const extension = String(attachment.name || "").match(/\.[a-z0-9]{1,10}$/i)?.[0] || "";
    return { attachment: attachment.url, name: `fichier-${index + 1}${extension}` };
  });

  try { await message.delete(); }
  catch (error) {
    console.error(`Suppression du message original impossible dans ${message.guild.id}/${message.channelId}:`, error.message);
    return;
  }

  const payload = { content: text || undefined, files: anonymousFiles, allowedMentions: { parse: [] } };
  try { await message.channel.send(payload); }
  catch (error) {
    console.error(`Relais anonyme avec fichiers impossible dans ${message.guild.id}/${message.channelId}:`, error.message);
    const fallback = `${text || ""}${anonymousFiles.length ? "\n📎 Un ou plusieurs fichiers joints n’ont pas pu être relayés." : ""}`.trim().slice(0, 2000);
    if (fallback) await message.channel.send({ content: fallback, allowedMentions: { parse: [] } }).catch(fallbackError => {
      console.error(`Relais anonyme de secours impossible dans ${message.guild.id}/${message.channelId}:`, fallbackError.message);
    });
  }
});

function ticketActionRow(config, guild, { closed = false, claimedBy = null } = {}) {
  const row = new ActionRowBuilder();
  if (closed) {
    if (config.tickets.reopenEnabled) {
      row.addComponents(new ButtonBuilder().setCustomId("atelier:ticket:reopen").setLabel("Réouvrir le ticket").setStyle(ButtonStyle.Success));
    }
    return row.components.length ? row : null;
  }
  if (config.tickets.claimEnabled) {
    const member = claimedBy ? guild.members.cache.get(claimedBy) : null;
    const label = claimedBy ? `Pris par ${(member?.displayName || "un membre").slice(0, 60)}` : "Prendre le ticket";
    row.addComponents(new ButtonBuilder().setCustomId("atelier:ticket:claim").setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(Boolean(claimedBy)));
  }
  row.addComponents(new ButtonBuilder().setCustomId("atelier:ticket:close").setLabel("Fermer le ticket").setStyle(ButtonStyle.Danger));
  return row;
}

function isSupportStaff(interaction, config) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    (config.tickets.supportRoleId && interaction.member?.roles?.cache?.has(config.tickets.supportRoleId)));
}

async function sendTicketLog(guild, config, message, files = []) {
  const settings = config.tickets;
  if (!settings.logsEnabled && !files.length) return;
  const channel = guild.channels.cache.get(settings.logChannelId);
  if (!channel?.isTextBased()) return;
  const content = settings.logsEnabled ? message : "📄 Transcription du ticket fermé.";
  try { await channel.send({ content, files, allowedMentions: { parse: [] } }); }
  catch (error) { console.error(`Impossible d’envoyer un journal de ticket sur ${guild.id}:`, error.message); }
}

async function makeTranscript(channel, ticket) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const lines = [
    `Transcription de #${channel.name}`,
    `Serveur : ${channel.guild.name}`,
    `Créé par : ${ticket.user_id}`,
    `Type : ${ticket.ticket_type || "non précisé"}`,
    "─".repeat(48),
    ...messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(message => {
      const stamp = new Date(message.createdTimestamp).toLocaleString("fr-FR", { timeZone: "UTC" });
      const text = message.content || "[message sans texte]";
      const attachments = [...message.attachments.values()].map(item => item.url).join(" ");
      return `[${stamp} UTC] ${message.author.tag}: ${text}${attachments ? `\n  Fichiers : ${attachments}` : ""}`;
    })
  ];
  const filename = `transcription-${channel.name}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 90) + ".txt";
  return new AttachmentBuilder(Buffer.from(lines.join("\n"), "utf8"), { name: filename });
}

async function closeTicketProcess(guild, channel, ticket, config, reason, { automatic = false } = {}) {
  let transcript = null;
  if (config.tickets.transcriptsEnabled) {
    try { transcript = await makeTranscript(channel, ticket); }
    catch (error) { console.error("Création de transcription impossible :", error.message); }
  }
  try {
    await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false });
    if (!channel.name.startsWith("ferme-")) await channel.setName(`ferme-${channel.name}`.slice(0, 100));
  } catch (error) { console.error("Verrouillage du ticket impossible :", error.message); }
  closeTicket(channel.id);
  await sendTicketLog(guild, config, `🔒 Ticket ${channel} fermé : ${reason}.`, transcript ? [transcript] : []);
  if (automatic) {
    const row = ticketActionRow(config, guild, { closed: true });
    await channel.send({ content: `🔒 Ticket fermé automatiquement : ${reason}.`, components: row ? [row] : [] }).catch(error => console.error("Annonce de fermeture automatique impossible :", error.message));
  }
}

async function createTicket(interaction, ticketType, formAnswer = "") {
  const config = getGuildConfig(interaction.guild.id);
  if (!config.tickets.enabled) return interaction.reply({ content: "Les tickets sont actuellement désactivés.", ephemeral: true });
  const selectedType = config.tickets.ticketTypes.find(item => item.id === ticketType);
  if (!selectedType) return interaction.reply({ content: "Ce type de ticket n’est plus disponible. Publie à nouveau le panneau.", ephemeral: true });
  const existing = getOpenTicket(interaction.guild.id, interaction.user.id);
  if (existing) {
    const channel = interaction.guild.channels.cache.get(existing.channel_id);
    if (channel) return interaction.reply({ content: `Tu as déjà un ticket ouvert : ${channel}`, ephemeral: true });
    closeTicket(existing.channel_id);
  }

  await interaction.deferReply({ ephemeral: true });
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: bot.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
  ];
  if (config.tickets.supportRoleId) overwrites.push({ id: config.tickets.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  try {
    const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 45);
    const typeName = selectedType.id.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30);
    const channel = await interaction.guild.channels.create({
      name: `ticket-${typeName}-${username}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: config.tickets.categoryId || undefined,
      permissionOverwrites: overwrites,
      reason: `Ticket « ${selectedType.label} » créé par ${interaction.user.tag}`
    });
    addTicket(channel.id, interaction.guild.id, interaction.user.id, selectedType.id);
    const row = ticketActionRow(config, interaction.guild);
    const supportPing = config.tickets.supportRoleId ? `<@&${config.tickets.supportRoleId}> ` : "";
    const answer = formAnswer ? `\n**${selectedType.formQuestion || "Détails de la demande"}**\n${formAnswer}` : "";
    await channel.send({
      content: `${supportPing}**${selectedType.emoji} ${selectedType.label}**\n${selectedType.description}\nBonjour <@${interaction.user.id}> ! Explique ta demande ici.${answer}`,
      components: row ? [row] : [],
      allowedMentions: { users: [interaction.user.id], roles: config.tickets.supportRoleId ? [config.tickets.supportRoleId] : [] }
    });
    await sendTicketLog(interaction.guild, config, `🎫 Ticket ${channel} créé par ${interaction.user} · ${selectedType.label}.`);
    await interaction.editReply({ content: `Ton ticket « ${selectedType.label} » est prêt : ${channel}` });
  } catch (error) {
    console.error("Création de ticket impossible :", error);
    await interaction.editReply({ content: "Je n’ai pas pu créer le ticket. Vérifie les permissions du bot et la catégorie configurée." }).catch(() => {});
  }
}

async function handleTicketTypeSelection(interaction, typeId) {
  const config = getGuildConfig(interaction.guild.id);
  if (!config.tickets.enabled) return interaction.reply({ content: "Les tickets sont actuellement désactivés.", ephemeral: true });
  const selectedType = config.tickets.ticketTypes.find(item => item.id === typeId);
  if (!selectedType) return interaction.reply({ content: "Ce type de ticket n’est plus disponible. Publie à nouveau le panneau.", ephemeral: true });
  if (!config.tickets.formsEnabled) return createTicket(interaction, typeId);

  const question = selectedType.formQuestion || "Décris ta demande.";
  const input = new TextInputBuilder()
    .setCustomId("details")
    .setLabel(question)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  const modal = new ModalBuilder()
    .setCustomId(`atelier:ticket:form:${selectedType.id}`)
    .setTitle(`Ticket : ${selectedType.label}`.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

bot.on("interactionCreate", async interaction => {
  if (!interaction.guild) return;
  if (interaction.isChatInputCommand()) return handleSlashCommand(interaction);
  if (interaction.isStringSelectMenu() && interaction.customId === "atelier:ticket:type") {
    return handleTicketTypeSelection(interaction, interaction.values[0]);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith("atelier:ticket:form:")) {
    const ticketType = interaction.customId.slice("atelier:ticket:form:".length);
    return createTicket(interaction, ticketType, interaction.fields.getTextInputValue("details"));
  }
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("atelier:message-role:")) {
    const roleId = interaction.customId.slice("atelier:message-role:".length);
    if (!/^\d{17,20}$/.test(roleId)) return interaction.reply({ content: "Ce bouton de rôle n’est pas valide.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.id === interaction.guild.id || role.managed) return interaction.editReply("Ce rôle n’est plus disponible.");
      if (!canGrantWithButton(role, interaction.guild)) return interaction.editReply("Ce rôle ne peut pas être donné par bouton. Choisis un rôle sans permission d’administration ou de modération, placé sous le rôle du bot.");
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member.roles.cache.has(role.id)) return interaction.editReply(`Tu as déjà le rôle ${role.name}.`);
      await member.roles.add(role, `Rôle obtenu via un bouton de message par ${interaction.user.tag}`);
      return interaction.editReply(`✅ Le rôle **${role.name}** t’a été attribué.`);
    } catch (error) {
      console.error("Attribution du rôle par bouton impossible :", error);
      return interaction.editReply("Impossible d’attribuer ce rôle. Vérifie les permissions du bot.").catch(() => {});
    }
  }
  if (interaction.customId.startsWith("atelier:poll:")) {
    const [, , pollId, optionValue] = interaction.customId.split(":");
    const optionIndex = Number.parseInt(optionValue, 10);
    const poll = getPoll(pollId);
    if (!poll || poll.guild_id !== interaction.guild.id || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
      return interaction.reply({ content: "Ce sondage n’est plus disponible.", ephemeral: true });
    }
    if (poll.closed_at || (poll.ends_at && poll.ends_at <= Date.now())) {
      await finishPoll(poll.id);
      return interaction.reply({ content: "Ce sondage est terminé.", ephemeral: true });
    }
    if (!castPollVote(poll.id, interaction.user.id, optionIndex)) return interaction.reply({ content: "Ce sondage est terminé.", ephemeral: true });
    await updatePollMessage(getPoll(poll.id)).catch(error => console.error("Actualisation des résultats du sondage impossible :", error.message));
    return interaction.reply({ content: `Ton vote pour **${poll.options[optionIndex]}** est enregistré. Tu peux cliquer sur un autre choix pour le modifier.`, ephemeral: true });
  }
  if (interaction.customId.startsWith("atelier:giveaway:") && interaction.customId.endsWith(":join")) {
    const giveawayId = interaction.customId.slice("atelier:giveaway:".length, -":join".length);
    const giveaway = getGiveaway(giveawayId);
    if (!giveaway || giveaway.guild_id !== interaction.guild.id) return interaction.reply({ content: "Ce tirage n’est plus disponible.", ephemeral: true });
    if (giveaway.ended_at || giveaway.ends_at <= Date.now()) {
      await finishGiveaway(giveaway.id);
      return interaction.reply({ content: "Les inscriptions à ce tirage sont terminées.", ephemeral: true });
    }
    const joined = enterGiveaway(giveaway.id, interaction.user.id);
    if (!joined) return interaction.reply({ content: "Tu es déjà inscrit à ce tirage.", ephemeral: true });
    await updateGiveawayMessage(getGiveaway(giveaway.id)).catch(error => console.error("Actualisation du nombre de participants impossible :", error.message));
    return interaction.reply({ content: `🎁 Tu participes au tirage pour **${giveaway.prize}** !`, ephemeral: true });
  }
  if (interaction.customId === "atelier:ticket:create") {
    const config = getGuildConfig(interaction.guild.id);
    return handleTicketTypeSelection(interaction, config.tickets.ticketTypes[0]?.id);
  }

  const config = getGuildConfig(interaction.guild.id);
  if (interaction.customId === "atelier:ticket:claim") {
    if (!config.tickets.claimEnabled) return interaction.reply({ content: "La prise en charge des tickets est désactivée.", ephemeral: true });
    if (!isSupportStaff(interaction, config)) return interaction.reply({ content: "Seule l’équipe support peut prendre ce ticket.", ephemeral: true });
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Ce ticket n’est plus ouvert.", ephemeral: true });
    if (ticket.claimed_by) return interaction.reply({ content: "Ce ticket a déjà été pris en charge.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    claimTicket(interaction.channelId, interaction.user.id);
    const row = ticketActionRow(config, interaction.guild, { claimedBy: interaction.user.id });
    await interaction.message.edit({ components: row ? [row] : [] });
    await sendTicketLog(interaction.guild, config, `🧑‍🔧 ${interaction.user} a pris en charge ${interaction.channel}.`);
    return interaction.editReply({ content: `Tu as pris en charge ${interaction.channel}.` });
  }

  if (interaction.customId === "atelier:ticket:close") {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Ce ticket est déjà fermé.", ephemeral: true });
    if (ticket.user_id !== interaction.user.id && !isSupportStaff(interaction, config)) {
      return interaction.reply({ content: "Seul l’auteur du ticket ou l’équipe support peut le fermer.", ephemeral: true });
    }
    await interaction.deferUpdate();
    await closeTicketProcess(interaction.guild, interaction.channel, ticket, config, `fermé par ${interaction.user.tag}`);
    await interaction.channel.send(`🔒 Ticket fermé par ${interaction.user}.`).catch(() => {});
    const row = ticketActionRow(config, interaction.guild, { closed: true });
    return interaction.message.edit({ components: row ? [row] : [] });
  }

  if (interaction.customId === "atelier:ticket:reopen") {
    if (!config.tickets.reopenEnabled) return interaction.reply({ content: "La réouverture des tickets est désactivée.", ephemeral: true });
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status !== "closed") return interaction.reply({ content: "Ce ticket n’est pas fermé.", ephemeral: true });
    if (ticket.user_id !== interaction.user.id && !isSupportStaff(interaction, config)) {
      return interaction.reply({ content: "Seul l’auteur du ticket ou l’équipe support peut le rouvrir.", ephemeral: true });
    }
    await interaction.deferUpdate();
    try {
      await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: true });
      if (interaction.channel.name.startsWith("ferme-")) await interaction.channel.setName(interaction.channel.name.slice(6));
      reopenTicket(interaction.channelId);
      const row = ticketActionRow(config, interaction.guild, { claimedBy: ticket.claimed_by });
      await sendTicketLog(interaction.guild, config, `🔓 ${interaction.user} a rouvert ${interaction.channel}.`);
      await interaction.channel.send(`🔓 Ticket rouvert par ${interaction.user}.`).catch(() => {});
      return interaction.message.edit({ components: row ? [row] : [] });
    } catch (error) {
      console.error("Réouverture du ticket impossible :", error);
      return interaction.followUp({ content: "Impossible de rouvrir le ticket. Vérifie les permissions du bot.", ephemeral: true }).catch(() => {});
    }
  }
});

async function checkAutoCloseTickets() {
  for (const ticket of listOpenTickets()) {
    const guild = bot.guilds.cache.get(ticket.guild_id);
    if (!guild) continue;
    const config = getGuildConfig(ticket.guild_id);
    if (!config.tickets.autoCloseEnabled) continue;
    const channel = guild.channels.cache.get(ticket.channel_id);
    if (!channel?.isTextBased()) { closeTicket(ticket.channel_id); continue; }
    const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    if (!messages) continue;
    const latest = messages.first()?.createdTimestamp || channel.createdTimestamp;
    const inactivityMs = config.tickets.autoCloseDays * 24 * 60 * 60 * 1000;
    if (latest && Date.now() - latest >= inactivityMs) {
      await closeTicketProcess(guild, channel, ticket, config, `${config.tickets.autoCloseDays} jours d’inactivité`, { automatic: true });
    }
  }
}

bot.once("clientReady", () => {
  setInterval(() => checkAutoCloseTickets().catch(error => console.error("Vérification de fermeture automatique impossible :", error)), 15 * 60 * 1000).unref();
  let activitySweepRunning = false;
  setInterval(async () => {
    if (activitySweepRunning) return;
    activitySweepRunning = true;
    try {
      for (const poll of listDuePolls()) await finishPoll(poll.id);
      for (const giveaway of listDueGiveaways()) await finishGiveaway(giveaway.id);
    } catch (error) { console.error("Clôture automatique des sondages/tirages impossible :", error); }
    finally { activitySweepRunning = false; }
  }, 15_000).unref();
  const refreshing = new Set();
  setInterval(async () => {
    for (const guildId of listConfiguredGuildIds()) {
      const config = getGuildConfig(guildId);
      const settings = config.fivem;
      if (!settings.enabled || !settings.panelEnabled || !settings.autoRefresh || !settings.panelChannelId || refreshing.has(guildId)) continue;
      const now = Date.now();
      if (now - (lastFiveMPanelRefresh.get(guildId) || 0) < settings.refreshSeconds * 1000) continue;
      refreshing.add(guildId);
      lastFiveMPanelRefresh.set(guildId, now);
      try {
        const message = await publishFiveMStatusPanel(guildId, settings, settings.panelMessageId);
        if (message.id !== settings.panelMessageId) {
          config.fivem.panelMessageId = message.id;
          saveGuildConfig(guildId, config);
        }
      } catch (error) { console.error(`Mise à jour du statut FiveM impossible sur ${guildId}:`, error.message); }
      finally { refreshing.delete(guildId); }
    }
  }, 15_000).unref();
});

bot.once("clientReady", async () => {
  for (const guildId of listConfiguredGuildIds()) {
    try { await syncGuildCommands(guildId, getGuildConfig(guildId)); }
    catch (error) { console.error(`Synchronisation des commandes impossible sur ${guildId}:`, error.message); }
  }
});

// Used by the panel when it publishes or updates the public ticket message.
export async function publishTicketPanel(guildId, config) {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("Le bot n’est pas présent sur ce serveur.");
  const channel = guild.channels.cache.get(config.tickets.panelChannelId);
  if (!channel?.isTextBased() || !channel.permissionsFor(bot.user).has(PermissionFlagsBits.SendMessages)) {
    throw new Error("Le bot ne peut pas écrire dans le salon de tickets sélectionné.");
  }
  const embed = new EmbedBuilder()
    .setColor(parseInt(config.tickets.embedColor.slice(1), 16))
    .setTitle(config.tickets.panelTitle)
    .setDescription(config.tickets.panelDescription)
    .setFooter({ text: guild.name });
  if (config.tickets.imageUrl) embed.setImage(config.tickets.imageUrl);
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("atelier:ticket:type")
      .setPlaceholder("Choisis le type de ta demande…")
      .addOptions(config.tickets.ticketTypes.map(type => ({
        label: type.label,
        description: type.description || undefined,
        value: type.id,
        emoji: type.emoji || "🎫"
      })))
  );
  return channel.send({ embeds: [embed], components: [row] });
}

export async function publishCustomMessage(guildId, data) {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("Le bot n’est pas présent sur ce serveur.");
  const channel = guild.channels.cache.get(data.channelId);
  if (!channel?.isTextBased()) throw new Error("Choisis un salon de texte valide.");
  const permissions = channel.permissionsFor(bot.user);
  if (!permissions?.has(PermissionFlagsBits.SendMessages)) throw new Error("Le bot ne peut pas envoyer de messages dans ce salon.");

  const payload = {};
  if (data.content) payload.content = data.content;
  const hasEmbedContent = Boolean(data.embedTitle || data.embedDescription || data.embedImageUrl || data.embedFooter);
  if (data.embedEnabled && hasEmbedContent) {
    if (!permissions.has(PermissionFlagsBits.EmbedLinks)) throw new Error("Le bot doit avoir la permission Intégrer des liens dans ce salon.");
    const embed = new EmbedBuilder().setColor(parseInt(data.embedColor.slice(1), 16));
    if (data.embedTitle) embed.setTitle(data.embedTitle);
    if (data.embedDescription) embed.setDescription(data.embedDescription);
    if (data.embedImageUrl) {
      if (data.embedImagePosition === "thumbnail") embed.setThumbnail(data.embedImageUrl);
      else embed.setImage(data.embedImageUrl);
    }
    if (data.embedFooter) embed.setFooter({ text: data.embedFooter });
    payload.embeds = [embed];
  }
  if (data.buttons.length) {
    const row = new ActionRowBuilder().addComponents(data.buttons.map(button => {
      const builder = new ButtonBuilder().setLabel(button.label);
      if (button.type === "role") {
        const role = guild.roles.cache.get(button.roleId);
        if (!role || role.id === guild.id || role.managed) throw new Error("Le rôle choisi pour un bouton n’est pas disponible.");
        if (!canGrantWithButton(role, guild)) throw new Error("Le bot doit pouvoir gérer ce rôle, placé sous son rôle, et le rôle ne doit pas avoir de permission d’administration ou de modération.");
        return builder.setStyle(ButtonStyle.Success).setCustomId(`atelier:message-role:${role.id}`);
      }
      return builder.setStyle(ButtonStyle.Link).setURL(button.url);
    }));
    payload.components = [row];
  }
  return channel.send(payload);
}

export function botGuildSummary(guildId) {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return null;
  const botHighestRole = guild.members.me?.roles.highest.position ?? -1;
  const botCanManageRoles = Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles));
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ size: 64 }),
    memberCount: guild.memberCount,
    channels: guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
      .map(channel => ({ id: channel.id, name: channel.name, type: channel.type })),
    categories: guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory)
      .map(channel => ({ id: channel.id, name: channel.name })),
    roles: guild.roles.cache.filter(role => role.id !== guild.id && !role.managed)
      .sort((a, b) => b.position - a.position)
      .map(role => ({ id: role.id, name: role.name, color: role.hexColor, assignable: botCanManageRoles && role.position < botHighestRole && canGrantWithButton(role, guild) }))
  };
}
