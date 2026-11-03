const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, csrf: "", clientId: "", guilds: [], guildId: "", guild: null, config: null, page: "overview", dirty: false, botReady: false };
const defaults = {
  welcome: { enabled: false, channelId: "", message: "👋 Bienvenue {user} sur **{server}** ! Nous sommes maintenant {memberCount}.", imageUrl: "", embedColor: "#81aadf", embedEnabled: true, avatarEnabled: false, avatarUrl: "", footerEnabled: false, footerText: "" },
  autorole: { enabled: false, roleId: "" },
  tickets: { enabled: false, panelChannelId: "", categoryId: "", supportRoleId: "", panelTitle: "Besoin d’aide ?", panelDescription: "Choisis le type de ta demande.", imageUrl: "", ticketTypes: [
    { id: "question", label: "Question", description: "J’ai une question sur le serveur.", emoji: "❓", formQuestion: "Quelle est ta question ?" },
    { id: "support", label: "Aide / support", description: "J’ai besoin d’aide avec un problème.", emoji: "🛟", formQuestion: "Décris le problème et ce que tu as déjà essayé." },
    { id: "report", label: "Signaler un problème", description: "Je souhaite signaler un incident.", emoji: "🚩", formQuestion: "Décris l’incident et indique les éléments utiles." }
  ], embedColor: "#81aadf", formsEnabled: false, claimEnabled: false, transcriptsEnabled: false, reopenEnabled: false, autoCloseEnabled: false, autoCloseDays: 7, logsEnabled: false, logChannelId: "" },
  anonymous: { enabled: false, channelId: "" },
  commands: { clearMessages: false, slowmode: false, userInfo: false, serverInfo: false, avatar: false },
  fivem: { enabled: false, host: "", port: 30120, protocol: "http", connectUrl: "", panelEnabled: false, panelChannelId: "", panelMessageId: "", panelTitle: "État du serveur FiveM", embedColor: "#81aadf", autoRefresh: false, refreshSeconds: 60, commandEnabled: false }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3300);
}

async function api(url, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
  if (options.method && options.method !== "GET") headers["x-csrf-token"] = state.csrf;
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "La requête n’a pas abouti.");
  return body;
}

function setBotStatus(ready) {
  state.botReady = ready;
  const dot = $("#botDot");
  dot.classList.toggle("online", ready);
  dot.classList.toggle("offline", !ready);
  $("#botStatusText").textContent = ready ? "Bot connecté" : "Bot hors ligne";
  $("#overviewBot").textContent = ready ? "En ligne" : "Hors ligne";
  $("#overviewBotNote").textContent = ready ? "Prêt à servir ton serveur" : "Vérifie les identifiants Discord";
}

async function boot() {
  try {
    const data = await api("/api/me");
    setBotStatus(data.botReady);
    if (!data.authenticated) {
      $("#loginScreen").hidden = false;
      const params = new URLSearchParams(location.search);
      if (params.get("login") === "cancelled") showToast("Connexion Discord annulée.", true);
      if (params.get("login") === "failed") showToast("Connexion impossible. Réessaie.", true);
      return;
    }
    state.user = data.user;
    state.csrf = data.csrfToken;
    state.clientId = data.clientId;
    state.guilds = data.guilds;
    $("#appShell").hidden = false;
    renderUser();
    renderGuilds();
    const savedGuild = localStorage.getItem("atelier.guildId");
    const selected = state.guilds.find(item => item.id === savedGuild) || state.guilds[0];
    if (selected) {
      $("#guildSelect").value = selected.id;
      await selectGuild(selected.id);
    } else {
      $("#guildPrompt").hidden = false;
    }
    setInterval(refreshStatus, 45_000);
  } catch (error) {
    $("#loginScreen").hidden = false;
    showToast(error.message, true);
  }
}

function renderUser() {
  const chip = $("#userChip");
  const avatar = state.user.avatar ? `https://cdn.discordapp.com/avatars/${state.user.id}/${state.user.avatar}.png?size=64` : "";
  chip.innerHTML = `${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : `<span class="user-fallback">${escapeHtml((state.user.username || "D").slice(0, 1).toUpperCase())}</span>`}<span>${escapeHtml(state.user.username)}</span>`;
}

function renderGuilds() {
  const select = $("#guildSelect");
  const options = `<option value="">Choisir un serveur…</option>` + state.guilds.map(guild =>
    `<option value="${escapeHtml(guild.id)}">${escapeHtml(guild.name)}${guild.botInstalled ? "" : " · bot absent"}</option>`
  ).join("");
  select.innerHTML = options;
  $("#guildSelectMobile").innerHTML = options;
}

async function selectGuild(guildId) {
  state.guildId = guildId;
  state.guild = null;
  state.config = null;
  state.dirty = false;
  resetMessageComposer();
  localStorage.setItem("atelier.guildId", guildId);
  const info = state.guilds.find(item => item.id === guildId);
  $("#selectedGuildName").textContent = info?.name || "Aucun serveur";
  $("#guildSelectMobile").value = guildId;
  $("#overviewMembers").textContent = info?.memberCount ? info.memberCount.toLocaleString("fr-FR") : "—";
  $("#guildPrompt").hidden = Boolean(guildId);
  $("#invitePrompt").hidden = true;
  if (!guildId) return;
  if (!info?.botInstalled) {
    $("#invitePrompt").hidden = false;
    $("#inviteButton").href = inviteUrl(guildId);
    clearControls();
    return;
  }
  try {
    const result = await api(`/api/guilds/${encodeURIComponent(guildId)}`);
    state.guild = result.guild;
    state.config = result.config;
    renderConfig();
  } catch (error) {
    showToast(error.message, true);
  }
}

function inviteUrl(guildId) {
  const id = state.clientId;
  const permissions = "268528656";
  const params = new URLSearchParams({ client_id: id, scope: "bot applications.commands", permissions, guild_id: guildId, disable_guild_select: "true" });
  return `https://discord.com/oauth2/authorize?${params}`;
}

function clearControls() {
  state.guild = null;
  state.config = structuredClone(defaults);
  fillSelect("#welcomeChannel", [], "Sélectionner un salon…");
  fillSelect("#ticketPanelChannel", [], "Sélectionner un salon…");
  fillSelect("#ticketCategory", [], "Aucune catégorie");
  fillSelect("#autoroleRole", [], "Sélectionner un rôle…");
  fillSelect("#supportRole", [], "Aucun rôle");
  renderConfig();
}

function fillSelect(selector, items, placeholder, current = "") {
  const select = $(selector);
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + items.map(item =>
    `<option value="${escapeHtml(item.id)}"${item.id === current ? " selected" : ""}>${escapeHtml(item.name)}</option>`
  ).join("");
}

function renderConfig() {
  if (!state.config) return;
  const config = state.config;
  const channels = state.guild?.channels || [];
  const categories = state.guild?.categories || [];
  const roles = state.guild?.roles || [];
  fillSelect("#welcomeChannel", channels, "Sélectionner un salon…", config.welcome.channelId);
  fillSelect("#ticketPanelChannel", channels, "Sélectionner un salon…", config.tickets.panelChannelId);
  fillSelect("#ticketLogChannel", channels, "Sélectionner un salon…", config.tickets.logChannelId || "");
  fillSelect("#anonymousChannel", channels, "Sélectionner un salon…", config.anonymous?.channelId || "");
  fillSelect("#messageChannel", channels, "Sélectionner un salon…");
  fillSelect("#pollChannel", channels, "Sélectionner un salon…");
  fillSelect("#giveawayChannel", channels, "Sélectionner un salon…");
  fillSelect("#fivemPanelChannel", channels, "Sélectionner un salon…", config.fivem?.panelChannelId || "");
  fillSelect("#ticketCategory", categories, "Aucune catégorie", config.tickets.categoryId);
  fillSelect("#autoroleRole", roles.filter(role => role.assignable), "Sélectionner un rôle…", config.autorole.roleId);
  fillSelect("#supportRole", roles, "Aucun rôle", config.tickets.supportRoleId);
  $("#welcomeEnabled").checked = config.welcome.enabled;
  $("#autoroleEnabled").checked = config.autorole.enabled;
  $("#ticketsEnabled").checked = config.tickets.enabled;
  $("#anonymousEnabled").checked = config.anonymous?.enabled === true;
  $("#welcomeMessage").value = config.welcome.message;
  $("#welcomeImageUrl").value = config.welcome.imageUrl || "";
  $("#welcomeEmbedColor").value = config.welcome.embedColor || "#81aadf";
  $("#welcomeEmbedEnabled").checked = config.welcome.embedEnabled !== false;
  $("#welcomeAvatarEnabled").checked = config.welcome.avatarEnabled === true;
  $("#welcomeAvatarUrl").value = config.welcome.avatarUrl || "";
  $("#welcomeFooterEnabled").checked = config.welcome.footerEnabled === true;
  $("#welcomeFooterText").value = config.welcome.footerText || "";
  $("#ticketTitle").value = config.tickets.panelTitle;
  $("#ticketDescription").value = config.tickets.panelDescription;
  $("#ticketImageUrl").value = config.tickets.imageUrl || "";
  $("#ticketEmbedColor").value = config.tickets.embedColor || "#81aadf";
  $("#ticketFormsEnabled").checked = config.tickets.formsEnabled === true;
  $("#ticketClaimEnabled").checked = config.tickets.claimEnabled === true;
  $("#ticketTranscriptsEnabled").checked = config.tickets.transcriptsEnabled === true;
  $("#ticketReopenEnabled").checked = config.tickets.reopenEnabled === true;
  $("#ticketAutoCloseEnabled").checked = config.tickets.autoCloseEnabled === true;
  $("#ticketAutoCloseDays").value = config.tickets.autoCloseDays || 7;
  $("#ticketLogsEnabled").checked = config.tickets.logsEnabled === true;
  $("#commandClearMessages").checked = config.commands.clearMessages === true;
  $("#commandSlowmode").checked = config.commands.slowmode === true;
  $("#commandUserInfo").checked = config.commands.userInfo === true;
  $("#commandServerInfo").checked = config.commands.serverInfo === true;
  $("#commandAvatar").checked = config.commands.avatar === true;
  $("#fivemEnabled").checked = config.fivem?.enabled === true;
  $("#fivemHost").value = config.fivem?.host || "";
  $("#fivemPort").value = config.fivem?.port || 30120;
  $("#fivemProtocol").value = config.fivem?.protocol || "http";
  $("#fivemConnectUrl").value = config.fivem?.connectUrl || "";
  $("#fivemPanelEnabled").checked = config.fivem?.panelEnabled === true;
  $("#fivemPanelTitle").value = config.fivem?.panelTitle || "État du serveur FiveM";
  $("#fivemEmbedColor").value = config.fivem?.embedColor || "#81aadf";
  $("#fivemEmbedColorValue").textContent = $("#fivemEmbedColor").value;
  $("#fivemAutoRefresh").checked = config.fivem?.autoRefresh === true;
  $("#fivemRefreshSeconds").value = config.fivem?.refreshSeconds || 60;
  $("#fivemCommandEnabled").checked = config.fivem?.commandEnabled === true;
  renderTicketTypes(config.tickets.ticketTypes || defaults.tickets.ticketTypes);
  $("#overviewWelcomeToggle").checked = config.welcome.enabled;
  $("#overviewRoleToggle").checked = config.autorole.enabled;
  $("#overviewTicketToggle").checked = config.tickets.enabled;
  updateMessagePreview();
  updateImagePreview("#welcomeImageUrl", "#welcomeImagePreviewWrap", "#welcomeImagePreview");
  updateImagePreview("#ticketImageUrl", "#ticketImagePreviewWrap", "#ticketImagePreview");
  updateEmbedColorPreview();
  updateOptionVisibility();
  updateComposerPreview();
  updateBadges();
  updateModuleCount();
  updatePublishButton();
  updateFiveMButton();
  loadActivities();
}

function currentConfig() {
  if (!state.config) return null;
  return {
    welcome: { enabled: $("#welcomeEnabled").checked, channelId: $("#welcomeChannel").value, message: $("#welcomeMessage").value, imageUrl: $("#welcomeImageUrl").value, embedColor: $("#welcomeEmbedColor").value, embedEnabled: $("#welcomeEmbedEnabled").checked, avatarEnabled: $("#welcomeAvatarEnabled").checked, avatarUrl: $("#welcomeAvatarUrl").value, footerEnabled: $("#welcomeFooterEnabled").checked, footerText: $("#welcomeFooterText").value },
    autorole: { enabled: $("#autoroleEnabled").checked, roleId: $("#autoroleRole").value },
    tickets: { enabled: $("#ticketsEnabled").checked, panelChannelId: $("#ticketPanelChannel").value, categoryId: $("#ticketCategory").value, supportRoleId: $("#supportRole").value, panelTitle: $("#ticketTitle").value, panelDescription: $("#ticketDescription").value, imageUrl: $("#ticketImageUrl").value, embedColor: $("#ticketEmbedColor").value, formsEnabled: $("#ticketFormsEnabled").checked, claimEnabled: $("#ticketClaimEnabled").checked, transcriptsEnabled: $("#ticketTranscriptsEnabled").checked, reopenEnabled: $("#ticketReopenEnabled").checked, autoCloseEnabled: $("#ticketAutoCloseEnabled").checked, autoCloseDays: $("#ticketAutoCloseDays").value, logsEnabled: $("#ticketLogsEnabled").checked, logChannelId: $("#ticketLogChannel").value, ticketTypes: collectTicketTypes() },
    anonymous: { enabled: $("#anonymousEnabled").checked, channelId: $("#anonymousChannel").value },
    commands: { clearMessages: $("#commandClearMessages").checked, slowmode: $("#commandSlowmode").checked, userInfo: $("#commandUserInfo").checked, serverInfo: $("#commandServerInfo").checked, avatar: $("#commandAvatar").checked },
    fivem: { enabled: $("#fivemEnabled").checked, host: $("#fivemHost").value, port: $("#fivemPort").value, protocol: $("#fivemProtocol").value, connectUrl: $("#fivemConnectUrl").value, panelEnabled: $("#fivemPanelEnabled").checked, panelChannelId: $("#fivemPanelChannel").value, panelMessageId: state.config.fivem?.panelMessageId || "", panelTitle: $("#fivemPanelTitle").value, embedColor: $("#fivemEmbedColor").value, autoRefresh: $("#fivemAutoRefresh").checked, refreshSeconds: $("#fivemRefreshSeconds").value, commandEnabled: $("#fivemCommandEnabled").checked }
  };
}

function updateFromControls() {
  const config = currentConfig();
  if (!config) return;
  state.config = config;
  $("#overviewWelcomeToggle").checked = config.welcome.enabled;
  $("#overviewRoleToggle").checked = config.autorole.enabled;
  $("#overviewTicketToggle").checked = config.tickets.enabled;
  updateBadges();
  updateModuleCount();
  updateMessagePreview();
  updateEmbedColorPreview();
  updateOptionVisibility();
  updatePublishButton();
  updateFiveMButton();
  state.dirty = true;
}

function updateBadges() {
  const entries = [["welcomeBadge", state.config.welcome.enabled], ["roleBadge", state.config.autorole.enabled], ["ticketBadge", state.config.tickets.enabled], ["anonymousBadge", state.config.anonymous?.enabled === true]];
  for (const [id, enabled] of entries) $("#" + id).textContent = enabled ? "ON" : "OFF";
  const commandCount = Object.values(state.config.commands || {}).filter(Boolean).length + Number(state.config.fivem?.enabled && state.config.fivem?.commandEnabled);
  $("#commandBadge").textContent = `${commandCount} / 6`;
}

function updateModuleCount() {
  const config = state.config;
  const count = Number(config.welcome.enabled) + Number(config.autorole.enabled) + Number(config.tickets.enabled);
  $("#overviewModules").textContent = String(count);
}

function updateMessagePreview() {
  const text = $("#welcomeMessage").value || "Bienvenue sur ton serveur !";
  const guildName = state.guild?.name || "Ton serveur";
  const memberCount = state.guild?.memberCount || "—";
  const preview = text.replaceAll("{user}", "@Nouveau membre").replaceAll("{server}", guildName).replaceAll("{memberCount}", String(memberCount));
  $("#welcomePreview").textContent = preview;
  $("#welcomeCount").textContent = `${$("#welcomeMessage").value.length} / 1800`;
  $("#ticketDescCount").textContent = `${$("#ticketDescription").value.length} / 1800`;
}

function renderTicketTypes(types) {
  const list = $("#ticketTypesList");
  list.innerHTML = (types || []).map((type, index) => `
    <div class="ticket-type-row" data-ticket-type="${escapeHtml(type.id || `type-${index + 1}`)}">
      <label class="ticket-emoji-field"><span>Emoji</span><input class="input" data-type-field="emoji" maxlength="8" value="${escapeHtml(type.emoji || "🎫")}" aria-label="Emoji du type de ticket"></label>
      <label class="ticket-name-field"><span>Nom</span><input class="input" data-type-field="label" maxlength="100" value="${escapeHtml(type.label)}" aria-label="Nom du type de ticket"></label>
      <label class="ticket-description-field"><span>Description</span><input class="input" data-type-field="description" maxlength="100" value="${escapeHtml(type.description || "")}" aria-label="Description du type de ticket"></label>
      <label class="ticket-question-field"><span>Question du formulaire</span><input class="input" data-type-field="formQuestion" maxlength="45" value="${escapeHtml(type.formQuestion || "")}" aria-label="Question du formulaire pour ce type"></label>
      <button class="remove-ticket-type" type="button" aria-label="Supprimer ce type de ticket">×</button>
    </div>`).join("");
  $("#addTicketType").disabled = (types || []).length >= 25;
}

function collectTicketTypes() {
  return $$(".ticket-type-row", $("#ticketTypesList")).map(row => ({
    id: row.dataset.ticketType,
    emoji: $("[data-type-field='emoji']", row).value,
    label: $("[data-type-field='label']", row).value,
    description: $("[data-type-field='description']", row).value,
    formQuestion: $("[data-type-field='formQuestion']", row).value
  }));
}

function updateImagePreview(inputSelector, wrapSelector, imageSelector) {
  const url = $(inputSelector).value.trim();
  const wrap = $(wrapSelector);
  const image = $(imageSelector);
  const messageImage = inputSelector === "#welcomeImageUrl" ? $("#welcomeMessageImage") : null;
  if (!url || !/^https:\/\//i.test(url)) {
    wrap.hidden = true;
    if (messageImage) messageImage.hidden = true;
    return;
  }
  image.src = url;
  wrap.hidden = false;
  if (messageImage) { messageImage.src = url; messageImage.hidden = false; }
}

function updateEmbedColorPreview() {
  const welcomeColor = $("#welcomeEmbedColor").value;
  const ticketColor = $("#ticketEmbedColor").value;
  $("#welcomeEmbedColorValue").textContent = welcomeColor.toUpperCase();
  $("#ticketEmbedColorValue").textContent = ticketColor.toUpperCase();
  $("#welcomePreview").style.borderColor = welcomeColor;
}

function updateOptionVisibility() {
  $("#welcomeAvatarFields").hidden = !$("#welcomeAvatarEnabled").checked;
  $("#welcomeFooterFields").hidden = !$("#welcomeFooterEnabled").checked;
  $("#ticketAutoCloseFields").hidden = !$("#ticketAutoCloseEnabled").checked;
  $("#ticketLogChannelFields").hidden = !($("#ticketLogsEnabled").checked || $("#ticketTranscriptsEnabled").checked);
}

function renderMessageButtons(buttons = []) {
  const list = $("#messageButtonsList");
  const roles = (state.guild?.roles || []).filter(role => role.assignable);
  list.innerHTML = buttons.map(button => `
    <div class="message-button-row">
      <label><span>Libellé</span><input class="input" data-message-button="label" maxlength="80" value="${escapeHtml(button.label || "")}" placeholder="Ex. Accepter"></label>
      <label><span>Action</span><select class="select" data-message-button="type"><option value="link"${button.type !== "role" ? " selected" : ""}>Ouvrir un lien</option><option value="role"${button.type === "role" ? " selected" : ""}>Donner un rôle</option></select></label>
      <label data-message-button-target="link"${button.type === "role" ? " hidden" : ""}><span>Lien</span><input class="input" data-message-button="url" type="url" value="${escapeHtml(button.url || "")}" placeholder="https://exemple.fr"></label>
      <label data-message-button-target="role"${button.type === "role" ? "" : " hidden"}><span>Rôle à donner</span><select class="select" data-message-button="roleId"><option value="">Choisir un rôle…</option>${roles.map(role => `<option value="${escapeHtml(role.id)}"${button.roleId === role.id ? " selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select></label>
      <button class="remove-message-button" type="button" aria-label="Supprimer ce bouton">×</button>
    </div>`).join("");
  $("#addMessageButton").disabled = buttons.length >= 5;
}

function collectMessageButtons() {
  return $$(".message-button-row", $("#messageButtonsList")).map(row => ({
    label: $("[data-message-button='label']", row).value.trim(),
    type: $("[data-message-button='type']", row).value,
    url: $("[data-message-button='url']", row).value.trim(),
    roleId: $("[data-message-button='roleId']", row).value
  }));
}

function renderMarkdownPreview(element, value) {
  const inline = text => escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>");
  const lines = String(value || "").split("\n");
  const parts = [];
  let quoteLines = [];
  const flushQuote = () => {
    if (!quoteLines.length) return;
    parts.push(`<blockquote>${quoteLines.map(line => `<div>${inline(line) || "&nbsp;"}</div>`).join("")}</blockquote>`);
    quoteLines = [];
  };
  for (const line of lines) {
    const match = line.match(/^\s*>\s?(.*)$/);
    if (match) quoteLines.push(match[1]);
    else {
      flushQuote();
      parts.push(line ? `<div>${inline(line)}</div>` : "<br>");
    }
  }
  flushQuote();
  element.innerHTML = parts.join("");
}

function insertQuoteBlock(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const lines = selected ? selected.split("\n") : [""];
  const alreadyQuoted = lines.length && lines.every(line => /^\s*>\s?/.test(line));
  const replacement = lines.map(line => {
    if (alreadyQuoted) return line.replace(/^\s*>\s?/, "");
    return line ? `> ${line}` : "> ";
  }).join("\n");
  textarea.setRangeText(replacement, start, end, "end");
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateComposerPreview() {
  if (!$("#messageContent")) return;
  const content = $("#messageContent").value;
  const embedEnabled = $("#messageEmbedEnabled").checked;
  const title = $("#messageEmbedTitle").value;
  const description = $("#messageEmbedDescription").value;
  const imageUrl = $("#messageEmbedImage").value.trim();
  const imagePosition = $("#messageEmbedImagePosition").value;
  const footer = $("#messageEmbedFooter").value;
  const color = $("#messageEmbedColor").value;
  const hasEmbedContent = Boolean(title || description || imageUrl || footer);
  const channelSelect = $("#messageChannel");
  const channelName = channelSelect.selectedOptions[0]?.textContent || "# salon";
  $("#messagePreviewChannel").textContent = channelName;
  const contentPreview = $("#messagePreviewContent");
  renderMarkdownPreview(contentPreview, content);
  contentPreview.hidden = !content;
  const embed = $("#messagePreviewEmbed");
  embed.hidden = !(embedEnabled && hasEmbedContent);
  embed.style.setProperty("--embed-color", color);
  $("#messagePreviewEmbedTitle").textContent = title;
  renderMarkdownPreview($("#messagePreviewEmbedDescription"), description);
  $("#messagePreviewEmbedTitle").hidden = !title;
  $("#messagePreviewEmbedDescription").hidden = !description;
  const image = $("#messagePreviewEmbedImage");
  const thumbnail = $("#messagePreviewEmbedThumbnail");
  const imageWrap = /^https:\/\//i.test(imageUrl);
  image.hidden = !imageWrap || imagePosition === "thumbnail";
  thumbnail.hidden = !imageWrap || imagePosition !== "thumbnail";
  if (imageWrap) {
    if (image.src !== imageUrl) image.src = imageUrl;
    if (thumbnail.src !== imageUrl) thumbnail.src = imageUrl;
  }
  $("#messagePreviewEmbedFooter").textContent = footer;
  $("#messagePreviewEmbedFooter").hidden = !footer;
  $("#messageEmbedFields").hidden = !embedEnabled;
  $("#messageEmbedColorValue").textContent = color.toUpperCase();
  $("#messageContentCount").textContent = `${content.length} / 2000`;
  $("#messageEmbedDescriptionCount").textContent = `${description.length} / 4096`;

  const buttonContainer = $("#messagePreviewButtons");
  buttonContainer.replaceChildren();
  for (const button of collectMessageButtons()) {
    if (!button.label && !button.url && !button.roleId) continue;
    const previewButton = document.createElement("button");
    previewButton.className = "discord-preview-link-button";
    previewButton.type = "button";
    previewButton.textContent = button.label || "Bouton";
    previewButton.disabled = true;
    if (button.type === "role") previewButton.title = "Ce bouton donnera le rôle sélectionné";
    buttonContainer.append(previewButton);
  }
}

function resetMessageComposer() {
  if (!$("#messageContent")) return;
  $("#messageChannel").value = "";
  $("#messageContent").value = "";
  $("#messageEmbedEnabled").checked = false;
  $("#messageEmbedTitle").value = "";
  $("#messageEmbedDescription").value = "";
  $("#messageEmbedImage").value = "";
  $("#messageEmbedImagePosition").value = "image";
  $("#messageEmbedFooter").value = "";
  $("#messageEmbedColor").value = "#81aadf";
  $("#messageSentLink").hidden = true;
  renderMessageButtons([]);
  updateComposerPreview();
}

async function sendCustomMessage() {
  const button = $("#sendCustomMessage");
  if (!state.guildId) return showToast("Choisis un serveur d’abord.", true);
  if (!$("#messageChannel").value) return showToast("Choisis le salon de destination.", true);
  const payload = {
    channelId: $("#messageChannel").value,
    content: $("#messageContent").value,
    embedEnabled: $("#messageEmbedEnabled").checked,
    embedTitle: $("#messageEmbedTitle").value,
    embedDescription: $("#messageEmbedDescription").value,
    embedImageUrl: $("#messageEmbedImage").value,
    embedImagePosition: $("#messageEmbedImagePosition").value,
    embedFooter: $("#messageEmbedFooter").value,
    embedColor: $("#messageEmbedColor").value,
    buttons: collectMessageButtons()
  };
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "Envoi…";
  try {
    const result = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/messages`, { method: "POST", body: JSON.stringify(payload) });
    const link = $("#messageSentLink");
    link.href = result.url;
    link.hidden = false;
    showToast("Message envoyé dans le salon choisi.");
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.innerHTML = original; }
}

function updatePublishButton() {
  $("#publishTickets").disabled = !state.guildId || !$("#ticketsEnabled").checked || !$("#ticketPanelChannel").value;
}

function updateFiveMButton() {
  $("#publishFiveM").disabled = !state.guildId || !$("#fivemEnabled").checked || !$("#fivemPanelEnabled").checked || !$("#fivemPanelChannel").value;
}

function renderPollOptions(options = ["Oui", "Non"]) {
  const list = $("#pollOptionsList");
  list.innerHTML = options.map((option, index) => `
    <div class="poll-option-row">
      <span class="poll-option-number">${index + 1}</span>
      <input class="input" data-poll-option maxlength="60" value="${escapeHtml(option)}" placeholder="Choix ${index + 1}">
      <button class="remove-message-button" type="button" data-remove-poll-option aria-label="Supprimer ce choix" ${options.length <= 2 ? "disabled" : ""}>×</button>
    </div>`).join("");
  $("#addPollOption").disabled = options.length >= 10;
}

function pollOptionValues() {
  return $$("[data-poll-option]", $("#pollOptionsList")).map(input => input.value.trim());
}

function formatActivityDate(value) {
  return value ? new Date(Number(value)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "Date inconnue";
}

function renderActivities(data) {
  const pollList = $("#pollHistoryList");
  const giveawayList = $("#giveawayHistoryList");
  pollList.innerHTML = data.polls?.length ? data.polls.map(poll => {
    const active = !poll.closed_at && poll.ends_at > Date.now();
    const counts = new Map((poll.counts || []).map(row => [row.option_index, row.count]));
    const history = (poll.voteHistory || []).map(vote => `<li><code>${escapeHtml(vote.user_id)}</code> a voté « ${escapeHtml(poll.options[vote.option_index] || "Choix supprimé")} » · ${formatActivityDate(vote.voted_at)}</li>`).join("");
    return `<article class="activity-item"><div class="activity-item-head"><span class="activity-state ${active ? "is-active" : ""}">${active ? "En cours" : "Clôturé"}</span><time>${formatActivityDate(poll.created_at)}</time></div><h4>${escapeHtml(poll.question)}</h4><ul class="activity-results">${poll.options.map((option, index) => `<li><span>${escapeHtml(option)}</span><b>${counts.get(index) || 0}</b></li>`).join("")}</ul><div class="activity-item-foot"><span>${poll.totalVotes} vote(s) · fin ${formatActivityDate(poll.ends_at)}</span>${active ? `<button class="button button-small" type="button" data-close-poll="${escapeHtml(poll.id)}">Clôturer</button>` : ""}</div><details class="activity-vote-history"><summary>Historique des votes (${poll.voteChangesCount || 0})</summary>${history ? `<ol>${history}</ol>` : `<p>Aucun vote enregistré.</p>`}${poll.voteChangesCount > (poll.voteHistory || []).length ? `<small>Affichage des ${(poll.voteHistory || []).length} derniers changements.</small>` : ""}</details></article>`;
  }).join("") : `<p class="activity-empty">Aucun sondage pour le moment.</p>`;

  giveawayList.innerHTML = data.giveaways?.length ? data.giveaways.map(item => {
    const active = !item.ended_at && item.ends_at > Date.now();
    const winnerLine = item.winners?.length ? item.winners.map(id => `<code>${escapeHtml(id)}</code>`).join(", ") : "Aucun gagnant";
    return `<article class="activity-item"><div class="activity-item-head"><span class="activity-state ${active ? "is-active" : ""}">${active ? "Inscriptions ouvertes" : "Terminé"}</span><time>${formatActivityDate(item.created_at)}</time></div><h4>${escapeHtml(item.prize)}</h4><div class="activity-item-foot"><span>${item.entries_count} participant(s) · ${item.winners_count} gagnant(s)</span>${active ? `<button class="button button-small" type="button" data-end-giveaway="${escapeHtml(item.id)}">Tirer maintenant</button>` : ""}</div>${active ? `<p class="activity-winners">Fin prévue : ${formatActivityDate(item.ends_at)}</p>` : `<p class="activity-winners">Gagnant(s) : ${winnerLine}</p>`}</article>`;
  }).join("") : `<p class="activity-empty">Aucun tirage au sort pour le moment.</p>`;
}

async function loadActivities() {
  if (!state.guildId || !state.guild) return;
  try {
    const data = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/activities`);
    renderActivities(data);
  } catch (error) { showToast(error.message, true); }
}

async function createPoll() {
  if (!state.guildId) return showToast("Choisis un serveur d’abord.", true);
  const payload = { channelId: $("#pollChannel").value, question: $("#pollQuestion").value, options: pollOptionValues(), durationHours: $("#pollDuration").value, embedColor: $("#pollEmbedColor").value, imageUrl: $("#pollImageUrl").value.trim() };
  const button = $("#createPoll");
  button.disabled = true;
  try {
    const result = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/polls`, { method: "POST", body: JSON.stringify(payload) });
    showToast("Sondage publié. Les résultats seront conservés dans l’historique.");
    $("#pollQuestion").value = "";
    renderPollOptions(["Oui", "Non"]);
    await loadActivities();
    return result;
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
}

async function createGiveaway() {
  if (!state.guildId) return showToast("Choisis un serveur d’abord.", true);
  const payload = { channelId: $("#giveawayChannel").value, prize: $("#giveawayPrize").value, durationHours: $("#giveawayDuration").value, winnersCount: $("#giveawayWinners").value, embedColor: $("#giveawayEmbedColor").value, imageUrl: $("#giveawayImageUrl").value.trim() };
  const button = $("#createGiveaway");
  button.disabled = true;
  try {
    await api(`/api/guilds/${encodeURIComponent(state.guildId)}/giveaways`, { method: "POST", body: JSON.stringify(payload) });
    showToast("Tirage publié. Les gagnants seront annoncés automatiquement à la fin.");
    $("#giveawayPrize").value = "";
    await loadActivities();
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
}

async function closePoll(pollId) {
  try {
    await api(`/api/guilds/${encodeURIComponent(state.guildId)}/polls/${encodeURIComponent(pollId)}/close`, { method: "POST", body: "{}" });
    showToast("Sondage clôturé.");
    await loadActivities();
  } catch (error) { showToast(error.message, true); }
}

async function endGiveaway(giveawayId) {
  try {
    const result = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/giveaways/${encodeURIComponent(giveawayId)}/end`, { method: "POST", body: "{}" });
    showToast(result.winners?.length ? "Tirage terminé, gagnant(s) annoncé(s)." : "Tirage terminé.");
    await loadActivities();
  } catch (error) { showToast(error.message, true); }
}

function switchPage(page) {
  state.page = page;
  $("#pageSearch").value = "";
  $$(".nav-item").forEach(button => { button.hidden = false; });
  $$(".page").forEach(section => section.classList.toggle("active", section.dataset.section === page));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  const item = $(`.nav-item[data-page="${page}"] span:nth-child(2)`);
  $("#breadcrumbTitle").textContent = item?.textContent || "Vue d’ensemble";
  if (page === "animations") loadActivities();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function filterPages() {
  const query = $("#pageSearch").value.trim().toLocaleLowerCase("fr-FR");
  $$(".nav-item").forEach(button => {
    button.hidden = Boolean(query) && !button.textContent.toLocaleLowerCase("fr-FR").includes(query);
  });
}

async function saveConfig() {
  if (!state.guildId || !state.config) return showToast("Choisis un serveur où le bot est installé.", true);
  const buttons = $$('[data-save]');
  buttons.forEach(button => { button.disabled = true; button.dataset.original = button.innerHTML; button.textContent = "Enregistrement…"; });
  try {
    const result = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/config`, { method: "PUT", body: JSON.stringify(currentConfig()) });
    state.config = result.config;
    state.dirty = false;
    renderConfig();
    showToast(result.commandsSynced === false ? "Réglages enregistrés, mais Discord n’a pas synchronisé les commandes. Vérifie la connexion du bot." : "Configuration enregistrée.", result.commandsSynced === false);
    return true;
  } catch (error) { showToast(error.message, true); return false; }
  finally { buttons.forEach(button => { button.disabled = false; button.innerHTML = button.dataset.original || '<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Enregistrer'; }); }
}

async function publishTickets() {
  const button = $("#publishTickets");
  button.disabled = true;
  const original = button.innerHTML;
  button.textContent = "Publication…";
  try {
    if (state.dirty && !(await saveConfig())) return;
    const result = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/tickets/publish`, { method: "POST", body: "{}" });
    showToast("Panneau publié dans le salon sélectionné.");
    if (result.messageId) button.innerHTML = "Panneau publié <span>✓</span>";
  } catch (error) { showToast(error.message, true); }
  finally { if (!button.innerHTML.includes("Panneau publié")) button.innerHTML = original; updatePublishButton(); }
}

async function testFiveM() {
  if (state.dirty && !(await saveConfig())) return;
  const button = $("#testFiveM");
  button.disabled = true;
  try {
    const result = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/fivem/test`, { method: "POST", body: "{}" });
    const status = result.status;
    const summary = status.online ? `${status.hostname} · ${status.players ?? "?"}${status.maxPlayers ? ` / ${status.maxPlayers}` : ""} joueurs${status.map ? ` · ${status.map}` : ""}` : "Serveur hors ligne ou inaccessible depuis le bot.";
    const box = $("#fivemStatusResult");
    box.hidden = false;
    $("#fivemStatusResult p").textContent = summary;
    $("#fivemStatusResult").dataset.online = status.online ? "1" : "0";
    showToast(status.online ? "Connexion FiveM réussie." : "Le endpoint FiveM ne répond pas.", !status.online);
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
}

async function publishFiveM() {
  const button = $("#publishFiveM");
  button.disabled = true;
  try {
    if (state.dirty && !(await saveConfig())) return;
    const result = await api(`/api/guilds/${encodeURIComponent(state.guildId)}/fivem/publish`, { method: "POST", body: "{}" });
    const box = $("#fivemStatusResult");
    box.hidden = false;
    $("#fivemStatusResult p").textContent = `Panneau publié ou actualisé dans le salon sélectionné. Message : ${result.messageId}`;
    showToast("Panneau de statut FiveM publié ou actualisé.");
    state.config.fivem.panelMessageId = result.messageId;
  } catch (error) { showToast(error.message, true); }
  finally { updateFiveMButton(); }
}

async function refreshStatus() {
  try { const result = await api("/api/status"); setBotStatus(result.botReady); }
  catch { /* Le prochain rafraîchissement réessaiera. */ }
}

$("#guildSelect").addEventListener("change", event => selectGuild(event.target.value));
$("#pageSearch").addEventListener("input", filterPages);
$("#pageSearch").addEventListener("keydown", event => {
  if (event.key === "Escape") { $("#pageSearch").value = ""; filterPages(); }
  if (event.key === "Enter") {
    const first = $$(".nav-item").find(item => !item.hidden);
    if (first) switchPage(first.dataset.page);
  }
});
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#pageSearch").focus(); }
});
$("#guildSelectMobile").addEventListener("change", event => {
  $("#guildSelect").value = event.target.value;
  selectGuild(event.target.value);
});
$("#logoutButton").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST", body: "{}" }); location.reload(); }
  catch (error) { showToast(error.message, true); }
});
$$(".nav-item").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.page)));
$$("[data-go]").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.go)));
$$('[data-save]').forEach(button => button.addEventListener("click", saveConfig));
$("#publishTickets").addEventListener("click", publishTickets);
$("#testFiveM").addEventListener("click", testFiveM);
$("#publishFiveM").addEventListener("click", publishFiveM);
$("#createPoll").addEventListener("click", createPoll);
$("#createGiveaway").addEventListener("click", createGiveaway);
for (const [inputId, outputId] of [["pollEmbedColor", "pollEmbedColorValue"], ["giveawayEmbedColor", "giveawayEmbedColorValue"]]) {
  $("#" + inputId).addEventListener("input", event => { $("#" + outputId).textContent = event.currentTarget.value; });
}
$("#refreshActivities").addEventListener("click", loadActivities);
$("#addPollOption").addEventListener("click", () => {
  const options = pollOptionValues();
  if (options.length >= 10) return;
  options.push("");
  renderPollOptions(options);
});
$("#pollOptionsList").addEventListener("input", () => { $("#addPollOption").disabled = pollOptionValues().length >= 10; });
$("#pollOptionsList").addEventListener("click", event => {
  if (!event.target.closest("[data-remove-poll-option]")) return;
  const options = pollOptionValues();
  if (options.length <= 2) return;
  options.splice(Number(event.target.closest(".poll-option-row").querySelector(".poll-option-number").textContent) - 1, 1);
  renderPollOptions(options);
});
$("#pollHistoryList").addEventListener("click", event => {
  const button = event.target.closest("[data-close-poll]");
  if (button) closePoll(button.dataset.closePoll);
});
$("#giveawayHistoryList").addEventListener("click", event => {
  const button = event.target.closest("[data-end-giveaway]");
  if (button) endGiveaway(button.dataset.endGiveaway);
});
$("#sendCustomMessage").addEventListener("click", sendCustomMessage);
$$('.quote-insert-button').forEach(button => button.addEventListener("click", () => insertQuoteBlock($("#" + button.dataset.quoteTarget))));
$$("#messageChannel, #messageContent, #messageEmbedEnabled, #messageEmbedTitle, #messageEmbedDescription, #messageEmbedImage, #messageEmbedFooter, #messageEmbedColor").forEach(element => element.addEventListener("input", updateComposerPreview));
$$("#messageChannel, #messageEmbedEnabled, #messageEmbedImagePosition").forEach(element => element.addEventListener("change", updateComposerPreview));
$("#addMessageButton").addEventListener("click", () => {
  const buttons = collectMessageButtons();
  if (buttons.length >= 5) return;
  buttons.push({ label: "", type: "link", url: "", roleId: "" });
  renderMessageButtons(buttons);
  updateComposerPreview();
});
$("#messageButtonsList").addEventListener("input", updateComposerPreview);
$("#messageButtonsList").addEventListener("change", event => {
  const row = event.target.closest(".message-button-row");
  if (row && event.target.matches("[data-message-button='type']")) {
    const type = event.target.value;
    $("[data-message-button-target='link']", row).hidden = type !== "link";
    $("[data-message-button-target='role']", row).hidden = type !== "role";
  }
  updateComposerPreview();
});
$("#messageButtonsList").addEventListener("click", event => {
  const removeButton = event.target.closest(".remove-message-button");
  if (!removeButton) return;
  const row = removeButton.closest(".message-button-row");
  if (row) row.remove();
  renderMessageButtons(collectMessageButtons());
  updateComposerPreview();
});
$("#welcomeMessage").addEventListener("input", () => { updateFromControls(); });
$("#welcomeImageUrl").addEventListener("input", () => { updateImagePreview("#welcomeImageUrl", "#welcomeImagePreviewWrap", "#welcomeImagePreview"); updateFromControls(); });
$("#welcomeAvatarUrl").addEventListener("input", updateFromControls);
$("#welcomeFooterText").addEventListener("input", updateFromControls);
$("#welcomeEmbedColor").addEventListener("input", () => { updateEmbedColorPreview(); updateFromControls(); });
$("#ticketDescription").addEventListener("input", updateFromControls);
$("#ticketTitle").addEventListener("input", updateFromControls);
$("#ticketImageUrl").addEventListener("input", () => { updateImagePreview("#ticketImageUrl", "#ticketImagePreviewWrap", "#ticketImagePreview"); updateFromControls(); });
$("#ticketAutoCloseDays").addEventListener("input", updateFromControls);
$("#ticketEmbedColor").addEventListener("input", () => { updateEmbedColorPreview(); updateFromControls(); });
$("#ticketTypesList").addEventListener("input", updateFromControls);
$("#ticketTypesList").addEventListener("click", event => {
  const removeButton = event.target.closest(".remove-ticket-type");
  if (!removeButton) return;
  const rows = $$(".ticket-type-row", $("#ticketTypesList"));
  if (rows.length <= 1) return showToast("Garde au moins un type de ticket.", true);
  removeButton.closest(".ticket-type-row").remove();
  renderTicketTypes(collectTicketTypes());
  updateFromControls();
});
$("#addTicketType").addEventListener("click", () => {
  const types = collectTicketTypes();
  if (types.length >= 25) return;
  types.push({ id: `type-${Date.now()}`, label: "Autre demande", description: "Décris brièvement ce choix.", emoji: "🎫" });
  renderTicketTypes(types);
  updateFromControls();
});
$$("#commandClearMessages, #commandSlowmode, #commandUserInfo, #commandServerInfo, #commandAvatar").forEach(element => element.addEventListener("change", updateFromControls));
$$("#welcomeChannel, #autoroleRole, #ticketPanelChannel, #ticketLogChannel, #ticketCategory, #supportRole, #welcomeEnabled, #autoroleEnabled, #ticketsEnabled").forEach(element => element.addEventListener("change", updateFromControls));
$("#anonymousChannel").addEventListener("change", updateFromControls);
$("#anonymousEnabled").addEventListener("change", updateFromControls);
$$("#welcomeEmbedEnabled, #welcomeAvatarEnabled, #welcomeFooterEnabled, #ticketFormsEnabled, #ticketClaimEnabled, #ticketTranscriptsEnabled, #ticketReopenEnabled, #ticketAutoCloseEnabled, #ticketLogsEnabled, #fivemEnabled, #fivemPanelEnabled, #fivemAutoRefresh, #fivemCommandEnabled").forEach(element => element.addEventListener("change", () => { updateOptionVisibility(); updateFromControls(); }));
$$('[data-toggle]').forEach(input => input.addEventListener("change", () => {
  const [group, key] = input.dataset.toggle.split(".");
  if (state.config) state.config[group][key] = input.checked;
  if (group === "welcome") $("#welcomeEnabled").checked = input.checked;
  if (group === "autorole") $("#autoroleEnabled").checked = input.checked;
  if (group === "tickets") $("#ticketsEnabled").checked = input.checked;
  updateFromControls();
}));

$$("#fivemHost, #fivemPort, #fivemProtocol, #fivemConnectUrl, #fivemPanelTitle, #fivemRefreshSeconds").forEach(element => element.addEventListener("input", updateFromControls));
$$("#fivemPanelChannel, #fivemProtocol").forEach(element => element.addEventListener("change", updateFromControls));
$("#fivemEmbedColor").addEventListener("input", () => { $("#fivemEmbedColorValue").textContent = $("#fivemEmbedColor").value; updateFromControls(); });

renderPollOptions(["Oui", "Non"]);
boot();
