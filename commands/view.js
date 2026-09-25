import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { listPinellasInfractions } from '../utils/pinellasInfract.js';
import {
  PINELLAS_GUILD_ID,
  requirePinellasCommandAccess,
} from '../utils/pinellasServer.js';
import { rejectWrongGuild } from '../utils/commandGuilds.js';

const TYPE_LABELS = Object.freeze({
  warning: 'Warning',
  strike: 'Strike',
  demotion: 'Demotion',
  suspension: 'Suspension',
  termination: 'Termination',
});

function discordTimestamp(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? `<t:${Math.floor(time / 1000)}:f>` : 'Unknown date';
}

function cleanField(value, maxLength) {
  const text = String(value || '').replace(/[`\r\n]/g, ' ').trim();
  if (!text) return 'None provided';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function buildInfractionEmbeds(targetUser, entries) {
  const visibleEntries = entries.slice(0, 25);
  const embeds = [];

  for (let index = 0; index < visibleEntries.length; index += 10) {
    const page = visibleEntries.slice(index, index + 10);
    embeds.push(new EmbedBuilder()
      .setTitle(`PCSO Infractions: ${targetUser.tag}`)
      .setColor(0x5865f2)
      .setDescription([
        `Member: <@${targetUser.id}>`,
        `Total records: **${entries.length}**${entries.length > 25 ? ' (showing the 25 most recent)' : ''}`,
      ].join('\n'))
      .addFields(page.map((entry) => ({
        name: `${TYPE_LABELS[entry.type] || 'Infraction'} - ${String(entry.status || 'unknown').toUpperCase()} - ID ${entry.id}`,
        value: [
          `**Policy:** ${cleanField(entry.policy, 160)}`,
          `**Description:** ${cleanField(entry.description, 500)}`,
          `**Issued:** ${discordTimestamp(entry.createdAt)} by <@${entry.issuerId}>`,
          entry.expiresAt ? `**Expires:** ${discordTimestamp(entry.expiresAt)}` : '**Expires:** Never',
          entry.voidedAt ? `**Voided:** ${discordTimestamp(entry.voidedAt)}${entry.voidedBy ? ` by <@${entry.voidedBy}>` : ''}` : null,
        ].filter(Boolean).join('\n'),
        inline: false,
      }))));
  }

  return embeds;
}

export default {
  data: new SlashCommandBuilder()
    .setName('view')
    .setDescription('View PCSO records.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand
      .setName('infractions')
      .setDescription('View a member\'s PCSO infractions.')
      .addUserOption((option) => option
        .setName('user')
        .setDescription('The member whose infractions you want to view')
        .setRequired(true))),
  guildIds: [PINELLAS_GUILD_ID],

  async execute(interaction) {
    if (String(interaction.guildId) !== PINELLAS_GUILD_ID) rejectWrongGuild();

    const issuerMember = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    requirePinellasCommandAccess(issuerMember);

    if (interaction.options.getSubcommand() !== 'infractions') return;

    const targetUser = interaction.options.getUser('user', true);
    const entries = (await listPinellasInfractions())
      .filter((entry) => String(entry.userId) === targetUser.id)
      .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));

    await interaction.reply({
      content: entries.length ? null : `No PCSO infractions were found for ${targetUser.tag}.`,
      embeds: entries.length ? buildInfractionEmbeds(targetUser, entries) : [],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
