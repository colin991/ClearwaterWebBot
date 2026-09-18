import test from 'node:test';
import assert from 'node:assert/strict';
import { ENFORCEMENT_EXEMPT_ROLE, hasEnforcementExemption, isVcExempt } from '../utils/enforcementExemptions.js';
import { createVcChecks } from '../utils/vcChecks.js';
import { createSheriffBalance } from '../utils/sheriffBalance.js';
import { enforceSecondaryGateMember, SECONDARY_GATE_GUILD_ID, SECONDARY_GATE_MAIN_GUILD_ID } from '../utils/secondaryServerGate.js';
import { resetVcWhitelistForTests } from '../utils/vcWhitelist.js';

test('VC usernames match exactly ignoring case and do not grant Sheriff exemptions', () => {
  resetVcWhitelistForTests({ entries: [] });
  for (const username of ['Coleddev13', 'NOTJ3DAH']) {
    assert.equal(isVcExempt({ username }, new Map()), true);
    assert.equal(hasEnforcementExemption({ username }, new Map()), false);
  }
  assert.equal(isVcExempt({ username: 'Coleddev13Other' }, new Map()), false);
});
test('role exemption matches linked Roblox ID or Discord name and ends when role removed', () => {
  const roles = new Set([ENFORCEMENT_EXEMPT_ROLE]);
  const members = new Map([['d', { id: 'd', nickname: 'Rank | PlayerOne', roles: { cache: roles } }]]);
  assert.equal(hasEnforcementExemption({ username: 'PlayerOne' }, members), true);
  assert.equal(hasEnforcementExemption({ username: 'Different', robloxId: '1' }, members, { d: { robloxId: '1' } }), true);
  roles.clear();
  assert.equal(hasEnforcementExemption({ username: 'PlayerOne' }, members), false);
});
test('VC exemption releases tracked jail and sends no reminders', async () => {
  const calls = [];
  const service = createVcChecks({ load: async () => [['1', { jailed: true }]],
    snapshot: async () => ({ players: [{ robloxId: '1', username: 'Coleddev13' }, { robloxId: '2', username: 'notj3dah' }], members: new Map(), inVoice: () => false }),
    send: async c => calls.push(c) });
  await service.tick(); await service.tick();
  assert.deepEqual(calls, [':unjail Coleddev13']);
});
test('exempt Sheriff arrival can exceed 27 without enforcement', async () => {
  let players = Array.from({ length: 27 }, (_, i) => ({ robloxId: String(i), username: 'Player' + i, team: 'Sheriff' }));
  const calls = [];
  const service = createSheriffBalance({ snapshot: async () => players, send: async c => calls.push(c) });
  await service.tick(); players.push({ robloxId: '28', username: 'ExemptUser', team: 'Sheriff', enforcementExempt: true });
  await service.tick(); assert.deepEqual(calls, []);
});
test('server gate accepts exemption role alone from main server REST lookup', async () => {
  const client = { guilds: { cache: new Map([[SECONDARY_GATE_MAIN_GUILD_ID, {}]]) }, rest: { get: async () => ({ roles: [ENFORCEMENT_EXEMPT_ROLE] }) } };
  const result = await enforceSecondaryGateMember(client, { id: 'user', user: { bot: false }, guild: { id: SECONDARY_GATE_GUILD_ID, ownerId: 'owner' } });
  assert.equal(result, 'allowed');
});
