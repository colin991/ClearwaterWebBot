import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { syncOpenTicketPermissions } from '../utils/pinellasSupport.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}.`);
    try {
      const updated = await syncOpenTicketPermissions(client);
      logger.info(`Synced view permissions on ${updated} open ticket channel(s).`);
    } catch (error) {
      logger.error('Could not sync open ticket view permissions', error);
    }
  },
};
