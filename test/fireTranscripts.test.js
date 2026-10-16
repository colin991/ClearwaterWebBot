import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRE_TRANSCRIPT_CHANNEL_ID,
  buildFireTranscript,
  buildFireTranscriptCard,
  fireTranscriptUrl,
  isFireTranscriptId,
} from '../utils/fireTranscripts.js';
import { closeRequestReason } from '../utils/fireSupport.js';
import { renderFireTranscriptPage, renderMarkdown } from '../lib/cwfr-transcript-page.js';
import handler from '../lib/bot-api/cwfr-transcript.js';

const OWNER = '1044686997194805280';
const STAFF = '1074411240757137589';

function fakeMessage(id, at, { author, member = null, content = '', components = [] }) {
  return { id, createdTimestamp: at, author, member, content, components, embeds: [], attachments: new Map() };
}

function fakeChannel() {
  const owner = { id: OWNER, username: 'colin991', globalName: 'Colin', bot: false, displayAvatarURL: () => 'https://cdn.discordapp.com/a.png' };
  const staff = { id: STAFF, username: 'chief', bot: false, displayAvatarURL: () => 'https://cdn.discordapp.com/b.png' };
  const bot = { id: '555', username: 'Fire Operations', bot: true, displayAvatarURL: () => null };
  const staffMember = { id: STAFF, displayName: 'Chief', user: staff, staff: true };
  const ownerMember = { id: OWNER, displayName: 'Colin', user: owner };
  const messages = [
    fakeMessage('3', 3000, { author: staff, member: staffMember, content: 'Can we close <@1044686997194805280>?' }),
    fakeMessage('2', 2000, { author: owner, member: ownerMember, content: 'Hello <script>alert(1)</script>' }),
    fakeMessage('1', 1000, { author: bot, components: [{ type: 17, components: [{ type: 10, content: '# Line Officer Support\n> Hi' }] }] }),
  ];
  const members = new Map([[OWNER, ownerMember], [STAFF, staffMember]]);
  return {
    id: '777',
    name: 'line-colin991',
    createdTimestamp: 500,
    messages: { fetch: async () => new Map(messages.map((m) => [m.id, m])) },
    guild: {
      id: '1514804886292795544',
      name: 'Clearwater Fire & Rescue',
      iconURL: () => 'https://cdn.discordapp.com/icons/x.png',
      members: { cache: members, fetch: async (id) => members.get(id) || null },
      roles: { cache: new Map() },
      channels: { cache: new Map() },
      client: { users: { cache: new Map(), fetch: async () => null } },
    },
    staff,
  };
}

test('CWFR transcripts post to the requested channel and link to cwpcso.com', () => {
  assert.equal(FIRE_TRANSCRIPT_CHANNEL_ID, '1515872563417452664');
  const id = 'a'.repeat(32);
  assert.equal(isFireTranscriptId(id), true);
  assert.equal(isFireTranscriptId('../etc/passwd'), false);
  const saved = process.env.PCSO_SITE_URL;
  delete process.env.PCSO_SITE_URL;
  try {
    assert.equal(fireTranscriptUrl(id), `https://www.cwpcso.com/transcripts/cwfr/${id}`);
  } finally {
    if (saved !== undefined) process.env.PCSO_SITE_URL = saved;
  }
});

test('A closed ticket becomes a transcript record in order, with roles and close details', async () => {
  const channel = fakeChannel();
  const record = await buildFireTranscript(channel, {
    ownerId: OWNER,
    type: 'line',
    typeTitle: 'Line Officer Support',
    claimedById: STAFF,
    closedBy: { user: { id: OWNER, username: 'colin991' }, member: { displayName: 'Colin' } },
    closedVia: 'close-request',
    reason: 'All sorted',
    isStaff: (member) => Boolean(member.staff),
  });
  assert.match(record.id, /^[a-f0-9]{32}$/);
  assert.deepEqual(record.messages.map((m) => m.id), ['1', '2', '3']);
  assert.deepEqual(record.messages.map((m) => m.author.role), ['bot', 'member', 'staff']);
  assert.equal(record.messages[0].parts[0].content, '# Line Officer Support\n> Hi');
  assert.equal(record.closedBecause, 'Close request accepted by colin991');
  assert.equal(record.reason, 'All sorted');
  assert.equal(record.opener.name, 'Colin');
  assert.equal(record.claimedBy.name, 'Chief');
  assert.equal(record.mentions.users[OWNER], 'Colin');
  assert.equal(record.guild.iconUrl, 'https://cdn.discordapp.com/icons/x.png');

  const card = buildFireTranscriptCard(record, fireTranscriptUrl(record.id));
  const json = JSON.stringify(card.components[0].toJSON());
  assert.match(json, /Line Officer Support/);
  assert.match(json, /All sorted/);
  assert.match(json, new RegExp(`/transcripts/cwfr/${record.id}`));

  const html = renderFireTranscriptPage(record);
  assert.match(html, /Clearwater Fire &#38; Rescue/);
  assert.doesNotMatch(html, /PCSO|Pinellas/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /<span class="mention">@Colin<\/span>/);
  assert.match(html, /Close request accepted by colin991/);
  assert.match(html, /Anyone with this link can view this transcript/);
});

test('Transcript markdown is escaped and links stay https only', () => {
  const html = renderMarkdown('**bold** [x](javascript:alert(1)) <img src=x onerror=alert(1)> https://example.com', {});
  assert.match(html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /href="https:\/\/example\.com"/);
});

test('The close request reason is read back from the -cr prompt', () => {
  assert.equal(closeRequestReason('<@1> A close request was made.\n**Reason:** Issue resolved'), 'Issue resolved');
  assert.equal(closeRequestReason('<@1> A close request was made.'), '');
});

test('The transcript page rejects malformed ids without calling the bot', async () => {
  let status;
  let body = '';
  const response = { setHeader() {}, end(html) { body = html; }, set statusCode(value) { status = value; } };
  await handler({ method: 'GET', query: { id: '../../secrets' } }, response);
  assert.equal(status, 404);
  assert.match(body, /Transcript not found/);
});
