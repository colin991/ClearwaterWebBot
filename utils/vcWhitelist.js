import { resolve } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { membersForPlayer } from './robloxDiscordMatch.js';

export const VC_WHITELIST_PATH = resolve('data', 'vc-whitelist.json');
const MAX_ENTRIES = 200;

let storePath = VC_WHITELIST_PATH;
let snapshot = { entries: [] };

function normalizeUsername(value) {
  const username = String(value || '').trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return '';
  return username.toLowerCase();
}

function normalizeDiscordId(value) {
  const id = String(value || '').trim();
  return /^\d{16,22}$/.test(id) ? id : '';
}

function normalizeRobloxId(value) {
  const id = String(value || '').trim();
  return /^\d{1,20}$/.test(id) ? id : '';
}

export function normalizeVcWhitelistEntry(entry = {}) {
  const discordId = normalizeDiscordId(entry.discordId);
  const robloxId = normalizeRobloxId(entry.robloxId);
  const username = normalizeUsername(entry.username);
  if (!discordId && !robloxId && !username) return null;
  return {
    discordId: discordId || null,
    robloxId: robloxId || null,
    username: username || null,
    addedBy: entry.addedBy ? String(entry.addedBy).slice(0, 32) : null,
    addedAt: entry.addedAt || new Date().toISOString(),
  };
}

function sameEntry(left, right) {
  if (left.discordId && left.discordId === right.discordId) return true;
  if (left.robloxId && left.robloxId === right.robloxId) return true;
  if (left.username && left.username === right.username) return true;
  return false;
}

async function persist() {
  await writeJsonFile(storePath, snapshot);
}

export function getVcWhitelist() {
  return snapshot.entries;
}

export function resetVcWhitelistForTests({ entries = [], path } = {}) {
  storePath = path || VC_WHITELIST_PATH;
  snapshot = {
    entries: (Array.isArray(entries) ? entries : []).map(normalizeVcWhitelistEntry).filter(Boolean),
  };
}

export async function loadVcWhitelist(path = VC_WHITELIST_PATH) {
  storePath = path;
  const raw = await readJsonFile(path, { entries: [] });
  const list = Array.isArray(raw?.entries) ? raw.entries : (Array.isArray(raw) ? raw : []);
  snapshot = { entries: list.map(normalizeVcWhitelistEntry).filter(Boolean) };
  return snapshot.entries;
}

export async function addVcWhitelist(input) {
  const entry = normalizeVcWhitelistEntry(input);
  if (!entry) throw new Error('Provide a Discord member and/or an in-game Roblox username.');
  const index = snapshot.entries.findIndex((existing) => sameEntry(existing, entry));
  if (index >= 0) {
    snapshot.entries[index] = {
      ...snapshot.entries[index],
      ...entry,
      addedBy: entry.addedBy || snapshot.entries[index].addedBy,
      addedAt: snapshot.entries[index].addedAt || entry.addedAt,
    };
    await persist();
    return { entry: snapshot.entries[index], created: false };
  }
  if (snapshot.entries.length >= MAX_ENTRIES) throw new Error('The VC whitelist is full.');
  snapshot.entries.push(entry);
  await persist();
  return { entry, created: true };
}

export async function removeVcWhitelist(input) {
  const target = normalizeVcWhitelistEntry(input);
  if (!target) throw new Error('Provide a Discord member and/or an in-game Roblox username.');
  const before = snapshot.entries.length;
  snapshot.entries = snapshot.entries.filter((existing) => !sameEntry(existing, target));
  await persist();
  return before - snapshot.entries.length;
}

export function isOnVcWhitelist(player, members, identities = {}) {
  const username = normalizeUsername(player?.username);
  const robloxId = normalizeRobloxId(player?.robloxId);
  if (!snapshot.entries.length) return false;
  const matches = membersForPlayer(player, members, identities);
  return snapshot.entries.some((entry) => {
    if (entry.username && username && entry.username === username) return true;
    if (entry.robloxId && robloxId && entry.robloxId === robloxId) return true;
    if (entry.discordId && matches.some((member) => String(member.id) === entry.discordId)) return true;
    if (entry.discordId && robloxId && String(identities?.[entry.discordId]?.robloxId || '') === robloxId) return true;
    return false;
  });
}

export function formatVcWhitelistEntry(entry) {
  const parts = [];
  if (entry.discordId) parts.push(`<@${entry.discordId}>`);
  if (entry.username) parts.push(entry.username);
  if (entry.robloxId) parts.push(`id ${entry.robloxId}`);
  return parts.join(' · ') || 'unknown';
}
