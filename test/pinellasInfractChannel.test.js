import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PINELLAS_INFRACTION_CHANNEL_ID,
  applyInfractionVoidChange,
  buildInfractionBody,
  infractionShouldBeStruck,
} from '../utils/pinellasInfract.js';

function sampleEntry(overrides = {}) {
  return {
    id: 'abcd1234',
    type: 'warning',
    userId: '1',
    issuerId: '2',
    policy: 'Conduct',
    description: 'Example',
    createdAt: '2026-09-01T12:00:00.000Z',
    expiresAt: '2026-12-01T12:00:00.000Z',
    status: 'active',
    voidedAt: null,
    voidedBy: null,
    expiredAt: null,
    ...overrides,
  };
}

test('permanent infraction records use the configured PCSO channel', () => {
  assert.equal(PINELLAS_INFRACTION_CHANNEL_ID, '1514666061033902230');
});

test('void:false restores a voided infraction and unstrikes the posted body', () => {
  const entry = sampleEntry({
    status: 'voided',
    voidedAt: '2026-09-10T12:00:00.000Z',
    voidedBy: '9',
  });
  const struck = buildInfractionBody(entry, { struck: infractionShouldBeStruck(entry) });
  assert.match(struck, /~~/);
  assert.match(struck, /\*\*VOIDED\*\*/);

  applyInfractionVoidChange(entry, false);
  assert.equal(entry.status, 'active');
  assert.equal(entry.voidedAt, null);
  assert.equal(entry.voidedBy, null);
  assert.equal(infractionShouldBeStruck(entry), false);

  const restored = buildInfractionBody(entry, { struck: infractionShouldBeStruck(entry) });
  assert.doesNotMatch(restored, /~~/);
  assert.doesNotMatch(restored, /\*\*VOIDED\*\*/);
  assert.match(restored, /has received a \*\*Warning\*\*/);
});

test('omitting void leaves status and strike state unchanged', () => {
  const entry = sampleEntry({
    status: 'voided',
    voidedAt: '2026-09-10T12:00:00.000Z',
    voidedBy: '9',
  });
  applyInfractionVoidChange(entry, null);
  assert.equal(entry.status, 'voided');
  assert.equal(entry.voidedBy, '9');
  assert.equal(infractionShouldBeStruck(entry), true);
});

test('void:false on a past-due infraction restores expired strike, not active', () => {
  const entry = sampleEntry({
    status: 'voided',
    voidedAt: '2026-09-10T12:00:00.000Z',
    voidedBy: '9',
    expiresAt: '2020-01-01T00:00:00.000Z',
  });
  applyInfractionVoidChange(entry, false);
  assert.equal(entry.status, 'expired');
  assert.equal(entry.voidedAt, null);
  assert.equal(infractionShouldBeStruck(entry), true);
  const body = buildInfractionBody(entry, { struck: infractionShouldBeStruck(entry) });
  assert.match(body, /~~/);
  assert.match(body, /\*\*EXPIRED\*\*/);
});

test('void:true voids an active infraction and strikes the posted body', () => {
  const entry = sampleEntry();
  applyInfractionVoidChange(entry, true, { voidedBy: '99' });
  assert.equal(entry.status, 'voided');
  assert.equal(entry.voidedBy, '99');
  assert.ok(entry.voidedAt);
  const body = buildInfractionBody(entry, { struck: infractionShouldBeStruck(entry) });
  assert.match(body, /~~/);
  assert.match(body, /\*\*VOIDED\*\*/);
});
