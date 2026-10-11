import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import radioStaffRoute from '../lib/bot-api/radio-staff.js';
import { RADIO_COOKIE, SESSION_COOKIE, createSessionToken, radioCookieSecret } from '../lib/discord-auth.js';
import { radioStaffGuild } from '../utils/botApiServer.js';
import { radioStaffSnapshot, runRadioStaffAction, runRadioStaffTool, setRadioStaffControls } from '../utils/radioStaff.js';
import { CLEARWATER_GUILD_ID } from '../utils/staffRanks.js';

const secret = 'test-session-secret-value-32chars!!';
const ADMIN = '1128547120304095272';
const ALICE = '111111111111111111';
const BOB = '222222222222222222';

async function call(cookie, body, { origin = 'https://www.cwpcso.com', bot } = {}) {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    DISCORD_CLIENT_ID: 'client', DISCORD_CLIENT_SECRET: 'secret', SESSION_SECRET: secret,
    BOT_API_URL: 'http://bot.local', BOT_API_KEY: 'k',
  });
  const asked = [];
  globalThis.fetch = async (url, options = {}) => {
    asked.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, auth: options.headers?.Authorization });
    return bot || { ok: true, status: 200, json: async () => ({ running: true, users: [], muted: [] }) };
  };
  let sent = null;
  const response = { statusCode: 0, setHeader() {}, end(text) { sent = JSON.parse(text); } };
  try {
    await radioStaffRoute({ method: 'POST', headers: { host: 'www.cwpcso.com', origin, cookie }, body }, response);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
  return { status: response.statusCode, body: sent, asked };
}

const siteCookie = () => `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken({ id: ADMIN, username: 'boss' }, secret))}`;

test('the website staff route signs in with Discord and forwards views and actions to the bot', async () => {
  const signedOut = await call('', { view: true });
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.body.signIn, true);

  assert.equal((await call(siteCookie(), { view: true }, { origin: 'https://evil.example' })).status, 403);

  const view = await call(siteCookie(), { view: true });
  assert.equal(view.status, 200);
  assert.equal(view.asked[0].url, `http://bot.local/api/radio/staff?discordId=${ADMIN}`);
  assert.equal(view.asked[0].auth, 'Bearer k');

  const radioOnly = `${RADIO_COOKIE}=${encodeURIComponent(createSessionToken({ id: ADMIN }, radioCookieSecret(secret)))}`;
  const search = await call(radioOnly, { search: 'alice' });
  assert.equal(search.asked[0].url, `http://bot.local/api/radio/staff?discordId=${ADMIN}&q=alice`);

  const mute = await call(siteCookie(), { action: 'mute', userId: ALICE });
  assert.equal(mute.asked[0].method, 'POST');
  assert.deepEqual(mute.asked[0].body, { discordId: ADMIN, action: 'mute', userId: ALICE });

  assert.equal((await call(siteCookie(), { action: 'ban', userId: ALICE })).status, 400);

  const tower = { towers: [{ left: 0.5, top: 0.5, range: 0.2 }], zones: [] };
  const coverage = await call(siteCookie(), { action: 'coverage', coverage: tower });
  assert.deepEqual(coverage.asked[0].body, { discordId: ADMIN, action: 'coverage', coverage: tower });
  assert.equal((await call(siteCookie(), { action: 'coverage' })).status, 400);
  assert.equal((await call(siteCookie(), { action: 'kick', userId: 'nope' })).status, 400);

  const notAdmin = await call(siteCookie(), { view: true }, {
    bot: { ok: false, status: 403, json: async () => ({ error: 'Only Clearwater admins can use the radio staff panel.' }) },
  });
  assert.equal(notAdmin.status, 403);
  assert.match(notAdmin.body.error, /Only Clearwater admins/);
});

test('the bot only lets members with Administrator use the website panel', async () => {
  const member = (id, admin) => ({ id, displayName: `User ${id}`, permissions: { has: (flag) => admin && flag === PermissionFlagsBits.Administrator } });
  const members = { [ADMIN]: member(ADMIN, true), [ALICE]: member(ALICE, false) };
  const guild = {
    members: {
      cache: new Map(),
      fetch: async ({ user }) => {
        if (members[user]) return members[user];
        throw Object.assign(new Error('Unknown Member'), { code: 10007 });
      },
    },
  };
  const client = { guilds: { cache: new Map([[CLEARWATER_GUILD_ID, guild]]) } };

  assert.equal((await radioStaffGuild(client, ADMIN)).member, members[ADMIN]);
  assert.equal((await radioStaffGuild(client, ALICE)).status, 403);
  assert.equal((await radioStaffGuild(client, BOB)).status, 403);
  assert.equal((await radioStaffGuild(client, 'x')).status, 400);
  assert.equal((await radioStaffGuild({ guilds: { cache: new Map() } }, ADMIN)).status, 503);
});

test('staff actions from the website mute, unmute and kick through the radio controls', async () => {
  setRadioStaffControls(null);
  assert.deepEqual(radioStaffSnapshot(), { running: false, users: [], muted: [], coverage: { towers: [], zones: [], buildings: false }, positions: [], flags: [], crashes: [], scenes: [], event: null });
  await assert.rejects(runRadioStaffAction('mute', ALICE, ADMIN), { status: 503 });

  const muted = new Set([BOB]);
  const posts = [];
  const kicked = [];
  setRadioStaffControls({
    users: () => [{ userId: ALICE, name: 'Alice', channelName: 'Radio', muted: muted.has(ALICE), since: 5 }],
    get muted() { return [...muted]; },
    async setMuted(id, active) { if (active) muted.add(id); else muted.delete(id); },
    kick: (id) => { kicked.push(id); return 1; },
    postStaff: async (payload) => { posts.push(payload.content); },
  });

  const snapshot = radioStaffSnapshot((id) => (id === BOB ? 'Bob' : ''));
  assert.deepEqual(snapshot.users, [{ userId: ALICE, name: 'Alice', channel: 'Radio', muted: false, since: 5, signal: null, monitor: false }]);
  assert.deepEqual(snapshot.muted, [{ userId: BOB, name: 'Bob' }]);

  await runRadioStaffAction('mute', ALICE, ADMIN, { from: 'website' });
  assert.ok(muted.has(ALICE));
  await runRadioStaffAction('unmute', BOB, ADMIN, { from: 'website' });
  assert.ok(!muted.has(BOB));
  assert.equal((await runRadioStaffAction('kick', ALICE, ADMIN, { from: 'website' })).closed, 1);
  assert.deepEqual(kicked, [ALICE]);
  await assert.rejects(runRadioStaffAction('ban', ALICE, ADMIN), { status: 400 });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posts, [
    `🔇 <@${ADMIN}> force-muted <@${ALICE}> on the radio (website).`,
    `🔊 <@${ADMIN}> unmuted <@${BOB}> on the radio (website).`,
    `👢 <@${ADMIN}> kicked <@${ALICE}> off the radio for 5 minutes (website).`,
  ]);
  setRadioStaffControls(null);
});

test('staff save the coverage map through the radio controls and it is noted in the radio chat', async () => {
  const { saveRadioCoverage } = await import('../utils/radioStaff.js');
  setRadioStaffControls(null);
  await assert.rejects(saveRadioCoverage({}, ADMIN), { status: 503 });
  const posts = [];
  let stored = null;
  setRadioStaffControls({
    users: () => [],
    muted: [],
    coverage: () => stored,
    async setCoverage(next) { stored = next; return next; },
    postStaff: async (payload) => { posts.push(payload.content); },
  });
  const saved = await saveRadioCoverage({ towers: [{ left: 0.5, top: 0.5 }, { left: 9, top: 0 }], zones: [] }, ADMIN);
  assert.equal(saved.towers.length, 1, 'bad towers are dropped before saving');
  assert.deepEqual(radioStaffSnapshot().coverage, saved);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posts, [`📡 <@${ADMIN}> updated radio coverage (website): 1 cell tower, 0 weak-signal areas.`]);
  setRadioStaffControls(null);
});

test('flags for staff (an off-team player on the radio) show on the website panel with a name', () => {
  setRadioStaffControls({
    users: () => [],
    muted: [],
    flags: () => [{ kind: 'off-team', userId: ALICE, name: '', detail: 'On the Civilian team in game.', at: 1 }],
  });
  const { flags } = radioStaffSnapshot((id) => (id === ALICE ? 'Alice' : ''));
  assert.deepEqual(flags, [{ kind: 'off-team', userId: ALICE, name: 'Alice', detail: 'On the Civilian team in game.', at: 1 }]);
  setRadioStaffControls(null);
});

test('the website forwards staff tools to the bot with only the fields each one needs', async () => {
  const warn = await call(siteCookie(), { action: 'warn', userId: ALICE, text: 'Stop talking over dispatch', extra: 'x' });
  assert.deepEqual(warn.asked[0].body, { discordId: ADMIN, action: 'warn', userId: ALICE, text: 'Stop talking over dispatch' });
  assert.equal((await call(siteCookie(), { action: 'warn', userId: ALICE, text: '  ' })).status, 400);
  assert.deepEqual((await call(siteCookie(), { action: 'shout', text: 'Restart soon' })).asked[0].body, { discordId: ADMIN, action: 'shout', text: 'Restart soon' });
  assert.deepEqual((await call(siteCookie(), { action: 'event-open', name: 'Car Meet' })).asked[0].body, { discordId: ADMIN, action: 'event-open', name: 'Car Meet' });
  assert.deepEqual((await call(siteCookie(), { action: 'recording', id: 'abc-123' })).asked[0].body, { discordId: ADMIN, action: 'recording', id: 'abc-123' });
  assert.equal((await call(siteCookie(), { action: 'recording', id: '../etc' })).status, 400);
  const gone = await call(siteCookie(), { action: 'recording', id: 'abc-123' }, { bot: { ok: false, status: 404, json: async () => ({ error: 'That recording is gone.' }) } });
  assert.equal(gone.status, 404);
});

test('staff tools warn a unit, play a shout-out, run the event channel and play recordings', async () => {
  const posts = [];
  const sent = [];
  let event = null;
  setRadioStaffControls({
    users: () => [],
    muted: [],
    warn: (userId, text) => { sent.push(['warn', userId, text]); return userId === ALICE ? 1 : 0; },
    shout: (text) => sent.push(['shout', text]),
    event: () => event,
    openEvent: (name) => { event = { name: name || 'Server Event' }; return event; },
    closeEvent: () => { event = null; return 2; },
    recordings: async () => [{ id: 'r1', name: 'Alice' }],
    recording: async (id) => (id === 'r1' ? { entry: { id: 'r1' }, audio: Buffer.from('OggS') } : null),
    postStaff: async (payload) => { posts.push(payload.content); },
  });
  await runRadioStaffTool('warn', { userId: ALICE, text: ' Stop\n spamming ' }, ADMIN);
  assert.deepEqual(sent[0], ['warn', ALICE, 'Stop spamming']);
  await assert.rejects(runRadioStaffTool('warn', { userId: BOB, text: 'hi' }, ADMIN), { status: 409 });
  await assert.rejects(runRadioStaffTool('shout', { text: '' }, ADMIN), { status: 400 });
  await runRadioStaffTool('shout', { text: 'Restart in 5' }, ADMIN);
  assert.deepEqual(sent.at(-1), ['shout', 'Restart in 5']);
  assert.deepEqual((await runRadioStaffTool('event-open', { name: 'Car Meet' }, ADMIN)).event, { name: 'Car Meet' });
  assert.deepEqual(radioStaffSnapshot().event, { name: 'Car Meet' });
  assert.equal((await runRadioStaffTool('event-close', {}, ADMIN)).moved, 2);
  assert.equal((await runRadioStaffTool('recordings', {}, ADMIN)).recordings.length, 1);
  const played = await runRadioStaffTool('recording', { id: 'r1' }, ADMIN);
  assert.equal(Buffer.from(played.audio, 'base64').toString(), 'OggS');
  await assert.rejects(runRadioStaffTool('recording', { id: 'r2' }, ADMIN), { status: 404 });
  await assert.rejects(runRadioStaffTool('ban', {}, ADMIN), { status: 400 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posts.length, 4, 'warn, shout, event open and close are noted in the radio chat');
  assert.match(posts[0], /radio warning/);
  setRadioStaffControls(null);
});
