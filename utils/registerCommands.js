import { REST, Routes } from 'discord.js';
import { registrationGuildIds, slashCommandsForGuild } from './commandGuilds.js';
import { logger } from './logger.js';

export async function registerCommands(commandModules, config) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const guildIds = registrationGuildIds(commandModules, [config.guildId]);

  for (const guildId of guildIds) {
    const body = slashCommandsForGuild(commandModules, guildId);
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
    logger.info(`Registered ${body.length} commands in guild ${guildId}.`);
  }
}
