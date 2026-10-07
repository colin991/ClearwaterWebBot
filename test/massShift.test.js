import assert from 'node:assert/strict';
import test from 'node:test';
import massShiftCommand from '../commands/mass-shift.js';
import {
  FIRE_MASS_SHIFT_CHANNEL_ID,
  buildMassShiftPayload,
  massShiftChannelIdForGuild,
} from '../utils/pinellasMassShift.js';
import { FIRE_OPS_GUILD_ID } from '../utils/fireOpsServer.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';

const FIRE_ROLE_IDS = ['1514804886393458850', '1514804886368288854'];

test('mass shift command is registered in both department servers', () => {
  assert.deepEqual(massShiftCommand.guildIds, [PINELLAS_GUILD_ID, FIRE_OPS_GUILD_ID]);
  assert.equal(massShiftChannelIdForGuild(FIRE_OPS_GUILD_ID), FIRE_MASS_SHIFT_CHANNEL_ID);
});

test('fire mass shift payload includes branding, role pings, and attendance button', async () => {
  const payload = await buildMassShiftPayload({
    id: 'fire1234',
    guildId: FIRE_OPS_GUILD_ID,
    focus: 'Medical response coverage',
    initiatorId: '1044686997194805280',
    attendeeIds: ['1044686997194805280'],
    createdAt: '2026-10-07T01:30:00.000Z',
  });
  const json = payload.components[0].toJSON();
  const serialized = JSON.stringify(json);

  assert.equal(payload.flags, 32768);
  assert.deepEqual(payload.allowedMentions.roles, FIRE_ROLE_IDS);
  assert.match(serialized, /cwfd_1\.png/);
  assert.match(serialized, /cwfd_footer_1\.png/);
  assert.match(serialized, /1514804886393458850/);
  assert.match(serialized, /1514804886368288854/);
  assert.match(serialized, /Medical response coverage/);
  assert.match(serialized, /Attending Personnel \(1\)/);

  const section = json.components.find((component) => component.type === 9);
  assert.equal(section.accessory.label, 'Mark Attendance');
  assert.equal(section.accessory.custom_id, 'pcs:massshift:attend:fire1234');
  assert.equal(section.accessory.emoji.id, '1533917555910246511');
});
