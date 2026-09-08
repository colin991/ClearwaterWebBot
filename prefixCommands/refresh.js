import { fetchErlcServer, parseErlcPlayer, executeErlcCommand } from '../utils/erlc.js';
import { getIdentityCache } from '../utils/identityStore.js';

export default {
  name: 'refresh',
  description: 'Refresh yourself in the ER:LC server.',
  async execute(message, args, client) {
    const serverKey = client.config.erlcServerKey;
    if (!serverKey) throw new Error('ER:LC is not configured on the bot host yet.');
    if (args?.length) throw new Error('Use only `;refresh` to refresh yourself.');

    const server = await fetchErlcServer(serverKey);
    const players = (server.Players || server.players || []).map(parseErlcPlayer);
    const identities = await getIdentityCache();
    const identity = identities.byDiscord?.[message.author.id];
    const player = players.find((entry) => entry.robloxId === String(identity?.robloxId || ''));
    if (!player) {
      throw new Error('Your Discord account is not linked to an ER:LC player currently in the server.');
    }

    await executeErlcCommand(serverKey, `:refresh ${player.username}`);
    await message.reply(`Refreshed **${player.username}** in ER:LC.`);
  },
};
