import { ChannelType } from 'discord.js';
import { requireAdministrator } from '../utils/prefixHelpers.js';
import { v2Card } from '../utils/v2Message.js';

function isVoiceChannel(channel) {
  return channel?.type === ChannelType.GuildVoice
    || channel?.type === ChannelType.GuildStageVoice;
}

function getServerVoiceStats(guild) {
  const voiceChannels = [...guild.channels.cache.values()].filter(isVoiceChannel);
  const members = new Map();
  const channelLines = [];

  for (const channel of voiceChannels.sort((a, b) => a.name.localeCompare(b.name))) {
    const count = channel.members.size;
    if (count > 0) {
      channelLines.push(`${channel.name}: **${count}**`);
    }
    for (const member of channel.members.values()) {
      members.set(member.id, member);
    }
  }

  const allMembers = [...members.values()];
  const humans = allMembers.filter((member) => !member.user.bot).length;
  const bots = allMembers.length - humans;

  return {
    total: allMembers.length,
    humans,
    bots,
    activeChannels: channelLines.length,
    channelLines,
  };
}

export default {
  name: 'vc',
  description: 'Show how many members are in voice channels across the server.',
  async execute(message) {
    requireAdministrator(message);

    const { total, humans, bots, activeChannels, channelLines } = getServerVoiceStats(message.guild);
    const memberLabel = total === 1 ? 'person' : 'people';
    const lines = [
      `**${total}** ${memberLabel} in voice across the server.`,
      activeChannels
        ? `Active channels: **${activeChannels}**`
        : 'Nobody is in a voice channel right now.',
    ];

    if (humans !== total) {
      lines.push(`Humans: **${humans}** · Bots: **${bots}**`);
    }

    if (channelLines.length) {
      lines.push('', channelLines.join('\n'));
    }

    await message.reply(v2Card({
      title: `Voice activity · ${message.guild.name}`,
      description: lines.join('\n').slice(0, 4000),
    }));
  },
};
