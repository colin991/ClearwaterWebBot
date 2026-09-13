import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { formatTalkDuration, getRadioTalkLogs } from './pcsoRadioTalkLogs.js';
import { getDispatchRadioMonitorStatus } from './dispatchRadioTalkMonitor.js';
import { fetchPcsoAssignedMelonlyCalls } from './melonly.js';

/** Pinellas County Sheriff's Office Melonly department id. */
const PINELLAS_MELONLY_DEPARTMENT_ID = '7470323914464301056';

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

      if (request.method === 'GET' && url.pathname === '/api/pcso/active-calls') {
        const melonlyApiKey = process.env.MELONLY_API_KEY?.trim() || '';
        if (!melonlyApiKey) {
          return sendJson(response, 503, {
            configured: false,
            calls: [],
            error: 'Melonly is not configured.',
            message: 'Set MELONLY_API_KEY on the bot host to enable active calls.',
          });
        }
        try {
          const result = await fetchPcsoAssignedMelonlyCalls(melonlyApiKey, {
            pinellasDepartmentId: PINELLAS_MELONLY_DEPARTMENT_ID,
          });
          return sendJson(response, 200, {
            configured: true,
            updatedAt: new Date().toISOString(),
            calls: result.calls,
            message: result.calls.length
              ? undefined
              : 'No active Melonly calls currently have a PCSO unit assigned.',
          });
        } catch (error) {
          const status = error?.status === 429 ? 429 : 502;
          return sendJson(response, status, {
            configured: true,
            calls: [],
            error: error?.message || 'Melonly CAD calls could not be loaded.',
            message: 'Active calls could not be loaded from Melonly right now.',
          });
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
    logger.info(`Bot API server listening on :${listenPort} (radio logs + active calls + status).`);
  });

  return () => {
    try { server.close(); } catch { /* ignore */ }
  };
}
