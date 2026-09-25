import { PermissionFlagsBits } from 'discord.js';
import {
  CLEARWATER_GUILD_ID,
} from './staffRanks.js';
import { logger } from './logger.js';
import { executeErlcCommand, fetchErlcServer, isCivilianTeam, parseErlcCommandLog, parseErlcKill, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId, getIdentityCache } from './identityStore.js';
import { isStealCommandText, playerStudDistance } from './erlcSceneCommands.js';
import { fetchPinellasDepartmentShifts, isActiveMelonlyShift, shiftCreatedMs } from './melonly.js';
import {
  ECONOMY_DEATH_FEE,
  ECONOMY_DEPARTMENTS,
  ECONOMY_LOG_CHANNEL_ID,
  ECONOMY_JOB_PAY,
  ECONOMY_MIN_LEO,
  ECONOMY_PAY_INTERVAL_MS,
  ECONOMY_STEAL_DISTANCE,
  departmentByGuildId,
  formatMoney,
  robberyById,
} from './economyConfig.js';
import {
  adminAdjustDepartment,
  adminAdjustUser,
  applyDeathFee,
  beginRobbery,
  completeRobberyIfReady,
  depositCash,
  economyBlocksPriority,
  ensureEconomyUser,
  failRobbery,
  findTransaction,
  findUserByRobloxId,
  grantStarter,
  grantWeeklyDepartmentFunds,
  refundTransaction,
  payDepartmentShift,
  payJobInterval,
  recentTransactions,
  reserveRobbery,
  robberyStatus,
  setFrozen,
  spendDepartmentFunds,
  totalBalance,
  transferCash,
  trySteal,
  updateRobberyScene,
  withdrawBank,
} from './economyLedger.js';
import { withEconomy } from './economyStore.js';
import { memberIsStaff } from './prefixHelpers.js';

const pendingSends = new Map();

export function leoCountFromPlayers(players = []) {
  return (Array.isArray(players) ? players : []).filter((player) => (
    /\b(police|sheriff)\b/i.test(String(player?.team || '').replace(/[_-]+/g, ' '))
  )).length;
}

async function identityForDiscord(discordId) {
  const cache = await getIdentityCache().catch(() => ({ byDiscord: {} }));
  return cache.byDiscord?.[String(discordId)] || null;
}

async function discordForRoblox(robloxId) {
  const map = await discordIdsByRobloxId().catch(() => new Map());
  return map.get(String(robloxId || '')) || '';
}

export async function postEconomyLog(client, title, body) {
  const channel = client?.channels?.cache?.get(ECONOMY_LOG_CHANNEL_ID)
    || await client?.channels?.fetch?.(ECONOMY_LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return false;
  await channel.send({
    content: `**${title}**\n${String(body || '').slice(0, 1700)}`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
  return true;
}

export async function ensureStarterAccount(discordId, extras = {}) {
  return withEconomy((store) => grantStarter(store, discordId, extras));
}

export async function grantStartersForGuild(guild, client) {
  if (!guild || String(guild.id) !== CLEARWATER_GUILD_ID) return { granted: 0 };
  await guild.members.fetch().catch(() => {});
  let granted = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    const result = await ensureStarterAccount(member.id);
    if (result.granted) {
      granted += 1;
      await postEconomyLog(client, 'Starter grant', `<@${member.id}> received ${formatMoney(1000)} · \`${result.tx.id}\``);
    }
  }
  await withEconomy((store) => {
    store.starterSweepAt = new Date().toISOString();
  });
  return { granted };
}

export async function getWalletView(discordId) {
  return withEconomy((store) => {
    const result = grantStarter(store, discordId);
    const user = result.user;
    return {
      user,
      total: totalBalance(user),
      transactions: recentTransactions(store, { userId: discordId, limit: 8 }),
    };
  });
}

export async function handleDeposit(discordId, amount) {
  return withEconomy((store) => depositCash(store, discordId, amount));
}

export async function handleWithdraw(discordId, amount) {
  return withEconomy((store) => withdrawBank(store, discordId, amount));
}

export async function handleTransfer(fromId, toId, amount, note) {
  const fingerprint = `${fromId}:${toId}:${amount}:${String(note || '').slice(0, 40)}`;
  return withEconomy((store) => transferCash(store, fromId, toId, amount, { note, fingerprint }));
}

export function rememberPendingSend(userId, payload) {
  pendingSends.set(String(userId), { ...payload, at: Date.now() });
}

export function takePendingSend(userId) {
  const value = pendingSends.get(String(userId));
  pendingSends.delete(String(userId));
  if (!value || Date.now() - value.at > 120_000) return null;
  return value;
}

export async function listUserTransactions(discordId, limit = 15) {
  return withEconomy((store) => recentTransactions(store, { userId: discordId, limit }));
}

export async function listDeptTransactions(deptId, limit = 15) {
  return withEconomy((store) => recentTransactions(store, { deptId, limit }));
}

export async function getDepartmentView(deptId) {
  return withEconomy((store) => {
    grantWeeklyDepartmentFunds(store);
    return {
      row: store.departments[deptId],
      transactions: recentTransactions(store, { deptId, limit: 10 }),
      robbery: store.robbery,
    };
  });
}

export async function robberyPanelState(client) {
  const server = client?.config?.erlcServerKey
    ? await fetchErlcServer(client.config.erlcServerKey, { timeoutMs: 2_500 }).catch(() => null)
    : null;
  const players = (server?.Players || []).map((entry) => (entry?.username != null ? entry : parseErlcPlayer(entry)));
  const leo = leoCountFromPlayers(players);
  const priority = client?.priorityRequest?.request;
  const priorityBlocked = ['pending', 'active'].includes(String(priority?.status || ''));
  return withEconomy((store) => {
    const expired = store.robbery?.status === 'reserved'
      && Date.now() >= Number(store.robbery.reservedUntil || 0);
    if (expired) store.robbery = { status: 'idle' };
    return {
      ...robberyStatus(store, { now: Date.now(), leoCount: leo, priorityBlocked }),
      leoCount: leo,
      minLeo: ECONOMY_MIN_LEO,
      priorityBlocked,
    };
  });
}

export async function startRobberyReservation(client, user, robberyId) {
  const state = await robberyPanelState(client);
  const result = await withEconomy((store) => reserveRobbery(store, robberyId, user.id, {
    leoCount: state.leoCount,
    priorityBlocked: state.priorityBlocked,
  }));
  await postEconomyLog(client, 'Robbery reserved', `<@${user.id}> reserved **${robberyById(robberyId)?.name}**`);
  return result;
}

export async function beginReservedRobbery(client, user) {
  const identity = await identityForDiscord(user.id);
  const server = client?.config?.erlcServerKey
    ? await fetchErlcServer(client.config.erlcServerKey).catch(() => null)
    : null;
  const players = (server?.Players || []).map((entry) => (entry?.username != null ? entry : parseErlcPlayer(entry)));
  const live = players.find((player) => String(player.robloxId) === String(identity?.robloxId || ''))
    || players.find((player) => String(player.username || '').toLowerCase() === String(identity?.robloxUsername || '').toLowerCase());
  if (!live) throw new Error('You must be in the Roblox server to begin the robbery.');
  const session = await withEconomy((store) => beginRobbery(store, user.id, live.location || null));
  const robbery = robberyById(session.kind);
  if (client.config?.erlcServerKey && robbery) {
    const seconds = Math.max(60, Math.ceil((robbery.survivalMs || 0) / 1000));
    await executeErlcCommand(client.config.erlcServerKey, `:prty ${seconds}`).catch((error) => {
      logger.warn(`Economy robbery :prty failed: ${error?.message || error}`);
    });
  }
  await postEconomyLog(client, 'Robbery started', `<@${user.id}> started **${robbery?.name}**`);
  return session;
}

export async function cancelRobbery(client, reason, adminId = '') {
  const session = await withEconomy((store) => failRobbery(store, reason || 'cancelled'));
  await postEconomyLog(client, 'Robbery cancelled', `${reason || 'cancelled'}${adminId ? ` by <@${adminId}>` : ''}`);
  return session;
}

export async function jobViewFor(discordId, players = []) {
  const identity = await identityForDiscord(discordId);
  const live = players.find((player) => String(player.robloxId) === String(identity?.robloxId || ''))
    || players.find((player) => String(player.username || '').toLowerCase() === String(identity?.robloxUsername || '').toLowerCase());
  return withEconomy((store) => {
    grantStarter(store, discordId, { robloxId: identity?.robloxId || live?.robloxId });
    const session = store.jobs[discordId];
    const team = live?.team || session?.team || 'Off duty';
    const civilian = isCivilianTeam(team);
    const started = session?.startedAt || 0;
    const elapsed = started ? Date.now() - started : 0;
    const nextIn = civilian && started
      ? Math.max(0, ECONOMY_PAY_INTERVAL_MS - (elapsed % ECONOMY_PAY_INTERVAL_MS))
      : ECONOMY_PAY_INTERVAL_MS;
    return {
      team,
      civilian,
      rate: ECONOMY_JOB_PAY,
      elapsed,
      nextIn,
      sessionEarned: session?.sessionEarned || 0,
      inGame: Boolean(live),
    };
  });
}

export async function economyBlocksNewPriority(client) {
  return withEconomy((store) => economyBlocksPriority(store));
}

function rosterPlayers(snapshot) {
  return (snapshot?.Players || snapshot?.players || []).map((entry) => {
    const mapped = parseErlcPlayer(entry);
    if (entry?.username == null) return mapped;
    return {
      ...mapped,
      username: entry.username || mapped.username,
      robloxId: entry.robloxId || mapped.robloxId,
      team: entry.team || mapped.team,
      location: entry.location || mapped.location,
    };
  });
}

export function sanitizeGamePm(message) {
  return String(message || '')
    .replace(/\$/g, '')
    .replace(/<@!?(\d+)>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export async function pmEconomyPlayer(client, username, message) {
  const key = client?.config?.erlcServerKey;
  const who = String(username || '').trim().split(/\s+/)[0];
  const body = sanitizeGamePm(message);
  if (!key || !who || !body) {
    logger.warn(`Economy in-game PM skipped (user=${who || 'none'}): ${body}`);
    return false;
  }
  try {
    await executeErlcCommand(key, `:pm ${who} ${body}`);
    return true;
  } catch (error) {
    logger.warn(`Economy in-game PM failed for ${who}: ${error?.message || error}`);
    return false;
  }
}

export async function dmEconomyUser(client, discordId, { title, description } = {}) {
  const id = String(discordId || '').trim();
  if (!id) return false;
  const content = [
    title ? `**${title}**` : '**Clearwater Economy**',
    String(description || '').trim(),
  ].filter(Boolean).join('\n').slice(0, 1900);
  const payload = { content, allowedMentions: { parse: [] } };

  const trySend = async (target, label) => {
    if (!target) return false;
    try {
      if (typeof target.createDM === 'function') {
        const dm = await target.createDM();
        if (typeof dm?.send === 'function') {
          await dm.send(payload);
          return true;
        }
      }
      if (typeof target.send === 'function') {
        await target.send(payload);
        return true;
      }
    } catch (error) {
      logger.warn(`Economy Discord DM via ${label} failed for ${id}: ${error?.message || error}`);
    }
    return false;
  };

  try {
    const guild = client?.guilds?.cache?.get(CLEARWATER_GUILD_ID)
      || (typeof client?.guilds?.fetch === 'function'
        ? await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null)
        : null);
    if (guild?.members?.fetch) {
      const member = await guild.members.fetch(id).catch(() => null);
      if (await trySend(member, 'member')) return true;
    }
    const user = typeof client?.users?.fetch === 'function'
      ? await client.users.fetch(id)
      : null;
    if (await trySend(user, 'user')) return true;
  } catch (error) {
    logger.warn(`Economy Discord DM failed for ${id}: ${error?.message || error}`);
  }
  return false;
}

async function notifyStealPlayers({
  client,
  thiefName,
  victimName,
  thiefDiscord,
  victimDiscord,
  thiefGame,
  victimGame,
  thiefDm,
  victimDm,
}) {
  if (thiefDiscord && thiefDm) await dmEconomyUser(client, thiefDiscord, thiefDm);
  if (victimDiscord && victimDm) await dmEconomyUser(client, victimDiscord, victimDm);
  await pmEconomyPlayer(client, thiefName, thiefGame);
  if (victimGame && victimName) await pmEconomyPlayer(client, victimName, victimGame);
}

export async function handleStealCommand({ player, snapshot, client }) {
  const players = rosterPlayers(snapshot);
  const thiefLive = players.find((entry) => String(entry.robloxId) === String(player?.robloxId || ''))
    || players.find((entry) => String(entry.username || '').toLowerCase() === String(player?.username || '').toLowerCase());
  const thiefName = thiefLive?.username || player?.username || '';
  if (!thiefLive) {
    const message = 'You must be in the Roblox server to use ;steal.';
    await pmEconomyPlayer(client, thiefName, message);
    return { success: false, reason: 'not-in-game', message };
  }
  if (!isCivilianTeam(thiefLive.team)) {
    const message = 'You must be on Civilian to use ;steal.';
    await pmEconomyPlayer(client, thiefLive.username, message);
    return { success: false, reason: 'not-civilian', message };
  }
  let closest = null;
  let closestDist = Infinity;
  for (const other of players) {
    if (other === thiefLive) continue;
    if (String(other.robloxId) && String(other.robloxId) === String(thiefLive.robloxId)) continue;
    if (!isCivilianTeam(other.team)) continue;
    const dist = playerStudDistance(thiefLive, other);
    if (dist == null || dist > ECONOMY_STEAL_DISTANCE) continue;
    if (dist < closestDist) {
      closest = other;
      closestDist = dist;
    }
  }
  if (!closest) {
    const message = 'No civilian is within 10 studs.';
    await pmEconomyPlayer(client, thiefLive.username, message);
    return { success: false, reason: 'no-target', message };
  }
  const thiefDiscord = await discordForRoblox(thiefLive.robloxId) || (await identityMatch(thiefLive.username));
  const victimDiscord = await discordForRoblox(closest.robloxId) || (await identityMatch(closest.username));
  if (!thiefDiscord) {
    const message = 'Your Roblox account is not linked to Discord.';
    await pmEconomyPlayer(client, thiefLive.username, message);
    return { success: false, reason: 'unlinked', message };
  }
  if (!victimDiscord) {
    const message = 'That player is not linked to Discord.';
    await pmEconomyPlayer(client, thiefLive.username, message);
    return { success: false, reason: 'victim-unlinked', message };
  }
  let result;
  try {
    result = await withEconomy((store) => trySteal(store, thiefDiscord, victimDiscord, {
      distance: closestDist,
      thiefTeam: thiefLive.team,
      victimTeam: closest.team,
    }));
  } catch (error) {
    const message = String(error?.message || 'Your steal attempt failed.');
    await pmEconomyPlayer(client, thiefLive.username, message);
    return { success: false, reason: 'rejected', message };
  }
  if (result.success) {
    const amount = formatMoney(result.amount);
    await notifyStealPlayers({
      client,
      thiefName: thiefLive.username,
      victimName: closest.username,
      thiefDiscord,
      victimDiscord,
      thiefGame: `You successfully stole ${amount} from ${closest.username}.`,
      victimGame: `${thiefLive.username} stole ${amount} from you.`,
      thiefDm: {
        title: 'Steal successful',
        description: `You stole **${amount}** cash from **${closest.username}**.\nTransaction \`${result.referenceId}\``,
      },
      victimDm: {
        title: 'You were stolen from',
        description: `**${thiefLive.username}** stole **${amount}** cash from you.\nTransaction \`${result.referenceId}\``,
      },
    });
    await postEconomyLog(client, 'Steal success', `<@${thiefDiscord}> stole ${amount} from <@${victimDiscord}> · \`${result.referenceId}\``);
  } else {
    await notifyStealPlayers({
      client,
      thiefName: thiefLive.username,
      victimName: closest.username,
      thiefDiscord,
      victimDiscord,
      thiefGame: 'Your steal attempt failed.',
      victimGame: `${thiefLive.username} tried to steal from you but failed.`,
      thiefDm: {
        title: 'Steal failed',
        description: `Your steal attempt against **${closest.username}** failed. No cash was taken.`,
      },
      victimDm: {
        title: 'Steal attempt failed',
        description: `**${thiefLive.username}** tried to steal from you and failed. Your cash is unchanged.`,
      },
    });
    await postEconomyLog(client, 'Steal failed', `<@${thiefDiscord}> failed to steal from <@${victimDiscord}>`);
  }
  return result;
}

const stealLogSeen = new Set();
let stealLogsPrimed = false;

export async function scanStealCommandLogs(client) {
  if (!client?.config?.erlcServerKey) return { scanned: 0 };
  const server = await fetchErlcServer(client.config.erlcServerKey, { timeoutMs: 4_000 }).catch(() => null);
  const logs = (server?.CommandLogs || server?.commandLogs || []).map((entry) => (
    entry?.command != null || entry?.username != null ? entry : parseErlcCommandLog(entry)
  ));
  if (!stealLogsPrimed) {
    for (const entry of logs) stealLogSeen.add(`${entry.at || 0}:${entry.username || ''}:${entry.command || ''}`);
    stealLogsPrimed = true;
    return { scanned: logs.length, primed: true };
  }
  let handled = 0;
  for (const entry of logs) {
    if (!isStealCommandText(entry.command)) continue;
    const id = `${entry.at || 0}:${entry.username || ''}:${entry.command || ''}`;
    if (stealLogSeen.has(id)) continue;
    stealLogSeen.add(id);
    try {
      await handleStealCommand({
        player: { username: entry.username, robloxId: entry.robloxId },
        snapshot: server,
        client,
      });
      handled += 1;
    } catch (error) {
      logger.info(`Economy ;steal from command logs: ${error?.message || error}`);
    }
  }
  if (stealLogSeen.size > 400) {
    const keep = [...stealLogSeen].slice(-200);
    stealLogSeen.clear();
    for (const id of keep) stealLogSeen.add(id);
  }
  return { scanned: logs.length, handled };
}

export function resetStealLogScannerForTests() {
  stealLogSeen.clear();
  stealLogsPrimed = false;
}

async function identityMatch(username) {
  const cache = await getIdentityCache().catch(() => ({ byDiscord: {} }));
  const lower = String(username || '').toLowerCase();
  const hit = Object.values(cache.byDiscord || {}).find((entry) => String(entry.robloxUsername || '').toLowerCase() === lower);
  return hit?.discordId || '';
}

export async function tickEconomy(client) {
  const server = client?.config?.erlcServerKey
    ? await fetchErlcServer(client.config.erlcServerKey, { timeoutMs: 4_000 }).catch(() => null)
    : null;
  const players = (server?.Players || []).map((entry) => (entry?.username != null ? entry : parseErlcPlayer(entry)));
  const kills = (server?.KillLogs || []).map((entry) => (entry?.robloxId != null ? entry : parseErlcKill(entry)));
  const identities = await discordIdsByRobloxId().catch(() => new Map());

  const weekly = await withEconomy((store) => grantWeeklyDepartmentFunds(store));
  for (const tx of weekly) {
    await postEconomyLog(client, 'Department weekly grant', `${tx.note} ${formatMoney(tx.amount)} · \`${tx.id}\``);
  }

  for (const player of players) {
    const discordId = identities.get(String(player.robloxId || '')) || await identityMatch(player.username);
    if (!discordId) continue;
    await withEconomy((store) => {
      grantStarter(store, discordId, { robloxId: player.robloxId });
      if (isCivilianTeam(player.team)) {
        const paid = payJobInterval(store, discordId, { team: player.team, robloxId: player.robloxId });
        if (paid.paid) {
          void postEconomyLog(client, 'Job paycheck', `<@${discordId}> ${formatMoney(paid.amount)} · \`${paid.tx.id}\``);
        }
      } else if (store.jobs[discordId]) {
        delete store.jobs[discordId];
      }
    });
  }

  for (const kill of kills) {
    const discordId = identities.get(String(kill.robloxId || '')) || await identityMatch(kill.username);
    if (!discordId) continue;
    const fingerprint = `${kill.at}|${kill.robloxId || kill.username}`;
    const charged = await withEconomy((store) => applyDeathFee(store, discordId, fingerprint, { robloxId: kill.robloxId }));
    if (charged.charged) {
      await postEconomyLog(client, 'Death fee', `<@${discordId}> ${formatMoney(-ECONOMY_DEATH_FEE)} · \`${charged.tx.id}\``);
    }
  }

  const robberyEvents = await withEconomy((store) => {
    const events = [];
    const session = store.robbery;
    if (!session || session.status === 'idle') return events;
    const now = Date.now();
    if (session.status === 'reserved' && now >= Number(session.reservedUntil || 0)) {
      failRobbery(store, 'reservation-expired', { now });
      events.push({ type: 'fail', reason: 'reservation-expired' });
      return events;
    }
    if (session.status !== 'active') return events;
    const owner = store.users[session.reservedBy];
    const live = players.find((player) => String(player.robloxId) === String(owner?.robloxId || ''));
    if (!live) {
      failRobbery(store, 'left-server', { now });
      events.push({ type: 'fail', reason: 'left-server', userId: session.reservedBy });
      return events;
    }
    if (/jail|inmate|custody/i.test(String(live.team || ''))) {
      failRobbery(store, 'jailed', { now });
      events.push({ type: 'fail', reason: 'jailed', userId: session.reservedBy });
      return events;
    }
    updateRobberyScene(store, live.location, { now });
    if (store.robbery?.status !== 'active') {
      events.push({ type: 'fail', reason: 'left-scene', userId: session.reservedBy });
      return events;
    }
    const died = kills.some((kill) => String(kill.robloxId) === String(live.robloxId) && Number(kill.at) >= Number(session.startedAt || 0));
    if (died) {
      failRobbery(store, 'died', { now });
      events.push({ type: 'fail', reason: 'died', userId: session.reservedBy });
      return events;
    }
    const payout = completeRobberyIfReady(store, session.reservedBy, { now });
    if (payout.paid) events.push({ type: 'payout', amount: payout.amount, userId: session.reservedBy, tx: payout.tx });
    return events;
  });
  for (const event of robberyEvents) {
    if (event.type === 'fail') {
      await postEconomyLog(client, 'Robbery failed', `${event.reason}${event.userId ? ` · <@${event.userId}>` : ''}`);
    } else if (event.type === 'payout') {
      await postEconomyLog(client, 'Robbery completed', `<@${event.userId}> ${formatMoney(event.amount)} · \`${event.tx?.id}\``);
    }
  }

  const apiKey = client?.config?.melonlyApiKey;
  if (apiKey) {
    for (const dept of ECONOMY_DEPARTMENTS) {
      if (!dept.melonlyDepartmentId) continue;
      const shifts = await fetchPinellasDepartmentShifts(apiKey, dept.melonlyDepartmentId, { cacheTtlMs: 25_000 }).catch(() => []);
      const active = (Array.isArray(shifts) ? shifts : []).filter(isActiveMelonlyShift);
      const seen = new Set();
      for (const shift of active) {
        const memberId = String(shift.memberId || shift.userId || '');
        const discordId = await resolveShiftDiscord(client, memberId);
        if (!discordId) continue;
        const personKey = `${dept.id}:${discordId}`;
        if (seen.has(personKey)) continue;
        seen.add(personKey);
        const started = shiftCreatedMs(shift) || Date.now();
        const elapsed = Date.now() - started;
        const paid = await withEconomy((store) => payDepartmentShift(store, dept.id, discordId, {
          shiftKey: String(shift.id || `${memberId}:${started}`),
          elapsedMs: elapsed,
        }));
        if (paid.reason === 'insufficient') {
          await postEconomyLog(client, 'Insufficient department funds', `${dept.short} cannot pay <@${discordId}> ${formatMoney(paid.needed)} (balance ${formatMoney(paid.balance)})`);
        } else if (paid.paid) {
          await postEconomyLog(client, 'Department payroll', `${dept.short} → <@${discordId}> ${formatMoney(paid.amount)} · \`${paid.referenceId}\``);
        }
      }
    }
  }
}

async function resolveShiftDiscord(client, melonlyMemberId) {
  try {
    const { fetchMelonlyMemberDiscordId } = await import('./melonly.js');
    if (client.config?.melonlyApiKey && melonlyMemberId) {
      return await fetchMelonlyMemberDiscordId(client.config.melonlyApiKey, melonlyMemberId);
    }
  } catch {
    return '';
  }
  return '';
}

export function canManageDepartmentFunds(member, guildId) {
  if (String(member?.guild?.id || guildId) !== String(guildId || member?.guild?.id || '')) return false;
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator) || memberIsStaff(member));
}

export async function departmentSpend(deptId, amount, options) {
  return withEconomy((store) => spendDepartmentFunds(store, deptId, amount, options));
}

export async function adminEconomyAdjust(...args) {
  return withEconomy((store) => adminAdjustUser(store, ...args));
}

export async function adminDepartmentAdjust(deptId, amount, extras) {
  return withEconomy((store) => adminAdjustDepartment(store, deptId, amount, extras));
}

export async function adminFreeze(discordId, frozen, extras) {
  return withEconomy((store) => setFrozen(store, discordId, frozen, extras));
}

export async function adminRefund(txId, extras) {
  return withEconomy((store) => refundTransaction(store, txId, extras));
}

export async function lookupTransaction(txId) {
  return withEconomy((store) => findTransaction(store, txId));
}

export async function getOverview(discordId, client) {
  const wallet = await getWalletView(discordId);
  const server = client?.config?.erlcServerKey
    ? await fetchErlcServer(client.config.erlcServerKey, { timeoutMs: 2_500 }).catch(() => null)
    : null;
  const players = (server?.Players || []).map((entry) => (entry?.username != null ? entry : parseErlcPlayer(entry)));
  const job = await jobViewFor(discordId, players);
  const robbery = await robberyPanelState(client);
  const priority = client?.priorityRequest?.request;
  return {
    wallet,
    job,
    robbery,
    leoOnline: robbery.leoCount,
    priorityStatus: String(priority?.status || 'none'),
  };
}

export async function getAllDepartmentsView() {
  return withEconomy((store) => {
    grantWeeklyDepartmentFunds(store);
    return ECONOMY_DEPARTMENTS.map((dept) => ({
      ...dept,
      row: store.departments[dept.id],
      transactions: recentTransactions(store, { deptId: dept.id, limit: 8 }),
    }));
  });
}

export function startEconomy(client) {
  const tick = setInterval(() => {
    void tickEconomy(client).catch((error) => {
      logger.warn(`Economy tick failed: ${error?.message || error}`);
    });
  }, 20_000);
  tick.unref?.();
  const stealTick = setInterval(() => {
    void scanStealCommandLogs(client).catch((error) => {
      logger.warn(`Economy steal scan failed: ${error?.message || error}`);
    });
  }, 5_000);
  stealTick.unref?.();
  setTimeout(() => {
    const guild = client?.guilds?.cache?.get(CLEARWATER_GUILD_ID);
    if (guild) {
      void grantStartersForGuild(guild, client).then((result) => {
        if (result.granted) logger.info(`Economy starter grants: ${result.granted}`);
      }).catch((error) => logger.warn(`Economy starter sweep failed: ${error?.message || error}`));
    }
  }, 8_000);
  void tickEconomy(client).catch((error) => {
    logger.warn(`Economy first tick failed: ${error?.message || error}`);
  });
  void scanStealCommandLogs(client).catch((error) => {
    logger.warn(`Economy steal scan failed: ${error?.message || error}`);
  });
  return () => {
    clearInterval(tick);
    clearInterval(stealTick);
  };
}

export { departmentByGuildId, formatMoney, ensureEconomyUser, recentTransactions, findTransaction };
