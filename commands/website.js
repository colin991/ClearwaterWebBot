import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('website')
    .setDescription('Open the official Clearwater Roleplay website.'),

  async execute(interaction) {
    const button = new ButtonBuilder()
      .setLabel('Open Clearwater Website')
      .setStyle(ButtonStyle.Link)
      .setURL(interaction.client.config.websiteUrl);

    await interaction.reply({
      content: 'Visit the official Clearwater Roleplay website:',
      components: [new ActionRowBuilder().addComponents(button)],
    });
  },
};
