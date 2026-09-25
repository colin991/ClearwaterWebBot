import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasDiscordAdministrator } from '../utils/leoBriefing.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Administrator server controls.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('weather')
      .setDescription('Keep the in-game weather clear for a number of minutes.')
      .addIntegerOption((option) => option
        .setName('time')
        .setDescription('How many minutes to keep the weather clear')
        .setMinValue(1)
        .setMaxValue(10_080)
        .setRequired(true))),

  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId) {
      await interaction.reply({ content: 'Use `/clear weather` in the Clearwater Discord server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!await hasDiscordAdministrator(interaction)) {
      await interaction.reply({ content: 'You must have the Discord Administrator permission to use this command.', flags: MessageFlags.Ephemeral });
      return;
    }
    const service = interaction.client.serverWeather;
    if (!service) {
      await interaction.reply({ content: 'The server weather service is not available yet.', flags: MessageFlags.Ephemeral });
      return;
    }
    const minutes = interaction.options.getInteger('time', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await service.lockClear(minutes, interaction.user.id);
    await interaction.editReply(`Weather is now **Clear** and locked for **${result.minutes.toLocaleString('en-US')} minute(s)**, until <t:${Math.floor(result.until / 1000)}:F>.`);
  },
};
