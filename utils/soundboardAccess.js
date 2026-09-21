import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { CLEARWATER_GUILD_ID } from './staffRanks.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';

/** Discord where the qualifying role lives. */
export const SOUNDBOARD_SOURCE_GUILD_ID = '1515101455525085337';
export const SOUNDBOARD_SOURCE_ROLE_ID = '1515129421898448996';
/** Main-server voice channels that get Use Soundboard. */
export const SOUNDBOARD_CHANNEL_ID = '1514128904783139018';
export const SOUNDBOARD_CHANNEL_IDS = Object.freeze([
  '1514128904783139018',
  '1514128961951760515',
]);
export const SOUNDBOARD_TARGET_GUILD_ID = CLEARWATER_GUILD_ID;
export const SOUNDBOARD_SYNC_MS = 10 * 60 * 1000;

const UNKNOWN_MEMBER = 10007;
const SOUNDBOARD_BITS = PermissionFlagsBits.UseSoundboard | PermissionFlagsBits.UseExternalSounds;

export function sourceRolesIncludeSoundboard(roleIds) {
  return (Array.isArray(roleIds) ? roleIds : []).map(String).includes(SOUNDBOARD_SOURCE_ROLE_ID);
}

export function memberHasSoundboardSourceRole(member) {
  if (!member || member.user?.bot) return false;
  if (String(member.guild?.id) !== SOUNDBOARD_SOURCE_GUILD_ID) return false;
  return member.roles?.cache?.has?.(SOUNDBOARD_SOURCE_ROLE_ID) === true;
}

export function isMemberOverwrite(overwrite) {
  const type = overwrite?.type;
  return type === OverwriteType.Member || type === 1 || type === 'member';
}

export function overwriteAllowsOnlySoundboard(overwrite) {
  if (!isMemberOverwrite(overwrite)) return false;
  const allow = overwrite?.allow;
  const deny = overwrite?.deny;
  const allowBits = typeof allow?.bitfield === 'bigint' ? allow.bitfield : BigInt(allow?.bitfield || allow || 0);
  const denyBits = typeof deny?.bitfield === 'bigint' ? deny.bitfield : BigInt(deny?.bitfield || deny || 0);
  if (denyBits !== 0n) return false;
  if (allowBits === 0n) return false;
  return (allowBits & ~SOUNDBOARD_BITS) === 0n && (allowBits & PermissionFlagsBits.UseSoundboard) !== 0n;
}

export function shouldDeleteOverwriteAfterRevoke(overwrite) {
  return overwriteAllowsOnlySoundboard(overwrite);
}

export const SOUNDBOARD_OVERWRITE_ALLOW = Object.freeze({
  UseSoundboard: true,
  UseExternalSounds: true,
});

export const SOUNDBOARD_OVERWRITE_CLEAR = Object.freeze({
  UseSoundboard: null,
  UseExternalSounds: null,
});

async function fetchGuild(client, guildId) {
  const cached = client.guilds?.cache?.get(String(guildId));
  if (cached) return cached;
  if (typeof client.guilds?.fetch !== 'function') return null;
  return client.guilds.fetch(String(guildId)).catch((error) => {
    logger.warn(`Soundboard access: could not fetch guild ${guildId}`, error);
    return null;
  });
}

export async function sourceMemberHasSoundboardRole(client, userId) {
  if (!/^\d{16,22}$/.test(String(userId || ''))) return false;
  try {
    const raw = await client.rest.get(`/guilds/${SOUNDBOARD_SOURCE_GUILD_ID}/members/${userId}`);
    return sourceRolesIncludeSoundboard(raw?.roles);
  } catch (error) {
    const code = Number(error?.code ?? error?.rawError?.code);
    if (code === UNKNOWN_MEMBER) return false;
    logger.warn(`Soundboard access: role lookup failed for ${userId}`, error);
    return false;
  }
}

async function resolveSoundboardChannel(client, channelId) {
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch((error) => {
      logger.warn(`Soundboard access: could not fetch channel ${channelId}`, error);
      return null;
    });
  if (!channel?.isVoiceBased?.() || String(channel.guild?.id) !== SOUNDBOARD_TARGET_GUILD_ID) {
    logger.warn(`Soundboard access: ${channelId} is not a main-server voice channel.`);
    return null;
  }
  return channel;
}

async function resolveSoundboardChannels(client) {
  const channels = [];
  for (const channelId of SOUNDBOARD_CHANNEL_IDS) {
    const channel = await resolveSoundboardChannel(client, channelId);
    if (channel) channels.push(channel);
  }
  return channels;
}

export async function setSoundboardOverwrite(channel, userId, grant, {
  edit = (id, perms, options) => channel.permissionOverwrites.edit(id, perms, options),
  remove = (id, reason) => channel.permissionOverwrites.delete(id, reason),
} = {}) {
  const id = String(userId);
  const existing = channel.permissionOverwrites?.cache?.get?.(id);
  if (grant) {
    const already = existing?.allow?.has?.(PermissionFlagsBits.UseSoundboard)
      && existing?.allow?.has?.(PermissionFlagsBits.UseExternalSounds);
    if (already) return 'unchanged';
    await edit(id, SOUNDBOARD_OVERWRITE_ALLOW, { reason: 'Soundboard access from source-server role' });
    return 'granted';
  }
  if (!existing) return 'unchanged';
  if (shouldDeleteOverwriteAfterRevoke(existing)) {
    await remove(id, 'Removed soundboard access; source-server role missing');
    return 'removed';
  }
  if (existing.allow?.has?.(PermissionFlagsBits.UseSoundboard) || existing.allow?.has?.(PermissionFlagsBits.UseExternalSounds)) {
    await edit(id, SOUNDBOARD_OVERWRITE_CLEAR, { reason: 'Removed soundboard access; source-server role missing' });
    return 'cleared';
  }
  return 'unchanged';
}

export async function listSourceMembersWithRole(client) {
  const ids = [];
  let after = '0';
  let complete = false;
  for (let page = 0; page < 50; page += 1) {
    const path = `/guilds/${SOUNDBOARD_SOURCE_GUILD_ID}/members?limit=1000&after=${encodeURIComponent(after)}`;
    const batch = await client.rest.get(path);
    const list = Array.isArray(batch) ? batch : [];
    if (!list.length) {
      complete = page > 0;
      break;
    }
    for (const raw of list) {
      const userId = String(raw?.user?.id || '');
      if (!userId || raw?.user?.bot) continue;
      if (sourceRolesIncludeSoundboard(raw.roles)) ids.push(userId);
    }
    after = String(list.at(-1)?.user?.id || '');
    if (!after || list.length < 1000) {
      complete = true;
      break;
    }
  }
  return { ids, complete };
}

export async function eligibleSoundboardUserIds(client) {
  try {
    const listed = await listSourceMembersWithRole(client);
    return { ids: listed.ids, complete: listed.complete, source: 'rest' };
  } catch (error) {
    logger.warn('Soundboard access: REST member list failed; trying the cached roster', error);
  }

  const source = await fetchGuild(client, SOUNDBOARD_SOURCE_GUILD_ID);
  if (!source) return { ids: [], complete: false, source: 'none' };
  await ensureGuildMembers(source, { allowStale: true });
  const ids = [];
  for (const member of source.members.cache.values()) {
    if (memberHasSoundboardSourceRole(member)) ids.push(member.id);
  }
  return { ids, complete: ids.length > 0, source: 'cache' };
}

async function syncChannelSoundboardAccess(channel, eligible, { revokeMissing = true } = {}) {
  let granted = 0;
  let removed = 0;

  for (const userId of eligible) {
    try {
      const result = await setSoundboardOverwrite(channel, userId, true);
      if (result === 'granted') granted += 1;
    } catch (error) {
      logger.warn(`Soundboard access: could not grant ${userId} on ${channel.id}`, error);
    }
  }

  if (!revokeMissing) return { granted, removed };

  const overwrites = [...(channel.permissionOverwrites?.cache?.values?.() || [])];
  for (const overwrite of overwrites) {
    const hasSound = overwriteAllowsOnlySoundboard(overwrite)
      || overwrite?.allow?.has?.(PermissionFlagsBits.UseSoundboard)
      || overwrite?.allow?.has?.(PermissionFlagsBits.UseExternalSounds);
    if (!hasSound || !isMemberOverwrite(overwrite)) continue;
    const userId = String(overwrite.id);
    if (eligible.has(userId)) continue;
    try {
      const result = await setSoundboardOverwrite(channel, userId, false);
      if (result === 'removed' || result === 'cleared') removed += 1;
    } catch (error) {
      logger.warn(`Soundboard access: could not revoke ${userId} on ${channel.id}`, error);
    }
  }

  if (granted || removed) {
    logger.info(`Soundboard access synced on ${channel.id}: granted ${granted}, removed ${removed}.`);
  }
  return { granted, removed };
}

export async function syncSoundboardAccess(client, { revokeMissing } = {}) {
  const channels = await resolveSoundboardChannels(client);
  if (!channels.length) return { ok: false, granted: 0, removed: 0, reason: 'channel_unavailable' };

  const listed = await eligibleSoundboardUserIds(client);
  const eligible = new Set(listed.ids);
  const canRevoke = revokeMissing ?? listed.complete;
  if (!eligible.size) {
    logger.warn(
      `Soundboard access: found 0 role holders via ${listed.source || 'unknown'}`
      + `${canRevoke ? '' : '; granting skipped and revoke skipped until the roster loads'}.`,
    );
  } else {
    logger.info(`Soundboard access: granting ${eligible.size} role holder(s) on ${channels.length} voice channel(s).`);
  }

  let granted = 0;
  let removed = 0;
  for (const channel of channels) {
    const result = await syncChannelSoundboardAccess(channel, eligible, { revokeMissing: canRevoke });
    granted += result.granted;
    removed += result.removed;
  }
  return {
    ok: true,
    granted,
    removed,
    eligible: eligible.size,
    channels: channels.length,
    complete: listed.complete,
  };
}

function summarizeResults(results) {
  if (results.includes('granted')) return 'granted';
  if (results.includes('removed') || results.includes('cleared')) return 'removed';
  if (results.includes('unchanged')) return 'unchanged';
  return results[0] || null;
}

async function applyForUser(client, userId, grant) {
  const channels = await resolveSoundboardChannels(client);
  if (!channels.length) return null;
  const results = [];
  for (const channel of channels) {
    try {
      results.push(await setSoundboardOverwrite(channel, userId, grant));
    } catch (error) {
      logger.warn(`Soundboard access: could not update ${userId} on ${channel.id}`, error);
    }
  }
  return summarizeResults(results);
}

export async function handleSoundboardMemberUpdate(previousMember, member, client) {
  if (String(member?.guild?.id) !== SOUNDBOARD_SOURCE_GUILD_ID) return null;
  const before = memberHasSoundboardSourceRole(previousMember);
  const after = memberHasSoundboardSourceRole(member);
  if (before === after) return null;
  return applyForUser(client || member.client, member.id, after);
}

export async function handleSoundboardMemberAdd(member, client) {
  const guildId = String(member?.guild?.id || '');
  const api = client || member.client;
  if (guildId === SOUNDBOARD_SOURCE_GUILD_ID) {
    if (!memberHasSoundboardSourceRole(member)) return null;
    return applyForUser(api, member.id, true);
  }
  if (guildId === SOUNDBOARD_TARGET_GUILD_ID) {
    const allowed = await sourceMemberHasSoundboardRole(api, member.id);
    if (!allowed) return null;
    return applyForUser(api, member.id, true);
  }
  return null;
}

export async function handleSoundboardMemberRemove(member, client) {
  if (String(member?.guild?.id) !== SOUNDBOARD_SOURCE_GUILD_ID) return null;
  return applyForUser(client || member.client, member.id, false);
}

export async function handleSoundboardVoiceJoin(oldState, newState, client) {
  if (!SOUNDBOARD_CHANNEL_IDS.includes(String(newState?.channelId || ''))) return null;
  if (String(oldState?.channelId || '') === String(newState.channelId)) return null;
  const userId = newState.id || newState.member?.id;
  if (!userId || newState.member?.user?.bot) return null;
  const allowed = await sourceMemberHasSoundboardRole(client || newState.client, userId);
  if (!allowed) return null;
  return applyForUser(client || newState.client, userId, true);
}

export function startSoundboardAccess(client) {
  let stopped = false;
  let timer;
  let attempts = 0;
  const run = async (reason) => {
    attempts += 1;
    const result = await syncSoundboardAccess(client);
    logger.info(
      `Soundboard access ${reason}: eligible ${result.eligible || 0}, `
      + `granted ${result.granted || 0}, removed ${result.removed || 0}.`,
    );
    if (!stopped && reason === 'restart' && !result.eligible && attempts < 4) {
      timer = setTimeout(() => {
        void run('restart-retry').catch((error) => logger.error('Soundboard access: restart retry failed', error));
      }, attempts * 8_000);
      return;
    }
    if (!stopped) timer = setTimeout(() => {
      void run('interval').catch((error) => logger.error('Soundboard access: interval sync failed', error));
    }, SOUNDBOARD_SYNC_MS);
  };
  void run('restart').catch((error) => logger.error('Soundboard access: restart sync failed', error));
  logger.info(
    `Soundboard access armed: role ${SOUNDBOARD_SOURCE_ROLE_ID} in ${SOUNDBOARD_SOURCE_GUILD_ID} `
    + `→ Use Soundboard in VCs ${SOUNDBOARD_CHANNEL_IDS.join(', ')} (granted again on every bot restart).`,
  );
  return () => { stopped = true; clearTimeout(timer); };
}
