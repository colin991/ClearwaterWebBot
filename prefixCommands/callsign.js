import { requireAdministrator } from '../utils/prefixHelpers.js';
import { getHighestPinellasRank } from '../utils/pinellasPromote.js';
import { buildPinellasCallsignPrompt } from '../utils/pinellasRoster.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';

export default {
  name: 'callsign',
  aliases: ['cs'],
  description: 'Assign or update a PCSO callsign and roster entry (Administrator only).',
  async execute(message) {
    requireAdministrator(message);
    if (String(message.guild?.id) !== PINELLAS_GUILD_ID) {
      throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
    }

    const target = message.mentions.members.first() || message.member;
    if (!target || target.user?.bot) throw new Error('Choose a server member, not a bot.');
    const rank = getHighestPinellasRank(target);
    if (!rank) throw new Error('That member does not have a supported PCSO rank role.');

    await message.reply(buildPinellasCallsignPrompt(message.author.id, target));
  },
};
