import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { DOD_GUILD_ID, postCustodyReport, requireDodMember } from '../utils/dodReports.js';

export default {
  data: new SlashCommandBuilder().setName('custody-report').setDescription('File a Detentions custody transfer report.')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('received-by').setDescription('Callsign of the officer, deputy, or trooper you received the inmate from').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('vehicle').setDescription('Vehicle used to transfer the inmate').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('inmate').setDescription('Inmate Roblox username').setRequired(true).setMinLength(3).setMaxLength(20)),
  guildIds: [DOD_GUILD_ID],
  async execute(interaction) {
    if (String(interaction.guildId) !== DOD_GUILD_ID) rejectWrongGuild();
    requireDodMember(interaction.member);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await postCustodyReport(interaction, {
      receivedBy: interaction.options.getString('received-by', true), vehicle: interaction.options.getString('vehicle', true), inmate: interaction.options.getString('inmate', true),
    });
    await interaction.editReply(`Custody Transfer Log #${result.number} was posted in <#${result.message.channel.id}>.`);
  },
};
