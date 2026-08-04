import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const configPath = join(process.cwd(), 'data', 'owner-config.json');
const snowflakeFields = [
  'mainGuildId', 'staffGuildId', 'inGameGuildId', 'inGameRoleId',
  'verifiedGuildId', 'verifiedRoleId', 'identityLogChannelId', 'gameLogChannelId',
];

export const defaultOwnerConfig = Object.freeze({
  prefix: '-',
  mainGuildId: '',
  staffGuildId: '',
  inGameGuildId: '',
  inGameRoleId: '',
  verifiedGuildId: '',
  verifiedRoleId: '',
  identityLogChannelId: '',
  gameLogChannelId: '',
  syncIntervalSeconds: 30,
});

export async function getOwnerConfig() {
  return { ...defaultOwnerConfig, ...(await readJsonFile(configPath, defaultOwnerConfig)) };
}

export async function saveOwnerConfig(input) {
  const next = { ...defaultOwnerConfig };
  next.prefix = String(input?.prefix || '-').slice(0, 3) || '-';
  for (const field of snowflakeFields) {
    const value = String(input?.[field] || '').trim();
    next[field] = /^\d{16,22}$/.test(value) ? value : '';
  }
  const interval = Number.parseInt(input?.syncIntervalSeconds, 10);
  next.syncIntervalSeconds = Math.min(300, Math.max(15, Number.isInteger(interval) ? interval : 30));
  await writeJsonFile(configPath, next);
  return next;
}

export async function buildDiscordCatalog(client) {
  const guilds = [];
  for (const guild of client.guilds.cache.values()) {
    await Promise.allSettled([guild.roles.fetch(), guild.channels.fetch()]);
    guilds.push({
      id: guild.id,
      name: guild.name,
      roles: guild.roles.cache
        .filter((role) => role.id !== guild.id && !role.managed)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name })),
      channels: guild.channels.cache
        .filter((channel) => channel.isTextBased() && !channel.isThread())
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map((channel) => ({ id: channel.id, name: channel.name })),
    });
  }
  return guilds.sort((a, b) => a.name.localeCompare(b.name));
}
