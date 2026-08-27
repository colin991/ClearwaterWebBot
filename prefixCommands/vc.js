import { ChannelType } from 'discord.js';
import { requireAdministrator, snowflakeFrom } from '../utils/prefixHelpers.js';
import { v2Card } from '../utils/v2Message.js';

function isVoiceChannel(channel) {
  return channel?.type === ChannelType.GuildVoice
    || channel?.type === ChannelType.GuildStageVoice;
}

function resolveVoiceChannel(message, args = []) {
  const mentioned = message.mentions.channels.find((channel) => isVoiceChannel(channel));
  if (mentioned) return mentioned;

  const id = snowflakeFrom(args[0]);
  if (id) {
    const channel = message.guild.channels.cache.get(id);
    if (isVoiceChannel(channel)) return channel;
  }

  return message.member?.voice?.channel || null;
}

function describeVoiceCount(channel) {
  const members = [...channel.members.values()];
  const humans = members.filter((member) => !member.user.bot).length;
  const bots = members.length - humans;
  const lines = members.length
    ? members.map((member) => member.toString()).join(', ')
    : 'Nobody is in this channel.';

  return {
    count: members.length,
    humans,
    bots,
    lines,
  };
}

export default {
  name: 'vc',
  description: 'Show how many members are in a voice channel.',
  async execute(message, args) {
    requireAdministrator(message);

    const channel = resolveVoiceChannel(message, args);
    if (!channel) {
      throw new Error('Join a voice channel or mention one with `-vc [#channel]`.');
    }

    const { count, humans, bots, lines } = describeVoiceCount(channel);
    const memberLabel = count === 1 ? 'member' : 'members';

    await message.reply(v2Card({
      title: `Voice channel · ${channel.name}`,
      description: [
        `**${count}** ${memberLabel} in ${channel}.`,
        humans !== count ? `Humans: **${humans}** · Bots: **${bots}**` : '',
        '',
        lines,
      ].filter(Boolean).join('\n').slice(0, 4000),
    }));
  },
};
