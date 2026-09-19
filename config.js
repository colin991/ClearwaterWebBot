import 'dotenv/config';

export const config = Object.freeze({
  token: process.env.DISCORD_TOKEN?.trim(),
  clientId: process.env.DISCORD_CLIENT_ID?.trim(),
  guildId: process.env.DISCORD_GUILD_ID?.trim(),
  melonlyApiKey: process.env.MELONLY_API_KEY?.trim(),
  cookieApiKey: process.env.COOKIE_API_KEY?.trim(),
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
