import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PINELLAS_SHIFT_DISTRICTS_ID,
  applyDistrictAssignments,
  canMovePinellasDistrict,
  chooseBalancedPinellasDistrict,
  handlePinellasShiftPanelInteraction,
  isPinellasWatchCommanderEligible,
  seedPinellasShiftSnapshot,
} from '../utils/pinellasShiftPanel.js';
import { getPinellasRankByName } from '../utils/pinellasPromote.js';

function deputy(id, rankName) {
  return {
    discordId: id,
    callsign: id,
    roleplayName: id,
    rank: getPinellasRankByName(rankName),
  };
}

function assignBalanced(deputies) {
  const assignments = {};
  for (const person of deputies) {
    const district = chooseBalancedPinellasDistrict(person, deputies, assignments);
    assignments[person.discordId] = { districtId: district.id };
  }
  return assignments;
}

test('three command staff are distributed one per district', () => {
  const deputies = [
    deputy('captain', 'Captain'),
    deputy('lieutenant', 'Lieutenant'),
    deputy('major', 'Major'),
  ];
  const assignments = assignBalanced(deputies);
  assert.deepEqual(
    Object.values(assignments).map((entry) => entry.districtId).sort(),
    ['1', '2', '3'],
  );
});

test('six supervisors are distributed two per district', () => {
  const deputies = Array.from({ length: 6 }, (_, index) => deputy(`sgt-${index}`, 'Sergeant'));
  const assignments = assignBalanced(deputies);
  const counts = Object.values(assignments).reduce((result, entry) => {
    result[entry.districtId] = (result[entry.districtId] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2 });
});

test('manual district moves reject a difference greater than two', () => {
  const deputies = Array.from({ length: 5 }, (_, index) => deputy(`deputy-${index}`, 'Deputy First Class'));
  const assignments = {
    'deputy-0': { districtId: '1' },
    'deputy-1': { districtId: '1' },
    'deputy-2': { districtId: '2' },
    'deputy-3': { districtId: '2' },
    'deputy-4': { districtId: '3' },
  };
  assert.equal(canMovePinellasDistrict(deputies[4], '1', deputies, assignments), false);
  assert.equal(canMovePinellasDistrict(deputies[0], '3', deputies, assignments), true);
});

test('all-district personnel do not affect balanced district counts', () => {
  const deputies = [
    deputy('all-districts', 'Captain'),
    deputy('north', 'Captain'),
    deputy('east', 'Captain'),
    deputy('next', 'Captain'),
  ];
  const assignments = {
    'all-districts': { districtId: 'all' },
    north: { districtId: '1' },
    east: { districtId: '2' },
  };
  assert.equal(chooseBalancedPinellasDistrict(deputies[3], deputies, assignments).id, '3');
});

test('all-district role is never eligible for Watch Commander', () => {
  const captain = deputy('captain', 'Captain');
  assert.equal(isPinellasWatchCommanderEligible(captain), true);
  captain.hasAllDistrictsRole = true;
  assert.equal(isPinellasWatchCommanderEligible(captain), false);
});

test('last-pull district ids survive an empty assignment map', () => {
  const snapshot = {
    deputies: [
      { discordId: '1', districtId: '1' },
      { discordId: '2', districtId: '2' },
    ],
  };
  applyDistrictAssignments(snapshot, {});
  assert.equal(snapshot.deputies[0].districtId, '1');
  assert.equal(snapshot.deputies[1].district?.id, '2');
});

test('Districts card uses the last pull instead of Nobody assigned', async () => {
  seedPinellasShiftSnapshot({
    deputies: [
      {
        discordId: '111',
        callsign: '101',
        roleplayName: 'Colin',
        rankName: 'Lieutenant',
        rank: getPinellasRankByName('Lieutenant'),
        districtId: '2',
      },
      {
        discordId: '222',
        callsign: '1111',
        roleplayName: 'Connor Reese',
        rankName: 'Lieutenant',
        rank: getPinellasRankByName('Lieutenant'),
        districtId: '3',
      },
    ],
  });
  const replies = [];
  await handlePinellasShiftPanelInteraction({
    customId: PINELLAS_SHIFT_DISTRICTS_ID,
    isButton: () => true,
    isStringSelectMenu: () => false,
    user: { id: '111' },
    client: { users: { fetch: async () => null } },
    deferReply: async () => {},
    editReply: async (payload) => { replies.push(payload); },
  });
  const text = JSON.stringify(replies[0]);
  assert.match(text, /Colin/);
  assert.match(text, /Connor Reese/);
  assert.match(text, /District 2 East/);
  assert.match(text, /District 3 West/);
});
