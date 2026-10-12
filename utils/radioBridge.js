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
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { logger } from './logger.js';

const REJOIN_DELAY_MS = 10_000;

/**
 * Extra radio channels each bridged to a Discord voice channel by a bot of their own
 * (a Discord bot can only sit in one voice channel per server). The env names the bot token and
 * the voice channel; a channel without a token stays app-to-app only.
 */
export const RADIO_BRIDGE_CONFIG = Object.freeze([
  { channel: 'fire', tokenEnv: 'RADIO_FIRE_BOT_TOKEN', channelEnv: 'RADIO_FIRE_CHANNEL_ID', defaultChannelId: '1514128961951760515' },
  { channel: 'dot', tokenEnv: 'RADIO_DOT_BOT_TOKEN', channelEnv: 'RADIO_DOT_CHANNEL_ID', defaultChannelId: '1514130037052407932' },
  { channel: 'marine', tokenEnv: 'RADIO_MARINE_BOT_TOKEN', channelEnv: 'RADIO_MARINE_CHANNEL_ID', defaultChannelId: '1553601769819480084' },
]);

/** The bridges this env sets up: a token and a voice channel id are both needed. */
export function radioBridgeSettings(env = process.env) {
  const list = [];
  for (const config of RADIO_BRIDGE_CONFIG) {
    const token = env[config.tokenEnv]?.trim();
    const channelId = env[config.channelEnv]?.trim() || config.defaultChannelId;
    if (!token) continue;
    if (!channelId) {
      logger.warn(`Radio: ${config.tokenEnv} is set but ${config.channelEnv} is missing, so the ${config.channel} channel stays app-only.`);
      continue;
    }
    list.push({ channel: config.channel, token, channelId });
  }
  return list;
}

/**
 * One extra channel's bridge bot: sits in its Discord voice channel, sends what members say there
 * to the radios on that channel, and plays radio transmissions into it.
 * @param {object} options
 * @param {string} options.channel radio channel id ('fire', 'dot', 'marine')
 * @param {string} options.token the bridge bot's token
 * @param {string} options.channelId the Discord voice channel it sits in
 * @param {() => object} options.relay the radio relay (read lazily; it is created after the bridges)
 * @param {(member: object) => string} [options.label] rank label for a member in the units list
 * @param {(play: (stream: import('node:stream').Readable) => void) => any} options.createSink transmit sink factory
 */
export function createRadioBridge({ channel: radioChannel, token, channelId, relay, label = () => '', createSink }) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 25 } });
  player.on('error', (error) => logger.warn(`Radio ${radioChannel} player error: ${error?.message || error}`));
  let connection = null;
  let voiceChannel = null;
  let joining = false;
  let stopped = false;
  let rejoinTimer = null;
  const receiving = new Set();
  const group = `clearwater-radio-${radioChannel}`;

  const isOnline = () => connection?.state?.status === VoiceConnectionStatus.Ready;

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
    const member = voiceChannel?.guild?.members?.cache?.get(userId);
    const name = member?.displayName || member?.user?.username || 'Unit';
    relay().discordSpeaking(userId, name, true, radioChannel);
    const { receiver } = connection;
    const stale = receiver.subscriptions.get(userId);
    if (stale && (stale.readableEnded || stale.destroyed)) receiver.subscriptions.delete(userId);
    const stream = receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 400 } });
    const done = () => {
      if (!receiving.delete(userId)) return;
      relay().discordSpeaking(userId, name, false, radioChannel);
    };
    stream.on('data', (packet) => relay().relayDiscordAudio(userId, packet, radioChannel));
    stream.once('end', done);
    stream.once('close', done);
    stream.on('error', (error) => {
      logger.warn(`Radio ${radioChannel} could not receive ${name}: ${error?.message || error}`);
      done();
    });
  }

  async function join() {
    if (stopped || joining) return;
    joining = true;
    try {
      voiceChannel = await client.channels.fetch(channelId);
      if (!voiceChannel?.isVoiceBased?.()) throw new Error(`Channel ${channelId} is not a voice channel this bot can see.`);
      const next = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        group,
        selfDeaf: false,
        selfMute: false,
      });
      if (next !== connection) {
        connection = next;
        next.subscribe(player);
        next.receiver.speaking.on('start', (userId) => listenTo(userId));
        next.on('stateChange', () => relay().broadcastStatus());
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
          relay().broadcastStatus();
          scheduleRejoin();
        });
        next.on('error', (error) => logger.warn(`Radio ${radioChannel} voice error: ${error?.message || error}`));
      }
      await entersState(next, VoiceConnectionStatus.Ready, 30_000);
      logger.info(`Radio ${radioChannel} bridge connected to #${voiceChannel.name}.`);
    } catch (error) {
      logger.warn(`Radio ${radioChannel} bridge could not join its channel: ${error?.message || error}`);
      scheduleRejoin();
    } finally {
      joining = false;
    }
  }

  client.once(Events.ClientReady, () => {
    logger.info(`Radio ${radioChannel} bridge logged in as ${client.user.tag}.`);
    void join();
  });
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.id !== client.user?.id) {
      if (oldState.channelId === channelId || newState.channelId === channelId) {
        relay().broadcastStatus();
        if (oldState.channelId !== newState.channelId) relay().voiceChanged(newState.id);
      }
      return;
    }
    // Dragged out of its channel: go straight back.
    if (newState.channelId && newState.channelId !== channelId && connection) {
      connection.rejoin({ channelId, selfDeaf: false, selfMute: false });
    }
  });
  client.on(Events.Error, (error) => logger.warn(`Radio ${radioChannel} bridge client error: ${error?.message || error}`));
  void client.login(token).catch((error) => {
    logger.error(`Radio ${radioChannel} bridge login failed (check its bot token).`, error);
  });

  return {
    channel: radioChannel,
    /** Its Discord client, to post in the voice channel's chat when the main bot can't. */
    client,
    get online() {
      return isOnline();
    },
    members() {
      return [...(voiceChannel?.members?.values?.() || [])]
        .filter((member) => !member.user?.bot)
        .map((member) => ({ id: member.id, name: member.displayName || member.user?.username || 'Member', label: label(member) }));
    },
    inVoice(userId) {
      return (voiceChannel?.guild?.voiceStates?.cache?.get(userId)?.channelId || null) === channelId;
    },
    openTransmit() {
      if (!isOnline()) return null;
      return createSink((stream) => player.play(createAudioResource(stream, { inputType: StreamType.Opus })));
    },
    stop() {
      stopped = true;
      clearTimeout(rejoinTimer);
      try { connection?.destroy(); } catch { /* ignore */ }
      player.stop(true);
      client.destroy();
    },
  };
}
