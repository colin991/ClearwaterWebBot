import { createServer } from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  EndBehaviorType,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { createRadioRelay } from './radioRelay.js';
import { createRadioKey, verifyRadioKey } from './radioKeys.js';
import { exchangeRadioCode, radioOAuthConfig } from './radioOAuth.js';
import { callsignFromName, createRadioPanicWatch, findPanicPlayer, panicUnitAndPostal, playerLocationLabel } from './radioPanic.js';
import { LIBERTY_POSTAL_POINTS } from './libertyMapCalibration.js';
import { erlcPlayersFromServer, fetchErlcServer, isCivilianTeam, libertyPlayerMapPoint, parseErlcKill, parseErlcPlayer } from './erlc.js';
import { createCoverageTracker, normalizeCoverage } from './radioCoverage.js';
import { createDamageTracker, createGameFeed, createTeamWatch, DOWNED_MS, GAME_TICK_MS } from './radioGameFeed.js';
import { getIdentityCache } from './identityStore.js';
import { startRadioTunnel } from './radioTunnel.js';
import { createRadioTalkLog } from './radioTalkLog.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { createRadioStats, buildRadioStatsEmbed } from './radioStats.js';
import { buildRadioPanicEmbed, RADIO_KICK_BLOCK_MS, setRadioStaffControls } from './radioStaff.js';
import { createRadioRecorder } from './radioRecorder.js';
import { createSceneClock, createTalkOverWatch, findSceneChannels } from './radioModeration.js';
import { createRadioBridge, radioBridgeSettings } from './radioBridge.js';
import { canUseChannel, createMelonlyProfiles, normalizeAccess, profileLabel } from './radioMelonly.js';

const UNKNOWN_MEMBER = 10007;

/** Voice channel the radio bot always sits in. */
export const RADIO_CHANNEL_ID = process.env.RADIO_CHANNEL_ID?.trim() || '1514128904783139018';
/** Separate @discordjs/voice group so the radio bot never replaces the main bot's connection. */
const VOICE_GROUP = 'clearwater-radio';
const REJOIN_DELAY_MS = 10_000;
const STATS_TICK_MS = 60_000;
/** Discord voice channel callers wait in for 911; anyone in it shows as a pending call on every radio. */
export const RADIO_911_CHANNEL_ID = process.env.RADIO_911_CHANNEL_ID?.trim() || '1532197874690035843';
/** Staff-page flags (off-team members on the radio) are kept this long, newest first. */
const FLAG_KEEP_MS = 24 * 60 * 60 * 1000;
const FLAG_LIMIT = 100;
/** A damaged radio (member downed in game) gets this signal: very weak, but still comes through. */
const DAMAGED_SIGNAL = 0.1;
/** Crash reports from radios, for the staff panel: kept this long, newest first. */
const CRASH_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const CRASH_LIMIT = 200;
const RECORDING_PRUNE_MS = 30 * 60 * 1000;
const radioDataPath = (name) => join(process.cwd(), 'data', name);
// 80 ms: shorter transmissions are PTT taps with nothing said.
const RADIO_MIN_TX_PACKETS = 4;

let activeRelay = null;
// Secure relay address for the web radio (cwpcso.com/radio); '' until the tunnel is up.
let webRelayUrl = '';
let radioEnv = process.env;

/** The in-game player behind a panic, looked up in the live ER:LC player list (null when unavailable). */
async function findPanicPlayerInGame(env, { robloxId = '', names = [] }) {
  const key = env.ERLC_SERVER_KEY?.trim();
  if (!key) return null;
  try {
    const server = await fetchErlcServer(key, { timeoutMs: 4_000 });
    return findPanicPlayer(erlcPlayersFromServer(server).map(parseErlcPlayer), { robloxId, names });
  } catch (error) {
    logger.warn(`Radio panic: could not read the ER:LC player list (${error?.message || error})`);
    return null;
  }
}

/**
 * Where each member on a radio is in game (userId -> { left, top, x, z, postal, street, team,
 * player }), from the live ER:LC player list. Also returns the raw server snapshot.
 */
async function locateRadioUsers(env, users) {
  const key = env.ERLC_SERVER_KEY?.trim();
  if (!key) return { located: new Map(), known: new Map(), server: null };
  const server = await fetchErlcServer(key, { timeoutMs: 4_000, maxAgeMs: GAME_TICK_MS - 1_000 });
  const players = erlcPlayersFromServer(server).map(parseErlcPlayer);
  const byDiscord = (await getIdentityCache().catch(() => ({ byDiscord: {} }))).byDiscord || {};
  const located = new Map();
  // Linked Roblox accounts, so a kill log entry still finds a member the player list missed.
  const known = new Map();
  for (const user of users) {
    const identity = byDiscord[user.userId] || {};
    if (identity.robloxId || identity.robloxUsername) {
      known.set(user.userId, { robloxId: identity.robloxId ? String(identity.robloxId) : '', names: [identity.robloxUsername].filter(Boolean) });
    }
    const nick = String(user.name || '').replace(/^(\s*[[(][^\])]*[\])]\s*)+/, '').trim();
    const player = findPanicPlayer(players, {
      robloxId: identity.robloxId,
      names: [identity.robloxUsername, user.name, nick, nick.split(/\s*[|/-]\s*/)[0]],
    });
    if (!player) continue;
    const pin = libertyPlayerMapPoint(player.location);
    located.set(user.userId, {
      left: Number.isFinite(pin?.left) ? pin.left : null,
      top: Number.isFinite(pin?.top) ? pin.top : null,
      x: player.location?.x,
      z: player.location?.z,
      postal: player.location?.postal || '',
      street: player.location?.street || '',
      team: player.team || '',
      player,
    });
  }
  return { located, known, server };
}

/** EMER on a radio: the member's linked Roblox player, so the alert shows where they are in game. */
async function locateRadioPanic(env, userId, name) {
  const identity = (await getIdentityCache().catch(() => ({ byDiscord: {} }))).byDiscord?.[userId] || {};
  const nick = String(name || '').replace(/^(\s*[[(][^\])]*[\])]\s*)+/, '').trim();
  const player = await findPanicPlayerInGame(env, {
    robloxId: identity.robloxId,
    names: [identity.robloxUsername, name, nick, nick.split(/\s*[|/-]\s*/)[0]],
  });
  return { name, location: player ? playerLocationLabel(player) : '', ...panicUnitAndPostal(player, [name]) };
}

/**
 * Sign-in for the web radio: the website vouches for the member's Discord ID, and gets back a
 * radio key plus the secure relay address. The relay still checks Clearwater membership on connect.
 * @returns {{ key: string, url: string } | { error: string }}
 */
/**
 * Audio from one radio transmission into Discord. Playback starts once a few packets have arrived,
 * so a PTT tap too short to say anything is dropped instead of popping in the voice channel.
 * @param {(stream: Readable) => void} play
 */
export function createTransmitSink(play, minPackets = RADIO_MIN_TX_PACKETS) {
  let stream = null;
  let queued = [];
  return {
    push(packet) {
      if (stream) {
        stream.push(packet);
        return;
      }
      queued.push(packet);
      if (queued.length < minPackets) return;
      stream = new Readable({ objectMode: true, read() {} });
      for (const item of queued) stream.push(item);
      queued = [];
      play(stream);
    },
    end() {
      queued = [];
      stream?.push(null);
    },
  };
}

export function radioWebSession(discordId) {
  if (!activeRelay) return { error: 'The radio is not running on the bot host.' };
  if (!webRelayUrl) return { error: 'The radio web link is starting. Try again in a minute.' };
  const key = createRadioKey(discordId, radioEnv);
  if (!key) return { error: 'Radio sign-in is not set up on the bot host.' };
  return { key, url: webRelayUrl };
}

/** Hook for the bot API HTTP server so the radio can share its port. */
export function handleRadioUpgrade(request, socket, head) {
  return activeRelay ? activeRelay.handleUpgrade(request, socket, head) : false;
}

/**
 * Second Discord bot ("radio"): no commands, just sits in the radio channel and bridges
 * push-to-talk audio from the Clearwater Radio desktop app.
 * @returns {() => void} stop function
 */
/** @param {{ erlcEvents?: import('node:events').EventEmitter }} options main bot client that emits 'erlcEvent' */
export function startRadioBot(env = process.env, { erlcEvents = null } = {}) {
  const token = env.RADIO_BOT_TOKEN?.trim();
  if (!token) {
    logger.info('Radio bot skipped (RADIO_BOT_TOKEN missing).');
    return () => {};
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 25 },
  });
  player.on('error', (error) => logger.warn(`Radio player error: ${error?.message || error}`));

  let connection = null;
  let channel = null;
  let joining = false;
  let stopped = false;
  let rejoinTimer = null;
  const receiving = new Set();
  // Console stats so a host can see whether Discord voices reach the radios.
  const stats = { packets: 0, decryptFailures: 0 };
  const statsTimer = setInterval(() => {
    if (stats.packets || stats.decryptFailures) {
      logger.info(`Radio: relayed ${stats.packets} Discord voice packets to ${relay.listeners} radio(s) in the last minute`
        + (stats.decryptFailures ? `; ${stats.decryptFailures} could not be decrypted.` : '.'));
    }
    stats.packets = 0;
    stats.decryptFailures = 0;
  }, 60_000);
  statsTimer.unref?.();

  const isOnline = () => connection?.state?.status === VoiceConnectionStatus.Ready;

  // The radio voice channel's chat gets the talk log, panic history, weekly stats and staff actions.
  // The main bot posts (it can send messages there); the radio bot is the fallback. Mentions never ping.
  const talkLogChannelId = env.RADIO_LOG_CHANNEL_ID?.trim() || RADIO_CHANNEL_ID;
  async function postRadioChat(payload) {
    for (const poster of [erlcEvents, client]) {
      const target = await poster?.channels?.fetch?.(talkLogChannelId).catch(() => null);
      if (!target?.isTextBased?.()) continue;
      try {
        return await target.send({ allowedMentions: { parse: [] }, ...payload });
      } catch {
        // No Send Messages for this bot: try the next one.
      }
    }
    throw new Error(`no bot can post in ${talkLogChannelId}`);
  }
  const talkLog = createRadioTalkLog({
    send: (content) => postRadioChat({ content }),
    onError: (error) => logger.warn(`Radio talk log failed: ${error?.message || error}`),
  });
  const postStaff = (payload) => postRadioChat(payload).catch((error) => {
    logger.warn(`Radio post failed: ${error?.message || error}`);
    return null;
  });
  const postPanic = (alert) => { void postStaff({ embeds: [buildRadioPanicEmbed(alert)] }); };

  // Weekly stats: radio time is counted every minute for everyone signed in; transmissions as they end.
  let weekly = createRadioStats(null);
  let statsLoaded = false;
  void readJsonFile(radioDataPath('radio-stats.json'), null).then((saved) => {
    if (saved) weekly = createRadioStats(saved);
    statsLoaded = true;
  });
  const weeklyStatsTimer = setInterval(() => {
    if (!statsLoaded) return;
    weekly.tick(relay.users(), STATS_TICK_MS);
    if (weekly.due()) {
      const report = weekly.report();
      weekly.reset();
      void postStaff({ embeds: [buildRadioStatsEmbed(report)] });
    }
    void writeJsonFile(radioDataPath('radio-stats.json'), weekly.data).catch((error) => logger.warn(`Radio stats save failed: ${error?.message || error}`));
  }, STATS_TICK_MS);
  weeklyStatsTimer.unref?.();

  // Pending 911: members waiting in the Discord 911 voice channel, since they joined.
  const waitingSince = new Map();
  function pendingCalls() {
    const at = Date.now();
    // The radio bot tracks voice states, so its cache knows who is in the channel.
    const room = client.channels.cache.get(RADIO_911_CHANNEL_ID) || erlcEvents?.channels?.cache?.get?.(RADIO_911_CHANNEL_ID);
    const waiting = [...(room?.members?.values?.() || [])].filter((member) => !member.user?.bot).map((member) => {
      if (!waitingSince.has(member.id)) waitingSince.set(member.id, at);
      return { id: member.id, name: member.displayName || member.user?.username || 'Caller', since: waitingSince.get(member.id), kind: 'discord' };
    });
    for (const id of [...waitingSince.keys()]) if (!waiting.some((call) => call.id === id)) waitingSince.delete(id);
    return waiting.sort((a, b) => a.since - b.since);
  }

  // Synced radio settings (desktop and phone share them), kept per member.
  const settingsPath = radioDataPath('radio-settings.json');
  let syncedSettings = {};
  let settingsSaveTimer = null;
  void readJsonFile(settingsPath, {}).then((saved) => { syncedSettings = { ...(saved || {}), ...syncedSettings }; });

  // Every transmission (radio and the Discord radio channel) is recorded for staff review, kept 24 hours.
  const recorder = createRadioRecorder({ dir: radioDataPath('radio-recordings') });
  void recorder.prune();
  const pruneTimer = setInterval(() => { void recorder.prune(); }, RECORDING_PRUNE_MS);
  pruneTimer.unref?.();
  const talkOver = createTalkOverWatch();
  const sceneClock = createSceneClock();
  let sceneList = [];
  // Crash reports from radios (desktop and web), for the staff panel; survive restarts.
  const crashPath = radioDataPath('radio-crashes.json');
  let crashes = [];
  void readJsonFile(crashPath, []).then((saved) => { if (Array.isArray(saved)) crashes = [...crashes, ...saved]; });
  // Melonly department and rank next to callsigns, and rank-based channel access from the staff page.
  const profiles = createMelonlyProfiles({ apiKey: env.MELONLY_API_KEY?.trim() || '' });
  const knownProfiles = new Map(); // userId -> Melonly profile, for Discord channel members too
  const accessPath = radioDataPath('radio-access.json');
  let access = {};
  void readJsonFile(accessPath, {}).then((saved) => { access = normalizeAccess(saved || {}); relay.accessChanged(); });
  async function melonlyProfile(userId) {
    if (!profiles.configured) return [];
    const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), 4_000).unref?.(); });
    const found = await Promise.race([profiles.lookup(userId).catch(() => null), timeout]);
    // A slow or failed lookup keeps what we knew, so access doesn't flicker.
    if (found === null) return knownProfiles.get(userId) || [];
    knownProfiles.set(userId, found);
    return found;
  }
  async function isAdmin(userId) {
    const target = channel || await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
    const member = await target?.guild?.members.fetch({ user: userId, force: true }).catch(() => null);
    return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
  }

  // Fire, DOT and Marine each get a bot of their own in their own Discord voice channel.
  const bridges = new Map();
  const relay = createRadioRelay({
    bridge: (radioChannel) => {
      const bridge = bridges.get(radioChannel);
      return bridge ? { online: bridge.online } : null;
    },
    record: (meta) => recorder.start(meta),
    isStaff: (userId) => isAdmin(userId),
    canUse: (radio, channelId) => canUseChannel(access, channelId, { profile: radio.profile, staff: radio.staff }),
    scenes: () => sceneList,
    onTalkOver: (event) => {
      const count = talkOver.hit(event.userId);
      if (!count) return;
      addFlag({
        kind: 'talk-over',
        userId: event.userId,
        name: event.name,
        detail: `Talked over dispatch (${event.dispatcher}) ${count} times in 10 minutes on ${event.channel}.`,
      });
      void postStaff({ content: `⚠️ <@${event.userId}> keeps talking over dispatch on the radio (${count} times in 10 minutes). Flagged on the radio staff page.`, allowedMentions: { parse: [] } });
      logger.info(`Radio: talk-over flag for ${event.userId}`);
    },
    onCrash: (report) => {
      const at = Date.now();
      crashes = [{ ...report, id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}` }, ...crashes.filter((entry) => at - entry.at < CRASH_KEEP_MS)].slice(0, CRASH_LIMIT);
      void writeJsonFile(crashPath, crashes).catch((error) => logger.warn(`Radio crash log save failed: ${error?.message || error}`));
      logger.warn(`Radio: crash report from ${report.userId} (${report.version || '?'}): ${report.message}`);
    },
    verifyKey: (key) => verifyRadioKey(key, env),
    exchangeCode: (code) => exchangeRadioCode(code, env),
    createSession: (userId) => createRadioKey(userId, env),
    loginInfo: () => {
      const config = radioOAuthConfig(env);
      return config ? { clientId: config.clientId, redirectUri: config.redirectUri } : null;
    },
    status: () => ({ online: isOnline(), channel: channel?.name || 'Radio' }),
    locatePanic: (userId, name) => locateRadioPanic(env, userId, name),
    mapPoint: (postal) => {
      const point = LIBERTY_POSTAL_POINTS[String(postal).match(/\d{3,5}/)?.[0] || ''];
      return point ? { x: point.left, y: point.top } : null;
    },
    calls: pendingCalls,
    loadSettings: (userId) => syncedSettings[userId] || null,
    saveSettings: (userId, saved) => {
      const current = syncedSettings[userId];
      if (current && current.updatedAt > saved.updatedAt) return;
      syncedSettings[userId] = saved;
      clearTimeout(settingsSaveTimer);
      settingsSaveTimer = setTimeout(() => {
        void writeJsonFile(settingsPath, syncedSettings).catch((error) => logger.warn(`Radio settings save failed: ${error?.message || error}`));
      }, 2_000);
    },
    onTalked: (entry) => {
      talkLog.add(entry);
      weekly.addTalk(entry);
    },
    onPanic: (message) => {
      logger.info(`Radio: EMER from ${message.name} at ${message.location || 'unknown location'} sent to ${relay.listeners} radio(s).`);
      postPanic(message);
    },
    // The main bot's cache has live nicknames (it gets member updates), so it is read first.
    voiceMembers: (radioChannel) => {
      const bridge = bridges.get(radioChannel);
      if (bridge) return bridge.members();
      return [...((erlcEvents?.channels?.cache?.get?.(RADIO_CHANNEL_ID) || channel)?.members?.values?.() || [])]
        .filter((member) => !member.user?.bot)
        .map((member) => ({ id: member.id, name: member.displayName || member.user?.username || 'Member', label: profileLabel(knownProfiles.get(member.id)) }));
    },
    inVoice: (userId, radioChannel) => {
      const bridge = bridges.get(radioChannel);
      if (bridge) return bridge.inVoice(userId);
      return (channel?.guild?.voiceStates?.cache?.get(userId)?.channelId || null) === RADIO_CHANNEL_ID;
    },
    // `removed` closes the member's radio app; anything else (Discord or bot trouble) is retried.
    async authorize(userId) {
      const target = channel || await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
      if (!target?.guild) return { ok: false, reason: 'The radio bot is not in its channel yet. Try again shortly.' };
      let member;
      try {
        member = await target.guild.members.fetch({ user: userId, force: true });
      } catch (error) {
        if (error?.code === UNKNOWN_MEMBER) {
          return { ok: false, removed: true, reason: 'You must be in the Clearwater Discord server to use the radio.' };
        }
        throw error;
      }
      const permissions = target.permissionsFor(member);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
        return { ok: false, removed: true, reason: `You do not have access to #${target.name}.` };
      }
      const name = member.displayName || member.user.username;
      const profile = await melonlyProfile(userId);
      return {
        ok: true,
        name,
        callsign: callsignFromName(name),
        staff: Boolean(member.permissions?.has(PermissionFlagsBits.Administrator)),
        profile,
        label: profileLabel(profile),
      };
    },
    openTransmit(userId, radioChannel) {
      const bridge = bridges.get(radioChannel);
      if (bridge) return bridge.openTransmit();
      if (!isOnline()) return null;
      return createTransmitSink((stream) => player.play(createAudioResource(stream, { inputType: StreamType.Opus })));
    },
  });
  activeRelay = relay;
  for (const settings of radioBridgeSettings(env)) {
    bridges.set(settings.channel, createRadioBridge({
      ...settings,
      relay: () => relay,
      label: (member) => profileLabel(knownProfiles.get(member.id)),
      createSink: (play) => createTransmitSink(play),
    }));
  }

  // Staff force-mutes survive restarts.
  const adminPath = radioDataPath('radio-admin.json');
  let admin = { muted: {} };
  void readJsonFile(adminPath, { muted: {} }).then((saved) => {
    admin = { muted: { ...(saved?.muted || {}) } };
    for (const id of Object.keys(admin.muted)) relay.setMuted(id, true);
  });
  // Coverage map (cell towers and weak areas) from the website staff panel; survives restarts.
  const coveragePath = radioDataPath('radio-coverage.json');
  let coverage = normalizeCoverage({});
  // A member downed in game (kill log) has a damaged, very weak radio for 20 seconds.
  const damage = createDamageTracker();
  let damageTimer = null;
  const coverageTracker = createCoverageTracker({
    users: () => relay.users(),
    setSignals: (signals) => relay.setSignals(signals),
    getCoverage: () => coverage,
    limit: (userId) => (damage.isDamaged(userId) ? DAMAGED_SIGNAL : null),
  });
  // Flags for the staff page: a Civilian-team player on the police radio.
  let staffFlags = [];
  const teamWatch = createTeamWatch({ isOffTeam: isCivilianTeam });
  function addFlag(flag) {
    const at = Date.now();
    staffFlags = [{ ...flag, at }, ...staffFlags.filter((entry) => at - entry.at < FLAG_KEEP_MS)].slice(0, FLAG_LIMIT);
  }
  const gameFeed = createGameFeed({ send: (userId, info) => relay.setGame(userId, info) });
  void readJsonFile(coveragePath, null).then((saved) => {
    if (saved) coverage = normalizeCoverage(saved);
  });
  // Scene timers: members in any voice channel named "Scene" or "Traffic Stop" (in the radio's server), for dispatch.
  let sceneKey = '';
  function updateScenes() {
    const guildId = client.channels.cache.get(RADIO_CHANNEL_ID)?.guild?.id || '';
    const all = [...client.channels.cache.values(), ...(erlcEvents?.channels?.cache?.values?.() || [])];
    const rooms = findSceneChannels(all, guildId).map((room) => ({
      id: room.id,
      name: room.name,
      members: [...(room.members?.values?.() || [])].filter((member) => !member.user?.bot)
        .map((member) => ({ id: member.id, name: member.displayName || member.user?.username || 'Member' })),
    }));
    sceneList = sceneClock.update(rooms);
    const key = sceneList.map((scene) => `${scene.id}@${scene.channel}`).join('|');
    if (key !== sceneKey) {
      sceneKey = key;
      relay.broadcastStatus();
    }
  }
  // Every few seconds: where each radio user is in game (postal, speed, heading, signal) and the weather.
  let gameBusy = false;
  async function gameTick() {
    relay.setWeather(erlcEvents?.serverWeather?.state?.currentWeather || '');
    updateScenes();
    const users = relay.users();
    if (!users.length) {
      coverageTracker.clear();
      return;
    }
    if (gameBusy) return;
    gameBusy = true;
    try {
      const { located, known, server } = await locateRadioUsers(env, users);
      gameFeed.update(users, located);
      const kills = (server?.KillLogs || server?.killLogs || []).map((entry) => (entry?.at ? entry : parseErlcKill(entry)));
      for (const userId of damage.update(kills, located, known)) {
        relay.sendTo(userId, { type: 'damage', seconds: DOWNED_MS / 1000 });
        logger.info(`Radio: ${userId} was downed in game; radio damaged for ${DOWNED_MS / 1000}s.`);
      }
      // Recompute when the next damaged radio recovers, not just on the next tick.
      clearTimeout(damageTimer);
      const nextEnd = damage.nextEnd();
      if (nextEnd) {
        damageTimer = setTimeout(() => coverageTracker.recompute(), Math.max(0, nextEnd - Date.now()) + 50);
        damageTimer.unref?.();
      }
      for (const flag of teamWatch.update(users, located)) {
        const user = users.find((entry) => entry.userId === flag.userId);
        addFlag({
          kind: 'off-team',
          userId: flag.userId,
          name: user?.name || '',
          detail: `On the ${flag.team || 'Civilian'} team in game${flag.player?.username ? ` as ${flag.player.username}` : ''}, on ${user?.channelName || 'the radio'}.`,
        });
        relay.sendTo(flag.userId, { type: 'notice', kind: 'off-team' });
        void postStaff({
          content: `⚠️ <@${flag.userId}> is on the police radio while on the ${flag.team || 'Civilian'} team in game${flag.player?.username ? ` (${flag.player.username})` : ''}. Their radio told them staff have been notified.`,
          allowedMentions: { parse: [] },
        });
        logger.info(`Radio: off-team flag for ${flag.userId} (${flag.team}).`);
      }
      coverageTracker.update(new Map([...located]
        .filter(([, spot]) => Number.isFinite(spot.left) && Number.isFinite(spot.top))
        .map(([id, spot]) => [id, { left: spot.left, top: spot.top }])));
    } finally {
      gameBusy = false;
    }
  }
  const coverageTimer = setInterval(() => {
    void gameTick().catch((error) => logger.warn(`Radio game data check failed: ${error?.message || error}`));
  }, GAME_TICK_MS);
  coverageTimer.unref?.();

  setRadioStaffControls({
    users: () => relay.users(),
    coverage: () => coverage,
    positions: () => coverageTracker.positions(),
    flags: () => staffFlags.filter((flag) => Date.now() - flag.at < FLAG_KEEP_MS),
    access: () => access,
    melonly: () => profiles.configured,
    catalog: () => profiles.catalog(),
    async setAccess(next, by) {
      access = normalizeAccess(next);
      await writeJsonFile(accessPath, { ...access, updatedBy: by, updatedAt: new Date().toISOString() });
      relay.accessChanged();
      return access;
    },
    crashes: () => crashes.filter((entry) => Date.now() - entry.at < CRASH_KEEP_MS).slice(0, 50),
    scenes: () => sceneList,
    recordings: () => recorder.list(),
    recording: (id) => recorder.read(id),
    event: () => relay.event,
    openEvent: (name, by) => relay.openEvent(name, by),
    closeEvent: () => relay.closeEvent(),
    warn: (userId, text) => relay.sendTo(userId, { type: 'warning', text }),
    shout: (text) => relay.alert({ type: 'shout', text }),
    async setCoverage(next, by) {
      coverage = normalizeCoverage(next);
      await writeJsonFile(coveragePath, { ...coverage, updatedBy: by, updatedAt: new Date().toISOString() });
      coverageTracker.recompute();
      return coverage;
    },
    get muted() {
      return relay.muted;
    },
    async setMuted(userId, active, by) {
      relay.setMuted(userId, active);
      if (active) admin.muted[userId] = { by, at: new Date().toISOString() };
      else delete admin.muted[userId];
      await writeJsonFile(adminPath, admin).catch((error) => logger.warn(`Radio admin save failed: ${error?.message || error}`));
    },
    kick: (userId) => relay.kick(userId, RADIO_KICK_BLOCK_MS),
    postStaff,
  });

  function scheduleRejoin() {
    if (stopped || rejoinTimer) return;
    rejoinTimer = setTimeout(() => {
      rejoinTimer = null;
      void join();
    }, REJOIN_DELAY_MS);
    rejoinTimer.unref?.();
  }

  function listenTo(userId) {
    if (!connection || receiving.has(userId) || userId === client.user?.id) return;
    receiving.add(userId);
    const member = channel?.guild?.members?.cache?.get(userId);
    const name = member?.displayName || member?.user?.username || 'Unit';
    relay.discordSpeaking(userId, name, true);
    const { receiver } = connection;
    // A stream that just ended can linger for a tick; never reuse it or the voice is lost.
    const stale = receiver.subscriptions.get(userId);
    if (stale && (stale.readableEnded || stale.destroyed)) receiver.subscriptions.delete(userId);
    const stream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 400 },
    });
    const done = () => {
      if (!receiving.delete(userId)) return;
      relay.discordSpeaking(userId, name, false);
    };
    stream.on('data', (packet) => {
      stats.packets += 1;
      relay.relayDiscordAudio(userId, packet);
    });
    stream.once('end', done);
    stream.once('close', done);
    stream.on('error', (error) => {
      logger.warn(`Radio could not receive ${name}: ${error?.message || error}`);
      done();
    });
  }

  async function join() {
    if (stopped || joining) return;
    joining = true;
    try {
      channel = await client.channels.fetch(RADIO_CHANNEL_ID);
      if (!channel?.isVoiceBased?.()) throw new Error(`Channel ${RADIO_CHANNEL_ID} is not a voice channel the radio bot can see.`);
      const next = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        group: VOICE_GROUP,
        selfDeaf: false,
        selfMute: false,
        debug: true, // only used to count voice decrypt failures for the stats line
      });
      if (next !== connection) {
        connection = next;
        next.subscribe(player);
        next.receiver.speaking.on('start', (userId) => listenTo(userId));
        next.on('stateChange', () => relay.broadcastStatus());
        next.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(next, VoiceConnectionStatus.Signalling, 5_000),
              entersState(next, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch {
            next.destroy();
          }
        });
        next.on(VoiceConnectionStatus.Destroyed, () => {
          if (connection === next) connection = null;
          receiving.clear();
          relay.broadcastStatus();
          scheduleRejoin();
        });
        next.on('error', (error) => logger.warn(`Radio voice error: ${error?.message || error}`));
        next.on('debug', (message) => {
          if (/failed to decrypt/i.test(String(message))) stats.decryptFailures += 1;
        });
      }
      await entersState(next, VoiceConnectionStatus.Ready, 30_000);
      logger.info(`Radio bot connected to #${channel.name}.`);
    } catch (error) {
      logger.warn(`Radio bot could not join its channel: ${error?.message || error}`);
      scheduleRejoin();
    } finally {
      joining = false;
    }
  }

  client.once(Events.ClientReady, () => {
    try {
      client.user.setPresence({ activities: [], status: 'online' });
    } catch { /* ignore */ }
    logger.info(`Radio bot logged in as ${client.user.tag}.`);
    void join();
  });

  // Dragged out of the radio channel: go straight back.
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.id !== client.user?.id) {
      if (oldState.channelId === RADIO_CHANNEL_ID || newState.channelId === RADIO_CHANNEL_ID) {
        relay.broadcastStatus();
        if (oldState.channelId !== newState.channelId) relay.voiceChanged(newState.id);
      }
      // Someone joined or left the 911 waiting channel: the radios' pending calls change.
      if ((oldState.channelId === RADIO_911_CHANNEL_ID) !== (newState.channelId === RADIO_911_CHANNEL_ID)) {
        if (newState.channelId === RADIO_911_CHANNEL_ID) waitingSince.set(newState.id, Date.now());
        else waitingSince.delete(newState.id);
        relay.broadcastStatus();
      }
      return;
    }
    if (newState.channelId && newState.channelId !== RADIO_CHANNEL_ID && connection) {
      connection.rejoin({ channelId: RADIO_CHANNEL_ID, selfDeaf: false, selfMute: false });
    }
  });
  client.on(Events.Error, (error) => logger.warn(`Radio bot client error: ${error?.message || error}`));

  let standalone = null;
  const radioPort = Number(env.RADIO_PORT || 0);
  const apiPort = Number(env.SERVER_PORT || env.PORT || 0);
  // The bot API server only runs with BOT_API_KEY; without it the relay listens on SERVER_PORT itself.
  const apiServerRuns = Number.isInteger(apiPort) && apiPort > 0 && Boolean(env.BOT_API_KEY);
  const relayPort = Number.isInteger(radioPort) && radioPort > 0 ? radioPort : (apiServerRuns ? 0 : apiPort);
  if (!relayPort && !apiServerRuns) {
    logger.warn('Radio relay has no port: set SERVER_PORT (or RADIO_PORT) so the radio app can connect.');
  } else if (apiServerRuns && relayPort === 0) {
    logger.info(`Radio relay shares the bot API server on :${apiPort}/radio.`);
  }
  if (Number.isInteger(relayPort) && relayPort > 0 && !(apiServerRuns && relayPort === apiPort)) {
    standalone = createServer((request, response) => {
      response.writeHead(426, { 'Content-Type': 'text/plain' });
      response.end('Clearwater Radio relay. Connect with the desktop app.');
    });
    standalone.on('upgrade', (request, socket, head) => {
      if (!relay.handleUpgrade(request, socket, head)) socket.destroy();
    });
    standalone.on('error', (error) => logger.warn(`Radio relay server error: ${error?.message || error}`));
    standalone.listen(relayPort, '0.0.0.0', () => logger.info(`Radio relay listening on :${relayPort}/radio.`));
  }

  radioEnv = env;
  const stopTunnel = startRadioTunnel({
    port: (Number.isInteger(relayPort) && relayPort > 0) ? relayPort : apiPort,
    env,
    onUrl: (url) => { webRelayUrl = url; },
  });

  void client.login(token).catch((error) => {
    logger.error('Radio bot login failed (check RADIO_BOT_TOKEN).', error);
  });

  // `;panic` gives a Roblox ID and maybe a typed location: fill in the name and in-game location from ER:LC.
  const onPanic = createRadioPanicWatch((panic) => {
    void (async () => {
      const player = await findPanicPlayerInGame(env, { robloxId: panic.robloxId, names: [panic.name] });
      const message = {
        type: 'panic',
        name: player?.username || panic.name || 'Unknown',
        location: panic.location || playerLocationLabel(player),
        ...panicUnitAndPostal(player),
        at: panic.at,
      };
      relay.alert(message);
      postPanic({ ...message, source: 'game' });
      logger.info(`Radio: panic from ${message.name} at ${message.location || 'unknown location'} sent to ${relay.listeners} radio(s).`);
    })().catch((error) => logger.warn(`Radio panic failed: ${error?.message || error}`));
  });
  const onErlcEvent = (payload) => {
    try { onPanic(payload); } catch (error) { logger.warn(`Radio panic failed: ${error?.message || error}`); }
  };
  erlcEvents?.on('erlcEvent', onErlcEvent);
  erlcEvents?.on('erlcCommandLog', onErlcEvent);

  return () => {
    stopped = true;
    erlcEvents?.off('erlcEvent', onErlcEvent);
    erlcEvents?.off('erlcCommandLog', onErlcEvent);
    clearTimeout(settingsSaveTimer);
    clearTimeout(rejoinTimer);
    clearInterval(statsTimer);
    clearInterval(weeklyStatsTimer);
    clearInterval(coverageTimer);
    clearInterval(pruneTimer);
    clearTimeout(damageTimer);
    setRadioStaffControls(null);
    if (activeRelay === relay) activeRelay = null;
    stopTunnel();
    talkLog.stop();
    webRelayUrl = '';
    relay.close();
    try { standalone?.close(); } catch { /* ignore */ }
    try { connection?.destroy(); } catch { /* ignore */ }
    for (const bridge of bridges.values()) bridge.stop();
    player.stop(true);
    client.destroy();
  };
}
