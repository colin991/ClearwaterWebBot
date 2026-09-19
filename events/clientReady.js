import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { startOpenTicketPermissionSync } from '../utils/pinellasSupport.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}.`);
    startOpenTicketPermissionSync(client);
  },
};
