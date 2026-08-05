import { EmbedBuilder } from 'discord.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId, rememberIdentities } from './identityStore.js';
import { getOwnerConfig } from './ownerConfig.js';
import { logger } from './logger.js';
import { fetchApplicationIdentityIndex } from './melonly.js';

async function sendGameLog(client, settings, description, color) {
  if (!settings.gameLogChannelId) return;
  const channel = await client.channels.fetch(settings.gameLogChannelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [new EmbedBuilder().setTitle('ER:LC Player Update').setDescription(description).setColor(color).setTimestamp()] }).catch(() => {});
}

async function syncOnce(client, config, previousPlayers) {
  const settings = await getOwnerConfig();
  if (!config.erlcServerKey) {
    client.erlcStatus = { online: false, updatedAt: new Date().toISOString() };
    return previousPlayers;
  }

  // Keep the website's live player count working even when role syncing has
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
    return new Set(players.map((player) => player.robloxId));
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
      await sendGameLog(client, settings, `<@${discordId}> joined as **${player?.username || 'Unknown'}** and received <@&${role.id}>.`, 0x38d9b0);
    }
  }

  const roleMembers = role.members;
  for (const member of roleMembers.values()) {
    if (!activeDiscordIds.has(member.id)) {
      await member.roles.remove(role, 'Player left the ER:LC server');
      await sendGameLog(client, settings, `<@${member.id}> left the game and <@&${role.id}> was removed.`, 0xf05d6c);
    }
  }

  return new Set(players.map((player) => player.robloxId));
}

export function startErlcRoleSync(client, config) {
  let stopped = false;
  let timer;
  let previousPlayers = new Set();
  let lastIdentityRefresh = 0;

  const run = async () => {
    try {
      if (config.melonlyApiKey && Date.now() - lastIdentityRefresh > 72 * 60 * 60 * 1000) {
        lastIdentityRefresh = Date.now();
        try {
          const identities = await fetchApplicationIdentityIndex(config.melonlyApiKey);
          await rememberIdentities(identities);
          logger.info(`Refreshed ${identities.length} Melonly application identities.`);
        } catch (error) {
          logger.error('Melonly identity refresh failed', error);
        }
      }
      previousPlayers = await syncOnce(client, config, previousPlayers);
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
