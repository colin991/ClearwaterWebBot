import 'dotenv/config';

export const config = Object.freeze({
  token: process.env.DISCORD_TOKEN?.trim(),
  clientId: process.env.DISCORD_CLIENT_ID?.trim(),
  guildId: process.env.DISCORD_GUILD_ID?.trim(),
  erlcServerKey: process.env.ERLC_SERVER_KEY?.trim(),
  melonlyApiKey: process.env.MELONLY_API_KEY?.trim(),
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim(),
  pcsoRosterSpreadsheetId: process.env.PCSO_ROSTER_SPREADSHEET_ID?.trim()
    || '1gbwwPz8Sk9AE_AG6J8RRWGaEGLGPX6AdHW2FTxqY4Xc',
  robloxGroupId: process.env.ROBLOX_GROUP_ID?.trim(),
  robloxGroupApiKey: process.env.ROBLOX_GROUP_API_KEY?.trim(),
  robloxGroupAllowedRoleIds: (process.env.ROBLOX_GROUP_ALLOWED_ROLE_IDS || '1514033664306974752,1514744040778760252')
    .split(',').map((value) => value.trim()).filter(Boolean),
  robloxGroupLogChannelId: process.env.ROBLOX_GROUP_LOG_CHANNEL_ID?.trim() || '1536517651055120514',
  internetFeedChannelId: process.env.INTERNET_PANEL_CHANNEL_ID?.trim() || '1540510308102176908',
  internetAutomodChannelId: process.env.INTERNET_AUTOMOD_CHANNEL_ID?.trim() || '1540763074187894864',
  /** Hold/say logs always use utils/vcActionLog.js hardcoded channel; kept here for reference. */
  vcActionLogChannelId: '1514547037537046688',
  noticeChannelId: process.env.NOTICE_CHANNEL_ID?.trim() || '1515038785421836479',
  verificationChannelId: process.env.VERIFICATION_CHANNEL_ID?.trim() || '1514181167145025666',
  messageForwardSourceIds: (process.env.MESSAGE_FORWARD_SOURCE_IDS || '1514667590608486400,1513609542468894877')
    .split(',').map((value) => value.trim()).filter(Boolean),
  messageForwardDestinationId: process.env.MESSAGE_FORWARD_DESTINATION_ID?.trim() || '1544901668934525020',
  ownerDiscordIds: (process.env.OWNER_DISCORD_IDS || '1044686997194805280')
    .split(',').map((value) => value.trim()).filter(Boolean),
  ownerRoleIds: (process.env.OWNER_ROLE_IDS || '1514033074948800683')
    .split(',').map((value) => value.trim()).filter(Boolean),
  secondaryGateGuildId: process.env.SECONDARY_GATE_GUILD_ID?.trim() || '1514189396184793169',
  secondaryGateRequiredRoleIds: (process.env.SECONDARY_GATE_REQUIRED_ROLE_IDS || '1053768758772109394,1514421440890409060,1514744040778760252,1536839307766267944')
    .split(',').map((value) => value.trim()).filter(Boolean),
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
