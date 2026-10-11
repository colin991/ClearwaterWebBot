import assert from 'node:assert/strict';
import test from 'node:test';
import radioRoute from '../lib/bot-api/radio.js';
import { RADIO_COOKIE, SESSION_COOKIE, createSessionToken, radioCookieSecret } from '../lib/discord-auth.js';
import { cloudflaredDownloadUrl, tunnelWebSocketUrl } from '../utils/radioTunnel.js';

const secret = 'test-session-secret-value-32chars!!';

test('the tunnel address becomes the wss relay URL', () => {
  const log = '2026-10-11 INF |  https://quiet-river-1234.trycloudflare.com  |';
  assert.equal(tunnelWebSocketUrl(log), 'wss://quiet-river-1234.trycloudflare.com/radio');
  assert.equal(tunnelWebSocketUrl('starting tunnel...'), '');
  assert.equal(tunnelWebSocketUrl('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"'), '');
  assert.match(cloudflaredDownloadUrl('linux', 'x64'), /cloudflared-linux-amd64$/);
  assert.equal(cloudflaredDownloadUrl('win32', 'x64'), '');
});

async function call(cookie, { origin = 'https://www.cwpcso.com', bot } = {}) {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  process.env.DISCORD_CLIENT_ID = 'client';
  process.env.DISCORD_CLIENT_SECRET = 'secret';
  process.env.SESSION_SECRET = secret;
  process.env.BOT_API_URL = 'http://bot.local';
  process.env.BOT_API_KEY = 'k';
  const asked = [];
  globalThis.fetch = async (url, options) => {
    asked.push({ url: String(url), auth: options?.headers?.Authorization });
    return bot || { ok: true, status: 200, json: async () => ({ key: 'CWR2.k', url: 'wss://x.trycloudflare.com/radio' }) };
  };
  let body = null;
  const response = {
    statusCode: 0,
    setHeader() {},
    end(text) { body = JSON.parse(text); },
  };
  try {
    await radioRoute({ method: 'POST', headers: { host: 'www.cwpcso.com', origin, cookie } }, response);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
  return { status: response.statusCode, body, asked };
}

test('web radio sign-in trades the site session or radio cookie for a radio key', async () => {
  const user = { id: '1128547120304095272', username: 'unit', global_name: 'Unit 12' };
  const none = await call('');
  assert.equal(none.status, 401);

  const site = await call(`${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(user, secret))}`);
  assert.equal(site.status, 200);
  assert.deepEqual(site.body, { key: 'CWR2.k', url: 'wss://x.trycloudflare.com/radio', name: 'Unit 12' });
  assert.equal(site.asked[0].url, 'http://bot.local/api/radio/web-session?discordId=1128547120304095272');
  assert.equal(site.asked[0].auth, 'Bearer k');

  const radio = await call(`${RADIO_COOKIE}=${encodeURIComponent(createSessionToken(user, radioCookieSecret(secret)))}`);
  assert.equal(radio.status, 200);

  const crossSite = await call(`${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(user, secret))}`, { origin: 'https://evil.example' });
  assert.equal(crossSite.status, 403);

  const offline = await call(`${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(user, secret))}`, {
    bot: { ok: false, status: 503, json: async () => ({ error: 'The radio web link is starting. Try again in a minute.' }) },
  });
  assert.equal(offline.status, 503);
  assert.match(offline.body.error, /starting/);
});
