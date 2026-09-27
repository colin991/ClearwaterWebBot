import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PINELLAS_SHIFT_LOOKUP_ID,
  deputyForLookup,
  handlePinellasShiftPanelInteraction,
  loadShiftPanelSnapshot,
  seedPinellasShiftSnapshot,
} from '../utils/pinellasShiftPanel.js';

test('Deputy Lookup always sends the card from the posted 30s list', async () => {
  seedPinellasShiftSnapshot({
    deputies: [{
      discordId: '1000',
      callsign: '1000',
      roleplayName: 'N. Richards',
      rankName: 'Sheriff',
      thisShiftMs: 20 * 60_000,
      totalWaveMs: 20 * 60_000,
      locationLabel: 'Not in game',
      voiceLabel: 'Not in VC',
      mapLeft: null,
      mapTop: null,
    }],
  });

  const replies = [];
  const interaction = {
    customId: PINELLAS_SHIFT_LOOKUP_ID,
    isStringSelectMenu: () => true,
    values: ['1000'],
    client: {
      guilds: { cache: { get: () => null }, fetch: async () => null },
    },
    deferReply: async () => {},
    editReply: async (payload) => { replies.push(payload); },
  };

  const ok = await handlePinellasShiftPanelInteraction(interaction);
  assert.equal(ok, true);
  assert.equal(replies.length, 1);
  assert.ok(replies[0].components);
  assert.doesNotMatch(JSON.stringify(replies[0]), /busy right now|rate limited/i);
});

test('Deputy Lookup still sends a card if that deputy is missing from the cached list', async () => {
  seedPinellasShiftSnapshot({ deputies: [] });
  const replies = [];
  const interaction = {
    customId: PINELLAS_SHIFT_LOOKUP_ID,
    isStringSelectMenu: () => true,
    values: ['555'],
    client: {
      guilds: { cache: { get: () => null }, fetch: async () => null },
    },
    deferReply: async () => {},
    editReply: async (payload) => { replies.push(payload); },
  };
  await handlePinellasShiftPanelInteraction(interaction);
  assert.ok(replies[0].components);
  assert.doesNotMatch(JSON.stringify(replies[0]), /busy right now|try again/i);
  assert.equal(deputyForLookup({ deputies: [] }, '555').discordId, '555');
});

test('loadShiftPanelSnapshot keeps the posted list when a refresh is not requested', async () => {
  const posted = { deputies: [{ discordId: '1' }] };
  seedPinellasShiftSnapshot(posted);
  const snapshot = await loadShiftPanelSnapshot({
    guilds: { cache: { get: () => null }, fetch: async () => null },
  });
  assert.equal(snapshot, posted);
});
