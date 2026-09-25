import { Events } from 'discord.js';
import { getOwnerConfig } from '../utils/ownerConfig.js';
import { logger } from '../utils/logger.js';
import { handleLockedPostMessage } from '../utils/lockedPost.js';
import { handleMessageForward } from '../utils/messageForward.js';
import { handleNoticeChannelMessage } from '../utils/noticeChannel.js';
import { parseArgs } from '../utils/prefixHelpers.js';
import { handlePinellasApplyDm } from '../utils/pinellasApply.js';
import { handleAutoReply } from '../utils/autoReplies.js';
import { commandAllowedInGuild } from '../utils/commandGuilds.js';
import { shouldIgnoreGuildCommands } from '../utils/floridaServer.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (/^[-;]addfollowers(?:\s|$)/i.test(message.content || '') && message.author.id !== '1074411240757137589') return;
    try {
      if (await handlePinellasApplyDm(message)) return;
    } catch (error) {
      logger.error('Pinellas apply DM handler failed', error);
    }


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

    try {
      if (await handleAutoReply(message)) return;
    } catch (error) {
      logger.error('Automatic reply failed', error);
    }

    const settings = await getOwnerConfig();
    const prefix = settings.prefix || '-';
    const commandPrefix = message.content.startsWith(prefix)
      ? prefix
      : message.content.startsWith(';') ? ';' : null;
    if (!commandPrefix) return;

    const { name, args } = parseArgs(message.content, commandPrefix);
    if (!name) return;
    if (shouldIgnoreGuildCommands(message.guildId) && name !== 'funds') return;

    const command = client.prefixCommands?.get(name);
    if (!command) return;
    if (!commandAllowedInGuild(command, message.guildId)) return;

    try {
      await command.execute(message, args, client);
    } catch (error) {
      if (error?.code === 'WRONG_GUILD') return;
      logger.error(`Prefix command failed: ${prefix}${name}`, error);
      const text = error?.message || 'That command could not be completed.';
      if (message.channel?.isTextBased()) {
        await message.reply(text.slice(0, 1800)).catch(() => {});
      }
    }
  },
};
