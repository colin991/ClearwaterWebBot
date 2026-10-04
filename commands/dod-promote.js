import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { DOD_GUILD_ID, DOD_STAFF_LOG_CHANNEL_ID, postDodPromotion, requireDodMember } from '../utils/dodReports.js';

export default {
  data: new SlashCommandBuilder().setName('dod-promote').setDescription('Post a Detentions promotion announcement.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false)
    .addUserOption((o) => o.setName('promoteduser').setDescription('Member being promoted').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the promotion').setRequired(true).setMinLength(2).setMaxLength(900))
    .addStringOption((o) => o.setName('rank').setDescription('New Detentions rank').setRequired(true).setMinLength(2).setMaxLength(100)),
  guildIds: [DOD_GUILD_ID],
  async execute(interaction) {
    if (String(interaction.guildId) !== DOD_GUILD_ID) rejectWrongGuild();
    requireDodMember(interaction.member, { staff: true });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('promoteduser', true);
    await postDodPromotion(interaction, {
      target, reason: interaction.options.getString('reason', true), rank: interaction.options.getString('rank', true),
    });
    await interaction.editReply(`Detentions promotion posted in <#${DOD_STAFF_LOG_CHANNEL_ID}>.`);
  },
};
