import { requireAdministrator } from '../utils/prefixHelpers.js';
import { config } from '../config.js';
import { buildMarketPanel } from '../utils/market.js';

export default {
  name: 'market',
  description: 'Post the Clearwater marketplace panel (Administrator only).',
  async execute(message) {
    requireAdministrator(message);
    if (String(message.guild?.id) !== String(config.guildId)) {
      throw new Error('This command can only be used in the main Clearwater server.');
    }
    if (!message.channel?.isTextBased?.()) throw new Error('This command must be used in a text channel.');
    await message.channel.send(buildMarketPanel());
    await message.delete().catch(() => {});
  },
};
