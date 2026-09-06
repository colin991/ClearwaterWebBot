import { Client, Collection, Events, GatewayIntentBits, Partials } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, validateConfig } from './config.js';
import { loadPrefixCommands } from './utils/loadPrefixCommands.js';
import { loadEvents } from './utils/loadEvents.js';
import { registerCommands } from './utils/registerCommands.js';
import { startBotServices } from './utils/botServices.js';
import { logger } from './utils/logger.js';
import { startErlcRoleSync } from './utils/erlcRoleSync.js';
import { startRobloxGroupSync } from './utils/robloxGroupSync.js';
import { startDepartmentSalaryJob } from './utils/departmentSalary.js';

// Keep the primary command loader in the entry module so an incomplete host
// upload cannot fail before the bot has a chance to start.
async function loadCommands(client) {
  const directory = join(process.cwd(), 'commands');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.js')).sort();
  const commandJson = [];

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    const command = module.default;

    if (!command?.data?.name || typeof command.execute !== 'function') {
      throw new Error(`Invalid command module: ${file}`);
    }

    client.commands.set(command.data.name, command);
    commandJson.push(command.data.toJSON());
  }

  logger.info(`Loaded ${commandJson.length} slash commands.`);
  return commandJson;
}

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
  allowedMentions: { parse: [], repliedUser: false },
});

client.commands = new Collection();
client.prefixCommands = new Collection();
client.config = config;

const commands = await loadCommands(client);
await loadPrefixCommands(client);
await loadEvents(client);
await registerCommands(commands, config);

const stopBotServices = startBotServices(client, config);
let stopErlcSync = () => {};
let stopRobloxGroupSync = () => {};
let stopDepartmentSalary = () => {};
client.once(Events.ClientReady, () => {
  stopErlcSync = startErlcRoleSync(client, config);
  stopRobloxGroupSync = startRobloxGroupSync(client, config);
  stopDepartmentSalary = startDepartmentSalaryJob(client);
});

const shutDown = async (signal) => {
  logger.info(`${signal} received; shutting down.`);
  stopBotServices();
  stopErlcSync();
  stopRobloxGroupSync();
  stopDepartmentSalary();
  client.stopSecondaryGate?.();
  client.stopErlcZoneVoice?.();
  client.stopDispatchChannelStatus?.();
  client.stopCorrectionsChannelStatus?.();
  client.stopFrequencyChangeGreeting?.();
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
