import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { DOD_GUILD_ID, postIncidentReport, requireDodMember } from '../utils/dodReports.js';

export default {
  data: new SlashCommandBuilder().setName('incident-report').setDescription('File a Detentions incident report.')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('assisting-deputies').setDescription('Callsigns of assisting Detention Deputies').setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName('description').setDescription('What happened during the incident? Minimum 50 words').setRequired(true).setMinLength(100).setMaxLength(1500))
    .addStringOption((o) => o.setName('action').setDescription('What action did you take? Minimum 50 words').setRequired(true).setMinLength(100).setMaxLength(1500))
    .addStringOption((o) => o.setName('inmate').setDescription('Inmate Roblox username').setRequired(true).setMinLength(3).setMaxLength(20)),
  guildIds: [DOD_GUILD_ID],
  async execute(interaction) {
    if (String(interaction.guildId) !== DOD_GUILD_ID) rejectWrongGuild();
    requireDodMember(interaction.member);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await postIncidentReport(interaction, {
      assistingDeputies: interaction.options.getString('assisting-deputies', true), description: interaction.options.getString('description', true), action: interaction.options.getString('action', true), inmate: interaction.options.getString('inmate', true),
    });
    await interaction.editReply(`Incident Log #${result.number} was posted in <#${result.message.channel.id}>.`);
  },
};
