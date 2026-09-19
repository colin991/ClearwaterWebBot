import { requireAdministrator } from '../utils/prefixHelpers.js';
import { sendPinellasCallsignPanel, PINELLAS_CALLSIGN_CHANNEL_ID } from '../utils/pinellasRoster.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';

export default {
  name: 'callsign',
  aliases: ['cs'],
  description: 'Post the public PCSO callsign panel (Administrator only).',
  async execute(message) {
    requireAdministrator(message);
    if (String(message.guild?.id) !== PINELLAS_GUILD_ID) {
      throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
    }

    const channel = message.guild.channels.cache.get(PINELLAS_CALLSIGN_CHANNEL_ID)
      || await message.guild.channels.fetch(PINELLAS_CALLSIGN_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error(`Callsign channel \`${PINELLAS_CALLSIGN_CHANNEL_ID}\` is unavailable.`);
    await sendPinellasCallsignPanel(channel);
    await message.reply('The public callsign panel was posted.');
  },
};
