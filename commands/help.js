import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show the Clearwater bot commands.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x4f8ff7)
      .setTitle('Clearwater Bot Help')
      .setDescription([
        '`/ping` - check the bot response time',
        '`/server` - show Clearwater server information',
        '`/help` - show this command list',
      ].join('\n'));

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
