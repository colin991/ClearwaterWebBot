import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGtaSpeeding,
  GTA_SPEED_LIMIT,
  GTA_SPEED_LOAD_PM,
  GTA_SPEED_REPEAT_MS,
  GTA_SPEED_WARN_PM,
  playerSpeedMph,
  speedFromDisplacement,
  STUDS_PER_SECOND_TO_MPH,
} from '../utils/gtaSpeeding.js';

test('displacement above 130 mph is detected and teleports are ignored', () => {
  const dtMs = 5000;
  const over = (GTA_SPEED_LIMIT + 10) / STUDS_PER_SECOND_TO_MPH * (dtMs / 1000);
  assert.ok(speedFromDisplacement({ x0: 0, z0: 0, x1: over, z1: 0, dtMs }) > GTA_SPEED_LIMIT);
  assert.equal(speedFromDisplacement({ x0: 0, z0: 0, x1: 3000, z1: 0, dtMs }), null);
  assert.equal(playerSpeedMph({ speed: 140, location: {} }, null, 10_000), 140);
  assert.equal(playerSpeedMph(
    { speed: 40, location: { x: 800, z: 0 } },
    { x: 0, z: 0, at: 0 },
    5000,
  ), 40);
});

function fixture() {
  let time = 0;
  let players = [];
  const commands = [];
  const service = createGtaSpeeding({
    now: () => time,
    snapshot: async () => players,
    send: async (command, shouldExecute) => {
      if (shouldExecute && !await shouldExecute()) return false;
      commands.push(command);
    },
  });
  return {
    commands,
    set(next, at) {
      if (at != null) time = at;
      players = next;
    },
    advance(ms) { time += ms; },
    tick: () => service.tick(),
  };
}

function racer({ x = 0, z = 0, speed = null, exempt = false } = {}) {
  return {
    username: 'RacerOne',
    robloxId: '99',
    team: 'Civilian',
    enforcementExempt: exempt,
    speed,
    location: { x, z },
  };
}

function moveOverLimit(fromX = 0) {
  const dtMs = 5000;
  const distance = (GTA_SPEED_LIMIT + 20) / STUDS_PER_SECOND_TO_MPH * (dtMs / 1000);
  return { fromX, toX: fromX + distance, dtMs };
}

async function twoOverLimitTicks(f, startX = 0) {
  const first = moveOverLimit(startX);
  f.set([racer({ x: first.fromX })]);
  await f.tick();
  f.advance(first.dtMs);
  f.set([racer({ x: first.toX })]);
  await f.tick();
  f.advance(first.dtMs);
  const second = moveOverLimit(first.toX);
  f.set([racer({ x: second.toX })]);
  await f.tick();
  return second.toX;
}

test('a single over-limit snapshot does not warn or load', async () => {
  const f = fixture();
  const move = moveOverLimit();
  f.set([racer({ x: 0 })], 0);
  await f.tick();
  f.advance(move.dtMs);
  f.set([racer({ x: move.toX })]);
  await f.tick();
  assert.deepEqual(f.commands, []);
});

test('first GTA Speeding offense PMs a warning and does not load', async () => {
  const f = fixture();
  f.set([racer({ x: 0 })], 0);
  await twoOverLimitTicks(f, 0);
  assert.deepEqual(f.commands, [`:pm RacerOne ${GTA_SPEED_WARN_PM}`]);
  await f.tick();
  assert.equal(f.commands.length, 1);
});

test('speeding again within 3 minutes loads and PMs', async () => {
  const f = fixture();
  f.set([racer({ x: 0 })], 0);
  const afterWarn = await twoOverLimitTicks(f, 0);
  f.advance(5000);
  f.set([racer({ x: afterWarn })]);
  await f.tick();
  const afterRepeat = await twoOverLimitTicks(f, afterWarn);
  assert.ok(afterRepeat);
  assert.equal(f.commands[0], `:pm RacerOne ${GTA_SPEED_WARN_PM}`);
  assert.equal(f.commands[1], ':load RacerOne');
  assert.equal(f.commands[2], `:pm RacerOne ${GTA_SPEED_LOAD_PM}`);
});

test('a later offense after 3 minutes warns again instead of loading', async () => {
  const f = fixture();
  f.set([racer({ x: 0 })], 0);
  const afterWarn = await twoOverLimitTicks(f, 0);
  f.advance(5000);
  f.set([racer({ x: afterWarn })]);
  await f.tick();
  f.advance(GTA_SPEED_REPEAT_MS + 1000);
  f.set([racer({ x: afterWarn })]);
  await f.tick();
  await twoOverLimitTicks(f, afterWarn);
  assert.deepEqual(f.commands, [
    `:pm RacerOne ${GTA_SPEED_WARN_PM}`,
    `:pm RacerOne ${GTA_SPEED_WARN_PM}`,
  ]);
});

test('exempt staff are not warned or loaded', async () => {
  const f = fixture();
  const move = moveOverLimit();
  f.set([racer({ x: 0, exempt: true })], 0);
  await f.tick();
  f.advance(move.dtMs);
  f.set([racer({ x: move.toX, exempt: true })]);
  await f.tick();
  f.advance(move.dtMs);
  f.set([racer({ x: move.toX * 2, exempt: true })]);
  await f.tick();
  assert.deepEqual(f.commands, []);
});
