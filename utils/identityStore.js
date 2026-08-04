import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const cachePath = join(process.cwd(), 'data', 'identity-cache.json');
const emptyCache = { byDiscord: {} };

export async function getIdentityCache() {
  return readJsonFile(cachePath, emptyCache);
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
  await writeJsonFile(cachePath, cache);
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
  await writeJsonFile(cachePath, cache);
  return identities.length;
}

export async function discordIdsByRobloxId() {
  const cache = await getIdentityCache();
  return new Map(Object.values(cache.byDiscord || {}).map((entry) => [String(entry.robloxId), String(entry.discordId)]));
}
