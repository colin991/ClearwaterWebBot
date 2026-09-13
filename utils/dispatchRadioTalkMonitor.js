import {
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { VoiceOpcodes } from 'discord-api-types/voice/v8';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { DISPATCH_VOICE_CHANNEL_ID } from './dispatchChannelStatus.js';
import { logger } from './logger.js';
import { parseDeputyNickname } from './pinellasShiftPanel.js';
import { appendRadioTalkLog } from './pcsoRadioTalkLogs.js';
import { getActiveHold } from './holdVoiceChat.js';
import { relayDispatchStream } from './dispatchLiveAudio.js';

/** Minimum audible press-to-talk burst to keep as a log entry. */
const MIN_TALK_MS = 150;
/** Short recovery delay after an announcement or unexpected disconnect. */
const REJOIN_DELAY_MS = 2_000;

let clientRef = null;
let connection = null;
let rejoinTimer = null;
let stopping = false;
/** When true, Destroyed/Disconnected must not schedule a rejoin (we are replacing the connection). */
let replacingConnection = false;
/** When set, another feature (e.g. Frequency Change greeting) owns the guild VC. */
let paused = false;
let pauseReason = null;
let lastJoinAt = 0;
let lastTalkStartAt = null;
let lastTalkEndAt = null;
let lastTalkUserId = null;
let talkStartCount = 0;
let talkSavedCount = 0;

/** userId -> { startedAt: number, memberSnapshot } */
const activeTalk = new Map();

/** True while radio monitoring is paused so another VC feature can speak. */
export function isDispatchRadioMonitorPaused() {
  return paused;
}

export function getDispatchRadioMonitorStatus() {
  const joinConfig = connection?.joinConfig;
  const guildId = joinConfig?.guildId;
  const guild = guildId ? clientRef?.guilds?.cache?.get(guildId) : null;
  const channel = guild?.channels?.cache?.get(DISPATCH_VOICE_CHANNEL_ID);
  const membersInChannel = channel?.isVoiceBased?.()
    ? [...channel.members.values()].filter((member) => !member.user?.bot).length
    : 0;
  return {
    paused,
    pauseReason,
    stopping,
    channelId: joinConfig?.channelId || null,
    connectionStatus: connection?.state?.status || null,
    activeTalkCount: activeTalk.size,
    membersInChannel,
    lastJoinAt: lastJoinAt || null,
    lastTalkStartAt,
    lastTalkEndAt,
    lastTalkUserId,
    talkStartCount,
    talkSavedCount,
  };
}

/**
 * Temporarily stop radio listening / auto-rejoin so another feature can use the
 * guild voice connection (Frequency Change greetings, etc.).
 */
export function pauseDispatchRadioMonitor(reason = 'paused') {
  paused = true;
  pauseReason = String(reason || 'paused');
  clearRejoinTimer();
  logger.info(`Radio talk monitor paused (${pauseReason}).`);
}

/**
 * Resume radio listening after another feature finishes with the guild VC.
 */
export function resumeDispatchRadioMonitor(reason = 'resumed') {
  const wasPaused = paused;
  paused = false;
  pauseReason = null;
  if (!wasPaused) return;
  logger.info(`Radio talk monitor resumed (${reason}).`);
  if (!stopping && clientRef) {
    scheduleRejoin(`resume:${reason}`);
  }
}

function clearRejoinTimer() {
  if (!rejoinTimer) return;
  clearTimeout(rejoinTimer);
  rejoinTimer = null;
}

/**
 * Clearwater radio nicknames look like: `<callsign> | <roblox username>`.
 * Fall back to the shared deputy nickname parser for older formats.
 */
export function radioIdentityFromMember(member) {
  const nick = String(
    member?.nickname
    || member?.displayName
    || member?.user?.globalName
    || member?.user?.username
    || '',
  ).trim();
  const pipeParts = nick.split('|').map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    return {
      callsign: pipeParts[0].slice(0, 64),
      memberName: pipeParts.slice(1).join(' | ').slice(0, 120),
    };
  }

  const parsed = parseDeputyNickname(nick);
  return {
    callsign: parsed.callsign && parsed.callsign !== '—' ? parsed.callsign : '',
    memberName: parsed.roleplayName && parsed.roleplayName !== '—'
      ? parsed.roleplayName
      : (member?.displayName || member?.user?.username || ''),
  };
}

function callsignForMember(member) {
  return radioIdentityFromMember(member).callsign;
}

/** Log every non-bot talker in the dispatch radio VC. */
export function shouldLogRadioTalk(member) {
  return Boolean(member && !member.user?.bot);
}

/** @deprecated use shouldLogRadioTalk */
export function isPcsoRadioUnit(member) {
  return shouldLogRadioTalk(member);
}

function keepReceiveAlive(voiceConnection, userId) {
  try {
    const stream = voiceConnection.receiver?.subscribe(String(userId), {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 400 },
    });
    if (!stream) return;
    relayDispatchStream(stream, String(userId), () => !paused && !stopping && isHealthyRadioConnection(voiceConnection));
    stream.on('error', () => {});
  } catch {
    // Receive subscribe is best-effort; speaking events can still fire without it.
  }
}

async function resolveRadioChannel(client) {
  const channel = client.channels.cache.get(DISPATCH_VOICE_CHANNEL_ID)
    || await client.channels.fetch(DISPATCH_VOICE_CHANNEL_ID).catch((error) => {
      logger.error(`Radio talk monitor: could not fetch VC ${DISPATCH_VOICE_CHANNEL_ID}`, error);
      return null;
    });
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    logger.error(`Radio talk monitor: ${DISPATCH_VOICE_CHANNEL_ID} is not a voice channel.`);
    return null;
  }
  return channel;
}

function isHealthyRadioConnection(voiceConnection = connection) {
  if (!voiceConnection) return false;
  if (voiceConnection.state?.status !== VoiceConnectionStatus.Ready) return false;
  return voiceConnection.joinConfig?.channelId === DISPATCH_VOICE_CHANNEL_ID;
}

async function beginTalk(voiceConnection, guild, userId, source = 'udp') {
  if (stopping || paused) return;
  const id = String(userId);
  if (activeTalk.has(id)) return;

  const member = guild.members.cache.get(id)
    || await guild.members.fetch(id).catch(() => null);
  if (!shouldLogRadioTalk(member)) return;
  if (member.voice?.channelId !== DISPATCH_VOICE_CHANNEL_ID) return;

  keepReceiveAlive(voiceConnection, id);
  const identity = radioIdentityFromMember(member);
  activeTalk.set(id, {
    startedAt: Date.now(),
    member,
    callsign: identity.callsign,
    memberName: identity.memberName,
    username: member.user?.username || '',
    displayName: identity.memberName || member.displayName || '',
  });
  talkStartCount += 1;
  lastTalkStartAt = new Date().toISOString();
  lastTalkUserId = id;
  logger.info(
    `Radio talk start (${source}): ${identity.callsign || identity.memberName || id} `
    + `(${member.user?.username || id})`,
  );
}

async function finalizeTalk(userId, member = null, endedAt = Date.now()) {
  const active = activeTalk.get(String(userId));
  if (!active) return null;
  activeTalk.delete(String(userId));

  const durationMs = Math.max(0, endedAt - active.startedAt);
  lastTalkEndAt = new Date(endedAt).toISOString();
  lastTalkUserId = String(userId);
  if (durationMs < MIN_TALK_MS) return null;

  const snapshot = member || active.member;
  const identity = radioIdentityFromMember(snapshot);
  const callsign = identity.callsign || active.callsign || '';
  const memberName = identity.memberName || active.memberName || active.displayName || '';
  const entry = {
    userId: String(userId),
    username: snapshot?.user?.username || active.username || '',
    displayName: memberName
      || snapshot?.displayName
      || snapshot?.user?.globalName
      || active.displayName
      || '',
    callsign,
    startedAt: new Date(active.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs,
    channelId: DISPATCH_VOICE_CHANNEL_ID,
  };

  try {
    await appendRadioTalkLog(entry);
    talkSavedCount += 1;
    logger.info(
      `Radio talk: ${entry.callsign || entry.displayName || entry.userId} `
      + `spoke for ${Math.round(durationMs / 1000)}s on dispatch radio.`,
    );
  } catch (error) {
    logger.error('Radio talk monitor: failed to save talk log', error);
  }
  return entry;
}

function bindSpeakingListeners(voiceConnection, guild) {
  const receiver = voiceConnection.receiver;
  const speaking = receiver?.speaking;
  if (!speaking) {
    logger.error('Radio talk monitor: voice receiver speaking map unavailable.');
    return;
  }

  // UDP speaking map (works when voice UDP audio packets arrive).
  speaking.removeAllListeners('start');
  speaking.removeAllListeners('end');
  speaking.on('start', (userId) => {
    void beginTalk(voiceConnection, guild, userId, 'udp').catch((error) => {
      logger.warn(`Radio talk monitor: speak-start failed: ${error?.message || error}`);
    });
  });
  speaking.on('end', (userId) => {
    void finalizeTalk(userId).catch((error) => {
      logger.warn(`Radio talk monitor: speak-end failed: ${error?.message || error}`);
    });
  });

  // Voice websocket Speaking opcode (op 5). This works even when UDP receive is
  // blocked/broken on the bot host — the common reason logs stay empty while Ready.
  if (!receiver.__pcsoWsSpeakingHooked) {
    receiver.__pcsoWsSpeakingHooked = true;
    const originalOnWsPacket = receiver.onWsPacket.bind(receiver);
    receiver.onWsPacket = (packet) => {
      originalOnWsPacket(packet);
      try {
        if (packet?.op !== VoiceOpcodes.Speaking) return;
        const userId = String(packet?.d?.user_id || '');
        if (!userId) return;
        const speakingBits = Number(packet?.d?.speaking || 0);
        if (speakingBits > 0) {
          void beginTalk(voiceConnection, guild, userId, 'ws').catch((error) => {
            logger.warn(`Radio talk monitor: WS speak-start failed: ${error?.message || error}`);
          });
        } else {
          void finalizeTalk(userId).catch((error) => {
            logger.warn(`Radio talk monitor: WS speak-end failed: ${error?.message || error}`);
          });
        }
      } catch (error) {
        logger.warn(`Radio talk monitor: WS speaking hook failed: ${error?.message || error}`);
      }
    };
    logger.info('Radio talk monitor: voice WS Speaking opcode hook installed.');
  }
}

function scheduleRejoin(reason = 'disconnected') {
  if (stopping || paused || replacingConnection || rejoinTimer) return;
  logger.info(`Radio talk monitor: scheduling rejoin (${reason}) in ${REJOIN_DELAY_MS}ms.`);
  rejoinTimer = setTimeout(() => {
    rejoinTimer = null;
    if (stopping || paused || replacingConnection) return;
    // Already healthy in the radio VC — do not destroy/recreate, but keep listeners wired.
    if (isHealthyRadioConnection()) {
      const guildId = connection?.joinConfig?.guildId;
      const guild = guildId ? clientRef?.guilds?.cache?.get(guildId) : null;
      if (connection && guild) wireConnectionLifecycle(connection, guild);
      logger.info('Radio talk monitor: skip scheduled rejoin; already Ready — rebound talk listeners.');
      return;
    }
    void joinDispatchRadio(clientRef, { force: true }).catch((error) => {
      logger.error('Radio talk monitor: rejoin failed', error);
      scheduleRejoin('rejoin_failed');
    });
  }, REJOIN_DELAY_MS);
  rejoinTimer.unref?.();
}

function wireConnectionLifecycle(voiceConnection, guild) {
  voiceConnection.removeAllListeners('stateChange');
  voiceConnection.removeAllListeners('error');

  voiceConnection.on('stateChange', (oldState, newState) => {
    if (stopping || paused || replacingConnection) return;
    if (newState.status === VoiceConnectionStatus.Destroyed) {
      if (connection === voiceConnection) connection = null;
      scheduleRejoin('destroyed');
      return;
    }
    if (
      oldState.status !== VoiceConnectionStatus.Disconnected
      && newState.status === VoiceConnectionStatus.Disconnected
    ) {
      // Discord often flaps Disconnected briefly; only rejoin if we stay down.
      setTimeout(() => {
        if (stopping || paused || replacingConnection) return;
        if (isHealthyRadioConnection(voiceConnection)) return;
        if (connection !== voiceConnection) return;
        scheduleRejoin('disconnected');
      }, 2_500).unref?.();
    }
  });

  voiceConnection.on('error', (error) => {
    logger.warn(`Radio talk monitor connection error: ${error?.message || error}`);
  });

  bindSpeakingListeners(voiceConnection, guild);

  // Prime receive subscriptions for people already in the radio VC so speaking
  // packets map cleanly once they key up.
  const channel = guild.channels.cache.get(DISPATCH_VOICE_CHANNEL_ID);
  if (channel?.isVoiceBased?.()) {
    for (const [, member] of channel.members) {
      if (!shouldLogRadioTalk(member)) continue;
      keepReceiveAlive(voiceConnection, member.id);
    }
  }
}

/**
 * Join the PCSO dispatch radio VC and listen for PCSO unit PTT talk times.
 * Safe to call repeatedly — reuses an existing healthy connection.
 */
export async function joinDispatchRadio(client, { force = false } = {}) {
  if (!client) return { ok: false, reason: 'no_client' };
  clientRef = client;
  stopping = false;
  if (paused) {
    logger.info(`Radio talk monitor: join skipped while paused (${pauseReason || 'paused'}).`);
    return { ok: false, reason: 'paused' };
  }

  const channel = await resolveRadioChannel(client);
  if (!channel) return { ok: false, reason: 'channel_unavailable' };

  const hold = getActiveHold(channel.guild.id);
  if (hold && hold.channelId !== channel.id) {
    logger.info('Radio talk monitor: hold VC is active in another channel; will retry.');
    scheduleRejoin('hold_active');
    return { ok: false, reason: 'hold_active' };
  }

  const existing = getVoiceConnection(channel.guild.id);
  if (existing && existing.joinConfig?.channelId === channel.id && isHealthyRadioConnection(existing) && !force) {
    connection = existing;
    clearRejoinTimer();
    // Always re-bind speaking listeners on reuse — another feature may have owned
    // this Ready connection without radio talk hooks, which left the admin log empty.
    wireConnectionLifecycle(existing, channel.guild);
    logger.info('Radio talk monitor: reused Ready radio VC and rebound talk listeners.');
    return { ok: true, reused: true };
  }

  // force=true always tears down and rejoins undeafened so voice WS Speaking
  // packets are received (a reused connection may have been joined deafened).

  const me = channel.guild.members.me
    || await channel.guild.members.fetchMe().catch(() => null);
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
    logger.error('Radio talk monitor: missing Connect/Speak in the dispatch radio VC.');
    return { ok: false, reason: 'missing_permissions' };
  }

  replacingConnection = true;
  clearRejoinTimer();
  if (existing) {
    try { existing.destroy(); } catch { /* ignore */ }
  }

  connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    try { connection.destroy(); } catch { /* ignore */ }
    connection = null;
    replacingConnection = false;
    logger.error('Radio talk monitor: failed to become Ready', error);
    scheduleRejoin('ready_timeout');
    return { ok: false, reason: 'ready_timeout' };
  }

  replacingConnection = false;
  clearRejoinTimer();
  lastJoinAt = Date.now();
  wireConnectionLifecycle(connection, channel.guild);
  logger.info(`Radio talk monitor joined dispatch radio VC ${channel.id}.`);
  return { ok: true, reused: false };
}

/** Flush open talk sessions when a PCSO unit leaves the radio VC. */
export async function handleRadioTalkVoiceStateUpdate(oldState, newState) {
  const userId = oldState?.id || newState?.id;
  if (!userId) return null;
  const leftRadio = oldState?.channelId === DISPATCH_VOICE_CHANNEL_ID
    && newState?.channelId !== DISPATCH_VOICE_CHANNEL_ID;
  if (!leftRadio) return null;
  return finalizeTalk(userId, oldState.member || newState.member);
}

export function startDispatchRadioTalkMonitor(client) {
  clientRef = client;
  stopping = false;
  replacingConnection = false;

  setTimeout(() => {
    // Force a fresh join so the WS Speaking hook is installed on this process's connection.
    void joinDispatchRadio(client, { force: true }).catch((error) => {
      logger.error('Radio talk monitor: initial join failed', error);
      scheduleRejoin('initial_join_failed');
    });
  }, 6_000);

  logger.info(
    `Radio talk monitor armed → VC ${DISPATCH_VOICE_CHANNEL_ID} `
    + '(logs every non-bot transmit via UDP + voice WS Speaking; nicknames as callsign | roblox user).',
  );

  return () => {
    stopping = true;
    paused = false;
    pauseReason = null;
    replacingConnection = true;
    clearRejoinTimer();
    for (const userId of [...activeTalk.keys()]) {
      void finalizeTalk(userId);
    }
    try { connection?.destroy(); } catch { /* ignore */ }
    connection = null;
    replacingConnection = false;
  };
}
