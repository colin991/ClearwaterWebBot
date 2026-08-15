import { dirname } from 'node:path';
import { delimiter } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { getAllAudioUrls } from 'google-tts-api';
import {
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';

if (ffmpegPath) {
  process.env.PATH = `${dirname(ffmpegPath)}${delimiter}${process.env.PATH || ''}`;
}

const MAX_CHARS = 400;
const IDLE_LEAVE_MS = 20_000;
const sessions = new Map();

function chunkText(text) {
  const urls = getAllAudioUrls(text, {
    lang: 'en',
    slow: false,
    host: 'https://translate.google.com',
  });
  return urls.map((entry) => entry.url);
}

function destroySession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;
  clearTimeout(session.leaveTimer);
  session.player.stop(true);
  session.connection.destroy();
  sessions.delete(guildId);
}

function scheduleLeave(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;
  clearTimeout(session.leaveTimer);
  session.leaveTimer = setTimeout(() => destroySession(guildId), IDLE_LEAVE_MS);
}

function playNext(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;
  const url = session.queue.shift();
  if (!url) {
    session.busy = false;
    scheduleLeave(guildId);
    return;
  }
  session.busy = true;
  clearTimeout(session.leaveTimer);
  const resource = createAudioResource(url);
  session.player.play(resource);
}

function getSession(channel) {
  const existing = sessions.get(channel.guild.id);
  if (existing) {
    if (existing.channelId !== channel.id) {
      existing.moving = true;
      try {
        existing.connection.destroy();
      } catch {
        // Replaced below.
      }
      existing.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
      existing.connection.subscribe(existing.player);
      existing.channelId = channel.id;
      existing.moving = false;
    }
    return existing;
  }

  const player = createAudioPlayer();
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });
  connection.subscribe(player);

  const session = {
    player,
    connection,
    channelId: channel.id,
    queue: [],
    busy: false,
    moving: false,
    leaveTimer: null,
  };
  sessions.set(channel.guild.id, session);

  player.on(AudioPlayerStatus.Idle, () => playNext(channel.guild.id));
  player.on('error', () => playNext(channel.guild.id));
  connection.on(VoiceConnectionStatus.Disconnected, () => {
    if (!session.moving) destroySession(channel.guild.id);
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (!session.moving && sessions.get(channel.guild.id) === session) sessions.delete(channel.guild.id);
  });

  return session;
}

export async function speakInVoiceChannel(channel, text) {
  const spoken = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!spoken) throw new Error('Write something for me to say.');
  const urls = chunkText(spoken);
  if (!urls.length) throw new Error('That text could not be spoken.');

  const session = getSession(channel);
  await entersState(session.connection, VoiceConnectionStatus.Ready, 15_000);
  session.queue.push(...urls);
  if (!session.busy) playNext(channel.guild.id);
  return spoken;
}
