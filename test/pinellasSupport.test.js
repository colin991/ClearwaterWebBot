import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import {
  PINELLAS_SUPPORT_CATEGORY_IDS,
  PINELLAS_SUPPORT_CLAIM_ID,
  PINELLAS_SUPPORT_CLOSE_ID,
  PINELLAS_SUPPORT_CR_NO_ID,
  PINELLAS_SUPPORT_CR_YES_ID,
  PINELLAS_SUPPORT_GUILD_ID,
  PINELLAS_SUPPORT_STAFF_ROLE_IDS,
  TICKET_BOT_OVERWRITES,
  TICKET_OPENER_OVERWRITES,
  buildInquiryModal,
  buildTicketCloseRequestPayload,
  buildTicketOpenPingPayload,
  canClaimPinellasTicket,
  createPinellasSupportTicketForMember,
  formatWebsiteInquiry,
  handlePinellasSupportInteraction,
  isPinellasSupportTicketChannel,
  staffRoleIdForTicketType,
  syncTicketChannelToCategory,
  ticketOwnerId,
  websiteTicketFields,
} from '../utils/pinellasSupport.js';

test('Office of the Sheriff tickets use their own category', () => {
  assert.equal(PINELLAS_SUPPORT_CATEGORY_IDS.sheriff, '1514848142653390898');
  assert.notEqual(PINELLAS_SUPPORT_CATEGORY_IDS.sheriff, PINELLAS_SUPPORT_CATEGORY_IDS.compliance);
  assert.notEqual(PINELLAS_SUPPORT_CATEGORY_IDS.sheriff, PINELLAS_SUPPORT_CATEGORY_IDS.general);
});

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

test('ticket staff roles are Command Staff, IA, and General Support only', () => {
  assert.equal(staffRoleIdForTicketType('general'), '1514361384576618627');
  assert.equal(staffRoleIdForTicketType('compliance'), '1514851283817725962');
  assert.equal(staffRoleIdForTicketType('sheriff'), '1514361105244356639');
  assert.deepEqual(PINELLAS_SUPPORT_STAFF_ROLE_IDS, {
    general: '1514361384576618627',
    compliance: '1514851283817725962',
    sheriff: '1514361105244356639',
  });
});

test('ticket channels only grant opener, bot, and the typed staff role', async () => {
  const edits = [];
  const channel = {
    parentId: '1514848054724005938',
    topic: 'ticket-owner:99 ticket-type:general',
    guild: { id: 'guild' },
    permissionOverwrites: {
      set: async (list) => { edits.push(...list); },
    },
  };
  await syncTicketChannelToCategory(channel, { openerId: '99', botId: 'bot', type: 'general' });
  assert.deepEqual(edits.map((entry) => entry.id), ['guild', '99', 'bot', '1514361384576618627']);
  assert.equal(edits[0].deny.includes(PermissionFlagsBits.ViewChannel), true);
  assert.equal(TICKET_OPENER_OVERWRITES.SendMessages, true);
  assert.equal(TICKET_BOT_OVERWRITES.ManageWebhooks, true);

  const sheriffEdits = [];
  await syncTicketChannelToCategory({
    topic: 'ticket-owner:99 ticket-type:sheriff',
    guild: { id: 'guild' },
    permissionOverwrites: { set: async (list) => { sheriffEdits.push(...list); } },
  }, { openerId: '99', botId: 'bot', type: 'sheriff' });
  assert.deepEqual(sheriffEdits.map((entry) => entry.id), ['guild', '99', 'bot', '1514361105244356639']);
});

test('new tickets replace inherited category roles with typed staff access', async () => {
  const overwrites = [];
  let created;
  const sent = [];
  const channel = {
    parentId: '1514848054724005938',
    topic: 'ticket-owner:99 ticket-type:general',
    guild: { id: PINELLAS_SUPPORT_GUILD_ID },
    permissionOverwrites: {
      set: async (list) => { overwrites.push(...list); },
    },
    send: async (payload) => { sent.push(payload); },
  };
  const guild = {
    id: PINELLAS_SUPPORT_GUILD_ID,
    channels: {
      cache: { find: () => null },
      fetch: async () => {},
      create: async (options) => {
        created = options;
        return channel;
      },
    },
    members: { me: { id: 'bot' } },
  };
  const member = {
    id: '99',
    displayName: 'Tester',
    user: { tag: 'tester#0001', username: 'tester', createdTimestamp: 1_700_000_000_000 },
  };
  await createPinellasSupportTicketForMember(guild, member, 'general', 'Need help');
  assert.equal('permissionOverwrites' in created, false);
  assert.equal(created.parent, '1514848054724005938');
  assert.deepEqual(overwrites.map((entry) => entry.id), [
    PINELLAS_SUPPORT_GUILD_ID,
    '99',
    'bot',
    PINELLAS_SUPPORT_STAFF_ROLE_IDS.general,
  ]);
  assert.match(String(sent[0].content), /@here/);
  assert.match(String(sent[0].content), /<@99>/);
  assert.deepEqual(sent[0].allowedMentions.parse, ['everyone']);
});

test('only the matching staff role or an administrator can claim a ticket', async () => {
  const iaMember = {
    permissions: { has: () => false },
    roles: { cache: { has: (id) => id === PINELLAS_SUPPORT_STAFF_ROLE_IDS.compliance } },
  };
  const generalMember = {
    permissions: { has: () => false },
    roles: { cache: { has: (id) => id === PINELLAS_SUPPORT_STAFF_ROLE_IDS.general } },
  };
  assert.equal(canClaimPinellasTicket(iaMember, 'compliance'), true);
  assert.equal(canClaimPinellasTicket(generalMember, 'compliance'), false);
  assert.equal(canClaimPinellasTicket({
    permissions: { has: () => false },
    roles: { cache: { has: () => false } },
  }, 'compliance'), false);

  let reply;
  let sent;
  const handled = await handlePinellasSupportInteraction({
    customId: PINELLAS_SUPPORT_CLAIM_ID,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: '55' },
    member: iaMember,
    channel: {
      topic: 'ticket-owner:1074411240757137589 ticket-type:compliance',
      setTopic: async () => {},
      send: async (content) => { sent = content; },
    },
    reply: async (payload) => { reply = payload; },
  });
  assert.equal(handled, true);
  assert.match(String(reply.content), /claimed this ticket/);
  assert.match(String(sent), /<@55>/);

  let denied;
  await handlePinellasSupportInteraction({
    customId: PINELLAS_SUPPORT_CLAIM_ID,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: '66' },
    member: generalMember,
    channel: {
      topic: 'ticket-owner:1074411240757137589 ticket-type:compliance',
      setTopic: async () => {},
      send: async () => {},
    },
    reply: async (payload) => { denied = payload; },
  });
  assert.match(String(denied.content), /Only staff can claim/);
});

test('new ticket ping uses @here', () => {
  const payload = buildTicketOpenPingPayload('1074411240757137589');
  assert.equal(payload.content, '@here <@1074411240757137589>');
  assert.deepEqual(payload.allowedMentions.parse, ['everyone']);
  assert.deepEqual(payload.allowedMentions.users, ['1074411240757137589']);
});
