import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';
import { requestPinellasTicketClose } from '../utils/pinellasSupport.js';

export default {
  name: 'cr',
  description: 'Ask the ticket opener to confirm closing this PCSO support ticket.',
  guildIds: [PINELLAS_GUILD_ID],
  async execute(message) {
    await requestPinellasTicketClose(message);
  },
};
