import { fetchErlcServer, parseErlcPlayer } from '../utils/erlc.js';
import { ensureGuildMembers } from '../utils/guildMemberSnapshot.js';
import { getIdentityCache } from '../utils/identityStore.js';
import { classifyDiscordPlayers, buildDiscordCheckPanels } from '../utils/discordCheck.js';
import { postProximityLog } from '../utils/vcActionLog.js';

export default {
  name: 'dc',
  description: 'Show every in-game player and their Discord and voice status.',
  async execute(message) {
    const clearwaterId = message.client.config.guildId;
    const guild = message.guild?.id === clearwaterId
      ? message.guild
      : (message.client.guilds.cache.get(clearwaterId)
        || await message.client.guilds.fetch(clearwaterId).catch(() => null));
    if (!guild) throw new Error('Use -dc in a server this bot is in. The Clearwater Discord server is unavailable.');
    if (!message.client.config.erlcServerKey) {
      throw new Error('The ER:LC server key is not set on the bot host. Add ERLC_SERVER_KEY to `.env` and restart.');
    }
    await message.channel.sendTyping().catch(() => {});
    await ensureGuildMembers(guild, { allowStale: true }).catch(() => {});
    const [server, identities] = await Promise.all([
      fetchErlcServer(message.client.config.erlcServerKey, { timeoutMs: 8_000 }),
      getIdentityCache(),
    ]);
    if (!Array.isArray(server.Players)) throw new Error('The in-game player list is unavailable. Please try again shortly.');
    const rows = classifyDiscordPlayers(
      server.Players.map(parseErlcPlayer),
      guild.members.cache,
      identities.byDiscord,
      (id) => {
        const key = String(id || '');
        const vs = guild.voiceStates.cache.get(key) || guild.voiceStates.cache.get(id);
        return Boolean(vs?.channelId);
      },
      guild.voiceStates.cache,
    );
    const missing = rows.filter(row => !row.inDiscord).length;
    const inVoice = rows.filter(row => row.inVoice).length;
    const notInVoice = rows.filter(row => row.inDiscord && !row.inVoice).length;
    void postProximityLog(message.client, {
      tag: 'DcCheck',
      body: `${message.author.username} (${message.author.id}): Received \`-dc\` · online ${rows.length} · missing Discord ${missing} · not in VC ${notInVoice} · in VC ${inVoice}`,
    });
    const panels = buildDiscordCheckPanels(rows);
    for (let index = 0; index < panels.length; index += 1) {
      const send = (payload) => (index === 0 ? message.reply(payload) : message.channel.send(payload));
      try {
        await send(panels[index]);
        continue;
      } catch {
        // Expired CDN banners used to fail the whole Components V2 payload.
      }
      try {
        await send(buildDiscordCheckPanels(rows, undefined, { banner: false })[index]);
      } catch {
        const text = panels[index].components[0].components
          .filter((part) => part.type === 10)
          .map((part) => part.content)
          .join('\n')
          .slice(0, 1900);
        await send({ content: text || 'Discord Check could not send.', allowedMentions: { parse: [], repliedUser: false } });
      }
    }
  },
};
