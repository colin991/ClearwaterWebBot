import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const cachePath = join(process.cwd(), 'data', 'identity-cache.json');
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

export async function getIdentityCache() {
  const raw = await readJsonFile(cachePath, emptyCache);
  if (raw?.byDiscord && typeof raw.byDiscord === 'object' && !raw.data) {
    return { byDiscord: raw.byDiscord };
  }
  return decryptCache(raw) || { byDiscord: {} };
}

async function saveIdentityCache(cache) {
  const key = identityKey();
  if (!key) {
    await writeJsonFile(cachePath, cache);
    return;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(cache), 'utf8'), cipher.final()]);
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
