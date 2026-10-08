import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRE_MELONLY_DEPARTMENT_ID,
  FIRE_SHIFT_LOOKUP_ID,
  FIRE_SHIFT_PANEL_CHANNEL_ID,
  buildFireShiftPanelPayload,
  fireIdentityForMembers,
  fireRankNamesForMember,
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
      locationLabel: 'Fire Station 1, Freedom Avenue, Postal 213',
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
  assert.match(serialized, /Fire Station 1, Freedom Avenue, Postal 213/);
  assert.match(serialized, /1h 10m/);

  const row = json.components.find((component) => component.type === 1);
  const select = row.components[0];
  assert.equal(select.custom_id, FIRE_SHIFT_LOOKUP_ID);
  assert.equal(select.placeholder, 'Personnel Lookup');
  assert.equal(select.options[0].label, 'F-004, Judah Briggs');
  assert.equal(select.options[0].description, 'District Chief');
});

test('Fire personnel can display both a fire rank and a medical rank', () => {
  const roleIds = new Set([
    '1514804886418755597',
    '1514804886368288856',
    // A lower Fire role must not replace the member's highest Fire rank.
    '1514804886393458854',
  ]);
  assert.deepEqual(
    fireRankNamesForMember({ roles: { cache: { has: (id) => roleIds.has(id) } } }),
    ['District Chief', 'Paramedic'],
  );
});

test('Fire personnel without a configured rank are unranked', () => {
  assert.deepEqual(
    fireRankNamesForMember({ roles: { cache: { has: () => false } } }),
    [],
  );
  const payload = buildFireShiftPanelPayload({
    personnel: [{
      discordId: '1044686997194805280',
      callsign: 'F-100',
      rankName: 'Unranked',
      name: 'New Member',
      shiftMs: 60_000,
    }],
  });
  assert.match(JSON.stringify(payload.components[0].toJSON()), /F-100, Unranked, New Member/);
});

test('Fire identity uses the main-server nickname and Fire-server rank roles', () => {
  const fireRoleIds = new Set(['1514804886418755597', '1514804886368288856']);
  const identity = fireIdentityForMembers(
    {
      displayName: 'Different Fire Nickname',
      roles: { cache: { has: (id) => fireRoleIds.has(id) } },
      user: { username: 'fire-user' },
    },
    {
      nickname: 'F-004 | Judah Briggs',
      displayName: 'F-004 | Judah Briggs',
      user: { username: 'main-user' },
    },
  );
  assert.equal(identity.callsign, 'F-004');
  assert.equal(identity.name, 'Judah Briggs');
  assert.equal(identity.rankName, 'District Chief / Paramedic');
});
