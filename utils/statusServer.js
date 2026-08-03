import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';

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

    if (!['/api/status', '/api/actions'].includes(url.pathname)) {
      return json(response, 404, { error: 'Not found' });
    }

    if (!config.apiKey) {
      return json(response, 503, { error: 'Status connection is not configured' });
    }

    const authorization = request.headers.authorization || '';
    if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), config.apiKey)) {
      return json(response, 401, { error: 'Unauthorized' });
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

    if (request.method !== 'GET' || url.pathname !== '/api/status') {
      return json(response, 405, { error: 'Method not allowed' });
    }

    try {
      const guild = client.guilds.cache.get(config.guildId) || await client.guilds.fetch(config.guildId);
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
