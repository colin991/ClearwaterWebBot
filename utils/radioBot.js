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
import { createRadioKey, verifyRadioKey } from './radioKeys.js';
import { exchangeRadioCode, radioOAuthConfig } from './radioOAuth.js';
import { createRadioPanicWatch } from './radioPanic.js';

const UNKNOWN_MEMBER = 10007;

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
/** @param {{ erlcEvents?: import('node:events').EventEmitter }} options main bot client that emits 'erlcEvent' */
export function startRadioBot(env = process.env, { erlcEvents = null } = {}) {
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
  // Console stats so a host can see whether Discord voices reach the radios.
  const stats = { packets: 0, decryptFailures: 0 };
  const statsTimer = setInterval(() => {
    if (stats.packets || stats.decryptFailures) {
      logger.info(`Radio: relayed ${stats.packets} Discord voice packets to ${relay.listeners} radio(s) in the last minute`
        + (stats.decryptFailures ? `; ${stats.decryptFailures} could not be decrypted.` : '.'));
    }
    stats.packets = 0;
    stats.decryptFailures = 0;
  }, 60_000);
  statsTimer.unref?.();

  const isOnline = () => connection?.state?.status === VoiceConnectionStatus.Ready;

  const relay = createRadioRelay({
    verifyKey: (key) => verifyRadioKey(key, env),
    exchangeCode: (code) => exchangeRadioCode(code, env),
    createSession: (userId) => createRadioKey(userId, env),
    loginInfo: () => {
      const config = radioOAuthConfig(env);
      return config ? { clientId: config.clientId, redirectUri: config.redirectUri } : null;
    },
    status: () => ({ online: isOnline(), channel: channel?.name || 'Radio' }),
    inVoice: (userId) => (channel?.guild?.voiceStates?.cache?.get(userId)?.channelId || null) === RADIO_CHANNEL_ID,
    // `removed` closes the member's radio app; anything else (Discord or bot trouble) is retried.
    async authorize(userId) {
      const target = channel || await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
      if (!target?.guild) return { ok: false, reason: 'The radio bot is not in its channel yet. Try again shortly.' };
      let member;
      try {
        member = await target.guild.members.fetch({ user: userId, force: true });
      } catch (error) {
        if (error?.code === UNKNOWN_MEMBER) {
          return { ok: false, removed: true, reason: 'You must be in the Clearwater Discord server to use the radio.' };
        }
        throw error;
      }
      const permissions = target.permissionsFor(member);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
        return { ok: false, removed: true, reason: `You do not have access to #${target.name}.` };
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
    const { receiver } = connection;
    // A stream that just ended can linger for a tick; never reuse it or the voice is lost.
    const stale = receiver.subscriptions.get(userId);
    if (stale && (stale.readableEnded || stale.destroyed)) receiver.subscriptions.delete(userId);
    const stream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 400 },
    });
    const done = () => {
      if (!receiving.delete(userId)) return;
      relay.discordSpeaking(userId, name, false);
    };
    stream.on('data', (packet) => {
      stats.packets += 1;
      relay.relayDiscordAudio(userId, packet);
    });
    stream.once('end', done);
    stream.once('close', done);
    stream.on('error', (error) => {
      logger.warn(`Radio could not receive ${name}: ${error?.message || error}`);
      done();
    });
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
        debug: true, // only used to count voice decrypt failures for the stats line
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
        next.on('debug', (message) => {
          if (/failed to decrypt/i.test(String(message))) stats.decryptFailures += 1;
        });
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
      if (oldState.channelId === RADIO_CHANNEL_ID || newState.channelId === RADIO_CHANNEL_ID) {
        relay.broadcastStatus();
        if (oldState.channelId !== newState.channelId) relay.voiceChanged(newState.id);
      }
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

  const onPanic = createRadioPanicWatch((message) => {
    relay.alert(message);
    logger.info(`Radio: panic from ${message.name || 'unknown'} at ${message.location || 'unknown location'} sent to ${relay.listeners} radio(s).`);
  });
  const onErlcEvent = (payload) => {
    try { onPanic(payload); } catch (error) { logger.warn(`Radio panic failed: ${error?.message || error}`); }
  };
  erlcEvents?.on('erlcEvent', onErlcEvent);
  erlcEvents?.on('erlcCommandLog', onErlcEvent);

  return () => {
    stopped = true;
    erlcEvents?.off('erlcEvent', onErlcEvent);
    erlcEvents?.off('erlcCommandLog', onErlcEvent);
    clearTimeout(rejoinTimer);
    clearInterval(statsTimer);
    if (activeRelay === relay) activeRelay = null;
    relay.close();
    try { standalone?.close(); } catch { /* ignore */ }
    try { connection?.destroy(); } catch { /* ignore */ }
    player.stop(true);
    client.destroy();
  };
}
