import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRE_MELONLY_DEPARTMENT_ID,
  FIRE_SHIFT_LOOKUP_ID,
  FIRE_SHIFT_PANEL_CHANNEL_ID,
  buildFireShiftPanelPayload,
} from '../utils/fireShiftPanel.js';

test('Fire shift panel targets the configured channel and department', () => {
  assert.equal(FIRE_SHIFT_PANEL_CHANNEL_ID, '1557563004986589296');
  assert.equal(FIRE_MELONLY_DEPARTMENT_ID, '7471029576076890112');
});

test('Fire shift panel renders live personnel and a lookup menu without pings', () => {
  const payload = buildFireShiftPanelPayload({
    personnel: [{
      discordId: '1044686997194805280',
      callsign: 'F-004',
      rankName: 'District Chief',
      name: 'Judah Briggs',
      shiftMs: 4_200_000,
    }],
  });
  const json = payload.components[0].toJSON();
  const serialized = JSON.stringify(json);

  assert.equal(payload.flags, 32768);
  assert.deepEqual(payload.allowedMentions, {
    parse: [], users: [], roles: [], repliedUser: false,
  });
  assert.match(serialized, /cwfd_2\.png/);
  assert.match(serialized, /cwfd_footer_2\.png/);
  assert.match(serialized, /On Shift \(1\)/);
  assert.match(serialized, /F-004, District Chief, Judah Briggs/);
  assert.match(serialized, /1h 10m/);

  const row = json.components.find((component) => component.type === 1);
  const select = row.components[0];
  assert.equal(select.custom_id, FIRE_SHIFT_LOOKUP_ID);
  assert.equal(select.placeholder, 'Personnel Lookup');
  assert.equal(select.options[0].label, 'F-004, Judah Briggs');
  assert.equal(select.options[0].description, 'District Chief');
});
