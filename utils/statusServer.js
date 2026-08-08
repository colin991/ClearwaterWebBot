import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { buildDiscordCatalog, getOwnerConfig, saveOwnerConfig } from './ownerConfig.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank } from './staffRanks.js';
import { clearExpiredInternetBans, createInternetPost, createInternetReport, deleteInternetPost, editInternetPost, ensureOfficialInternetAccount, getActiveBan, interactInternetPost, internetPreferences, moderationSnapshot, OFFICIAL_INTERNET_ACCOUNT_ID, publicPosts, publicUsers, readInternetStore, reviewInternetReport, saveInternetStore, sendInternetMessage, setInternetBan, socialSnapshot, takeInternetConversation, takeInternetMessages, takeInternetNotifications, takeUnreadInternetWarnings, updateInternetPreference, updateInternetSocial, updateOfficialInternetProfile, upsertInternetUser, voteInternetPoll } from './internetStore.js';

const json = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

const safeEqual = (left = '', right = '') => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const readJson = async (request) => {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 2_100_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
};

export function startStatusServer(client, config) {
  let lastInternetRoleSync = 0;

  const enforceInternetMembership = async (store, actor) => {
    const discordId = String(actor?.id || '');
    if (!/^\d{16,22}$/.test(discordId)) return true;
    const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
      || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
    if (!guild) return null;
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member) return true;
    const user = upsertInternetUser(store, actor);
    if (!getActiveBan(user)) {
      setInternetBan(user, { enabled: true, reason: 'This account is no longer a member of Clearwater Roleplay on Discord.', durationDays: 'forever' });
      await saveInternetStore(store);
    }
    return false;
  };

  const syncInternetRoles = async (store) => {
    // Keep older posts accurate even when a Discord role change happened
    // before the bot was restarted. Limit this to once a minute.
    if (Date.now() - lastInternetRoleSync < 60 * 1000) return false;
    lastInternetRoleSync = Date.now();
    const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
      || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
    if (!guild) return false;

    let changed = false;
    const activeAuthorIds = new Set(store.posts.slice(0, 100).map((post) => post.authorId));
    for (const user of Object.values(store.users)) {
      if (!activeAuthorIds.has(user.id) || !user.staffRank) continue;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) continue;
      const staffRank = getHighestStaffRank(member)?.name || null;
      if (user.staffRank !== staffRank) {
        upsertInternetUser(store, { id: user.id, staffRank });
        changed = true;
      }
    }
    return changed;
  };

  const expireInternetBans = async () => {
    try {
      const store = await readInternetStore();
      const cleared = clearExpiredInternetBans(store);
      if (cleared) {
        await saveInternetStore(store);
        logger.info(`Automatically unbanned ${cleared} Clearwater Internet account(s).`);
      }
    } catch (error) {
      logger.error('Could not clear expired Clearwater Internet bans', error);
    }
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { ok: true, botOnline: client.isReady() });
    }

    if (!['/api/status', '/api/actions', '/api/config', '/api/access', '/api/internet'].includes(url.pathname)) {
      return json(response, 404, { error: 'Not found' });
    }

    if (!config.apiKey) {
      return json(response, 503, { error: 'Status connection is not configured' });
    }

    const authorization = request.headers.authorization || '';
    if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), config.apiKey)) {
      return json(response, 401, { error: 'Unauthorized' });
    }

    if (request.method === 'GET' && url.pathname === '/api/access') {
      const discordId = url.searchParams.get('discordId') || '';
      if (!/^\d{16,22}$/.test(discordId)) return json(response, 400, { error: 'Invalid Discord user' });
      const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
        || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
      const member = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
      const staffRank = getHighestStaffRank(member);
      const allowed = config.ownerDiscordIds.includes(discordId)
        || staffRank?.owner === true
        || Boolean(member && config.ownerRoleIds.some((roleId) => member.roles.cache.has(roleId)));
      return json(response, 200, { allowed, member: Boolean(member), staffRank: staffRank?.name || null });
    }

    if (request.method === 'POST' && url.pathname === '/api/actions') {
      try {
        const body = await readJson(request);
        if (body.action !== 'ping') return json(response, 400, { error: 'Unsupported action' });

        logger.info('Website action received: ping');
        return json(response, 200, {
          ok: true,
          action: 'ping',
          botOnline: client.isReady(),
          acknowledgedAt: new Date().toISOString(),
        });
      } catch {
        return json(response, 400, { error: 'Invalid request' });
      }
    }

    if (url.pathname === '/api/internet') {
      try {
        const store = await readInternetStore();
        if (request.method === 'GET') {
          const createdOfficialAccount = !store.users[OFFICIAL_INTERNET_ACCOUNT_ID];
          ensureOfficialInternetAccount(store);
          if (createdOfficialAccount || await syncInternetRoles(store)) await saveInternetStore(store);
          return json(response, 200, { posts: publicPosts(store), users: publicUsers(store) });
        }
        if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });

        const body = await readJson(request);
        const membership = await enforceInternetMembership(store, body.actor);
        if (membership === false) return json(response, 403, { error: 'You must be a member of the Clearwater Roleplay Discord server to use Clearwater Internet.' });
        if (membership === null) return json(response, 503, { error: 'Clearwater Internet could not verify Discord membership right now. Please try again shortly.' });
        // The website has already verified Ownership before sending this flag.
        // Keep Discord membership tied to the real person, then perform the action as the official account.
        if (body.asOfficial === true && body.owner === true) body.actor = ensureOfficialInternetAccount(store);
        if (body.action === 'post') {
          const user = body.asOfficial === true && body.owner === true
            ? ensureOfficialInternetAccount(store)
            : upsertInternetUser(store, body.actor);
          const post = createInternetPost(store, user, body.content, { gif: body.gif, image: body.image, poll: body.poll });
          await saveInternetStore(store);
          return json(response, 201, { post });
        }

        if (body.action === 'official-profile-save') {
          if (body.owner !== true) return json(response, 403, { error: 'Ownership access required' });
          const official = updateOfficialInternetProfile(store, body.profile);
          await saveInternetStore(store);
          return json(response, 200, { official });
        }

        if (body.action === 'status') {
          const user = upsertInternetUser(store, body.actor);
          const ban = getActiveBan(user);
          await saveInternetStore(store);
          return json(response, 200, { banned: Boolean(ban), ban });
        }

        if (body.action === 'edit' || body.action === 'delete') {
          const result = body.action === 'edit'
            ? editInternetPost(store, { postId: body.postId, actorId: body.actor?.id, content: body.content, owner: body.owner === true })
            : deleteInternetPost(store, { postId: body.postId, actorId: body.actor?.id, owner: body.owner === true });
          await saveInternetStore(store);
          return json(response, 200, { post: result });
        }

        if (body.action === 'report') {
          const report = createInternetReport(store, { postId: body.postId, actor: body.actor, reason: body.reason });
          await saveInternetStore(store);
          return json(response, 201, { report });
        }

        if (body.action === 'warnings') {
          const warnings = takeUnreadInternetWarnings(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { warnings });
        }

        if (body.action === 'messages') {
          const messages = takeInternetMessages(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { messages });
        }

        if (body.action === 'conversation') {
          const messages = takeInternetConversation(store, { actor: body.actor, withUserId: body.withUserId });
          await saveInternetStore(store);
          return json(response, 200, { messages });
        }

        if (body.action === 'notifications') {
          const result = takeInternetNotifications(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'social') {
          const social = updateInternetSocial(store, body);
          await saveInternetStore(store);
          return json(response, 200, { social });
        }

        if (body.action === 'post-interaction') {
          const result = interactInternetPost(store, body);
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'poll-vote') {
          const post = voteInternetPoll(store, body);
          await saveInternetStore(store);
          return json(response, 200, { post });
        }

        if (body.action === 'social-status') {
          const social = socialSnapshot(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { social });
        }

        if (body.action === 'preferences') {
          const preferences = internetPreferences(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { preferences });
        }

        if (body.action === 'preference-save') {
          const preferences = updateInternetPreference(store, body);
          await saveInternetStore(store);
          return json(response, 200, { preferences });
        }

        if (body.action === 'message-send') {
          const result = sendInternetMessage(store, body);
          await saveInternetStore(store);
          return json(response, 201, result);
        }

        if (body.action === 'report-review') {
          const reviewerId = String(body.actor?.id || '');
          const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
            || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
          const reviewer = guild ? await guild.members.fetch(reviewerId).catch(() => null) : null;
          const reviewerRank = getHighestStaffRank(reviewer);
          const reviewerAllowed = config.ownerDiscordIds.includes(reviewerId)
            || reviewerRank?.owner === true
            || Boolean(reviewer && config.ownerRoleIds.some((roleId) => reviewer.roles.cache.has(roleId)));
          if (!reviewerAllowed) return json(response, 403, { error: 'Owner access required' });
          const report = reviewInternetReport(store, body);
          await saveInternetStore(store);
          return json(response, 200, { report });
        }

        if (body.action === 'moderation') {
          if (!body.owner) return json(response, 403, { error: 'Owner access required' });
          const cleared = clearExpiredInternetBans(store);
          if (cleared) await saveInternetStore(store);
          return json(response, 200, moderationSnapshot(store));
        }

        if (!body.owner || !['verify', 'ban'].includes(body.action)) {
          return json(response, 403, { error: 'Owner access required' });
        }

        const targetId = String(body.targetId || '').trim();
        if (!/^\d{16,22}$/.test(targetId)) return json(response, 400, { error: 'Enter a valid Discord user ID' });
        const target = upsertInternetUser(store, { id: targetId });
        if (body.action === 'verify') target.verified = body.enabled === true;
        if (body.action === 'ban') setInternetBan(target, body);
        await saveInternetStore(store);
        return json(response, 200, { user: target });
      } catch (error) {
        return json(response, 400, { error: error.message || 'Could not update Clearwater Internet' });
      }
    }

    if (url.pathname === '/api/config') {
      try {
        if (request.method === 'GET') {
          const [settings, guilds] = await Promise.all([getOwnerConfig(), buildDiscordCatalog(client)]);
          return json(response, 200, { settings, guilds });
        }
        if (request.method === 'PUT') {
          const settings = await saveOwnerConfig(await readJson(request));
          logger.info('Owner panel configuration updated.');
          return json(response, 200, { ok: true, settings });
        }
        return json(response, 405, { error: 'Method not allowed' });
      } catch (error) {
        logger.error('Owner configuration request failed', error);
        return json(response, 400, { error: 'Could not update configuration' });
      }
    }

    if (request.method !== 'GET' || url.pathname !== '/api/status') {
      return json(response, 405, { error: 'Method not allowed' });
    }

    try {
      const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
        || await client.guilds.fetch(CLEARWATER_GUILD_ID);
      return json(response, 200, {
        online: client.isReady(),
        bot: {
          id: client.user?.id || null,
          username: client.user?.username || 'Clearwater',
          latencyMs: Math.max(0, Math.round(client.ws.ping || 0)),
          uptimeSeconds: Math.floor((client.uptime || 0) / 1000),
        },
        guild: {
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
        },
        updatedAt: new Date().toISOString(),
        erlc: client.erlcStatus || { online: false },
      });
    } catch (error) {
      logger.error('Could not build status response', error);
      return json(response, 503, { online: false, error: 'Status unavailable' });
    }
  });

  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Website status connection listening on port ${config.port}.`);
    if (!config.apiKey) logger.warn('BOT_API_KEY is empty; protected website status is disabled.');
  });

  // Timed bans expire even when the website is not currently open.
  const banCleanup = setInterval(() => { void expireInternetBans(); }, 60 * 1000);
  banCleanup.unref();
  server.on('close', () => clearInterval(banCleanup));
  void expireInternetBans();

  return server;
}
