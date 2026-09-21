import { discordIdsByRobloxId, getIdentityCache } from './identityStore.js';
import { logger } from './logger.js';
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

async function sendGroupLog(client, config, title, description) {
  if (!config.robloxGroupLogChannelId) return;
  const channel = await client.channels.fetch(config.robloxGroupLogChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send(v2Card({ title, description })).catch(() => null);
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
    const match = String(value).match(/(?:users\/)?(\d{1,20})$/);
    if (match) return match[1];
  }
  return null;
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

async function pendingJoinRequests(groupId, apiKey) {
  const requests = [];
  let firstResponse = null;
  let pageToken = '';
  do {
    const query = new URLSearchParams({ maxPageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await groupFetch(`/groups/${encodeURIComponent(groupId)}/join-requests?${query}`, apiKey);
    firstResponse ||= page;
    const pageRequests = page?.groupJoinRequests || page?.joinRequests || page?.requests || page?.data || [];
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

async function eligibleRobloxIds(guild, allowedRoleIds) {
  await ensureGuildMembers(guild, { allowStale: true });
  const cache = await getIdentityCache();
  const allowed = new Map();
  const nicknameFallbacks = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !allowedRoleIds.some((roleId) => member.roles.cache.has(String(roleId)))) continue;
    const remembered = cache.byDiscord?.[member.id];
    // The cache is populated from Melonly verification and
    // the low-frequency application index refresh. Do not make one Melonly
    // call per member every minute: that triggers Melonly's rate limit.
    if (remembered?.robloxId) {
      allowed.set(String(remembered.robloxId), member.id);
    }
    if (member.nickname) nicknameFallbacks.push({ discordId: member.id, nickname: member.nickname.toLowerCase() });
  }
  return { allowed, nicknameFallbacks };
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
  if (member && !member.user?.bot && allowedRoleIds.some((roleId) => member.roles.cache.has(String(roleId)))) {
    return { discordId, matchSource: 'Melonly Verify' };
  }
  return { discordId: null, matchSource: null };
}

async function syncGroupJoinRequests(client, config) {
  if (!config.robloxGroupId || !config.robloxGroupApiKey) return;
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) throw new Error('DISCORD_GUILD_ID could not be fetched for Roblox group sync');

  const eligible = await eligibleRobloxIds(guild, config.robloxGroupAllowedRoleIds);
  const rosterReady = isDiscordRosterReady(guild);
  if (!rosterReady) {
    logger.warn(
      `Roblox group sync: Discord member roster is incomplete `
      + `(${guild.members.cache.size}/${guild.memberCount || '?'}); `
      + 'accepting known matches only and skipping declines this pass.',
    );
  }
  const requests = await pendingJoinRequests(config.robloxGroupId, config.robloxGroupApiKey);
  logger.info(`Roblox group sync reviewing ${requests.length} pending join request(s) (including any backlog) against ${eligible.allowed.size} Melonly-linked Roblox account(s).`);
  let accepted = 0;
  let declined = 0;
  let skipped = 0;
  let failed = 0;
  const declinedLines = [];

  for (const request of requests) {
    const robloxId = joinRequestRobloxId(request);
    const requestName = joinRequestResourceName(request, config.robloxGroupId);
    if (!requestName) {
      logger.warn(`Skipped a Roblox group join request because it did not include an ID. Fields: ${Object.keys(request || {}).join(', ') || 'none'}.`);
      skipped += 1;
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
        await groupFetch(`/${requestName}:accept`, config.robloxGroupApiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        accepted += 1;
        logger.info(`Accepted Roblox group join request for Discord ${matched.discordId} / Roblox ${robloxId}.`);
        await sendGroupApprovalDm(client, matched.discordId, {
          robloxId,
          groupId: config.robloxGroupId,
        });
        await sendGroupLog(
          client,
          config,
          'Roblox group request accepted',
          `<@${matched.discordId}> was accepted into the Roblox group.\nRoblox user ID: \`${robloxId}\`\nMatched through: ${matched.matchSource}${pendingSince}`,
        );
        continue;
      }

      if (action === 'skip') {
        skipped += 1;
        logger.warn(
          `Skipped Roblox group join request for ${robloxId || 'unknown user'} `
          + 'until Discord roles can be confirmed.',
        );
        continue;
      }

      await groupFetch(`/${requestName}:decline`, config.robloxGroupApiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
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
          `${who} was declined because they are not a Discord member with an allowed group role.${pendingSince}`,
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

  if (accepted || declined || failed || skipped) {
    logger.info(`Roblox group sync finished: accepted ${accepted}, declined ${declined}, skipped ${skipped}, failed ${failed}.`);
  }
}

export function startRobloxGroupSync(client, config) {
  let stopped = false;
  let timer;
  let lastError = '';
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
