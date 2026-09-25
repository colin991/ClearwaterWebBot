import assert from 'node:assert/strict';
import test from 'node:test';
import { BELLEAIR_GUILD_ID } from '../utils/belleairServer.js';
import {
  COMMAND_SCOPE,
  commandAllowedInGuild,
  rejectWrongGuild,
  slashCommandsForGuild,
} from '../utils/commandGuilds.js';
import { PINELLAS_GUILD_ID } from '../utils/pinellasServer.js';
import { requestPinellasTicketClose } from '../utils/pinellasSupport.js';
import cr from '../prefixCommands/cr.js';
import infract from '../commands/infract.js';
import ping from '../commands/ping.js';

test('PCSO commands are scoped to the Pinellas Discord', () => {
  assert.equal(COMMAND_SCOPE.pcso, PINELLAS_GUILD_ID);
  assert.equal(COMMAND_SCOPE.bpd, BELLEAIR_GUILD_ID);
  assert.deepEqual(cr.guildIds, [PINELLAS_GUILD_ID]);
  assert.equal(commandAllowedInGuild(cr, PINELLAS_GUILD_ID), true);
  assert.equal(commandAllowedInGuild(cr, BELLEAIR_GUILD_ID), false);
  assert.equal(commandAllowedInGuild(cr, '1514026810348671026'), false);
  assert.equal(commandAllowedInGuild(ping, BELLEAIR_GUILD_ID), true);
});

test('PCSO slash commands are not registered in other guilds', () => {
  const main = slashCommandsForGuild([ping, infract], '1514026810348671026');
  const pcso = slashCommandsForGuild([ping, infract], PINELLAS_GUILD_ID);
  const bpd = slashCommandsForGuild([ping, infract], BELLEAIR_GUILD_ID);
  assert.deepEqual(main.map((command) => command.name), ['ping']);
  assert.deepEqual(pcso.map((command) => command.name).sort(), ['infract', 'ping']);
  assert.deepEqual(bpd.map((command) => command.name), ['ping']);
});

test('wrong-guild errors stay silent', () => {
  assert.throws(() => rejectWrongGuild(), (error) => error.code === 'WRONG_GUILD');
});

test('-cr does nothing outside the PCSO server', async () => {
  const replies = [];
  await requestPinellasTicketClose({
    guild: { id: BELLEAIR_GUILD_ID },
    channel: {
      send: async (payload) => { replies.push(payload); },
      topic: 'ticket-owner:1 ticket-type:general',
    },
  });
  assert.deepEqual(replies, []);
});
