import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import {
  INFRACTION_TYPES,
  editPinellasInfraction,
} from '../utils/pinellasInfract.js';
import {
  PINELLAS_GUILD_ID,
  requirePinellasInfractionAccess,
} from '../utils/pinellasServer.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';

const typeChoices = INFRACTION_TYPES.map((type) => ({
  name: type.charAt(0).toUpperCase() + type.slice(1),
  value: type,
}));

export default {
  data: new SlashCommandBuilder()
    .setName('edit-infraction')
    .setDescription('Void, restore, or edit an existing PCSO infraction by ID.')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('id')
      .setDescription('Infraction ID')
      .setRequired(true)
      .setMinLength(4)
      .setMaxLength(32))
    .addBooleanOption((option) => option
      .setName('void')
      .setDescription('True voids and strikes it out; false restores and unstrikes')
      .setRequired(false))
    .addStringOption((option) => option
      .setName('type')
      .setDescription('Change the infraction type')
      .setRequired(false)
      .addChoices(...typeChoices))
    .addStringOption((option) => option
      .setName('policy')
      .setDescription('Update the policy broken')
      .setRequired(false)
      .setMaxLength(120))
    .addStringOption((option) => option
      .setName('description')
      .setDescription('Update the description')
      .setRequired(false)
      .setMaxLength(900))
    .addStringOption((option) => option
      .setName('expires')
      .setDescription('New expiry like 12h, 3d, or never')
      .setRequired(false)
      .setMaxLength(20)),
  guildIds: [PINELLAS_GUILD_ID],

  async execute(interaction) {
    if (String(interaction.guildId) !== PINELLAS_GUILD_ID) rejectWrongGuild();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const issuerMember = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    requirePinellasInfractionAccess(issuerMember);

    const id = interaction.options.getString('id', true).trim();
    const voidInfraction = interaction.options.getBoolean('void');
    const type = interaction.options.getString('type');
    const policy = interaction.options.getString('policy');
    const description = interaction.options.getString('description');
    const expires = interaction.options.getString('expires');

    if (voidInfraction == null && !type && !policy && !description && !expires) {
      throw new Error('Provide at least one change: void, type, policy, description, or expires.');
    }

    const entry = await editPinellasInfraction({
      client: interaction.client,
      issuerMember,
      id,
      voidInfraction,
      type,
      policy,
      description,
      expiresToken: expires,
    });

    await interaction.editReply({
      content: [
        `Updated infraction \`${entry.id}\`.`,
        `Status: **${entry.status}**`,
        `Type: **${entry.type}**`,
        entry.channelId && entry.messageId
          ? `Message: https://discord.com/channels/${entry.guildId}/${entry.channelId}/${entry.messageId}`
          : null,
      ].filter(Boolean).join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
