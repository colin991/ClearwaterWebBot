import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { speakInVoiceChannel } from '../utils/voiceSay.js';

export default {
  name: 'say',
  aliases: ['tts', 'speak'],
  description: 'Join your voice channel and say the text you provide.',
  async execute(message, args) {
    const raw = Array.isArray(args) ? args.join(' ').trim() : '';
    if (!raw) return message.reply('Use `-say <text>`.');

    const voice = message.member?.voice?.channel;
    if (!voice || (voice.type !== ChannelType.GuildVoice && voice.type !== ChannelType.GuildStageVoice)) {
      return message.reply('Join a voice channel first.');
    }

    const me = message.guild.members.me;
    const permissions = voice.permissionsFor(me);
    if (!permissions?.has(PermissionFlagsBits.Connect) || !permissions?.has(PermissionFlagsBits.Speak)) {
      return message.reply(`I need Connect and Speak in ${voice}.`);
    }

    await speakInVoiceChannel(voice, raw);
    await message.reply(`Saying that in ${voice}.`).catch(() => {});
  },
};
