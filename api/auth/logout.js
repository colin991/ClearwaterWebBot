import { SESSION_COOKIE, clearCookie, sendJson } from '../../lib/discord-auth.js';

export default function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  response.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
  return sendJson(response, 200, { ok: true });
}
