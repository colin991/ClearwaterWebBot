import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import command from '../prefixCommands/eco.js';
import {
  ECO_IDS,
  ECO_PANEL_CHANNEL_ID,
  buildDepartmentFundsPanel,
  buildEconomyHomePanel,
  buildJobsPanel,
  buildRobberyPanel,
  handleEconomyInteraction,
} from '../utils/economyPanel.js';

function textOf(payload) {
  return JSON.stringify(payload);
}

test('-eco requires Administrator permission', async () => {
  await assert.rejects(
    () => command.execute({ member: { permissions: { has: () => false } } }),
    /Administrator/,
  );
});

test('-eco posts the home panel in the economy channel', async () => {
  const sent = [];
  const replies = [];
  await command.execute({
    member: { permissions: { has: (bit) => bit === PermissionFlagsBits.Administrator } },
    reply: async (payload) => { replies.push(payload); },
    client: {
      channels: {
        cache: {
          get: (id) => (id === ECO_PANEL_CHANNEL_ID
            ? { id, isTextBased: () => true, send: async (payload) => { sent.push(payload); return { id: 'msg', channelId: id }; } }
            : null),
        },
      },
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(Boolean(sent[0].flags & MessageFlags.IsComponentsV2), true);
  assert.match(textOf(sent[0]), /Clearwater Economy/);
  assert.match(textOf(sent[0]), new RegExp(ECO_IDS.robberies));
  assert.match(textOf(sent[0]), new RegExp(ECO_IDS.send));
  assert.match(textOf(replies[0]), /Economy panel posted/);
});

test('economy sub-panels match the robbery, jobs, and department layouts', () => {
  assert.match(textOf(buildEconomyHomePanel()), /Robberies/);
  assert.match(textOf(buildRobberyPanel()), /Robbery System/);
  assert.match(textOf(buildRobberyPanel()), /Bank Heist/);
  assert.match(textOf(buildRobberyPanel()), /Cash Register Robbery/);
  assert.match(textOf(buildJobsPanel()), /Jobs & Paychecks/);
  assert.match(textOf(buildJobsPanel()), /View Public Jobs/);
  assert.match(textOf(buildDepartmentFundsPanel()), /Department Funds/);
  assert.match(textOf(buildDepartmentFundsPanel()), /Florida Highway Patrol/);
  assert.match(textOf(buildDepartmentFundsPanel()), /Pinellas County 911 Center/);
  assert.match(textOf(buildDepartmentFundsPanel()), /Belleair Police Department/);
  assert.match(textOf(buildDepartmentFundsPanel()), /Clearwater Fire & Rescue/);
  assert.doesNotMatch(textOf(buildDepartmentFundsPanel()), /Clearwater Police Department/);
  assert.equal(Boolean(buildRobberyPanel().flags & MessageFlags.Ephemeral), true);
});

test('economy buttons open the matching panel or a coming-soon card', async () => {
  const replies = [];
  const click = (customId) => handleEconomyInteraction({
    isButton: () => true,
    customId,
    reply: async (payload) => { replies.push(payload); },
  });

  assert.equal(await click(ECO_IDS.robberies), true);
  assert.match(textOf(replies.at(-1)), /Robbery System/);
  assert.equal(await click(ECO_IDS.jobs), true);
  assert.match(textOf(replies.at(-1)), /Jobs & Paychecks/);
  assert.equal(await click(ECO_IDS.departments), true);
  assert.match(textOf(replies.at(-1)), /Department Funds/);
  assert.equal(await click(ECO_IDS.send), true);
  assert.match(textOf(replies.at(-1)), /not wired up yet/);
  assert.equal(await click('market:other'), false);
});
