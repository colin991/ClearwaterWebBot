import { SESSION_COOKIE, clearCookie, isSameSiteRequest, redirect, sendJson } from '../../lib/discord-auth.js';

export default function handler(request, response) {
  if (request.method === 'GET') {
    return redirect(response, '/', [clearCookie(SESSION_COOKIE)]);
  }
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!isSameSiteRequest(request)) return sendJson(response, 403, { error: 'Invalid request origin' });
  response.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
  return sendJson(response, 200, { ok: true });
}
