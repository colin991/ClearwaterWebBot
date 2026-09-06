import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildInitialInfractPanel } from '../utils/pinellasInfract.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';

export default {
  data: new SlashCommandBuilder()
    .setName('infract')
    .setDescription('Open the Pinellas County Sheriff\'s Office infraction panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    if (String(interaction.guildId) !== PINELLAS_GUILD_ID) {
      throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
    }

    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!isAdmin && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('You need **Manage Roles** (or Administrator) to use this command.');
    }

    await interaction.reply(await buildInitialInfractPanel());
  },
};
