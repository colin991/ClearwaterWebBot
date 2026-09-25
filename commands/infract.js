import { SlashCommandBuilder } from 'discord.js';
import { buildInitialInfractPanel } from '../utils/pinellasInfract.js';
import {
  PINELLAS_GUILD_ID,
  requirePinellasInfractionAccess,
} from '../utils/pinellasServer.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('infract')
    .setDescription('Open the Pinellas County Sheriff\'s Office infraction panel.')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false),
  guildIds: [PINELLAS_GUILD_ID],

  async execute(interaction) {
    if (String(interaction.guildId) !== PINELLAS_GUILD_ID) rejectWrongGuild();

    const issuerMember = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    requirePinellasInfractionAccess(issuerMember);

    await interaction.reply(await buildInitialInfractPanel());
  },
};
