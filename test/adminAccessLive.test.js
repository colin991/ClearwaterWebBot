import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import { hasAdminPanelAccess } from '../lib/admin-access.js';
import { liveWebsiteRoles } from '../utils/botApiServer.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';
import { CLEARWATER_GUILD_ID } from '../utils/staffRanks.js';

const ADMIN_ROLE = '1514033422270464070';

test('a live check that says no beats admin roles saved in the sign-in cookie', () => {
  const staleCookie = { id: '333333333333333333', discordAdmin: true, guildRoles: [ADMIN_ROLE] };
  assert.equal(hasAdminPanelAccess(staleCookie, { live: true, panelAccess: null, adminPanel: false }), false);
  assert.equal(hasAdminPanelAccess(staleCookie, { live: true, panelAccess: null, adminPanel: true }), true);
  // Without a live answer (bot offline) the signed login roles still work.
  assert.equal(hasAdminPanelAccess(staleCookie, { live: false, panelAccess: null }), true);
});

test('live website roles come from Discord, not the cookie', async () => {
  const guild = (id, members) => ({
    id,
    members: {
      async fetch({ user }) {
        if (!members[user]) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
        return members[user];
      },
    },
  });
  const member = (guildId, roles, admin) => ({
    guild: { id: guildId },
    roles: { cache: new Map([[guildId, {}], ...roles.map((role) => [role, {}])]) },
    permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator && admin },
  });
  const client = {
    guilds: {
      cache: new Map([
        [CLEARWATER_GUILD_ID, guild(CLEARWATER_GUILD_ID, {
          '444444444444444444': member(CLEARWATER_GUILD_ID, [ADMIN_ROLE], true),
          '555555555555555555': member(CLEARWATER_GUILD_ID, ['1'], false),
        })],
        [PINELLAS_GUILD_ID, guild(PINELLAS_GUILD_ID, {})],
      ]),
    },
  };
  assert.deepEqual(await liveWebsiteRoles(client, '444444444444444444'), { guildRoles: [ADMIN_ROLE], pinellasRoles: [], discordAdmin: true });
  const demoted = await liveWebsiteRoles(client, '555555555555555555');
  assert.equal(demoted.discordAdmin, false);
  assert.equal(hasAdminPanelAccess({ id: '555555555555555555', ...demoted }), false);
  assert.equal(await liveWebsiteRoles({ guilds: { cache: new Map() } }, '666666666666666666'), null);
});
