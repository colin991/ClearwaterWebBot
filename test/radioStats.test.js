import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioStats, radioStatsWeekStart, buildRadioStatsEmbed, RADIO_STATS_WEEK_MS } from '../utils/radioStats.js';
import { buildRadioPanicEmbed, buildRadioStaffPanel, setRadioStaffControls } from '../utils/radioStaff.js';

const ALICE = '111111111111111111';
const BOB = '222222222222222222';

test('weekly radio stats count time on the radio and transmissions, then start over', () => {
  let clock = Date.UTC(2026, 9, 14, 12); // a Wednesday
  const stats = createRadioStats(null, { now: () => clock });
  assert.equal(stats.data.weekStart, Date.UTC(2026, 9, 12), 'weeks start on Monday 00:00 UTC');
  stats.tick([{ userId: ALICE, name: 'Alice' }, { userId: ALICE, name: 'Alice' }, { userId: BOB, name: 'Bob' }], 60_000);
  stats.tick([{ userId: ALICE, name: 'Alice' }], 60_000);
  stats.addTalk({ userId: BOB, name: 'Bob', startedAt: 1_000, endedAt: 4_000 });
  stats.addTalk({ userId: BOB, name: 'Bob', startedAt: 5_000, endedAt: 6_000 });
  assert.equal(stats.due(), false);
  const report = stats.report();
  assert.deepEqual(report.rows.map((row) => [row.userId, row.onlineMs, row.transmissions, row.talkMs]), [
    [ALICE, 120_000, 0, 0],
    [BOB, 60_000, 2, 4_000],
  ]);
  const embed = buildRadioStatsEmbed(report).toJSON();
  assert.match(embed.description, /1\. <@111111111111111111> · \*\*2m\*\* on radio · 0 transmissions/);
  assert.match(embed.description, /2\. <@222222222222222222> · \*\*1m\*\* on radio · 2 transmissions/);
  clock = Date.UTC(2026, 9, 12) + RADIO_STATS_WEEK_MS;
  assert.equal(stats.due(), true);
  stats.reset();
  assert.equal(stats.data.weekStart, radioStatsWeekStart(clock));
  assert.deepEqual(stats.report().rows, []);
});

test('panic history and the staff panel show who, where and what staff can do', () => {
  const panic = buildRadioPanicEmbed({ userId: ALICE, name: 'Alice', unit: '1A-12', location: '120 Main St', postal: '204', at: 1_700_000_000_000, source: 'radio' }).toJSON();
  assert.equal(panic.fields[0].value, '<@111111111111111111> · Alice (1A-12)');
  assert.equal(panic.fields[1].value, '120 Main St · postal 204');
  assert.match(panic.fields[3].value, /PANIC button/);

  setRadioStaffControls(null);
  assert.match(buildRadioStaffPanel().embeds[0].toJSON().description, /not running/);

  setRadioStaffControls({
    users: () => [{ userId: ALICE, name: 'Alice', channelName: 'Radio', muted: true }],
    muted: [ALICE, BOB],
  });
  const panel = buildRadioStaffPanel(ALICE);
  const text = panel.embeds[0].toJSON().description;
  assert.match(text, /On the radio now \(1\)/);
  assert.match(text, /<@111111111111111111> · Radio · 🔇 muted/);
  assert.match(text, /Also muted \(not on a radio\)\*\*\n<@222222222222222222>/);
  const buttons = panel.components[1].toJSON().components.map((button) => button.custom_id || button.url);
  assert.deepEqual(buttons, [`radio-staff:unmute:${ALICE}`, `radio-staff:kick:${ALICE}`, `radio-staff:refresh:${ALICE}`, 'https://www.cwpcso.com/radio-staff']);
  setRadioStaffControls(null);
});
