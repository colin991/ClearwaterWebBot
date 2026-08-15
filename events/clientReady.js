import { ActivityType, Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { ensureNoticeChannel } from '../utils/noticeChannel.js';
import { flushPendingUpdateLogs } from '../utils/updateLog.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    client.user.setActivity('Clearwater Roleplay', { type: ActivityType.Watching });
    logger.info(`Logged in as ${client.user.tag}.`);
    try {
      await flushPendingUpdateLogs(client, client.config);
    } catch (error) {
      logger.error('Could not flush pending update logs', error);
    }
    try {
      await ensureNoticeChannel(client);
    } catch (error) {
      logger.error('Could not prepare notice channel', error);
    }
  },
};
