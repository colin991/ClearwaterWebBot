import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import {
  EndBehaviorType,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { createRadioRelay } from './radioRelay.js';
import { verifyRadioKey } from './radioKeys.js';

/** Voice channel the radio bot always sits in. */
export const RADIO_CHANNEL_ID = process.env.RADIO_CHANNEL_ID?.trim() || '1514128904783139018';
/** Separate @discordjs/voice group so the radio bot never replaces the main bot's connection. */
const VOICE_GROUP = 'clearwater-radio';
const REJOIN_DELAY_MS = 10_000;

let activeRelay = null;

/** Hook for the bot API HTTP server so the radio can share its port. */
export function handleRadioUpgrade(request, socket, head) {
  return activeRelay ? activeRelay.handleUpgrade(request, socket, head) : false;
}

/**
 * Second Discord bot ("radio"): no commands, just sits in the radio channel and bridges
 * push-to-talk audio from the Clearwater Radio desktop app.
 * @returns {() => void} stop function
 */
export function startRadioBot(env = process.env) {
  const token = env.RADIO_BOT_TOKEN?.trim();
  if (!token) {
    logger.info('Radio bot skipped (RADIO_BOT_TOKEN missing).');
    return () => {};
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 25 },
  });
  player.on('error', (error) => logger.warn(`Radio player error: ${error?.message || error}`));

  let connection = null;
  let channel = null;
  let joining = false;
  let stopped = false;
  let rejoinTimer = null;
  const receiving = new Set();

  const isOnline = () => connection?.state?.status === VoiceConnectionStatus.Ready;

  const relay = createRadioRelay({
    verifyKey: (key) => verifyRadioKey(key, env),
    status: () => ({ online: isOnline(), channel: channel?.name || 'Radio' }),
    async authorize(userId) {
      const target = channel || await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
      if (!target?.guild) return { ok: false, reason: 'The radio bot is not in its channel yet. Try again shortly.' };
      const member = await target.guild.members.fetch(userId).catch(() => null);
      if (!member) return { ok: false, reason: 'You must be in the Discord server to use the radio.' };
      const permissions = target.permissionsFor(member);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
        return { ok: false, reason: `You do not have access to #${target.name}.` };
      }
      return { ok: true, name: member.displayName || member.user.username };
    },
    openTransmit() {
      if (!isOnline()) return null;
      const stream = new Readable({ objectMode: true, read() {} });
      player.play(createAudioResource(stream, { inputType: StreamType.Opus }));
      return {
        push: (packet) => stream.push(packet),
        end: () => stream.push(null),
      };
    },
  });
  activeRelay = relay;

  function scheduleRejoin() {
    if (stopped || rejoinTimer) return;
    rejoinTimer = setTimeout(() => {
      rejoinTimer = null;
      void join();
    }, REJOIN_DELAY_MS);
    rejoinTimer.unref?.();
  }

  function listenTo(userId) {
    if (!connection || receiving.has(userId) || userId === client.user?.id) return;
    receiving.add(userId);
    const member = channel?.guild?.members?.cache?.get(userId);
    const name = member?.displayName || member?.user?.username || 'Unit';
    relay.discordSpeaking(userId, name, true);
    const stream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 400 },
    });
    const done = () => {
      if (!receiving.delete(userId)) return;
      relay.discordSpeaking(userId, name, false);
    };
    stream.on('data', (packet) => relay.relayDiscordAudio(userId, packet));
    stream.once('end', done);
    stream.once('close', done);
    stream.on('error', done);
  }

  async function join() {
    if (stopped || joining) return;
    joining = true;
    try {
      channel = await client.channels.fetch(RADIO_CHANNEL_ID);
      if (!channel?.isVoiceBased?.()) throw new Error(`Channel ${RADIO_CHANNEL_ID} is not a voice channel the radio bot can see.`);
      const next = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        group: VOICE_GROUP,
        selfDeaf: false,
        selfMute: false,
      });
      if (next !== connection) {
        connection = next;
        next.subscribe(player);
        next.receiver.speaking.on('start', (userId) => listenTo(userId));
        next.on('stateChange', () => relay.broadcastStatus());
        next.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(next, VoiceConnectionStatus.Signalling, 5_000),
              entersState(next, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch {
            next.destroy();
          }
        });
        next.on(VoiceConnectionStatus.Destroyed, () => {
          if (connection === next) connection = null;
          receiving.clear();
          relay.broadcastStatus();
          scheduleRejoin();
        });
        next.on('error', (error) => logger.warn(`Radio voice error: ${error?.message || error}`));
      }
      await entersState(next, VoiceConnectionStatus.Ready, 30_000);
      logger.info(`Radio bot connected to #${channel.name}.`);
    } catch (error) {
      logger.warn(`Radio bot could not join its channel: ${error?.message || error}`);
      scheduleRejoin();
    } finally {
      joining = false;
    }
  }

  client.once(Events.ClientReady, () => {
    try {
      client.user.setPresence({ activities: [], status: 'online' });
    } catch { /* ignore */ }
    logger.info(`Radio bot logged in as ${client.user.tag}.`);
    void join();
  });

  // Dragged out of the radio channel: go straight back.
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.id !== client.user?.id) {
      if (oldState.channelId === RADIO_CHANNEL_ID || newState.channelId === RADIO_CHANNEL_ID) relay.broadcastStatus();
      return;
    }
    if (newState.channelId && newState.channelId !== RADIO_CHANNEL_ID && connection) {
      connection.rejoin({ channelId: RADIO_CHANNEL_ID, selfDeaf: false, selfMute: false });
    }
  });
  client.on(Events.Error, (error) => logger.warn(`Radio bot client error: ${error?.message || error}`));

  let standalone = null;
  const radioPort = Number(env.RADIO_PORT || 0);
  const apiPort = Number(env.SERVER_PORT || env.PORT || 0);
  // The bot API server only runs with BOT_API_KEY; without it the relay listens on SERVER_PORT itself.
  const apiServerRuns = Number.isInteger(apiPort) && apiPort > 0 && Boolean(env.BOT_API_KEY);
  const relayPort = Number.isInteger(radioPort) && radioPort > 0 ? radioPort : (apiServerRuns ? 0 : apiPort);
  if (!relayPort && !apiServerRuns) {
    logger.warn('Radio relay has no port: set SERVER_PORT (or RADIO_PORT) so the radio app can connect.');
  } else if (apiServerRuns && relayPort === 0) {
    logger.info(`Radio relay shares the bot API server on :${apiPort}/radio.`);
  }
  if (Number.isInteger(relayPort) && relayPort > 0 && !(apiServerRuns && relayPort === apiPort)) {
    standalone = createServer((request, response) => {
      response.writeHead(426, { 'Content-Type': 'text/plain' });
      response.end('Clearwater Radio relay. Connect with the desktop app.');
    });
    standalone.on('upgrade', (request, socket, head) => {
      if (!relay.handleUpgrade(request, socket, head)) socket.destroy();
    });
    standalone.on('error', (error) => logger.warn(`Radio relay server error: ${error?.message || error}`));
    standalone.listen(relayPort, '0.0.0.0', () => logger.info(`Radio relay listening on :${relayPort}/radio.`));
  }

  void client.login(token).catch((error) => {
    logger.error('Radio bot login failed (check RADIO_BOT_TOKEN).', error);
  });

  return () => {
    stopped = true;
    clearTimeout(rejoinTimer);
    if (activeRelay === relay) activeRelay = null;
    relay.close();
    try { standalone?.close(); } catch { /* ignore */ }
    try { connection?.destroy(); } catch { /* ignore */ }
    player.stop(true);
    client.destroy();
  };
}
