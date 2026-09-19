import { Events } from 'discord.js';
import { getOwnerConfig } from '../utils/ownerConfig.js';
import { logger } from '../utils/logger.js';
import { parseArgs } from '../utils/prefixHelpers.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.inGuild() || message.author.bot) return;

    const settings = await getOwnerConfig().catch(() => ({ prefix: '-' }));
    const prefix = settings.prefix || '-';
    const commandPrefix = message.content.startsWith(prefix)
      ? prefix
      : message.content.startsWith(';') ? ';' : null;
    if (!commandPrefix) return;

    const { name, args } = parseArgs(message.content, commandPrefix);
    if (!name) return;

    const command = client.prefixCommands?.get(name);
    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (error) {
      logger.error(`Prefix command failed: ${prefix}${name}`, error);
      const text = error?.message || 'That command could not be completed.';
      if (message.channel?.isTextBased()) {
        await message.reply(text.slice(0, 1800)).catch(() => {});
      }
    }
  },
};
