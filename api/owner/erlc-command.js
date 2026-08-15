import {
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
  sessionCookieValue,
} from '../../lib/discord-auth.js';
import { hasServerManagementAccess } from '../../lib/owner-access.js';
import { runErlcModeration, runErlcRawCommand } from '../../utils/erlc.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16384) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function isAllowedOwnerRequest(request) {
  if (isSameSiteRequest(request)) return true;
  const host = request.headers.host;
  const referer = request.headers.referer || request.headers.referrer;
  if (!host || !referer) return false;
  try {
    return new URL(referer).host === host;
  } catch {
    return false;
  }
}

function actorFromSession(session) {
  return {
    actorDiscordId: session.id || session.userId || session.user?.id || '',
    actorTag: session.username || session.globalName || session.user?.username || '',
  };
}

async function runViaBot(body, session) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return null;

  const actor = actorFromSession(session);
  const botResponse = await fetch(`${apiUrl}/api/erlc-command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: body.action,
      reason: body.reason,
      command: body.command,
      players: Array.isArray(body.players) ? body.players : [],
      ...actor,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const result = await botResponse.json().catch(() => ({}));
  return { status: botResponse.status, result };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!isAllowedOwnerRequest(request)) return sendJson(response, 403, { error: 'Invalid request origin' });

  try {
    const { sessionSecret } = getAuthConfig();
    const session = readSessionToken(sessionCookieValue(parseCookies(request.headers.cookie)), sessionSecret);
    if (!session) return sendJson(response, 401, { error: 'Sign in with Discord first' });
    if (!await hasServerManagementAccess(session)) return sendJson(response, 403, { error: 'Management access required' });

    const body = await readBody(request);
    const serverKey = process.env.ERLC_SERVER_KEY?.trim();

    // Prefer running commands directly from Vercel so load/kick/jail/ban/raw
    // work even when the Discord bot host has not been restarted yet.
    if (serverKey) {
      try {
        if (body.action === 'command' || (!body.action && body.command)) {
          const result = await runErlcRawCommand({
            serverKey,
            command: body.command,
          });
          return sendJson(response, 200, result);
        }
        const result = await runErlcModeration({
          serverKey,
          action: body.action,
          players: body.players,
          reason: body.reason,
        });
        return sendJson(response, result.ok ? 200 : 207, result);
      } catch (error) {
        return sendJson(response, 400, {
          error: error?.message || 'Could not run the in-game command',
        });
      }
    }

    const bot = await runViaBot(body, session);
    if (!bot) {
      return sendJson(response, 503, {
        error: 'ER:LC is not configured. Set ERLC_SERVER_KEY on Vercel or connect the bot host.',
      });
    }
    if (bot.status >= 400) {
      return sendJson(response, bot.status < 600 ? bot.status : 502, {
        error: bot.result?.error || 'Could not run the in-game command',
        ...bot.result,
      });
    }
    return sendJson(response, bot.status === 207 ? 207 : 200, bot.result);
  } catch (error) {
    return sendJson(response, 502, {
      error: error?.message || 'Could not run the in-game command',
    });
  }
}
