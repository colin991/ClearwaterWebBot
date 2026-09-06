import { PINELLAS_GUILD_ID } from './pinellasServer.js';
import { REST, Routes } from 'discord.js';
import { logger } from './logger.js';

export async function registerCommands(commands, config) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const guildIds = [...new Set([
    config.guildId,
    PINELLAS_GUILD_ID,
  ].filter(Boolean))];

  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commands });
    logger.info(`Registered ${commands.length} commands in guild ${guildId}.`);
  }
}
