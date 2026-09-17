import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractDiscordMessageText,
  migrateTicketStore,
} from '../utils/pcsoWebTickets.js';

test('legacy one-ticket-per-user store migrates to channel records', () => {
  const store = migrateTicketStore({
    tickets: {
      '1074411240757137589': {
        channelId: '1514848054724005938',
        webhookId: 'w',
        webhookToken: 't',
        type: 'general',
      },
    },
  });
  assert.equal(store.channels['1514848054724005938'].ownerId, '1074411240757137589');
  assert.equal(store.channels['1514848054724005938'].type, 'general');
});

test('website ticket text includes Discord components v2 content', () => {
  assert.equal(extractDiscordMessageText({ content: '<@1074411240757137589>' }), '');
  const text = extractDiscordMessageText({
    content: '',
    components: [
      {
        type: 17,
        components: [
          { type: 10, content: '# Welcome Deputy' },
          { type: 10, content: '**Inquiry - General Support**\n```Need a ride along.```' },
        ],
      },
    ],
  });
  assert.match(text, /Welcome Deputy/);
  assert.match(text, /Need a ride along/);
});
