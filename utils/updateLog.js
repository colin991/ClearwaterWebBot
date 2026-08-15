import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';
import { v2Card } from './v2Message.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPDATES_PATH = join(__dirname, '..', 'data', 'site-updates.json');
const POSTED_PATH = join(__dirname, '..', 'data', 'site-updates-posted.json');

const emptyCatalog = () => ({ version: 1, updates: [] });
const emptyPosted = () => ({ version: 1, postedIds: [] });

function normalizeEntry(entry = {}) {
  const id = String(entry.id || '').trim();
  const title = String(entry.title || '').trim().slice(0, 200);
  const summary = String(entry.summary || entry.body || '').trim().slice(0, 1800);
  const updatedBy = String(entry.updatedBy || entry.author || entry.committedBy || '').trim().slice(0, 80);
  if (!id || !title || !summary) return null;
  return {
    id,
    title,
    summary,
    updatedBy,
    createdAt: entry.createdAt || new Date().toISOString(),
    commit: entry.commit ? String(entry.commit).trim().slice(0, 40) : '',
  };
}

export async function readUpdateCatalog() {
  const data = await readJsonFile(UPDATES_PATH, emptyCatalog());
  const updates = Array.isArray(data?.updates) ? data.updates.map(normalizeEntry).filter(Boolean) : [];
  return { version: 1, updates };
}

export async function appendUpdateEntry(entry) {
  const normalized = normalizeEntry(entry);
  if (!normalized) throw new Error('Update entries need id, title, and summary.');

  const catalog = await readUpdateCatalog();
  if (catalog.updates.some((item) => item.id === normalized.id)) {
    return { added: false, entry: catalog.updates.find((item) => item.id === normalized.id) };
  }
  catalog.updates.push(normalized);
  await writeJsonFile(UPDATES_PATH, catalog);
  return { added: true, entry: normalized };
}

async function readPostedIds() {
  const data = await readJsonFile(POSTED_PATH, emptyPosted());
  return new Set(Array.isArray(data?.postedIds) ? data.postedIds.map(String) : []);
}

async function markPosted(ids) {
  if (!ids.length) return;
  const posted = await readPostedIds();
  for (const id of ids) posted.add(String(id));
  await writeJsonFile(POSTED_PATH, { version: 1, postedIds: [...posted] });
}

function buildUpdateMessage(entry) {
  const fields = [];
  if (entry.updatedBy) fields.push({ name: 'Updated by', value: entry.updatedBy });
  if (entry.commit) fields.push({ name: 'Commit', value: `\`${entry.commit}\`` });
  return v2Card({
    title: entry.title,
    description: entry.summary,
    fields,
    footer: 'Clearwater update log',
  });
}

async function fetchUpdateChannel(client, config) {
  const channelId = String(config.updateLogChannelId || '').trim();
  if (!channelId || !client?.isReady?.()) return null;
  const channel = await client.channels.fetch(channelId).catch((error) => {
    logger.error(`Update log channel fetch failed (${channelId})`, error);
    return null;
  });
  if (!channel?.isTextBased?.()) {
    logger.error(`Update log channel is not text-based (${channelId})`);
    return null;
  }
  return channel;
}

/** Post one update immediately (also marks it posted so the queue will not repeat it). */
export async function postUpdateLog(client, config, entry) {
  const normalized = normalizeEntry(entry);
  if (!normalized) throw new Error('Update entries need id, title, and summary.');

  const channel = await fetchUpdateChannel(client, config);
  if (!channel) return { ok: false, reason: 'channel_unavailable' };

  await channel.send(buildUpdateMessage(normalized));
  await markPosted([normalized.id]);
  return { ok: true, id: normalized.id };
}

/** Post any catalog updates that have not been sent from this bot host yet. */
export async function flushPendingUpdateLogs(client, config) {
  const channel = await fetchUpdateChannel(client, config);
  if (!channel) return { posted: 0, skipped: 0 };

  const catalog = await readUpdateCatalog();
  const posted = await readPostedIds();
  const pending = catalog.updates.filter((entry) => !posted.has(entry.id));
  if (!pending.length) return { posted: 0, skipped: 0 };

  const sent = [];
  for (const entry of pending) {
    try {
      await channel.send(buildUpdateMessage(entry));
      sent.push(entry.id);
    } catch (error) {
      logger.error(`Failed to post update log ${entry.id}`, error);
      break;
    }
  }

  await markPosted(sent);
  if (sent.length) logger.info(`Posted ${sent.length} update log message(s).`);
  return { posted: sent.length, skipped: pending.length - sent.length };
}
