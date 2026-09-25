import { REST, Routes } from 'discord.js';
import { slashCommandsForGuild } from './commandGuilds.js';
import { logger } from './logger.js';
import { PINELLAS_GUILD_ID } from './pinellasServer.js';

export async function registerCommands(commandModules, config) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const guildIds = [...new Set([
    config.guildId,
    PINELLAS_GUILD_ID,
  ].filter(Boolean))];

  for (const guildId of guildIds) {
    const body = slashCommandsForGuild(commandModules, guildId);
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
    logger.info(`Registered ${body.length} commands in guild ${guildId}.`);
  }
}
