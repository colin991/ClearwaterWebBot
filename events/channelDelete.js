import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { isPinellasSupportTicketChannel } from '../utils/pinellasSupport.js';
import { markTicketChannelClosed } from '../utils/pcsoWebTickets.js';

export default {
  name: Events.ChannelDelete,
  async execute(channel) {
    try {
      if (!isPinellasSupportTicketChannel(channel) && !channel?.id) return;
      await markTicketChannelClosed(channel, { reason: 'deleted' });
    } catch (error) {
      logger.error('Ticket channel delete sync failed', error);
    }
  },
};
