import {
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { resolve } from 'node:path';
import { executeErlcCommand, fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { resolveZoneDiscordMember } from './erlcZoneVoice.js';
import { markBotVoiceMove } from './botVoiceMoves.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';

export const BRIEFING_WALLS_LAYOUT = 'BREIFING WALLS';
export const BRIEFING_ROADS_LAYOUT = 'BREIFING ROAD BLOCKS';
export const BRIEFING_PEACE_SECONDS = 20 * 60;
export const BRIEFING_START_MESSAGE = 'A server wide LEO briefing is now starting please do not start any roleplay that LEO is needed please go to the police station if you are LEO';
export const BRIEFING_END_MESSAGE = 'The server wide LEO briefing has now ended normal roleplay can start';
export const BRIEFING_PREFIX = 'brf:';

export function isLeoTeam(team) {
  return /\b(police|sheriff)\b/i.test(String(team || '').replace(/[_-]+/g, ' '));
}

export function leoPlayers(players = []) {
  return (Array.isArray(players) ? players : []).filter((player) => player?.username && isLeoTeam(player.team));
}

export function briefingLayoutCommand(action, name) {
  const verb = String(action || '').toLowerCase() === 'unload' ? 'unloadlayout' : 'loadlayout';
  const title = String(name || '').replace(/\s+/g, ' ').trim();
  if (!title) throw new Error('Missing map layout name');
  return `:${verb} ${title}`;
}

function briefingInteractionCustomId(interaction) {
  return String(
    interaction?.customId
    || interaction?.component?.customId
    || interaction?.component?.data?.custom_id
    || '',
  );
}

export function parseBriefingButton(customId) {
  const id = String(customId || '');
  if (id === `${BRIEFING_PREFIX}roads:on`) return { action: 'roads-on' };
  if (id === `${BRIEFING_PREFIX}roads:off`) return { action: 'roads-off' };
  if (id === `${BRIEFING_PREFIX}end`) return { action: 'end' };
  return null;
}

export function emptyBriefingState() {
  return {
    active: false,
    ownerId: null,
    voiceChannelId: null,
    wallsLoaded: false,
    roadBlocksLoaded: false,
    startedAt: null,
    endedAt: null,
  };
}

export function briefingPanel(state) {
  const active = Boolean(state?.active);
  const roads = Boolean(state?.roadBlocksLoaded);
  const title = active ? 'LEO Briefing' : 'LEO Briefing — Ended';
  const body = active
    ? [
      'A server-wide LEO briefing is running.',
      `- **Walls:** loaded (\`${BRIEFING_WALLS_LAYOUT}\`)`,
      `- **Road blocks:** ${roads ? `loaded (\`${BRIEFING_ROADS_LAYOUT}\`)` : 'not loaded'}`,
      '- Use the buttons to load/unload road blocks or end the briefing.',
    ].join('\n')
    : 'The briefing has ended. Both map layouts were unloaded.';
  return {
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    components: [{
      type: 17,
      components: [
        { type: 10, content: `## ${title}\n${body}`.slice(0, 4000) },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: roads ? ButtonStyle.Secondary : ButtonStyle.Success,
              label: roads ? 'Unload road blocks' : 'Load road blocks',
              custom_id: roads ? `${BRIEFING_PREFIX}roads:off` : `${BRIEFING_PREFIX}roads:on`,
              disabled: !active,
            },
            {
              type: 2,
              style: ButtonStyle.Danger,
              label: 'End briefing',
              custom_id: `${BRIEFING_PREFIX}end`,
              disabled: !active,
            },
          ],
        },
      ],
    }],
  };
}

export async function hasDiscordAdministrator(interaction) {
  if (interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const guild = interaction.guild
    || (interaction.client?.config?.guildId
      ? await interaction.client.guilds.fetch(interaction.client.config.guildId).catch(() => null)
      : null);
  const member = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

export function createLeoBriefingService({
  snapshot,
  send,
  load,
  save,
  dmUser,
  moveLeoMembers,
  now = Date.now,
  onError = (error) => logger.error('LEO briefing failed', error),
} = {}) {
  let state = emptyBriefingState();
  let loaded = false;
  let ending = false;

  async function persist() {
    await save(state);
  }

  async function ensure() {
    if (loaded) return state;
    const stored = await load();
    state = stored && typeof stored === 'object' ? { ...emptyBriefingState(), ...stored } : emptyBriefingState();
    loaded = true;
    return state;
  }

  async function runCommand(command, options = {}) {
    const result = await send(command, options);
    if (result === false) {
      throw new Error(`The in-game command was blocked: ${command}`);
    }
    return result;
  }

  async function runLayout(action, name) {
    return runCommand(briefingLayoutCommand(action, name), { allowLoad: true });
  }

  return {
    get state() { return state; },
    async start({ user, voiceChannelId }) {
      const current = await ensure();
      if (current.active) {
        throw new Error('A LEO briefing is already running. End it from the DM panel first.');
      }
      if (!voiceChannelId) {
        throw new Error('Join a voice channel first. Everyone on Police or Sheriff will be dragged there.');
      }
      const server = await snapshot();
      const players = leoPlayers((server.Players || server.players || []).map((player) => (
        player?.username ? player : parseErlcPlayer(player)
      )));
      const moved = await moveLeoMembers({
        voiceChannelId,
        players,
      });
      await runCommand(`:m ${BRIEFING_START_MESSAGE}`);
      await runCommand(`:pt ${BRIEFING_PEACE_SECONDS}`);
      await runLayout('load', BRIEFING_WALLS_LAYOUT);
      state = {
        active: true,
        ownerId: user.id,
        voiceChannelId: String(voiceChannelId),
        wallsLoaded: true,
        roadBlocksLoaded: false,
        startedAt: now(),
        endedAt: null,
      };
      await persist();
      const panel = briefingPanel(state);
      try {
        await dmUser(user.id, panel);
      } catch (error) {
        onError(error);
      }
      return { state, moved, panel };
    },

    async setRoadBlocks(loadedRoads) {
      const current = await ensure();
      if (!current.active) throw new Error('No LEO briefing is running.');
      const next = Boolean(loadedRoads);
      if (current.roadBlocksLoaded === next) return { state: current, panel: briefingPanel(current) };
      await runLayout(next ? 'load' : 'unload', BRIEFING_ROADS_LAYOUT);
      current.roadBlocksLoaded = next;
      await persist();
      return { state: current, panel: briefingPanel(current) };
    },

    async peek() {
      return ensure();
    },

    async end({ waitForInGame = true } = {}) {
      const current = await ensure();
      if (!current.active || ending) {
        return { state: current, panel: briefingPanel({ ...current, active: false }), alreadyEnded: true };
      }
      ending = true;
      state = {
        ...current,
        active: false,
        wallsLoaded: false,
        roadBlocksLoaded: false,
        endedAt: now(),
      };
      await persist();
      const panel = briefingPanel(state);
      const game = (async () => {
        try {
          await runCommand(`:m ${BRIEFING_END_MESSAGE}`);
        } catch (error) { onError(error); }
        try {
          await runLayout('unload', BRIEFING_WALLS_LAYOUT);
        } catch (error) { onError(error); }
        try {
          await runLayout('unload', BRIEFING_ROADS_LAYOUT);
        } catch (error) { onError(error); }
      })();
      if (waitForInGame) await game;
      else void game.catch(onError);
      return { state, panel };
    },
  };
}

export async function moveLeoMembersToChannel({
  guild,
  voiceChannel,
  players,
  identities,
} = {}) {
  const moved = [];
  const skipped = [];
  if (!guild || !voiceChannel?.id) return { moved, skipped };
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!voiceChannel.permissionsFor?.(me)?.has?.([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers])) {
    throw new Error('The bot needs View Channel, Connect, and Move Members in your voice channel.');
  }
  await ensureGuildMembers(guild, { allowStale: true }).catch(() => null);
  for (const player of players) {
    const resolved = await resolveZoneDiscordMember(guild, player, identities);
    const member = resolved?.member;
    if (!member?.voice?.channelId) {
      skipped.push(player.username);
      continue;
    }
    if (member.voice.channelId === voiceChannel.id) {
      skipped.push(player.username);
      continue;
    }
    try {
      markBotVoiceMove(member.id);
      await member.voice.setChannel(voiceChannel, 'Server-wide LEO briefing');
      moved.push(player.username);
    } catch (error) {
      logger.error(`Could not drag ${player.username} to the briefing voice channel`, error);
      skipped.push(player.username);
    }
  }
  return { moved, skipped };
}

export function startLeoBriefing(client) {
  const path = resolve('data', 'leo-briefing.json');
  const key = client.config.erlcServerKey;
  const service = createLeoBriefingService({
    snapshot: () => fetchErlcServer(key),
    send: (command, options) => executeErlcCommand(key, command, options),
    load: () => readJsonFile(path, emptyBriefingState()),
    save: (value) => writeJsonFile(path, value, { backup: true }),
    async dmUser(userId, payload) {
      const user = await client.users.fetch(userId);
      await user.send(payload);
    },
    async moveLeoMembers({ voiceChannelId, players }) {
      const guild = await client.guilds.fetch(client.config.guildId);
      const channel = await guild.channels.fetch(voiceChannelId);
      if (!channel?.isVoiceBased?.()) throw new Error('That voice channel is unavailable.');
      const identities = await discordIdsByRobloxId();
      return moveLeoMembersToChannel({
        guild,
        voiceChannel: channel,
        players,
        identities,
      });
    },
  });
  client.leoBriefing = service;
  logger.info('LEO briefing command enabled.');
  return service;
}

export async function handleLeoBriefing(interaction) {
  const id = briefingInteractionCustomId(interaction);
  if (!id.startsWith(BRIEFING_PREFIX)) return false;
  if (interaction.isChatInputCommand?.()) return false;
  const clicked = parseBriefingButton(id);
  if (!clicked) return false;
  const service = interaction.client.leoBriefing;
  if (!service) {
    await interaction.reply({ content: 'LEO briefing is still starting. Try again shortly.', flags: MessageFlags.Ephemeral });
    return true;
  }
  try {
    if (!await hasDiscordAdministrator(interaction)) {
      throw new Error('You must have the Discord Administrator permission to use the briefing panel.');
    }
    await interaction.deferUpdate();
    const current = await service.peek();
    if (current.ownerId && current.ownerId !== interaction.user.id) {
      throw new Error('Only the administrator who started this briefing can use the panel.');
    }
    let result;
    if (clicked.action === 'roads-on') result = await service.setRoadBlocks(true);
    else if (clicked.action === 'roads-off') result = await service.setRoadBlocks(false);
    else result = await service.end({ waitForInGame: false });
    await interaction.editReply(result.panel);
  } catch (error) {
    logger.error('LEO briefing panel failed', error);
    const reply = { content: String(error?.message || 'That briefing action failed.').slice(0, 1800), flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
  return true;
}
