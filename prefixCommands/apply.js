import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { requireAdministrator } from '../utils/prefixHelpers.js';
import { postPinellasApplyPanel } from '../utils/pinellasApply.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  name: 'apply',
  aliases: ['pcsoapply', 'pinellasapply'],
  description: 'Post the Pinellas County Sheriff\'s Office entry application panel (Administrator only).',
  guildIds: [PINELLAS_GUILD_ID],
  async execute(message) {
    if (String(message.guild?.id) !== PINELLAS_GUILD_ID) rejectWrongGuild();
    requireAdministrator(message);

    const sent = await postPinellasApplyPanel(message.client);
    await message.reply(v2Card({
      title: 'Application panel posted',
      description: `Sent the PCSO entry application panel to <#${sent.channelId}>.`,
      ephemeral: false,
    })).catch(() => null);
  },
};
