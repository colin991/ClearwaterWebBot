import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { DOD_DEPLOYMENT_CHANNEL_ID, DOD_GUILD_ID, postDodDeployment, requireDodMember } from '../utils/dodReports.js';

export default {
  data: new SlashCommandBuilder().setName('deployment').setDescription('Post a Detentions deployment notice.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false),
  guildIds: [DOD_GUILD_ID],
  async execute(interaction) {
    if (String(interaction.guildId) !== DOD_GUILD_ID) rejectWrongGuild();
    requireDodMember(interaction.member, { staff: true });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await postDodDeployment(interaction);
    await interaction.editReply(`Detentions deployment posted in <#${DOD_DEPLOYMENT_CHANNEL_ID}>.`);
  },
};
