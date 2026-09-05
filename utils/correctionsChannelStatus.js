import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

/** Voice channel whose status tracks whether a `#W-## |` corrections callsign is present. */
export const CORRECTIONS_VOICE_CHANNEL_ID = '1545525189339774997';

export const CORRECTIONS_STATUS_ONLINE = 'Corrections Online';

/** Matches callsigns like `#W-12 |` or `#W-1 |` anywhere in a name. */
export const CORRECTIONS_CALLSIGN_PATTERN = /#W-\d+\s*\|/;

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

function voiceChannelHasCorrectionsCallsign(channel) {
  if (!channel?.members) return false;
  for (const member of channel.members.values()) {
    if (memberHasCorrectionsCallsign(member)) return true;
  }
  return false;
}

async function resolveCorrectionsChannel(client) {
  const channel = client.channels.cache.get(CORRECTIONS_VOICE_CHANNEL_ID)
    || await client.channels.fetch(CORRECTIONS_VOICE_CHANNEL_ID).catch((error) => {
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
  // `null` clears the voice channel status.
  await client.rest.put(`/channels/${channelId}/voice-status`, {
    body: { status },
  });
}

/**
 * Sync corrections VC status from current members.
 * Online when any non-bot member has a `#W-## |` callsign; otherwise clear status.
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

  const online = voiceChannelHasCorrectionsCallsign(channel);
  const nextStatus = online ? CORRECTIONS_STATUS_ONLINE : null;
  const statusKey = online ? CORRECTIONS_STATUS_ONLINE : '__cleared__';

  if (!force && client._correctionsChannelStatus === statusKey) {
    return { ok: true, status: nextStatus, changed: false, online };
  }

  try {
    await setVoiceChannelStatus(client, channel.id, nextStatus);
    client._correctionsChannelStatus = statusKey;
    logger.info(
      online
        ? `Corrections status → ${CORRECTIONS_STATUS_ONLINE} (channel ${channel.id}).`
        : `Corrections status cleared (channel ${channel.id}).`,
    );
    return { ok: true, status: nextStatus, changed: true, online };
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
  setTimeout(() => {
    void syncCorrectionsChannelStatus(client, { force: true }).catch((error) => {
      logger.error('Corrections status: initial sync failed', error);
    });
  }, 4_500);

  logger.info(
    `Corrections voice status armed → VC ${CORRECTIONS_VOICE_CHANNEL_ID} `
    + `(${CORRECTIONS_STATUS_ONLINE} when a member name matches ${CORRECTIONS_CALLSIGN_PATTERN}; clear when none).`,
  );

  return () => {};
}
