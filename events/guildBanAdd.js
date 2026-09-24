import { Events } from 'discord.js';
import { handleMainServerBan } from '../utils/banAppealDm.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildBanAdd,
  async execute(ban, client) {
    try {
      await handleMainServerBan(ban, client || ban?.client);
    } catch (error) {
      logger.error('Main-server ban appeal DM failed', error);
    }
  },
};
