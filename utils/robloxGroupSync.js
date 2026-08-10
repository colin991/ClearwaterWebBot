import { getIdentityCache, rememberIdentity } from './identityStore.js';
import { logger } from './logger.js';
import { findRobloxIdentity } from './melonly.js';

const ROBLOX_CLOUD = 'https://apis.roblox.com/cloud/v2';

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

async function eligibleRobloxIds(guild, allowedRoleIds, melonlyApiKey) {
  await guild.members.fetch();
  const cache = await getIdentityCache();
  const allowed = new Set();
  const staleAfter = Date.now() - (6 * 60 * 60 * 1000);

  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !allowedRoleIds.some((roleId) => member.roles.cache.has(roleId))) continue;
    const remembered = cache.byDiscord?.[member.id];
    if (remembered?.robloxId && Date.parse(remembered.checkedAt || '') >= staleAfter) {
      allowed.add(String(remembered.robloxId));
      continue;
    }
    try {
      const identity = await findRobloxIdentity(member.id, melonlyApiKey);
      if (!identity?.robloxId) continue;
      allowed.add(String(identity.robloxId));
      await rememberIdentity(identity);
    } catch (error) {
      logger.warn(`Could not find a Melonly-verified Roblox account for ${member.user.tag}: ${error.message}`);
    }
  }
  return allowed;
}

async function syncGroupJoinRequests(client, config) {
  if (!config.robloxGroupId || !config.robloxGroupApiKey) return;
  if (!config.melonlyApiKey) throw new Error('MELONLY_API_KEY is required for Roblox group sync');
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) throw new Error('DISCORD_GUILD_ID could not be fetched for Roblox group sync');

  const allowedIds = await eligibleRobloxIds(guild, config.robloxGroupAllowedRoleIds, config.melonlyApiKey);
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
