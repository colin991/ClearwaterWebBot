import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const storePath = join(process.cwd(), 'data', 'circle-moderation.json');

const emptyStore = Object.freeze({
  nextCaseId: 1,
  cases: [],
  notes: {},
  presets: [
    'Disruptive behavior',
    'Toxicity / harassment',
    'Spam',
    'Failing to follow staff instructions',
    'Ban evasion',
  ],
});

function normalizeStore(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    nextCaseId: Math.max(1, Number(source.nextCaseId) || 1),
    cases: Array.isArray(source.cases) ? source.cases : [],
    notes: source.notes && typeof source.notes === 'object' ? source.notes : {},
    presets: Array.isArray(source.presets) && source.presets.length
      ? source.presets.map((item) => String(item).slice(0, 120)).filter(Boolean).slice(0, 40)
      : [...emptyStore.presets],
  };
}

export async function readModerationStore() {
  return normalizeStore(await readJsonFile(storePath, emptyStore));
}

export async function saveModerationStore(store) {
  await writeJsonFile(storePath, normalizeStore(store));
}

export async function withModerationStore(fn) {
  const store = await readModerationStore();
  const result = await fn(store);
  await saveModerationStore(store);
  return result;
}

export function createCase(store, {
  type,
  guildId,
  userId,
  moderatorId,
  reason = 'No reason provided.',
  durationMs = null,
  points = 0,
  meta = {},
}) {
  const now = Date.now();
  const entry = {
    id: store.nextCaseId++,
    type: String(type || 'note'),
    guildId: String(guildId || ''),
    userId: String(userId || ''),
    moderatorId: String(moderatorId || ''),
    reason: String(reason || 'No reason provided.').slice(0, 400),
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    expiresAt: Number.isFinite(durationMs) && durationMs > 0 ? new Date(now + durationMs).toISOString() : null,
    createdAt: new Date(now).toISOString(),
    editedAt: null,
    active: true,
    points: Math.max(0, Math.min(100, Number(points) || 0)),
    meta: meta && typeof meta === 'object' ? meta : {},
  };
  store.cases.unshift(entry);
  store.cases = store.cases.slice(0, 5_000);
  return entry;
}

export function findCase(store, caseId) {
  const id = Number(caseId);
  if (!Number.isInteger(id) || id < 1) return null;
  return store.cases.find((entry) => entry.id === id) || null;
}

export function userCases(store, guildId, userId) {
  return store.cases.filter((entry) => entry.guildId === String(guildId) && entry.userId === String(userId));
}

export function userPoints(store, guildId, userId) {
  return userCases(store, guildId, userId).reduce((sum, entry) => sum + (Number(entry.points) || 0), 0);
}

export function clearUserCases(store, guildId, userId) {
  const before = store.cases.length;
  store.cases = store.cases.filter((entry) => !(entry.guildId === String(guildId) && entry.userId === String(userId)));
  return before - store.cases.length;
}

export function addUserNote(store, guildId, userId, moderatorId, content) {
  const key = `${guildId}:${userId}`;
  const list = Array.isArray(store.notes[key]) ? store.notes[key] : [];
  const note = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    content: String(content || '').trim().slice(0, 500),
    moderatorId: String(moderatorId || ''),
    createdAt: new Date().toISOString(),
    history: [],
  };
  if (!note.content) throw new Error('Note content is required');
  list.unshift(note);
  store.notes[key] = list.slice(0, 100);
  return note;
}

export function listUserNotes(store, guildId, userId) {
  return Array.isArray(store.notes[`${guildId}:${userId}`]) ? store.notes[`${guildId}:${userId}`] : [];
}

export function removeUserNote(store, guildId, userId, noteId) {
  const key = `${guildId}:${userId}`;
  const list = listUserNotes(store, guildId, userId);
  const next = list.filter((note) => note.id !== String(noteId));
  store.notes[key] = next;
  return list.length - next.length;
}

export function activeTimedCases(store, guildId, type) {
  const now = Date.now();
  return store.cases.filter((entry) => (
    entry.guildId === String(guildId)
    && entry.type === type
    && entry.active !== false
    && entry.expiresAt
    && new Date(entry.expiresAt).getTime() > now
  ));
}

export function moderatorStats(store, guildId, moderatorId = null) {
  const cases = store.cases.filter((entry) => entry.guildId === String(guildId));
  const filtered = moderatorId
    ? cases.filter((entry) => entry.moderatorId === String(moderatorId))
    : cases;
  const byMod = new Map();
  for (const entry of filtered) {
    const key = entry.moderatorId || 'unknown';
    const bucket = byMod.get(key) || { moderatorId: key, total: 0, ban: 0, kick: 0, mute: 0, warn: 0, softban: 0 };
    bucket.total += 1;
    if (bucket[entry.type] != null) bucket[entry.type] += 1;
    byMod.set(key, bucket);
  }
  return [...byMod.values()].sort((a, b) => b.total - a.total);
}
