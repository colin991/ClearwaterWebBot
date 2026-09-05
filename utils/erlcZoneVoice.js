import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, libertyMapPoint, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { logger } from './logger.js';
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

const POLL_MS = 7_000;
const HEARTBEAT_EVERY = 8; // ~56s at 7s poll

function pointInDragZone(x, z) {
  const pin = libertyMapPoint(x, z);
  if (!pin) return false;
  return pin.left >= ERLC_DRAG_ZONE.leftMin
    && pin.left <= ERLC_DRAG_ZONE.leftMax
    && pin.top >= ERLC_DRAG_ZONE.topMin
    && pin.top <= ERLC_DRAG_ZONE.topMax;
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

  if (!client._erlcZoneInside) client._erlcZoneInside = new Set();
  const previouslyInside = client._erlcZoneInside;
  const currentlyInside = new Set();

  let moved = 0;
  let skipped = 0;
  const events = [];

  for (const player of players) {
    const x = player.location?.x;
    const z = player.location?.z;
    if (!pointInDragZone(x, z)) continue;

    const pin = libertyMapPoint(x, z);
    const label = `${player.username || 'unknown'} (${player.robloxId || '?'})`;
    const discordId = identityMap.get(String(player.robloxId || ''));
    if (!discordId) {
      skipped += 1;
      events.push({
        type: 'skip',
        text: `${label} in zone but no linked Discord identity`,
        pin,
      });
      continue;
    }

    currentlyInside.add(discordId);
    if (previouslyInside.has(discordId)) continue; // already in zone — do not re-drag

    const member = await voiceChannel.guild.members.fetch(discordId).catch(() => null);
    if (!member) {
      skipped += 1;
      events.push({
        type: 'skip',
        text: `${label} / <@${discordId}> in zone but not in Discord guild`,
        pin,
      });
      continue;
    }
    if (!member.voice?.channelId) {
      skipped += 1;
      events.push({
        type: 'skip',
        text: `${label} / <@${discordId}> in zone but not connected to any Discord VC`,
        pin,
      });
      continue;
    }
    if (member.voice.channelId === voiceChannel.id) {
      events.push({
        type: 'already',
        text: `${label} / <@${discordId}> entered zone already in target VC`,
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
      events.push({
        type: 'moved',
        text: `Moved <@${discordId}> (${player.username}) from ${fromChannel} → ${voiceChannel}`,
        pin,
      });
      logger.info(`ER:LC zone voice: moved ${member.user?.tag || discordId} (${player.username}) into ${voiceChannel.id}.`);
    } catch (error) {
      skipped += 1;
      events.push({
        type: 'error',
        text: `Failed to move <@${discordId}> (${player.username}): ${error?.message || error}`,
        pin,
      });
      logger.error(`ER:LC zone voice: could not move ${discordId}`, error);
    }
  }

  // Update membership snapshot. Leaving the zone intentionally does nothing.
  client._erlcZoneInside = currentlyInside;

  return {
    checked: players.length,
    inside: currentlyInside.size,
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
      'Action: move on **enter only**. Leave = no action.',
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
        await postZoneLog(client, {
          title: event.type === 'moved' ? 'Zone enter → VC move' : 'Zone check',
          description: `${event.text}\n${pin}`,
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
    + `top ${ERLC_DRAG_ZONE.topMin}-${ERLC_DRAG_ZONE.topMax}).`,
  );
  timer = setTimeout(run, 5_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
