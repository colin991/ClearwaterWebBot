import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseChannel, createMelonlyProfiles, normalizeAccess, profileLabel, shortDepartment, shortRank } from '../utils/radioMelonly.js';

test('department and rank names are shortened for the radio', () => {
  assert.equal(shortDepartment("Pinellas County Sheriff's Office"), 'PCSO');
  assert.equal(shortDepartment('Florida Highway Patrol (FHP)'), 'FHP');
  assert.equal(shortDepartment('CWFD'), 'CWFD');
  assert.equal(shortRank('Senior Deputy'), 'SR DEP');
  assert.equal(shortRank('Sergeant'), 'SGT');
  assert.equal(shortRank('Lieutenant Colonel'), 'LT COL');
});

test('a member is looked up in every Melonly department with their rank', async () => {
  const calls = [];
  const profiles = createMelonlyProfiles({
    apiKey: 'k',
    fetchDepartments: async () => [{ id: 'd1', name: "Pinellas County Sheriff's Office" }, { id: 'd2', name: 'Fire Rescue' }, { id: 'd3', name: 'Off', activated: false }],
    fetchRanks: async (_key, dept) => (dept === 'd1' ? [{ id: 'r1', name: 'Deputy', position: 2 }, { id: 'r2', name: 'Sergeant', position: 1 }] : [{ id: 'f1', name: 'Firefighter', position: 1 }]),
    fetchMember: async (_key, dept, discordId) => {
      calls.push(dept);
      if (dept === 'd1') return { rankId: 'r2' };
      if (dept === 'd2') return { rankId: 'f1', inactive: true };
      return null;
    },
  });
  const profile = await profiles.lookup('111111111111111111');
  assert.deepEqual(calls, ['d1', 'd2'], 'deactivated departments are skipped');
  assert.deepEqual(profile, [{ departmentId: 'd1', department: "Pinellas County Sheriff's Office", short: 'PCSO', rankId: 'r2', rank: 'Sergeant', rankShort: 'SGT' }]);
  assert.equal(profileLabel(profile), 'PCSO SGT');
  assert.equal(profileLabel([]), '');
  assert.deepEqual(await profiles.lookup('bad'), []);
  const catalog = await profiles.catalog();
  assert.deepEqual(catalog[0].ranks.map((rank) => rank.name), ['Sergeant', 'Deputy'], 'ranks in Melonly order');
  assert.deepEqual(await createMelonlyProfiles({ apiKey: '' }).lookup('111111111111111111'), []);
});

test('channel access: open by default, rank-limited when staff tick ranks, admins always in', () => {
  const access = normalizeAccess({ srt: { ranks: ['d1:r2', 'bad key', 'd1:r2'] }, freq: { ranks: [] }, fire: { ranks: ['d1:r3'] }, main: { ranks: ['d1:r1'] } });
  assert.deepEqual(access, { fire: { ranks: ['d1:r3'] }, srt: { ranks: ['d1:r2'] } }, 'only real channels and valid keys are kept');
  const sergeant = [{ departmentId: 'd1', rankId: 'r2' }];
  const deputy = [{ departmentId: 'd1', rankId: 'r1' }];
  assert.equal(canUseChannel(access, 'srt', { profile: sergeant }), true);
  assert.equal(canUseChannel(access, 'srt', { profile: deputy }), false);
  assert.equal(canUseChannel(access, 'srt', { profile: [], staff: true }), true);
  assert.equal(canUseChannel(access, 'freq', { profile: [] }), true);
});
