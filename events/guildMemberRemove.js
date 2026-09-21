import { Events } from 'discord.js';
import { handleSoundboardMemberRemove } from '../utils/soundboardAccess.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    try {
      await handleSoundboardMemberRemove(member, client || member.client);
    } catch (error) {
      logger.warn(`Soundboard access leave failed: ${error?.message || error}`);
    }
  },
};
