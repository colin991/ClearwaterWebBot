import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUpdateCountdownService,
  formatUpdateCountdown,
  parseEasternUpdateTime,
  updateCountdownStatus,
} from '../utils/updateCountdown.js';

test('parses the next requested Eastern time', () => {
  const noonEastern = Date.parse('2026-09-26T16:00:00Z');
  assert.equal(parseEasternUpdateTime('9:00pm', noonEastern), Date.parse('2026-09-27T01:00:00Z'));
  assert.equal(parseEasternUpdateTime('21:00', noonEastern), Date.parse('2026-09-27T01:00:00Z'));
  assert.equal(parseEasternUpdateTime('9am', noonEastern), Date.parse('2026-09-27T13:00:00Z'));
  assert.throws(() => parseEasternUpdateTime('25:00', noonEastern), /24-hour/);
});

test('formats the requested voice-channel statuses', () => {
  assert.equal(formatUpdateCountdown((70 * 60 + 10) * 1000), '1 Hour 10 Minutes 10 Seconds');
  assert.equal(updateCountdownStatus(4_211_000, 1_000), '**<:ERLC:1553560080937652285> Update In:** 1 Hour 10 Minutes 10 Seconds');
  assert.equal(updateCountdownStatus(1_000, 1_000), '**<:ERLC:1553560080937652285> Update OUT!**');
});

test('countdown updates the VC status and finishes with Update OUT', async () => {
  let time = 1_000;
  let stored = { timers: [] };
  const requests = [];
  const service = createUpdateCountdownService({
    client: { rest: { put: async (route, payload) => { requests.push({ route, ...payload.body }); } } },
    now: () => time,
    load: async () => stored,
    save: async (value) => { stored = structuredClone(value); },
  });
  await service.setCountdown({ guildId: 'g1', channelId: 'vc1', endsAt: 21_000, createdBy: 'admin' });
  assert.match(requests.at(-1).status, /20 Seconds/);
  time = 11_000;
  await service.tick();
  assert.match(requests.at(-1).status, /10 Seconds/);
  time = 21_000;
  await service.tick();
  assert.equal(requests.at(-1).status, '**<:ERLC:1553560080937652285> Update OUT!**');
  assert.deepEqual(stored.timers, []);
});

test('an overdue persisted countdown is completed after restart', async () => {
  const requests = [];
  let stored = { timers: [{ guildId: 'g1', channelId: 'vc1', endsAt: 5_000, createdBy: 'admin' }] };
  const service = createUpdateCountdownService({
    client: { rest: { put: async (_route, payload) => { requests.push(payload.body.status); } } },
    now: () => 10_000,
    load: async () => stored,
    save: async (value) => { stored = value; },
  });
  await service.tick();
  assert.equal(requests[0], '**<:ERLC:1553560080937652285> Update OUT!**');
  assert.deepEqual(stored.timers, []);
});
