import { handleUpload } from '@vercel/blob/client';
import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../discord-auth.js';
import { getStaffAccess } from '../owner-access.js';
import { hasAdminPanelAccess } from '../admin-access.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CONTENT_PATH_RE = /^pcso-content\/(news|events)\/[a-z0-9._-]+$/i;

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 50_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

async function requireAdmin(request, response) {
  try {
    const { sessionSecret } = getAuthConfig();
    const user = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!user) {
      sendJson(response, 401, { error: 'Sign in with Discord first.' });
      return null;
    }
    const staffAccess = await getStaffAccess(user);
    if (!staffAccess.siteAccess || !hasAdminPanelAccess(user, staffAccess)) {
      sendJson(response, 403, { error: 'Admin permission is required.' });
      return null;
    }
    return user;
  } catch {
    sendJson(response, 503, { error: 'Authentication is unavailable right now.' });
    return null;
  }
}

export default async function handler(request, response) {
  try {
    if (request.method !== 'POST') {
      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    const body = await readBody(request);

    // Vercel Blob completion callbacks are signed; do not require a browser session.
    if (body?.type === 'blob.upload-completed') {
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

    if (!isSameSiteRequest(request)) {
      return sendJson(response, 403, { error: 'Invalid request origin.' });
    }

    const user = await requireAdmin(request, response);
    if (!user) return undefined;

    if (body?.type !== 'blob.generate-client-token') {
      return sendJson(response, 400, { error: 'Unsupported upload request.' });
    }

    try {
      const result = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname) => {
          const path = String(pathname || '');
          if (!CONTENT_PATH_RE.test(path)) throw new Error('Invalid upload path');
          return {
            allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
            maximumSizeInBytes: MAX_IMAGE_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
            tokenPayload: JSON.stringify({ id: user.id, path }),
          };
        },
        onUploadCompleted: async () => {},
      });
      return sendJson(response, 200, result);
    } catch (error) {
      const message = String(error?.message || '');
      return sendJson(response, 503, {
        error: /token|blob store|No token|Failed to retrieve/i.test(message)
          ? 'Create a Blob store in Vercel Storage so news and event images can upload.'
          : (error.message || 'Could not start this image upload.'),
      });
    }
  } catch (error) {
    return sendJson(response, 502, {
      error: error?.message || 'PCSO content upload failed.',
    });
  }
}
