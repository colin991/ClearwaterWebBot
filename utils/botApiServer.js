import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { formatTalkDuration, getRadioTalkLogs } from './pcsoRadioTalkLogs.js';
import { getDispatchRadioMonitorStatus } from './dispatchRadioTalkMonitor.js';
import { writeDispatchWebTalk, stopDispatchWebTalk } from './dispatchWebTalk.js';
import { readDispatchAudio } from './dispatchLiveAudio.js';
import { DISPATCH_VOICE_CHANNEL_ID } from './dispatchChannelStatus.js';
import { noteWebListener, noteWebTalk } from './dispatchActivityLog.js';
import { postPcsoSiteForm } from './pcsoSiteFormDiscord.js';

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
 * Tiny bot-host HTTP surface so the website can read radio talk logs and Melonly
 * active calls via BOT_API_URL. Listens on SERVER_PORT / PORT when configured.
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
          radioMonitor: getDispatchRadioMonitorStatus(),
          melonlyConfigured: Boolean(process.env.MELONLY_API_KEY?.trim()),
        });
      }

      if (request.method === 'GET' && url.pathname === '/api/pcso/radio-audio') {
        noteWebListener(client, {
          id: request.headers['x-admin-id'],
          displayName: request.headers['x-admin-name'],
          username: request.headers['x-admin-username'],
        });
        const status = getDispatchRadioMonitorStatus();
        const ready = !status.paused && !status.stopping
          && status.connectionStatus === 'ready' && status.channelId === DISPATCH_VOICE_CHANNEL_ID;
        return sendJson(response, 200, readDispatchAudio(url.searchParams.get('cursor'), url.searchParams.get('epoch'), ready));
      }

      if (request.method === 'POST' && url.pathname === '/api/pcso/radio-talk') {
        const action = String(request.headers['x-talk-action'] || 'audio').toLowerCase();
        const actor = {
          id: request.headers['x-admin-id'],
          displayName: request.headers['x-admin-name'],
          username: request.headers['x-admin-username'],
        };
        if (action === 'stop') {
          noteWebTalk(client, actor, 'stop');
          stopDispatchWebTalk();
          return sendJson(response, 200, { ok: true, talking: false });
        }
        const body = await readBinaryBody(request);
        if (!body.length) return sendJson(response, 400, { error: 'Audio data is required.' });
        noteWebTalk(client, actor, 'audio');
        const result = writeDispatchWebTalk(body);
        return sendJson(response, result.ok ? 200 : 409, result);
      }

      if (request.method === 'POST' && url.pathname === '/api/pcso/site-form') {
        const raw = await readBinaryBody(request, 80_000);
        let record;
        try {
          record = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        const result = await postPcsoSiteForm(client, record);
        return sendJson(response, 200, { ok: true, ...result });
      }

      if (request.method === 'GET' && url.pathname === '/api/pcso/radio-logs') {
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
        const store = await getRadioTalkLogs();
        const entries = store.entries.slice(0, limit).map((entry) => ({
          ...entry,
          durationLabel: formatTalkDuration(entry.durationMs),
        }));
        return sendJson(response, 200, {
          ok: true,
          updatedAt: store.updatedAt,
          radioMonitor: getDispatchRadioMonitorStatus(),
          entries,
        });
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
    logger.info(`Bot API server listening on :${listenPort} (radio logs + active calls + status).`);
  });

  return () => {
    try { server.close(); } catch { /* ignore */ }
  };
}
