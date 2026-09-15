import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { getOwnerConfig } from './ownerConfig.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import { v2Card } from './v2Message.js';

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
    };
  }

  const identityMap = await discordIdsByRobloxId();
  const activeDiscordIds = new Set(players.map((player) => identityMap.get(player.robloxId)).filter(Boolean));
  const guild = await client.guilds.fetch(settings.inGameGuildId);
  await ensureGuildMembers(guild);
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
  };
}

export function startErlcRoleSync(client, config) {
  let stopped = false;
  let timer;
  let previousState = { playerIds: new Set() };

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
