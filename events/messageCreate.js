import { Events } from 'discord.js';
import { getOwnerConfig } from '../utils/ownerConfig.js';
import { logger } from '../utils/logger.js';
import { handleLockedPostMessage } from '../utils/lockedPost.js';
import { handleMessageForward } from '../utils/messageForward.js';
import { handleNoticeChannelMessage } from '../utils/noticeChannel.js';
import { parseArgs } from '../utils/prefixHelpers.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.inGuild()) return;

    try {
      const locked = await handleLockedPostMessage(message, client);
      if (locked) return;
    } catch (error) {
      logger.error('Locked post handler failed', error);
    }

    try {
      const handled = await handleNoticeChannelMessage(message, client);
      if (handled) return;
    } catch (error) {
      logger.error('Notice channel handler failed', error);
    }

    try {
      await handleMessageForward(message, client);
    } catch (error) {
      logger.error('Message forward failed', error);
    }

    if (message.author.bot) return;

    const settings = await getOwnerConfig();
    const prefix = settings.prefix || '-';
    if (!message.content.startsWith(prefix)) return;

    const { name, args } = parseArgs(message.content, prefix);
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
