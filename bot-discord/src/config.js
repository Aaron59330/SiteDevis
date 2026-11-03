export const defaultConfig = {
  welcome: {
    enabled: false,
    channelId: "",
    message: "👋 Bienvenue {user} sur **{server}** ! Nous sommes maintenant {memberCount}.",
    imageUrl: "",
    embedColor: "#3566a6",
    embedEnabled: true,
    avatarEnabled: false,
    avatarUrl: "",
    footerEnabled: false,
    footerText: ""
  },
  autorole: {
    enabled: false,
    roleId: ""
  },
  tickets: {
    enabled: false,
    panelChannelId: "",
    categoryId: "",
    supportRoleId: "",
    panelTitle: "Besoin d’aide ?",
    channelNameFormat: "{type}-{numero}",
    panelDescription: "Choisis le type de ta demande. Notre équipe te répondra dès que possible.",
    imageUrl: "",
    embedColor: "#3566a6",
    formsEnabled: false,
    claimEnabled: false,
    transcriptsEnabled: false,
    reopenEnabled: false,
    deleteOnClose: true,
    deleteDelay: 10,
    autoCloseEnabled: false,
    autoCloseDays: 7,
    logsEnabled: false,
    logChannelId: "",
    ticketTypes: [
      { id: "question", label: "Question", description: "J’ai une question sur le serveur.", emoji: "❓", formQuestion: "Quelle est ta question ?" },
      { id: "support", label: "Aide / support", description: "J’ai besoin d’aide avec un problème.", emoji: "🛟", formQuestion: "Décris le problème et ce que tu as déjà essayé." },
      { id: "report", label: "Signaler un problème", description: "Je souhaite signaler un incident.", emoji: "🚩", formQuestion: "Décris l’incident et indique les éléments utiles." }
    ]
  },
  anonymous: {
    enabled: false,
    channelId: ""
  },
  profile: {
    bio: ""
  },
  protect: {
    enabled: false,
    spam: { enabled: true, count: 6, seconds: 5 },
    duplicates: { enabled: true, count: 3 },
    invites: { enabled: true },
    links: { enabled: false, allowed: "youtube.com, youtu.be, tenor.com, giphy.com" },
    mentions: { enabled: true, max: 5 },
    caps: { enabled: false, percent: 70 },
    words: { enabled: false, list: "" },
    action: "warn",
    timeoutMinutes: 10,
    ignoredRoleIds: [],
    ignoredChannelIds: [],
    logChannelId: ""
  },
  commands: {
    clearMessages: false,
    slowmode: false,
    userInfo: false,
    serverInfo: false,
    avatar: false
  },
  fivem: {
    enabled: false,
    host: "",
    port: 30120,
    protocol: "http",
    connectUrl: "",
    panelEnabled: false,
    panelChannelId: "",
    panelMessageId: "",
    panelTitle: "État du serveur FiveM",
    embedColor: "#3566a6",
    autoRefresh: false,
    refreshSeconds: 60,
    commandEnabled: false
  }
};

export function sanitizeConfig(input = {}) {
  const text = (value, max) => String(value ?? "").trim().slice(0, max);
  const id = (value) => /^\d{17,20}$/.test(String(value ?? "")) ? String(value) : "";
  const imageUrl = (value) => {
    const candidate = text(value, 2048);
    try { return new URL(candidate).protocol === "https:" ? candidate : ""; }
    catch { return ""; }
  };
  const color = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value ?? "")) ? String(value).toLowerCase() : "#3566a6";
  const rawTypes = Array.isArray(input.tickets?.ticketTypes) ? input.tickets.ticketTypes.slice(0, 25) : defaultConfig.tickets.ticketTypes;
  const seenTypeIds = new Set();
  const ticketTypes = rawTypes.map((item, index) => {
    let typeId = text(item?.id, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 40) || `type-${index + 1}`;
    if (seenTypeIds.has(typeId)) typeId = `type-${index + 1}`;
    seenTypeIds.add(typeId);
    return {
      id: typeId,
      label: text(item?.label, 100) || `Type ${index + 1}`,
      description: text(item?.description, 100),
      emoji: text(item?.emoji, 8) || "🎫",
      formQuestion: text(item?.formQuestion, 45)
    };
  });
  return {
    welcome: {
      enabled: input.welcome?.enabled === true,
      channelId: id(input.welcome?.channelId),
      message: text(input.welcome?.message, 1800) || defaultConfig.welcome.message,
      imageUrl: imageUrl(input.welcome?.imageUrl),
      embedColor: color(input.welcome?.embedColor),
      embedEnabled: input.welcome?.embedEnabled !== false,
      avatarEnabled: input.welcome?.avatarEnabled === true,
      avatarUrl: imageUrl(input.welcome?.avatarUrl),
      footerEnabled: input.welcome?.footerEnabled === true,
      footerText: text(input.welcome?.footerText, 200)
    },
    autorole: {
      enabled: input.autorole?.enabled === true,
      roleId: id(input.autorole?.roleId)
    },
    tickets: {
      enabled: input.tickets?.enabled === true,
      panelChannelId: id(input.tickets?.panelChannelId),
      categoryId: id(input.tickets?.categoryId),
      supportRoleId: id(input.tickets?.supportRoleId),
      panelTitle: text(input.tickets?.panelTitle, 100) || defaultConfig.tickets.panelTitle,
      channelNameFormat: text(input.tickets?.channelNameFormat, 60) || defaultConfig.tickets.channelNameFormat,
      panelDescription: text(input.tickets?.panelDescription, 1800) || defaultConfig.tickets.panelDescription,
      imageUrl: imageUrl(input.tickets?.imageUrl),
      embedColor: color(input.tickets?.embedColor),
      formsEnabled: input.tickets?.formsEnabled === true,
      claimEnabled: input.tickets?.claimEnabled === true,
      transcriptsEnabled: input.tickets?.transcriptsEnabled === true,
      reopenEnabled: input.tickets?.reopenEnabled === true,
      deleteOnClose: input.tickets?.deleteOnClose !== false,
      deleteDelay: Math.min(300, Math.max(3, Number.parseInt(input.tickets?.deleteDelay, 10) || 10)),
      autoCloseEnabled: input.tickets?.autoCloseEnabled === true,
      autoCloseDays: Math.min(365, Math.max(1, Number.parseInt(input.tickets?.autoCloseDays, 10) || 7)),
      logsEnabled: input.tickets?.logsEnabled === true,
      logChannelId: id(input.tickets?.logChannelId),
      ticketTypes: ticketTypes.length ? ticketTypes : structuredClone(defaultConfig.tickets.ticketTypes)
    },
    profile: {
      bio: text(input.profile?.bio, 190)
    },
    protect: (() => {
      const p = input.protect || {}, d = defaultConfig.protect;
      const num = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.parseInt(value, 10) || fallback));
      const on = (value, fallback) => (value === undefined ? fallback : value === true);
      const ids = value => (Array.isArray(value) ? value : []).map(id).filter(Boolean).slice(0, 50);
      return {
        enabled: p.enabled === true,
        spam: { enabled: on(p.spam?.enabled, d.spam.enabled), count: num(p.spam?.count, 3, 30, 6), seconds: num(p.spam?.seconds, 2, 60, 5) },
        duplicates: { enabled: on(p.duplicates?.enabled, d.duplicates.enabled), count: num(p.duplicates?.count, 2, 10, 3) },
        invites: { enabled: on(p.invites?.enabled, d.invites.enabled) },
        links: { enabled: on(p.links?.enabled, d.links.enabled), allowed: text(p.links?.allowed ?? d.links.allowed, 600) },
        mentions: { enabled: on(p.mentions?.enabled, d.mentions.enabled), max: num(p.mentions?.max, 2, 50, 5) },
        caps: { enabled: on(p.caps?.enabled, d.caps.enabled), percent: num(p.caps?.percent, 50, 100, 70) },
        words: { enabled: on(p.words?.enabled, d.words.enabled), list: text(p.words?.list, 2000) },
        action: ["delete", "warn", "timeout"].includes(p.action) ? p.action : "warn",
        timeoutMinutes: num(p.timeoutMinutes, 1, 10080, 10),
        ignoredRoleIds: ids(p.ignoredRoleIds),
        ignoredChannelIds: ids(p.ignoredChannelIds),
        logChannelId: id(p.logChannelId)
      };
    })(),
    anonymous: {
      enabled: input.anonymous?.enabled === true,
      channelId: id(input.anonymous?.channelId)
    },
    commands: {
      clearMessages: input.commands?.clearMessages === true,
      slowmode: input.commands?.slowmode === true,
      userInfo: input.commands?.userInfo === true,
      serverInfo: input.commands?.serverInfo === true,
      avatar: input.commands?.avatar === true
    },
    fivem: {
      enabled: input.fivem?.enabled === true,
      host: (() => { const value = text(input.fivem?.host, 253).replace(/^https?:\/\//i, "").split("/")[0]; return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1).toLowerCase() : value.toLowerCase(); })(),
      port: Math.min(65535, Math.max(1, Number.parseInt(input.fivem?.port, 10) || 30120)),
      protocol: input.fivem?.protocol === "https" ? "https" : "http",
      connectUrl: (() => { const candidate = text(input.fivem?.connectUrl, 512); try { return new URL(candidate).protocol === "https:" ? candidate : ""; } catch { return ""; } })(),
      panelEnabled: input.fivem?.panelEnabled === true,
      panelChannelId: id(input.fivem?.panelChannelId),
      panelMessageId: id(input.fivem?.panelMessageId),
      panelTitle: text(input.fivem?.panelTitle, 100) || defaultConfig.fivem.panelTitle,
      embedColor: color(input.fivem?.embedColor),
      autoRefresh: input.fivem?.autoRefresh === true,
      refreshSeconds: Math.min(300, Math.max(30, Number.parseInt(input.fivem?.refreshSeconds, 10) || 60)),
      commandEnabled: input.fivem?.commandEnabled === true
    }
  };
}
