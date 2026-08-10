import { getIdentityCache } from './identityStore.js';
import { logger } from './logger.js';

const ROBLOX_CLOUD = 'https://apis.roblox.com/cloud/v2';

function nicknameRobloxUsername(member) {
  // The server nickname format is: "CALL-SIGN | RobloxUsername".
  // Take only the final segment so a callsign can contain a separator too.
  const nickname = String(member.nickname || '');
  const username = nickname.split('|').at(-1)?.trim() || '';
  return /^[A-Za-z0-9_]{3,20}$/.test(username) ? username : null;
}

async function robloxIdFromUsername(username) {
  const response = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Roblox username lookup failed (${response.status})`);
  const data = await response.json();
  return data?.data?.[0]?.id ? String(data.data[0].id) : null;
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
  const possible = [request?.user, request?.userId, request?.user?.name, request?.user?.path];
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
    const query = new URLSearchParams({ pageSize: '100' });
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
  const lookups = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !allowedRoleIds.some((roleId) => member.roles.cache.has(roleId))) continue;
    const nicknameUsername = nicknameRobloxUsername(member);
    if (nicknameUsername) {
      lookups.push(robloxIdFromUsername(nicknameUsername).then((id) => id && allowed.add(id)).catch((error) => {
        logger.warn(`Could not resolve Roblox username in ${member.user.tag}'s nickname: ${error.message}`);
      }));
      continue;
    }
    const remembered = cache.byDiscord?.[member.id]?.robloxId;
    if (remembered) allowed.add(String(remembered));
  }
  await Promise.all(lookups);
  return allowed;
}

async function syncGroupJoinRequests(client, config) {
  if (!config.robloxGroupId || !config.robloxGroupApiKey) return;
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) throw new Error('DISCORD_GUILD_ID could not be fetched for Roblox group sync');

  const allowedIds = await eligibleRobloxIds(guild, config.robloxGroupAllowedRoleIds);
  const requests = await pendingJoinRequests(config.robloxGroupId, config.robloxGroupApiKey);
  let accepted = 0;
  let declined = 0;
  for (const request of requests) {
    const robloxId = joinRequestRobloxId(request);
    if (!request?.name) {
      logger.warn('Skipped a Roblox group join request because it did not include a request name.');
      continue;
    }
    if (robloxId && allowedIds.has(robloxId)) {
      await groupFetch(`/${request.name}:accept`, config.robloxGroupApiKey, { method: 'POST' });
      accepted += 1;
    } else {
      // A request is declined unless the same Roblox account belongs to a Discord
      // member holding at least one of the configured allowed roles.
      await groupFetch(`/${request.name}:decline`, config.robloxGroupApiKey, { method: 'POST' });
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
