import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROBLOX_FUNDS_GROUP_ID,
  ROBLOX_JOIN_GROUP_ID,
  joinRequestGroupIds,
  resolveFundsGroupId,
  resolveJoinGroupId,
} from '../utils/robloxGroups.js';

test('join requests use Clearwater Roleplay ERLC and funds use Clearwater-Whitelisted', () => {
  assert.equal(ROBLOX_JOIN_GROUP_ID, '163783791');
  assert.equal(ROBLOX_FUNDS_GROUP_ID, '140437562');
  assert.equal(resolveJoinGroupId({}), '163783791');
  assert.equal(resolveFundsGroupId({}), '140437562');
});

test('swapped host env still keeps the two Roblox groups separate', () => {
  assert.equal(
    resolveJoinGroupId({ robloxGroupId: ROBLOX_FUNDS_GROUP_ID }),
    ROBLOX_JOIN_GROUP_ID,
  );
  assert.equal(
    resolveFundsGroupId({ robloxFundsGroupId: ROBLOX_JOIN_GROUP_ID }),
    ROBLOX_FUNDS_GROUP_ID,
  );
  assert.equal(resolveJoinGroupId({ robloxGroupId: '555' }), '555');
  assert.equal(resolveFundsGroupId({ robloxFundsGroupId: '555' }), '555');
});

test('join-request sync watches both the ERLC group and the funds group', () => {
  assert.deepEqual(joinRequestGroupIds({}), [ROBLOX_JOIN_GROUP_ID, ROBLOX_FUNDS_GROUP_ID]);
});
