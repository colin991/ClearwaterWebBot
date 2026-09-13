import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const STORE_PATH = join(process.cwd(), 'data', 'pcso-radio-talk-logs.json');
const MAX_ENTRIES = 500;

export const EMPTY_RADIO_TALK_LOGS = Object.freeze({
  entries: [],
  updatedAt: null,
});

function cleanText(value, max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function newId() {
  return `radio_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

export function normalizeRadioTalkLogs(input = {}) {
  const entries = Array.isArray(input.entries) ? input.entries : [];
  return {
    entries: entries.map((entry) => ({
      id: cleanText(entry?.id, 64) || newId(),
      userId: cleanText(entry?.userId, 32),
      username: cleanText(entry?.username, 80),
      displayName: cleanText(entry?.displayName, 120),
      callsign: cleanText(entry?.callsign, 64),
      startedAt: cleanText(entry?.startedAt, 40),
      endedAt: cleanText(entry?.endedAt, 40),
      durationMs: Math.max(0, Math.min(Number(entry?.durationMs) || 0, 60 * 60 * 1000)),
      channelId: cleanText(entry?.channelId, 32),
    })).filter((entry) => entry.userId && entry.startedAt && entry.durationMs > 0)
      .slice(0, MAX_ENTRIES),
    updatedAt: cleanText(input.updatedAt, 40) || null,
  };
}

export async function getRadioTalkLogs() {
  const stored = await readJsonFile(STORE_PATH, EMPTY_RADIO_TALK_LOGS);
  return normalizeRadioTalkLogs(stored);
}

export async function appendRadioTalkLog(entry) {
  const store = await getRadioTalkLogs();
  const next = normalizeRadioTalkLogs({
    entries: [{
      ...entry,
      id: newId(),
    }, ...store.entries],
    updatedAt: new Date().toISOString(),
  });
  await writeJsonFile(STORE_PATH, next);
  return next;
}

export function formatTalkDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
