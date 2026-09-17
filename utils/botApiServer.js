import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { postPcsoSiteForm } from './pcsoSiteFormDiscord.js';
import { savePcsoSiteForm } from './pcsoSiteForms.js';
import { handlePcsoPortal } from './pcsoSitePortal.js';

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function authorized(request, apiKey) {
  const header = String(request.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!apiKey || !token) return false;
  const left = Buffer.from(token);
  const right = Buffer.from(apiKey);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBinaryBody(request, maxBytes = 96_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Tiny bot-host HTTP surface so the website can reach portal/forms via BOT_API_URL.
 * Listens on SERVER_PORT / PORT when configured.
 */
export function startBotApiServer(client, {
  port = Number(process.env.SERVER_PORT || process.env.PORT || 0),
  apiKey = process.env.BOT_API_KEY || '',
} = {}) {
  const listenPort = Number(port);
  if (!Number.isInteger(listenPort) || listenPort <= 0) {
    logger.info('Bot API server skipped (no SERVER_PORT/PORT). Website bridge stays offline.');
    return () => {};
  }
  if (!apiKey) {
    logger.warn('Bot API server skipped (BOT_API_KEY missing).');
    return () => {};
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://127.0.0.1:${listenPort}`);
      if (!authorized(request, apiKey)) {
        return sendJson(response, 401, { error: 'Unauthorized' });
      }

      if (request.method === 'GET' && url.pathname === '/api/status') {
        return sendJson(response, 200, {
          online: Boolean(client?.isReady?.()),
          updatedAt: new Date().toISOString(),
          guild: {
            memberCount: client?.guilds?.cache?.first()?.memberCount ?? null,
          },
          bot: {
            latencyMs: Math.round(client?.ws?.ping || 0),
          },
          melonlyConfigured: Boolean(process.env.MELONLY_API_KEY?.trim()),
        });
      }

      if (request.method === 'POST' && url.pathname === '/api/pcso/site-form') {
        const raw = await readBinaryBody(request, 80_000);
        let record;
        try {
          record = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        if (!record?.kind) return sendJson(response, 400, { error: 'Unknown form.' });
        const saved = await savePcsoSiteForm(record);
        const result = await postPcsoSiteForm(client, saved);
        return sendJson(response, 200, { ok: true, id: saved.id, ...result });
      }

      if (request.method === 'POST' && url.pathname === '/api/pcso/portal') {
        const raw = await readBinaryBody(request, 80_000);
        let payload;
        try {
          payload = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        try {
          const result = await handlePcsoPortal(client, payload);
          return sendJson(response, 200, result);
        } catch (error) {
          const status = error?.status || 400;
          return sendJson(response, status, { error: error?.message || 'Portal request failed.' });
        }
      }

      return sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      logger.error('Bot API server request failed', error);
      return sendJson(response, 500, { error: error?.message || 'Server error' });
    }
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      logger.warn(`Bot API server port ${listenPort} is already in use; website bridge HTTP endpoint not bound.`);
      return;
    }
    logger.error('Bot API server error', error);
  });

  server.listen(listenPort, '0.0.0.0', () => {
    logger.info(`Bot API server listening on :${listenPort} (portal + site forms + status).`);
  });

  return () => {
    try { server.close(); } catch { /* ignore */ }
  };
}
