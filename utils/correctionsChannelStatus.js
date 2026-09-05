import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

/** Voice channel whose status tracks whether a `2W-06 |`-style corrections callsign is present. */
export const CORRECTIONS_VOICE_CHANNEL_ID = '1545525189339774997';

export const CORRECTIONS_STATUS_ONLINE = 'Corrections Online';

/** Matches callsigns like `2W-06 |` or `3W-01 |` anywhere in a name. */
export const CORRECTIONS_CALLSIGN_PATTERN = /\dW-\d+\s*\|/;

/** How often to re-scan the corrections VC for callsigns. */
export const CORRECTIONS_STATUS_POLL_MS = 5_000;

function memberTexts(member) {
  return [
    member?.nickname,
    member?.displayName,
    member?.user?.globalName,
    member?.user?.username,
  ].filter(Boolean);
}

export function memberHasCorrectionsCallsign(member) {
  if (!member || member.user?.bot) return false;
  return memberTexts(member).some((text) => CORRECTIONS_CALLSIGN_PATTERN.test(String(text)));
}

function listCorrectionsCallsignMembers(channel) {
  const matches = [];
  if (!channel?.members) return matches;
  for (const member of channel.members.values()) {
    if (memberHasCorrectionsCallsign(member)) matches.push(member);
  }
  return matches;
}

async function resolveCorrectionsChannel(client) {
  // Force-fetch so voice member membership stays current for the poll loop.
  const channel = await client.channels.fetch(CORRECTIONS_VOICE_CHANNEL_ID).catch((error) => {
    logger.error(`Corrections status: could not fetch VC ${CORRECTIONS_VOICE_CHANNEL_ID}`, error);
    return null;
  });
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    logger.error(`Corrections status: ${CORRECTIONS_VOICE_CHANNEL_ID} is not a voice channel.`);
    return null;
  }
  return channel;
}

async function setVoiceChannelStatus(client, channelId, status) {
  // Discord accepts a string status, or null/"" to clear.
  await client.rest.put(`/channels/${channelId}/voice-status`, {
    body: { status: status == null ? null : String(status) },
  });
}

/**
 * Sync corrections VC status from current members.
 * Online when any non-bot member has a `2W-06 |`-style callsign; otherwise clear status.
 */
export async function syncCorrectionsChannelStatus(client, { force = false } = {}) {
  const channel = await resolveCorrectionsChannel(client);
  if (!channel) return { ok: false, reason: 'channel_unavailable' };

  const me = channel.guild.members.me
    || await channel.guild.members.fetchMe().catch(() => null);
  const perms = channel.permissionsFor(me);
  const canSetStatus = perms?.has(PermissionFlagsBits.SetVoiceChannelStatus);
  const canManage = perms?.has(PermissionFlagsBits.ManageChannels);
  if (!canSetStatus && !canManage) {
    logger.error('Corrections status: bot lacks Set Voice Channel Status / Manage Channels.');
    return { ok: false, reason: 'missing_permissions' };
  }

  const matched = listCorrectionsCallsignMembers(channel);
  const online = matched.length > 0;
  const nextStatus = online ? CORRECTIONS_STATUS_ONLINE : null;
  const statusKey = online ? CORRECTIONS_STATUS_ONLINE : '__cleared__';

  if (!force && client._correctionsChannelStatus === statusKey) {
    return {
      ok: true,
      status: nextStatus,
      changed: false,
      online,
      members: channel.members?.size || 0,
      matched: matched.length,
    };
  }

  try {
    await setVoiceChannelStatus(client, channel.id, nextStatus);
    client._correctionsChannelStatus = statusKey;
    const matchedNames = matched
      .map((member) => member.displayName || member.user?.username || member.id)
      .slice(0, 5)
      .join(', ');
    logger.info(
      online
        ? `Corrections status → ${CORRECTIONS_STATUS_ONLINE} `
          + `(${matched.length}/${channel.members?.size || 0} matched: ${matchedNames}).`
        : `Corrections status cleared `
          + `(0 matched / ${channel.members?.size || 0} in VC).`,
    );
    return {
      ok: true,
      status: nextStatus,
      changed: true,
      online,
      members: channel.members?.size || 0,
      matched: matched.length,
    };
  } catch (error) {
    logger.error(`Corrections status: failed to set "${statusKey}"`, error);
    return { ok: false, reason: 'api_error', error: error?.message || String(error) };
  }
}

function touchesCorrectionsChannel(oldState, newState) {
  return oldState?.channelId === CORRECTIONS_VOICE_CHANNEL_ID
    || newState?.channelId === CORRECTIONS_VOICE_CHANNEL_ID;
}

export async function handleCorrectionsVoiceStateUpdate(oldState, newState, client) {
  if (!touchesCorrectionsChannel(oldState, newState)) return null;
  return syncCorrectionsChannelStatus(client);
}

export async function handleCorrectionsMemberUpdate(oldMember, newMember, client) {
  const channelId = newMember?.voice?.channelId;
  if (channelId !== CORRECTIONS_VOICE_CHANNEL_ID) return null;

  const before = memberHasCorrectionsCallsign(oldMember);
  const after = memberHasCorrectionsCallsign(newMember);
  if (before === after) return null;
  return syncCorrectionsChannelStatus(client);
}

export function startCorrectionsChannelStatus(client) {
  let stopped = false;
  let timer = null;
  let inFlight = false;

  const run = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await syncCorrectionsChannelStatus(client);
    } catch (error) {
      logger.error('Corrections status poll failed', error);
    } finally {
      inFlight = false;
      if (!stopped) timer = setTimeout(run, CORRECTIONS_STATUS_POLL_MS);
    }
  };

  // First check shortly after ready, then every 5s.
  timer = setTimeout(run, 2_000);

  logger.info(
    `Corrections voice status armed → VC ${CORRECTIONS_VOICE_CHANNEL_ID} `
    + `(poll every ${CORRECTIONS_STATUS_POLL_MS / 1000}s; `
    + `${CORRECTIONS_STATUS_ONLINE} when a member name matches ${CORRECTIONS_CALLSIGN_PATTERN}; clear when none).`,
  );

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
