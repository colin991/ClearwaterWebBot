import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config, validateConfig } from './config.js';
import { logger } from './utils/logger.js';

validateConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [], repliedUser: false },
});

client.config = config;

async function clearSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: [] });
  }
  logger.info('Cleared slash commands. This bot has no features yet.');
}

client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag}. New bot — no commands or automations are running.`);
});

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

try {
  await clearSlashCommands();
} catch (error) {
  logger.error('Could not clear slash commands; logging in anyway.', error);
}

await client.login(config.token);
