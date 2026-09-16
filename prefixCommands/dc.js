import { fetchErlcServer, parseErlcPlayer } from '../utils/erlc.js';
import { ensureGuildMembers } from '../utils/guildMemberSnapshot.js';
import { getIdentityCache } from '../utils/identityStore.js';
import { classifyDiscordPlayers, buildDiscordCheckPanels } from '../utils/discordCheck.js';
import { postProximityLog } from '../utils/vcActionLog.js';

export default {
  name: 'dc',
  description: 'Show every in-game player and their Discord and voice status.',
  async execute(message) {
    if (!message.guild || message.guild.id !== message.client.config.guildId) throw new Error('Use -dc in the Clearwater Discord server.');
    await ensureGuildMembers(message.guild, { allowStale: true }).catch(() => {});
    const [server, identities] = await Promise.all([
      fetchErlcServer(message.client.config.erlcServerKey), getIdentityCache(),
    ]);
    if (!Array.isArray(server.Players)) throw new Error('The in-game player list is unavailable. Please try again shortly.');
    const rows = classifyDiscordPlayers(server.Players.map(parseErlcPlayer), message.guild.members.cache,
      identities.byDiscord, id => Boolean(message.guild.voiceStates.cache.get(id)?.channelId));
    const missing = rows.filter(row => !row.inDiscord).length;
    const inVoice = rows.filter(row => row.inVoice).length;
    const notInVoice = rows.filter(row => row.inDiscord && !row.inVoice).length;
    void postProximityLog(message.client, {
      tag: 'DcCheck',
      body: `${message.author.username} (${message.author.id}): Received \`-dc\` · online ${rows.length} · missing Discord ${missing} · not in VC ${notInVoice} · in VC ${inVoice}`,
    });
    for (const panel of buildDiscordCheckPanels(rows)) await message.reply(panel);
  },
};
