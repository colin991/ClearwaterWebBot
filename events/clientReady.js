import { ActivityType, Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    client.user.setActivity('Clearwater Roleplay', { type: ActivityType.Watching });
    logger.info(`Logged in as ${client.user.tag}.`);
  },
};
