import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readSessionToken, safeNextPath, sessionIsWebsiteSignedIn } from '../lib/discord-auth.js';
import authMeHandler from '../api/auth/me.js';

const secret = 'test-session-secret-value-32chars!!';

test('PCSO Discord members count as signed in without Clearwater tester roles', () => {
  const token = createSessionToken({
    id: '1128547120304095272',
    username: 'deputy',
    global_name: 'Deputy',
    pinellasMember: true,
    pinellasRoles: [],
    guildRoles: [],
  }, secret);
  const session = readSessionToken(token, secret);
  assert.equal(session.pinellasMember, true);
  assert.equal(sessionIsWebsiteSignedIn(session, { siteAccess: false }), true);
});

test('auth status gives a PCSO-only member site access so the browser gate stays open', async () => {
  const previous = {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: process.env.DISCORD_REDIRECT_URI,
    sessionSecret: process.env.SESSION_SECRET,
    botApiUrl: process.env.BOT_API_URL,
    botApiKey: process.env.BOT_API_KEY,
  };
  process.env.DISCORD_CLIENT_ID = 'client';
  process.env.DISCORD_CLIENT_SECRET = 'secret';
  process.env.DISCORD_REDIRECT_URI = 'https://www.cwpcso.com/api/auth/discord/callback';
  process.env.SESSION_SECRET = secret;
  delete process.env.BOT_API_URL;
  delete process.env.BOT_API_KEY;

  try {
    const token = createSessionToken({
      id: '1128547120304095272',
      username: 'deputy',
      pinellasMember: true,
      pinellasRoles: [],
      guildRoles: [],
    }, secret);
    let body;
    const response = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      end(value) { body = JSON.parse(value); },
    };
    await authMeHandler({ method: 'GET', headers: { cookie: `__Host-clearwater_session=${encodeURIComponent(token)}` } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(body.authenticated, true);
    assert.equal(body.siteAccess, true);
    assert.equal(body.pcso, true);
  } finally {
    for (const [name, value] of [
      ['DISCORD_CLIENT_ID', previous.clientId],
      ['DISCORD_CLIENT_SECRET', previous.clientSecret],
      ['DISCORD_REDIRECT_URI', previous.redirectUri],
      ['SESSION_SECRET', previous.sessionSecret],
      ['BOT_API_URL', previous.botApiUrl],
      ['BOT_API_KEY', previous.botApiKey],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('Clearwater tester access still signs the website in', () => {
  assert.equal(sessionIsWebsiteSignedIn({ id: '1' }, { siteAccess: true }), true);
  assert.equal(sessionIsWebsiteSignedIn({ id: '1', pinellasMember: false }, { siteAccess: false }), false);
  assert.equal(sessionIsWebsiteSignedIn(null, { siteAccess: true }), false);
});

test('session cookie stays under the browser 4 KB limit for members with many roles', async () => {
  const { makeCookie, SESSION_COOKIE } = await import('../lib/discord-auth.js');
  const roles = (seed) => Array.from({ length: 100 }, (_, index) => String(1514000000000000000n + BigInt(seed * 1e15 + index * 104729 + (index ** 3) * 7)));
  const user = {
    id: '1044686997194805280',
    username: 'colin991',
    global_name: 'Colin',
    avatar: `a_${'f'.repeat(32)}`,
    bio: 'b'.repeat(190),
    guildRoles: roles(1),
    pinellasRoles: roles(2),
    pinellasMember: true,
  };
  const token = createSessionToken(user, 'test-secret');
  assert.ok(makeCookie(SESSION_COOKIE, token, 604800).length < 4000);
  const session = readSessionToken(token, 'test-secret');
  assert.deepEqual(session.guildRoles, user.guildRoles);
  assert.deepEqual(session.pinellasRoles, user.pinellasRoles);
  assert.equal(session.pinellasMember, true);
});

test('signing in from PCSO info pages returns you to that page', () => {
  assert.equal(safeNextPath('/ride-along'), '/ride-along');
  assert.equal(safeNextPath('/sheriff?x=1'), '/sheriff');
  assert.equal(safeNextPath('//evil.example/ride-along'), '/');
  assert.equal(safeNextPath('/not-a-page'), '/');
});
