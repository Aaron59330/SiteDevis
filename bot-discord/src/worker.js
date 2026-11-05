/* Bot client : même AERO BOT, lancé dans son propre processus avec le jeton du client
   (créé par lui sur le portail Discord). Le panneau lui parle par messages (IPC). */
import { bot } from "./discord.js";
import { runOp, ops } from "./ops.js";
import { claimGuild, releaseGuild, releaseAllGuilds } from "./database.js";

const id = process.env.BOT_INSTANCE_ID;
const send = message => { try { process.send?.(message); } catch { /* le panneau s'est arrêté */ } };
const report = () => send({ type: "status", status: ops.status(), guilds: ops.guilds() });

process.on("message", async message => {
  if (!message || message.type !== "op") return;
  try { send({ type: "result", rid: message.rid, ok: true, value: await runOp(message.op, message.args) }); }
  catch (error) { send({ type: "result", rid: message.rid, ok: false, error: error.message || String(error), gone: Boolean(error.gone) }); }
});

bot.once("clientReady", () => {
  releaseAllGuilds(id);
  for (const guild of bot.guilds.cache.values()) claimGuild(guild.id, id);
  report();
  setInterval(report, 30_000).unref();
});
bot.on("guildCreate", guild => { claimGuild(guild.id, id); report(); });
bot.on("guildDelete", guild => { releaseGuild(guild.id, id); report(); });

const stop = () => { releaseAllGuilds(id); bot.destroy(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("disconnect", stop);

bot.login(process.env.DISCORD_TOKEN).catch(error => {
  send({ type: "fatal", error: /token/i.test(error.message) ? "Jeton refusé par Discord : vérifie-le ou régénère-le." : /intent/i.test(error.message) ? "Intents manquants : active « Server Members » et « Message Content » dans le portail Discord (onglet Bot)." : error.message });
  setTimeout(() => process.exit(1), 200);
});
