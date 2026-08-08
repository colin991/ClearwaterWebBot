import { SESSION_COOKIE, avatarUrl, getAuthConfig, parseCookies, readSessionToken, sendJson } from '../lib/discord-auth.js';
import { getStaffAccess } from '../lib/owner-access.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 2_100_000) throw new Error('Request body too large');
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
        gif: body.gif && typeof body.gif === 'object' ? { url: String(body.gif.url || '').slice(0, 500), title: String(body.gif.title || '').slice(0, 120) } : null,
        image: body.image && typeof body.image === 'object' ? { dataUrl: String(body.image.dataUrl || '').slice(0, 2_100_000) } : null,
        poll: body.poll && typeof body.poll === 'object' ? { question: String(body.poll.question || '').slice(0, 180), options: Array.isArray(body.poll.options) ? body.poll.options.map((option) => String(option).slice(0, 80)).slice(0, 4) : [], durationDays: Math.min(30, Math.max(1, Number(body.poll.durationDays) || 1)) } : null,
        actor: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: avatarUrl(user),
          staffRank: access.staffRank,
        },
      };
    } else if (body.action === 'status') {
      payload = {
        action: 'status',
        actor: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: avatarUrl(user),
          staffRank: access.staffRank,
        },
      };
    } else if (['edit', 'delete'].includes(body.action)) {
      payload = {
        action: body.action,
        postId: String(body.postId || ''),
        content: String(body.content || '').slice(0, 500),
        actor: { id: user.id },
        owner: access.allowed,
      };
    } else if (body.action === 'report') {
      payload = {
        action: 'report',
        postId: String(body.postId || ''),
        reason: String(body.reason || '').slice(0, 300),
        actor: { id: user.id, displayName: user.displayName },
      };
    } else if (body.action === 'warnings') {
      payload = { action: 'warnings', actor: { id: user.id, displayName: user.displayName } };
    } else if (body.action === 'messages') {
      payload = { action: 'messages', actor: { id: user.id, displayName: user.displayName } };
    } else if (body.action === 'social-status') {
      payload = { action: 'social-status', actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'preferences') {
      payload = { action: 'preferences', actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'preference-save') {
      payload = { action: 'preference-save', key: String(body.key || ''), enabled: body.enabled === true, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'social') {
      payload = { action: 'social', type: String(body.type || ''), enabled: body.enabled === true, targetId: String(body.targetId || ''), postId: String(body.postId || ''), actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'post-interaction') {
      payload = { action: 'post-interaction', type: String(body.type || ''), postId: String(body.postId || ''), content: String(body.content || '').slice(0, 500), quote: body.quote === true, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'poll-vote') {
      payload = { action: 'poll-vote', postId: String(body.postId || ''), optionIndex: Number(body.optionIndex), remove: body.remove === true, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'message-send') {
      payload = { action: 'message-send', to: String(body.to || ''), content: String(body.content || '').slice(0, 1000), actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'report-review') {
      if (!access.allowed) return sendJson(response, 403, { error: 'Ownership access required' });
      payload = {
        action: 'report-review',
        reportId: String(body.reportId || ''),
        decision: body.decision === 'deny' ? 'deny' : 'accept',
        action: String(body.moderationAction || ''),
        reason: String(body.reason || '').slice(0, 300),
        durationDays: body.durationDays === 'forever' ? 'forever' : Number(body.durationDays),
        actor: { id: user.id },
        owner: true,
      };
    } else if (body.action === 'moderation') {
      if (!access.allowed) return sendJson(response, 403, { error: 'Ownership access required' });
      payload = { action: 'moderation', owner: true };
    } else if (['verify', 'ban'].includes(body.action)) {
      if (!access.allowed) return sendJson(response, 403, { error: 'Ownership access required' });
      payload = {
        action: body.action,
        targetId: String(body.targetId || ''),
        enabled: body.enabled === true,
        reason: String(body.reason || '').slice(0, 300),
        durationDays: body.durationDays === 'forever' ? 'forever' : Number(body.durationDays),
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
