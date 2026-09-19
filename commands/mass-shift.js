import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  PINELLAS_MASS_SHIFT_CHANNEL_ID,
  postPinellasMassShift,
} from '../utils/pinellasMassShift.js';
import {
  PINELLAS_GUILD_ID,
  requirePinellasCommandAccess,
} from '../utils/pinellasServer.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mass-shift')
    .setDescription('Post a Pinellas County Sheriff\'s Office mass shift briefing.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('focus')
      .setDescription('Primary focus for this mass shift')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(200)),

  async execute(interaction) {
    if (String(interaction.guildId) !== PINELLAS_GUILD_ID) {
      throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
    }

    const issuerMember = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    requirePinellasCommandAccess(issuerMember);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const focus = interaction.options.getString('focus', true);
    const shift = await postPinellasMassShift({
      guild: interaction.guild,
      issuerMember,
      focus,
    });

    await interaction.editReply({
      content: [
        `Mass shift briefing posted in <#${PINELLAS_MASS_SHIFT_CHANNEL_ID}>.`,
        `**Primary Focus:** ${shift.focus}`,
        `ID: \`${shift.id}\``,
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
