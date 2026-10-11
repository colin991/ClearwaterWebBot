import assert from 'node:assert/strict';
import test from 'node:test';
import callbackHandler from '../api/auth/discord/callback.js';
import { readSessionToken } from '../lib/discord-auth.js';

const secret = 'test-session-secret-value-32chars!!';
const PINELLAS_GUILD_ID = '1514100977920245760';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function runCallback({ routes, state = 'abc', cookieState = 'abc', next = '/careers' }) {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  process.env.DISCORD_CLIENT_ID = 'client';
  process.env.DISCORD_CLIENT_SECRET = 'secret';
  process.env.SESSION_SECRET = secret;
  globalThis.fetch = async (url) => {
    const path = String(url).replace('https://discord.com/api/v10', '');
    const route = routes[path];
    if (!route) return jsonResponse(404, {});
    return typeof route === 'function' ? route() : jsonResponse(200, route);
  };
  const response = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end() {},
  };
  try {
    await callbackHandler({
      method: 'GET',
      url: `/api/auth/discord/callback?code=c&state=${state}`,
      headers: {
        host: 'www.cwpcso.com',
        cookie: `__Host-clearwater_oauth_state=${cookieState}; __Host-clearwater_next=${encodeURIComponent(next)}`,
      },
    }, response);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
  return response;
}

function sessionFrom(response) {
  const cookie = [].concat(response.headers['Set-Cookie']).find((value) => value.startsWith('__Host-clearwater_session=') && !value.startsWith('__Host-clearwater_session=;'));
  if (!cookie) return null;
  return readSessionToken(decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('=')), secret);
}

test('PCSO server members sign in even when the member lookup is rate limited', async () => {
  const response = await runCallback({
    routes: {
      '/oauth2/token': { access_token: 'token' },
      '/users/@me': { id: '1128547120304095272', username: 'deputy' },
      '/users/@me/guilds': [{ id: PINELLAS_GUILD_ID, permissions: '0' }],
      [`/users/@me/guilds/${PINELLAS_GUILD_ID}/member`]: () => jsonResponse(429, { retry_after: 0 }),
    },
  });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.Location, '/careers');
  assert.equal(sessionFrom(response)?.pinellasMember, true);
});

test('people outside both servers go back to PCSO sign-in, not the Clearwater preview page', async () => {
  const response = await runCallback({
    routes: {
      '/oauth2/token': { access_token: 'token' },
      '/users/@me': { id: '1', username: 'visitor' },
      '/users/@me/guilds': [{ id: '999', permissions: '0' }],
    },
  });
  assert.equal(response.headers.Location, '/signin?error=not-member&next=%2Fcareers');
  assert.equal(sessionFrom(response), null);
});

test('a broken OAuth round trip asks to try again instead of claiming no access', async () => {
  const response = await runCallback({ routes: {}, state: 'abc', cookieState: 'other', next: '/' });
  assert.equal(response.headers.Location, '/signin?error=failed');
});
