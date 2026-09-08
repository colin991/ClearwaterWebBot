import { executeErlcCommand, fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { getOwnerConfig } from './ownerConfig.js';
import { logger } from './logger.js';
import { v2Card } from './v2Message.js';

const WRONG_VEHICLE_PLAYER = 'PlainCreeek';
const REQUIRED_TEAM = 'Sheriff';
const APPROVED_VEHICLE = '2003 Falcon Prime Eques Interceptor';
const WRONG_VEHICLE_REMINDER_MS = 5 * 60 * 1000;
const WRONG_VEHICLE_JAIL_COOLDOWN_MS = 5 * 60 * 1000;
const WRONG_VEHICLE_NOTICE_RECIPIENTS = [
  '1169457690066558988',
  '1440520629349515274',
  '1074411240757137589',
  '1128547120304095272',
  '547417724381429761',
];

async function sendGameLog(client, settings, description) {
  if (!settings.gameLogChannelId) return;
  const channel = await client.channels.fetch(settings.gameLogChannelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(v2Card({
      title: 'ER:LC Player Update',
      description,
    })).catch(() => {});
  }
}

async function notifyWrongVehicle(client, vehicleName) {
  const message = `${WRONG_VEHICLE_PLAYER} is driving the wrong car: **${vehicleName || 'Unknown vehicle'}**. The approved Sheriff vehicle is **${APPROVED_VEHICLE}**.`;
  let sent = 0;
  for (const userId of WRONG_VEHICLE_NOTICE_RECIPIENTS) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) continue;
    await user.send(message).then(() => { sent += 1; }).catch(() => {});
  }
  return sent;
}

async function syncOnce(client, config, previousState) {
  const settings = await getOwnerConfig();
  if (!config.erlcServerKey) {
    client.erlcStatus = { online: false, updatedAt: new Date().toISOString() };
    return previousState;
  }

  // Keep a live player count snapshot even when role syncing has
  // not been configured in the owner panel yet.
  const server = await fetchErlcServer(config.erlcServerKey);
  const players = (server.Players || []).map(parseErlcPlayer).filter((player) => player.robloxId);
  const vehicles = server.Vehicles || server.vehicles || [];
  const sheriffPlayer = players.find((player) => player.username.toLowerCase() === WRONG_VEHICLE_PLAYER.toLowerCase()
    && player.team.toLowerCase() === REQUIRED_TEAM.toLowerCase());
  const wrongVehicle = sheriffPlayer
    ? vehicles.find((vehicle) => String(vehicle.Owner || vehicle.owner || '').toLowerCase() === sheriffPlayer.username.toLowerCase()
      && String(vehicle.Name || vehicle.name || '').toLowerCase() !== APPROVED_VEHICLE.toLowerCase())
    : null;
  const wrongVehicleName = String(wrongVehicle?.Name || wrongVehicle?.name || '').trim();
  const wrongVehicleKey = wrongVehicle
    ? `${sheriffPlayer.username.toLowerCase()}|${wrongVehicleName.toLowerCase()}|${String(wrongVehicle.Plate || wrongVehicle.plate || '')}`
    : '';
  let wrongVehicleJailKey = wrongVehicleKey ? String(previousState?.wrongVehicleJailKey || '') : '';
  let wrongVehicleJailAttemptAt = wrongVehicleKey
    ? Number(previousState?.wrongVehicleJailAttemptAt || 0)
    : 0;
  const jailDue = wrongVehicleKey
    && wrongVehicleJailKey !== wrongVehicleKey
    && Date.now() - wrongVehicleJailAttemptAt >= WRONG_VEHICLE_JAIL_COOLDOWN_MS;
  if (jailDue) {
    wrongVehicleJailAttemptAt = Date.now();
    await executeErlcCommand(config.erlcServerKey, `:jail ${WRONG_VEHICLE_PLAYER}`).then(() => {
      wrongVehicleJailKey = wrongVehicleKey;
      logger.info(`ER:LC vehicle check: jailed ${WRONG_VEHICLE_PLAYER} for using ${wrongVehicleName || 'an unapproved vehicle'}.`);
    }).catch((error) => {
      logger.warn(`ER:LC vehicle check: could not jail ${WRONG_VEHICLE_PLAYER} (${error?.message || error}).`);
    });
  }
  const reminderDue = wrongVehicleKey
    && (previousState?.wrongVehicleKey !== wrongVehicleKey
      || Date.now() - Number(previousState?.wrongVehicleNoticeAt || 0) >= WRONG_VEHICLE_REMINDER_MS);
  let wrongVehicleNoticeAt = wrongVehicleKey ? Number(previousState?.wrongVehicleNoticeAt || 0) : 0;
  if (reminderDue) {
    const sent = await notifyWrongVehicle(client, wrongVehicleName);
    logger.info(`ER:LC vehicle check: warned ${sent} recipient(s) about ${WRONG_VEHICLE_PLAYER}'s unapproved vehicle.`);
    wrongVehicleNoticeAt = Date.now();
  }
  client.erlcStatus = {
    online: true,
    name: server.Name || 'Clearwater Roleplay',
    currentPlayers: Number(server.CurrentPlayers || players.length),
    maxPlayers: Number(server.MaxPlayers || 50),
    queue: Array.isArray(server.Queue) ? server.Queue.length : 0,
    players,
    updatedAt: new Date().toISOString(),
  };

  if (!settings.inGameGuildId || !settings.inGameRoleId) {
    return {
      playerIds: new Set(players.map((player) => player.robloxId)),
      wrongVehicleKey,
      wrongVehicleNoticeAt,
      wrongVehicleJailKey,
      wrongVehicleJailAttemptAt,
    };
  }

  const identityMap = await discordIdsByRobloxId();
  const activeDiscordIds = new Set(players.map((player) => identityMap.get(player.robloxId)).filter(Boolean));
  const guild = await client.guilds.fetch(settings.inGameGuildId);
  await guild.members.fetch();
  const role = await guild.roles.fetch(settings.inGameRoleId);
  if (!role) throw new Error('Configured in-game role no longer exists');

  for (const discordId of activeDiscordIds) {
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member && !member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Player joined the ER:LC server');
      const player = players.find((entry) => identityMap.get(entry.robloxId) === discordId);
      await sendGameLog(client, settings, `<@${discordId}> joined as **${player?.username || 'Unknown'}** and received <@&${role.id}>.`);
    }
  }

  const roleMembers = role.members;
  for (const member of roleMembers.values()) {
    if (!activeDiscordIds.has(member.id)) {
      await member.roles.remove(role, 'Player left the ER:LC server');
      await sendGameLog(client, settings, `<@${member.id}> left the game and <@&${role.id}> was removed.`);
    }
  }

  return {
    playerIds: new Set(players.map((player) => player.robloxId)),
    wrongVehicleKey,
    wrongVehicleNoticeAt,
    wrongVehicleJailKey,
    wrongVehicleJailAttemptAt,
  };
}

export function startErlcRoleSync(client, config) {
  let stopped = false;
  let timer;
  let previousState = {
    playerIds: new Set(),
    wrongVehicleKey: '',
    wrongVehicleNoticeAt: 0,
    wrongVehicleJailKey: '',
    wrongVehicleJailAttemptAt: 0,
  };

  const run = async () => {
    try {
      previousState = await syncOnce(client, config, previousState);
    } catch (error) {
      logger.error('ER:LC role sync failed', error);
    } finally {
      if (!stopped) {
        const settings = await getOwnerConfig().catch(() => ({ syncIntervalSeconds: 30 }));
        timer = setTimeout(run, (settings.syncIntervalSeconds || 30) * 1000);
      }
    }
  };

  void run();
  return () => { stopped = true; clearTimeout(timer); };
}
