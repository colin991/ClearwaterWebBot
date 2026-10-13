import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import radioStaffPage from '../lib/bot-api/radio-staff-page.js';
import radioStaffRoute from '../lib/bot-api/radio-staff.js';
import { SESSION_COOKIE, createSessionToken } from '../lib/discord-auth.js';

const secret = 'test-session-secret-value-32chars!!';
const ADMIN = '1128547120304095272';
const ALICE = '111111111111111111';
const PANEL_MARKER = 'id="shoutForm"';

const cookieFor = (token) => `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
const sessionFor = (id, extra = {}, key = secret) => cookieFor(createSessionToken({ id, username: 'u', ...extra }, key));

/** The bot only says yes for ADMIN, like the live Administrator check in utils/botApiServer.js. */
async function withBot(run) {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    DISCORD_CLIENT_ID: 'client', DISCORD_CLIENT_SECRET: 'secret', SESSION_SECRET: secret,
    BOT_API_URL: 'http://bot.local', BOT_API_KEY: 'k',
  });
  const asked = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    const discordId = body?.discordId || new URL(String(url)).searchParams.get('discordId');
    asked.push({ url: String(url), body, discordId });
    if (discordId === ADMIN) return { ok: true, status: 200, json: async () => ({ users: [], muted: [] }) };
    return { ok: false, status: 403, json: async () => ({ error: 'Only Clearwater admins can use the radio staff panel.' }) };
  };
  try {
    return await run(asked);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
}

async function getPage(cookie, method = 'GET') {
  let html = '';
  const response = { statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(text = '') { html = text; } };
  await radioStaffPage({ method, headers: { host: 'www.cwpcso.com', cookie } }, response);
  return { status: response.statusCode, headers: response.headers, html };
}

async function postApi(cookie, body) {
  let sent = null;
  const response = { statusCode: 0, setHeader() {}, end(text) { sent = JSON.parse(text); } };
  await radioStaffRoute({ method: 'POST', headers: { host: 'www.cwpcso.com', origin: 'https://www.cwpcso.com', cookie }, body }, response);
  return { status: response.statusCode, body: sent };
}

test('the staff page HTML only loads for a live-checked admin', async () => {
  await withBot(async () => {
    const admin = await getPage(sessionFor(ADMIN));
    assert.equal(admin.status, 200);
    assert.ok(admin.html.includes(PANEL_MARKER));
    assert.equal(admin.headers['Cache-Control'], 'private, no-store');

    const signedOut = await getPage('');
    assert.equal(signedOut.status, 401);
    assert.ok(!signedOut.html.includes(PANEL_MARKER));
    assert.ok(signedOut.html.includes('/api/auth/discord'));

    const member = await getPage(sessionFor(ALICE));
    assert.equal(member.status, 403);
    assert.ok(!member.html.includes(PANEL_MARKER));
  });
});

test('forged or tampered sessions never get the staff page', async () => {
  await withBot(async () => {
    // Admin flags inside a real session don't matter: the bot checks the Discord id live.
    assert.equal((await getPage(sessionFor(ALICE, { discordAdmin: true, guildRoles: ['1514033422270464070'] }))).status, 403);

    // A session made with someone else's key, an old-style signed cookie, plain JSON, and a tampered token.
    const forgedCookies = [
      sessionFor(ADMIN, {}, 'not-the-real-secret-not-the-real!!'),
      cookieFor(`${Buffer.from(JSON.stringify({ id: ADMIN, discordAdmin: true, exp: 9e9 })).toString('base64url')}.${createHmac('sha256', 'guess').update('x').digest('base64url')}`),
      cookieFor(JSON.stringify({ id: ADMIN, admin: true })),
    ];
    const real = createSessionToken({ id: ALICE }, secret).split('.');
    real[2] = `${real[2].slice(0, -2)}${real[2].endsWith('AA') ? 'AB' : 'AA'}`;
    forgedCookies.push(cookieFor(real.join('.')));

    for (const cookie of forgedCookies) {
      const result = await getPage(cookie);
      assert.equal(result.status, 401, cookie);
      assert.ok(!result.html.includes(PANEL_MARKER));
    }

    // Other cookie names and values a browser could fake are ignored.
    const fakeFlags = 'isAdmin=true; admin=1; discordId=' + ADMIN + '; role=admin';
    assert.equal((await getPage(fakeFlags)).status, 401);
    assert.equal((await getPage(`${fakeFlags}; ${sessionFor(ALICE)}`)).status, 403);
  });
});

test('staff API calls use the signed session id, never one the browser sends', async () => {
  await withBot(async (asked) => {
    const forged = await postApi(sessionFor(ALICE), { view: true, discordId: ADMIN, admin: true, isAdmin: true });
    assert.equal(forged.status, 403);
    assert.equal(asked.at(-1).discordId, ALICE);

    for (const body of [
      { action: 'mute', userId: ADMIN, discordId: ADMIN },
      { action: 'shout', text: 'hi', discordId: ADMIN },
      { action: 'recordings', discordId: ADMIN },
      { action: 'coverage', coverage: { towers: [] }, discordId: ADMIN },
      { action: 'access', access: {}, discordId: ADMIN },
    ]) {
      const result = await postApi(sessionFor(ALICE), body);
      assert.equal(result.status, 403, body.action);
      assert.equal(asked.at(-1).discordId, ALICE);
      assert.equal(asked.at(-1).body.discordId, ALICE);
    }

    assert.equal((await postApi('isAdmin=true; discordId=' + ADMIN, { view: true })).status, 401);
  });
});
