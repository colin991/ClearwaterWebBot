import { requireAdministrator } from '../utils/prefixHelpers.js';
import { postPinellasShiftPanel } from '../utils/pinellasShiftPanel.js';
import { v2Card } from '../utils/v2Message.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';

export default {
  name: 'shiftpanel',
  aliases: ['shift-panel', 'dutypanel'],
  description: 'Post or refresh the Pinellas Melonly shift panel (Administrator only).',
  async execute(message) {
    requireAdministrator(message);

    if (String(message.guild?.id) !== PINELLAS_GUILD_ID) {
      throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
    }

    const result = await postPinellasShiftPanel(message.client, { issuer: message.member });
    const count = result?.snapshot?.deputies?.length || 0;
    const active = result?.snapshot?.activeShiftCount || 0;
    const unresolved = result?.snapshot?.unresolvedCount || 0;

    await message.reply(v2Card({
      title: 'Shift panel updated',
      description: [
        `Posted/refreshed in <#${result?.message?.channelId || '1546298062568165396'}>.`,
        `On duty shown: **${count}** (Melonly active: **${active}**`
          + `${unresolved ? `, unresolved: **${unresolved}**` : ''})`,
        '-# Use an API token from the Pinellas Melonly department (Settings → Panel → API Tokens).',
        '-# Updates automatically every 30 seconds from Melonly.',
      ].join('\n'),
    }));
  },
};
