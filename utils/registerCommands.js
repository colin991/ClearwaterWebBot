import { REST, Routes } from 'discord.js';
import { logger } from './logger.js';

export async function registerCommands(commands, config) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  logger.info(`Registered ${commands.length} commands in the Clearwater server.`);
}
