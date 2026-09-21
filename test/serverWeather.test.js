import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEATHER_CHANCES,
  WEATHER_PROTECTED_USERNAME,
  WEATHER_SPIN_MS,
  createServerWeatherService,
  isWeatherProtectedPlayer,
  pickWeather,
  weatherCommand,
  weatherProtectedIsOnline,
} from '../utils/serverWeather.js';

test('weather chances sum to 100 and map to ER:LC commands', () => {
  assert.equal(WEATHER_PROTECTED_USERNAME, 'notj3dah');
  assert.equal(WEATHER_SPIN_MS, 30 * 60 * 1000);
  assert.equal(WEATHER_CHANCES.reduce((sum, entry) => sum + entry.weight, 0), 100);
  assert.equal(weatherCommand('clear'), ':weather clear');
  assert.equal(weatherCommand('rain'), ':weather rain');
  assert.equal(weatherCommand('fog'), ':weather fog');
  assert.equal(weatherCommand('thunderstorm'), ':weather thunderstorm');
});

test('the wheel uses Clear 65, rain 15, fog 11, thunderstorms 9', () => {
  assert.equal(pickWeather(() => 0), 'clear');
  assert.equal(pickWeather(() => 0.649), 'clear');
  assert.equal(pickWeather(() => 0.65), 'rain');
  assert.equal(pickWeather(() => 0.799), 'rain');
  assert.equal(pickWeather(() => 0.80), 'fog');
  assert.equal(pickWeather(() => 0.909), 'fog');
  assert.equal(pickWeather(() => 0.91), 'thunderstorm');
  assert.equal(pickWeather(() => 0.999), 'thunderstorm');
});

test('notj3dah is detected in the player list without respecting letter case', () => {
  assert.equal(isWeatherProtectedPlayer({ username: 'NotJ3dah' }), true);
  assert.equal(isWeatherProtectedPlayer({ username: 'someoneelse' }), false);
  assert.equal(weatherProtectedIsOnline([{ username: 'Alpha' }, { username: 'notj3dah' }]), true);
  assert.equal(weatherProtectedIsOnline([{ username: 'Alpha' }]), false);
});

function weatherFixture({ players = [], time = 1_000, random = () => 0.0, stored = {} } = {}) {
  const commands = [];
  const service = createServerWeatherService({
    now: () => time,
    random,
    load: async () => stored,
    save: async (value) => { stored = value; },
    snapshot: async () => ({ players }),
    send: async (command) => { commands.push(command); },
  });
  return {
    service,
    commands,
    setTime: (value) => { time = value; },
    setPlayers: (value) => { players = value; },
    setRandom: (value) => { random = value; },
  };
}

test('spins weather when notj3dah is not in-game', async () => {
  const f = weatherFixture({ players: [{ username: 'Alpha' }], random: () => 0.70 });
  await f.service.tick();
  assert.deepEqual(f.commands, [':weather rain']);
  assert.equal(f.service.state.currentWeather, 'rain');
  assert.equal(f.service.state.nextSpinAt, 1_000 + WEATHER_SPIN_MS);
});

test('does not spin while notj3dah is in-game and forces clear if needed', async () => {
  const f = weatherFixture({
    players: [{ username: 'notj3dah' }],
    random: () => 0.99,
    stored: { currentWeather: 'rain', nextSpinAt: 1, protectedOnline: false },
  });
  await f.service.tick();
  assert.deepEqual(f.commands, [':weather clear']);
  assert.equal(f.service.state.currentWeather, 'clear');
  assert.equal(f.service.state.nextSpinAt, 1_000 + WEATHER_SPIN_MS);
});

test('joining while weather is not clear sets it to clear', async () => {
  const f = weatherFixture({
    players: [{ username: 'notj3dah' }],
    stored: { currentWeather: 'fog', nextSpinAt: 9e12, protectedOnline: false },
  });
  await f.service.tick();
  assert.deepEqual(f.commands, [':weather clear']);
});

test('staying in-game on already-clear weather does not resend the command', async () => {
  const f = weatherFixture({
    players: [{ username: 'notj3dah' }],
    stored: { currentWeather: 'clear', nextSpinAt: 1, protectedOnline: true },
  });
  await f.service.tick();
  assert.deepEqual(f.commands, []);
});

test('overdue spins wait until 30 minutes after notj3dah leaves', async () => {
  let time = 50_000;
  let players = [{ username: 'notj3dah' }];
  const commands = [];
  const service = createServerWeatherService({
    now: () => time,
    random: () => 0.70,
    load: async () => ({ currentWeather: 'clear', nextSpinAt: 1 }),
    save: async () => {},
    snapshot: async () => ({ players }),
    send: async (command) => { commands.push(command); },
  });
  await service.tick();
  assert.deepEqual(commands, []);
  assert.equal(service.state.nextSpinAt, 50_000 + WEATHER_SPIN_MS);
  players = [{ username: 'Alpha' }];
  time = 50_000 + WEATHER_SPIN_MS - 1;
  await service.tick();
  assert.equal(commands.length, 0);
  time = 50_000 + WEATHER_SPIN_MS;
  await service.tick();
  assert.deepEqual(commands, [':weather rain']);
});

test('waits 30 minutes before the next spin', async () => {
  let time = 1_000;
  let players = [{ username: 'Alpha' }];
  const commands = [];
  const service = createServerWeatherService({
    now: () => time,
    random: () => 0,
    load: async () => ({}),
    save: async () => {},
    snapshot: async () => ({ players }),
    send: async (command) => { commands.push(command); },
  });
  await service.tick();
  assert.deepEqual(commands, [':weather clear']);
  time = 1_000 + WEATHER_SPIN_MS - 1;
  await service.tick();
  assert.equal(commands.length, 1);
  time = 1_000 + WEATHER_SPIN_MS;
  await service.tick();
  assert.equal(commands.length, 2);
  assert.equal(commands[1], ':weather clear');
});
