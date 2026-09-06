import { getIdentityCache } from './identityStore.js';
import { logger } from './logger.js';
import { v2Card } from './v2Message.js';

const ROBLOX_CLOUD = 'https://apis.roblox.com/cloud/v2';
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
/** How long to pause sync after Roblox says the API-key account is moderated. */
const MODERATED_PAUSE_MS = 6 * 60 * 60 * 1000;
let lastEmptyRequestDiagnostic = 0;
let lastTransientDiscordAlertAt = 0;
let moderatedUntil = 0;
const robloxUsernameCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientFetchError(error) {
  const message = String(error?.message || error || '');
  if (/failed \((408|425|429|500|502|503|504)\)/i.test(message)) return true;
  if (/TimeoutError|AbortError|network|fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(message)) return true;
  if (/Request Context Failure/i.test(message)) return true;
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

function joinRequestRobloxId(request) {
  const possible = [request?.user, request?.userId, request?.user?.id, request?.user?.userId, request?.user?.name, request?.user?.path, request?.requester, request?.requester?.id, request?.requester?.userId];
  for (const value of possible) {
    const match = String(value || '').match(/(?:users\/)?(\d+)$/);
    if (match) return match[1];
  }
  return null;
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
  await guild.members.fetch();
  const cache = await getIdentityCache();
  const allowed = new Map();
  const nicknameFallbacks = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !allowedRoleIds.some((roleId) => member.roles.cache.has(roleId))) continue;
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

async function syncGroupJoinRequests(client, config) {
  if (!config.robloxGroupId || !config.robloxGroupApiKey) return;
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) throw new Error('DISCORD_GUILD_ID could not be fetched for Roblox group sync');

  const eligible = await eligibleRobloxIds(guild, config.robloxGroupAllowedRoleIds);
  const requests = await pendingJoinRequests(config.robloxGroupId, config.robloxGroupApiKey);
  logger.info(`Roblox group sync reviewing ${requests.length} pending join request(s) (including any backlog) against ${eligible.allowed.size} Melonly-linked Roblox account(s).`);
  let accepted = 0;
  let declined = 0;
  let failed = 0;
  const declinedLines = [];

  for (const request of requests) {
    const robloxId = joinRequestRobloxId(request);
    const requestId = request?.id
      || request?.requestId
      || request?.groupJoinRequestId
      || request?.groupJoinRequest?.id
      || String(request?.path || '').split('/').at(-1)
      || String(request?.name || '').split('/').at(-1);
    const requestName = requestId
      ? `groups/${config.robloxGroupId}/join-requests/${requestId}`
      : String(request?.name || '');
    if (!requestName) {
      logger.warn(`Skipped a Roblox group join request because it did not include an ID. Fields: ${Object.keys(request || {}).join(', ') || 'none'}.`);
      continue;
    }

    const createdAt = request?.createTime || request?.createdTime || request?.createdAt || null;
    const pendingSince = createdAt
      ? `\nPending since: <t:${Math.floor(new Date(createdAt).getTime() / 1000)}:R>`
      : '';

    try {
      let discordId = robloxId ? eligible.allowed.get(robloxId) : null;
      let matchSource = 'Melonly Verify';
      if (!discordId && robloxId) {
        const username = await robloxUsername(robloxId).catch(() => null);
        const nicknameMatch = username && eligible.nicknameFallbacks.find((entry) => entry.nickname.includes(username.toLowerCase()));
        if (nicknameMatch) {
          discordId = nicknameMatch.discordId;
          matchSource = 'Discord server nickname';
        }
      }

      if (robloxId && discordId) {
        await groupFetch(`/${requestName}:accept`, config.robloxGroupApiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        accepted += 1;
        logger.info(`Accepted Roblox group join request for Discord ${discordId} / Roblox ${robloxId}.`);
        await sendGroupApprovalDm(client, discordId, {
          robloxId,
          groupId: config.robloxGroupId,
        });
        await sendGroupLog(
          client,
          config,
          'Roblox group request accepted',
          `<@${discordId}> was accepted into the Roblox group.\nRoblox user ID: \`${robloxId}\`\nMatched through: ${matchSource}${pendingSince}`,
        );
        continue;
      }

      // Decline anyone without an allowed Discord role — including older pending backlog.
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

  if (accepted || declined || failed) {
    logger.info(`Roblox group sync finished: accepted ${accepted}, declined ${declined}, failed ${failed}.`);
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
      const moderated = isRobloxModeratedError(error);
      const transient = !moderated && isTransientFetchError(error);
      const now = Date.now();

      if (moderated) {
        moderatedUntil = now + MODERATED_PAUSE_MS;
        nextDelayMs = MODERATED_PAUSE_MS;
        const shouldAlert = message !== lastError;
        lastError = message;
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
        // Transient Roblox outages (502/503/etc.) often clear on their own — only
        // ping Discord at most once per 30 minutes for the same class of failure.
        const shouldAlert = transient
          ? (message !== lastError || now - lastTransientDiscordAlertAt > 30 * 60 * 1000)
          : message !== lastError;
        lastError = message;
        if (shouldAlert) {
          if (transient) lastTransientDiscordAlertAt = now;
          const prefix = transient
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
