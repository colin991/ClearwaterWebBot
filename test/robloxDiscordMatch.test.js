import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingMembers, membersForPlayer, robloxNameMatchesText } from '../utils/robloxDiscordMatch.js';
import { createVcChecks } from '../utils/vcChecks.js';
import { classifyDiscordPlayers } from '../utils/discordCheck.js';

test('roblox nicknames match with spaces instead of underscores', () => {
  assert.equal(robloxNameMatchesText('Deputy | Otw YoueBoyJay', 'Otw_YoueBoyJay'), true);
  assert.equal(robloxNameMatchesText('otw_youeboyjay', 'Otw_YoueBoyJay'), true);
  assert.equal(robloxNameMatchesText('482 | Andrew Miller', 'AndrewMiller'), true);
  assert.equal(robloxNameMatchesText('iTsAronJ', 'iTsAronJ'), true);
  assert.equal(robloxNameMatchesText('482 | iTsAronJ', 'iTsAronJ'), true);
  assert.equal(robloxNameMatchesText('Miller', 'AndrewMiller'), false);
  assert.equal(robloxNameMatchesText('Different Person', 'Otw_YoueBoyJay'), false);
});

test('matchingMembers finds a server nickname that contains the Roblox user', () => {
  const members = new Map([
    ['1', { id: '1', nickname: 'Officer | Otw YoueBoyJay', user: {} }],
    ['2', { id: '2', nickname: 'Unrelated', user: {} }],
    ['3', { id: '3', nickname: 'iTsAronJ', user: {} }],
  ]);
  assert.deepEqual(matchingMembers(members, 'Otw_YoueBoyJay').map(m => m.id), ['1']);
  assert.deepEqual(matchingMembers(members, 'iTsAronJ').map(m => m.id), ['3']);
});

test('linked identity still counts when the nickname does not contain the username', () => {
  const members = new Map([['d', { id: 'd', nickname: 'John Smith', user: {} }]]);
  const matches = membersForPlayer({ username: 'SecretAlt', robloxId: '99' }, members, { d: { robloxId: '99' } });
  assert.equal(matches[0].id, 'd');
});

test('stale identity still falls back to a nickname match', () => {
  const members = new Map([['nick', { id: 'nick', nickname: 'Rank | PlayerOne', user: {} }]]);
  const rows = classifyDiscordPlayers(
    [{ username: 'PlayerOne', robloxId: '5' }],
    members,
    { missing: { robloxId: '5' } },
  );
  assert.equal(rows[0].inDiscord, true);
});

test('VC checks do not jail a player whose nickname contains their Roblox user', async () => {
  const calls = [];
  const service = createVcChecks({
    enabled: true,
    snapshot: async () => ({
      players: [{ username: 'Otw_YoueBoyJay', robloxId: '9' }],
      members: new Map([['d', { id: 'd', nickname: 'Otw YoueBoyJay', user: {} }]]),
      inVoice: () => true,
    }),
    send: async c => calls.push(c),
  });
  await service.tick();
  assert.deepEqual(calls, []);
});
