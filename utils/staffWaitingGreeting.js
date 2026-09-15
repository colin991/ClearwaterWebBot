import { PermissionFlagsBits } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { playMp3InVoiceChannel, synthesizeSpeechMp3 } from './vcSpeak.js';
import { DISPATCH_VOICE_CHANNEL_ID } from './dispatchChannelStatus.js';
import { pauseDispatchRadioMonitor, resumeDispatchRadioMonitor } from './dispatchRadioTalkMonitor.js';
import { getActiveHold } from './holdVoiceChat.js';

export const STAFF_WAITING_CHANNEL = '1535453333177761813';
export const STAFF_WAITING_PHRASE = 'A Staff Member will be with you soon. Please wait,';
const pending = new Map();
let speech;

export function isStaffWaitingJoin(oldState, newState) {
  return newState.channelId === STAFF_WAITING_CHANNEL && oldState.channelId !== newState.channelId && !newState.member?.user?.bot;
}

export async function handleStaffWaitingJoin(oldState, newState) {
  if (!isStaffWaitingJoin(oldState, newState)) return;
  const guild = newState.guild;
  const previous = pending.get(guild.id) || Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    if (!speech) speech = synthesizeSpeechMp3(STAFF_WAITING_PHRASE).catch(e => { speech = null; throw e; });
    const mp3 = await speech;
    // Wait for other speech/hold sessions rather than destroying their connection.
    for (let attempt = 0; attempt < 60; attempt++) {
      if (newState.member.voice.channelId !== STAFF_WAITING_CHANNEL) return;
      const existing = getVoiceConnection(guild.id);
      if (!getActiveHold(guild.id) && (!existing || existing.joinConfig.channelId === DISPATCH_VOICE_CHANNEL_ID)) break;
      if (attempt === 59) throw new Error('Staff waiting greeting delayed: bot is busy in another voice session');
      await new Promise(r => setTimeout(r, 1000));
    }
    const channel = await guild.channels.fetch(STAFF_WAITING_CHANNEL);
    const me = guild.members.me || await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) throw new Error('Missing Connect/Speak in staff waiting VC');
    if (newState.member.voice.channelId !== STAFF_WAITING_CHANNEL) return;
    const restoreRadio = getVoiceConnection(guild.id)?.joinConfig.channelId === DISPATCH_VOICE_CHANNEL_ID;
    if (restoreRadio) pauseDispatchRadioMonitor('staff_waiting_greeting');
    try {
      await playMp3InVoiceChannel(channel, guild.voiceAdapterCreator, mp3, { leaveAfter: true, speakDelayMs: 2000 });
    } finally { if (restoreRadio) resumeDispatchRadioMonitor('staff_waiting_greeting_done'); }
  });
  pending.set(guild.id, job);
  try { await job; } finally { if (pending.get(guild.id) === job) pending.delete(guild.id); }
}
