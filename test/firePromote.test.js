import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRE_PROMOTE_CHANNEL_ID,
  FIRE_PROMOTION_RANKS,
  assertCanPromote,
  buildFirePromotionPayload,
  getFireRankByName,
} from '../utils/firePromote.js';

function member(roleIds, { admin = false } = {}) {
  return {
    roles: { cache: new Set(roleIds) },
    permissions: { has: () => admin },
  };
}

const rank = (name) => getFireRankByName(name);

test('CWFR promotions post in the promotions channel with every rank available', () => {
  assert.equal(FIRE_PROMOTE_CHANNEL_ID, '1514804888742269113');
  assert.equal(FIRE_PROMOTION_RANKS.length, 15);
  assert.equal(rank('district chief').roleId, '1514804886418755597');
  assert.equal(rank('Paramedic').track, 'medical');
});

test('CWFR promotion announcement matches the requested layout without role pings', () => {
  const payload = buildFirePromotionPayload({
    target: { id: '111' },
    issuer: { id: '222' },
    rank: rank('District Chief'),
    reason: 'Outstanding leadership',
  });
  const json = payload.components[0].toJSON();
  assert.equal(payload.flags, 32768);
  assert.deepEqual(json.components.map((c) => c.type), [12, 14, 10, 10, 14, 12]);
  const serialized = JSON.stringify(json);
  assert.match(serialized, /cwfd_3\.png/);
  assert.match(serialized, /cwfd_footer_3\.png/);
  assert.match(serialized, /Personnel Promotion/);
  assert.match(serialized, /Congratulations <@111>/);
  assert.match(serialized, /\*\*Reason:\*\* Outstanding leadership/);
  assert.match(serialized, /\*\*Promoted By:\*\* <@222>/);
  assert.match(serialized, /\*\*New Rank:\*\* <@&1514804886418755597>/);
  assert.deepEqual(payload.allowedMentions, { parse: [], users: ['111', '222'], roles: [] });
});

test('CWFR promotions follow the rank ladder', () => {
  const captain = member([rank('Captain').roleId]);
  const engineer = member([rank('Engineer').roleId]);
  const lieutenant = member([rank('Lieutenant').roleId]);

  assert.doesNotThrow(() => assertCanPromote({ issuerMember: captain, targetMember: engineer, rank: rank('Lieutenant') }));
  assert.throws(() => assertCanPromote({ issuerMember: captain, targetMember: engineer, rank: rank('Captain') }), /below your own/);
  assert.throws(() => assertCanPromote({ issuerMember: lieutenant, targetMember: captain, rank: rank('Engineer') }), /below your own rank/);
  assert.throws(() => assertCanPromote({ issuerMember: member([]), targetMember: engineer, rank: rank('Lieutenant') }), /need a CWFR rank/);
  assert.doesNotThrow(() => assertCanPromote({ issuerMember: member([], { admin: true }), targetMember: engineer, rank: rank('Chief') }));
});

test('EMS promotions need a higher EMS rank or a chief officer', () => {
  const paramedic = member([rank('Paramedic').roleId]);
  assert.doesNotThrow(() => assertCanPromote({ issuerMember: member([rank('EMS Captain').roleId]), targetMember: paramedic, rank: rank('EMS Lieutenant') }));
  assert.doesNotThrow(() => assertCanPromote({ issuerMember: member([rank('District Chief').roleId]), targetMember: paramedic, rank: rank('EMS Lieutenant') }));
  assert.throws(() => assertCanPromote({ issuerMember: member([rank('Captain').roleId]), targetMember: paramedic, rank: rank('EMS Lieutenant') }), /EMS rank/);
});
