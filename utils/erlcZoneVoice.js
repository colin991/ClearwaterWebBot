import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, libertyMapPoint, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { logger } from './logger.js';

/** Discord voice channel players are dragged into when they enter the zone. */
export const ERLC_ZONE_VOICE_CHANNEL_ID = '1545525189339774997';

/** Main Clearwater guild where the voice channel lives. */
export const ERLC_ZONE_GUILD_ID = '1514026810348671026';

/**
 * Red grassy lot on the Liberty County map (inset so edges stay off surrounding roads).
 * Measured from the marked map image against the 3120² northwest-origin stud plane
 * used by libertyMapPoint / playersOnLibertyMap.
 */
export const ERLC_DRAG_ZONE = Object.freeze({
  // Normalized map fractions (0..1): left = x/3120, top = z/3120
  leftMin: 0.55937,
  leftMax: 0.58125,
  topMin: 0.5975,
  topMax: 0.63688,
  // Equivalent stud bounds (rounded)
  xMin: 1745,
  xMax: 1814,
  zMin: 1864,
  zMax: 1987,
});

const POLL_MS = 7_000;

function pointInDragZone(x, z) {
  const pin = libertyMapPoint(x, z);
  if (!pin) return false;
  return pin.left >= ERLC_DRAG_ZONE.leftMin
    && pin.left <= ERLC_DRAG_ZONE.leftMax
    && pin.top >= ERLC_DRAG_ZONE.topMin
    && pin.top <= ERLC_DRAG_ZONE.topMax;
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
  if (!serverKey) return { checked: 0, inside: 0, moved: 0, skipped: 0 };

  const voiceChannel = await resolveVoiceChannel(client);
  if (!voiceChannel) return { checked: 0, inside: 0, moved: 0, skipped: 0 };

  const me = voiceChannel.guild.members.me
    || await voiceChannel.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
    logger.error('ER:LC zone voice: bot is missing Move Members in the guild.');
    return { checked: 0, inside: 0, moved: 0, skipped: 0 };
  }

  const server = await fetchErlcServer(serverKey);
  const players = (server.Players || server.players || []).map(parseErlcPlayer);
  const identityMap = await discordIdsByRobloxId();

  if (!client._erlcZoneInside) client._erlcZoneInside = new Set();
  const previouslyInside = client._erlcZoneInside;
  const currentlyInside = new Set();

  let moved = 0;
  let skipped = 0;

  for (const player of players) {
    const x = player.location?.x;
    const z = player.location?.z;
    if (!pointInDragZone(x, z)) continue;

    const discordId = identityMap.get(String(player.robloxId || ''));
    if (!discordId) {
      skipped += 1;
      continue;
    }

    currentlyInside.add(discordId);
    const wasInside = previouslyInside.has(discordId);
    if (wasInside) continue; // already in zone — do not re-drag

    // Enter edge only.
    const member = await voiceChannel.guild.members.fetch(discordId).catch(() => null);
    if (!member) {
      skipped += 1;
      continue;
    }
    if (!member.voice?.channelId) {
      // Must already be in a voice channel for Discord to allow a move.
      skipped += 1;
      continue;
    }
    if (member.voice.channelId === voiceChannel.id) {
      continue;
    }

    try {
      await member.voice.setChannel(voiceChannel, `Entered ER:LC map drag zone (${player.username || discordId})`);
      moved += 1;
      logger.info(`ER:LC zone voice: moved ${member.user?.tag || discordId} (${player.username}) into ${voiceChannel.id} on zone enter.`);
    } catch (error) {
      skipped += 1;
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
  };
}

export function startErlcZoneVoice(client, config = {}) {
  let stopped = false;
  let timer;

  const run = async () => {
    try {
      const result = await syncErlcZoneVoice(client, config);
      if (result.moved) {
        logger.info(`ER:LC zone voice tick: moved ${result.moved}, inside ${result.inside}, skipped ${result.skipped}.`);
      }
    } catch (error) {
      logger.error('ER:LC zone voice sync failed', error);
    } finally {
      if (!stopped) timer = setTimeout(run, POLL_MS);
    }
  };

  logger.info(
    `ER:LC zone voice armed → VC ${ERLC_ZONE_VOICE_CHANNEL_ID} `
    + `(zone left ${ERLC_DRAG_ZONE.leftMin}-${ERLC_DRAG_ZONE.leftMax}, `
    + `top ${ERLC_DRAG_ZONE.topMin}-${ERLC_DRAG_ZONE.topMax}; studs x ${ERLC_DRAG_ZONE.xMin}-${ERLC_DRAG_ZONE.xMax}, `
    + `z ${ERLC_DRAG_ZONE.zMin}-${ERLC_DRAG_ZONE.zMax}).`,
  );
  timer = setTimeout(run, 5_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
