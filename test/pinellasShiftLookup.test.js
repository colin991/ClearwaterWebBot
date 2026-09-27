import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PINELLAS_SHIFT_LOOKUP_ID,
  handlePinellasShiftPanelInteraction,
  isMelonlyBusyError,
  loadShiftPanelSnapshot,
  pinellasShiftPanelBusyText,
  seedPinellasShiftSnapshot,
} from '../utils/pinellasShiftPanel.js';

test('Melonly 429 messages are treated as busy, not shown raw to deputies', () => {
  assert.equal(isMelonlyBusyError({ status: 429, message: 'Melonly rate limited — try again in ~42s.' }), true);
  assert.match(pinellasShiftPanelBusyText(), /on-shift list on the panel/i);
  assert.equal(isMelonlyBusyError(new Error('map render failed')), false);
});

test('Deputy Lookup uses the last posted snapshot instead of calling Melonly', async () => {
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
  assert.doesNotMatch(JSON.stringify(replies[0]), /rate limited/i);
});

test('loadShiftPanelSnapshot keeps the posted list when a refresh is not requested', async () => {
  const posted = { deputies: [{ discordId: '1' }] };
  seedPinellasShiftSnapshot(posted);
  const snapshot = await loadShiftPanelSnapshot({
    guilds: { cache: { get: () => null }, fetch: async () => null },
  });
  assert.equal(snapshot, posted);
});
