import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callsignFromName, createRadioPanicWatch, findPanicPlayer, panicUnitAndPostal, parseRadioPanic, playerLocationLabel,
} from '../utils/radioPanic.js';

test('reads a panic event with caller and location', () => {
  assert.deepEqual(
    parseRadioPanic({ Type: 'Panic', Caller: 'Deputy_Jones:123', PositionDescriptor: 'Main St & 1st Ave' }),
    { name: 'Deputy_Jones', robloxId: '123', location: 'Main St & 1st Ave' },
  );
  assert.deepEqual(
    parseRadioPanic({ Type: 'EmergencyCall', Team: 'Police', Description: 'Panic button', Caller: 'Smith:9', PositionDescriptor: 'Postal 204' }),
    { name: 'Smith', robloxId: '9', location: 'Postal 204' },
  );
});

test('reads ;panic typed in game', () => {
  assert.deepEqual(
    parseRadioPanic({ Type: 'Command', Command: ';panic gas station', Player: 'Unit12:55' }),
    { name: 'Unit12', robloxId: '55', location: 'gas station' },
  );
  assert.equal(parseRadioPanic({ Type: 'Command', Command: ';ss 10-8', Player: 'Unit12:55' }), null);
  assert.equal(parseRadioPanic({ Type: 'Command', Command: ';ss panic', Player: 'Unit12:55' }), null);
});

test('reads ;panic from the ER:LC custom command webhook', () => {
  // Shape from the bot log: the command arrives without its ";" and the rest of the line as `argument`.
  const event = { event: 'CustomCommand', timestamp: 1760193530, origin: '3781384058', data: { command: 'panic', argument: 'test' } };
  assert.deepEqual(parseRadioPanic(event), { name: '', robloxId: '3781384058', location: 'test' });
  assert.deepEqual(
    parseRadioPanic({ event: 'CustomCommand', origin: '3781384058', data: { command: 'panic' } }),
    { name: '', robloxId: '3781384058', location: '' },
  );
  assert.equal(parseRadioPanic({ event: 'CustomCommand', origin: '1', data: { command: 'ss', argument: 'panic' } }), null);
});

test('the webhook and the command log report one ;panic once', () => {
  const sent = [];
  const watch = createRadioPanicWatch((message) => sent.push(message), () => 5000);
  watch({ event: 'CustomCommand', origin: '42', data: { command: 'panic', argument: 'bank' } });
  watch({ Command: ';panic bank', Player: 'Cop:42' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].robloxId, '42');
});

test('finds the panicking player in game and labels their location', () => {
  const players = [
    { username: 'Other', robloxId: '1', location: {} },
    { username: 'Cop', robloxId: '42', location: { building: '120', street: 'Main St', postal: '204' } },
  ];
  assert.equal(findPanicPlayer(players, { robloxId: '42' }).username, 'Cop');
  assert.equal(findPanicPlayer(players, { names: ['', 'cop'] }).robloxId, '42');
  assert.equal(findPanicPlayer(players, { names: ['nobody'] }), null);
  assert.equal(playerLocationLabel(players[1]), '120 Main St');
  assert.equal(playerLocationLabel({ location: { postal: '9' } }), 'Postal 9');
  assert.equal(playerLocationLabel(null), '');
});

test('reads panics inside a batched webhook body and from command logs', () => {
  assert.deepEqual(
    parseRadioPanic({ events: [{ Type: 'Command', Command: ';ss 10-8', Player: 'A:1' }, { Type: 'Command', Command: ';panic', Player: 'B:2' }] }),
    { name: 'B', robloxId: '2', location: '' },
  );
  assert.deepEqual(
    parseRadioPanic([{ Type: 'Command', Player: 'Cop:7', Command: ':panic bank', Message: ':panic bank' }]),
    { name: 'Cop', robloxId: '7', location: 'bank' },
  );
});

test('ignores ordinary calls and panic attacks', () => {
  assert.equal(parseRadioPanic({ Type: 'EmergencyCall', Team: 'Police', Description: 'Robbery', PositionDescriptor: 'Bank' }), null);
  assert.equal(parseRadioPanic({ Type: 'EmergencyCall', Team: 'Fire', Description: 'Someone is having a panic attack' }), null);
  assert.equal(parseRadioPanic(null), null);
});

test('sends each panic once', () => {
  let clock = 1000;
  const sent = [];
  const watch = createRadioPanicWatch((message) => sent.push(message), () => clock);
  const event = { Type: 'Panic', Caller: 'A:1', PositionDescriptor: 'Here' };
  watch(event);
  watch(event);
  clock += 20_000;
  watch(event);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], { type: 'panic', name: 'A', robloxId: '1', location: 'Here', at: 1000 });
});

test('unit number comes from the in-game callsign, then the Discord nickname', () => {
  assert.deepEqual(panicUnitAndPostal({ callsign: '1A-12', location: { postal: '204' } }, ['99 | Isaac']), { unit: '1A-12', postal: '204' });
  assert.deepEqual(panicUnitAndPostal(null, ['Isaac', '2-31 | Isaac']), { unit: '2-31', postal: '' });
  assert.equal(callsignFromName('[1A-12] Isaac'), '1A-12');
  assert.equal(callsignFromName('104 - Isaac'), '104');
  assert.equal(callsignFromName('Isaac'), '');
  assert.equal(callsignFromName('Isaac 12'), '');
});
