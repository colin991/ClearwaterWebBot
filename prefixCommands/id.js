import { EmbedBuilder } from 'discord.js';
import { findRobloxIdentity, safeMelonlyError } from '../utils/melonly.js';
import { rememberIdentity } from '../utils/identityStore.js';
import { getOwnerConfig } from '../utils/ownerConfig.js';
import { logger } from '../utils/logger.js';
import { RANK_FLOOR, requireMinRank, snowflakeFrom } from '../utils/prefixHelpers.js';

export default {
  name: 'id',
  description: 'Look up a Discord user’s Melonly-verified Roblox identity.',
  minRank: RANK_FLOOR.anyStaff,
  async execute(message, args, client) {
    requireMinRank(message, RANK_FLOOR.anyStaff);
    const settings = await getOwnerConfig();
    const targetId = message.mentions.users.first()?.id || snowflakeFrom(args[0] || '');
    if (!targetId) {
      await message.reply('Use `-id @DiscordUser`.');
      return;
    }

    const target = await client.users.fetch(targetId).catch(() => null);
    const waiting = await message.reply(`Looking up ${target ? `<@${target.id}>` : 'that user'}…`);
    try {
      const identity = await findRobloxIdentity(targetId, client.config.melonlyApiKey);
      if (!identity) {
        await waiting.edit({
          content: '',
          embeds: [
            new EmbedBuilder()
              .setTitle('Identity')
              .setDescription(`${target ? `<@${target.id}>` : `\`${targetId}\``} does not have a Roblox identity verified through Melonly Verify.`)
              .setColor(0xf0a84b),
          ],
        });
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
        if (member && !member.roles.cache.has(settings.verifiedRoleId)) {
          await member.roles.add(settings.verifiedRoleId, 'Roblox identity found through Melonly');
        }
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
