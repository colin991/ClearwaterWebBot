import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PINELLAS_SUPPORT_CLAIM_ID,
  PINELLAS_SUPPORT_CLOSE_ID,
  PINELLAS_SUPPORT_CR_NO_ID,
  PINELLAS_SUPPORT_CR_YES_ID,
  buildInquiryModal,
  buildTicketCloseRequestPayload,
  formatWebsiteInquiry,
  handlePinellasSupportInteraction,
  isPinellasSupportTicketChannel,
  ticketOwnerId,
  websiteTicketFields,
} from '../utils/pinellasSupport.js';

test('ticket owner is read from the channel topic', () => {
  assert.equal(ticketOwnerId({ topic: 'ticket-owner:1074411240757137589 ticket-type:compliance' }), '1074411240757137589');
  assert.equal(isPinellasSupportTicketChannel({ topic: 'general chat' }), false);
  assert.equal(isPinellasSupportTicketChannel({ topic: 'ticket-owner:1074411240757137589 ticket-type:general' }), true);
});

test('close request asks the opener to click Yes', () => {
  const payload = buildTicketCloseRequestPayload('1074411240757137589');
  assert.match(payload.content, /close request/i);
  assert.match(payload.content, /1074411240757137589/);
  const ids = payload.components[0].components.map((button) => button.data.custom_id);
  assert.deepEqual(ids, [PINELLAS_SUPPORT_CR_YES_ID, PINELLAS_SUPPORT_CR_NO_ID]);
  assert.equal(ids.includes(PINELLAS_SUPPORT_CLAIM_ID), false);
  assert.equal(ids.includes(PINELLAS_SUPPORT_CLOSE_ID), false);
});

test('OPC ticket modal asks who, why, and proof', () => {
  const modal = buildInquiryModal('compliance');
  const labels = modal.components.flatMap((row) => (
    row.components.map((input) => input.data.label)
  ));
  const ids = modal.components.flatMap((row) => (
    row.components.map((input) => input.data.custom_id)
  ));
  assert.deepEqual(labels, [
    'Who are you reporting?',
    'Why are you reporting this deputy?',
    'Do you have any proof of this?',
  ]);
  assert.deepEqual(ids, ['opc-who', 'opc-why', 'opc-proof']);
});

test('general support still asks what the user needs help with', () => {
  const modal = buildInquiryModal('general');
  const labels = modal.components.flatMap((row) => (
    row.components.map((input) => input.data.label)
  ));
  assert.deepEqual(labels, ['What do you need help with?']);
});

test('only the ticket opener can confirm -cr', async () => {
  let reply;
  const handled = await handlePinellasSupportInteraction({
    customId: PINELLAS_SUPPORT_CR_YES_ID,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: '99' },
    channel: { topic: 'ticket-owner:1074411240757137589 ticket-type:compliance' },
    reply: async (payload) => { reply = payload; },
  });
  assert.equal(handled, true);
  assert.match(String(reply.content), /ticket opener/);
});

test('website OPC ticket fields match Discord questions', () => {
  const labels = websiteTicketFields('compliance').map((field) => field.label);
  assert.deepEqual(labels, [
    'Who are you reporting?',
    'Why are you reporting this deputy?',
    'Do you have any proof of this?',
  ]);
  const inquiry = formatWebsiteInquiry('compliance', {
    'opc-who': 'Deputy Example',
    'opc-why': 'Policy issue on shift.',
    'opc-proof': 'Clip in Discord.',
  });
  assert.match(inquiry, /Who are you reporting/);
  assert.match(inquiry, /Deputy Example/);
});

test('only website-opened tickets get the website note', async () => {
  const { formatTicketInquiryNote, findOpenSupportChannelsForOwner } = await import('../utils/pinellasSupport.js');
  assert.equal(formatTicketInquiryNote('Need help', 'website'), 'Need help\n\nOpened from the PCSO website.');
  assert.equal(formatTicketInquiryNote('Need help', 'discord'), 'Need help');
  const channels = findOpenSupportChannelsForOwner({
    channels: {
      cache: new Map([
        ['1', { id: '1', parentId: '1514848054724005938', topic: 'ticket-owner:99 ticket-type:general' }],
        ['2', { id: '2', parentId: '1514851966629711952', topic: 'ticket-owner:99 ticket-type:compliance' }],
        ['3', { id: '3', parentId: '1514848054724005938', topic: 'ticket-owner:88 ticket-type:general' }],
        ['4', { id: '4', parentId: '0', topic: 'ticket-owner:99 ticket-type:general' }],
      ]),
    },
  }, '99');
  assert.deepEqual(channels.map((channel) => channel.id).sort(), ['1', '2']);
});
