import { fetchErlcServer, parseErlcPlayer } from '../utils/erlc.js';
import { ensureGuildMembers } from '../utils/guildMemberSnapshot.js';
import { getIdentityCache } from '../utils/identityStore.js';
import { classifyDiscordPlayers, buildDiscordCheckPanels } from '../utils/discordCheck.js';

export default {
  name: 'dc',
  description: 'Show every in-game player and their Discord and voice status.',
  async execute(message) {
    if (!message.guild || message.guild.id !== message.client.config.guildId) throw new Error('Use -dc in the Clearwater Discord server.');
    // Do not label users missing based on an incomplete member cache.
    await ensureGuildMembers(message.guild);
    const [server, identities] = await Promise.all([
      fetchErlcServer(message.client.config.erlcServerKey), getIdentityCache(),
    ]);
    if (!Array.isArray(server.Players)) throw new Error('The in-game player list is unavailable. Please try again shortly.');
    const rows = classifyDiscordPlayers(server.Players.map(parseErlcPlayer), message.guild.members.cache,
      identities.byDiscord, id => Boolean(message.guild.voiceStates.cache.get(id)?.channelId));
    for (const panel of buildDiscordCheckPanels(rows)) await message.reply(panel);
  },
};
