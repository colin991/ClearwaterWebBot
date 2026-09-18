import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import command from '../prefixCommands/ratelimit.js';

test('-ratelimit requires Administrator permission', async () => {
  await assert.rejects(
    () => command.execute({ member: { permissions: { has: () => false } } }),
    /Administrator/,
  );
});

test('-ratelimit replies with the ER:LC cooldown report', async () => {
  const replies = [];
  await command.execute({
    member: { permissions: { has: (bit) => bit === PermissionFlagsBits.Administrator } },
    reply: async (payload) => { replies.push(payload); },
  });
  assert.equal(replies.length, 1);
  const text = JSON.stringify(replies[0]);
  assert.match(text, /ER:LC Rate Limit/);
  assert.match(text, /Status:/);
});
