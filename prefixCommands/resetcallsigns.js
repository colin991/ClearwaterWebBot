import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { requireAdministrator } from '../utils/prefixHelpers.js';
import { resetPinellasCallsignRoster, PINELLAS_CALLSIGN_CHANNEL_ID } from '../utils/pinellasRoster.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';

export default {
  name: 'resetcallsigns',
  description: 'Reset the PCSO callsign database and member nicknames (Administrator only).',
  guildIds: [PINELLAS_GUILD_ID],
  async execute(message) {
    if (String(message.guild?.id) !== PINELLAS_GUILD_ID) rejectWrongGuild();
    requireAdministrator(message);
    const result = await resetPinellasCallsignRoster(message.client, message.guild);
    await message.reply([
      `Reset ${result.rowsReset} roster row(s) and ${result.dmsSent} nickname DM(s).`,
      `Members can set their callsign in <#${PINELLAS_CALLSIGN_CHANNEL_ID}>.`,
    ].join('\n'));
  },
};
