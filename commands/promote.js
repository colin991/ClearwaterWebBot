import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  PINELLAS_RANKS,
  promotePinellasMember,
} from '../utils/pinellasPromote.js';
import {
  PINELLAS_GUILD_ID,
  requirePinellasCommandAccess,
} from '../utils/pinellasServer.js';

const rankChoices = PINELLAS_RANKS.map((rank) => ({
  name: rank.name,
  value: rank.name,
}));

export default {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a Pinellas County Sheriff\'s Office member to a new rank.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The member to promote')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the promotion')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(900))
    .addStringOption((option) => option
      .setName('rank')
      .setDescription('Rank to promote them to')
      .setRequired(true)
      .addChoices(...rankChoices)),

  async execute(interaction) {
    if (String(interaction.guildId) !== PINELLAS_GUILD_ID) {
      throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
    }

    const issuerMember = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    requirePinellasCommandAccess(issuerMember);

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const rankName = interaction.options.getString('rank', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      throw new Error('That user is not in this server.');
    }

    const result = await promotePinellasMember({
      guild: interaction.guild,
      targetMember,
      issuerMember,
      rankName,
      reason,
    });

    const previous = result.previousRanks.length
      ? result.previousRanks.map((rank) => rank.name).join(', ')
      : 'none';

    await interaction.editReply({
      content: [
        `Promoted <@${targetMember.id}> to **${result.rank.name}**.`,
        `Previous PCSO rank(s): ${previous}`,
        `Announcement posted in <#${result.announcement.channel.id}>.`,
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
