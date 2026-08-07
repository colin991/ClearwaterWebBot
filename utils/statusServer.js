import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { buildDiscordCatalog, getOwnerConfig, saveOwnerConfig } from './ownerConfig.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank } from './staffRanks.js';
import { createInternetPost, getActiveBan, publicPosts, publicUsers, readInternetStore, saveInternetStore, setInternetBan, upsertInternetUser } from './internetStore.js';

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
    if (raw.length > 4096) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
};

export function startStatusServer(client, config) {
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
      return json(response, 200, { allowed, staffRank: staffRank?.name || null });
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
        if (request.method === 'GET') return json(response, 200, { posts: publicPosts(store), users: publicUsers(store) });
        if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });

        const body = await readJson(request);
        if (body.action === 'post') {
          const user = upsertInternetUser(store, body.actor);
          const post = createInternetPost(store, user, body.content);
          await saveInternetStore(store);
          return json(response, 201, { post });
        }

        if (body.action === 'status') {
          const user = upsertInternetUser(store, body.actor);
          const ban = getActiveBan(user);
          await saveInternetStore(store);
          return json(response, 200, { banned: Boolean(ban), ban });
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

  return server;
}
