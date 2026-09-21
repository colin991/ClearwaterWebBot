import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICE_ALLOWED_CARS,
  POLICE_CAR_PM,
  createPoliceCarMonitor,
  disallowedPoliceCar,
  isAllowedPoliceCar,
  policeCarDmText,
} from '../utils/policeCars.js';

test('only the four listed Police cars are allowed', () => {
  assert.equal(isAllowedPoliceCar({ name: 'Falcon Advance XET' }), true);
  assert.equal(isAllowedPoliceCar({ name: '2015 Bullhorn Prancer' }), true);
  assert.equal(isAllowedPoliceCar({ name: '2021 Chevlon Camion' }), true);
  assert.equal(isAllowedPoliceCar({ name: '2024 FPIU' }), true);
  assert.equal(isAllowedPoliceCar({ name: '2024 Falcon Interceptor Utility' }), true);
  assert.equal(isAllowedPoliceCar({ name: 'Interceptor' }), false);
  assert.equal(isAllowedPoliceCar({ name: 'Chevlon Camion' }), false);
  assert.equal(isAllowedPoliceCar({ name: '2018 Bullhorn Prancer' }), false);
  assert.equal(POLICE_ALLOWED_CARS.length, 4);
});

test('only Police team drivers in a blocked car are flagged', () => {
  const vehicles = [{
    name: 'Interceptor',
    ownerUsername: 'CopOne',
    ownerRobloxId: '1',
  }];
  assert.equal(disallowedPoliceCar({ username: 'CopOne', robloxId: '1', team: 'Police' }, vehicles)?.name, 'Interceptor');
  assert.equal(disallowedPoliceCar({ username: 'CopOne', robloxId: '1', team: 'Sheriff' }, vehicles), null);
  assert.equal(disallowedPoliceCar({
    username: 'CopOne',
    robloxId: '1',
    team: 'Police',
  }, [{ ...vehicles[0], name: 'Falcon Advance XET' }]), null);
});

test('PMs after grace, DMs once, then PMs again after 3 minutes', async () => {
  const players = [{ username: 'UnitOne', robloxId: '9', team: 'Police' }];
  const vehicles = [{
    name: 'Interceptor',
    ownerUsername: 'UnitOne',
    ownerRobloxId: '9',
  }];
  const commands = [];
  const dms = [];
  let now = 1_000;
  const monitor = createPoliceCarMonitor({
    snapshot: async () => ({
      players,
      vehicles,
        members: new Map([['123456789012345678', { id: '123456789012345678' }]]),
        identities: { '123456789012345678': { robloxId: '9' } },
    }),
    send: async (command) => { commands.push(command); return true; },
    dmDiscord: async (id, payload) => { dms.push({ id, payload }); },
    now: () => now,
  });

  await monitor.tick();
  assert.deepEqual(commands, []);
  assert.deepEqual(dms, []);
  await monitor.tick();
  assert.deepEqual(commands, [`:pm UnitOne ${POLICE_CAR_PM}`]);
  assert.equal(dms[0].id, '123456789012345678');
  assert.match(JSON.stringify(dms[0].payload), /Falcon Advance XET/);
  assert.match(policeCarDmText(vehicles[0]), /Interceptor/);

  await monitor.tick();
  assert.equal(commands.length, 1);
  assert.equal(dms.length, 1);

  now += 3 * 60 * 1000;
  await monitor.tick();
  assert.equal(commands.length, 2);
  assert.equal(dms.length, 1);
});
