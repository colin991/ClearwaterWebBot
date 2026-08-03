import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config, validateConfig } from './config.js';
import { loadCommands } from './utils/loadCommands.js';
import { loadEvents } from './utils/loadEvents.js';
import { registerCommands } from './utils/registerCommands.js';
import { startStatusServer } from './utils/statusServer.js';
import { logger } from './utils/logger.js';

validateConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [], repliedUser: false },
});

client.commands = new Collection();
client.config = config;

const commands = await loadCommands(client);
await loadEvents(client);
await registerCommands(commands, config);

const statusServer = startStatusServer(client, config);

const shutDown = async (signal) => {
  logger.info(`${signal} received; shutting down.`);
  statusServer?.close();
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

await client.login(config.token);
