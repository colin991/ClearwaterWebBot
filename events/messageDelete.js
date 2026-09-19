import { Events } from 'discord.js';
import { handleNoticeChannelMessageDelete } from '../utils/noticeChannel.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageDelete,
  async execute(message, client) {
    try {
      await handleNoticeChannelMessageDelete(message, client);
    } catch (error) {
      logger.error('Notice channel delete handler failed', error);
    }
  },
};
