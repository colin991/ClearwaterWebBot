import { SESSION_COOKIE, avatarUrl, getAuthConfig, parseCookies, readSessionToken, sendJson } from '../lib/discord-auth.js';
import { getStaffAccess } from '../lib/owner-access.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

async function callBot(request, payload) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return { ok: false, status: 503, body: { error: 'Clearwater Internet is not configured yet' } };

  const upstream = await fetch(`${apiUrl}/api/internet`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      status: 502,
      body: { error: 'Clearwater Internet could not reach the bot service. Restart the bot and check BOT_API_URL.' },
    };
  }

  const body = await upstream.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      status: 502,
      body: { error: 'Clearwater Internet received an invalid response from the bot service.' },
    };
  }
  return { ok: upstream.ok, status: upstream.status, body };
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    if (request.method === 'GET') {
      const result = await callBot(request);
      return sendJson(response, result.ok ? 200 : result.status, result.body);
    }

    const { sessionSecret } = getAuthConfig();
    const user = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!user) return sendJson(response, 401, { error: 'Sign in with Discord to post' });

    const body = await readBody(request);
    const access = await getStaffAccess(user);
    let payload;
    if (body.action === 'post') {
      payload = {
        action: 'post',
        content: String(body.content || '').slice(0, 500),
        actor: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: avatarUrl(user),
          staffRank: access.staffRank,
        },
      };
    } else if (['verify', 'ban'].includes(body.action)) {
      if (!access.allowed) return sendJson(response, 403, { error: 'Ownership access required' });
      payload = {
        action: body.action,
        targetId: String(body.targetId || ''),
        enabled: body.enabled === true,
        owner: true,
      };
    } else {
      return sendJson(response, 400, { error: 'Unsupported action' });
    }

    const result = await callBot(request, payload);
    return sendJson(response, result.ok ? (result.status === 201 ? 201 : 200) : result.status, result.body);
  } catch {
    return sendJson(response, 502, { error: 'Clearwater Internet is temporarily unavailable' });
  }
}
