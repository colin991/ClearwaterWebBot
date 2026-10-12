import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRE_INFRACTION_CHANNEL_ID,
  FIRE_INFRACTION_TYPES,
  assertCanInfract,
  buildFireInfractionPayload,
} from '../utils/fireInfract.js';
import { getFireRankByName } from '../utils/firePromote.js';

function member(rankNames, { admin = false } = {}) {
  return {
    roles: { cache: new Set(rankNames.map((name) => getFireRankByName(name).roleId)) },
    permissions: { has: () => admin },
  };
}

test('CWFR infraction record matches the requested layout without role pings', () => {
  assert.equal(FIRE_INFRACTION_CHANNEL_ID, '1514804888742269114');
  const payload = buildFireInfractionPayload({
    target: { id: '111' },
    issuer: { id: '222' },
    type: FIRE_INFRACTION_TYPES.find((type) => type.value === 'strike'),
    policy: 'S1.01 Unprofessionalism',
    issuedAt: 1791328080 * 1000,
    expiresAt: 1792624080 * 1000,
  });
  const json = payload.components[0].toJSON();
  assert.equal(payload.flags, 32768);
  assert.deepEqual(json.components.map((c) => c.type), [12, 14, 10, 10, 14, 12]);
  const serialized = JSON.stringify(json);
  assert.match(serialized, /cwfd_5\.png/);
  assert.match(serialized, /cwfd_footer_5\.png/);
  assert.match(serialized, /Personnel Infraction/);
  assert.match(serialized, /<@111> has received a \*\*strike\*\* for \*\*S1\.01 Unprofessionalism\*\* on <t:1791328080:D> at <t:1791328080:t>/);
  assert.match(serialized, /\*\*Expires In:\*\* <t:1792624080:R> \(<t:1792624080:f>\)/);
  assert.match(serialized, /\*\*Issued By:\*\* <@222>/);
  assert.deepEqual(payload.allowedMentions, { parse: [], users: ['111', '222'], roles: [] });
});

test('Infractions without an expiry say Never', () => {
  const payload = buildFireInfractionPayload({
    target: { id: '111' },
    issuer: { id: '222' },
    type: FIRE_INFRACTION_TYPES.find((type) => type.value === 'termination'),
    policy: 'S2.04 Abuse of power',
    issuedAt: Date.now(),
    expiresAt: null,
  });
  assert.match(JSON.stringify(payload.components[0].toJSON()), /\*\*Expires In:\*\* Never/);
});

test('Only supervisors can infract, and only members below them', () => {
  const firefighter = member(['Firefighter I']);
  assert.doesNotThrow(() => assertCanInfract({ issuerMember: member(['Lieutenant']), targetMember: firefighter }));
  assert.throws(() => assertCanInfract({ issuerMember: member(['Engineer']), targetMember: firefighter }), /Lieutenant/);
  assert.throws(() => assertCanInfract({ issuerMember: member(['Lieutenant']), targetMember: member(['Captain']) }), /below your own rank/);
  assert.throws(() => assertCanInfract({ issuerMember: member(['EMS Captain']), targetMember: firefighter }), /without outranking/);
  assert.doesNotThrow(() => assertCanInfract({ issuerMember: member(['District Chief']), targetMember: member(['Paramedic']) }));
  assert.doesNotThrow(() => assertCanInfract({ issuerMember: member([], { admin: true }), targetMember: member(['Chief']) }));
});
