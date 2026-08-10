import { EmbedBuilder, Events } from 'discord.js';
import { findRobloxIdentity, safeMelonlyError } from '../utils/melonly.js';
import { rememberIdentity } from '../utils/identityStore.js';
import { getOwnerConfig } from '../utils/ownerConfig.js';
import { logger } from '../utils/logger.js';

const snowflakeFrom = (value = '') => value.match(/\d{16,22}/)?.[0] || null;

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.inGuild() || message.author.bot) return;
    const settings = await getOwnerConfig();
    const prefix = settings.prefix || '-';
    const commandPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}id(?:\\s|$)`, 'i');
    if (!commandPattern.test(message.content)) return;

    const targetId = message.mentions.users.first()?.id || snowflakeFrom(message.content.slice(prefix.length + 2));
    if (!targetId) {
      await message.reply(`Use \`${prefix}id @DiscordUser\`.`);
      return;
    }

    const target = await client.users.fetch(targetId).catch(() => null);
    const waiting = await message.reply(`Looking up ${target ? `<@${target.id}>` : 'that user'}…`);
    try {
      const identity = await findRobloxIdentity(targetId, client.config.melonlyApiKey);
      if (!identity) {
        await waiting.edit({ content: '', embeds: [new EmbedBuilder().setTitle('Identity').setDescription(`${target ? `<@${target.id}>` : `\`${targetId}\``} does not have a Roblox identity recorded in Melonly applications.`).setColor(0xf0a84b)] });
        return;
      }

      await rememberIdentity(identity);
      const robloxName = identity.robloxUsername || `User ${identity.robloxId}`;
      const embed = new EmbedBuilder()
        .setTitle('Identity')
        .setColor(0x4e91f9)
        .addFields(
          { name: 'Discord', value: target ? `${target} \`${target.username}\`` : `\`${targetId}\``, inline: true },
          { name: 'Roblox', value: `[${robloxName}](https://www.roblox.com/users/${identity.robloxId}/profile)\n\`${identity.robloxId}\``, inline: true },
          { name: 'Display name', value: identity.robloxDisplayName || robloxName, inline: true },
        )
        .setFooter({ text: 'Verified through Melonly' })
        .setTimestamp();
      await waiting.edit({ content: '', embeds: [embed] });

      if (settings.verifiedGuildId && settings.verifiedRoleId) {
        const guild = await client.guilds.fetch(settings.verifiedGuildId).catch(() => null);
        const member = await guild?.members.fetch(targetId).catch(() => null);
        if (member && !member.roles.cache.has(settings.verifiedRoleId)) await member.roles.add(settings.verifiedRoleId, 'Roblox identity found through Melonly');
      }
      if (settings.identityLogChannelId) {
        const channel = await client.channels.fetch(settings.identityLogChannelId).catch(() => null);
        if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (error) {
      logger.error('Identity lookup failed', error);
      await waiting.edit(safeMelonlyError(error));
    }
  },
};
