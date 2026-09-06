import { Client, Collection, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config, validateConfig } from './config.js';
import { loadCommands } from './utils/loadCommands.js';
import { loadPrefixCommands } from './utils/loadPrefixCommands.js';
import { loadEvents } from './utils/loadEvents.js';
import { registerCommands } from './utils/registerCommands.js';
import { startBotServices } from './utils/botServices.js';
import { logger } from './utils/logger.js';
import { startErlcRoleSync } from './utils/erlcRoleSync.js';
import { startRobloxGroupSync } from './utils/robloxGroupSync.js';
import { startDepartmentSalaryJob } from './utils/departmentSalary.js';
import { reexecIfUpdated, syncHostCodeFromMain } from './utils/hostCodeSync.js';

// Spark / Apollo startup is locked to `git pull; npm install; node index.js`.
// When `git pull` fails (dirty downloads/), this still force-syncs code without
// wiping host-only data/ or .env, then restarts onto the new commit if needed.
console.log('[host-sync] boot check starting...');
if (process.env.CLEARWATER_SKIP_HOST_SYNC !== '1') {
  try {
    const sync = syncHostCodeFromMain();
    if (sync.reason && sync.reason !== 'already_current' && sync.reason !== 'no_git' && sync.reason !== 'updated') {
      console.log(`[host-sync] WARN ${sync.reason}`);
      logger.warn(`Host code sync skipped/failed: ${sync.reason}`);
    } else if (sync.commit) {
      const msg = sync.updated
        ? `Host code updated to ${sync.commit.slice(0, 7)}; re-executing onto new files.`
        : `Host code already at ${sync.commit.slice(0, 7)}.`;
      console.log(`[host-sync] ${msg}`);
      logger.info(msg);
    } else {
      console.log(`[host-sync] no commit result (reason=${sync.reason || 'unknown'})`);
    }
    reexecIfUpdated(sync);
  } catch (error) {
    console.log(`[host-sync] ERROR ${error?.message || error}`);
    logger.warn(`Host code sync error: ${error?.message || error}`);
  }
} else {
  console.log('[host-sync] skipped (CLEARWATER_SKIP_HOST_SYNC=1)');
}
console.log('[host-sync] boot check finished; starting bot...');

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
