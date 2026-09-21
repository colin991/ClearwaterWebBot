import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VEHICLE_PRESET_REPEAT_PM,
  VEHICLE_PRESET_WARN_PM,
  createVehiclePresetMonitor,
  isColorLikeTexture,
  isUtilityVehicle,
  needsServerSavedPreset,
  usesServerSavedPreset,
} from '../utils/vehiclePreset.js';

test('named liveries count as server saved presets; colors and Standard do not', () => {
  assert.equal(usesServerSavedPreset({ texture: 'Clearwater PD' }), true);
  assert.equal(usesServerSavedPreset({ texture: 'PCSO Patrol' }), true);
  assert.equal(usesServerSavedPreset({ texture: 'Standard', colorName: 'Red', colorHex: '#FF0000' }), false);
  assert.equal(usesServerSavedPreset({ texture: 'Unmarked' }), false);
  assert.equal(usesServerSavedPreset({ texture: 'Slicktop' }), false);
  assert.equal(usesServerSavedPreset({ texture: '' }), false);
  assert.equal(usesServerSavedPreset({ texture: 'Really black' }), false);
  assert.equal(usesServerSavedPreset({ texture: 'Sand yellow metallic' }), false);
  assert.equal(usesServerSavedPreset({ texture: 'Navy blue', colorName: 'Navy blue' }), false);
  assert.equal(isColorLikeTexture('Institutional white'), true);
  assert.equal(isColorLikeTexture('Bright red'), true);
  assert.equal(isUtilityVehicle({ name: 'ATV Quad' }), true);
  assert.equal(isUtilityVehicle({ name: 'Chevlon Corvette' }), false);
});

test('only emergency teams are asked to use a server saved preset', () => {
  const vehicles = [{
    name: 'Interceptor',
    ownerUsername: 'CopOne',
    ownerRobloxId: '1',
    texture: 'Really black',
    plate: 'SH-1',
  }];
  assert.equal(needsServerSavedPreset({ username: 'CopOne', robloxId: '1', team: 'Police' }, vehicles)?.name, 'Interceptor');
  assert.equal(needsServerSavedPreset({ username: 'CopOne', robloxId: '1', team: 'Civilian' }, vehicles), null);
  assert.equal(needsServerSavedPreset({
    username: 'CopOne',
    robloxId: '1',
    team: 'Sheriff',
  }, [{ ...vehicles[0], texture: 'PCSO Sheriff' }]), null);
});

test('warns after two snapshots, then reminds, and stops once a preset is on', async () => {
  let players = [{ username: 'UnitOne', robloxId: '9', team: 'Police' }];
  let vehicles = [{
    name: 'Interceptor',
    ownerUsername: 'UnitOne',
    ownerRobloxId: '9',
    texture: 'Really black',
    plate: '1',
  }];
  const commands = [];
  let now = 1_000;
  const monitor = createVehiclePresetMonitor({
    snapshot: async () => ({ players, vehicles }),
    send: async (command) => { commands.push(command); return true; },
    now: () => now,
  });

  await monitor.tick();
  assert.deepEqual(commands, []);
  await monitor.tick();
  assert.deepEqual(commands, [`:pm UnitOne ${VEHICLE_PRESET_WARN_PM}`]);
  await monitor.tick();
  assert.equal(commands.length, 1);

  now += 91_000;
  await monitor.tick();
  assert.equal(commands.at(-1), `:pm UnitOne ${VEHICLE_PRESET_REPEAT_PM}`);

  vehicles = [{ ...vehicles[0], texture: 'Clearwater PD' }];
  now += 91_000;
  await monitor.tick();
  assert.equal(commands.length, 2);
});

test('does not PM civilians, exempt players, or utility vehicles', async () => {
  const commands = [];
  const monitor = createVehiclePresetMonitor({
    snapshot: async () => ({
      players: [
        { username: 'CivOne', robloxId: '1', team: 'Civilian' },
        { username: 'StaffOne', robloxId: '2', team: 'Police', enforcementExempt: true },
        { username: 'DotOne', robloxId: '3', team: 'DOT' },
      ],
      vehicles: [
        { name: 'Navara', ownerUsername: 'CivOne', ownerRobloxId: '1', texture: 'Really black' },
        { name: 'Interceptor', ownerUsername: 'StaffOne', ownerRobloxId: '2', texture: 'Standard' },
        { name: 'ATV', ownerUsername: 'DotOne', ownerRobloxId: '3', texture: 'Really black' },
      ],
    }),
    send: async (command) => { commands.push(command); return true; },
  });
  await monitor.tick();
  await monitor.tick();
  assert.deepEqual(commands, []);
});
