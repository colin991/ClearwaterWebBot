import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { DISPATCH_VOICE_CHANNEL_ID } from './dispatchChannelStatus.js';
import { logger } from './logger.js';
import {
  isOtherDepartmentCallsign,
  isPinellasDiscordStaff,
  parseDeputyNickname,
} from './pinellasShiftPanel.js';
import { appendRadioTalkLog } from './pcsoRadioTalkLogs.js';
import { getActiveHold } from './holdVoiceChat.js';

/** Minimum audible press-to-talk burst to keep as a log entry. */
const MIN_TALK_MS = 300;
/** Rejoin delay after another feature steals the guild voice connection. */
const REJOIN_DELAY_MS = 8_000;

let clientRef = null;
let connection = null;
let rejoinTimer = null;
let stopping = false;
/** When set, another feature (e.g. Frequency Change greeting) owns the guild VC. */
let paused = false;
let pauseReason = null;

/** userId -> { startedAt: number, memberSnapshot } */
const activeTalk = new Map();

/** True while radio monitoring is paused so another VC feature can speak. */
export function isDispatchRadioMonitorPaused() {
  return paused;
}

/**
 * Temporarily stop radio listening / auto-rejoin so another feature can use the
 * guild voice connection (Frequency Change greetings, etc.).
 */
export function pauseDispatchRadioMonitor(reason = 'paused') {
  paused = true;
  pauseReason = String(reason || 'paused');
  if (rejoinTimer) {
    clearTimeout(rejoinTimer);
    rejoinTimer = null;
  }
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

function callsignForMember(member) {
  const parsed = parseDeputyNickname(
    member?.nickname || member?.displayName || member?.user?.globalName || member?.user?.username || '',
  );
  const callsign = parsed.callsign && parsed.callsign !== '—' ? parsed.callsign : '';
  return callsign;
}

export function isPcsoRadioUnit(member) {
  if (!member || member.user?.bot) return false;
  if (!isPinellasDiscordStaff(member)) return false;
  const callsign = callsignForMember(member);
  if (callsign && isOtherDepartmentCallsign(callsign)) return false;
  return true;
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

async function finalizeTalk(userId, member = null, endedAt = Date.now()) {
  const active = activeTalk.get(String(userId));
  if (!active) return null;
  activeTalk.delete(String(userId));

  const durationMs = Math.max(0, endedAt - active.startedAt);
  if (durationMs < MIN_TALK_MS) return null;

  const snapshot = member || active.member;
  const callsign = callsignForMember(snapshot) || active.callsign || '';
  const entry = {
    userId: String(userId),
    username: snapshot?.user?.username || active.username || '',
    displayName: snapshot?.displayName || snapshot?.user?.globalName || active.displayName || '',
    callsign,
    startedAt: new Date(active.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs,
    channelId: DISPATCH_VOICE_CHANNEL_ID,
  };

  try {
    await appendRadioTalkLog(entry);
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
  const speaking = voiceConnection.receiver?.speaking;
  if (!speaking) {
    logger.error('Radio talk monitor: voice receiver speaking map unavailable.');
    return;
  }

  speaking.on('start', (userId) => {
    void (async () => {
      try {
        if (stopping) return;
        const id = String(userId);
        if (activeTalk.has(id)) return;
        const member = guild.members.cache.get(id)
          || await guild.members.fetch(id).catch(() => null);
        if (!isPcsoRadioUnit(member)) return;
        if (member.voice?.channelId !== DISPATCH_VOICE_CHANNEL_ID) return;

        activeTalk.set(id, {
          startedAt: Date.now(),
          member,
          callsign: callsignForMember(member),
          username: member.user?.username || '',
          displayName: member.displayName || '',
        });
      } catch (error) {
        logger.warn(`Radio talk monitor: speak-start failed: ${error?.message || error}`);
      }
    })();
  });

  speaking.on('end', (userId) => {
    void finalizeTalk(userId).catch((error) => {
      logger.warn(`Radio talk monitor: speak-end failed: ${error?.message || error}`);
    });
  });
}

function scheduleRejoin(reason = 'disconnected') {
  if (stopping || paused || rejoinTimer) return;
  logger.info(`Radio talk monitor: scheduling rejoin (${reason}) in ${REJOIN_DELAY_MS}ms.`);
  rejoinTimer = setTimeout(() => {
    rejoinTimer = null;
    if (stopping || paused) return;
    void joinDispatchRadio(clientRef, { force: true }).catch((error) => {
      logger.error('Radio talk monitor: rejoin failed', error);
      scheduleRejoin('rejoin_failed');
    });
  }, REJOIN_DELAY_MS);
  rejoinTimer.unref?.();
}

function wireConnectionLifecycle(voiceConnection, guild) {
  voiceConnection.on('stateChange', (oldState, newState) => {
    if (stopping || paused) return;
    if (newState.status === VoiceConnectionStatus.Destroyed) {
      connection = null;
      scheduleRejoin('destroyed');
      return;
    }
    if (
      oldState.status !== VoiceConnectionStatus.Disconnected
      && newState.status === VoiceConnectionStatus.Disconnected
    ) {
      scheduleRejoin('disconnected');
    }
  });

  voiceConnection.on('error', (error) => {
    logger.warn(`Radio talk monitor connection error: ${error?.message || error}`);
  });

  bindSpeakingListeners(voiceConnection, guild);
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
  if (existing && existing.joinConfig?.channelId === channel.id && !force) {
    connection = existing;
    return { ok: true, reused: true };
  }

  const me = channel.guild.members.me
    || await channel.guild.members.fetchMe().catch(() => null);
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
    logger.error('Radio talk monitor: missing Connect/Speak in the dispatch radio VC.');
    return { ok: false, reason: 'missing_permissions' };
  }

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
    logger.error('Radio talk monitor: failed to become Ready', error);
    scheduleRejoin('ready_timeout');
    return { ok: false, reason: 'ready_timeout' };
  }

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

  setTimeout(() => {
    void joinDispatchRadio(client, { force: true }).catch((error) => {
      logger.error('Radio talk monitor: initial join failed', error);
      scheduleRejoin('initial_join_failed');
    });
  }, 6_000);

  logger.info(
    `Radio talk monitor armed → VC ${DISPATCH_VOICE_CHANNEL_ID} `
    + '(logs PCSO unit transmit duration only).',
  );

  return () => {
    stopping = true;
    paused = false;
    pauseReason = null;
    if (rejoinTimer) {
      clearTimeout(rejoinTimer);
      rejoinTimer = null;
    }
    for (const userId of [...activeTalk.keys()]) {
      void finalizeTalk(userId);
    }
    try { connection?.destroy(); } catch { /* ignore */ }
    connection = null;
  };
}
