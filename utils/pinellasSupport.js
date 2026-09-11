import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
export const PINELLAS_SUPPORT_PANEL_CHANNEL_ID = '1514256566105276437';
export const PINELLAS_SUPPORT_GUILD_ID = '1514100977920245760';
export const PINELLAS_SUPPORT_CATEGORY_IDS = Object.freeze({
  general: '1514848054724005938',
  compliance: '1514851966629711952',
  sheriff: '1514851966629711952',
});
export const PINELLAS_SUPPORT_BUTTON_PREFIX = 'pcs:support:';

const SUPPORT_OPTIONS = Object.freeze([
  {
    type: 'general',
    title: 'General Support',
    description: 'For everyday assistance, questions, technical issues, and general requests.',
    label: 'Open Ticket',
    emoji: { id: '1517217535802605628', name: 'Tickets' },
  },
  {
    type: 'compliance',
    title: 'Office of Professional Compliance',
    description: 'For staff conduct matters, complaints, investigations, or internal operational concerns.',
    label: 'Open Report',
    emoji: { id: '1517217280658768013', name: 'shield' },
  },
  {
    type: 'sheriff',
    title: 'Office of the Sheriff',
    description: 'For matters that need to be directed to the Office of the Sheriff.',
    label: 'Open Ticket',
    emoji: { id: '1523109128317173800', name: 'PCSO_Sheriff' },
  },
]);

function supportButton(option) {
  return new ButtonBuilder()
    .setCustomId(`${PINELLAS_SUPPORT_BUTTON_PREFIX}${option.type}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(option.label)
    .setEmoji(option.emoji);
}

export function buildPinellasSupportPanel() {
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://media.discordapp.net/attachments/1546222659824787596/1546222760991129671/pcso_support.png?ex=6aa445a9&is=6aa2f429&hm=5b570f0bf240d51f73f740664f434fdff3e6d3327ce4a61ed76bb7ecbbf75782&format=webp&quality=lossless'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:click:1517217194067628062> PCSO Support',
      '> The Pinellas County Sheriff\'s Office ticket panel is used to manage requests, reports, and internal communications. Choose the category that best matches your request.',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

  for (const option of SUPPORT_OPTIONS) {
    container.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([
        `## ${option.emoji.name === 'Tickets' ? '<:Tickets:1517217535802605628>' : option.emoji.name === 'shield' ? '<:shield:1517217280658768013>' : '<:PCSO_Sheriff:1523109128317173800>'} ${option.title}`,
        `> ${option.description}`,
      ].join('\n')))
      .setButtonAccessory(supportButton(option)));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Please submit one ticket per issue and include all relevant details.'));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function ticketName(member, type) {
  const username = String(member.user?.username || member.displayName || member.id)
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || member.id;
  return `${type}-support-${username}`.slice(0, 90);
}

export async function createPinellasSupportTicket(interaction, type) {
  if (String(interaction.guildId) !== PINELLAS_SUPPORT_GUILD_ID) {
    throw new Error('Tickets can only be opened in the Pinellas County Sheriff\'s Office server.');
  }
  const categoryId = PINELLAS_SUPPORT_CATEGORY_IDS[type];
  if (!categoryId) throw new Error('That support category is unavailable.');

  const guild = interaction.guild;
  const member = interaction.member || await guild.members.fetch(interaction.user.id);
  const existing = guild.channels.cache.find((channel) => (
    channel.parentId === categoryId && channel.topic?.includes(`ticket-owner:${member.id}`)
  ));
  if (existing) return { channel: existing, existing: true };

  const botMember = guild.members.me || await guild.members.fetchMe();
  const channel = await guild.channels.create({
    name: ticketName(member, type),
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `ticket-owner:${member.id} ticket-type:${type}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
    ],
  });
  await channel.send({
    content: `<@${member.id}>`,
    embeds: [{
      title: 'PCSO Support Ticket',
      description: 'Please explain what you need help with. A member of the appropriate office will respond here.',
      color: 0x1f2937,
      footer: { text: 'Pinellas County Sheriff Office' },
    }],
    allowedMentions: { users: [member.id] },
  });
  return { channel, existing: false };
}

export async function handlePinellasSupportInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!interaction.isButton() || !id.startsWith(PINELLAS_SUPPORT_BUTTON_PREFIX)) return false;
  const type = id.slice(PINELLAS_SUPPORT_BUTTON_PREFIX.length);
  if (!SUPPORT_OPTIONS.some((option) => option.type === type)) return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await createPinellasSupportTicket(interaction, type);
    await interaction.editReply({
      content: result.existing
        ? `You already have an open ticket: <#${result.channel.id}>`
        : `Your ticket has been created: <#${result.channel.id}>`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    await interaction.editReply({ content: String(error?.message || 'Could not create the ticket.').slice(0, 1800) });
  }
  return true;
}
