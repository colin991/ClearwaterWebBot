import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

/** Voice channel whose status tracks whether a `!C` dispatcher is present. */
export const DISPATCH_VOICE_CHANNEL_ID = '1514128904783139018';

export const DISPATCH_STATUS_ONLINE = 'Dispatch Online';
export const DISPATCH_STATUS_OFFLINE = 'Dispatch Offline';

const DISPATCH_TAG = '!C';

function memberHasDispatchTag(member) {
  if (!member || member.user?.bot) return false;
  const texts = [
    member.nickname,
    member.displayName,
    member.user?.globalName,
    member.user?.username,
  ].filter(Boolean);
  return texts.some((text) => String(text).includes(DISPATCH_TAG));
}

function voiceChannelHasDispatcher(channel) {
  if (!channel?.members) return false;
  for (const member of channel.members.values()) {
    if (memberHasDispatchTag(member)) return true;
  }
  return false;
}

async function resolveDispatchChannel(client) {
  const channel = client.channels.cache.get(DISPATCH_VOICE_CHANNEL_ID)
    || await client.channels.fetch(DISPATCH_VOICE_CHANNEL_ID).catch((error) => {
      logger.error(`Dispatch status: could not fetch VC ${DISPATCH_VOICE_CHANNEL_ID}`, error);
      return null;
    });
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    logger.error(`Dispatch status: ${DISPATCH_VOICE_CHANNEL_ID} is not a voice channel.`);
    return null;
  }
  return channel;
}

async function setVoiceChannelStatus(client, channelId, status) {
  await client.rest.put(`/channels/${channelId}/voice-status`, {
    body: { status },
  });
}

/**
 * Sync the dispatch voice channel status from current members.
 * Online when any non-bot member has `!C` anywhere in nickname/display/username.
 */
export async function syncDispatchChannelStatus(client, { force = false } = {}) {
  const channel = await resolveDispatchChannel(client);
  if (!channel) return { ok: false, reason: 'channel_unavailable' };

  const me = channel.guild.members.me
    || await channel.guild.members.fetchMe().catch(() => null);
  const perms = channel.permissionsFor(me);
  const canSetStatus = perms?.has(PermissionFlagsBits.SetVoiceChannelStatus);
  const canManage = perms?.has(PermissionFlagsBits.ManageChannels);
  // Discord requires SetVoiceChannelStatus; ManageChannels also needed if bot is not in the VC.
  if (!canSetStatus && !canManage) {
    logger.error('Dispatch status: bot lacks Set Voice Channel Status / Manage Channels.');
    return { ok: false, reason: 'missing_permissions' };
  }

  const online = voiceChannelHasDispatcher(channel);
  const nextStatus = online ? DISPATCH_STATUS_ONLINE : DISPATCH_STATUS_OFFLINE;

  if (!force && client._dispatchChannelStatus === nextStatus) {
    return { ok: true, status: nextStatus, changed: false, online };
  }

  try {
    await setVoiceChannelStatus(client, channel.id, nextStatus);
    client._dispatchChannelStatus = nextStatus;
    logger.info(`Dispatch status → ${nextStatus} (channel ${channel.id}).`);
    return { ok: true, status: nextStatus, changed: true, online };
  } catch (error) {
    logger.error(`Dispatch status: failed to set "${nextStatus}"`, error);
    return { ok: false, reason: 'api_error', error: error?.message || String(error) };
  }
}

function touchesDispatchChannel(oldState, newState) {
  return oldState?.channelId === DISPATCH_VOICE_CHANNEL_ID
    || newState?.channelId === DISPATCH_VOICE_CHANNEL_ID;
}

export async function handleDispatchVoiceStateUpdate(oldState, newState, client) {
  if (!touchesDispatchChannel(oldState, newState)) return null;
  return syncDispatchChannelStatus(client);
}

export async function handleDispatchMemberUpdate(oldMember, newMember, client) {
  const channelId = newMember?.voice?.channelId;
  if (channelId !== DISPATCH_VOICE_CHANNEL_ID) return null;

  const before = memberHasDispatchTag(oldMember);
  const after = memberHasDispatchTag(newMember);
  if (before === after) return null;
  return syncDispatchChannelStatus(client);
}

export function startDispatchChannelStatus(client) {
  // Initial sync after ready so empty/occupied state is correct on boot.
  setTimeout(() => {
    void syncDispatchChannelStatus(client, { force: true }).catch((error) => {
      logger.error('Dispatch status: initial sync failed', error);
    });
  }, 4_000);

  logger.info(
    `Dispatch voice status armed → VC ${DISPATCH_VOICE_CHANNEL_ID} `
    + `(${DISPATCH_STATUS_ONLINE} when a member name contains ${DISPATCH_TAG}).`,
  );

  return () => {};
}
