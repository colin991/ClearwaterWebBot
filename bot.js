import { Client, Collection, Events, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, validateConfig } from './config.js';
import { startBotServices } from './utils/botServices.js';
import { logger } from './utils/logger.js';
import { startErlcRoleSync } from './utils/erlcRoleSync.js';
import { startRobloxGroupSync } from './utils/robloxGroupSync.js';
import { startDepartmentSalaryJob } from './utils/departmentSalary.js';
import { PINELLAS_GUILD_ID } from './utils/pinellasServer.js';

// Keep boot loaders in the entry module so an incomplete host upload cannot
// fail before the bot has a chance to start.
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

function registerPrefixCommand(client, command, file) {
  if (!command?.name || typeof command.execute !== 'function') {
    throw new Error(`Invalid prefix command in ${file}`);
  }

  const names = [command.name, ...(Array.isArray(command.aliases) ? command.aliases : [])]
    .map((name) => String(name || '').toLowerCase())
    .filter(Boolean);
  for (const name of names) client.prefixCommands.set(name, command);
}

async function loadPrefixCommands(client) {
  const directory = join(process.cwd(), 'prefixCommands');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.js')).sort();
  client.prefixCommands = new Collection();

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    const exported = module.default;
    if (Array.isArray(exported)) {
      for (const command of exported) registerPrefixCommand(client, command, file);
    } else {
      registerPrefixCommand(client, exported, file);
    }
  }

  logger.info(`Loaded ${client.prefixCommands.size} prefix command names.`);
  return client.prefixCommands;
}

async function loadEvents(client) {
  const directory = join(process.cwd(), 'events');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.js')).sort();
  let loaded = 0;

  for (const file of files) {
    try {
      const module = await import(pathToFileURL(join(directory, file)).href);
      const event = module.default;

      if (!event?.name || typeof event.execute !== 'function') {
        throw new Error(`Invalid event module: ${file}`);
      }

      const listener = (...args) => event.execute(...args, client);
      if (event.once) client.once(event.name, listener);
      else client.on(event.name, listener);
      loaded += 1;
    } catch (error) {
      logger.error(`Could not load event ${file}; continuing startup.`, error);
    }
  }

  logger.info(`Loaded ${loaded} event handlers.`);
}

async function registerCommands(commands, settings) {
  const rest = new REST({ version: '10' }).setToken(settings.token);
  const guildIds = [...new Set([
    settings.guildId,
    PINELLAS_GUILD_ID,
  ].filter(Boolean))];

  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(settings.clientId, guildId), { body: commands });
    logger.info(`Registered ${commands.length} commands in guild ${guildId}.`);
  }
}

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
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
try {
  await registerCommands(commands, config);
} catch (error) {
  logger.error('Could not register slash commands; logging in anyway so prefix commands still work.', error);
}

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
  client.stopSoundboardAccess?.();
  client.stopErlcSceneCommands?.();
  client.stopErlcCallRadio?.();
  client.stopBanAppealDms?.();
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
