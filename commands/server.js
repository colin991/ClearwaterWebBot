import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Show live information about the Clearwater Discord server.'),

  async execute(interaction) {
    const guild = interaction.guild;
    const embed = new EmbedBuilder()
      .setColor(0x4f8ff7)
      .setTitle(guild?.name || 'Clearwater Roleplay')
      .setDescription('Serious Florida roleplay. Real community.')
      .addFields(
        { name: 'Discord members', value: String(guild?.memberCount ?? 'Unavailable'), inline: true },
        { name: 'Bot latency', value: `${Math.max(0, Math.round(interaction.client.ws.ping || 0))}ms`, inline: true },
        { name: 'Website', value: interaction.client.config.websiteUrl, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
