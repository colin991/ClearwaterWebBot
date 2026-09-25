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
  OverwriteType,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config.js';
import { logger } from './logger.js';
import { fetchMelonlyMemberByDiscordId } from './melonly.js';

export const PINELLAS_SUPPORT_PANEL_CHANNEL_ID = '1514256566105276437';
export const PINELLAS_SUPPORT_GUILD_ID = '1514100977920245760';
export const PINELLAS_SUPPORT_CATEGORY_IDS = Object.freeze({
  general: '1514848054724005938',
  compliance: '1514851966629711952',
  sheriff: '1514848142653390898',
});
export const PINELLAS_SUPPORT_BUTTON_PREFIX = 'pcs:support:';
export const PINELLAS_SUPPORT_TRANSCRIPT_CHANNEL_ID = '1542631874684526663';
export const PINELLAS_SUPPORT_CLOSE_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}close`;
export const PINELLAS_SUPPORT_CLAIM_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}claim`;
/** @deprecated Use PINELLAS_SUPPORT_STAFF_ROLE_IDS. Kept so older imports keep resolving. */
export const PINELLAS_SUPPORT_CLAIM_ROLE_ID = '1514361384576618627';
export const PINELLAS_SUPPORT_STAFF_ROLE_IDS = Object.freeze({
  general: '1514361384576618627',
  compliance: '1514851283817725962',
  sheriff: '1514361105244356639',
});
export const PINELLAS_SUPPORT_STAFF_ROLE_LIST = Object.freeze(Object.values(PINELLAS_SUPPORT_STAFF_ROLE_IDS));
export const PINELLAS_SUPPORT_CR_YES_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}cr:yes`;
export const PINELLAS_SUPPORT_CR_NO_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}cr:no`;
const PINELLAS_SUPPORT_STAFF_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}staff`;
const PINELLAS_SUPPORT_INQUIRY_FIELD_ID = 'ticket-inquiry';
export const OPC_INQUIRY_FIELDS = Object.freeze([
  {
    id: 'opc-who',
    label: 'Who are you reporting?',
    style: TextInputStyle.Short,
    placeholder: 'Deputy name, callsign, or Discord.',
    maxLength: 200,
  },
  {
    id: 'opc-why',
    label: 'Why are you reporting this deputy?',
    style: TextInputStyle.Paragraph,
    placeholder: 'Describe what happened.',
    maxLength: 1000,
  },
  {
    id: 'opc-proof',
    label: 'Do you have any proof of this?',
    style: TextInputStyle.Paragraph,
    placeholder: 'Links, clips, screenshots, or witnesses.',
    maxLength: 1000,
  },
]);

export const PINELLAS_SUPPORT_OPTIONS = Object.freeze([
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

function supportTypeLabel(type) {
  return PINELLAS_SUPPORT_OPTIONS.find((option) => option.type === type)?.title || 'Support';
}

export function pinellasSupportCategoryIds() {
  return [...new Set(Object.values(PINELLAS_SUPPORT_CATEGORY_IDS))];
}

export function ticketTypeFromTopic(channel) {
  return channel?.topic?.match(/ticket-type:([a-z]+)/)?.[1] || 'general';
}

export function ticketTypeFromChannel(channel) {
  const matched = channel?.topic?.match(/ticket-type:([a-z]+)/)?.[1];
  if (matched && PINELLAS_SUPPORT_STAFF_ROLE_IDS[matched]) return matched;
  const parentId = String(channel?.parentId || '');
  for (const [type, id] of Object.entries(PINELLAS_SUPPORT_CATEGORY_IDS)) {
    if (String(id) === parentId) return type;
  }
  return 'general';
}

export function formatTicketInquiryNote(inquiry, source) {
  const text = String(inquiry || '').trim();
  if (source === 'website') {
    return text ? `${text}\n\nOpened from the PCSO website.` : 'Opened from the PCSO website.';
  }
  return text;
}

export function findOpenSupportChannelsForOwner(guild, ownerId) {
  const categories = new Set(pinellasSupportCategoryIds());
  const owner = String(ownerId);
  return [...(guild?.channels?.cache?.values?.() || [])].filter((channel) => (
    categories.has(String(channel.parentId || ''))
    && String(channel.topic || '').includes(`ticket-owner:${owner}`)
  ));
}

export function websiteTicketFields(type) {
  if (type === 'compliance') {
    return OPC_INQUIRY_FIELDS.map((field) => ({
      id: field.id,
      label: field.label,
      placeholder: field.placeholder,
      maxLength: field.maxLength,
      multiline: field.style === TextInputStyle.Paragraph,
    }));
  }
  return [{
    id: PINELLAS_SUPPORT_INQUIRY_FIELD_ID,
    label: 'What do you need help with?',
    placeholder: 'Explain your request with as much detail as possible.',
    maxLength: 1000,
    multiline: true,
  }];
}

export function formatWebsiteInquiry(type, fields = {}) {
  const schema = websiteTicketFields(type);
  const lines = schema.map((field) => {
    const value = String(fields[field.id] || '').trim();
    if (!value) throw new Error(`Answer: ${field.label}`);
    return `${field.label}\n${value.slice(0, field.maxLength)}`;
  });
  return lines.join('\n\n');
}

function supportButton(option) {
  return new ButtonBuilder()
    .setCustomId(`${PINELLAS_SUPPORT_BUTTON_PREFIX}${option.type}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(option.label)
    .setEmoji(option.emoji);
}

export function buildInquiryModal(type) {
  const option = PINELLAS_SUPPORT_OPTIONS.find((entry) => entry.type === type);
  const modal = new ModalBuilder()
    .setCustomId(`${PINELLAS_SUPPORT_BUTTON_PREFIX}inquiry:${type}`)
    .setTitle(`${option?.title || 'Support'} Inquiry`.slice(0, 45));

  if (type === 'compliance') {
    for (const field of OPC_INQUIRY_FIELDS) {
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(field.style)
          .setPlaceholder(field.placeholder)
          .setRequired(true)
          .setMaxLength(field.maxLength),
      ));
    }
    return modal;
  }

  return modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(PINELLAS_SUPPORT_INQUIRY_FIELD_ID)
      .setLabel('What do you need help with?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Explain your request with as much detail as possible.')
      .setRequired(true)
      .setMaxLength(1000),
  ));
}

function readInquiryFromModal(interaction, type) {
  if (type === 'compliance') {
    return OPC_INQUIRY_FIELDS.map((field) => {
      const value = String(interaction.fields.getTextInputValue(field.id) || '').trim() || 'Not provided';
      return `${field.label}\n${value}`;
    }).join('\n\n');
  }
  return interaction.fields.getTextInputValue(PINELLAS_SUPPORT_INQUIRY_FIELD_ID).trim();
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

  for (const option of PINELLAS_SUPPORT_OPTIONS) {
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

function melonlyValue(member, ...keys) {
  for (const key of keys) {
    const value = member?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return 'Not linked';
}

async function buildTicketPayload(member, type, inquiry = '') {
  let melonly = null;
  if (config.melonlyApiKey) {
    melonly = await fetchMelonlyMemberByDiscordId(config.melonlyApiKey, member.id).catch(() => null);
  }
  const robloxUsername = melonlyValue(melonly, 'robloxUsername', 'roblox_username', 'username', 'robloxName');
  const robloxId = melonlyValue(melonly, 'robloxId', 'roblox_id', 'robloxUserId', 'roblox_user_id');
  const robloxProfile = /^\d+$/.test(robloxId) ? `https://www.roblox.com/users/${robloxId}/profile` : 'Not linked';
  const option = PINELLAS_SUPPORT_OPTIONS.find((entry) => entry.type === type);
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://media.discordapp.net/attachments/1546222659824787596/1546222760991129671/pcso_support.png?ex=6aa59729&is=6aa445a9&hm=f343493334e16de182b31c98e8ef35b5d7ce90bee5a54130711067d733ae7455&=&format=webp&quality=lossless'),
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `# <:wave:1517217333234503790> Welcome ${member.displayName}`,
      'Welcome to **Pinellas County Sheriff\'s Office**. Thank you for reaching out to support. A member of the Command Team will be with you shortly. Inactivity for over 12 hours may lead to closure.',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## <:sheet:1546293540827701329> Account Information',
      `**Discord Username:** ${member.user.tag}`,
      `**Display Name:** ${member.displayName}`,
      `**Discord ID:** \`${member.id}\``,
      `**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
      '',
      `**Roblox Username:** ${robloxUsername}`,
      `**Roblox ID:** \`${robloxId}\``,
      `**Profile:** ${robloxProfile}`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Inquiry - ${option?.title || 'Support'}**`,
      `\`\`\`${String(inquiry || 'No inquiry provided').replace(/`/g, '')}\`\`\``,
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(PINELLAS_SUPPORT_CLAIM_ID).setStyle(ButtonStyle.Secondary).setLabel('Claim'),
      new ButtonBuilder().setCustomId(PINELLAS_SUPPORT_CLOSE_ID).setStyle(ButtonStyle.Danger).setLabel('Close'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://media.discordapp.net/attachments/1546222659824787596/1546222852494069920/PCSO_footer.png?ex=6aa5973f&is=6aa445bf&hm=d9751d9b7106e11e781252aea478019f27d5f5c82b744828e56b932c073bf0c7&=&format=webp&quality=lossless'),
    ));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [member.id] },
  };
}

async function createTicketTranscript(client, channel, { ownerId, closedById, closureReason }) {
  if (!config.cookieApiKey) {
    throw new Error('COOKIE_API_KEY is not configured on the bot host.');
  }
  const type = channel.topic?.match(/ticket-type:([a-z]+)/)?.[1] || 'general';
  const response = await fetch(`https://api.cookie-api.com/api/transcript?channel_id=${encodeURIComponent(channel.id)}`, {
    method: 'POST',
    headers: {
      Authorization: config.cookieApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_token: config.token,
      title: `PCSO ${supportTypeLabel(type)} Ticket Transcript`,
      description: `Transcript for ${channel.name}`,
      image_restore: true,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success || !result?.url) {
    throw new Error(`Cookie API transcript request failed (${response.status}).`);
  }
  return {
    url: result.url,
    type,
    ownerId,
    closedById,
    closureReason,
    openedAt: channel.createdTimestamp || Date.now(),
    closedAt: Date.now(),
  };
}

function buildTranscriptPayload(transcript, channelName) {
  const container = new ContainerBuilder().clearAccentColor()
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Tickets:1517217535802605628> Ticket Transcript'))
      .setButtonAccessory(new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Transcript')
        .setURL(transcript.url)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Opened At:** <t:${Math.floor(transcript.openedAt / 1000)}:F>`,
      `**Channel Name:** ${channelName}`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Ticket Type:** ${supportTypeLabel(transcript.type)}`,
      `**Ticket Opener:** <@${transcript.ownerId}>`,
      `**Claimed By:** ${transcript.claimedById ? `<@${transcript.claimedById}>` : 'Nobody'}`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Closed By:** <@${transcript.closedById}>`,
      `**Closed At:** <t:${Math.floor(transcript.closedAt / 1000)}:F>`,
      `**Closure Reason:** ${transcript.closureReason}`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://media.discordapp.net/attachments/1546222659824787596/1546222852494069920/PCSO_footer.png?ex=6aa5973f&is=6aa445bf&hm=d9751d9b7106e11e781252aea478019f27d5f5c82b744828e56b932c073bf0c7&=&format=webp&quality=lossless'),
    ));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function archiveAndDmTicketTranscript(client, channel, { ownerId, closedById, closureReason }) {
  const claimedById = channel.topic?.match(/claimed-by:(\d{16,22})/)?.[1] || null;
  const transcript = await createTicketTranscript(client, channel, {
    ownerId,
    closedById,
    closureReason,
  });
  transcript.claimedById = claimedById;
  const payload = buildTranscriptPayload(transcript, channel.name);
  const archiveChannel = await client.channels.fetch(PINELLAS_SUPPORT_TRANSCRIPT_CHANNEL_ID).catch(() => null);
  if (!archiveChannel?.isTextBased?.()) throw new Error('The ticket transcript channel is unavailable.');
  await archiveChannel.send(payload);
  if (ownerId) {
    const owner = await client.users.fetch(ownerId).catch(() => null);
    if (owner) await owner.send(payload).catch(() => {});
  }
  return transcript;
}

export function ticketOwnerId(channel) {
  return channel?.topic?.match(/ticket-owner:(\d{16,22})/)?.[1] || null;
}

export function ticketOwnerIdFromOverwrites(channel, botId) {
  const cache = channel?.permissionOverwrites?.cache;
  if (!cache?.values) return null;
  for (const overwrite of cache.values()) {
    const type = overwrite.type;
    const isMember = type === OverwriteType.Member || type === 1;
    if (!isMember) continue;
    if (botId && String(overwrite.id) === String(botId)) continue;
    const allowsView = overwrite.allow?.has?.(PermissionFlagsBits.ViewChannel);
    if (allowsView === false) continue;
    return String(overwrite.id);
  }
  return null;
}

export function isPinellasSupportTicketChannel(channel) {
  if (ticketOwnerId(channel)) return true;
  const parentId = String(channel?.parentId || '');
  if (!pinellasSupportCategoryIds().includes(parentId)) return false;
  if (channel?.type === ChannelType.GuildCategory) return false;
  return channel?.type == null || channel.type === ChannelType.GuildText;
}

export const TICKET_OPENER_OVERWRITES = Object.freeze({
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AttachFiles: true,
});

export const TICKET_BOT_OVERWRITES = Object.freeze({
  ...TICKET_OPENER_OVERWRITES,
  ManageChannels: true,
  ManageMessages: true,
  ManageWebhooks: true,
});

export function staffRoleIdForTicketType(type) {
  if (type && PINELLAS_SUPPORT_STAFF_ROLE_IDS[type]) {
    return PINELLAS_SUPPORT_STAFF_ROLE_IDS[type];
  }
  return PINELLAS_SUPPORT_STAFF_ROLE_IDS.general;
}

export function memberHasTicketStaffRole(member, type) {
  const roles = member?.roles;
  if (!roles) return false;
  const allowed = type
    ? [staffRoleIdForTicketType(type)]
    : Object.values(PINELLAS_SUPPORT_STAFF_ROLE_IDS);
  const has = (id) => {
    if (typeof roles.cache?.has === 'function') return roles.cache.has(id);
    if (typeof roles.has === 'function') return roles.has(id);
    if (Array.isArray(roles)) return roles.map(String).includes(id);
    return false;
  };
  return allowed.some((id) => has(id));
}

export function memberHasPinellasClaimRole(member) {
  return memberHasTicketStaffRole(member);
}

export function canClaimPinellasTicket(member, type) {
  return Boolean(
    member?.permissions?.has?.(PermissionFlagsBits.Administrator)
    || memberHasTicketStaffRole(member, type),
  );
}

function overwriteAllow(bits) {
  return Object.entries(bits).filter(([, allowed]) => allowed).map(([name]) => PermissionFlagsBits[name]).filter(Boolean);
}

function staffViewOverwrites({ guildId, openerId, botId, staffRoleId }) {
  const overwrites = [];
  if (guildId) {
    overwrites.push({
      id: guildId,
      deny: [PermissionFlagsBits.ViewChannel],
    });
  }
  if (openerId) {
    overwrites.push({ id: openerId, allow: overwriteAllow(TICKET_OPENER_OVERWRITES) });
  }
  if (botId) {
    overwrites.push({ id: botId, allow: overwriteAllow(TICKET_BOT_OVERWRITES) });
  }
  if (staffRoleId) {
    overwrites.push({ id: staffRoleId, allow: overwriteAllow(TICKET_OPENER_OVERWRITES) });
  }
  return overwrites;
}

/** Hide the category from everyone except the matching staff role and the bot. */
export async function syncTicketCategoryPermissions(guild, botId) {
  if (!guild?.channels) return 0;
  let updated = 0;
  for (const [type, categoryId] of Object.entries(PINELLAS_SUPPORT_CATEGORY_IDS)) {
    let category = guild.channels.cache?.get?.(categoryId);
    if (!category && typeof guild.channels.fetch === 'function') {
      category = await guild.channels.fetch(categoryId).catch(() => null);
    }
    if (typeof category?.permissionOverwrites?.set !== 'function') continue;
    const guildId = category.guild?.id || guild.id;
    try {
      await category.permissionOverwrites.set(
        staffViewOverwrites({
          guildId,
          botId,
          staffRoleId: staffRoleIdForTicketType(type),
        }),
        'PCSO ticket category staff view',
      );
      updated += 1;
    } catch (error) {
      logger.error(`Could not update ticket category permissions for ${categoryId}`, error);
    }
  }
  return updated;
}

/** Replace inherited roles so only the opener, bot, and matching category staff role can see the ticket. */
export async function syncTicketChannelToCategory(channel, { openerId, botId, type } = {}) {
  if (typeof channel?.permissionOverwrites?.set !== 'function') return channel;
  const ticketType = type || ticketTypeFromChannel(channel);
  const guildId = channel?.guild?.id || channel?.guildId;
  const resolvedOpener = openerId
    || ticketOwnerId(channel)
    || ticketOwnerIdFromOverwrites(channel, botId);
  await channel.permissionOverwrites.set(
    staffViewOverwrites({
      guildId,
      openerId: resolvedOpener,
      botId,
      staffRoleId: staffRoleIdForTicketType(ticketType),
    }),
    'PCSO ticket staff view roles',
  );
  return channel;
}

async function resolveTicketGuild(client) {
  if (!client?.guilds) return null;
  const cached = client.guilds.cache?.get?.(PINELLAS_SUPPORT_GUILD_ID);
  if (cached) return cached;
  const fetched = await client.guilds.fetch(PINELLAS_SUPPORT_GUILD_ID).catch(() => null);
  if (fetched) return fetched;
  await client.guilds.fetch().catch(() => {});
  return client.guilds.cache?.get?.(PINELLAS_SUPPORT_GUILD_ID) || null;
}

export async function syncOpenTicketPermissions(client) {
  const guild = await resolveTicketGuild(client);
  if (!guild) return 0;
  await guild.channels.fetch().catch(() => {});
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const categories = await syncTicketCategoryPermissions(guild, botMember?.id);
  let updated = 0;
  for (const cached of guild.channels.cache.values()) {
    let channel = cached;
    if (!channel.topic && typeof channel.fetch === 'function') {
      channel = await channel.fetch().catch(() => cached);
    }
    if (!isPinellasSupportTicketChannel(channel)) continue;
    try {
      await syncTicketChannelToCategory(channel, {
        openerId: ticketOwnerId(channel) || ticketOwnerIdFromOverwrites(channel, botMember?.id),
        botId: botMember?.id,
        type: ticketTypeFromChannel(channel),
      });
      updated += 1;
    } catch (error) {
      logger.error(`Could not update ticket permissions for ${channel.id}`, error);
    }
  }
  if (categories) {
    logger.info(`Synced view permissions on ${categories} ticket categor${categories === 1 ? 'y' : 'ies'}.`);
  }
  return updated;
}

export function startOpenTicketPermissionSync(client) {
  if (client?.__pinellasTicketPermSyncStarted) return;
  if (client) client.__pinellasTicketPermSyncStarted = true;
  const delays = [0, 2_500, 10_000];
  for (const delayMs of delays) {
    const timer = setTimeout(() => {
      void syncOpenTicketPermissions(client)
        .then((updated) => {
          logger.info(`Synced view permissions on ${updated} open ticket channel(s).`);
        })
        .catch((error) => {
          logger.error('Could not sync open ticket view permissions', error);
        });
    }, delayMs);
    timer.unref?.();
  }
}

export function buildTicketOpenPingPayload(memberId) {
  const id = String(memberId || '');
  return {
    content: id ? `@here <@${id}>` : '@here',
    allowedMentions: {
      parse: ['everyone'],
      users: id ? [id] : [],
    },
  };
}

export function buildTicketCloseRequestPayload(ownerId) {
  return {
    content: ownerId
      ? `<@${ownerId}> A close request was made. Click **Yes** to close this ticket.`
      : 'A close request was made. Click **Yes** to close this ticket.',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(PINELLAS_SUPPORT_CR_YES_ID).setStyle(ButtonStyle.Success).setLabel('Yes'),
        new ButtonBuilder().setCustomId(PINELLAS_SUPPORT_CR_NO_ID).setStyle(ButtonStyle.Secondary).setLabel('No'),
      ),
    ],
    allowedMentions: { users: ownerId ? [ownerId] : [] },
  };
}

async function closePinellasSupportTicket(channel, { client, user, ownerId, reason }) {
  let transcript = null;
  try {
    transcript = await archiveAndDmTicketTranscript(client, channel, {
      ownerId,
      closedById: user.id,
      closureReason: reason,
    });
  } catch (error) {
    await channel.send(`The ticket will still be deleted, but the transcript could not be created: ${error?.message || 'unknown error'}`).catch(() => {});
  }
  try {
    const { saveClosedTicketTranscript, snapshotTicketChannelMessages } = await import('./pcsoWebTickets.js');
    const messages = await snapshotTicketChannelMessages(channel, { discordId: ownerId });
    await saveClosedTicketTranscript(channel, {
      ownerId,
      type: transcript?.type,
      transcript: transcript || {
        closedById: user.id,
        closureReason: reason,
        closedAt: Date.now(),
      },
      messages,
    });
  } catch {
    // Contact still marks the ticket closed when the channel is deleted.
  }
  await channel.send('This ticket is being closed. The channel will be deleted in 5 seconds.').catch(() => {});
  setTimeout(() => { void channel.delete('PCSO support ticket closed'); }, 5_000).unref?.();
}

export async function requestPinellasTicketClose(message) {
  if (String(message.guild?.id) !== PINELLAS_SUPPORT_GUILD_ID) return;
  const channel = message.channel;
  if (!isPinellasSupportTicketChannel(channel)) {
    throw new Error('Use `-cr` in an open PCSO support ticket.');
  }
  const ownerId = ticketOwnerId(channel);
  await channel.send(buildTicketCloseRequestPayload(ownerId));
}

export async function createPinellasSupportTicketForMember(guild, member, type, inquiry = '', options = {}) {
  if (String(guild.id) !== PINELLAS_SUPPORT_GUILD_ID) {
    throw new Error('Tickets can only be opened in the Pinellas County Sheriff\'s Office server.');
  }
  const categoryId = PINELLAS_SUPPORT_CATEGORY_IDS[type];
  if (!categoryId) throw new Error('That support category is unavailable.');

  const matchExisting = () => guild.channels.cache.find((channel) => (
    channel.parentId === categoryId && channel.topic?.includes(`ticket-owner:${member.id}`)
  ));
  let existing = matchExisting();
  if (!existing) {
    await guild.channels.fetch().catch(() => {});
    existing = matchExisting();
  }
  if (existing) return { channel: existing, existing: true };

  const botMember = guild.members.me || await guild.members.fetchMe();
  const channel = await guild.channels.create({
    name: ticketName(member, type),
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `ticket-owner:${member.id} ticket-type:${type}`,
  });
  await syncTicketChannelToCategory(channel, { openerId: member.id, botId: botMember.id, type });
  await channel.send(buildTicketOpenPingPayload(member.id));
  await channel.send(await buildTicketPayload(member, type, formatTicketInquiryNote(inquiry, options.source)));
  return { channel, existing: false };
}

export async function createPinellasSupportTicket(interaction, type, inquiry = '') {
  if (String(interaction.guildId) !== PINELLAS_SUPPORT_GUILD_ID) {
    throw new Error('Tickets can only be opened in the Pinellas County Sheriff\'s Office server.');
  }
  const guild = interaction.guild;
  const member = interaction.member || await guild.members.fetch(interaction.user.id);
  return createPinellasSupportTicketForMember(guild, member, type, inquiry);
}

export async function handlePinellasSupportInteraction(interaction) {
  const id = String(interaction.customId || '');
  const inquiryType = id.startsWith(`${PINELLAS_SUPPORT_BUTTON_PREFIX}inquiry:`)
    ? id.slice(`${PINELLAS_SUPPORT_BUTTON_PREFIX}inquiry:`.length)
    : null;
  if (inquiryType && interaction.isModalSubmit()) {
    if (!PINELLAS_SUPPORT_OPTIONS.some((option) => option.type === inquiryType)) return false;
    const inquiry = readInquiryFromModal(interaction, inquiryType);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await createPinellasSupportTicket(interaction, inquiryType, inquiry);
      const { registerWebTicketForChannel } = await import('./pcsoWebTickets.js');
      await registerWebTicketForChannel(result.channel, {
        ownerId: interaction.user.id,
        type: inquiryType,
        username: interaction.member?.displayName || interaction.user.username,
      }).catch(() => {});
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
  if (!interaction.isButton() || !id.startsWith(PINELLAS_SUPPORT_BUTTON_PREFIX)) return false;
  const channel = interaction.channel;
  const ownerId = ticketOwnerId(channel);
  const ticketType = ticketTypeFromChannel(channel);
  const isStaff = canClaimPinellasTicket(interaction.member, ticketType);
  const canClaim = isStaff;

  if (id === PINELLAS_SUPPORT_CLOSE_ID) {
    if (!isStaff && interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Only the ticket owner or staff can close this ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await closePinellasSupportTicket(channel, {
      client: interaction.client,
      user: interaction.user,
      ownerId,
      reason: 'Ticket closed by the ticket owner or staff.',
    });
    await interaction.editReply({ content: 'This ticket is closing. The transcript will be sent to the archive, opener, and PCSO website when it is available.' });
    return true;
  }

  if (id === PINELLAS_SUPPORT_CR_YES_ID) {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Only the ticket opener can confirm this close request.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.message?.editable) {
      await interaction.message.edit({ content: 'Close request accepted.', components: [] }).catch(() => {});
    }
    await closePinellasSupportTicket(channel, {
      client: interaction.client,
      user: interaction.user,
      ownerId,
      reason: 'Ticket closed after the opener confirmed a close request.',
    });
    await interaction.editReply({ content: 'You confirmed the close request. This ticket is closing.' });
    return true;
  }

  if (id === PINELLAS_SUPPORT_CR_NO_ID) {
    if (interaction.user.id !== ownerId && !isStaff) {
      await interaction.reply({ content: 'Only the ticket opener or staff can dismiss this close request.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.message?.editable) {
      await interaction.update({ content: 'Close request cancelled.', components: [] }).catch(async () => {
        await interaction.reply({ content: 'Close request cancelled.', flags: MessageFlags.Ephemeral });
      });
    } else {
      await interaction.reply({ content: 'Close request cancelled.', flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  if (id === PINELLAS_SUPPORT_CLAIM_ID) {
    if (!canClaim) {
      await interaction.reply({ content: 'Only staff can claim a ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({ content: 'You claimed this ticket.', flags: MessageFlags.Ephemeral });
    await channel.setTopic(`${channel.topic || ''} claimed-by:${interaction.user.id}`.slice(0, 1024)).catch(() => {});
    await channel.send(`This ticket has been claimed by <@${interaction.user.id}>.`).catch(() => {});
    return true;
  }

  if (id === PINELLAS_SUPPORT_STAFF_ID) {
    await interaction.reply({
      content: 'The staff panel has been removed from tickets.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const type = id.slice(PINELLAS_SUPPORT_BUTTON_PREFIX.length);
  if (!PINELLAS_SUPPORT_OPTIONS.some((option) => option.type === type)) return false;
  await interaction.showModal(buildInquiryModal(type));
  return true;
}
