import { requireAdministrator } from '../utils/prefixHelpers.js';
import {
  buildPinellasSupportPanel,
  PINELLAS_SUPPORT_GUILD_ID,
  PINELLAS_SUPPORT_PANEL_CHANNEL_ID,
} from '../utils/pinellasSupport.js';

export default {
  name: 'support',
  description: 'Post the PCSO support ticket panel (Administrator only).',
  async execute(message) {
    requireAdministrator(message);
    if (String(message.guild?.id) !== PINELLAS_SUPPORT_GUILD_ID) {
      throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
    }
    const channel = message.guild.channels.cache.get(PINELLAS_SUPPORT_PANEL_CHANNEL_ID)
      || await message.guild.channels.fetch(PINELLAS_SUPPORT_PANEL_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error(`Support panel channel \`${PINELLAS_SUPPORT_PANEL_CHANNEL_ID}\` is unavailable.`);
    await channel.send(buildPinellasSupportPanel());
    await message.reply('The PCSO support ticket panel was posted.');
  },
};
