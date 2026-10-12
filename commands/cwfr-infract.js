import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  FIRE_INFRACTION_EXPIRIES,
  FIRE_INFRACTION_TYPES,
  infractFireMember,
} from '../utils/fireInfract.js';
import { FIRE_OPS_GUILD_ID } from '../utils/fireOpsServer.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('cwfr-infract')
    .setDescription('Issue a Clearwater Fire & Rescue personnel infraction.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The member being infracted')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('type')
      .setDescription('Type of infraction')
      .setRequired(true)
      .addChoices(...FIRE_INFRACTION_TYPES.map((type) => ({ name: type.label, value: type.value }))))
    .addStringOption((option) => option
      .setName('policy')
      .setDescription('Policy broken, e.g. S1.01 Unprofessionalism')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(200))
    .addStringOption((option) => option
      .setName('expires')
      .setDescription('When it expires (default: 15 days, 7 for suspensions, never for terminations)')
      .addChoices(...FIRE_INFRACTION_EXPIRIES.map((expiry) => ({ name: expiry.label, value: expiry.value })))),
  guildIds: [FIRE_OPS_GUILD_ID],

  async execute(interaction) {
    if (String(interaction.guildId) !== FIRE_OPS_GUILD_ID) rejectWrongGuild();

    const issuerMember = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    const targetUser = interaction.options.getUser('user', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) throw new Error('That user is not in this server.');

    const result = await infractFireMember({
      guild: interaction.guild,
      targetMember,
      issuerMember,
      typeValue: interaction.options.getString('type', true),
      policy: interaction.options.getString('policy', true),
      expiryValue: interaction.options.getString('expires'),
    });

    await interaction.editReply({
      content: [
        `Issued a **${result.type.label.toLowerCase()}** to <@${targetMember.id}> (expires: ${result.expiry.label}).`,
        `Record posted in <#${result.channel.id}>.`,
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
