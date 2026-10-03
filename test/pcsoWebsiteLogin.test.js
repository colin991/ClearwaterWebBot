import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readSessionToken, safeNextPath, sessionIsWebsiteSignedIn } from '../lib/discord-auth.js';

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
