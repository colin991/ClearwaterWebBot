import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildInternetModerationPanel } from '../utils/discordInternetModeration.js';
import { isInternetStaff } from '../utils/discordInternetStore.js';

export default {
  data: new SlashCommandBuilder()
    .setName('internet')
    .setDescription('Manage Clearwater Internet.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) => subcommand
      .setName('panel')
      .setDescription('Open the Internet moderation panel for a user.')
      .addUserOption((option) => option
        .setName('user')
        .setDescription('The user to manage')
        .setRequired(true))),

  async execute(interaction) {
    if (!isInternetStaff(interaction)) throw new Error('You need the Moderate Members permission to use this command.');
    const target = interaction.options.getUser('user', true);
    if (target.bot) throw new Error('Choose a member, not a bot.');
    await interaction.reply(buildInternetModerationPanel(target));
  },
};
