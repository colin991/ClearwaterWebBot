import { BELLEAIR_GUILD_ID } from './belleairServer.js';
import { PINELLAS_GUILD_ID } from './pinellasServer.js';

export { BELLEAIR_GUILD_ID, PINELLAS_GUILD_ID };

/** Prefix/slash commands scoped to one department Discord. */
export const COMMAND_SCOPE = Object.freeze({
  pcso: PINELLAS_GUILD_ID,
  bpd: BELLEAIR_GUILD_ID,
});

export function sourceGuildId(source) {
  return String(source?.guildId || source?.guild?.id || '');
}

export function commandGuildIds(command) {
  if (Array.isArray(command?.guildIds) && command.guildIds.length) {
    return command.guildIds.map(String);
  }
  if (command?.guildId) return [String(command.guildId)];
  return [];
}

/**
 * Untagged commands run in every server the bot is in.
 * PCSO/BPD commands only run in that department's Discord.
 */
export function commandAllowedInGuild(command, guildId) {
  const allowed = commandGuildIds(command);
  if (!allowed.length) return true;
  return allowed.includes(String(guildId || ''));
}

export function slashCommandsForGuild(commands, guildId) {
  return (Array.isArray(commands) ? commands : [])
    .filter((command) => commandAllowedInGuild(command, guildId))
    .map((command) => command.data.toJSON());
}

export function rejectWrongGuild() {
  const error = new Error('wrong_guild');
  error.code = 'WRONG_GUILD';
  throw error;
}
