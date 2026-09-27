import { parseCustomCommand, runDiscordSceneCommand, SCENE_COMMAND_FAILURE_REASONS } from '../utils/erlcSceneCommands.js';
import { parseArgs } from '../utils/prefixHelpers.js';

const ALIASES = ['ss', 'scene', 'fc', 'civ', 'team'];

function sceneReply(result) {
  if (result?.handled) {
    const where = result.channelName ? `#${result.channelName}` : 'the scene channel';
    if (result.reason === 'already_there' || result.reason === 'already_in_empty') {
      return `You are already in ${where}.`;
    }
    const extra = result.nearbyMoved ? ` Dragged ${result.nearbyMoved} nearby.` : '';
    return `Moved you to ${where}.${extra}`;
  }
  const reason = result?.reason || 'unknown';
  if (reason === 'not_in_voice') return 'Join a Discord voice channel first, then run this again.';
  if (reason === 'no_empty_channel') return 'There is no numbered scene voice channel in this server.';
  if (reason === 'no_team') return 'Your in-game team has no mapped voice channel (Fire / Police / Sheriff / DOT).';
  if (reason === 'team_channel_missing') return 'The mapped team voice channel is not in the server you are in.';
  if (reason === 'missing_move_members') return 'The bot needs Move Members in this server.';
  if (reason === 'duplicate') return 'That scene command already ran a moment ago.';
  return SCENE_COMMAND_FAILURE_REASONS[reason] || 'Could not move you.';
}

export default {
  name: 'ts',
  aliases: ALIASES,
  description: 'Move yourself into Traffic Stop / scene voice channels (;ts ;ss ;scene ;fc ;civ ;team).',
  async execute(message, _args, client) {
    const prefix = String(message.content || '').startsWith(';') ? ';' : '-';
    const { name } = parseArgs(message.content, prefix);
    const command = parseCustomCommand(name) || parseCustomCommand(`;${name}`);
    if (!command) return;

    let member = message.member;
    if (!member?.voice) {
      member = await message.guild?.members.fetch(message.author.id).catch(() => member);
    }

    const result = await runDiscordSceneCommand({
      client,
      member,
      commandName: command.name,
    });

    if (message.channel?.isTextBased?.()) {
      await message.reply(sceneReply(result)).catch(() => {});
    }
  },
};
