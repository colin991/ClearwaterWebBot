import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { Collection } from 'discord.js';
import { logger } from './logger.js';

function registerCommand(client, command, file) {
  if (!command?.name || typeof command.execute !== 'function') {
    throw new Error(`Invalid prefix command in ${file}`);
  }
  const names = [command.name, ...(Array.isArray(command.aliases) ? command.aliases : [])]
    .map((name) => String(name || '').toLowerCase())
    .filter(Boolean);
  for (const name of names) client.prefixCommands.set(name, command);
}

export async function loadPrefixCommands(client) {
  const directory = join(process.cwd(), 'prefixCommands');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.js')).sort();
  client.prefixCommands = new Collection();

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    const exported = module.default;
    if (Array.isArray(exported)) {
      for (const command of exported) registerCommand(client, command, file);
    } else {
      registerCommand(client, exported, file);
    }
  }

  logger.info(`Loaded ${client.prefixCommands.size} prefix command names.`);
  return client.prefixCommands;
}
