import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import {
  PINELLAS_SUPPORT_GUILD_ID,
  createPinellasSupportTicketForMember,
} from './pinellasSupport.js';

const STORE_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'pcso-web-tickets.json');

function emptyStore() {
  return { tickets: {} };
}

async function readStore() {
  const store = await readJsonFile(STORE_PATH, emptyStore());
  return {
    tickets: store.tickets && typeof store.tickets === 'object' ? store.tickets : {},
  };
}

async function writeStore(store) {
  await writeJsonFile(STORE_PATH, store);
}

function webhookAvatar(user) {
  if (user?.avatarUrl) return String(user.avatarUrl);
  const id = String(user?.id || '');
  const avatar = String(user?.avatar || '');
  if (id && avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
  return undefined;
}

export async function listWebTicketMessages(client, discordId) {
  const store = await readStore();
  const ticket = store.tickets[String(discordId)];
  if (!ticket?.channelId) {
    return { open: false, messages: [], type: null };
  }
  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    delete store.tickets[String(discordId)];
    await writeStore(store);
    return { open: false, messages: [], type: null };
  }
  const fetched = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  const messages = [...(fetched?.values?.() || [])]
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .map((message) => {
      const fromWeb = String(message.webhookId || '') === String(ticket.webhookId || '');
      return {
        id: message.id,
        fromWeb,
        author: fromWeb
          ? (message.author?.username || ticket.username || 'You')
          : (message.member?.displayName || message.author?.username || 'Staff'),
        content: String(message.content || '').slice(0, 1800),
        createdAt: new Date(message.createdTimestamp).toISOString(),
      };
    })
    .filter((entry) => entry.content);
  return {
    open: true,
    type: ticket.type || 'general',
    channelId: ticket.channelId,
    messages,
  };
}

export async function openWebTicket(client, { user, type, inquiry }) {
  const guild = client.guilds.cache.get(PINELLAS_SUPPORT_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_SUPPORT_GUILD_ID);
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    throw new Error('Join the Pinellas County Sheriff’s Office Discord server to open a ticket.');
  }

  const result = await createPinellasSupportTicketForMember(guild, member, type, inquiry);
  const store = await readStore();
  const previous = store.tickets[user.id] || {};
  let webhookId = previous.webhookId || '';
  let webhookToken = previous.webhookToken || '';

  if (!webhookId || !webhookToken) {
    const webhook = await result.channel.createWebhook({
      name: 'PCSO Website',
      reason: 'Website ticket replies',
    });
    webhookId = webhook.id;
    webhookToken = webhook.token;
  }

  store.tickets[user.id] = {
    channelId: result.channel.id,
    webhookId,
    webhookToken,
    type,
    username: member.displayName,
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);

  if (result.existing && inquiry) {
    await postWebTicketReply(client, { user, content: inquiry });
  }

  return {
    existing: result.existing,
    channelId: result.channel.id,
    type,
    webhookReady: true,
  };
}

export async function postWebTicketReply(client, { user, content, stored = null }) {
  const text = String(content || '').trim().slice(0, 1800);
  if (text.length < 1) throw new Error('Enter a reply.');
  const store = await readStore();
  const ticket = stored || store.tickets[String(user.id)];
  if (!ticket?.webhookId || !ticket?.webhookToken || !ticket?.channelId) {
    throw new Error('Open a ticket first.');
  }
  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error('That ticket is no longer open.');
  }
  const { WebhookClient } = await import('discord.js');
  const webhook = new WebhookClient({ id: ticket.webhookId, token: ticket.webhookToken });
  await webhook.send({
    content: text,
    username: String(user.displayName || user.username || 'Website user').slice(0, 80),
    avatarURL: webhookAvatar(user),
    allowedMentions: { parse: [] },
  });
  return { ok: true };
}
