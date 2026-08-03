import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { logger } from './logger.js';

export async function loadEvents(client) {
  const directory = join(process.cwd(), 'events');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.js')).sort();

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    const event = module.default;

    if (!event?.name || typeof event.execute !== 'function') {
      throw new Error(`Invalid event module: ${file}`);
    }

    const listener = (...args) => event.execute(...args, client);
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
  }

  logger.info(`Loaded ${files.length} event handlers.`);
}
