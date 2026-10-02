import test from 'node:test';
import assert from 'node:assert/strict';
import { PINELLAS_APPLY_APPROVED_ROLE_ID, getPinellasApplicationStatus, pinellasReapplyAt } from '../utils/pinellasApply.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';

function fakeClient(roleIds) {
  const guild = {
    id: PINELLAS_GUILD_ID,
    roles: { cache: new Map([[PINELLAS_APPLY_APPROVED_ROLE_ID, { name: 'Probationary Deputy' }]]) },
    members: { fetch: async () => ({ roles: { cache: new Set(roleIds) } }) },
  };
  return { guilds: { cache: new Map([[PINELLAS_GUILD_ID, guild]]), fetch: async () => guild } };
}

test('a user with no PCSO roles can apply', async () => {
  const status = await getPinellasApplicationStatus('123456789012345678', { client: fakeClient(['unverified']) });
  assert.equal(status.alreadyMember, false);
  assert.equal(status.memberRole, null);
  assert.equal(status.canApply, true);
});

test('a PCSO member is told which role blocks a new application', async () => {
  const status = await getPinellasApplicationStatus('123456789012345678', { client: fakeClient([PINELLAS_APPLY_APPROVED_ROLE_ID]) });
  assert.equal(status.alreadyMember, true);
  assert.equal(status.canApply, false);
  assert.deepEqual(status.memberRole, { id: PINELLAS_APPLY_APPROVED_ROLE_ID, name: 'Probationary Deputy' });
});

const DAY = 24 * 60 * 60 * 1000;

test('a denial with no stored cooldown still waits three days from the review', () => {
  const reviewedAt = '2026-10-01T12:00:00.000Z';
  const store = { denials: {}, applications: [{ userId: 'u1', status: 'denied', reviewedAt }] };
  assert.equal(pinellasReapplyAt(store, 'u1'), Date.parse(reviewedAt) + 3 * DAY);
});

test('the later of the stored cooldown and the latest denial wins', () => {
  const store = {
    denials: { u1: Date.parse('2026-10-09T00:00:00.000Z') },
    applications: [
      { userId: 'u1', status: 'denied', reviewedAt: '2026-10-02T00:00:00.000Z' },
      { userId: 'u1', status: 'denied', reviewedAt: '2026-09-01T00:00:00.000Z' },
    ],
  };
  assert.equal(pinellasReapplyAt(store, 'u1'), Date.parse('2026-10-09T00:00:00.000Z'));
  store.denials.u1 = 0;
  assert.equal(pinellasReapplyAt(store, 'u1'), Date.parse('2026-10-05T00:00:00.000Z'));
});

test('no denial means no wait, and other users do not count', () => {
  const store = {
    denials: {},
    applications: [
      { userId: 'u2', status: 'denied', reviewedAt: '2026-10-01T00:00:00.000Z' },
      { userId: 'u1', status: 'approved', reviewedAt: '2026-10-01T00:00:00.000Z' },
    ],
  };
  assert.equal(pinellasReapplyAt(store, 'u1'), 0);
  assert.equal(pinellasReapplyAt({}, 'u1'), 0);
});
