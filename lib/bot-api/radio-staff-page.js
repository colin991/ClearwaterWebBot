import { readFileSync } from 'node:fs';
import {
  RADIO_COOKIE,
  SESSION_COOKIE,
  getAuthConfig,
  parseCookies,
  radioCookieSecret,
  readSessionToken,
} from '../discord-auth.js';

const PAGE_FILE = new URL('../../radio-staff.html', import.meta.url);
let pageHtml = null;
const page = () => (pageHtml ??= readFileSync(PAGE_FILE, 'utf8'));

function sendHtml(response, status, html) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Never cached: the page is only for the admin who asked for it.
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Vary', 'Cookie');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.end(html);
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function gatePage(body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#04121c">
<meta name="robots" content="noindex,nofollow">
<title>Radio Staff | Clearwater Radio</title>
<link rel="icon" type="image/png" href="assets/clearwater-logo.png">
<link rel="stylesheet" href="radio-staff.css">
</head>
<body>
<header class="rs-top">
  <img src="assets/clearwater-logo.png" alt="" width="40" height="40">
  <div><strong>Radio staff panel</strong><span>Clearwater Radio</span></div>
  <a class="rs-link" href="/radio">Open radio</a>
</header>
<section class="rs-gate"><div class="rs-card rs-gate-card">${body}</div></section>
</body>
</html>`;
}

const SIGN_IN = gatePage(`<h1>Radio staff panel</h1><p>Sign in with the Discord account you use in the Clearwater server. Only Clearwater admins can use this page.</p>
  <a class="rs-discord" href="/api/auth/discord?agreed=1&amp;next=%2Fradio-staff">Sign in with Discord</a>
  <p class="rs-fine">By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>`);
const adminsOnly = (message) => gatePage(`<h1>Admins only</h1><p>${escapeHtml(message || 'Only Clearwater admins can use the radio staff panel.')}</p>
  <a class="rs-power" href="/radio">Open the radio instead</a>`);
const OFFLINE = gatePage(`<h1>Radio offline</h1><p>The radio is offline right now, so admin access can't be checked.</p>
  <a class="rs-power" href="/radio-staff">Try again</a>`);

/**
 * The radio staff page itself (cwpcso.com/radio-staff). The HTML is only sent after the signed
 * Discord session is checked and the bot confirms, live, that the user has Administrator in the
 * Clearwater server. Everyone else gets a sign-in or "admins only" page instead.
 */
export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return sendHtml(response, 405, gatePage('<h1>Not allowed</h1>'));
  }

  let session;
  try {
    const { sessionSecret } = getAuthConfig(request);
    const cookies = parseCookies(request.headers.cookie);
    session = readSessionToken(cookies[SESSION_COOKIE], sessionSecret)
      || readSessionToken(cookies[RADIO_COOKIE], radioCookieSecret(sessionSecret));
  } catch {
    return sendHtml(response, 503, OFFLINE);
  }
  if (!session?.id) return sendHtml(response, 401, SIGN_IN);

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return sendHtml(response, 503, OFFLINE);

  try {
    const botResponse = await fetch(`${apiUrl}/api/radio/staff?${new URLSearchParams({ discordId: session.id })}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (botResponse.ok) return sendHtml(response, 200, page());
    if (botResponse.status === 403 || botResponse.status === 400) {
      const result = await botResponse.json().catch(() => ({}));
      return sendHtml(response, 403, adminsOnly(result.error));
    }
    return sendHtml(response, 503, OFFLINE);
  } catch {
    return sendHtml(response, 503, OFFLINE);
  }
}
