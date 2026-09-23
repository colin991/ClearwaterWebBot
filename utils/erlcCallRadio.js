import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChannelType } from 'discord.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { logger } from './logger.js';
import { PRIORITY_BEEP_PATH, PRIORITY_VOICE } from './priorityRequest.js';
import {
  ensureGuildVoiceConnection,
  playMp3QueueInVoiceChannel,
  synthesizeSpeechMp3,
} from './vcSpeak.js';

export const CALL_RADIO_CHANNELS = Object.freeze({
  leo: '1514128904783139018',
  fire: '1514128961951760515',
  dot: '1514130037052407932',
});

export const FD_TONE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fd-tone.ogg');
export const CALL_RADIO_POLL_MS = 5_000;
export const CALL_RADIO_VOICE_RATE = 1;

const DEDUP_MS = 2 * 60 * 1000;
const recentKeys = new Map();
let radioQueue = Promise.resolve();

function enqueueRadio(work) {
  const run = radioQueue.then(work, work);
  radioQueue = run.catch(() => {});
  return run;
}

function mappings(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const nested = [payload.Data, payload.data, payload.Payload, payload.payload, payload.Event, payload.event, payload.Call, payload.call];
  return [payload, ...nested.filter((value) => value && typeof value === 'object' && !Array.isArray(value))];
}

function firstString(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
  }
  return '';
}

function firstNumber(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = Number(object?.[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return 0;
}

function cleanSpeech(value, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function radioTeam(team) {
  const label = String(team || '').replace(/[_-]+/g, ' ');
  if (/\bfire\b/i.test(label)) return 'fire';
  if (/\b(police|sheriff|leo)\b/i.test(label)) return 'leo';
  if (/\bdot\b/i.test(label) || /department of transportation/i.test(label)) return 'dot';
  return null;
}

export function isErlcCommandEvent(payload) {
  const text = firstString(mappings(payload), ['Command', 'command', 'Message', 'message', 'Content', 'content', 'Text', 'text']);
  return text.startsWith(';');
}

export function isEmergencyCallEvent(payload) {
  if (!payload || typeof payload !== 'object' || isErlcCommandEvent(payload)) return false;
  const type = firstString(mappings(payload), ['Type', 'type', 'EventType', 'eventType', 'Name', 'name']);
  if (/emergency\s*call/i.test(type) || /^calls?$/i.test(type) || /^911$/i.test(type)) return true;
  const parsed = parseErlcEmergencyCall(payload);
  return Boolean(parsed.team && (parsed.description || parsed.location || parsed.callNumber));
}

function callerFromRaw(raw) {
  if (raw && typeof raw === 'object') {
    return {
      username: String(raw.Name || raw.Username || raw.username || '').trim(),
      robloxId: String(raw.Id || raw.id || raw.UserId || raw.userId || raw.PlayerId || raw.playerId || '').trim(),
    };
  }
  const text = String(raw || '').trim();
  if (!text) return { username: '', robloxId: '' };
  const separator = text.lastIndexOf(':');
  if (separator > 0 && /^\d{1,20}$/.test(text.slice(separator + 1))) {
    return { username: text.slice(0, separator), robloxId: text.slice(separator + 1) };
  }
  if (/^\d{1,20}$/.test(text)) return { username: '', robloxId: text };
  return { username: text, robloxId: '' };
}

export function parseErlcEmergencyCall(payload = {}) {
  const objects = mappings(payload);
  const caller = callerFromRaw(
    objects.map((object) => object.Player || object.player || object.Caller || object.caller || object.CallerId || object.caller_id).find(Boolean),
  );
  const callerId = caller.robloxId || firstString(objects, ['CallerId', 'callerId', 'caller_id', 'UserId', 'userId']);
  return {
    team: firstString(objects, ['Team', 'team']),
    description: firstString(objects, ['Description', 'description', 'Message', 'message', 'Text', 'text', 'Call', 'call', 'Input', 'input']),
    location: firstString(objects, [
      'PositionDescriptor', 'position_descriptor', 'positionDescriptor', 'Location', 'location',
      'Postal', 'postal', 'Street', 'street', 'Address', 'address',
    ]),
    callerName: caller.username || firstString(objects, ['CallerName', 'callerName', 'Username', 'username', 'PlayerName', 'playerName']),
    callerId: String(callerId || caller.robloxId || ''),
    callNumber: firstNumber(objects, ['CallNumber', 'callNumber', 'call_number', 'Number', 'number', 'Id', 'id']),
    startedAt: firstNumber(objects, ['StartedAt', 'startedAt', 'started_at', 'Timestamp', 'timestamp']),
  };
}

export function classifyRadioCall(call = {}) {
  const team = radioTeam(call.team);
  if (!team) return null;
  const description = cleanSpeech(call.description);
  const lower = description.toLowerCase();
  if (team === 'dot') return { team, kind: 'dot', label: description || 'A call' };
  if (team === 'fire') {
    if (/\bstructure\s*fire\b|\bbuilding\s*fire\b/.test(lower) || /^structure\s*fire$/i.test(description)) {
      return { team, kind: 'fire_structure', label: description || 'Structure fire' };
    }
    if (!description) return null;
    return { team, kind: 'fire_911', label: description };
  }
  if (/\bcash\s*register\b/.test(lower)) return { team, kind: 'leo_server', label: 'Cash register robbery' };
  if (/\b(house|home|residential)\b/.test(lower) && /rob/.test(lower)) {
    return { team, kind: 'leo_server', label: 'House robbery' };
  }
  if (/\batm\b/.test(lower) && /rob/.test(lower)) return { team, kind: 'leo_server', label: 'ATM robbery' };
  if (!description) return null;
  return { team, kind: 'leo_911', label: description };
}

export function callRadioChannelId(team) {
  return CALL_RADIO_CHANNELS[team] || null;
}

function speechLocation(call) {
  return cleanSpeech(call.location, 'an unknown location');
}

export function radioCallSpeech(call, classified = classifyRadioCall(call)) {
  if (!classified) return '';
  const location = speechLocation(call);
  const user = cleanSpeech(call.callerName, 'an unknown user');
  if (classified.kind === 'leo_server') {
    return `${classified.label} reported by ${user} at ${location} nearby units please attach.`;
  }
  if (classified.kind === 'leo_911') {
    return `${classified.label} reported at ${location} any nearby units please attach.`;
  }
  if (classified.kind === 'fire_structure') {
    return `Attention station 48. Attention station 48. ${classified.label} reported at ${location}. Engine 48, ladder 48, medic 48, and all command please respond.`;
  }
  if (classified.kind === 'fire_911') {
    return `${classified.label} reported at ${location} available apparatus please attach.`;
  }
  return `${classified.label} reported at ${location} nearby trucks please respond.`;
}

export function radioCallTonePath(classified) {
  if (!classified) return null;
  if (classified.team === 'leo') return PRIORITY_BEEP_PATH;
  if (classified.team === 'fire') return FD_TONE_PATH;
  return null;
}

export function radioCallKey(call = {}) {
  return [
    call.callNumber || '',
    call.startedAt || '',
    radioTeam(call.team) || call.team || '',
    cleanSpeech(call.description).toLowerCase(),
    cleanSpeech(call.location).toLowerCase(),
  ].join('|');
}

function rememberCall(key, now) {
  recentKeys.set(key, now);
  if (recentKeys.size > 300) {
    for (const [entry, at] of recentKeys) {
      if (now - at > DEDUP_MS * 2) recentKeys.delete(entry);
    }
  }
}

export function wasRecentRadioCall(key, now = Date.now()) {
  const last = recentKeys.get(key);
  return Boolean(last && now - last < DEDUP_MS);
}

function listEmergencyCalls(server) {
  const raw = server?.EmergencyCalls || server?.emergencyCalls || server?.Calls || server?.calls || [];
  return (Array.isArray(raw) ? raw : []).map((entry) => parseErlcEmergencyCall(entry));
}

function listPlayers(server) {
  return (server?.Players || server?.players || []).map((entry) => (
    entry?.username != null ? entry : parseErlcPlayer(entry)
  ));
}

export function withCallerName(call, players = []) {
  if (cleanSpeech(call.callerName) && !/^\d+$/.test(call.callerName)) return call;
  const id = String(call.callerId || '').trim();
  const match = (Array.isArray(players) ? players : []).find((player) => String(player.robloxId) === id)
    || (Array.isArray(players) ? players : []).find((player) => (
      call.callerName && String(player.username || '').toLowerCase() === String(call.callerName).toLowerCase()
    ));
  if (!match?.username) return call;
  return { ...call, callerName: match.username, callerId: match.robloxId || call.callerId };
}

export async function playRadioCallAnnouncement(channel, call, classified, {
  join = ensureGuildVoiceConnection,
  synthesize = synthesizeSpeechMp3,
  playQueue = playMp3QueueInVoiceChannel,
} = {}) {
  const text = radioCallSpeech(call, classified);
  if (!text) return { played: false, reason: 'no_speech' };
  const tone = radioCallTonePath(classified);
  await join(channel, channel.guild.voiceAdapterCreator);
  const speechPromise = synthesize(text, PRIORITY_VOICE, { rate: CALL_RADIO_VOICE_RATE });
  const clips = [];
  if (tone) clips.push(tone);
  clips.push(speechPromise);
  await playQueue(channel, channel.guild.voiceAdapterCreator, clips, {
    leaveAfter: true,
    speakDelayMs: 400,
    volume: 1,
    volumes: tone ? [0.7, 1] : [1],
    idleTimeoutMs: 20_000,
  });
  return { played: true, channelId: channel.id, text };
}

async function announceOnChannel(client, call, classified) {
  const channelId = callRadioChannelId(classified.team);
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
  if (!channel || (channel.type !== ChannelType.GuildVoice && !channel.isVoiceBased?.())) {
    throw new Error(`Call radio channel ${channelId} is unavailable.`);
  }
  const me = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
  if (me) {
    const perms = channel.permissionsFor(me);
    if (perms && !perms.has(['Connect', 'Speak'])) {
      throw new Error(`The bot needs Connect and Speak in ${classified.team} radio.`);
    }
  }
  return playRadioCallAnnouncement(channel, call, classified);
}

export async function handleErlcCallEvent(payload, {
  client,
  now = Date.now(),
  snapshot,
  announce = announceOnChannel,
} = {}) {
  if (!isEmergencyCallEvent(payload)) return { handled: false, reason: 'not_emergency_call' };
  let call = parseErlcEmergencyCall(payload);
  let players = [];
  try {
    const server = snapshot
      ? await snapshot()
      : (client?.config?.erlcServerKey ? await fetchErlcServer(client.config.erlcServerKey) : null);
    if (server) {
      players = listPlayers(server);
      if (!call.team || !call.location || !call.description) {
        const live = listEmergencyCalls(server);
        const match = live.find((entry) => (
          (call.callNumber && entry.callNumber === call.callNumber)
          || (call.startedAt && entry.startedAt === call.startedAt)
        )) || live[live.length - 1];
        if (match) call = { ...match, ...Object.fromEntries(Object.entries(call).filter(([, value]) => value)) };
      }
    }
  } catch (error) {
    logger.warn(`Call radio: snapshot unavailable (${error?.message || error})`);
  }
  call = withCallerName(call, players);
  const classified = classifyRadioCall(call);
  if (!classified) return { handled: false, reason: 'ignored_call' };
  const key = radioCallKey(call);
  if (wasRecentRadioCall(key, now)) return { handled: false, reason: 'duplicate' };
  rememberCall(key, now);
  try {
    const result = await enqueueRadio(() => announce(client, call, classified));
    logger.info(`Call radio: ${classified.kind} on ${classified.team} (${call.description || 'call'})`);
    return { handled: true, reason: 'announced', classified, text: radioCallSpeech(call, classified), ...result };
  } catch (error) {
    recentKeys.delete(key);
    logger.error(`Call radio failed for ${classified.kind}`, error);
    return { handled: false, reason: 'announce_failed', error: error?.message || String(error) };
  }
}

export function startErlcCallRadio(client) {
  let primed = false;
  const listener = (payload, eventId) => {
    void handleErlcCallEvent(payload, { client, eventId }).catch((error) => {
      logger.error('Call radio event failed', error);
    });
  };
  client.on('erlcEvent', listener);

  const poll = async () => {
    if (!client.config?.erlcServerKey) return;
    try {
      const server = await fetchErlcServer(client.config.erlcServerKey);
      const now = Date.now();
      const calls = listEmergencyCalls(server);
      if (!primed) {
        for (const call of calls) rememberCall(radioCallKey(call), now);
        primed = true;
        return;
      }
      for (const call of calls) {
        const classified = classifyRadioCall(withCallerName(call, listPlayers(server)));
        if (!classified) continue;
        await handleErlcCallEvent({
          Type: 'EmergencyCall',
          Team: call.team,
          Description: call.description,
          PositionDescriptor: call.location,
          Caller: call.callerName && call.callerId ? `${call.callerName}:${call.callerId}` : (call.callerId || call.callerName),
          CallNumber: call.callNumber,
          StartedAt: call.startedAt,
        }, { client, now, snapshot: async () => server });
      }
    } catch (error) {
      logger.warn(`Call radio poll failed: ${error?.message || error}`);
    }
  };

  const timer = setInterval(() => { void poll(); }, CALL_RADIO_POLL_MS);
  timer.unref?.();
  void poll();
  logger.info('ER:LC call radio armed (LEO / Fire / DOT).');
  return () => {
    clearInterval(timer);
    client.off('erlcEvent', listener);
  };
}
