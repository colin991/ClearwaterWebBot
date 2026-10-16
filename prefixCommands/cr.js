import { FIRE_OPS_GUILD_ID } from '../utils/fireOpsServer.js';
import { requestFireTicketClose } from '../utils/fireSupport.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';
import { requestPinellasTicketClose } from '../utils/pinellasSupport.js';

export default {
  name: 'cr',
  description: 'Ask the ticket opener to confirm closing this PCSO or CWFR support ticket.',
  guildIds: [PINELLAS_GUILD_ID, FIRE_OPS_GUILD_ID],
  async execute(message, args) {
    const guildId = String(message.guild?.id || '');
    if (guildId === FIRE_OPS_GUILD_ID) await requestFireTicketClose(message, args);
    else if (guildId === PINELLAS_GUILD_ID) await requestPinellasTicketClose(message);
  },
};
