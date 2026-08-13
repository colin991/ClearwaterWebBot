import 'dotenv/config';

const cleanUrl = (value, fallback) => {
  try {
    return new URL(value || fallback).toString().replace(/\/$/, '');
  } catch {
    throw new Error('WEBSITE_URL must be a valid http or https URL.');
  }
};

const numberFromEnv = (value, fallback) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = Object.freeze({
  token: process.env.DISCORD_TOKEN?.trim(),
  clientId: process.env.DISCORD_CLIENT_ID?.trim(),
  guildId: process.env.DISCORD_GUILD_ID?.trim(),
  websiteUrl: cleanUrl(process.env.WEBSITE_URL, 'https://cwrpvc.lol'),
  apiKey: process.env.BOT_API_KEY?.trim(),
  melonlyApiKey: process.env.MELONLY_API_KEY?.trim(),
  erlcServerKey: process.env.ERLC_SERVER_KEY?.trim(),
  robloxGroupId: process.env.ROBLOX_GROUP_ID?.trim(),
  robloxGroupApiKey: process.env.ROBLOX_GROUP_API_KEY?.trim(),
  robloxGroupAllowedRoleIds: (process.env.ROBLOX_GROUP_ALLOWED_ROLE_IDS || '1514033664306974752,1514744040778760252')
    .split(',').map((value) => value.trim()).filter(Boolean),
  robloxGroupLogChannelId: process.env.ROBLOX_GROUP_LOG_CHANNEL_ID?.trim() || '1536517651055120514',
  internetFeedChannelId: process.env.INTERNET_FEED_CHANNEL_ID?.trim() || '1537573830543933560',
  ownerDiscordIds: (process.env.OWNER_DISCORD_IDS || '1044686997194805280')
    .split(',').map((value) => value.trim()).filter(Boolean),
  ownerRoleIds: (process.env.OWNER_ROLE_IDS || '1514033074948800683')
    .split(',').map((value) => value.trim()).filter(Boolean),
  // Sparked Host provides the allocated public port as SERVER_PORT. Prefer it
  // so the website bridge is reachable after a host restart or reinstall.
  port: numberFromEnv(process.env.SERVER_PORT || process.env.PORT, 3000),
});

export function validateConfig() {
  const required = [
    ['DISCORD_TOKEN', config.token],
    ['DISCORD_CLIENT_ID', config.clientId],
    ['DISCORD_GUILD_ID', config.guildId],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
