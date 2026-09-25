import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { logger } from './logger.js';

export async function loadCommands(client) {
  const directory = join(process.cwd(), 'commands');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.js')).sort();
  const commandModules = [];

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    const command = module.default;

    if (!command?.data?.name || typeof command.execute !== 'function') {
      throw new Error(`Invalid command module: ${file}`);
    }

    client.commands.set(command.data.name, command);
    commandModules.push(command);
  }

  logger.info(`Loaded ${commandModules.length} slash commands.`);
  return commandModules;
}
