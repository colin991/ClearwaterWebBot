import { requestPinellasTicketClose } from '../utils/pinellasSupport.js';

export default {
  name: 'cr',
  description: 'Ask the ticket opener to confirm closing this PCSO support ticket.',
  async execute(message) {
    await requestPinellasTicketClose(message);
  },
};
