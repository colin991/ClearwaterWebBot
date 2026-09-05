import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const cachePath = join(process.cwd(), 'data', 'identity-cache.json');
const manualPath = join(process.cwd(), 'data', 'manual-identities.json');
const emptyCache = { byDiscord: {} };

function identityKey() {
  const secret = process.env.BOT_API_KEY || process.env.DISCORD_TOKEN || process.env.PII_HASH_SECRET || '';
  if (!secret) return null;
  return createHash('sha256').update('cw.identity.v1\0').update(secret).digest();
}

function decryptCache(raw) {
  const key = identityKey();
  if (!key || raw?.v !== 1 || !raw?.data) return null;
  try {
    const buf = Buffer.from(String(raw.data), 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeManualEntry(entry) {
  const discordId = String(entry?.discordId || '').trim();
  const robloxId = String(entry?.robloxId || '').trim();
  if (!/^\d{16,22}$/.test(discordId) || !/^\d{1,20}$/.test(robloxId)) return null;
  return {
    discordId,
    robloxId,
    robloxUsername: entry?.robloxUsername ? String(entry.robloxUsername) : null,
    robloxDisplayName: entry?.robloxDisplayName ? String(entry.robloxDisplayName) : null,
    checkedAt: entry?.checkedAt || new Date().toISOString(),
    source: 'manual',
  };
}

async function loadManualIdentities() {
  const raw = await readJsonFile(manualPath, []);
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.identities) ? raw.identities : []);
  const byDiscord = {};
  for (const entry of list) {
    const normalized = normalizeManualEntry(entry);
    if (!normalized) continue;
    byDiscord[normalized.discordId] = normalized;
  }
  return byDiscord;
}

function mergeIdentityCaches(runtimeCache, manualByDiscord) {
  return {
    byDiscord: {
      ...(runtimeCache?.byDiscord || {}),
      ...manualByDiscord,
    },
  };
}

export async function getIdentityCache() {
  const raw = await readJsonFile(cachePath, emptyCache);
  let runtime = emptyCache;
  if (raw?.byDiscord && typeof raw.byDiscord === 'object' && !raw.data) {
    runtime = { byDiscord: raw.byDiscord };
  } else {
    runtime = decryptCache(raw) || { byDiscord: {} };
  }
  const manual = await loadManualIdentities();
  return mergeIdentityCaches(runtime, manual);
}

async function saveIdentityCache(cache) {
  const key = identityKey();
  // Never persist committed manual overrides into the encrypted runtime cache blob.
  const manual = await loadManualIdentities();
  const runtimeOnly = { byDiscord: { ...(cache?.byDiscord || {}) } };
  for (const discordId of Object.keys(manual)) {
    delete runtimeOnly.byDiscord[discordId];
  }

  if (!key) {
    await writeJsonFile(cachePath, runtimeOnly);
    return;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(runtimeOnly), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  await writeJsonFile(cachePath, {
    v: 1,
    data: Buffer.concat([iv, tag, encrypted]).toString('base64url'),
  });
}

export async function rememberIdentity(identity) {
  const cache = await getIdentityCache();
  cache.byDiscord[String(identity.discordId)] = {
    discordId: String(identity.discordId),
    robloxId: String(identity.robloxId),
    robloxUsername: identity.robloxUsername || null,
    robloxDisplayName: identity.robloxDisplayName || null,
    checkedAt: new Date().toISOString(),
  };
  await saveIdentityCache(cache);
  return cache.byDiscord[String(identity.discordId)];
}

export async function rememberIdentities(identities) {
  const cache = await getIdentityCache();
  for (const identity of identities) {
    if (!identity?.discordId || !identity?.robloxId) continue;
    cache.byDiscord[String(identity.discordId)] = {
      ...(cache.byDiscord[String(identity.discordId)] || {}),
      discordId: String(identity.discordId),
      robloxId: String(identity.robloxId),
      checkedAt: new Date().toISOString(),
    };
  }
  await saveIdentityCache(cache);
  return identities.length;
}

export async function discordIdsByRobloxId() {
  const cache = await getIdentityCache();
  return new Map(Object.values(cache.byDiscord || {}).map((entry) => [String(entry.robloxId), String(entry.discordId)]));
}
