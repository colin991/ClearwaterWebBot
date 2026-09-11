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
import { config } from '../config.js';
import { fetchMelonlyMemberByDiscordId } from './melonly.js';

export const PINELLAS_SUPPORT_PANEL_CHANNEL_ID = '1514256566105276437';
export const PINELLAS_SUPPORT_GUILD_ID = '1514100977920245760';
export const PINELLAS_SUPPORT_CATEGORY_IDS = Object.freeze({
  general: '1514848054724005938',
  compliance: '1514851966629711952',
  sheriff: '1514851966629711952',
});
export const PINELLAS_SUPPORT_BUTTON_PREFIX = 'pcs:support:';
export const PINELLAS_SUPPORT_TRANSCRIPT_CHANNEL_ID = '1542631874684526663';
const PINELLAS_SUPPORT_CLOSE_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}close`;
const PINELLAS_SUPPORT_CLAIM_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}claim`;
const PINELLAS_SUPPORT_STAFF_ID = `${PINELLAS_SUPPORT_BUTTON_PREFIX}staff`;

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

function supportTypeLabel(type) {
  return SUPPORT_OPTIONS.find((option) => option.type === type)?.title || 'Support';
}

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

function melonlyValue(member, ...keys) {
  for (const key of keys) {
    const value = member?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return 'Not linked';
}

async function buildTicketPayload(member, type) {
  let melonly = null;
  if (config.melonlyApiKey) {
    melonly = await fetchMelonlyMemberByDiscordId(config.melonlyApiKey, member.id).catch(() => null);
  }
  const robloxUsername = melonlyValue(melonly, 'robloxUsername', 'roblox_username', 'username', 'robloxName');
  const robloxId = melonlyValue(melonly, 'robloxId', 'roblox_id', 'robloxUserId', 'roblox_user_id');
  const robloxProfile = /^\d+$/.test(robloxId) ? `https://www.roblox.com/users/${robloxId}/profile` : 'Not linked';
  const option = SUPPORT_OPTIONS.find((entry) => entry.type === type);
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@${member.id}>`))
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
      '```Please explain your request below.```',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(PINELLAS_SUPPORT_CLAIM_ID).setStyle(ButtonStyle.Secondary).setLabel('Claim'),
      new ButtonBuilder().setCustomId(PINELLAS_SUPPORT_CLOSE_ID).setStyle(ButtonStyle.Danger).setLabel('Close'),
      new ButtonBuilder().setCustomId(PINELLAS_SUPPORT_STAFF_ID).setStyle(ButtonStyle.Secondary).setLabel('Staff Panel'),
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

async function archiveAndDmTicketTranscript(interaction, channel, ownerId) {
  const claimedById = channel.topic?.match(/claimed-by:(\d{16,22})/)?.[1] || null;
  const transcript = await createTicketTranscript(interaction.client, channel, {
    ownerId,
    closedById: interaction.user.id,
    closureReason: 'Ticket closed by the ticket owner or staff.',
  });
  transcript.claimedById = claimedById;
  const payload = buildTranscriptPayload(transcript, channel.name);
  const archiveChannel = await interaction.client.channels.fetch(PINELLAS_SUPPORT_TRANSCRIPT_CHANNEL_ID).catch(() => null);
  if (!archiveChannel?.isTextBased?.()) throw new Error('The ticket transcript channel is unavailable.');
  await archiveChannel.send(payload);
  if (ownerId) {
    const owner = await interaction.client.users.fetch(ownerId).catch(() => null);
    if (owner) await owner.send(payload).catch(() => {});
  }
  return transcript;
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
  await channel.send(await buildTicketPayload(member, type));
  return { channel, existing: false };
}

export async function handlePinellasSupportInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!interaction.isButton() || !id.startsWith(PINELLAS_SUPPORT_BUTTON_PREFIX)) return false;
  const channel = interaction.channel;
  const ownerId = channel?.topic?.match(/ticket-owner:(\d{16,22})/)?.[1] || null;
  const isStaff = Boolean(interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
    || interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages));

  if (id === PINELLAS_SUPPORT_CLOSE_ID) {
    if (!isStaff && interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Only the ticket owner or staff can close this ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let transcript = null;
    try {
      transcript = await archiveAndDmTicketTranscript(interaction, channel, ownerId);
      await interaction.editReply({ content: 'The transcript was created and sent to the ticket archive and opener. This ticket will be deleted in 5 seconds.' });
    } catch (error) {
      await interaction.editReply({ content: `The ticket will be deleted in 5 seconds, but the transcript could not be created: ${error?.message || 'unknown error'}` });
    }
    await channel.send('This ticket is being closed. The channel will be deleted in 5 seconds.').catch(() => {});
    setTimeout(() => { void channel.delete('PCSO support ticket closed'); }, 5_000).unref?.();
    return true;
  }

  if (id === PINELLAS_SUPPORT_CLAIM_ID) {
    if (!isStaff) {
      await interaction.reply({ content: 'Only staff can claim a ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({ content: 'You claimed this ticket.', flags: MessageFlags.Ephemeral });
    await channel.setTopic(`${channel.topic || ''} claimed-by:${interaction.user.id}`.slice(0, 1024)).catch(() => {});
    await channel.send(`This ticket has been claimed by <@${interaction.user.id}>.`).catch(() => {});
    return true;
  }

  if (id === PINELLAS_SUPPORT_STAFF_ID) {
    if (!isStaff) {
      await interaction.reply({ content: 'Only staff can open the staff panel.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({
      content: `Ticket owner: ${ownerId ? `<@${ownerId}>` : 'Unknown'}\nCategory: ${channel?.parent?.name || 'Unknown'}\nClaimed by: ${channel?.topic?.match(/claimed-by:(\d{16,22})/)?.[1] ? `<@${channel.topic.match(/claimed-by:(\d{16,22})/)[1]}>` : 'Nobody'}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return true;
  }

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
