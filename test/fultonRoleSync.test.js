import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FULTON_HUB_GUILD_ID,
  FULTON_MAIN_GUILD_ID,
  FULTON_ROLE_LINKS,
  fultonHubRoleChanges,
} from '../utils/fultonRoleSync.js';

test('fulton sync links the main server to the divisional hub', () => {
  assert.equal(FULTON_MAIN_GUILD_ID, '1558194247398588416');
  assert.equal(FULTON_HUB_GUILD_ID, '1555209573365710959');
  assert.equal(FULTON_ROLE_LINKS.length, 46);
  assert.equal(new Set(FULTON_ROLE_LINKS.map((link) => link.mainRoleId)).size, 46);
  assert.equal(new Set(FULTON_ROLE_LINKS.map((link) => link.hubRoleId)).size, 46);
  assert.ok(!FULTON_ROLE_LINKS.some((link) => link.name === 'Assistant Chief of Investigations'));
  assert.ok(FULTON_ROLE_LINKS.every((link) => /^\d{17,20}$/.test(link.mainRoleId) && /^\d{17,20}$/.test(link.hubRoleId)));
});

test('gaining a main role adds the hub role, losing it removes it', () => {
  const srt = FULTON_ROLE_LINKS.find((link) => link.name === 'Special Response Team');
  const k9 = FULTON_ROLE_LINKS.find((link) => link.name === 'K-9 Unit');
  assert.deepEqual(fultonHubRoleChanges([srt.mainRoleId], []), { add: [srt.hubRoleId], remove: [] });
  assert.deepEqual(fultonHubRoleChanges([srt.mainRoleId], [srt.hubRoleId, k9.hubRoleId]), { add: [], remove: [k9.hubRoleId] });
});

test('unlinked hub roles are left alone and leaving the main server strips linked roles', () => {
  const srt = FULTON_ROLE_LINKS.find((link) => link.name === 'Special Response Team');
  assert.deepEqual(fultonHubRoleChanges([], ['1111111111111111111']), { add: [], remove: [] });
  assert.deepEqual(fultonHubRoleChanges(null, [srt.hubRoleId, '1111111111111111111']), { add: [], remove: [srt.hubRoleId] });
});
