import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMovePinellasDistrict,
  chooseBalancedPinellasDistrict,
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
