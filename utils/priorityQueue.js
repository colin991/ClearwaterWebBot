import { MessageFlags } from 'discord.js';
import { resolve } from 'node:path';
import { fetchErlcServer, parseErlcPlayer, withErlcCommandSession } from './erlc.js';
import { getIdentityCache } from './identityStore.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

export const PRIORITY_CHANNEL = '1532549648042954922';
export const PRIORITY_QUEUE_LOG_CHANNEL = '1549178818814812211';
export const PRIORITY_BUTTON = 'priority_queue_boost';
export const PRIORITY_ROLES = ['1514109306700693616', '1532549498696634408'];
const HEADER = 'https://media.discordapp.net/attachments/1529616984755540088/1546535995736858644/clearwater_ban.png?format=webp&quality=lossless&ex=6aa95de2&is=6aa80c62&hm=15715be370c6833a859c9eab336aa9f2b25f9a75eea6ec4d3408e9c893cbeff7';
const FOOTER = 'https://media.discordapp.net/attachments/1529616984755540088/1545833442040619018/clearwater_footer.png?format=webp&quality=lossless&ex=6aa97294&is=6aa82114&hm=2b49a1e6d3a74cfa9b6f32d5e427d56bf13aafba1cfe1668572df43db598a92c';

export function priorityPanel() {
  const gallery = url => ({ type: 12, items: [{ media: { url } }] });
  const gap = () => ({ type: 14, divider: false, spacing: 1 });
  return { flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, components: [{ type: 17, components: [
    gallery(HEADER), gap(),
    { type: 10, content: '# <:broom:1518378812256030830> In-Game Priority Queue\n> ### What is the priority queue?\n> Specific to voters of our Melonly Directory and server boosters, you can join the game within seconds, skipping the queue!\n> ### How do I use it?\n> All you have to do is join an ERLC public server, click the blue button below, and bam you have been entered and skipped the queue.' },
    gap(), { type: 1, components: [{ type: 2, style: 1, label: 'Join Queue', emoji: { id: '1514354958592643177', name: 'd_plane' }, custom_id: PRIORITY_BUTTON }] }, gap(),
    { type: 10, content: '> <:bellring:1518378682912211195> Please note: this is **only necessary whenever the in-game has a queue**. Do not abuse the priority queue or you will be stripped of using it any further.' },
    gallery(FOOTER),
  ] }] };
}

export function validatePriorityServer(server, id) {
  if (!Array.isArray(server.Queue) || !Array.isArray(server.Players)) throw new Error('The game queue is unavailable. Try again shortly.');
  if (server.Queue.length < 1) throw new Error('There is no in-game queue right now.');
  if (server.Players.some(p => parseErlcPlayer(p).robloxId === id)) throw new Error('You are already in the game server.');
  for (const type of ['Admins', 'Mods', 'Helpers']) {
    if (!server.Staff?.[type] || typeof server.Staff[type] !== 'object' || Array.isArray(server.Staff[type])) throw new Error('Staff permissions could not be checked. Try again shortly.');
    if (Object.hasOwn(server.Staff[type], id)) throw new Error('You already have in-game staff access. Your permissions will not be changed.');
  }
  if (String(server.OwnerId) === id || server.CoOwnerIds?.map(String).includes(id)) throw new Error('Server owners already have priority access.');
}

export function createPriorityService({ snapshot, session, load, save, now = Date.now, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  let busy = false;
  async function recover() {
    if (busy) return;
    busy = true;
    try {
      const pending = await load();
      if (pending) {
        if (!/^\d{1,20}$/.test(pending.robloxId)) throw new Error('Invalid pending priority removal.');
        await session(send => send(':unmod ' + pending.robloxId));
        await save(null);
      }
    } finally { busy = false; }
  }
  async function grant(id, checkRole, onGranted = () => {}) {
    if (busy) throw new Error('Another priority request is being processed. Try again shortly.');
    if (!/^\d{1,20}$/.test(id)) throw new Error('No linked Roblox ID was found. Please have staff link your account first.');
    busy = true;
    try {
      if (await load()) throw new Error('A previous priority removal is still pending. Try again shortly.');
      await session(async send => {
        await checkRole();
        validatePriorityServer(await snapshot(), id);
        // Save before granting, including uncertain network outcomes.
        await save({ robloxId: id, createdAt: now() });
        try {
          await send(':mod ' + id);
          const deadline = now() + 10000;
          // Notification delivery cannot extend the privileged window.
          void Promise.resolve().then(onGranted).catch(e => logger.error('Priority notification failed', e));
          while (now() < deadline) {
            await wait(Math.min(1000, deadline - now()));
            if (now() >= deadline) break;
            // A slow player lookup must never hold up the ten-second removal.
            const server = await Promise.race([
              snapshot().catch(() => null),
              wait(Math.max(0, deadline - now())).then(() => null),
            ]);
            if (server?.Players?.some(p => parseErlcPlayer(p).robloxId === id)) break;
          }
        } finally {
          await send(':unmod ' + id);
          await save(null);
        }
      });
    } finally { busy = false; }
  }
  return { grant, recover };
}

export async function postPriorityQueueLog(client, event) {
  const channel = await client.channels.fetch(PRIORITY_QUEUE_LOG_CHANNEL);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') throw new Error('Priority queue log channel unavailable.');
  await channel.send({
    allowedMentions: { parse: [] },
    embeds: [{
      title: 'Priority Queue',
      description: event.action,
      color: event.ok === false ? 0xe05555 : 0x5b8def,
      fields: [
        { name: 'Discord user', value: event.userId ? `<@${event.userId}>\n${event.username || 'Unknown'} (${event.userId})` : 'Unknown', inline: true },
        { name: 'Roblox ID', value: String(event.robloxId || 'Unknown'), inline: true },
        ...(event.detail ? [{ name: 'Result', value: String(event.detail).slice(0, 700) }] : []),
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

export function startPriorityQueue(client) {
  const path = resolve('data', 'priority-queue-pending.json');
  const key = client.config.erlcServerKey;
  client.priorityQueue = createPriorityService({
    snapshot: () => fetchErlcServer(key, { staff: true }),
    session: action => withErlcCommandSession(key, action),
    load: () => readJsonFile(path, null, { corruptFallback: false }),
    save: value => writeJsonFile(path, value),
  });
  const recover = () => client.priorityQueue.recover().catch(e => logger.error('Priority queue removal pending; will retry', e));
  void recover();
  const timer = setInterval(recover, 15000);
  timer.unref();
  return () => clearInterval(timer);
}

export async function handlePriorityQueue(interaction) {
  if (!interaction.isButton() || interaction.customId !== PRIORITY_BUTTON) return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let robloxId = '';
  const logUse = (ok, detail) => {
    void postPriorityQueueLog(interaction.client, {
      action: ok ? 'Join Queue used' : 'Join Queue failed',
      ok,
      userId: interaction.user.id,
      username: interaction.user.username,
      robloxId,
      detail,
    }).catch(error => logger.error('Priority queue log failed', error));
  };
  try {
    if (interaction.channelId !== PRIORITY_CHANNEL || interaction.guildId !== interaction.client.config.guildId) throw new Error('Use the priority queue panel in the Clearwater server.');
    const checkRole = async () => {
      const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
      if (!PRIORITY_ROLES.some(id => member.roles.cache.has(id))) throw new Error('You need the voter or server booster role to use priority queue.');
    };
    await checkRole();
    const identity = (await getIdentityCache()).byDiscord[interaction.user.id];
    if (!interaction.client.priorityQueue) throw new Error('Priority queue is still starting. Try again shortly.');
    robloxId = String(identity?.robloxId || '');
    await interaction.editReply('Checking your queue access. Join the game as soon as priority access is available.');
    await interaction.client.priorityQueue.grant(robloxId, checkRole,
      () => interaction.editReply('Priority access is active! Join the game now. Temporary moderator access will be removed on entry or after 10 seconds.'));
    await interaction.editReply('Your priority window has ended and temporary moderator access has been removed.');
    logUse(true, 'Temporary moderator access granted and removed.');
  } catch (error) {
    logger.error('Priority queue request failed', error);
    logUse(false, error.message || 'Priority queue could not be activated.');
    await interaction.editReply(error.message || 'Priority queue could not be activated.');
  }
  return true;
}
