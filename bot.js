import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, validateConfig } from './config.js';
import { logger } from './utils/logger.js';
import { startOpenTicketPermissionSync } from './utils/pinellasSupport.js';

async function loadPrefixCommands(client) {
  const directory = join(process.cwd(), 'prefixCommands');
  const files = (await readdir(directory).catch(() => [])).filter((file) => file.endsWith('.js')).sort();
  client.prefixCommands = new Collection();

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    const command = module.default;
    if (!command?.name || typeof command.execute !== 'function') {
      throw new Error(`Invalid prefix command in ${file}`);
    }
    const names = [command.name, ...(Array.isArray(command.aliases) ? command.aliases : [])]
      .map((name) => String(name || '').toLowerCase())
      .filter(Boolean);
    for (const name of names) client.prefixCommands.set(name, command);
  }

  logger.info(`Loaded ${client.prefixCommands.size} prefix command names.`);
}

async function loadEvents(client) {
  const directory = join(process.cwd(), 'events');
  const files = (await readdir(directory).catch(() => [])).filter((file) => file.endsWith('.js')).sort();
  let loaded = 0;

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    const event = module.default;
    if (!event?.name || typeof event.execute !== 'function') {
      throw new Error(`Invalid event module: ${file}`);
    }
    const listener = (...args) => event.execute(...args, client);
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
    loaded += 1;
  }

  logger.info(`Loaded ${loaded} event handlers.`);
}

async function clearSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: [] });
  }
  logger.info('Cleared slash commands. Ticket panel buttons and -cr are still active.');
}

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  allowedMentions: { parse: [], repliedUser: false },
});

client.config = config;
client.commands = new Collection();
client.prefixCommands = new Collection();

const shutDown = async (signal) => {
  logger.info(`${signal} received; shutting down.`);
  client.destroy();
  process.exit(0);
};

process.once('SIGINT', () => void shutDown('SIGINT'));
process.once('SIGTERM', () => void shutDown('SIGTERM'));
process.on('unhandledRejection', (error) => logger.error('Unhandled promise rejection', error));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

await loadPrefixCommands(client);
await loadEvents(client);

client.once(Events.ClientReady, (readyClient) => {
  startOpenTicketPermissionSync(readyClient);
});

try {
  await clearSlashCommands();
} catch (error) {
  logger.error('Could not clear slash commands; logging in anyway.', error);
}

await client.login(config.token);
