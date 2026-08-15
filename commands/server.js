import { SlashCommandBuilder } from 'discord.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Show live information about the Clearwater Discord server.'),

  async execute(interaction) {
    const guild = interaction.guild;
    await interaction.reply(v2Card({
      title: guild?.name || 'Clearwater Roleplay',
      description: 'Serious Florida roleplay. Real community.',
      fields: [
        { name: 'Discord members', value: String(guild?.memberCount ?? 'Unavailable') },
        { name: 'Bot latency', value: `${Math.max(0, Math.round(interaction.client.ws.ping || 0))}ms` },
        { name: 'Website', value: interaction.client.config.websiteUrl },
      ],
    }));
  },
};
