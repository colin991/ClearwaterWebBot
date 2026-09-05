import { logger } from './logger.js';

/** Forum post / channel where every new message is deleted. */
export const LOCKED_POST_CHANNEL_ID = '1545828641999560824';
export const LOCKED_POST_GUILD_ID = '1514026810348671026';

/**
 * Delete any message sent in the locked Discord post/channel.
 * @returns {Promise<boolean>} true when this handler consumed the message
 */
export async function handleLockedPostMessage(message, client) {
  if (!message?.inGuild?.()) return false;

  const channelId = String(message.channelId || message.channel?.id || '');
  const guildId = String(message.guildId || message.guild?.id || '');

  if (channelId !== LOCKED_POST_CHANNEL_ID) return false;
  if (guildId && guildId !== LOCKED_POST_GUILD_ID) return false;

  // Never delete the bot's own messages (avoids loops if it ever posts there).
  if (message.author?.id && client?.user?.id && message.author.id === client.user.id) {
    return true;
  }

  try {
    if (message.deletable) {
      await message.delete();
      logger.info(`Locked post: deleted message from ${message.author?.tag || message.author?.id || 'unknown'} in ${channelId}.`);
    } else {
      await message.delete().catch(async (error) => {
        // Fallback through channel manager if the message object was partial.
        if (message.channel?.messages?.delete && message.id) {
          await message.channel.messages.delete(message.id);
          return;
        }
        throw error;
      });
      logger.info(`Locked post: deleted message from ${message.author?.tag || message.author?.id || 'unknown'} in ${channelId}.`);
    }
  } catch (error) {
    logger.error(`Locked post: could not delete message ${message.id} in ${channelId}`, error);
  }

  return true;
}
