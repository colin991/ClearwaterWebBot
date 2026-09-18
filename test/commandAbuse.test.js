import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMAND_ABUSE_CHANNEL,
  commandAbuseAlertText,
  createCommandAbuseMonitor,
  isCommandAbuse,
} from '../utils/commandAbuse.js';
import { parseErlcCommandLog } from '../utils/erlc.js';

test('flags mass heal, bring, kick, and ban commands', () => {
  assert.equal(isCommandAbuse(':heal all'), true);
  assert.equal(isCommandAbuse(':bing all'), true);
  assert.equal(isCommandAbuse(':bring others'), true);
  assert.equal(isCommandAbuse(':kick all'), true);
  assert.equal(isCommandAbuse(':ban everyone'), true);
  assert.equal(isCommandAbuse(':heal PlayerOne'), false);
  assert.equal(isCommandAbuse(':kick Cheater'), false);
  assert.equal(isCommandAbuse(':h hello all'), false);
});

test('new mass commands alert once; history at startup is ignored', async () => {
  let logs = [
    { Player: 'Old:1', Timestamp: 100, Command: ':heal all' },
  ];
  const alerts = [];
  const monitor = createCommandAbuseMonitor({
    snapshot: async () => logs,
    alert: async (entry) => { alerts.push(entry.command); },
  });
  await monitor.tick();
  assert.deepEqual(alerts, []);
  logs = [
    ...logs,
    { Player: 'Abuser:9', Timestamp: 200, Command: ':kick all' },
  ];
  await monitor.tick();
  assert.deepEqual(alerts, [':kick all']);
  await monitor.tick();
  assert.deepEqual(alerts, [':kick all']);
});

test('bring others and heal all from the PRC log shape alert with @here', () => {
  const parsed = parseErlcCommandLog({
    Player: 'StaffName:55',
    Timestamp: 1_700_000_000,
    Command: ':bring others',
  });
  assert.equal(isCommandAbuse(parsed.command), true);
  assert.match(commandAbuseAlertText(parsed), /^@here Command abuse detected:/);
  assert.match(commandAbuseAlertText(parsed), /StaffName/);
  assert.match(commandAbuseAlertText(parsed), /:bring others/);
  assert.equal(COMMAND_ABUSE_CHANNEL, '1550330878360813618');
});
