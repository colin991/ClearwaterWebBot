import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, libertyMapPoint, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { logger } from './logger.js';
import { postProximityLog } from './vcActionLog.js';
import { v2Card } from './v2Message.js';

/** Discord voice channel players are dragged into when they enter the zone. */
export const ERLC_ZONE_VOICE_CHANNEL_ID = '1545525189339774997';

/** Text log channel for zone enter / skip / error events. */
export const ERLC_ZONE_LOG_CHANNEL_ID = '1514547037537046688';

/**
 * Red grassy lot on the Liberty County map (inset so edges stay off surrounding roads).
 * Measured from the marked map image against the 3120² northwest-origin stud plane
 * used by libertyMapPoint / playersOnLibertyMap.
 */
export const ERLC_DRAG_ZONE = Object.freeze({
  leftMin: 0.55937,
  leftMax: 0.58125,
  topMin: 0.5975,
  topMax: 0.63688,
  xMin: 1745,
  xMax: 1814,
  zMin: 1864,
  zMax: 1987,
});

const POLL_MS = 5_000;
const HEARTBEAT_EVERY = 8; // ~40s at 5s poll

function pointInDragZone(x, z) {
  const pin = libertyMapPoint(x, z);
  if (!pin) return false;
  return pin.left >= ERLC_DRAG_ZONE.leftMin
    && pin.left <= ERLC_DRAG_ZONE.leftMax
    && pin.top >= ERLC_DRAG_ZONE.topMin
    && pin.top <= ERLC_DRAG_ZONE.topMax;
}

/** Lowercase token used for Roblox username inclusion checks. */
export function normalizeNameToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * True when a Discord display string contains the Roblox username
 * (nickname / display name patterns like "Rank | Username").
 */
export function discordTextIncludesRobloxUsername(discordText, robloxUsername) {
  const needle = normalizeNameToken(robloxUsername);
  if (!needle || needle.length < 3) return false;
  const haystack = normalizeNameToken(discordText);
  return Boolean(haystack && haystack.includes(needle));
}

function memberSearchTexts(member) {
  return [
    member.nickname,
    member.displayName,
    member.user?.globalName,
    member.user?.username,
  ].filter(Boolean);
}

/**
 * Resolve Discord member for an ER:LC player.
 * Prefer Melonly identity cache; fall back to Roblox username in Discord nickname/name.
 */
export async function resolveZoneDiscordMember(guild, player, identityMap) {
  const robloxId = String(player?.robloxId || '').trim();
  const username = String(player?.username || '').trim();
  const linkedId = robloxId ? identityMap.get(robloxId) : null;

  if (linkedId) {
    const member = guild.members.cache.get(linkedId)
      || await guild.members.fetch(linkedId).catch(() => null);
    if (member && !member.user?.bot) {
      return { member, matchSource: 'Melonly identity' };
    }
  }

  if (!username || normalizeNameToken(username).length < 3) {
    return { member: null, matchSource: null };
  }

  if (guild.members.cache.size < 2) {
    await guild.members.fetch().catch(() => null);
  }

  const matches = [];
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (memberSearchTexts(member).some((text) => discordTextIncludesRobloxUsername(text, username))) {
      matches.push(member);
    }
  }

  if (matches.length === 1) {
    return { member: matches[0], matchSource: 'Discord name / nickname' };
  }
  if (matches.length > 1) {
    return {
      member: null,
      matchSource: null,
      ambiguous: matches.map((m) => m.id),
    };
  }
  return { member: null, matchSource: null };
}

async function resolveTextLogChannel(client) {
  const channel = client.channels.cache.get(ERLC_ZONE_LOG_CHANNEL_ID)
    || await client.channels.fetch(ERLC_ZONE_LOG_CHANNEL_ID).catch((error) => {
      logger.error(`ER:LC zone log: could not fetch ${ERLC_ZONE_LOG_CHANNEL_ID}`, error);
      return null;
    });
  if (!channel?.isTextBased?.()) {
    logger.error(`ER:LC zone log: ${ERLC_ZONE_LOG_CHANNEL_ID} is not text-based.`);
    return null;
  }
  return channel;
}

async function postZoneLog(client, { title, description = '', fields = [] }) {
  try {
    const channel = await resolveTextLogChannel(client);
    if (!channel) return false;
    await channel.send(v2Card({
      title,
      description,
      fields,
      footer: 'ER:LC zone voice',
    }));
    return true;
  } catch (error) {
    logger.error('ER:LC zone log: failed to post', error);
    return false;
  }
}

async function resolveVoiceChannel(client) {
  const channel = client.channels.cache.get(ERLC_ZONE_VOICE_CHANNEL_ID)
    || await client.channels.fetch(ERLC_ZONE_VOICE_CHANNEL_ID).catch((error) => {
      logger.error(`ER:LC zone voice: could not fetch VC ${ERLC_ZONE_VOICE_CHANNEL_ID}`, error);
      return null;
    });
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    logger.error(`ER:LC zone voice: ${ERLC_ZONE_VOICE_CHANNEL_ID} is not a voice channel.`);
    return null;
  }
  return channel;
}

/**
 * Poll ER:LC positions and move Discord members into the zone VC only when they enter.
 * Leaving the zone does nothing.
 */
export async function syncErlcZoneVoice(client, config = {}) {
  const serverKey = config.erlcServerKey || process.env.ERLC_SERVER_KEY?.trim();
  if (!serverKey) {
    return {
      checked: 0,
      inside: 0,
      moved: 0,
      skipped: 0,
      reason: 'missing_erlc_server_key',
    };
  }

  const voiceChannel = await resolveVoiceChannel(client);
  if (!voiceChannel) {
    return {
      checked: 0,
      inside: 0,
      moved: 0,
      skipped: 0,
      reason: 'voice_channel_unavailable',
    };
  }

  const me = voiceChannel.guild.members.me
    || await voiceChannel.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
    logger.error('ER:LC zone voice: bot is missing Move Members in the guild.');
    return {
      checked: 0,
      inside: 0,
      moved: 0,
      skipped: 0,
      reason: 'missing_move_members',
    };
  }

  const server = await fetchErlcServer(serverKey);
  const players = (server.Players || server.players || []).map(parseErlcPlayer);
  const identityMap = await discordIdsByRobloxId();
  const guild = voiceChannel.guild;

  if (!client._erlcZoneHandled) client._erlcZoneHandled = new Set();
  const previouslyHandled = client._erlcZoneHandled;
  const stillInZone = new Set();
  const newlyHandled = new Set();

  let moved = 0;
  let skipped = 0;
  const events = [];

  for (const player of players) {
    const x = player.location?.x;
    const z = player.location?.z;
    if (!pointInDragZone(x, z)) continue;

    const pin = libertyMapPoint(x, z);
    const label = `${player.username || 'unknown'} (${player.robloxId || '?'})`;
    const resolved = await resolveZoneDiscordMember(guild, player, identityMap);
    const member = resolved.member;

    if (!member) {
      skipped += 1;
      if (resolved.ambiguous?.length) {
        events.push({
          type: 'skip',
          text: `${label} in zone but Roblox name matched multiple Discord members (${resolved.ambiguous.map((id) => `<@${id}>`).join(', ')})`,
          pin,
        });
      } else {
        events.push({
          type: 'skip',
          text: `${label} in zone but no Melonly link and no Discord nickname/name containing that Roblox username`,
          pin,
        });
      }
      continue;
    }

    const discordId = member.id;
    stillInZone.add(discordId);

    // Already successfully handled for this continuous stay in the zone.
    if (previouslyHandled.has(discordId)) continue;

    if (!member.voice?.channelId) {
      skipped += 1;
      events.push({
        type: 'skip',
        text: `${label} / <@${discordId}> in zone (${resolved.matchSource}) but not connected to any Discord VC — will retry`,
        pin,
      });
      continue;
    }
    if (member.voice.channelId === voiceChannel.id) {
      newlyHandled.add(discordId);
      events.push({
        type: 'already',
        text: `${label} / <@${discordId}> entered zone already in target VC (${resolved.matchSource})`,
        pin,
      });
      continue;
    }

    try {
      const fromChannel = member.voice.channel;
      await member.voice.setChannel(
        voiceChannel,
        `Entered ER:LC map drag zone (${player.username || discordId})`,
      );
      moved += 1;
      newlyHandled.add(discordId);
      events.push({
        type: 'moved',
        text: `Moved <@${discordId}> (${player.username}) from ${fromChannel} → ${voiceChannel} via ${resolved.matchSource}`,
        pin,
        actor: member.user,
        voiceChannel,
        fromChannel,
        robloxUsername: player.username || null,
        matchSource: resolved.matchSource,
      });
      logger.info(
        `ER:LC zone voice: moved ${member.user?.tag || discordId} (${player.username}) `
        + `into ${voiceChannel.id} via ${resolved.matchSource}.`,
      );
    } catch (error) {
      skipped += 1;
      events.push({
        type: 'error',
        text: `Failed to move <@${discordId}> (${player.username}): ${error?.message || error}`,
        pin,
        actor: member.user,
        voiceChannel,
        robloxUsername: player.username || null,
      });
      logger.error(`ER:LC zone voice: could not move ${discordId}`, error);
    }
  }

  // Keep handled only while still in zone; add new successes. Skips (e.g. not in VC) retry next poll.
  client._erlcZoneHandled = new Set([
    ...[...previouslyHandled].filter((id) => stillInZone.has(id)),
    ...newlyHandled,
  ]);

  return {
    checked: players.length,
    inside: stillInZone.size,
    moved,
    skipped,
    identities: identityMap.size,
    events,
    reason: null,
  };
}

export function startErlcZoneVoice(client, config = {}) {
  let stopped = false;
  let timer;
  let ticks = 0;

  void postZoneLog(client, {
    title: 'ER:LC zone voice armed',
    description: [
      `Target VC: <#${ERLC_ZONE_VOICE_CHANNEL_ID}>`,
      `Log channel: <#${ERLC_ZONE_LOG_CHANNEL_ID}>`,
      `Poll: every ${POLL_MS / 1000}s`,
      `Zone (map %): left ${ERLC_DRAG_ZONE.leftMin}-${ERLC_DRAG_ZONE.leftMax}, top ${ERLC_DRAG_ZONE.topMin}-${ERLC_DRAG_ZONE.topMax}`,
      `Zone (studs): x ${ERLC_DRAG_ZONE.xMin}-${ERLC_DRAG_ZONE.xMax}, z ${ERLC_DRAG_ZONE.zMin}-${ERLC_DRAG_ZONE.zMax}`,
      'Match: Melonly identity, else Roblox username in Discord nickname / display name / username.',
      'Action: move on **enter only**. Leave = no action. Not-in-VC skips retry until connected.',
    ].join('\n'),
  });

  const run = async () => {
    try {
      const result = await syncErlcZoneVoice(client, config);
      ticks += 1;

      if (result.reason === 'missing_erlc_server_key') {
        if (ticks === 1 || ticks % HEARTBEAT_EVERY === 0) {
          await postZoneLog(client, {
            title: 'ER:LC zone voice idle',
            description: '`ERLC_SERVER_KEY` is missing on the bot host, so zone checks cannot run.',
          });
        }
      } else if (result.reason) {
        if (ticks === 1 || ticks % HEARTBEAT_EVERY === 0) {
          await postZoneLog(client, {
            title: 'ER:LC zone voice blocked',
            description: `Reason: \`${result.reason}\``,
          });
        }
      }

      const notable = (result.events || []).filter((event) => event.type === 'moved' || event.type === 'skip' || event.type === 'error');
      for (const event of notable) {
        const pin = event.pin
          ? `map ${((event.pin.left || 0) * 100).toFixed(1)}%, ${((event.pin.top || 0) * 100).toFixed(1)}%`
          : 'map n/a';

        if (event.type === 'moved') {
          const name = event.actor?.username || event.robloxUsername || 'unknown';
          const id = event.actor?.id || '?';
          const dest = event.voiceChannel?.name || 'unknown';
          const from = event.fromChannel?.name ? `from #${event.fromChannel.name}; ` : '';
          const match = event.matchSource || 'unknown match';
          await postProximityLog(client, {
            channelId: ERLC_ZONE_LOG_CHANNEL_ID,
            tag: 'ZoneVC',
            body: `MOVE — ${name} (${id}) -> #${dest} (${from}ER:LC zone enter; ${match}; ${pin})`,
          });
          continue;
        }

        // Skip / error stay compact but use the same teal [Tag] style.
        const action = event.type === 'error' ? 'ERROR' : 'SKIP';
        await postProximityLog(client, {
          channelId: ERLC_ZONE_LOG_CHANNEL_ID,
          tag: 'ZoneVC',
          body: `${action} — ${String(event.text || '').replace(/\s+/g, ' ').trim()} (${pin})`,
        });
      }

      if (result.moved) {
        logger.info(`ER:LC zone voice tick: moved ${result.moved}, inside ${result.inside}, skipped ${result.skipped}.`);
      }

      if (ticks === 1 || ticks % HEARTBEAT_EVERY === 0) {
        await postZoneLog(client, {
          title: 'ER:LC zone voice heartbeat',
          fields: [
            { name: 'Players checked', value: String(result.checked || 0), inline: true },
            { name: 'Inside zone', value: String(result.inside || 0), inline: true },
            { name: 'Moved', value: String(result.moved || 0), inline: true },
            { name: 'Skipped', value: String(result.skipped || 0), inline: true },
            { name: 'Linked identities', value: String(result.identities ?? 'n/a'), inline: true },
            { name: 'Poll', value: `${POLL_MS / 1000}s`, inline: true },
          ],
        });
      }
    } catch (error) {
      logger.error('ER:LC zone voice sync failed', error);
      await postZoneLog(client, {
        title: 'ER:LC zone voice error',
        description: String(error?.message || error).slice(0, 1500),
      });
    } finally {
      if (!stopped) timer = setTimeout(run, POLL_MS);
    }
  };

  logger.info(
    `ER:LC zone voice armed → VC ${ERLC_ZONE_VOICE_CHANNEL_ID}, logs ${ERLC_ZONE_LOG_CHANNEL_ID} `
    + `(zone left ${ERLC_DRAG_ZONE.leftMin}-${ERLC_DRAG_ZONE.leftMax}, `
    + `top ${ERLC_DRAG_ZONE.topMin}-${ERLC_DRAG_ZONE.topMax}; nickname fallback on).`,
  );
  timer = setTimeout(run, 5_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
