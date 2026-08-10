import { getIdentityCache } from './identityStore.js';
import { logger } from './logger.js';

const ROBLOX_CLOUD = 'https://apis.roblox.com/cloud/v2';
const usernameIdCache = new Map();
const USERNAME_CACHE_MS = 10 * 60 * 1000;

function nicknameRobloxUsernames(member) {
  // Supports both "CALL-SIGN | RobloxUsername" and a nickname that is simply
  // the Roblox username. Splitting also finds it when staff add other text.
  const nickname = String(member.nickname || '');
  const candidates = new Set();
  const afterSeparator = nickname.split('|').at(-1)?.trim();
  if (/^[A-Za-z0-9_]{3,20}$/.test(afterSeparator || '')) candidates.add(afterSeparator);
  for (const value of nickname.split(/[^A-Za-z0-9_]+/)) {
    if (/^[A-Za-z0-9_]{3,20}$/.test(value)) candidates.add(value);
  }
  return [...candidates];
}

async function robloxIdsFromUsernames(usernames) {
  const now = Date.now();
  const resolved = new Map();
  const missing = [];
  for (const username of usernames) {
    const cached = usernameIdCache.get(username.toLowerCase());
    if (cached && now - cached.checkedAt < USERNAME_CACHE_MS) {
      if (cached.id) resolved.set(username.toLowerCase(), cached.id);
    } else {
      missing.push(username);
    }
  }
  if (!missing.length) return resolved;

  const response = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: missing.slice(0, 50), excludeBannedUsers: false }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Roblox username lookup failed (${response.status})`);
  const data = await response.json();
  const found = new Map((data?.data || []).map((user) => [String(user.requestedUsername || user.name || '').toLowerCase(), String(user.id)]));
  for (const username of missing.slice(0, 50)) {
    const id = found.get(username.toLowerCase()) || null;
    usernameIdCache.set(username.toLowerCase(), { id, checkedAt: now });
    if (id) resolved.set(username.toLowerCase(), id);
  }
  return resolved;
}

async function groupFetch(path, apiKey, options = {}) {
  const response = await fetch(`${ROBLOX_CLOUD}${path}`, {
    ...options,
    headers: { 'x-api-key': apiKey, ...(options.headers || {}) },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Roblox Groups API failed (${response.status})${message ? `: ${message.slice(0, 160)}` : ''}`);
  }
  return response.status === 204 ? null : response.json();
}

function joinRequestRobloxId(request) {
  const possible = [request?.user, request?.userId, request?.user?.id, request?.user?.userId, request?.user?.name, request?.user?.path];
  for (const value of possible) {
    const match = String(value || '').match(/(?:users\/)?(\d+)$/);
    if (match) return match[1];
  }
  return null;
}

async function pendingJoinRequests(groupId, apiKey) {
  const requests = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ maxPageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await groupFetch(`/groups/${encodeURIComponent(groupId)}/join-requests?${query}`, apiKey);
    requests.push(...(page?.groupJoinRequests || page?.joinRequests || []));
    pageToken = page?.nextPageToken || '';
  } while (pageToken);
  return requests;
}

async function eligibleRobloxIds(guild, allowedRoleIds) {
  await guild.members.fetch();
  const cache = await getIdentityCache();
  const allowed = new Set();
  const usernames = new Set();

  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !allowedRoleIds.some((roleId) => member.roles.cache.has(roleId))) continue;
    const nicknameUsernames = nicknameRobloxUsernames(member);
    if (nicknameUsernames.length) {
      nicknameUsernames.forEach((username) => usernames.add(username));
      continue;
    }
    const remembered = cache.byDiscord?.[member.id]?.robloxId;
    if (remembered) allowed.add(String(remembered));
  }
  const usernameList = [...usernames];
  for (let index = 0; index < usernameList.length; index += 50) {
    try {
      const resolved = await robloxIdsFromUsernames(usernameList.slice(index, index + 50));
      for (const id of resolved.values()) allowed.add(id);
    } catch (error) {
      logger.warn(`Could not resolve Roblox usernames in Discord nicknames: ${error.message}`);
    }
  }
  return allowed;
}

async function syncGroupJoinRequests(client, config) {
  if (!config.robloxGroupId || !config.robloxGroupApiKey) return;
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) throw new Error('DISCORD_GUILD_ID could not be fetched for Roblox group sync');

  const allowedIds = await eligibleRobloxIds(guild, config.robloxGroupAllowedRoleIds);
  const requests = await pendingJoinRequests(config.robloxGroupId, config.robloxGroupApiKey);
  logger.info(`Roblox group sync found ${requests.length} pending join request(s) and ${allowedIds.size} eligible Discord-linked Roblox account(s).`);
  let accepted = 0;
  let declined = 0;
  for (const request of requests) {
    const robloxId = joinRequestRobloxId(request);
    const requestId = request?.id || String(request?.name || '').split('/').at(-1);
    const requestName = requestId
      ? `groups/${config.robloxGroupId}/join-requests/${requestId}`
      : String(request?.name || '');
    if (!requestName) {
      logger.warn('Skipped a Roblox group join request because it did not include a request name.');
      continue;
    }
    if (robloxId && allowedIds.has(robloxId)) {
      await groupFetch(`/${requestName}:accept`, config.robloxGroupApiKey, { method: 'POST' });
      accepted += 1;
    } else {
      // A request is declined unless the same Roblox account belongs to a Discord
      // member holding at least one of the configured allowed roles.
      await groupFetch(`/${requestName}:decline`, config.robloxGroupApiKey, { method: 'POST' });
      declined += 1;
    }
  }
  if (accepted) logger.info(`Accepted ${accepted} eligible Roblox group join request(s).`);
  if (declined) logger.info(`Declined ${declined} Roblox group join request(s) without an allowed Discord role.`);
}

export function startRobloxGroupSync(client, config) {
  let stopped = false;
  let timer;
  const run = async () => {
    try {
      await syncGroupJoinRequests(client, config);
    } catch (error) {
      logger.error('Roblox group join-request sync failed', error);
    } finally {
      if (!stopped) timer = setTimeout(run, 60_000);
    }
  };
  void run();
  return () => { stopped = true; clearTimeout(timer); };
}
