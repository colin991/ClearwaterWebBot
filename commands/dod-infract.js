import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { DOD_GUILD_ID, DOD_STAFF_LOG_CHANNEL_ID, postDodInfraction, requireDodMember } from '../utils/dodReports.js';

export default {
  data: new SlashCommandBuilder().setName('dod-infract').setDescription('Post a Detentions infraction notice.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false)
    .addUserOption((o) => o.setName('infracteduser').setDescription('Member receiving the infraction').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the infraction').setRequired(true).setMinLength(2).setMaxLength(900))
    .addStringOption((o) => o.setName('type').setDescription('Type of infraction').setRequired(true).setMinLength(2).setMaxLength(100))
    .addStringOption((o) => o.setName('notes').setDescription('Additional notes').setRequired(true).setMaxLength(900)),
  guildIds: [DOD_GUILD_ID],
  async execute(interaction) {
    if (String(interaction.guildId) !== DOD_GUILD_ID) rejectWrongGuild();
    requireDodMember(interaction.member, { staff: true });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('infracteduser', true);
    await postDodInfraction(interaction, {
      target, reason: interaction.options.getString('reason', true), type: interaction.options.getString('type', true), notes: interaction.options.getString('notes', true),
    });
    await interaction.editReply(`Detentions infraction posted in <#${DOD_STAFF_LOG_CHANNEL_ID}>.`);
  },
};
