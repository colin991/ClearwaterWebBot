import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import {
  PINELLAS_SUPPORT_GUILD_ID,
  PINELLAS_SUPPORT_OPTIONS,
  createPinellasSupportTicketForMember,
  findOpenSupportChannelsForOwner,
  ticketOwnerId,
  ticketTypeFromTopic,
} from './pinellasSupport.js';

const STORE_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'pcso-web-tickets.json');
const CLOSED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

function emptyStore() {
  return { channels: {} };
}

export function migrateTicketStore(raw = {}) {
  const channels = {};
  const incomingChannels = raw.channels && typeof raw.channels === 'object' ? raw.channels : {};
  for (const [channelId, value] of Object.entries(incomingChannels)) {
    if (!value || typeof value !== 'object') continue;
    channels[String(channelId)] = { ...value, channelId: String(value.channelId || channelId) };
  }
  const legacy = raw.tickets && typeof raw.tickets === 'object' ? raw.tickets : {};
  for (const [key, value] of Object.entries(legacy)) {
    if (!value || typeof value !== 'object') continue;
    const channelId = String(value.channelId || key);
    if (!/^\d{16,22}$/.test(channelId)) continue;
    const ownerId = /^\d{16,22}$/.test(key) && !value.channelId ? key : String(value.ownerId || key);
    channels[channelId] = {
      ...channels[channelId],
      ...value,
      channelId,
      ownerId: /^\d{16,22}$/.test(ownerId) ? ownerId : String(value.ownerId || ''),
    };
  }
  return { channels };
}

function pruneClosed(store, now = Date.now()) {
  for (const [channelId, ticket] of Object.entries(store.channels)) {
    if (!ticket?.closedAt) continue;
    const closedAt = Date.parse(ticket.closedAt);
    if (Number.isFinite(closedAt) && now - closedAt > CLOSED_KEEP_MS) {
      delete store.channels[channelId];
    }
  }
  return store;
}

async function readStore() {
  const store = migrateTicketStore(await readJsonFile(STORE_PATH, emptyStore()));
  return pruneClosed(store);
}

async function writeStore(store) {
  await writeJsonFile(STORE_PATH, pruneClosed(migrateTicketStore(store)));
}

function webhookAvatar(user) {
  if (user?.avatarUrl) return String(user.avatarUrl);
  const id = String(user?.id || '');
  const avatar = String(user?.avatar || '');
  if (id && avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
  return undefined;
}

function walkComponentText(nodes, parts) {
  const list = Array.isArray(nodes) ? nodes : [];
  for (const node of list) {
    if (!node || typeof node !== 'object') continue;
    const data = node.data && typeof node.data === 'object' ? node.data : node;
    const type = data.type ?? node.type;
    const text = data.content ?? node.content;
    if ((type === 10 || text) && typeof text === 'string' && text.trim()) {
      parts.push(text.trim());
    }
    walkComponentText(node.components || data.components, parts);
  }
}

export function extractDiscordMessageText(message) {
  const parts = [];
  const content = String(message?.content || '').trim();
  if (content && !/^<@!?\d{16,22}>$/.test(content)) parts.push(content);
  for (const embed of message?.embeds || []) {
    if (embed?.title) parts.push(String(embed.title).trim());
    if (embed?.description) parts.push(String(embed.description).trim());
  }
  walkComponentText(message?.components, parts);
  return [...new Set(parts.filter(Boolean))].join('\n\n').slice(0, 1800);
}

function supportTitle(type) {
  return PINELLAS_SUPPORT_OPTIONS.find((option) => option.type === type)?.title || 'Support';
}

function ticketSummary(ticket, { open }) {
  return {
    channelId: ticket.channelId,
    type: ticket.type || 'general',
    title: supportTitle(ticket.type || 'general'),
    open,
    closedAt: ticket.closedAt || null,
    createdAt: ticket.createdAt || null,
  };
}

async function ensureGuild(client) {
  return client.guilds.cache.get(PINELLAS_SUPPORT_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_SUPPORT_GUILD_ID);
}

export async function registerWebTicketForChannel(channel, {
  ownerId,
  type,
  username,
  closedAt = null,
} = {}) {
  if (!channel?.id) return null;
  const store = await readStore();
  const previous = store.channels[channel.id] || {};
  let webhookId = previous.webhookId || '';
  let webhookToken = previous.webhookToken || '';
  if (!closedAt && channel.createWebhook && (!webhookId || !webhookToken)) {
    try {
      const webhook = await channel.createWebhook({
        name: 'PCSO Website',
        reason: 'Sync website replies into this Discord ticket',
      });
      webhookId = webhook.id;
      webhookToken = webhook.token;
    } catch {
      // Older tickets may lack Manage Webhooks; listing still works.
    }
  }
  const record = {
    channelId: channel.id,
    ownerId: String(ownerId || ticketOwnerId(channel) || previous.ownerId || ''),
    webhookId,
    webhookToken,
    type: type || ticketTypeFromTopic(channel) || previous.type || 'general',
    username: username || previous.username || '',
    createdAt: previous.createdAt || new Date(channel.createdTimestamp || Date.now()).toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: closedAt || null,
  };
  store.channels[channel.id] = record;
  await writeStore(store);
  return record;
}

export async function markTicketChannelClosed(channel, { reason = 'deleted' } = {}) {
  const channelId = String(channel?.id || channel || '');
  if (!/^\d{16,22}$/.test(channelId)) return { closed: false };
  const store = await readStore();
  const previous = store.channels[channelId] || {};
  const ownerId = ticketOwnerId(channel) || previous.ownerId;
  if (!ownerId) return { closed: false };
  store.channels[channelId] = {
    ...previous,
    channelId,
    ownerId: String(ownerId || previous.ownerId || ''),
    type: ticketTypeFromTopic(channel) || previous.type || 'general',
    closedAt: previous.closedAt || new Date().toISOString(),
    closedReason: reason,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return { closed: true, channelId, ownerId: store.channels[channelId].ownerId };
}

async function mapChannelMessages(channel, ticket, discordId) {
  const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  return [...(fetched?.values?.() || [])]
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .map((message) => {
      const content = extractDiscordMessageText(message);
      const webhookMatch = ticket.webhookId && String(message.webhookId || '') === String(ticket.webhookId);
      const fromUser = Boolean(
        webhookMatch
        || (!message.webhookId && String(message.author?.id) === String(discordId)),
      );
      return {
        id: message.id,
        fromWeb: fromUser,
        author: fromUser
          ? (message.author?.username || ticket.username || 'You')
          : (message.member?.displayName || message.author?.username || 'Staff'),
        content,
        createdAt: new Date(message.createdTimestamp).toISOString(),
      };
    })
    .filter((entry) => entry.content);
}

async function collectTicketsForUser(client, discordId) {
  const store = await readStore();
  const ownerId = String(discordId);
  const liveById = new Map();
  try {
    const guild = await ensureGuild(client);
    await guild.channels.fetch().catch(() => {});
    for (const channel of findOpenSupportChannelsForOwner(guild, ownerId)) {
      const record = await registerWebTicketForChannel(channel, {
        ownerId,
        type: ticketTypeFromTopic(channel),
      });
      liveById.set(channel.id, { channel, record });
    }
  } catch {
    // Fall back to the stored channel list if Discord is briefly unavailable.
  }

  const tickets = [];
  for (const [channelId, live] of liveById.entries()) {
    tickets.push({
      ...ticketSummary(live.record || store.channels[channelId] || { channelId, type: 'general' }, { open: true }),
      channel: live.channel,
      record: live.record || store.channels[channelId],
    });
  }

  const latestStore = await readStore();
  for (const record of Object.values(latestStore.channels)) {
    if (String(record.ownerId) !== ownerId) continue;
    if (liveById.has(record.channelId)) continue;
    if (!record.closedAt) {
      const channel = await client.channels.fetch(record.channelId).catch(() => null);
      if (channel?.isTextBased?.()) {
        const refreshed = await registerWebTicketForChannel(channel, {
          ownerId,
          type: record.type,
        });
        tickets.push({
          ...ticketSummary(refreshed, { open: true }),
          channel,
          record: refreshed,
        });
        continue;
      }
      await markTicketChannelClosed({ id: record.channelId, topic: `ticket-owner:${ownerId} ticket-type:${record.type || 'general'}` }, { reason: 'missing' });
      record.closedAt = record.closedAt || new Date().toISOString();
    }
    tickets.push({
      ...ticketSummary(record, { open: false }),
      channel: null,
      record,
    });
  }

  tickets.sort((left, right) => {
    if (left.open !== right.open) return left.open ? -1 : 1;
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  });
  return tickets;
}

export async function listWebTicketMessages(client, discordId, channelId = '') {
  const tickets = await collectTicketsForUser(client, discordId);
  const summaries = tickets.map(({ channel, record, ...summary }) => summary);
  const requested = String(channelId || '');
  const selected = (requested && tickets.find((ticket) => ticket.channelId === requested))
    || tickets.find((ticket) => ticket.open)
    || tickets[0]
    || null;

  if (!selected) {
    return {
      open: false,
      messages: [],
      type: null,
      channelId: null,
      tickets: summaries,
    };
  }

  let messages = [];
  if (selected.open && selected.channel?.isTextBased?.()) {
    messages = await mapChannelMessages(selected.channel, selected.record || {}, discordId);
  } else if (!selected.open) {
    messages = [{
      id: `closed-${selected.channelId}`,
      fromWeb: false,
      author: 'PCSO',
      content: 'This ticket is closed. The Discord channel was deleted.',
      createdAt: selected.closedAt || new Date().toISOString(),
    }];
  }

  return {
    open: Boolean(selected.open),
    type: selected.type || 'general',
    title: selected.title,
    channelId: selected.channelId,
    closedAt: selected.closedAt || null,
    messages,
    tickets: summaries,
  };
}

export async function openWebTicket(client, { user, type, inquiry }) {
  const guild = await ensureGuild(client);
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    throw new Error('Join the Pinellas County Sheriff’s Office Discord server to open a ticket.');
  }

  const result = await createPinellasSupportTicketForMember(guild, member, type, inquiry, { source: 'website' });
  const record = await registerWebTicketForChannel(result.channel, {
    ownerId: user.id,
    type,
    username: member.displayName,
  });

  if (result.existing && inquiry) {
    await postWebTicketReply(client, { user, content: inquiry, stored: record, channelId: result.channel.id });
  }

  return {
    existing: result.existing,
    channelId: result.channel.id,
    type,
    webhookReady: Boolean(record?.webhookId && record?.webhookToken),
  };
}

export async function postWebTicketReply(client, { user, content, stored = null, channelId = '' }) {
  const text = String(content || '').trim().slice(0, 1800);
  if (text.length < 1) throw new Error('Enter a reply.');
  const listed = await collectTicketsForUser(client, user.id);
  const wanted = String(channelId || stored?.channelId || '');
  const selected = (wanted && listed.find((ticket) => ticket.channelId === wanted && ticket.open))
    || listed.find((ticket) => ticket.open);
  const ticket = stored || selected?.record;
  if (!selected?.open || !ticket?.channelId) {
    throw new Error('Open a ticket first.');
  }
  let webhookId = ticket.webhookId;
  let webhookToken = ticket.webhookToken;
  if (!webhookId || !webhookToken) {
    const refreshed = await registerWebTicketForChannel(selected.channel, {
      ownerId: user.id,
      type: ticket.type,
      username: user.displayName || user.username,
    });
    webhookId = refreshed?.webhookId;
    webhookToken = refreshed?.webhookToken;
  }
  if (!webhookId || !webhookToken) {
    throw new Error('This Discord ticket is not ready for website replies yet.');
  }
  const channel = selected.channel || await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    await markTicketChannelClosed({ id: ticket.channelId, topic: `ticket-owner:${user.id}` }, { reason: 'missing' });
    throw new Error('That ticket is no longer open.');
  }
  const { WebhookClient } = await import('discord.js');
  const webhook = new WebhookClient({ id: webhookId, token: webhookToken });
  await webhook.send({
    content: text,
    username: String(user.displayName || user.username || 'Website user').slice(0, 80),
    avatarURL: webhookAvatar(user),
    allowedMentions: { parse: [] },
  });
  return { ok: true, channelId: ticket.channelId };
}
