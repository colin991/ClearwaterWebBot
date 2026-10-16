import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';
import { publicSiteUrl } from './pcsoSiteForms.js';

/** Channel in the CWFR server that receives a card for every closed ticket. */
export const FIRE_TRANSCRIPT_CHANNEL_ID = '1515872563417452664';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_DIR = path.join(ROOT, 'data', 'cwfr-transcripts');
const MAX_MESSAGES = 1000;
const ID_PATTERN = /^[a-f0-9]{32}$/;

export function isFireTranscriptId(id) {
  return ID_PATTERN.test(String(id || ''));
}

export function fireTranscriptUrl(id) {
  return `${publicSiteUrl()}/transcripts/cwfr/${id}`;
}

function transcriptPath(id) {
  return path.join(STORE_DIR, `${id}.json`);
}

export async function readFireTranscript(id) {
  if (!isFireTranscriptId(id)) return null;
  return readJsonFile(transcriptPath(id), null);
}

export async function saveFireTranscript(record) {
  if (!isFireTranscriptId(record?.id)) throw new Error('Invalid transcript id.');
  await writeJsonFile(transcriptPath(record.id), record);
  return record;
}

function avatarUrl(user, member) {
  return member?.displayAvatarURL?.({ extension: 'png', size: 128 })
    || user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    || null;
}

function personSummary(user, member) {
  if (!user && !member) return null;
  const account = user || member?.user;
  return {
    id: String(account?.id || member?.id || ''),
    name: String(member?.displayName || account?.globalName || account?.username || 'Unknown'),
    username: String(account?.username || ''),
  };
}

function componentParts(nodes, parts) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object') continue;
    const data = node.data && typeof node.data === 'object' ? node.data : node;
    const type = data.type ?? node.type;
    const content = data.content ?? node.content;
    if (type === 10 && typeof content === 'string' && content.trim()) {
      parts.push({ kind: 'text', content: content.trim() });
    }
    if (type === 12) {
      for (const item of data.items || node.items || []) {
        const url = item?.media?.url || item?.data?.media?.url;
        if (/^https:\/\//i.test(url || '')) parts.push({ kind: 'image', url });
      }
    }
    componentParts(node.components || data.components, parts);
  }
  return parts;
}

/** One Discord message, reduced to what the transcript page shows. */
export function snapshotFireMessage(message, { isStaff = () => false } = {}) {
  const author = message.author || {};
  const member = message.member || null;
  let role = 'member';
  if (author.bot) role = 'bot';
  else if (member && isStaff(member)) role = 'staff';
  return {
    id: String(message.id || ''),
    author: {
      ...personSummary(author, member),
      avatarUrl: avatarUrl(author, member),
      role,
    },
    createdAt: new Date(message.createdTimestamp || Date.now()).toISOString(),
    content: String(message.content || ''),
    embeds: (message.embeds || []).map((embed) => ({
      title: embed.title ? String(embed.title) : '',
      description: embed.description ? String(embed.description) : '',
      color: Number.isInteger(embed.color) ? embed.color : null,
      fields: (embed.fields || []).map((field) => ({ name: String(field.name || ''), value: String(field.value || '') })),
      imageUrl: embed.image?.url || null,
    })),
    parts: componentParts(message.components, []),
    attachments: [...(message.attachments?.values?.() || [])].map((attachment) => ({
      name: String(attachment.name || 'file'),
      url: String(attachment.url || ''),
      image: /^image\//.test(attachment.contentType || ''),
    })),
  };
}

async function fetchAllMessages(channel) {
  const collected = [];
  let before;
  while (collected.length < MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const list = [...(batch?.values?.() || [])];
    if (!list.length) break;
    collected.push(...list);
    before = list[list.length - 1].id;
    if (list.length < 100) break;
  }
  return collected.sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
}

function mentionNames(guild, messages) {
  const text = JSON.stringify(messages);
  const users = {};
  const roles = {};
  const channels = {};
  for (const [, kind, id] of text.matchAll(/<(@!?|@&|#)(\d{16,22})>/g)) {
    if (kind === '@&') {
      const role = guild?.roles?.cache?.get(id);
      if (role) roles[id] = String(role.name);
    } else if (kind === '#') {
      const channel = guild?.channels?.cache?.get(id);
      if (channel) channels[id] = String(channel.name);
    } else {
      const member = guild?.members?.cache?.get(id);
      const user = member?.user || guild?.client?.users?.cache?.get(id);
      if (member || user) users[id] = String(member?.displayName || user?.globalName || user?.username);
    }
  }
  for (const message of messages) {
    if (message.author?.id) users[message.author.id] ??= message.author.name;
  }
  return { users, roles, channels };
}

/** Build the transcript record for a ticket that is about to be deleted. */
export async function buildFireTranscript(channel, {
  ownerId,
  type,
  typeTitle,
  claimedById = null,
  closedBy,
  closedVia = 'button',
  reason = '',
  isStaff,
}) {
  const guild = channel.guild;
  const raw = await fetchAllMessages(channel);
  const messages = raw.map((message) => snapshotFireMessage(message, { isStaff }));
  const lookup = async (id) => {
    if (!id) return null;
    const member = guild?.members?.cache?.get(id) || await guild?.members?.fetch?.(id).catch(() => null);
    const user = member?.user || await guild?.client?.users?.fetch?.(id).catch(() => null);
    return personSummary(user, member) || { id, name: 'Unknown', username: '' };
  };
  const closer = personSummary(closedBy?.user || closedBy, closedBy?.member) || { id: '', name: 'Unknown', username: '' };
  const closerLabel = closer.username || closer.name;
  return {
    id: randomBytes(16).toString('hex'),
    version: 1,
    guild: {
      id: String(guild?.id || ''),
      name: String(guild?.name || 'Clearwater Fire & Rescue'),
      iconUrl: guild?.iconURL?.({ extension: 'png', size: 128 }) || null,
    },
    channel: { id: String(channel.id), name: String(channel.name || 'ticket') },
    ticket: { type, title: typeTitle },
    opener: await lookup(ownerId),
    claimedBy: await lookup(claimedById),
    openedAt: new Date(channel.createdTimestamp || raw[0]?.createdTimestamp || Date.now()).toISOString(),
    closedAt: new Date().toISOString(),
    closedBy: closer,
    closedBecause: closedVia === 'close-request'
      ? `Close request accepted by ${closerLabel}`
      : `Closed by ${closerLabel}`,
    reason: String(reason || '').trim().slice(0, 500),
    messageCount: messages.length,
    messages,
    mentions: mentionNames(guild, messages),
  };
}

export function buildFireTranscriptCard(record, url) {
  const container = new ContainerBuilder()
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Ticket Transcript\n**#${record.channel.name}**`))
      .setButtonAccessory(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Transcript').setURL(url)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Ticket Type:** ${record.ticket.title}`,
      `**Ticket Opener:** ${record.opener?.id ? `<@${record.opener.id}>` : 'Unknown'}`,
      `**Claimed By:** ${record.claimedBy?.id ? `<@${record.claimedBy.id}>` : 'Nobody'}`,
      `**Opened At:** <t:${Math.floor(Date.parse(record.openedAt) / 1000)}:F>`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Closed By:** ${record.closedBy?.id ? `<@${record.closedBy.id}>` : 'Unknown'}`,
      `**Closed At:** <t:${Math.floor(Date.parse(record.closedAt) / 1000)}:F>`,
      `**Closed Because:** ${record.closedBecause}`,
      record.reason ? `**Reason:** ${record.reason}` : '',
      `**Messages:** ${record.messageCount}`,
    ].filter(Boolean).join('\n')));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

/**
 * Save the transcript, then post its card in the CWFR transcript channel. Never throws: a
 * failed transcript must not stop the ticket from closing.
 */
export async function archiveFireTicket(channel, options) {
  try {
    const record = await buildFireTranscript(channel, options);
    await saveFireTranscript(record);
    const url = fireTranscriptUrl(record.id);
    const client = channel.client || channel.guild?.client;
    const archive = await client?.channels?.fetch(FIRE_TRANSCRIPT_CHANNEL_ID).catch(() => null);
    if (archive?.isTextBased?.()) await archive.send(buildFireTranscriptCard(record, url));
    else logger.warn(`CWFR transcripts: channel ${FIRE_TRANSCRIPT_CHANNEL_ID} is unavailable.`);
    return { record, url };
  } catch (error) {
    logger.error('CWFR transcripts: could not save the transcript', error);
    return null;
  }
}
