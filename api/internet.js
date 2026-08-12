import { SESSION_COOKIE, avatarUrl, getAuthConfig, isSameSiteRequest, parseCookies, readSessionToken, sendJson } from '../lib/discord-auth.js';
import { getStaffAccess } from '../lib/owner-access.js';
import { hashClientIp, isPublicUserId, redactPublicPayload, resolvePublicIds, serveProxiedMedia } from '../lib/privacy.js';

const OFFICIAL_INTERNET_ACCOUNT_ID = '1514026810348671026';
const INTERNET_VERSION = '20260811-dm';

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

function compatibleGiphyUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (!/^(?:media\d*|i)\.giphy\.com$/i.test(url.hostname)) return '';
    // Older bot hosts only allow media.giphy.com, while GIPHY now returns media0/media1/etc.
    if (/^media\d+\.giphy\.com$/i.test(url.hostname)) url.hostname = 'media.giphy.com';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function safeImageDataUrl(value) {
  const dataUrl = String(value || '').replace(/\s+/g, '');
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+=*$/i.test(dataUrl) ? dataUrl : '';
}

function safeHttpsUrl(value) {
  const candidate = String(value || '').trim().slice(0, 500);
  if (/^assets\/[a-z0-9._-]+$/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || /["'()\\\s]/.test(candidate)) return '';
    return url.href;
  } catch {
    return '';
  }
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
  if (request.method === 'POST' && !isSameSiteRequest(request)) {
    return sendJson(response, 403, { error: 'Invalid request origin' });
  }

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
      if (url.searchParams.get('t')) return serveProxiedMedia(request, response);
      if (url.searchParams.get('meta') === 'version' || url.pathname.endsWith('/internet-version')) {
        return sendJson(response, 200, { version: INTERNET_VERSION });
      }
      const result = await callBot(request);
      return sendJson(response, result.ok ? 200 : result.status, redactPublicPayload(result.body));
    }

    const { sessionSecret } = getAuthConfig();
    const user = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!user) return sendJson(response, 401, { error: 'Sign in with Discord to post' });

    const body = await readBody(request);
    // Access checks call the bot service. A normal ban-status check does not
    // need ownership data, so skip that extra round trip and show a ban screen
    // as quickly as possible.
    const access = await getStaffAccess(user);
    const asOfficial = access.allowed && body.asOfficial === true;
    let payload;
    if (body.action === 'post') {
      payload = {
        action: 'post',
        content: String(body.content || '').slice(0, 500),
        gif: body.gif && typeof body.gif === 'object' ? { url: compatibleGiphyUrl(body.gif.url), title: String(body.gif.title || '').slice(0, 120) } : null,
        image: body.image && typeof body.image === 'object' ? { dataUrl: safeImageDataUrl(body.image.dataUrl).slice(0, 2_100_000) } : null,
        poll: body.poll && typeof body.poll === 'object' ? { question: String(body.poll.question || '').slice(0, 180), options: Array.isArray(body.poll.options) ? body.poll.options.map((option) => String(option).slice(0, 80)).slice(0, 4) : [], durationDays: Math.min(30, Math.max(1, Number(body.poll.durationDays) || 1)) } : null,
        asOfficial,
        owner: access.allowed,
        actor: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: avatarUrl(user),
          staffRank: access.staffRank,
          badges: access.badges,
        },
      };
    } else if (body.action === 'official-profile-save') {
      if (!access.allowed) return sendJson(response, 403, { error: 'Ownership access required' });
      payload = {
        action: 'official-profile-save',
        owner: true,
        profile: {
          displayName: String(body.profile?.displayName || '').slice(0, 80),
          username: String(body.profile?.username || '').slice(0, 40),
          bio: String(body.profile?.bio || '').slice(0, 300),
          avatarUrl: safeHttpsUrl(body.profile?.avatarUrl),
          bannerUrl: safeHttpsUrl(body.profile?.bannerUrl),
        },
        actor: { id: user.id },
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
          badges: access.badges,
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
      payload = { action: 'messages', asOfficial, owner: access.allowed, actor: { id: user.id, displayName: user.displayName } };
    } else if (body.action === 'conversation') {
      payload = { action: 'conversation', withUserId: String(body.withUserId || ''), username: String(body.username || '').slice(0, 80), asOfficial, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'notifications') {
      payload = { action: 'notifications', asOfficial, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'social-status') {
      payload = { action: 'social-status', asOfficial, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'preferences') {
      payload = { action: 'preferences', actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'preference-save') {
      payload = { action: 'preference-save', key: String(body.key || ''), enabled: body.enabled === true, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'social') {
      payload = { action: 'social', type: String(body.type || ''), enabled: body.enabled === true, targetId: String(body.targetId || ''), postId: String(body.postId || ''), asOfficial, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'post-interaction') {
      payload = { action: 'post-interaction', type: String(body.type || ''), postId: String(body.postId || ''), content: String(body.content || '').slice(0, 500), quote: body.quote === true, asOfficial, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'poll-vote') {
      payload = { action: 'poll-vote', postId: String(body.postId || ''), optionIndex: Number(body.optionIndex), remove: body.remove === true, asOfficial, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'message-send') {
      payload = { action: 'message-send', to: String(body.to || ''), username: String(body.username || '').slice(0, 80), content: String(body.content || '').slice(0, 1000), gif: body.gif && typeof body.gif === 'object' ? { url: compatibleGiphyUrl(body.gif.url), title: String(body.gif.title || '').slice(0, 120) } : null, asOfficial, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank } };
    } else if (body.action === 'report-review') {
      if (!access.allowed) return sendJson(response, 403, { error: 'Ownership access required' });
      payload = {
        action: 'report-review',
        reportId: String(body.reportId || ''),
        decision: body.decision === 'deny' ? 'deny' : 'accept',
        moderationAction: String(body.moderationAction || ''),
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
        ipBan: body.ipBan === true,
        owner: true,
      };
    } else {
      return sendJson(response, 400, { error: 'Unsupported action' });
    }

    if (['withUserId', 'targetId', 'to'].some((key) => isPublicUserId(payload[key]))) {
      const lookup = await callBot({ method: 'GET' });
      payload = await resolvePublicIds(payload, lookup.body?.users || []);
      if (['withUserId', 'targetId', 'to'].some((key) => isPublicUserId(payload[key])) && !payload.username) {
        return sendJson(response, 404, { error: 'That member has not joined Clearwater Internet yet' });
      }
    }
    const ipHashes = hashClientIp(request);
    if (ipHashes.hash) payload.ipHash = ipHashes.hash;
    if (ipHashes.legacy && ipHashes.legacy !== ipHashes.hash) payload.ipHashLegacy = ipHashes.legacy;
    const result = await callBot(request, payload);
    // Older bot hosts do not understand asOfficial and would silently create a
    // normal-account post. Remove that post and give a useful update message.
    if (body.action === 'post' && asOfficial && result.ok && result.body?.post?.authorId !== OFFICIAL_INTERNET_ACCOUNT_ID) {
      await callBot(request, { action: 'delete', postId: result.body.post?.id, actor: { id: user.id }, owner: true });
      return sendJson(response, 409, { error: 'The bot host needs the latest GitHub files and a restart before the Clearwater Roleplay account can post.' });
    }
    return sendJson(response, result.ok ? (result.status === 201 ? 201 : 200) : result.status, redactPublicPayload(result.body));
  } catch {
    return sendJson(response, 502, { error: 'Clearwater Internet is temporarily unavailable' });
  }
}
