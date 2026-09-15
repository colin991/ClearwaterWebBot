import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDiscordPlayers, buildDiscordCheckPanels } from '../utils/discordCheck.js';

test('classifies linked, name-matched, missing, and whitelisted players accurately', () => {
  const members = new Map([['1', { id: '1', nickname: 'Officer | Alpha' }], ['2', { id: '2', nickname: 'Different' }]]);
  const players = [{ username: 'Alpha' }, { username: 'Bravo', robloxId: '20' }, { username: 'Missing' }, { username: 'Coleddev13' }];
  const rows = classifyDiscordPlayers(players, members, { '2': { robloxId: '20' } }, id => id === '2');
  assert.equal(rows.find(p => p.username === 'Alpha').inDiscord, true);
  assert.equal(rows.find(p => p.username === 'Alpha').inVoice, false);
  assert.equal(rows.find(p => p.username === 'Bravo').inVoice, true);
  const exempt = rows.find(p => p.username === 'Coleddev13');
  assert.equal(exempt.exempt, true); assert.equal(exempt.inDiscord, false);
});
test('large roster is fully represented within message limits', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ username: 'Player_' + i, team: 'Sheriff', callsign: '1000', inDiscord: true, inVoice: i % 2 === 0 }));
  const panels = buildDiscordCheckPanels(rows, 123);
  assert.ok(panels.length > 1);
  let all = '';
  for (const panel of panels) {
    const text = panel.components[0].components.filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.ok(text.length < 4000); all += text;
    assert.deepEqual(panel.allowedMentions.parse, []);
  }
  assert.equal((all.match(/\*\*Player/g) || []).length, 100);
  assert.match(all, /In Discord — Not in VC/);
});
test('empty server displays zero counts and None sections', () => {
  const text = JSON.stringify(buildDiscordCheckPanels([], 123));
  assert.match(text, /Online:\*\* 0/); assert.equal((text.match(/None/g) || []).length, 3);
});
