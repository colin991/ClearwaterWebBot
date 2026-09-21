import { SlashCommandBuilder } from 'discord.js';
import { formatActivePriorityStatus } from '../utils/priorityRequest.js';
import { v2Card } from '../utils/v2Message.js';

export default {
  data: new SlashCommandBuilder()
    .setName('priority')
    .setDescription('Check the current in-game priority.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('active')
      .setDescription('See who currently has the in-game priority.')),
  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId) {
      await interaction.reply({
        content: 'Use `/priority active` in the Clearwater Discord server.',
        ephemeral: true,
      });
      return;
    }
    const request = interaction.client.priorityRequest?.request || null;
    const status = formatActivePriorityStatus(request, Date.now());
    await interaction.reply(v2Card({
      title: status.title,
      description: status.description,
    }));
  },
};
