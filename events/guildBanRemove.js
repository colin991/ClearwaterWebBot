import { Events, PermissionFlagsBits } from 'discord.js';
import { CLEARWATER_GUILD_ID } from '../utils/staffRanks.js';
import { logger } from '../utils/logger.js';

/** Discord "Unknown Ban" — user was not banned in that guild. */
const UNKNOWN_BAN = 10026;

export async function propagateMainServerUnban(ban, client) {
  const guildId = String(ban?.guild?.id || '');
  const userId = String(ban?.user?.id || '');
  if (guildId !== CLEARWATER_GUILD_ID) return { skipped: true, reason: 'not-main' };
  if (!/^\d{16,22}$/.test(userId)) return { skipped: true, reason: 'no-user' };

  if (typeof client.guilds.fetch === 'function') {
    await client.guilds.fetch().catch(() => {});
  }

  const results = [];
  const guilds = [...(client.guilds.cache?.values?.() || [])];
  for (const guild of guilds) {
    if (String(guild.id) === CLEARWATER_GUILD_ID) continue;
    try {
      const me = guild.members?.me || await guild.members?.fetchMe?.();
      if (!me?.permissions?.has?.(PermissionFlagsBits.BanMembers)) {
        results.push({ guildId: guild.id, ok: false, reason: 'missing BanMembers' });
        continue;
      }
      await guild.bans.remove(userId, 'Mirrored unban from the main Clearwater server.');
      results.push({ guildId: guild.id, ok: true });
    } catch (error) {
      const code = Number(error?.code ?? error?.rawError?.code);
      if (code === UNKNOWN_BAN) {
        results.push({ guildId: guild.id, ok: true, reason: 'not-banned' });
        continue;
      }
      logger.warn(
        `Could not mirror main-server unban of ${userId} to guild ${guild.id}: ${error?.message || error}`,
      );
      results.push({ guildId: guild.id, ok: false, reason: error?.message || 'unban failed' });
    }
  }
  if (results.some((entry) => entry.ok && !entry.reason)) {
    logger.info(`Mirrored main-server unban of ${userId} to ${results.filter((entry) => entry.ok).length} other server(s).`);
  }
  return { skipped: false, userId, results };
}

export default {
  name: Events.GuildBanRemove,
  async execute(ban, client) {
    try {
      await propagateMainServerUnban(ban, client || ban?.client);
    } catch (error) {
      logger.error('Main-server unban mirror failed', error);
    }
  },
};
