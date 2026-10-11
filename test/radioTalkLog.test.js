import assert from 'node:assert/strict';
import test from 'node:test';
import { createRadioTalkLog, formatTalkLine } from '../utils/radioTalkLog.js';

test('talk log lines mention the member and show Discord start-end times', () => {
  const startedAt = Date.UTC(2026, 9, 11, 14, 35, 34);
  const endedAt = Date.UTC(2026, 9, 11, 14, 35, 57);
  assert.equal(
    formatTalkLine({ userId: '111111111111111111', startedAt, endedAt }),
    `<@111111111111111111> talked from <t:${startedAt / 1000}:T>-<t:${endedAt / 1000}:T>`,
  );
  assert.match(
    formatTalkLine({ userId: '1', startedAt, endedAt, channelName: 'Special Response Team', onDiscordChannel: false }),
    / on Special Response Team$/,
  );
});

test('talk log batches lines into as few messages as fit', async () => {
  const sent = [];
  const log = createRadioTalkLog({ send: async (content) => sent.push(content), flushMs: 60_000 });
  for (let i = 0; i < 3; i += 1) log.add({ userId: String(i), startedAt: 0, endedAt: 1000 });
  await log.flush();
  log.stop();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].split('\n').length, 3);

  const many = [];
  const big = createRadioTalkLog({ send: async (content) => many.push(content), flushMs: 60_000 });
  for (let i = 0; i < 60; i += 1) big.add({ userId: '111111111111111111', startedAt: 0, endedAt: 1000 });
  await big.flush();
  big.stop();
  assert.ok(many.length > 1);
  assert.ok(many.every((content) => content.length <= 2000));
  assert.equal(many.join('\n').split('\n').length, 60);
});
