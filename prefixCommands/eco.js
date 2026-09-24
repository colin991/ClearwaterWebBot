import { requireAdministrator } from '../utils/prefixHelpers.js';
import { v2Card } from '../utils/v2Message.js';
import { ECO_PANEL_CHANNEL_ID, postEconomyPanel } from '../utils/economyPanel.js';

export default {
  name: 'eco',
  aliases: ['economy'],
  description: 'Post the Clearwater Economy panel (Administrator only).',
  async execute(message) {
    requireAdministrator(message);
    const sent = await postEconomyPanel(message.client);
    await message.reply(v2Card({
      title: 'Economy panel posted',
      description: `Sent the Clearwater Economy panel to <#${sent.channelId || ECO_PANEL_CHANNEL_ID}>.`,
    })).catch(() => null);
  },
};
