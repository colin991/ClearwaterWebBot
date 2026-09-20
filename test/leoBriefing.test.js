import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEFING_END_MESSAGE,
  BRIEFING_PEACE_SECONDS,
  BRIEFING_PREFIX,
  BRIEFING_ROADS_LAYOUT,
  BRIEFING_START_MESSAGE,
  BRIEFING_WALLS_LAYOUT,
  briefingLayoutCommand,
  briefingPanel,
  createLeoBriefingService,
  handleLeoBriefing,
  isLeoTeam,
  leoPlayers,
  parseBriefingButton,
} from '../utils/leoBriefing.js';

test('police and sheriff count as LEO; fire and civilian do not', () => {
  assert.equal(isLeoTeam('Police'), true);
  assert.equal(isLeoTeam('Sheriff'), true);
  assert.equal(isLeoTeam('sheriff_team'), true);
  assert.equal(isLeoTeam('Civilian'), false);
  assert.equal(isLeoTeam('Fire'), false);
  assert.equal(leoPlayers([
    { username: 'Cop', team: 'Police' },
    { username: 'Dep', team: 'Sheriff' },
    { username: 'Civ', team: 'Civilian' },
  ]).map((player) => player.username).join(','), 'Cop,Dep');
});

test('layout commands load and unload the briefing map names', () => {
  assert.equal(briefingLayoutCommand('load', BRIEFING_WALLS_LAYOUT), ':loadlayout "BRIEFING WALLS"');
  assert.equal(briefingLayoutCommand('unload', BRIEFING_ROADS_LAYOUT), ':unloadlayout "BRIEFING ROAD BLOCKS"');
  assert.equal(BRIEFING_PEACE_SECONDS, 1200);
});

test('briefing button ids stay distinct', () => {
  assert.deepEqual(parseBriefingButton(`${BRIEFING_PREFIX}roads:on`), { action: 'roads-on' });
  assert.deepEqual(parseBriefingButton(`${BRIEFING_PREFIX}roads:off`), { action: 'roads-off' });
  assert.deepEqual(parseBriefingButton(`${BRIEFING_PREFIX}end`), { action: 'end' });
  assert.equal(parseBriefingButton('prq:approve:p1'), null);
});

function briefingFixture() {
  const commands = [];
  const dms = [];
  const moves = [];
  const stored = { active: false };
  const svc = createLeoBriefingService({
    now: () => 1,
    load: async () => stored,
    save: async (value) => { Object.assign(stored, value); },
    send: async (command) => { commands.push(command); },
    snapshot: async () => ({
      Players: [
        { Player: 'Cop:1', Team: 'Police' },
        { Player: 'Civ:2', Team: 'Civilian' },
      ],
    }),
    dmUser: async (id, payload) => { dms.push({ id, payload }); },
    moveLeoMembers: async ({ voiceChannelId, players }) => {
      moves.push({ voiceChannelId, names: players.map((player) => player.username) });
      return { moved: players.map((player) => player.username), skipped: [] };
    },
  });
  return { svc, commands, dms, moves, stored };
}

test('starting a briefing drags LEO, PMs the server, sets peace, and loads walls', async () => {
  const f = briefingFixture();
  const result = await f.svc.start({ user: { id: 'admin' }, voiceChannelId: 'vc1' });
  assert.deepEqual(f.moves[0].names, ['Cop']);
  assert.deepEqual(f.commands, [
    `:m ${BRIEFING_START_MESSAGE}`,
    `:pt ${BRIEFING_PEACE_SECONDS}`,
    ':loadlayout "BRIEFING WALLS"',
  ]);
  assert.equal(f.dms[0].id, 'admin');
  assert.match(JSON.stringify(f.dms[0].payload), /Load road blocks/);
  assert.equal(f.stored.active, true);
  assert.equal(result.moved.moved[0], 'Cop');
});

test('road blocks load and unload from the DM panel', async () => {
  const f = briefingFixture();
  await f.svc.start({ user: { id: 'admin' }, voiceChannelId: 'vc1' });
  f.commands.length = 0;
  await f.svc.setRoadBlocks(true);
  assert.deepEqual(f.commands, [':loadlayout "BRIEFING ROAD BLOCKS"']);
  f.commands.length = 0;
  const panel = await f.svc.setRoadBlocks(false);
  assert.deepEqual(f.commands, [':unloadlayout "BRIEFING ROAD BLOCKS"']);
  assert.match(JSON.stringify(panel.panel), /Load road blocks/);
});

test('ending unloads both layouts and announces that roleplay can start', async () => {
  const f = briefingFixture();
  await f.svc.start({ user: { id: 'admin' }, voiceChannelId: 'vc1' });
  await f.svc.setRoadBlocks(true);
  f.commands.length = 0;
  const ended = await f.svc.end();
  assert.deepEqual(f.commands, [
    ':unloadlayout "BRIEFING WALLS"',
    ':unloadlayout "BRIEFING ROAD BLOCKS"',
    `:m ${BRIEFING_END_MESSAGE}`,
  ]);
  assert.equal(f.stored.active, false);
  assert.match(JSON.stringify(ended.panel), /Ended/);
  assert.match(JSON.stringify(briefingPanel(ended.state)), /disabled":true/);
});

test('a second briefing is blocked until the first ends', async () => {
  const f = briefingFixture();
  await f.svc.start({ user: { id: 'admin' }, voiceChannelId: 'vc1' });
  await assert.rejects(
    () => f.svc.start({ user: { id: 'admin' }, voiceChannelId: 'vc1' }),
    /already running/,
  );
});

test('briefing DM buttons still work when customId is on the component payload', async () => {
  const f = briefingFixture();
  await f.svc.start({ user: { id: 'admin' }, voiceChannelId: 'vc1' });
  f.commands.length = 0;
  let edited = null;
  const interaction = {
    customId: '',
    component: { data: { custom_id: `${BRIEFING_PREFIX}roads:on` } },
    user: { id: 'admin' },
    client: {
      leoBriefing: f.svc,
      config: { guildId: 'g1' },
    },
    memberPermissions: { has: () => true },
    isChatInputCommand: () => false,
    deferUpdate: async () => {},
    editReply: async (payload) => { edited = payload; },
  };
  assert.equal(await handleLeoBriefing(interaction), true);
  assert.deepEqual(f.commands, [':loadlayout "BRIEFING ROAD BLOCKS"']);
  assert.match(JSON.stringify(edited), /Unload road blocks/);
});
