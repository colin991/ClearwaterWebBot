import { discordIdsByRobloxId, getIdentityCache } from './identityStore.js';
import { logger } from './logger.js';
import { joinRequestGroupIds, resolveFundsGroupId } from './robloxGroups.js';
import { normalizeRobloxCookie } from './robloxGroupFunds.js';
import { v2Card } from './v2Message.js';
import { ensureGuildMembers, isDiscordRosterReady } from './guildMemberSnapshot.js';

const ROBLOX_CLOUD = 'https://apis.roblox.com/cloud/v2';
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
/** How long to pause sync after Roblox says the API-key account is moderated. */
const MODERATED_PAUSE_MS = 6 * 60 * 60 * 1000;
let lastEmptyRequestDiagnostic = 0;
let lastTransientDiscordAlertAt = 0;
let moderatedUntil = 0;
const robloxUsernameCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Discord.js: "Request with opcode 8 was rate limited. Retry after N seconds." */
function isDiscordMemberFetchRateLimit(error) {
  const message = String(error?.message || error || '');
  return /opcode\s*8/i.test(message) && /rate limited/i.test(message);
}

function discordRetryAfterMs(error) {
  const message = String(error?.message || error || '');
  const match = message.match(/Retry after\s+([\d.]+)\s*seconds?/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(120_000, Math.ceil(seconds * 1000) + 750);
    }
  }
  if (Number.isFinite(error?.retryAfter)) {
    return Math.min(120_000, Math.ceil(Number(error.retryAfter) * 1000) + 750);
  }
  return 30_000;
}

/** Stable key so changing "Retry after 29.048" does not spam Discord alerts. */
function errorFingerprint(message) {
  return String(message || '')
    .replace(/Retry after\s+[\d.]+\s*seconds?/gi, 'Retry after N seconds')
    .replace(/\b\d+(\.\d+)?\s*ms\b/gi, 'Nms')
    .slice(0, 400);
}

function isTransientFetchError(error) {
  const message = String(error?.message || error || '');
  if (isDiscordMemberFetchRateLimit(error)) return true;
  if (/failed \((408|425|429|500|502|503|504)\)/i.test(message)) return true;
  if (/TimeoutError|AbortError|network|fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(message)) return true;
  if (/Request Context Failure/i.test(message)) return true;
  if (/rate limited/i.test(message)) return true;
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

function isRobloxModeratedError(error) {
  const message = String(error?.message || error || '');
  // Roblox returns 403 with body {"errors":[{"code":0,"message":"User is moderated"}]}
  // Match the message even if status was lost through wrapping.
  return /User is moderated/i.test(message)
    && (error?.status === 403 || /\(403\)/.test(message) || !error?.status);
}

async function groupFetch(path, apiKey, options = {}, { retries = 3 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${ROBLOX_CLOUD}${path}`, {
        ...options,
        headers: { 'x-api-key': apiKey, ...(options.headers || {}) },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) {
        return response.status === 204 ? null : response.json();
      }
      const message = await response.text().catch(() => '');
      const error = new Error(
        `Roblox Groups API failed (${response.status})${message ? `: ${message.slice(0, 160)}` : ''}`,
      );
      error.status = response.status;
      if (TRANSIENT_HTTP.has(response.status) && attempt < retries) {
        const waitMs = Math.min(8_000, 500 * (2 ** attempt));
        logger.warn(`Roblox Groups API ${response.status} on ${path}; retry ${attempt + 1}/${retries} in ${waitMs}ms`);
        await sleep(waitMs);
        lastError = error;
        continue;
      }
      throw error;
    } catch (error) {
      lastError = error;
      const transient = isTransientFetchError(error) || TRANSIENT_HTTP.has(error?.status);
      if (transient && attempt < retries) {
        const waitMs = Math.min(8_000, 500 * (2 ** attempt));
        logger.warn(`Roblox Groups API transient error on ${path}; retry ${attempt + 1}/${retries} in ${waitMs}ms: ${error?.message || error}`);
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Roblox Groups API failed after retries');
}

export const GROUP_SKIP_LOG_MS = 15 * 60 * 1000;

export function createSkipLogGate(intervalMs = GROUP_SKIP_LOG_MS) {
  let lastAt = 0;
  let lastCount = null;
  return (skipped, now = Date.now()) => {
    const count = Math.max(0, Number(skipped) || 0);
    if (!count) return false;
    if (count !== lastCount || now - lastAt >= intervalMs) {
      lastAt = now;
      lastCount = count;
      return true;
    }
    return false;
  };
}

const shouldPostSkipLog = createSkipLogGate();

function mentionedUserIds(text) {
  return [...String(text || '').matchAll(/<@(\d{16,22})>/g)].map((match) => match[1]);
}

export function groupLogPayload(title, description) {
  const users = mentionedUserIds(description);
  return {
    allowedMentions: users.length ? { parse: [], users } : { parse: [] },
    embeds: [{
      title: String(title || 'Roblox group').slice(0, 256),
      description: String(description || '\u200b').slice(0, 4000),
      color: 0x5b8def,
      timestamp: new Date().toISOString(),
    }],
  };
}

export async function sendGroupLog(client, config, title, description) {
  const channelId = String(config?.robloxGroupLogChannelId || '').trim();
  if (!channelId) {
    logger.warn('Roblox group Discord log skipped: no log channel id.');
    return false;
  }
  const channel = await client.channels.fetch(channelId).catch((error) => {
    logger.warn(`Roblox group log channel ${channelId} could not be fetched`, error);
    return null;
  });
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    logger.warn(`Roblox group log channel ${channelId} is unavailable.`);
    return false;
  }
  try {
    await channel.send(groupLogPayload(title, description));
    return true;
  } catch (error) {
    logger.error('Roblox group Discord log failed', error);
    return false;
  }
}

async function sendGroupApprovalDm(client, discordId, { robloxId, groupId } = {}) {
  if (!discordId) return;
  try {
    const user = await client.users.fetch(discordId);
    const groupLink = groupId
      ? `\n\nOpen the group: https://www.roblox.com/groups/${encodeURIComponent(groupId)}`
      : '';
    await user.send(v2Card({
      title: 'Roblox group request approved',
      description: (
        `Your join request for the Clearwater Roblox group was **accepted**.${groupLink}\n\n`
        + `Roblox user ID: \`${robloxId || 'unknown'}\``
      ),
    }));
  } catch {
    // User may have DMs closed or the bot blocked — keep the accept/log path moving.
  }
}

export function joinRequestRobloxId(request) {
  const values = [
    request?.user,
    request?.userId,
    request?.requester,
    request?.requesterId,
  ];
  const strings = [];
  for (const value of values) {
    if (value == null || value === '') continue;
    if (typeof value === 'object') {
      for (const key of ['id', 'userId', 'user', 'path', 'name']) {
        const inner = value[key];
        if (inner != null && typeof inner !== 'object') strings.push(String(inner));
      }
      continue;
    }
    strings.push(String(value));
  }
  for (const value of strings) {
    const userMatch = String(value).match(/users\/(\d{1,20})/i);
    if (userMatch) return userMatch[1];
  }
  for (const value of strings) {
    if (/^\d{1,20}$/.test(String(value).trim())) return String(value).trim();
  }
  const path = String(request?.path || request?.name || '');
  const pathMatch = path.match(/join-requests\/(?:users\/)?(\d{1,20})(?:\/|$)/i);
  return pathMatch?.[1] || null;
}

export function joinRequestResourceName(request, groupId) {
  const raw = String(request?.path || request?.name || '').replace(/^\/+/, '').split(':')[0];
  if (/^groups\/[^/]+\/join-requests\/.+/i.test(raw)) return raw;
  const requestId = request?.id
    || request?.requestId
    || request?.groupJoinRequestId
    || request?.groupJoinRequest?.id
    || (raw.includes('/') ? raw.split('/').at(-1) : raw)
    || '';
  return requestId ? `groups/${groupId}/join-requests/${requestId}` : '';
}

export function evaluateJoinRequest({ robloxId, discordId, rosterReady }) {
  if (discordId) return 'accept';
  if (!rosterReady) return 'skip';
  if (!robloxId) return 'skip';
  return 'decline';
}

export function memberRoleIds(member) {
  if (member?.roles?.cache?.keys) return [...member.roles.cache.keys()].map(String);
  if (Array.isArray(member?.roles)) return member.roles.map(String);
  return [];
}

export function memberHasAllowedRole(member, allowedRoleIds) {
  const roles = memberRoleIds(member);
  return (Array.isArray(allowedRoleIds) ? allowedRoleIds : []).some((roleId) => roles.includes(String(roleId)));
}

export function collectEligibleFromMembers(members, allowedRoleIds, identityByDiscord = {}) {
  const allowed = new Map();
  const nicknameFallbacks = [];
  const allowedRoles = (Array.isArray(allowedRoleIds) ? allowedRoleIds : []).map(String);
  for (const member of Array.isArray(members) ? members : []) {
    const user = member?.user || {};
    if (user.bot) continue;
    const discordId = String(member.id || user.id || '').trim();
    if (!discordId) continue;
    const roles = memberRoleIds(member);
    if (!allowedRoles.some((roleId) => roles.includes(roleId))) continue;
    const remembered = identityByDiscord[discordId] || identityByDiscord[String(discordId)];
    if (remembered?.robloxId) allowed.set(String(remembered.robloxId), discordId);
    const nick = member.nickname || member.nick;
    if (nick) nicknameFallbacks.push({ discordId, nickname: String(nick).toLowerCase() });
  }
  return { allowed, nicknameFallbacks };
}

function joinRequestPageItems(page) {
  if (Array.isArray(page?.groupJoinRequests)) return page.groupJoinRequests;
  if (Array.isArray(page?.joinRequests)) return page.joinRequests;
  if (Array.isArray(page?.requests)) return page.requests;
  if (Array.isArray(page?.data)) return page.data;
  return null;
}

function cookieJoinRequest(entry, groupId) {
  const userId = String(entry?.requester?.userId || entry?.requester?.id || entry?.userId || '').trim();
  if (!/^\d{1,20}$/.test(userId)) return null;
  return {
    path: `groups/${groupId}/join-requests/${userId}`,
    user: `users/${userId}`,
    createTime: entry?.created || entry?.createdTime || null,
    requester: entry?.requester,
  };
}

async function pendingJoinRequestsCloud(groupId, apiKey) {
  const requests = [];
  let firstResponse = null;
  let pageToken = '';
  do {
    const query = new URLSearchParams({ maxPageSize: '20' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await groupFetch(`/groups/${encodeURIComponent(groupId)}/join-requests?${query}`, apiKey);
    firstResponse ||= page;
    const pageRequests = joinRequestPageItems(page);
    if (!Array.isArray(pageRequests)) {
      logger.warn(`Roblox join-request response used an unexpected format: ${Object.keys(page || {}).join(', ') || 'no fields'}`);
    } else {
      requests.push(...pageRequests);
    }
    pageToken = page?.nextPageToken || '';
  } while (pageToken);
  if (!requests.length && Date.now() - lastEmptyRequestDiagnostic > 10 * 60 * 1000) {
    lastEmptyRequestDiagnostic = Date.now();
    const safePayload = JSON.stringify(firstResponse || {}).slice(0, 900);
    logger.info(`Roblox join-request API returned no requests for group ${groupId}. Response: ${safePayload || '{}'}`);
  }
  return requests;
}

function headerGet(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  return String(headers[name] || headers[name.toLowerCase()] || '');
}

async function fetchRobloxCsrf(cookie) {
  const token = normalizeRobloxCookie(cookie);
  if (!token) return '';
  try {
    const response = await fetch('https://auth.roblox.com/v2/logout', {
      method: 'POST',
      headers: {
        Cookie: `.ROBLOSECURITY=${token}`,
        'User-Agent': 'Mozilla/5.0 (compatible; ClearwaterBot/1.0)',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    return headerGet(response.headers, 'x-csrf-token');
  } catch {
    return '';
  }
}

async function robloxWebsiteFetch(url, cookie, { method = 'GET', body } = {}) {
  const token = normalizeRobloxCookie(cookie);
  const headers = {
    Cookie: `.ROBLOSECURITY=${token}`,
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; ClearwaterBot/1.0)',
    Referer: 'https://www.roblox.com/',
    Origin: 'https://www.roblox.com',
  };
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  const send = (extra = {}) => fetch(url, {
    method,
    headers: { ...headers, ...extra },
    body: method === 'GET' ? undefined : (body ?? '{}'),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  let response = await send();
  let csrf = headerGet(response.headers, 'x-csrf-token');
  if ((response.status === 403 || response.status === 401) && !csrf && method !== 'GET') {
    csrf = await fetchRobloxCsrf(cookie);
  }
  if ((response.status === 403 || response.status === 401) && csrf) {
    response = await send({ 'x-csrf-token': csrf });
  }
  return response;
}

async function pendingJoinRequestsCookie(groupId, cookie) {
  const requests = [];
  let cursor = '';
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ limit: '100', sortOrder: 'Desc' });
    if (cursor) params.set('cursor', cursor);
    const response = await robloxWebsiteFetch(
      `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/join-requests?${params}`,
      cookie,
    );
    if (!response.ok) {
      throw new Error(`Roblox cookie join-request list failed (${response.status}) for group ${groupId}`);
    }
    const body = await response.json().catch(() => ({}));
    const rows = Array.isArray(body.data) ? body.data : [];
    for (const entry of rows) {
      const mapped = cookieJoinRequest(entry, groupId);
      if (mapped) requests.push(mapped);
    }
    cursor = String(body.nextPageCursor || '');
    if (!cursor || !rows.length) break;
  }
  return requests;
}

async function pendingJoinRequests(groupId, apiKey, cookie) {
  let cloudError = null;
  let listed = [];
  if (apiKey) {
    try {
      listed = await pendingJoinRequestsCloud(groupId, apiKey);
      if (listed.length) return listed.map((request) => ({ ...request, groupId }));
    } catch (error) {
      cloudError = error;
      logger.warn(`Open Cloud join-request list failed for group ${groupId}`, error);
    }
  }
  if (cookie) {
    try {
      const cookieListed = await pendingJoinRequestsCookie(groupId, cookie);
      if (cookieListed.length || !listed.length) {
        return cookieListed.map((request) => ({ ...request, groupId }));
      }
    } catch (error) {
      logger.warn(`Cookie join-request list failed for group ${groupId}`, error);
      if (cloudError && !listed.length) throw cloudError;
    }
  }
  if (cloudError && !listed.length && !cookie) throw cloudError;
  return listed.map((request) => ({ ...request, groupId }));
}

async function decideJoinRequest(kind, { requestName, robloxId, groupId, apiKey, cookie }) {
  if (apiKey) {
    try {
      await groupFetch(`/${requestName}:${kind}`, apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return 'cloud';
    } catch (error) {
      if (!cookie || !robloxId) throw error;
      logger.warn(`Open Cloud ${kind} failed for ${requestName}; trying cookie`, error);
    }
  }
  if (!cookie || !robloxId) {
    throw new Error(`Cannot ${kind} Roblox join request without ROBLOX_GROUP_API_KEY or ROBLOX_COOKIE`);
  }
  const path = kind === 'decline'
    ? `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/join-requests/users/${encodeURIComponent(robloxId)}/decline`
    : `https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}/join-requests/users/${encodeURIComponent(robloxId)}`;
  const response = await robloxWebsiteFetch(path, cookie, { method: 'POST', body: '{}' });
  if (!response.ok && response.status !== 200 && response.status !== 204) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Cookie ${kind} failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }
  return 'cookie';
}

async function listDiscordGuildMembers(client, guildId) {
  const members = [];
  let after = '0';
  if (typeof client?.rest?.get !== 'function') return members;
  for (let page = 0; page < 50; page += 1) {
    const batch = await client.rest.get(`/guilds/${guildId}/members?limit=1000&after=${encodeURIComponent(after)}`);
    const list = Array.isArray(batch) ? batch : [];
    if (!list.length) break;
    members.push(...list);
    after = String(list.at(-1)?.user?.id || '');
    if (!after || list.length < 1000) break;
  }
  return members;
}

async function robloxUsername(robloxId) {
  const cached = robloxUsernameCache.get(robloxId);
  if (cached) return cached;
  const response = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(robloxId)}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  const username = String(user?.name || '').trim() || null;
  robloxUsernameCache.set(robloxId, username);
  return username;
}

async function eligibleRobloxIds(guild, allowedRoleIds, client) {
  const cache = await getIdentityCache();
  let members = [];
  try {
    members = await listDiscordGuildMembers(client, guild.id);
  } catch (error) {
    logger.warn('Roblox group sync: REST member list failed; using the cached roster', error);
  }
  if (!members.length) {
    await ensureGuildMembers(guild, { allowStale: true });
    members = [...guild.members.cache.values()];
  }
  return collectEligibleFromMembers(members, allowedRoleIds, cache.byDiscord || {});
}

async function resolveEligibleDiscordId(robloxId, eligible, guild, allowedRoleIds) {
  if (!robloxId) return { discordId: null, matchSource: null };
  const linked = eligible.allowed.get(String(robloxId));
  if (linked) return { discordId: linked, matchSource: 'Melonly Verify' };

  const username = await robloxUsername(robloxId).catch(() => null);
  const nicknameMatch = username && eligible.nicknameFallbacks.find((entry) => entry.nickname.includes(username.toLowerCase()));
  if (nicknameMatch) {
    return { discordId: nicknameMatch.discordId, matchSource: 'Discord server nickname' };
  }

  const identities = await discordIdsByRobloxId();
  const discordId = identities.get(String(robloxId));
  if (!discordId) return { discordId: null, matchSource: null };
  let member = guild.members.cache.get(discordId);
  if (!member) member = await guild.members.fetch(discordId).catch(() => null);
  if (member && !member.user?.bot && memberHasAllowedRole(member, allowedRoleIds)) {
    return { discordId, matchSource: 'Melonly Verify' };
  }
  const rawRoles = Array.isArray(member?.roles) ? member.roles : memberRoleIds(member);
  if (rawRoles.length && allowedRoleIds.some((roleId) => rawRoles.map(String).includes(String(roleId)))) {
    return { discordId, matchSource: 'Melonly Verify' };
  }
  return { discordId: null, matchSource: null };
}

async function syncGroupJoinRequests(client, config) {
  const groupIds = joinRequestGroupIds(config);
  const apiKey = config.robloxGroupApiKey;
  const cookie = normalizeRobloxCookie(config.robloxCookie);
  if (!groupIds.length || (!apiKey && !cookie)) {
    logger.warn('Roblox group sync skipped: set ROBLOX_GROUP_API_KEY or ROBLOX_COOKIE.');
    return;
  }
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) throw new Error('DISCORD_GUILD_ID could not be fetched for Roblox group sync');

  const eligible = await eligibleRobloxIds(guild, config.robloxGroupAllowedRoleIds, client);
  const rosterReady = isDiscordRosterReady(guild) || eligible.allowed.size > 0;
  if (!rosterReady) {
    logger.warn(
      `Roblox group sync: Discord member roster is incomplete `
      + `(${guild.members.cache.size}/${guild.memberCount || '?'}); `
      + 'accepting known matches only and skipping declines this pass.',
    );
  }
  const requests = [];
  const listErrors = [];
  for (const groupId of groupIds) {
    try {
      const listed = await pendingJoinRequests(groupId, apiKey, cookie);
      requests.push(...listed);
    } catch (error) {
      listErrors.push({ groupId, error });
      logger.warn(`Roblox join-request list failed for group ${groupId}`, error);
    }
  }
  if (!requests.length && listErrors.length === groupIds.length) {
    throw listErrors[0].error;
  }
  logger.info(`Roblox group sync reviewing ${requests.length} pending join request(s) for groups ${groupIds.join(', ')} against ${eligible.allowed.size} Melonly-linked Roblox account(s).`);
  let accepted = 0;
  let declined = 0;
  let skipped = 0;
  let failed = 0;
  const declinedLines = [];
  const skippedLines = [];

  for (const request of requests) {
    const groupId = request.groupId || joinRequestGroupIds(config)[0];
    const robloxId = joinRequestRobloxId(request);
    const requestName = joinRequestResourceName(request, groupId);
    if (!requestName) {
      logger.warn(`Skipped a Roblox group join request because it did not include an ID. Fields: ${Object.keys(request || {}).join(', ') || 'none'}.`);
      skipped += 1;
      skippedLines.push(robloxId ? `Roblox user ID \`${robloxId}\` (missing request id)` : 'Unknown request (missing request id)');
      continue;
    }

    const createdAt = request?.createTime || request?.createdTime || request?.createdAt || null;
    const pendingSince = createdAt
      ? `\nPending since: <t:${Math.floor(new Date(createdAt).getTime() / 1000)}:R>`
      : '';

    try {
      const matched = await resolveEligibleDiscordId(
        robloxId,
        eligible,
        guild,
        config.robloxGroupAllowedRoleIds,
      );
      const action = evaluateJoinRequest({
        robloxId,
        discordId: matched.discordId,
        rosterReady,
      });

      if (action === 'accept') {
        await decideJoinRequest('accept', {
          requestName,
          robloxId,
          groupId,
          apiKey,
          cookie,
        });
        accepted += 1;
        logger.info(`Accepted Roblox group join request for Discord ${matched.discordId} / Roblox ${robloxId}.`);
        await sendGroupApprovalDm(client, matched.discordId, {
          robloxId,
          groupId,
        });
        await sendGroupLog(
          client,
          config,
          'Roblox group request accepted',
          `<@${matched.discordId}> was accepted into Roblox group \`${groupId}\`.\nRoblox user ID: \`${robloxId}\`\nMatched through: ${matched.matchSource}${pendingSince}`,
        );
        continue;
      }

      if (action === 'skip') {
        skipped += 1;
        skippedLines.push(
          robloxId
            ? `Roblox user ID \`${robloxId}\`${rosterReady ? '' : ' (Discord member list incomplete)'}`
            : 'Unknown Roblox user (no user id)',
        );
        logger.warn(
          `Skipped Roblox group join request for ${robloxId || 'unknown user'} `
          + 'until Discord roles can be confirmed.',
        );
        continue;
      }

      await decideJoinRequest('decline', {
        requestName,
        robloxId,
        groupId,
        apiKey,
        cookie,
      });
      declined += 1;
      const username = robloxId ? await robloxUsername(robloxId).catch(() => null) : null;
      const who = username
        ? `Roblox user \`${username}\` (\`${robloxId}\`)`
        : (robloxId ? `Roblox user ID \`${robloxId}\`` : 'An unknown Roblox user');
      const line = `${who}${createdAt ? ` · pending since ${createdAt}` : ''}`;
      declinedLines.push(line);
      logger.info(`Declined Roblox group join request: ${who.replace(/`/g, '')} (no allowed Discord role).`);
      await sendGroupLog(
          client,
          config,
          'Roblox group request declined',
          `${who} was declined for group \`${groupId}\` because they are not a Discord member with an allowed group role.${pendingSince}`,
        );
    } catch (error) {
      failed += 1;
      logger.error(`Failed to process Roblox group join request ${requestName}`, error);
    }
  }

  if (declined) {
    const preview = declinedLines.slice(0, 15).map((line) => `• ${line}`).join('\n');
    const extra = declinedLines.length > 15 ? `\n…and ${declinedLines.length - 15} more.` : '';
    await sendGroupLog(
      client,
      config,
      'Roblox pending queue cleared',
      `Declined **${declined}** pending join request(s) with no allowed Discord role (includes older backlog).\n\n${preview}${extra}`,
    );
  }

  if (skipped && shouldPostSkipLog(skipped)) {
    const preview = skippedLines.slice(0, 15).map((line) => `• ${line}`).join('\n');
    const extra = skippedLines.length > 15 ? `\n…and ${skippedLines.length - 15} more.` : '';
    const reason = rosterReady
      ? 'those requests did not include enough information to accept or decline yet'
      : 'the Discord member list is incomplete, so whitelist roles cannot be confirmed yet';
    await sendGroupLog(
      client,
      config,
      'Roblox group request waiting',
      `Skipped **${skipped}** pending join request(s) because ${reason}. Known whitelist matches are still accepted.\n\n${preview}${extra}`,
    );
  }

  if (accepted || declined || failed || skipped) {
    logger.info(`Roblox group sync finished: accepted ${accepted}, declined ${declined}, skipped ${skipped}, failed ${failed}.`);
  }
}

export function startRobloxGroupSync(client, config) {
  let stopped = false;
  let timer;
  let lastError = '';
  logger.info(
    `Roblox groups: join-request sync watches ${joinRequestGroupIds(config).join(' and ')}; `
    + `-funds uses ${resolveFundsGroupId(config)}.`,
  );
  const run = async () => {
    let nextDelayMs = 60_000;
    try {
      if (Date.now() < moderatedUntil) {
        nextDelayMs = Math.max(60_000, moderatedUntil - Date.now());
        logger.warn(
          `Roblox group sync paused until ${new Date(moderatedUntil).toISOString()} `
          + '(API key account is moderated).',
        );
      } else {
        // After a moderation pause ends, allow one fresh Discord notice if still broken.
        if (moderatedUntil) {
          lastError = '';
          moderatedUntil = 0;
        }
        await syncGroupJoinRequests(client, config);
        lastError = '';
      }
    } catch (error) {
      logger.error('Roblox group join-request sync failed', error);
      const message = String(error?.message || 'Unknown error');
      const fingerprint = errorFingerprint(message);
      const moderated = isRobloxModeratedError(error);
      const memberRateLimit = isDiscordMemberFetchRateLimit(error);
      const transient = !moderated && isTransientFetchError(error);
      const now = Date.now();

      if (memberRateLimit) {
        nextDelayMs = Math.max(60_000, discordRetryAfterMs(error));
      }

      if (moderated) {
        moderatedUntil = now + MODERATED_PAUSE_MS;
        nextDelayMs = MODERATED_PAUSE_MS;
        const shouldAlert = fingerprint !== lastError;
        lastError = fingerprint;
        if (shouldAlert) {
          const resumeAt = Math.floor(moderatedUntil / 1000);
          await sendGroupLog(
            client,
            config,
            'Roblox group sync paused',
            [
              'Roblox returned **User is moderated** for the Open Cloud API key account.',
              'Group join accept/decline cannot run until that Roblox account is unmoderated,',
              'or you create a new Open Cloud API key on an **unmoderated** Roblox account',
              'with Groups permission and update `ROBLOX_GROUP_API_KEY` on the host.',
              '',
              `Sync is paused until <t:${resumeAt}:f> to avoid spamming this channel.`,
              '',
              `\`${message.slice(0, 700)}\``,
            ].join('\n'),
          );
        }
      } else {
        // Transient Discord/Roblox outages often clear on their own — only
        // ping Discord at most once per 30 minutes for the same class of failure.
        const shouldAlert = transient
          ? (fingerprint !== lastError || now - lastTransientDiscordAlertAt > 30 * 60 * 1000)
          : fingerprint !== lastError;
        lastError = fingerprint;
        if (shouldAlert) {
          if (transient) lastTransientDiscordAlertAt = now;
          const prefix = memberRateLimit
            ? 'Discord rate-limited a member roster refresh (opcode 8). Sync will retry automatically and reuse the cached roster when possible.\n'
            : transient
              ? 'Roblox had a temporary outage and the sync will retry automatically.\n'
              : 'The group sync could not run.\n';
          await sendGroupLog(
            client,
            config,
            'Roblox group sync error',
            `${prefix}\`${message.slice(0, 850)}\``,
          );
        }
      }
    } finally {
      if (!stopped) timer = setTimeout(run, nextDelayMs);
    }
  };
  void run();
  return () => { stopped = true; clearTimeout(timer); };
}
