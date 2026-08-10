import { getIdentityCache } from './identityStore.js';
import { logger } from './logger.js';
import { EmbedBuilder } from 'discord.js';

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

async function sendGroupLog(client, config, title, description, color) {
  if (!config.robloxGroupLogChannelId) return;
  const channel = await client.channels.fetch(config.robloxGroupLogChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp()],
  }).catch(() => null);
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
    const pageRequests = page?.groupJoinRequests || page?.joinRequests || page?.requests || page?.data || [];
    if (!Array.isArray(pageRequests)) {
      logger.warn(`Roblox join-request response used an unexpected format: ${Object.keys(page || {}).join(', ') || 'no fields'}`);
    } else {
      requests.push(...pageRequests);
    }
    pageToken = page?.nextPageToken || '';
  } while (pageToken);
  return requests;
}

async function eligibleRobloxIds(guild, allowedRoleIds) {
  await guild.members.fetch();
  const cache = await getIdentityCache();
  const allowed = new Map();

  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !allowedRoleIds.some((roleId) => member.roles.cache.has(roleId))) continue;
    const remembered = cache.byDiscord?.[member.id];
    // The cache is populated only from Melonly verification through -id and
    // the low-frequency application index refresh. Do not make one Melonly
    // call per member every minute: that triggers Melonly's rate limit.
    if (remembered?.robloxId) {
      allowed.set(String(remembered.robloxId), member.id);
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
      const discordId = allowedIds.get(robloxId);
      await sendGroupLog(client, config, 'Roblox group request accepted', `<@${discordId}> was accepted into the Roblox group.\nRoblox user ID: \`${robloxId}\``, 0x38d9b0);
    }
  }
  if (accepted) logger.info(`Accepted ${accepted} eligible Roblox group join request(s).`);
}

export function startRobloxGroupSync(client, config) {
  let stopped = false;
  let timer;
  let lastError = '';
  const run = async () => {
    try {
      await syncGroupJoinRequests(client, config);
      lastError = '';
    } catch (error) {
      logger.error('Roblox group join-request sync failed', error);
      const message = String(error?.message || 'Unknown error');
      if (message !== lastError) {
        lastError = message;
        await sendGroupLog(client, config, 'Roblox group sync error', `The group sync could not run.\n\`${message.slice(0, 850)}\``, 0xed4245);
      }
    } finally {
      if (!stopped) timer = setTimeout(run, 60_000);
    }
  };
  void run();
  return () => { stopped = true; clearTimeout(timer); };
}
