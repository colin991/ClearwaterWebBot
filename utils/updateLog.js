import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPDATES_PATH = join(__dirname, '..', 'data', 'site-updates.json');

const emptyCatalog = () => ({ version: 1, updates: [] });

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

/**
 * Discord channel posting for updates is disabled.
 * Kept as no-ops so older call sites fail soft.
 */
export async function postUpdateLog() {
  return { ok: false, reason: 'discord_update_log_disabled' };
}

export async function flushPendingUpdateLogs() {
  return { posted: 0, skipped: 0, disabled: true };
}
