import { requireAdministrator } from '../utils/prefixHelpers.js';
import { postPinellasApplyPanel } from '../utils/pinellasApply.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  name: 'apply',
  aliases: ['pcsoapply', 'pinellasapply'],
  description: 'Post the Pinellas County Sheriff\'s Office entry application panel (Administrator only).',
  async execute(message) {
    requireAdministrator(message);

    const sent = await postPinellasApplyPanel(message.client);
    await message.reply(v2Card({
      title: 'Application panel posted',
      description: `Sent the PCSO entry application panel to <#${sent.channelId}>.`,
      ephemeral: false,
    })).catch(() => null);
  },
};
