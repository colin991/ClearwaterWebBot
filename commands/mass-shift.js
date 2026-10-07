import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  PINELLAS_MASS_SHIFT_CHANNEL_ID,
  massShiftChannelIdForGuild,
  postPinellasMassShift,
} from '../utils/pinellasMassShift.js';
import {
  PINELLAS_GUILD_ID,
  requirePinellasCommandAccess,
} from '../utils/pinellasServer.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';
import { FIRE_OPS_GUILD_ID } from '../utils/fireOpsServer.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mass-shift')
    .setDescription('Post a mass shift briefing for this department.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('focus')
      .setDescription('Primary focus for this mass shift')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(200)),
  guildIds: [PINELLAS_GUILD_ID, FIRE_OPS_GUILD_ID],

  async execute(interaction) {
    const guildId = String(interaction.guildId);
    if (![PINELLAS_GUILD_ID, FIRE_OPS_GUILD_ID].includes(guildId)) rejectWrongGuild();

    const issuerMember = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    if (guildId === PINELLAS_GUILD_ID) requirePinellasCommandAccess(issuerMember);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const focus = interaction.options.getString('focus', true);
    const shift = await postPinellasMassShift({
      guild: interaction.guild,
      issuerMember,
      focus,
    });

    await interaction.editReply({
      content: [
        `Mass shift briefing posted in <#${massShiftChannelIdForGuild(guildId) || PINELLAS_MASS_SHIFT_CHANNEL_ID}>.`,
        `**Primary Focus:** ${shift.focus}`,
        `ID: \`${shift.id}\``,
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
