import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readSessionToken, sessionIsWebsiteSignedIn } from '../lib/discord-auth.js';

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
