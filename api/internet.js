import { handleUpload } from '@vercel/blob/client';
import { SESSION_COOKIE, avatarUrl, getAuthConfig, isSameSiteRequest, parseCookies, readSessionToken, sendJson } from '../lib/discord-auth.js';
import { getStaffAccess } from '../lib/owner-access.js';
import { hashClientIp, isPublicUserId, redactPublicPayload, redactStaffPayload, resolvePublicIds, serveProxiedMedia } from '../lib/privacy.js';
import {
  assertStaffPinUnlocked,
  clearStaffPinUnlockCookie,
  createStaffPinUnlockToken,
  pinsConfigured,
  readStaffPinUnlock,
  staffPinUnlockCookie,
  verifyStaffPin,
} from '../lib/staff-pin.js';

const OFFICIAL_INTERNET_ACCOUNT_ID = '1514026810348671026';
const INTERNET_VERSION = '20260815-core-tabs';
const MAX_INTERNET_BODY = 4_400_000;
const MAX_MEDIA_DATA_URL = 4_200_000;
const MAX_REEL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_REEL_AUDIO_BYTES = 40 * 1024 * 1024;
const MAX_PROFILE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REEL_SLIDES = 10;
const STAFF_PIN_ACTIONS = new Set([
  'moderation',
  'staff-user-detail',
  'staff-user-search',
  'staff-user',
  'staff-wallet',
  'staff-site',
  'report-review',
  'history-revert',
  'verify',
  'ban',
  'verify-review',
  'business-review',
  'ad-review',
  'ad-manage',
]);
const STAFF_PIN_FULL_ACTIONS = new Set(['staff-wallet', 'staff-site', 'verify', 'ban']);

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > MAX_INTERNET_BODY) throw new Error('Request body too large');
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

function safeVideoDataUrl(value) {
  const dataUrl = String(value || '').replace(/\s+/g, '');
  return /^data:video\/(?:mp4|webm|quicktime);base64,[a-z0-9+/]+=*$/i.test(dataUrl) ? dataUrl : '';
}

function safeAudioDataUrl(value) {
  const dataUrl = String(value || '').replace(/\s+/g, '');
  return /^data:audio\/(?:mpeg|mp3|mp4|wav|ogg|webm|aac|x-m4a);base64,[a-z0-9+/]+=*$/i.test(dataUrl) ? dataUrl : '';
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

function safeBlobMediaUrl(value) {
  const href = safeHttpsUrl(value);
  try {
    return href && /(^|\.)blob\.vercel-storage\.com$/i.test(new URL(href).hostname) ? href : '';
  } catch {
    return '';
  }
}

function mediaPayload(raw, kind) {
  if (!raw || typeof raw !== 'object') return null;
  const hosted = safeBlobMediaUrl(raw.url);
  if (hosted) return { url: hosted };
  const dataUrl = kind === 'video'
    ? safeVideoDataUrl(raw.dataUrl)
    : (kind === 'audio' ? safeAudioDataUrl(raw.dataUrl) : safeImageDataUrl(raw.dataUrl));
  return dataUrl ? { dataUrl: dataUrl.slice(0, MAX_MEDIA_DATA_URL) } : null;
}

function mediaListPayload(raw, kind, limit = MAX_REEL_SLIDES) {
  if (!Array.isArray(raw)) return null;
  const items = raw
    .map((item) => mediaPayload(item, kind))
    .filter(Boolean)
    .slice(0, limit);
  return items.length ? items : null;
}

function staffActor(user, access = {}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: avatarUrl(user),
    staffRank: access.staffRank || null,
    badges: access.badges || [],
  };
}

function memberActor(user, access = {}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: avatarUrl(user),
    staffRank: access.staffRank || null,
    badges: access.badges || [],
  };
}

async function serveReelViaBot(request, response, url) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'Clearwater Internet is not configured yet' });
  const kind = String(url.searchParams.get('kind') || 'video').toLowerCase();
  const streamDirect = kind === 'video' || kind === 'audio';
  const upstreamHeaders = { Authorization: `Bearer ${apiKey}` };
  if (request.headers.range) upstreamHeaders.Range = request.headers.range;
  const upstream = await fetch(`${apiUrl}/api/internet?${url.searchParams.toString()}`, {
    headers: upstreamHeaders,
    signal: AbortSignal.timeout(20000),
    redirect: 'manual',
  });
  const locationHeader = upstream.headers.get('location');
  if (upstream.status >= 300 && upstream.status < 400 && locationHeader) {
    let location = locationHeader;
    try {
      location = new URL(locationHeader, apiUrl).href;
    } catch {
      location = locationHeader;
    }
    // Video/audio: send the browser straight to blob storage so Range requests work.
    // Photos still proxy (same-origin) to avoid intermittent CSP/load flakes.
    if (streamDirect) {
      response.statusCode = 302;
      response.setHeader('Location', location);
      response.setHeader('Cache-Control', 'private, max-age=60');
      return response.end();
    }
    try {
      const media = await fetch(location, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
        headers: { Accept: 'image/*,video/*,audio/*,*/*;q=0.8' },
      });
      if (!media.ok) {
        response.statusCode = 404;
        return response.end();
      }
      const buffer = Buffer.from(await media.arrayBuffer());
      // Stay under Vercel serverless response limits; larger media redirects to blob.
      if (buffer.length > 3_500_000) {
        response.statusCode = 302;
        response.setHeader('Location', location);
        return response.end();
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', media.headers.get('content-type') || 'application/octet-stream');
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Cache-Control', 'private, max-age=3600');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Length', buffer.length);
      return response.end(buffer);
    } catch {
      response.statusCode = 502;
      return response.end();
    }
  }
  if (!upstream.ok && upstream.status !== 206) {
    response.statusCode = upstream.status === 404 ? 404 : 502;
    return response.end();
  }
  const buffer = Buffer.from(await upstream.arrayBuffer());
  response.statusCode = upstream.status === 206 ? 206 : 200;
  response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'private, max-age=3600');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Length', buffer.length);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) response.setHeader('Content-Range', contentRange);
  response.end(buffer);
}

async function callBot(request, payload, viewerId = '', ipHashes = null) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return { ok: false, status: 503, body: { error: 'Clearwater Internet is not configured yet' } };

  // Privacy settings are applied per viewer, so the feed request has to say who
  // is reading it. IP hashes let the bot enforce network bans on GET too.
  const params = new URLSearchParams();
  if (viewerId) params.set('viewer', viewerId);
  if (ipHashes?.hash) params.set('ipHash', ipHashes.hash);
  if (ipHashes?.legacy && ipHashes.legacy !== ipHashes.hash) params.set('ipHashLegacy', ipHashes.legacy);
  const query = params.toString() ? `?${params.toString()}` : '';
  const upstream = await fetch(`${apiUrl}/api/internet${query}`, {
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
      const url = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
      if (url.searchParams.get('t')) return serveProxiedMedia(request, response);
      if (url.searchParams.get('reel')) {
        const { sessionSecret } = getAuthConfig();
        const viewer = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
        if (!viewer) return sendJson(response, 401, { error: 'Sign in with Discord to use Clearwater Internet' });
        const reelAccess = await getStaffAccess(viewer);
        if (!reelAccess.siteAccess) return sendJson(response, 403, { error: 'Clearwater Internet access required' });
        return serveReelViaBot(request, response, url);
      }
      if (url.searchParams.get('meta') === 'version' || url.pathname.endsWith('/internet-version')) {
        return sendJson(response, 200, { version: INTERNET_VERSION });
      }
      const { sessionSecret } = getAuthConfig();
      const viewer = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
      if (!viewer) return sendJson(response, 401, { error: 'Sign in with Discord to use Clearwater Internet' });
      const liveAccess = await getStaffAccess(viewer);
      if (!liveAccess.siteAccess) {
        return sendJson(response, 403, { error: 'Clearwater Internet access required' });
      }
      const result = await callBot(request, undefined, viewer.id, hashClientIp(request));
      return sendJson(response, result.ok ? 200 : result.status, redactPublicPayload(result.body));
    }

    const body = await readBody(request);
    if (body?.type === 'blob.upload-completed') {
      // Vercel Blob verifies this callback cryptographically inside handleUpload.
      // Reject anything that is not a completed-upload event.
      try {
        const result = await handleUpload({
          body,
          request,
          onBeforeGenerateToken: async () => {
            throw new Error('Upload token generation is not allowed on this callback');
          },
          onUploadCompleted: async () => {},
        });
        return sendJson(response, 200, result);
      } catch {
        return sendJson(response, 400, { error: 'Invalid upload callback' });
      }
    }
    if (request.method === 'POST' && !isSameSiteRequest(request)) {
      return sendJson(response, 403, { error: 'Invalid request origin' });
    }

    const { sessionSecret } = getAuthConfig();
    const user = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!user) return sendJson(response, 401, { error: 'Sign in with Discord to post' });

    // Live Discord role check — session guildRoles alone are not authorization.
    const access = await getStaffAccess(user);
    if (!access.siteAccess) {
      return sendJson(response, 403, { error: 'Clearwater Internet access required' });
    }
    const staffPanel = access.panelAccess === 'full' || access.panelAccess === 'limited' ? access.panelAccess : null;
    const canStaff = Boolean(staffPanel);
    const asOfficial = access.allowed && body.asOfficial === true;
    const asBusinessId = !asOfficial && /^biz_[a-z0-9-]{8,80}$/i.test(String(body.asBusinessId || '').trim())
      ? String(body.asBusinessId).trim()
      : '';

    if (body.action === 'staff-pin-status') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      const unlock = readStaffPinUnlock(request, sessionSecret);
      const okForPanel = Boolean(
        unlock
        && String(unlock.id) === String(user.id)
        && (staffPanel === 'full' ? unlock.panel === 'full' : (unlock.panel === 'full' || unlock.panel === 'limited')),
      );
      return sendJson(response, 200, {
        configured: pinsConfigured(),
        unlocked: okForPanel,
        panel: staffPanel,
        gate: staffPanel === 'full' ? 'ownership' : 'management',
      });
    }

    if (body.action === 'staff-pin-unlock') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      const checked = verifyStaffPin(staffPanel, body.pin);
      if (!checked.ok) return sendJson(response, 403, { error: checked.error, code: 'STAFF_PIN_INVALID' });
      const token = createStaffPinUnlockToken({ userId: user.id, panel: checked.panel }, sessionSecret);
      return sendJson(response, 200, {
        unlocked: true,
        panel: checked.panel,
        gate: checked.panel === 'full' ? 'ownership' : 'management',
      }, [staffPinUnlockCookie(token)]);
    }

    if (body.action === 'staff-pin-lock') {
      return sendJson(response, 200, { unlocked: false }, [clearStaffPinUnlockCookie()]);
    }

    if (STAFF_PIN_ACTIONS.has(String(body.action || ''))) {
      try {
        assertStaffPinUnlocked(request, sessionSecret, {
          userId: user.id,
          requiredPanel: STAFF_PIN_FULL_ACTIONS.has(body.action) ? 'full' : 'limited',
        });
      } catch (error) {
        return sendJson(response, 403, {
          error: error.message || 'Enter your staff PIN to continue',
          code: error.code || 'STAFF_PIN_REQUIRED',
        });
      }
    }

    if (body?.type === 'blob.generate-client-token') {
      try {
        const result = await handleUpload({
          body,
          request,
          onBeforeGenerateToken: async (pathname) => {
            const path = String(pathname || '');
            if (/^profile\/[a-z0-9._-]+$/i.test(path)) {
              return {
                allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
                maximumSizeInBytes: MAX_PROFILE_IMAGE_BYTES,
                addRandomSuffix: true,
                allowOverwrite: false,
                tokenPayload: JSON.stringify({ id: user.id }),
              };
            }
            if (/^ads\/[a-z0-9._-]+$/i.test(path)) {
              return {
                allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'],
                maximumSizeInBytes: 40 * 1024 * 1024,
                addRandomSuffix: true,
                allowOverwrite: false,
                tokenPayload: JSON.stringify({ id: user.id }),
              };
            }
            if (!/^reels\/[a-z0-9._-]+$/i.test(path)) throw new Error('Invalid upload path');
            const isAudio = /\.(?:mp3|m4a|wav|ogg|aac)$/i.test(path) || /(^|\/|-)audio(-|\.|$)/i.test(path);
            return {
              allowedContentTypes: [
                'image/png', 'image/jpeg', 'image/webp', 'image/gif',
                'video/mp4', 'video/webm', 'video/quicktime',
                'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/x-m4a',
              ],
              maximumSizeInBytes: isAudio ? MAX_REEL_AUDIO_BYTES : MAX_REEL_BYTES,
              addRandomSuffix: true,
              allowOverwrite: false,
              tokenPayload: JSON.stringify({ id: user.id }),
            };
          },
          onUploadCompleted: async () => {},
        });
        return sendJson(response, 200, result);
      } catch (error) {
        const uploadError = String(error?.message || '');
        return sendJson(response, 503, {
          error: /suspended|quota|limit|billing|exceeded/i.test(uploadError)
            ? 'Vercel Blob is at this month’s storage limit, so video uploads are paused. Photo Reels under 3 MB still work. Upgrade Blob or wait for the next billing cycle.'
            : (/token/i.test(uploadError)
              ? 'Create a Blob store in Vercel Storage so Reels can upload videos.'
              : (uploadError || 'Could not start this Reel upload.')),
        });
      }
    }
    let payload;
    if (body.action === 'post') {
      payload = {
        action: 'post',
        content: String(body.content || '').slice(0, 500),
        gif: body.gif && typeof body.gif === 'object' ? { url: compatibleGiphyUrl(body.gif.url), title: String(body.gif.title || '').slice(0, 120) } : null,
        image: mediaPayload(body.image, 'image'),
        images: mediaListPayload(body.images, 'image'),
        audio: mediaPayload(body.audio, 'audio'),
        video: mediaPayload(body.video, 'video'),
        reel: body.reel === true,
        location: body.location && typeof body.location === 'object' ? body.location : null,
        quoteId: String(body.quoteId || '').slice(0, 80) || null,
        poll: body.poll && typeof body.poll === 'object' ? { question: String(body.poll.question || '').slice(0, 180), options: Array.isArray(body.poll.options) ? body.poll.options.map((option) => String(option).slice(0, 80)).slice(0, 4) : [], durationDays: Math.min(30, Math.max(1, Number(body.poll.durationDays) || 1)) } : null,
        asOfficial,
        asBusinessId,
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
    } else if (body.action === 'status' || body.action === 'presence') {
      payload = {
        action: body.action === 'presence' ? 'presence' : 'status',
        view: String(body.view || 'home').slice(0, 40),
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
        asBusinessId,
        owner: access.allowed,
      };
    } else if (body.action === 'report') {
      payload = {
        action: 'report',
        postId: String(body.postId || ''),
        reason: String(body.reason || '').slice(0, 300),
        actor: { id: user.id, displayName: user.displayName },
      };
    } else if (body.action === 'ad-report') {
      payload = {
        action: 'ad-report',
        adId: String(body.adId || ''),
        reason: String(body.reason || '').slice(0, 300),
        actor: { id: user.id, displayName: user.displayName },
      };
    } else if (body.action === 'warnings') {
      payload = { action: 'warnings', actor: { id: user.id, displayName: user.displayName } };
    } else if (body.action === 'messages') {
      payload = { action: 'messages', asOfficial, asBusinessId, owner: access.allowed, actor: { id: user.id, displayName: user.displayName } };
    } else if (body.action === 'conversation') {
      payload = { action: 'conversation', withUserId: String(body.withUserId || ''), username: String(body.username || '').slice(0, 80), asOfficial, asBusinessId, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'notifications') {
      payload = { action: 'notifications', asOfficial, asBusinessId, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'social-status') {
      payload = { action: 'social-status', asOfficial, asBusinessId, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'wallet' || body.action === 'wallet-claim') {
      payload = {
        action: body.action,
        actor: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: avatarUrl(user),
          staffRank: access.staffRank,
          badges: access.badges,
          guildRoles: Array.isArray(access.roles) ? access.roles : (user.guildRoles || []),
        },
      };
    } else if (body.action === 'ads') {
      payload = { action: 'ads', actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'ad-click') {
      payload = {
        action: 'ad-click',
        adId: String(body.adId || ''),
        kind: body.kind === 'account' ? 'account' : 'learn',
        actor: { id: user.id, username: user.username, displayName: user.displayName },
      };
    } else if (body.action === 'ad-purchase') {
      const placement = ['sidebar', 'feed', 'reel'].includes(String(body.placement || ''))
        ? String(body.placement)
        : 'sidebar';
      payload = {
        action: 'ad-purchase',
        businessId: String(body.businessId || '').slice(0, 80),
        category: body.category === 'department' ? 'department' : 'business',
        businessName: String(body.businessName || '').slice(0, 60),
        title: String(body.title || '').slice(0, 80),
        body: String(body.body || '').slice(0, 500),
        boost: Math.min(5, Math.max(0, Number(body.boost) || 0)),
        placement,
        videoSeconds: Number(body.videoSeconds) || 0,
        image: mediaPayload(body.image, 'image'),
        video: mediaPayload(body.video, 'video'),
        logo: mediaPayload(body.logo, 'image'),
        actor: memberActor(user, access),
      };
    } else if (body.action === 'post-boost') {
      payload = {
        action: 'post-boost',
        postId: String(body.postId || ''),
        actor: memberActor(user, access),
      };
    } else if (body.action === 'verify-apply') {
      payload = {
        action: 'verify-apply',
        reason: String(body.reason || '').slice(0, 500),
        actor: memberActor(user, access),
      };
    } else if (body.action === 'verify-status') {
      payload = { action: 'verify-status', actor: memberActor(user, access) };
    } else if (body.action === 'verify-review') {
      if (!canStaff && !access.allowed) return sendJson(response, 403, { error: 'Staff access required' });
      const panel = staffPanel || (access.allowed ? 'full' : null);
      if (!panel) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'verify-review',
        applicationId: String(body.applicationId || ''),
        decision: body.decision === 'deny' ? 'deny' : 'accept',
        reason: String(body.reason || '').slice(0, 300),
        actor: staffActor(user, access),
        staffPanel: panel,
        owner: access.allowed || panel === 'full',
      };
    } else if (body.action === 'business-apply') {
      payload = {
        action: 'business-apply',
        displayName: String(body.displayName || '').slice(0, 80),
        username: String(body.username || '').slice(0, 40),
        avatarUrl: safeHttpsUrl(body.avatarUrl) || safeBlobMediaUrl(body.avatarUrl) || '',
        bio: String(body.bio || '').slice(0, 300),
        category: body.category === 'department' ? 'department' : 'business',
        actor: memberActor(user, access),
      };
    } else if (body.action === 'business-list') {
      payload = { action: 'business-list', actor: memberActor(user, access) };
    } else if (body.action === 'business-update') {
      payload = {
        action: 'business-update',
        businessId: String(body.businessId || '').slice(0, 80),
        displayName: body.displayName != null ? String(body.displayName || '').slice(0, 80) : undefined,
        avatarUrl: body.avatarUrl != null ? (safeHttpsUrl(body.avatarUrl) || safeBlobMediaUrl(body.avatarUrl) || '') : undefined,
        bio: body.bio != null ? String(body.bio || '').slice(0, 300) : undefined,
        category: body.category != null ? (body.category === 'department' ? 'department' : 'business') : undefined,
        actor: memberActor(user, access),
      };
    } else if (body.action === 'business-member-add') {
      payload = {
        action: 'business-member-add',
        businessId: String(body.businessId || '').slice(0, 80),
        targetId: String(body.targetId || ''),
        username: String(body.username || '').slice(0, 80),
        role: body.role === 'manager' ? 'manager' : 'poster',
        actor: memberActor(user, access),
      };
    } else if (body.action === 'business-member-remove') {
      payload = {
        action: 'business-member-remove',
        businessId: String(body.businessId || '').slice(0, 80),
        targetId: String(body.targetId || ''),
        actor: memberActor(user, access),
      };
    } else if (body.action === 'business-member-role') {
      payload = {
        action: 'business-member-role',
        businessId: String(body.businessId || '').slice(0, 80),
        targetId: String(body.targetId || ''),
        role: body.role === 'manager' ? 'manager' : 'poster',
        actor: memberActor(user, access),
      };
    } else if (body.action === 'business-review') {
      if (!canStaff && !access.allowed) return sendJson(response, 403, { error: 'Staff access required' });
      const panel = staffPanel || (access.allowed ? 'full' : null);
      if (!panel) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'business-review',
        businessId: String(body.businessId || '').slice(0, 80),
        decision: body.decision === 'deny' ? 'deny' : 'accept',
        reason: String(body.reason || '').slice(0, 300),
        actor: staffActor(user, access),
        staffPanel: panel,
        owner: access.allowed || panel === 'full',
      };
    } else if (body.action === 'ad-review') {
      if (!canStaff && !access.allowed) return sendJson(response, 403, { error: 'Staff access required' });
      const panel = staffPanel || (access.allowed ? 'full' : null);
      payload = {
        action: 'ad-review',
        adId: String(body.adId || ''),
        decision: body.decision === 'deny' ? 'deny' : 'accept',
        reason: String(body.reason || '').slice(0, 300),
        actor: staffActor(user, access),
        staffPanel: panel,
        owner: access.allowed || panel === 'full',
      };
    } else if (body.action === 'ad-manage') {
      // Ownership (full panel) and limited staff can extend or end ads.
      if (!canStaff && !access.allowed) return sendJson(response, 403, { error: 'Staff access required' });
      const panel = staffPanel || (access.allowed ? 'full' : null);
      if (!panel) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'ad-manage',
        adId: String(body.adId || ''),
        manageAction: body.manageAction === 'extend' ? 'extend' : 'remove',
        hours: Math.min(168, Math.max(1, Number(body.hours) || 24)),
        actor: staffActor(user, access),
        staffPanel: panel,
        owner: access.allowed || panel === 'full',
      };
    } else if (body.action === 'wallet-transfer') {
      payload = {
        action: 'wallet-transfer',
        type: body.type === 'request' ? 'request' : 'send',
        targetId: String(body.targetId || ''),
        username: String(body.username || '').slice(0, 80),
        amount: Number(body.amount),
        note: String(body.note || '').slice(0, 120),
        actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges },
      };
    } else if (body.action === 'wallet-transfer-respond') {
      payload = {
        action: 'wallet-transfer-respond',
        transferId: String(body.transferId || ''),
        decision: body.decision === 'decline' ? 'decline' : 'accept',
        actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges },
      };
    } else if (body.action === 'preferences') {
      payload = { action: 'preferences', actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'preference-save') {
      payload = { action: 'preference-save', key: String(body.key || ''), enabled: body.enabled === true, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'profile-get') {
      payload = { action: 'profile-get', actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'profile-save') {
      const submitted = body.profile && typeof body.profile === 'object' ? body.profile : {};
      const profile = {};
      if ('bio' in submitted) profile.bio = String(submitted.bio || '').slice(0, 300);
      if ('pronouns' in submitted) profile.pronouns = String(submitted.pronouns || '').slice(0, 40);
      if ('location' in submitted) profile.location = String(submitted.location || '').slice(0, 60);
      if ('website' in submitted) profile.website = String(submitted.website || '').slice(0, 200);
      if ('bannerUrl' in submitted) profile.bannerUrl = String(submitted.bannerUrl || '').trim().slice(0, 500);
      if ('accentColor' in submitted) profile.accentColor = String(submitted.accentColor || '').trim().slice(0, 9);
      if ('pinnedPostId' in submitted) profile.pinnedPostId = String(submitted.pinnedPostId || '').slice(0, 64);
      payload = { action: 'profile-save', profile, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'account-active') {
      payload = { action: 'account-active', deactivated: body.deactivated === true, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'account-delete') {
      if (String(body.confirm || '').trim().toLowerCase() !== 'delete') {
        return sendJson(response, 400, { error: 'Type DELETE to confirm.' });
      }
      payload = { action: 'account-delete', actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'social') {
      payload = {
        action: 'social',
        type: String(body.type || ''),
        enabled: body.enabled !== false && body.enabled !== 'false',
        targetId: String(body.targetId || ''),
        postId: String(body.postId || ''),
        collectionId: String(body.collectionId || ''),
        collectionName: String(body.collectionName || '').slice(0, 40),
        asOfficial,
        asBusinessId,
        owner: access.allowed,
        actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges },
      };
    } else if (body.action === 'post-interaction') {
      payload = { action: 'post-interaction', type: String(body.type || ''), postId: String(body.postId || ''), content: String(body.content || '').slice(0, 500), quote: body.quote === true, asOfficial, asBusinessId, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'poll-vote') {
      payload = { action: 'poll-vote', postId: String(body.postId || ''), optionIndex: Number(body.optionIndex), remove: body.remove === true, asOfficial, asBusinessId, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'message-send') {
      payload = { action: 'message-send', to: String(body.to || ''), username: String(body.username || '').slice(0, 80), content: String(body.content || '').slice(0, 1000), gif: body.gif && typeof body.gif === 'object' ? { url: compatibleGiphyUrl(body.gif.url), title: String(body.gif.title || '').slice(0, 120) } : null, asOfficial, asBusinessId, owner: access.allowed, actor: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrl(user), staffRank: access.staffRank, badges: access.badges } };
    } else if (body.action === 'report-review') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'report-review',
        reportId: String(body.reportId || ''),
        decision: body.decision === 'deny' ? 'deny' : 'accept',
        moderationAction: String(body.moderationAction || ''),
        reason: String(body.reason || '').slice(0, 300),
        durationDays: body.durationDays === 'forever' ? 'forever' : Number(body.durationDays),
        actor: staffActor(user, access),
        staffPanel,
        owner: staffPanel === 'full',
      };
    } else if (body.action === 'history-revert') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'history-revert',
        source: body.source === 'log' ? 'log' : 'report',
        id: String(body.id || ''),
        actor: staffActor(user, access),
        staffPanel,
        owner: staffPanel === 'full',
      };
    } else if (body.action === 'erlc-location') {
      payload = { action: 'erlc-location', actor: { id: user.id, username: user.username, displayName: user.displayName } };
    } else if (body.action === 'moderation') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = { action: 'moderation', staffPanel, owner: staffPanel === 'full', actor: staffActor(user, access) };
    } else if (body.action === 'staff-user-detail') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'staff-user-detail',
        targetId: String(body.targetId || ''),
        staffPanel,
        owner: staffPanel === 'full',
        actor: staffActor(user, access),
      };
    } else if (body.action === 'staff-user-messages') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'staff-user-messages',
        targetId: String(body.targetId || ''),
        staffPanel,
        owner: staffPanel === 'full',
        actor: staffActor(user, access),
      };
    } else if (body.action === 'staff-user-conversation') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'staff-user-conversation',
        targetId: String(body.targetId || ''),
        withUserId: String(body.withUserId || ''),
        username: String(body.username || '').slice(0, 80),
        staffPanel,
        owner: staffPanel === 'full',
        actor: staffActor(user, access),
      };
    } else if (body.action === 'staff-user-search') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'staff-user-search',
        query: String(body.query || '').slice(0, 80),
        limit: Math.min(120, Math.max(1, Number(body.limit) || 80)),
        staffPanel,
        owner: staffPanel === 'full',
        actor: staffActor(user, access),
      };
    } else if (body.action === 'staff-user') {
      if (!canStaff) return sendJson(response, 403, { error: 'Staff access required' });
      payload = {
        action: 'staff-user',
        staffAction: String(body.staffAction || ''),
        targetId: String(body.targetId || ''),
        reason: String(body.reason || '').slice(0, 300),
        note: String(body.note || '').slice(0, 500),
        durationDays: body.durationDays === 'forever' ? 'forever' : Number(body.durationDays),
        ipBan: staffPanel === 'full' && body.ipBan === true,
        postId: String(body.postId || ''),
        actor: staffActor(user, access),
        staffPanel,
        owner: staffPanel === 'full',
      };
    } else if (body.action === 'staff-wallet') {
      if (staffPanel !== 'full') return sendJson(response, 403, { error: 'Full staff access required' });
      payload = {
        action: 'staff-wallet',
        targetId: String(body.targetId || ''),
        amount: Number(body.amount),
        note: String(body.note || '').slice(0, 220),
        actor: staffActor(user, access),
        staffPanel,
        owner: true,
      };
    } else if (body.action === 'staff-site') {
      if (staffPanel !== 'full') return sendJson(response, 403, { error: 'Full staff access required' });
      const banner = body.banner && typeof body.banner === 'object' ? body.banner : {};
      payload = {
        action: 'staff-site',
        staffAction: String(body.staffAction || ''),
        enabled: body.enabled === true,
        banner: {
          message: String(banner.message || '').slice(0, 160),
          details: String(banner.details || '').slice(0, 800),
          linkUrl: String(banner.linkUrl || '').slice(0, 300),
          linkLabel: String(banner.linkLabel || '').slice(0, 40),
        },
        actor: staffActor(user, access),
        staffPanel,
        owner: true,
      };
    } else if (['verify', 'ban'].includes(body.action)) {
      if (staffPanel !== 'full') return sendJson(response, 403, { error: 'Full staff access required' });
      payload = {
        action: body.action,
        targetId: String(body.targetId || ''),
        enabled: body.enabled === true,
        reason: String(body.reason || '').slice(0, 300),
        durationDays: body.durationDays === 'forever' ? 'forever' : Number(body.durationDays),
        ipBan: body.ipBan === true,
        actor: staffActor(user, access),
        staffPanel,
        owner: true,
      };
    } else {
      return sendJson(response, 400, { error: 'Unsupported action' });
    }

    if (['withUserId', 'targetId', 'to', 'userId', 'authorId', 'peerId', 'otherId', 'advertiserId', 'applicantId'].some((key) => isPublicUserId(payload[key]))) {
      let users = [];
      const lookup = await callBot({ method: 'GET' });
      if (lookup.ok && Array.isArray(lookup.body?.users)) users = lookup.body.users;
      // Staff targets are often missing from the public feed. Pull the moderation
      // roster so hashed IDs from older staff sessions can still be resolved.
      if (canStaff && STAFF_PIN_ACTIONS.has(String(body.action || ''))) {
        const roster = await callBot(request, {
          action: 'moderation',
          staffPanel,
          owner: staffPanel === 'full',
          actor: staffActor(user, access),
        });
        if (roster.ok && Array.isArray(roster.body?.users)) {
          users = [...users, ...roster.body.users];
        }
      }
      payload = await resolvePublicIds(payload, users);
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
    if (
      body.action === 'ad-report'
      && !result.ok
      && /unsupported action/i.test(String(result.body?.error || ''))
    ) {
      return sendJson(response, 503, {
        error: 'Sponsored ad reporting needs the latest bot files. Restart the Sparked bot host after it pulls from GitHub.',
      });
    }
    const redact = STAFF_PIN_ACTIONS.has(String(body.action || '')) && canStaff
      ? redactStaffPayload
      : redactPublicPayload;
    return sendJson(response, result.ok ? (result.status === 201 ? 201 : 200) : result.status, redact(result.body));
  } catch {
    return sendJson(response, 502, { error: 'Clearwater Internet is temporarily unavailable' });
  }
}
