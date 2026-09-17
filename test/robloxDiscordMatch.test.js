import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingMembers, membersForPlayer, playerIsInVoice, robloxNameMatchesText } from '../utils/robloxDiscordMatch.js';
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

test('player in a voice-state member is in VC even if members cache missed them', () => {
  const player = { username: 'buttercup75075', robloxId: '55' };
  const members = new Map();
  const voiceStates = new Map([
    ['d', {
      id: 'd',
      channelId: 'vc1',
      member: { id: 'd', user: { username: 'buttercup75075' } },
    }],
  ]);
  assert.equal(playerIsInVoice(player, members, {}, () => false, voiceStates), true);
});

test('linked identity in voice counts even when the member object is missing', () => {
  const player = { username: 'SecretAlt', robloxId: '99' };
  const voiceStates = new Map([['d', { id: 'd', channelId: 'vc1' }]]);
  assert.equal(playerIsInVoice(player, new Map(), { d: { robloxId: '99' } }, () => false, voiceStates), true);
});

test('generic display names like Jail do not count as a Discord match', () => {
  const members = new Map([['x', { id: 'x', nickname: 'Jail Officer', user: {} }]]);
  const matches = membersForPlayer({ username: 'buttercup75075', displayName: 'Jail', robloxId: '1' }, members);
  assert.equal(matches.length, 0);
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
