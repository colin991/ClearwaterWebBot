import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRE_OPS_GUILD_ID } from './fireOpsServer.js';
import { FIRE_RANKS } from './fireShiftPanel.js';
import { archiveFireTicket } from './fireTranscripts.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

/** Channel holding the CWFR support panel. */
export const FIRE_SUPPORT_PANEL_CHANNEL_ID = '1514804888243142770';

export const FIRE_SUPPORT_PREFIX = 'cfr:support:';
export const FIRE_SUPPORT_CLOSE_ID = `${FIRE_SUPPORT_PREFIX}close`;
export const FIRE_SUPPORT_CLAIM_ID = `${FIRE_SUPPORT_PREFIX}claim`;
export const FIRE_SUPPORT_ESCALATE_ID = `${FIRE_SUPPORT_PREFIX}escalate`;
export const FIRE_SUPPORT_CR_YES_ID = `${FIRE_SUPPORT_PREFIX}cr:yes`;
export const FIRE_SUPPORT_CR_NO_ID = `${FIRE_SUPPORT_PREFIX}cr:no`;
const OPEN_PREFIX = `${FIRE_SUPPORT_PREFIX}open:`;
const INQUIRY_PREFIX = `${FIRE_SUPPORT_PREFIX}inquiry:`;
const INQUIRY_FIELD_ID = 'ticket-inquiry';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'fire-support-panel.json');

// Unsigned Discord CDN links, like the other CWFR panels: Discord re-signs its own
// attachment URLs when it renders a message, so these don't expire.
const BANNER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353690448068709/cwfd_4.png?format=webp&quality=lossless';
const FOOTER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353689634508850/cwfd_footer_4.png?format=webp&quality=lossless';
const TICKETS_EMOJI = '<:tickets:1557159354971459705>';

/** Fire rank role IDs from the top of the ladder down to (and including) `lowest`. */
function ranksFrom(lowest) {
  const end = FIRE_RANKS.findIndex((rank) => rank.name === lowest);
  return Object.freeze(FIRE_RANKS.slice(0, end + 1).map((rank) => rank.roleId));
}

/**
 * Ticket types. `staffRoleIds` can view and claim; escalating moves the ticket to
 * `escalatesTo`.
 */
export const FIRE_SUPPORT_TYPES = Object.freeze({
  ia: Object.freeze({
    type: 'ia',
    title: 'Internal Affairs Support',
    button: 'Internal Affairs',
    style: ButtonStyle.Danger,
    categoryId: '1514804891154120796',
    staffRoleIds: ranksFrom('Lieutenant'),
    escalatesTo: 'chief',
  }),
  line: Object.freeze({
    type: 'line',
    title: 'Line Officer Support',
    button: 'Line Officer',
    style: ButtonStyle.Secondary,
    categoryId: '1514804890680033300',
    staffRoleIds: ranksFrom('Lieutenant'),
    escalatesTo: 'chief',
  }),
  chief: Object.freeze({
    type: 'chief',
    title: 'Office of the Chief Support',
    button: 'Office of the Chief',
    style: ButtonStyle.Secondary,
    categoryId: '1514804891154120794',
    staffRoleIds: ranksFrom('District Chief'),
    escalatesTo: null,
  }),
});

function supportType(type) {
  return FIRE_SUPPORT_TYPES[type] || null;
}

function banner() {
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL));
}

function footer() {
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL));
}

export function buildFireSupportPanel() {
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(banner())
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `# ${TICKETS_EMOJI} CWFR Support`,
      '> You can open a ticket and request support from a representative from one of our teams, please ensure you do not ping one of our team members during your ticket creation.',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '### Support Types —',
      '<:MP_Shield:1557159361804247124> **Internal Affairs Support**',
      '- Personnel reporting & infraction appeals',
      '<:pin:1557159388202934373> **Line Officer Support**',
      '- Contact personnel for your general inquiries',
      '<:Department_Chief:1543732054800212000> **Office of the Chief Support**',
      '- Contact a member of the Office of the Chief',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      ...Object.values(FIRE_SUPPORT_TYPES).map((option) => new ButtonBuilder()
        .setCustomId(`${OPEN_PREFIX}${option.type}`)
        .setStyle(option.style)
        .setLabel(option.button)),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addMediaGalleryComponents(footer());

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildFireInquiryModal(type) {
  const option = supportType(type);
  return new ModalBuilder()
    .setCustomId(`${INQUIRY_PREFIX}${option.type}`)
    .setTitle(option.title.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(INQUIRY_FIELD_ID)
        .setLabel('What do you need help with?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Explain your request with as much detail as possible.')
        .setRequired(true)
        .setMaxLength(1000),
    ));
}

export function buildFireTicketPayload({ ownerId, type, inquiry }) {
  const option = supportType(type);
  const cleanInquiry = String(inquiry || '').replace(/`/g, '\'').trim() || 'No inquiry provided';
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(banner())
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `# ${TICKETS_EMOJI} ${option.title}`,
      `> Hello <@${ownerId}>! Thank you for contacting a representative of our team. We will be with you shortly. Please refrain from pinging us for any reason, inactivity for a longer duration of 50 hours will result in ticket closure.`,
      '### Ticket Inquiry',
      `\`\`\`\n${cleanInquiry}\n\`\`\``,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(FIRE_SUPPORT_CLOSE_ID).setStyle(ButtonStyle.Danger).setLabel('Close'),
      new ButtonBuilder().setCustomId(FIRE_SUPPORT_CLAIM_ID).setStyle(ButtonStyle.Success).setLabel('Claim'),
      new ButtonBuilder().setCustomId(FIRE_SUPPORT_ESCALATE_ID).setStyle(ButtonStyle.Secondary).setLabel('Escalate'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addMediaGalleryComponents(footer());

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], users: [String(ownerId)] },
  };
}

export function fireTicketOwnerId(channel) {
  return channel?.topic?.match(/cwfr-ticket-owner:(\d{16,22})/)?.[1] || null;
}

export function fireTicketType(channel) {
  const type = channel?.topic?.match(/cwfr-ticket-type:([a-z]+)/)?.[1];
  return supportType(type) ? type : null;
}

function ticketTopic({ ownerId, type, claimedById = null }) {
  return [
    `cwfr-ticket-owner:${ownerId}`,
    `cwfr-ticket-type:${type}`,
    claimedById ? `claimed-by:${claimedById}` : '',
  ].filter(Boolean).join(' ');
}

function claimedBy(channel) {
  return channel?.topic?.match(/claimed-by:(\d{16,22})/)?.[1] || null;
}

export function canStaffFireTicket(member, type) {
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const option = supportType(type);
  if (!option) return false;
  return option.staffRoleIds.some((roleId) => member?.roles?.cache?.has?.(roleId));
}

const VIEW_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
];

/** Only the opener, the bot, and that ticket type's staff ranks can see a ticket. */
export function fireTicketOverwrites({ guildId, ownerId, botId, type }) {
  return [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerId, allow: VIEW_ALLOW },
    { id: botId, allow: [...VIEW_ALLOW, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
    ...supportType(type).staffRoleIds.map((roleId) => ({ id: roleId, allow: VIEW_ALLOW })),
  ];
}

function ticketName(member, type) {
  const username = String(member.user?.username || member.displayName || member.id)
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || member.id;
  return `${type}-${username}`.slice(0, 90);
}

export async function createFireSupportTicket(guild, member, type, inquiry) {
  if (String(guild.id) !== FIRE_OPS_GUILD_ID) {
    throw new Error('Tickets can only be opened in the Clearwater Fire & Rescue server.');
  }
  const option = supportType(type);
  if (!option) throw new Error('That support type is unavailable.');

  await guild.channels.fetch().catch(() => {});
  const existing = guild.channels.cache.find((channel) => (
    fireTicketOwnerId(channel) === member.id && fireTicketType(channel) === type
  ));
  if (existing) return { channel: existing, existing: true };

  const botMember = guild.members.me || await guild.members.fetchMe();
  const channel = await guild.channels.create({
    name: ticketName(member, type),
    type: ChannelType.GuildText,
    parent: option.categoryId,
    topic: ticketTopic({ ownerId: member.id, type }),
    permissionOverwrites: fireTicketOverwrites({
      guildId: guild.id,
      ownerId: member.id,
      botId: botMember.id,
      type,
    }),
    reason: `CWFR ${option.title} ticket`,
  });
  await channel.send(buildFireTicketPayload({ ownerId: member.id, type, inquiry }));
  return { channel, existing: false };
}

/** The `-cr` prompt: asks the opener to confirm closing their ticket, like PCSO's. */
export function buildFireCloseRequestPayload(ownerId, { requestedById = null, reason = '' } = {}) {
  const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  return {
    content: [
      `<@${ownerId}> A close request was made${requestedById ? ` by <@${requestedById}>` : ''}. Click **Yes** to close this ticket.`,
      cleanReason ? `**Reason:** ${cleanReason}` : '',
    ].filter(Boolean).join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(FIRE_SUPPORT_CR_YES_ID).setStyle(ButtonStyle.Success).setLabel('Yes'),
        new ButtonBuilder().setCustomId(FIRE_SUPPORT_CR_NO_ID).setStyle(ButtonStyle.Secondary).setLabel('No'),
      ),
    ],
    allowedMentions: { parse: [], users: [String(ownerId)] },
  };
}

/** `-cr [reason]` from ticket staff inside a CWFR ticket. Silent outside the CWFR server. */
export async function requestFireTicketClose(message, args = []) {
  if (String(message.guild?.id) !== FIRE_OPS_GUILD_ID) return false;
  const channel = message.channel;
  const ownerId = fireTicketOwnerId(channel);
  const type = fireTicketType(channel);
  if (!ownerId || !type) throw new Error('Use `-cr` in an open CWFR support ticket.');
  if (!canStaffFireTicket(message.member, type)) {
    throw new Error('Only staff for this ticket type can send a close request.');
  }
  await channel.send(buildFireCloseRequestPayload(ownerId, {
    requestedById: message.author.id,
    reason: args.join(' '),
  }));
  return true;
}

/** Save the transcript, announce the close, then delete the ticket channel. */
async function closeFireTicket(channel, interaction, { closedVia = 'button', reason = '' } = {}) {
  const user = interaction.user;
  const type = fireTicketType(channel);
  await channel.send({
    content: `This ticket was closed by <@${user.id}>. The channel will be deleted shortly.`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
  await archiveFireTicket(channel, {
    ownerId: fireTicketOwnerId(channel),
    type,
    typeTitle: supportType(type)?.title || 'Support',
    claimedById: claimedBy(channel),
    closedBy: { user, member: interaction.member },
    closedVia,
    reason,
    isStaff: (member) => canStaffFireTicket(member, type),
  });
  setTimeout(() => { void channel.delete('CWFR support ticket closed').catch(() => {}); }, 3_000).unref?.();
}

/** The reason line `-cr` wrote into its prompt, if any. */
export function closeRequestReason(content) {
  return String(content || '').match(/\*\*Reason:\*\* (.+)$/m)?.[1]?.trim() || '';
}

async function escalateTicket(interaction, channel, ownerId, type) {
  const next = supportType(supportType(type).escalatesTo);
  await channel.setParent(next.categoryId, { lockPermissions: false });
  await channel.permissionOverwrites.set(fireTicketOverwrites({
    guildId: channel.guild.id,
    ownerId,
    botId: interaction.client.user.id,
    type: next.type,
  }), `CWFR ticket escalated to ${next.title}`);
  await channel.setTopic(ticketTopic({ ownerId, type: next.type }));
  await channel.send({
    content: `This ticket was escalated to **${next.title}** by <@${interaction.user.id}>.`,
    allowedMentions: { parse: [] },
  });
  return next;
}

export async function handleFireSupportInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith(FIRE_SUPPORT_PREFIX)) return false;
  if (String(interaction.guildId) !== FIRE_OPS_GUILD_ID) return false;

  if (id.startsWith(OPEN_PREFIX) && interaction.isButton()) {
    const type = id.slice(OPEN_PREFIX.length);
    if (!supportType(type)) return false;
    await interaction.showModal(buildFireInquiryModal(type));
    return true;
  }

  if (id.startsWith(INQUIRY_PREFIX) && interaction.isModalSubmit()) {
    const type = id.slice(INQUIRY_PREFIX.length);
    if (!supportType(type)) return false;
    const inquiry = interaction.fields.getTextInputValue(INQUIRY_FIELD_ID);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id);
      const result = await createFireSupportTicket(interaction.guild, member, type, inquiry);
      await interaction.editReply(result.existing
        ? `You already have an open ticket: <#${result.channel.id}>`
        : `Your ticket has been created: <#${result.channel.id}>`);
    } catch (error) {
      logger.error('CWFR support: could not create ticket', error);
      await interaction.editReply(String(error?.message || 'Could not create the ticket.').slice(0, 1800));
    }
    return true;
  }

  if (!interaction.isButton()) return false;
  const channel = interaction.channel;
  const ownerId = fireTicketOwnerId(channel);
  const type = fireTicketType(channel);
  if (!ownerId || !type) {
    await interaction.reply({ content: 'This is not a CWFR support ticket.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const isStaff = canStaffFireTicket(interaction.member, type);

  if (id === FIRE_SUPPORT_CLOSE_ID) {
    if (!isStaff && interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Only the ticket owner or staff can close this ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({ content: 'This ticket is closing.', flags: MessageFlags.Ephemeral });
    await closeFireTicket(channel, interaction);
    return true;
  }

  if (id === FIRE_SUPPORT_CR_YES_ID) {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Only the ticket opener can confirm this close request.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const reason = closeRequestReason(interaction.message?.content);
    await interaction.update({
      content: `Close request accepted by <@${interaction.user.id}>.`,
      components: [],
      allowedMentions: { parse: [] },
    }).catch(async () => {
      await interaction.reply({ content: 'This ticket is closing.', flags: MessageFlags.Ephemeral });
    });
    await closeFireTicket(channel, interaction, { closedVia: 'close-request', reason });
    return true;
  }

  if (id === FIRE_SUPPORT_CR_NO_ID) {
    if (interaction.user.id !== ownerId && !isStaff) {
      await interaction.reply({ content: 'Only the ticket opener or staff can dismiss this close request.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.update({ content: 'Close request cancelled.', components: [], allowedMentions: { parse: [] } }).catch(async () => {
      await interaction.reply({ content: 'Close request cancelled.', flags: MessageFlags.Ephemeral });
    });
    return true;
  }

  if (!isStaff) {
    await interaction.reply({ content: 'Only staff for this ticket type can do that.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === FIRE_SUPPORT_CLAIM_ID) {
    const claimer = claimedBy(channel);
    if (claimer) {
      await interaction.reply({ content: `This ticket is already claimed by <@${claimer}>.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({ content: 'You claimed this ticket.', flags: MessageFlags.Ephemeral });
    await channel.setTopic(ticketTopic({ ownerId, type, claimedById: interaction.user.id })).catch(() => {});
    await channel.send({
      content: `This ticket has been claimed by <@${interaction.user.id}>.`,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }

  if (id === FIRE_SUPPORT_ESCALATE_ID) {
    if (!supportType(type).escalatesTo) {
      await interaction.reply({ content: 'This ticket is already with the Office of the Chief.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const next = await escalateTicket(interaction, channel, ownerId, type);
    await interaction.editReply(`Escalated to **${next.title}**.`);
    return true;
  }

  return false;
}

/** Post the support panel, or edit the one already in the channel. */
export async function ensureFireSupportPanel(client) {
  const channel = await client.channels.fetch(FIRE_SUPPORT_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`CWFR support: panel channel ${FIRE_SUPPORT_PANEL_CHANNEL_ID} is unavailable.`);
    return null;
  }

  const store = await readJsonFile(STORE_PATH, {});
  let message = store.messageId
    ? await channel.messages.fetch(store.messageId).catch(() => null)
    : null;
  if (!message) {
    // Fall back to an earlier panel the store lost track of, so restarts never duplicate it.
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    message = recent?.find((entry) => (
      entry.author?.id === client.user.id
      && JSON.stringify(entry.components?.map((row) => row.toJSON?.() ?? row) || []).includes(OPEN_PREFIX)
    )) || null;
  }

  const payload = buildFireSupportPanel();
  if (message) await message.edit({ components: payload.components, flags: payload.flags, allowedMentions: payload.allowedMentions });
  else message = await channel.send(payload);

  await writeJsonFile(STORE_PATH, { channelId: channel.id, messageId: message.id, updatedAt: new Date().toISOString() });
  logger.info(`CWFR support panel ready in ${channel.id} (message ${message.id}).`);
  return message;
}

export function startFireSupportPanel(client) {
  const timer = setTimeout(() => {
    void ensureFireSupportPanel(client).catch((error) => logger.error('CWFR support panel failed', error));
  }, 5_000);
  timer.unref?.();
  return () => clearTimeout(timer);
}
